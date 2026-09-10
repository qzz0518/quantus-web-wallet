import { describe, expect, test } from "bun:test";
import {
  breakEvenRentPerDay,
  breakEvenRentPerHour,
  deriveNetwork,
  estimate,
  estimateDevice,
  luckDeviation,
  mulPlanck,
  planckToQtc,
  scaleNetwork,
  type Assumptions,
  type Costs,
  type Device,
  type Network,
} from "../src/lib/mining/math";
import { formatCompact, formatFiat, formatHashrate, formatPercent, formatQtc } from "../src/lib/mining/format";

// Network state captured on 2026-09-10: difficulty 2.489e14, 12.28 s blocks, 0.31 QTC.
const NETWORK: Network = {
  difficulty: 248_898_629_370_016n,
  blockTimeSeconds: 12.28,
  blockRewardPlanck: 310_000_000_000n,
};
const RTX4090: Device = { id: "rtx-4090", label: "RTX 4090", hashrate: 1_123_400_000, quantity: 1, powerW: 380, minerFeePercent: 5 };
const ASSUMED: Assumptions = { uptime: 1, poolFeePercent: 1, price: 0.5 };
const ELECTRICITY: Costs = { mode: "electricity", pricePerKwh: 0.1, hardwareCost: 0, amortiseDays: 0 };

describe("network derivation", () => {
  test("infers hashrate and blocks per day from difficulty and block time", () => {
    const derived = deriveNetwork(NETWORK);
    expect(derived.hashrate).toBeCloseTo(2.0269e13, -9);
    expect(derived.blocksPerDay).toBeCloseTo(7035.8, 0);
  });
  test("treats a zero block time or difficulty as an empty network", () => {
    expect(deriveNetwork({ ...NETWORK, blockTimeSeconds: 0 }).hashrate).toBe(0);
    expect(deriveNetwork({ ...NETWORK, blockTimeSeconds: NaN }).blocksPerDay).toBe(0);
    expect(deriveNetwork({ ...NETWORK, difficulty: -5n }).difficulty).toBe(0n);
  });
  test("scaling the network multiplies difficulty at the same block time", () => {
    const doubled = deriveNetwork(scaleNetwork(NETWORK, 2));
    expect(doubled.hashrate).toBeCloseTo(deriveNetwork(NETWORK).hashrate * 2, -6);
    expect(doubled.blocksPerDay).toBe(deriveNetwork(NETWORK).blocksPerDay);
  });
});

describe("planck helpers", () => {
  test("multiplies planck by a float without going through Number", () => {
    expect(mulPlanck(310_000_000_000n, 0.5)).toBe(155_000_000_000n);
    expect(mulPlanck(310_000_000_000n, 3.5e-10)).toBe(108n);
    expect(mulPlanck(310_000_000_000n, 0)).toBe(0n);
    expect(mulPlanck(310_000_000_000n, NaN)).toBe(0n);
    expect(mulPlanck(-1n, 2)).toBe(0n);
  });
  test("converts to QTC", () => {
    expect(planckToQtc(1_500_000_000_000n)).toBe(1.5);
  });
});

describe("single device", () => {
  const row = estimateDevice(deriveNetwork(NETWORK), RTX4090, ASSUMED, ELECTRICITY);
  test("worked example: RTX 4090 on the pool miner", () => {
    // share = 1.1234e9 / 2.0269e13 = 5.542e-5; × 7035.8 blocks × 0.31 QTC × 0.99 × 0.95 = 0.1137 QTC/day
    expect(row.share).toBeCloseTo(5.5426e-5, 8);
    expect(row.qtcPerDay).toBeCloseTo(0.1137, 3);
    expect(row.soloBlocksPerDay).toBeCloseTo(0.39, 2);
    expect(row.kwhPerDay).toBeCloseTo(9.12, 6);
    expect(row.electricityPerDay).toBeCloseTo(0.912, 6);
    expect(row.revenuePerDay).toBeCloseTo(0.0568, 3);
    expect(row.profitPerDay).toBeCloseTo(-0.855, 2);
    expect(row.breakEvenPrice).toBeCloseTo(8.02, 1);
    expect(row.electricityPerQtc).toBe(row.breakEvenPrice);
    expect(row.qtcPerKwh).toBeCloseTo(0.01247, 4);
    expect(row.margin).toBeCloseTo(-15.05, 1);
    expect(row.paybackDays).toBeNull();
  });
  test("uptime scales both output and electricity", () => {
    const half = estimateDevice(deriveNetwork(NETWORK), RTX4090, { ...ASSUMED, uptime: 0.5 }, ELECTRICITY);
    expect(half.qtcPerDay).toBeCloseTo(row.qtcPerDay / 2, 6);
    expect(half.kwhPerDay).toBeCloseTo(row.kwhPerDay! / 2, 6);
    expect(half.breakEvenPrice).toBeCloseTo(row.breakEvenPrice!, 6);
  });
  test("quantity multiplies hashrate and power", () => {
    const three = estimateDevice(deriveNetwork(NETWORK), { ...RTX4090, quantity: 3 }, ASSUMED, ELECTRICITY);
    expect(three.hashrate).toBe(RTX4090.hashrate * 3);
    expect(three.qtcPerDay).toBeCloseTo(row.qtcPerDay * 3, 6);
    expect(three.kwhPerDay).toBeCloseTo(row.kwhPerDay! * 3, 6);
    expect(estimateDevice(deriveNetwork(NETWORK), { ...RTX4090, quantity: 2.9 }, ASSUMED, ELECTRICITY).hashrate).toBe(RTX4090.hashrate * 2);
  });
  test("fees compound: the official miner has no dev fee", () => {
    const stock = estimateDevice(deriveNetwork(NETWORK), { ...RTX4090, minerFeePercent: 0 }, ASSUMED, ELECTRICITY);
    expect(stock.qtcPerDay).toBeCloseTo(row.qtcPerDay / 0.95, 6);
    const noFees = estimateDevice(deriveNetwork(NETWORK), { ...RTX4090, minerFeePercent: 0 }, { ...ASSUMED, poolFeePercent: 0 }, ELECTRICITY);
    expect(noFees.qtcPerDay).toBeCloseTo(row.qtcPerDay / 0.95 / 0.99, 6);
  });
  test("unknown power leaves every cost figure null but keeps the yield", () => {
    const unknown = estimateDevice(deriveNetwork(NETWORK), { ...RTX4090, powerW: null }, ASSUMED, ELECTRICITY);
    expect(unknown.qtcPerDay).toBeCloseTo(row.qtcPerDay, 9);
    expect(unknown.kwhPerDay).toBeNull();
    expect(unknown.electricityPerDay).toBeNull();
    expect(unknown.costPerDay).toBeNull();
    expect(unknown.profitPerDay).toBeNull();
    expect(unknown.breakEvenPrice).toBeNull();
    expect(unknown.qtcPerKwh).toBeNull();
  });
  test("hardware cost adds amortisation and a payback time", () => {
    const costs: Costs = { mode: "electricity", pricePerKwh: 0.1, hardwareCost: 1800, amortiseDays: 360 };
    const rich = estimateDevice(deriveNetwork(NETWORK), RTX4090, { ...ASSUMED, price: 20 }, costs);
    expect(rich.hardwarePerDay).toBe(5);
    expect(rich.costPerDay).toBeCloseTo(0.912 + 5, 6);
    expect(rich.breakEvenPrice).toBeCloseTo(8.02, 1);
    expect(rich.breakEvenPriceWithHardware).toBeCloseTo((0.912 + 5) / rich.qtcPerDay, 6);
    expect(rich.paybackDays).toBeCloseTo(1800 / (rich.revenuePerDay - 0.912), 6);
    const poor = estimateDevice(deriveNetwork(NETWORK), RTX4090, ASSUMED, costs);
    expect(poor.paybackDays).toBe(Infinity);
    const free = estimateDevice(deriveNetwork(NETWORK), RTX4090, ASSUMED, { ...costs, amortiseDays: 0 });
    expect(free.hardwarePerDay).toBe(0);
  });
  test("rental replaces electricity", () => {
    const rented = estimateDevice(deriveNetwork(NETWORK), RTX4090, ASSUMED, { mode: "rental", rentPerDay: 2.4 });
    expect(rented.electricityPerDay).toBe(0);
    expect(rented.rentPerDay).toBe(2.4);
    expect(rented.runningCostPerDay).toBe(2.4);
    expect(rented.breakEvenPrice).toBeCloseTo(2.4 / rented.qtcPerDay, 6);
    expect(rented.paybackDays).toBeNull();
  });
  test("zero price gives zero revenue and a null margin, never NaN", () => {
    const unpriced = estimateDevice(deriveNetwork(NETWORK), RTX4090, { ...ASSUMED, price: 0 }, ELECTRICITY);
    expect(unpriced.revenuePerDay).toBe(0);
    expect(unpriced.margin).toBeNull();
    expect(unpriced.profitPerDay).toBeCloseTo(-0.912, 6);
    expect(unpriced.breakEvenPrice).toBeCloseTo(8.02, 1);
  });
  test("an empty network yields nothing and no Infinity", () => {
    const dead = estimateDevice(deriveNetwork({ ...NETWORK, blockTimeSeconds: 0 }), RTX4090, ASSUMED, ELECTRICITY);
    expect(dead.share).toBe(0);
    expect(dead.planckPerDay).toBe(0n);
    expect(dead.breakEvenPrice).toBeNull();
    expect(dead.qtcPerKwh).toBe(0);
    const nothing = estimateDevice(deriveNetwork(NETWORK), { ...RTX4090, hashrate: NaN }, ASSUMED, ELECTRICITY);
    expect(nothing.qtcPerDay).toBe(0);
    expect(nothing.costPerQtc).toBeNull();
  });
  test("out-of-range fees and uptime are clamped", () => {
    const wild = estimateDevice(deriveNetwork(NETWORK), { ...RTX4090, minerFeePercent: 150 }, { ...ASSUMED, uptime: 7, poolFeePercent: -3 }, ELECTRICITY);
    expect(wild.qtcPerDay).toBe(0);
    expect(wild.kwhPerDay).toBeCloseTo(9.12, 6);
  });
});

describe("whole setup", () => {
  const RTX5090: Device = { id: "rtx-5090", label: "RTX 5090", hashrate: 1_491_900_000, quantity: 2, powerW: 500, minerFeePercent: 5 };
  test("totals add up and shared costs are split by hashrate", () => {
    const result = estimate(NETWORK, [RTX4090, RTX5090], { ...ASSUMED, price: 10 }, { mode: "rental", rentPerDay: 12 });
    expect(result.devices).toHaveLength(2);
    expect(result.total.hashrate).toBe(1_123_400_000 + 2 * 1_491_900_000);
    expect(result.total.planckPerDay).toBe(result.devices[0].planckPerDay + result.devices[1].planckPerDay);
    expect(result.devices[0].rentPerDay + result.devices[1].rentPerDay).toBeCloseTo(12, 9);
    expect(result.devices[1].rentPerDay / 12).toBeCloseTo((2 * 1_491_900_000) / result.total.hashrate, 9);
    expect(result.total.runningCostPerDay).toBe(12);
    expect(result.total.profitPerDay).toBeCloseTo(result.total.revenuePerDay - 12, 9);
  });
  test("hardware cost is split the same way and paid back from cash flow", () => {
    const costs: Costs = { mode: "electricity", pricePerKwh: 0.1, hardwareCost: 5000, amortiseDays: 500 };
    const result = estimate(NETWORK, [RTX4090, RTX5090], { ...ASSUMED, price: 30 }, costs);
    expect(result.total.hardwarePerDay).toBe(10);
    expect(result.devices[0].hardwarePerDay + result.devices[1].hardwarePerDay).toBeCloseTo(10, 9);
    expect(result.total.kwhPerDay).toBeCloseTo(9.12 + 24, 6);
    expect(result.total.paybackDays).toBeCloseTo(5000 / (result.total.revenuePerDay - result.total.electricityPerDay!), 6);
  });
  test("one device without power makes the totals' cost unknown", () => {
    const result = estimate(NETWORK, [RTX4090, { ...RTX5090, powerW: null }], ASSUMED, ELECTRICITY);
    expect(result.total.kwhPerDay).toBeNull();
    expect(result.total.breakEvenPrice).toBeNull();
    expect(result.devices[0].breakEvenPrice).not.toBeNull();
  });
  test("no devices is a valid, empty estimate", () => {
    const result = estimate(NETWORK, [], ASSUMED, ELECTRICITY);
    expect(result.total.qtcPerDay).toBe(0);
    expect(result.total.share).toBe(0);
    expect(result.total.costPerQtc).toBeNull();
  });
});

describe("break-even rent", () => {
  const derived = deriveNetwork(NETWORK);
  test("is the output's value minus the costs the rent does not cover", () => {
    // 0.1137 QTC/day × 20 = 2.2748 revenue, less 0.912 of electricity.
    const row = estimateDevice(derived, RTX4090, { ...ASSUMED, price: 20 }, ELECTRICITY);
    expect(row.breakEvenRentPerDay).toBeCloseTo(row.qtcPerDay * 20 - 0.912, 9);
    expect(row.breakEvenRentPerDay).toBeCloseTo(1.363, 2);
    expect(row.breakEvenRentPerHour).toBeCloseTo(row.breakEvenRentPerDay! / 24, 12);
  });
  test("renting a whole rig already includes the power, so the whole revenue can pay for it", () => {
    const rented = estimateDevice(derived, RTX4090, { ...ASSUMED, price: 20 }, { mode: "rental", rentPerDay: 2.4 });
    expect(rented.breakEvenRentPerDay).toBeCloseTo(rented.revenuePerDay, 12);
    // The rent actually being paid does not change what the rig could afford.
    const cheaper = estimateDevice(derived, RTX4090, { ...ASSUMED, price: 20 }, { mode: "rental", rentPerDay: 0.1 });
    expect(cheaper.breakEvenRentPerDay).toBeCloseTo(rented.breakEvenRentPerDay!, 12);
  });
  test("goes negative when electricity alone costs more than the output is worth", () => {
    const row = estimateDevice(derived, RTX4090, ASSUMED, ELECTRICITY);
    expect(row.breakEvenRentPerDay).toBeLessThan(0);
    expect(row.breakEvenRentPerDay).toBeCloseTo(row.qtcPerDay * 0.5 - 0.912, 9);
  });
  test("without a price there is nothing to value the output with", () => {
    const unpriced = estimateDevice(derived, RTX4090, { ...ASSUMED, price: 0 }, ELECTRICITY);
    expect(unpriced.breakEvenRentPerDay).toBeNull();
    expect(unpriced.breakEvenRentPerHour).toBeNull();
    const rented = estimateDevice(derived, RTX4090, { ...ASSUMED, price: 0 }, { mode: "rental", rentPerDay: 2.4 });
    expect(rented.breakEvenRentPerDay).toBeNull();
  });
  test("an unknown power draw only blocks the own-hardware case", () => {
    const noPower = { ...RTX4090, powerW: null };
    expect(estimateDevice(derived, noPower, { ...ASSUMED, price: 20 }, ELECTRICITY).breakEvenRentPerDay).toBeNull();
    const rented = estimateDevice(derived, noPower, { ...ASSUMED, price: 20 }, { mode: "rental", rentPerDay: 2.4 });
    expect(rented.breakEvenRentPerDay).toBeCloseTo(rented.revenuePerDay, 12);
  });
  test("hardware amortisation is not deducted: you would not pay for both", () => {
    const costs: Costs = { mode: "electricity", pricePerKwh: 0.1, hardwareCost: 1800, amortiseDays: 360 };
    const owned = estimateDevice(derived, RTX4090, { ...ASSUMED, price: 20 }, costs);
    const rentedOut = estimateDevice(derived, RTX4090, { ...ASSUMED, price: 20 }, ELECTRICITY);
    expect(owned.breakEvenRentPerDay).toBeCloseTo(rentedOut.breakEvenRentPerDay!, 12);
  });
  test("the rig's budget is the sum of its rows", () => {
    const RTX5090: Device = { id: "rtx-5090", label: "RTX 5090", hashrate: 1_491_900_000, quantity: 2, powerW: 500, minerFeePercent: 5 };
    const result = estimate(NETWORK, [RTX4090, RTX5090], { ...ASSUMED, price: 20 }, ELECTRICITY);
    const rows = result.devices.reduce((sum, row) => sum + row.breakEvenRentPerDay!, 0);
    expect(result.total.breakEvenRentPerDay).toBeCloseTo(rows, 9);
    expect(result.total.breakEvenRentPerHour).toBeCloseTo(result.total.breakEvenRentPerDay! / 24, 12);
  });
  test("the bare functions answer without an estimate and never return NaN", () => {
    expect(breakEvenRentPerDay(2, 3, 1)).toBe(5);
    expect(breakEvenRentPerDay(2, 3, 0)).toBe(6);
    expect(breakEvenRentPerDay(2, 3, 10)).toBe(-4);
    expect(breakEvenRentPerDay(2, 0, 1)).toBeNull();
    expect(breakEvenRentPerDay(2, -1, 1)).toBeNull();
    expect(breakEvenRentPerDay(2, NaN, 1)).toBeNull();
    expect(breakEvenRentPerDay(2, 3, null)).toBeNull();
    expect(breakEvenRentPerDay(NaN, 3, 1)).toBe(-1);
    expect(breakEvenRentPerHour(24)).toBe(1);
    expect(breakEvenRentPerHour(null)).toBeNull();
  });
});

describe("luck", () => {
  test("relative deviation shrinks with the square root of expected blocks", () => {
    expect(luckDeviation(100)).toBeCloseTo(0.1, 9);
    expect(luckDeviation(6400)).toBeCloseTo(0.0125, 9);
    expect(luckDeviation(0)).toBeNull();
    expect(luckDeviation(-1)).toBeNull();
  });
});

describe("formatting", () => {
  test("hashrate picks the unit", () => {
    expect(formatHashrate(1_123_400_000)).toBe("1.12 GH/s");
    expect(formatHashrate(2.0269e13)).toBe("20.27 TH/s");
    expect(formatHashrate(75_000_000)).toBe("75 MH/s");
    expect(formatHashrate(0)).toBe("0 H/s");
    expect(formatHashrate(NaN)).toBe("0 H/s");
  });
  test("compact difficulty", () => {
    expect(formatCompact(248_898_629_370_016n)).toBe("248.899 T");
    expect(formatCompact(0)).toBe("0");
  });
  test("QTC and fiat keep sensible digits", () => {
    expect(formatQtc(0.11374)).toBe("0.1137");
    expect(formatQtc(0.00012345)).toBe("0.000123");
    expect(formatQtc(1234.5)).toBe("1,235");
    expect(formatQtc(NaN)).toBe("—");
    expect(formatFiat(8.0234, "USD")).toBe("8.02 USD");
    expect(formatFiat(0.00456, "")).toBe("0.00456");
    expect(formatFiat(12345.6, "CNY")).toBe("12,346 CNY");
    expect(formatPercent(0.05542e-3)).toBe("0.0055%");
    expect(formatPercent(-15.05)).toBe("-1,505%");
  });
});
