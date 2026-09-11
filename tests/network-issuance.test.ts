import { describe, expect, test } from "bun:test";
import {
  EMISSION_DIVISOR,
  HALVING_BLOCKS,
  MAX_SUPPLY_PLANCK,
  blocksPerDay,
  blocksPerYear,
  decayFactor,
  emissionOutlook,
  emittedQtc,
  halvingYears,
  projectedRewardQtc,
  readSupply,
} from "../src/lib/network/issuance";
import { planckToQtc } from "../src/lib/mining/math";

/** Balances.TotalIssuance read from the mainnet RPC on 2026-09-11. */
const ISSUANCE = 5_678_494_528_063_958_854n;
/** Block time measured over the last 200 blocks on the same day. */
const BLOCK_TIME = 17.468;

describe("supply", () => {
  const supply = readSupply(ISSUANCE);

  test("splits the cap into what exists and what is left", () => {
    expect(supply.issuedPlanck).toBe(ISSUANCE);
    expect(supply.issuedPlanck + supply.remainingPlanck).toBe(MAX_SUPPLY_PLANCK);
    expect(planckToQtc(supply.issuedPlanck)).toBeCloseTo(5_678_494.5, 0);
    expect(supply.issuedShare).toBeCloseTo(0.2704, 4);
  });

  test("mints one fifty-millionth of the remainder per block", () => {
    expect(supply.rewardPlanck).toBe(supply.remainingPlanck / BigInt(EMISSION_DIVISOR));
    // What the chain paid on 2026-09-11, to four decimals.
    expect(planckToQtc(supply.rewardPlanck)).toBeCloseTo(0.30643, 5);
  });

  test("clamps a reading outside the cap instead of going negative", () => {
    expect(readSupply(-1n).issuedPlanck).toBe(0n);
    expect(readSupply(MAX_SUPPLY_PLANCK * 2n).remainingPlanck).toBe(0n);
    expect(readSupply(MAX_SUPPLY_PLANCK).rewardPlanck).toBe(0n);
    expect(readSupply(0n).issuedShare).toBe(0);
  });
});

describe("decay", () => {
  test("loses exactly half the reward after ln2 × divisor blocks", () => {
    expect(decayFactor(HALVING_BLOCKS)).toBeCloseTo(0.5, 6);
    expect(HALVING_BLOCKS).toBeCloseTo(34_657_359, 0);
  });

  test("is the identity at zero and refuses nonsense", () => {
    expect(decayFactor(0)).toBe(1);
    expect(decayFactor(-5)).toBe(1);
    expect(decayFactor(Number.NaN)).toBe(1);
  });

  test("shrinks by one divisor-th per block", () => {
    expect(decayFactor(1)).toBeCloseTo(1 - 1 / EMISSION_DIVISOR, 15);
    expect(decayFactor(2)).toBeCloseTo((1 - 1 / EMISSION_DIVISOR) ** 2, 15);
  });

  test("halves the projected reward over a halving window", () => {
    const supply = readSupply(ISSUANCE);
    const now = planckToQtc(supply.rewardPlanck);
    expect(projectedRewardQtc(supply, 0)).toBeCloseTo(now, 9);
    expect(projectedRewardQtc(supply, HALVING_BLOCKS)).toBeCloseTo(now / 2, 8);
  });

  test("counts emission as the shrinking remainder, not reward × blocks", () => {
    const supply = readSupply(ISSUANCE);
    const blocks = blocksPerYear(BLOCK_TIME);
    const naive = planckToQtc(supply.rewardPlanck) * blocks;
    const exact = emittedQtc(supply, blocks);
    expect(exact).toBeLessThan(naive);
    // Roughly 2% apart over a year at this block time, which is why the daily
    // figure may use the reward directly but the yearly one may not.
    expect(exact / naive).toBeCloseTo(0.982, 3);
    expect(emittedQtc(supply, 0)).toBe(0);
  });
});

describe("rates", () => {
  test("turns a block time into blocks per day and per year", () => {
    expect(blocksPerDay(12)).toBe(7200);
    expect(blocksPerYear(12)).toBeCloseTo(2_629_800, 0);
    expect(blocksPerDay(BLOCK_TIME)).toBeCloseTo(4946, 0);
  });

  test("answers zero rather than Infinity without a block time", () => {
    expect(blocksPerDay(0)).toBe(0);
    expect(blocksPerYear(Number.NaN)).toBe(0);
    expect(halvingYears(0)).toBeNull();
    expect(halvingYears(-1)).toBeNull();
  });

  test("puts the halving about thirteen years out at the target block time", () => {
    expect(halvingYears(12)).toBeCloseTo(13.18, 2);
    expect(halvingYears(BLOCK_TIME)).toBeCloseTo(19.18, 2);
  });
});

describe("outlook", () => {
  const supply = readSupply(ISSUANCE);
  const rows = emissionOutlook(supply, BLOCK_TIME, [0, 1, 2, 5]);

  test("starts at today's reward and only ever falls", () => {
    expect(rows[0].rewardQtc).toBeCloseTo(planckToQtc(supply.rewardPlanck), 9);
    expect(rows[0].blocks).toBe(0);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].rewardQtc).toBeLessThan(rows[i - 1].rewardQtc);
      expect(rows[i].yearEmissionQtc).toBeLessThan(rows[i - 1].yearEmissionQtc);
      expect(rows[i].issuedQtc).toBeGreaterThan(rows[i - 1].issuedQtc);
    }
  });

  test("keeps every row under the cap and above today's issuance", () => {
    const issued = planckToQtc(supply.issuedPlanck);
    for (const row of rows) {
      expect(row.issuedQtc).toBeGreaterThanOrEqual(issued - 1);
      expect(row.issuedQtc).toBeLessThan(21_000_000);
      expect(row.rewardQtc).toBeGreaterThan(0);
    }
    expect(rows[0].issuedQtc).toBeCloseTo(issued, 0);
  });

  test("reads the first year's emission the same way `emittedQtc` does", () => {
    expect(rows[0].yearEmissionQtc).toBeCloseTo(emittedQtc(supply, blocksPerYear(BLOCK_TIME)), 6);
  });

  test("degrades to a flat table without a block time", () => {
    const flat = emissionOutlook(supply, 0, [0, 1, 5]);
    expect(flat.every((row) => row.blocks === 0)).toBe(true);
    expect(flat.every((row) => row.yearEmissionQtc === 0)).toBe(true);
  });
});
