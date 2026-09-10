/**
 * Mining arithmetic, free of I/O. QTC amounts are bigint planck; fiat, power
 * and ratios are plain numbers. Every function tolerates zero and NaN inputs
 * and answers with 0 or null instead of Infinity, so the UI never has to
 * guard on its own.
 */
export const PLANCK = 1_000_000_000_000n;
export const SECONDS_PER_DAY = 86_400;
export const DAYS_PER_MONTH = 30;

export type Network = {
  difficulty: bigint;
  blockTimeSeconds: number;
  blockRewardPlanck: bigint;
};

export type Device = {
  id: string;
  label: string;
  /** H/s of one unit. */
  hashrate: number;
  quantity: number;
  /** Watts of one unit under load; null when unknown. */
  powerW: number | null;
  /** Built-in fee of the miner software, in percent of found work. */
  minerFeePercent: number;
};

export type Assumptions = {
  /** Fraction of the time the rig is actually hashing, 0..1. */
  uptime: number;
  poolFeePercent: number;
  /** Fiat per QTC as assumed by the user; 0 when unknown. */
  price: number;
};

export type Costs =
  | {
      mode: "electricity";
      pricePerKwh: number;
      /** Total purchase price of the whole setup; 0 when not amortised. */
      hardwareCost: number;
      amortiseDays: number;
    }
  | {
      mode: "rental";
      /** Rent for all devices per day, electricity included. */
      rentPerDay: number;
    };

export type Yield = {
  hashrate: number;
  /** Fraction of the network hashrate, 0..1. */
  share: number;
  planckPerDay: bigint;
  qtcPerDay: number;
  /** Expected blocks per day if mining solo with this hashrate. */
  soloBlocksPerDay: number;
  kwhPerDay: number | null;
  electricityPerDay: number | null;
  rentPerDay: number;
  hardwarePerDay: number;
  /** Electricity plus rent: what has to be paid every day. Null when power is unknown. */
  runningCostPerDay: number | null;
  /** Running cost plus hardware amortisation. */
  costPerDay: number | null;
  revenuePerDay: number;
  profitPerDay: number | null;
  /** Profit per day after hardware amortisation divided by revenue; null without revenue. */
  margin: number | null;
  /** Fiat per QTC at which running costs are covered. */
  breakEvenPrice: number | null;
  /** Fiat per QTC at which running costs and amortisation are covered. */
  breakEvenPriceWithHardware: number | null;
  /** Highest rent per day that still breaks even; null without a price, or without a power figure when the rent excludes electricity. */
  breakEvenRentPerDay: number | null;
  /** The same budget stated per hour. */
  breakEvenRentPerHour: number | null;
  electricityPerQtc: number | null;
  costPerQtc: number | null;
  qtcPerKwh: number | null;
  /** Days until the allocated hardware cost is earned back at the current price; Infinity when it never is. */
  paybackDays: number | null;
};

export type DeviceYield = Yield & { device: Device };

export type Estimate = {
  network: DerivedNetwork;
  devices: DeviceYield[];
  total: Yield;
};

export type DerivedNetwork = Network & {
  /** H/s inferred from difficulty and measured block time. */
  hashrate: number;
  blocksPerDay: number;
};

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, finite(value)));
const positive = (value: number) => Math.max(0, finite(value));

const SCALE = 1e15;
/** Multiply planck by a non-negative float with 15 decimal digits of resolution. */
export function mulPlanck(planck: bigint, factor: number): bigint {
  if (planck <= 0n || !Number.isFinite(factor) || factor <= 0) return 0n;
  return (planck * BigInt(Math.round(factor * SCALE))) / BigInt(SCALE);
}

export function planckToQtc(planck: bigint): number {
  return Number(planck) / Number(PLANCK);
}

export function deriveNetwork(network: Network): DerivedNetwork {
  const blockTimeSeconds = positive(network.blockTimeSeconds);
  const difficulty = network.difficulty > 0n ? network.difficulty : 0n;
  const hashrate = blockTimeSeconds > 0 ? Number(difficulty) / blockTimeSeconds : 0;
  const blocksPerDay = blockTimeSeconds > 0 ? SECONDS_PER_DAY / blockTimeSeconds : 0;
  return {
    difficulty,
    blockTimeSeconds,
    blockRewardPlanck: network.blockRewardPlanck > 0n ? network.blockRewardPlanck : 0n,
    hashrate,
    blocksPerDay,
  };
}

/** The same network with `factor` times the hashrate, i.e. difficulty scaled at the same block time. */
export function scaleNetwork(network: Network, factor: number): Network {
  return { ...network, difficulty: mulPlanck(network.difficulty, factor) };
}

function fees(device: Device, assumptions: Assumptions): number {
  const pool = clamp(assumptions.poolFeePercent, 0, 100) / 100;
  const miner = clamp(device.minerFeePercent, 0, 100) / 100;
  return (1 - pool) * (1 - miner);
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || !(denominator > 0)) return null;
  return numerator / denominator;
}

/**
 * The most rent a setup can pay per day and still break even: what its
 * output is worth, minus the running costs the rent does not already cover.
 * Renting a whole rig includes the electricity, so the entire revenue is
 * available for rent; on own hardware the electricity bill comes off first.
 * Null when there is no price to value the output with, or when the power
 * draw is unknown and the electricity therefore is — the caller shows an em
 * dash rather than a number that pretends to know. The result is negative
 * when electricity alone already costs more than the output is worth: that
 * rig cannot pay any rent at all.
 */
export function breakEvenRentPerDay(qtcPerDay: number, price: number, electricityPerDay: number | null): number | null {
  if (!(positive(price) > 0) || electricityPerDay === null) return null;
  return positive(qtcPerDay) * positive(price) - electricityPerDay;
}

/** The same budget stated per hour, so it can be compared with hourly rig rates. */
export function breakEvenRentPerHour(perDay: number | null): number | null {
  return perDay === null ? null : perDay / 24;
}

/**
 * Expected yield of one row. `allocation` is this row's share of costs that
 * are given for the whole setup (rent, hardware); the caller passes the row's
 * fraction of the total hashrate.
 */
export function estimateDevice(
  network: DerivedNetwork,
  device: Device,
  assumptions: Assumptions,
  costs: Costs,
  allocation = 1,
): DeviceYield {
  const quantity = Math.max(0, Math.floor(finite(device.quantity)));
  const hashrate = positive(device.hashrate) * quantity;
  const uptime = clamp(assumptions.uptime, 0, 1);
  const share = network.hashrate > 0 ? hashrate / network.hashrate : 0;
  const soloBlocksPerDay = share * network.blocksPerDay * uptime;
  const planckPerDay = mulPlanck(network.blockRewardPlanck, soloBlocksPerDay * fees(device, assumptions));
  const qtcPerDay = planckToQtc(planckPerDay);
  const price = positive(assumptions.price);
  const alloc = clamp(allocation, 0, 1);

  const kwhPerDay = device.powerW === null ? null : (positive(device.powerW) * quantity * 24 * uptime) / 1000;
  const electricityPerDay =
    costs.mode === "electricity" ? (kwhPerDay === null ? null : kwhPerDay * positive(costs.pricePerKwh)) : 0;
  const rentPerDay = costs.mode === "rental" ? positive(costs.rentPerDay) * alloc : 0;
  const hardwareShare = costs.mode === "electricity" ? positive(costs.hardwareCost) * alloc : 0;
  const hardwarePerDay =
    costs.mode === "electricity" && costs.amortiseDays > 0 ? hardwareShare / costs.amortiseDays : 0;
  const runningCostPerDay = electricityPerDay === null ? null : electricityPerDay + rentPerDay;
  const costPerDay = runningCostPerDay === null ? null : runningCostPerDay + hardwarePerDay;
  const revenuePerDay = qtcPerDay * price;
  const profitPerDay = costPerDay === null ? null : revenuePerDay - costPerDay;
  const cashFlow = runningCostPerDay === null ? null : revenuePerDay - runningCostPerDay;
  const rentBudget = breakEvenRentPerDay(qtcPerDay, price, electricityPerDay);

  return {
    device,
    hashrate,
    share,
    planckPerDay,
    qtcPerDay,
    soloBlocksPerDay,
    kwhPerDay,
    electricityPerDay,
    rentPerDay,
    hardwarePerDay,
    runningCostPerDay,
    costPerDay,
    revenuePerDay,
    profitPerDay,
    margin: ratio(profitPerDay, revenuePerDay),
    breakEvenPrice: ratio(runningCostPerDay, qtcPerDay),
    breakEvenPriceWithHardware: ratio(costPerDay, qtcPerDay),
    breakEvenRentPerDay: rentBudget,
    breakEvenRentPerHour: breakEvenRentPerHour(rentBudget),
    electricityPerQtc: ratio(electricityPerDay, qtcPerDay),
    costPerQtc: ratio(costPerDay, qtcPerDay),
    qtcPerKwh: ratio(qtcPerDay, kwhPerDay),
    paybackDays:
      hardwareShare > 0 && cashFlow !== null ? (cashFlow > 0 ? hardwareShare / cashFlow : Infinity) : null,
  };
}

function sumNullable(values: (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

/** One GH/s of the same setup: output per day, and what it may cost to rent. */
export interface GigahashRate {
  /** QTC a single GH/s earns per day, after uptime and fees. */
  qtcPerDay: number;
  /** Most that GH/s can cost per day and still break even; null without a price. */
  ratePerDay: number | null;
  ratePerHour: number | null;
}

export function gigahashRate(
  network: Network,
  assumptions: Assumptions,
  minerFeePercent: number,
): GigahashRate {
  const derived = deriveNetwork(network);
  const one: Device = { id: "gh", label: "1 GH/s", hashrate: 1e9, quantity: 1, powerW: null, minerFeePercent };
  const row = estimateDevice(derived, one, assumptions, { mode: "rental", rentPerDay: 0 });
  const price = positive(assumptions.price);
  const ratePerDay = price > 0 ? row.qtcPerDay * price : null;
  return {
    qtcPerDay: row.qtcPerDay,
    ratePerDay,
    ratePerHour: ratePerDay === null ? null : ratePerDay / 24,
  };
}

export function estimate(network: Network, devices: Device[], assumptions: Assumptions, costs: Costs): Estimate {
  const derived = deriveNetwork(network);
  const rowHashrate = devices.map((device) => positive(device.hashrate) * Math.max(0, Math.floor(finite(device.quantity))));
  const totalHashrate = rowHashrate.reduce((sum, value) => sum + value, 0);
  const rows = devices.map((device, index) =>
    estimateDevice(derived, device, assumptions, costs, totalHashrate > 0 ? rowHashrate[index] / totalHashrate : 0),
  );
  const planckPerDay = rows.reduce((sum, row) => sum + row.planckPerDay, 0n);
  const qtcPerDay = planckToQtc(planckPerDay);
  const kwhPerDay = sumNullable(rows.map((row) => row.kwhPerDay));
  const electricityPerDay = sumNullable(rows.map((row) => row.electricityPerDay));
  const rentPerDay = costs.mode === "rental" ? positive(costs.rentPerDay) : 0;
  const hardwareCost = costs.mode === "electricity" ? positive(costs.hardwareCost) : 0;
  const hardwarePerDay = costs.mode === "electricity" && costs.amortiseDays > 0 ? hardwareCost / costs.amortiseDays : 0;
  const runningCostPerDay = electricityPerDay === null ? null : electricityPerDay + rentPerDay;
  const costPerDay = runningCostPerDay === null ? null : runningCostPerDay + hardwarePerDay;
  const revenuePerDay = qtcPerDay * positive(assumptions.price);
  const profitPerDay = costPerDay === null ? null : revenuePerDay - costPerDay;
  const cashFlow = runningCostPerDay === null ? null : revenuePerDay - runningCostPerDay;
  const rentBudget = breakEvenRentPerDay(qtcPerDay, positive(assumptions.price), electricityPerDay);
  const total: Yield = {
    hashrate: totalHashrate,
    share: derived.hashrate > 0 ? totalHashrate / derived.hashrate : 0,
    planckPerDay,
    qtcPerDay,
    soloBlocksPerDay: rows.reduce((sum, row) => sum + row.soloBlocksPerDay, 0),
    kwhPerDay,
    electricityPerDay,
    rentPerDay,
    hardwarePerDay,
    runningCostPerDay,
    costPerDay,
    revenuePerDay,
    profitPerDay,
    margin: ratio(profitPerDay, revenuePerDay),
    breakEvenPrice: ratio(runningCostPerDay, qtcPerDay),
    breakEvenPriceWithHardware: ratio(costPerDay, qtcPerDay),
    breakEvenRentPerDay: rentBudget,
    breakEvenRentPerHour: breakEvenRentPerHour(rentBudget),
    electricityPerQtc: ratio(electricityPerDay, qtcPerDay),
    costPerQtc: ratio(costPerDay, qtcPerDay),
    qtcPerKwh: ratio(qtcPerDay, kwhPerDay),
    paybackDays: hardwareCost > 0 && cashFlow !== null ? (cashFlow > 0 ? hardwareCost / cashFlow : Infinity) : null,
  };
  return { network: derived, devices: rows, total };
}

/**
 * Relative standard deviation of the block count over a period whose
 * expectation is `expectedBlocks` (Poisson): how far luck moves short-term
 * results. Null when nothing is expected at all.
 */
export function luckDeviation(expectedBlocks: number): number | null {
  return expectedBlocks > 0 ? 1 / Math.sqrt(expectedBlocks) : null;
}
