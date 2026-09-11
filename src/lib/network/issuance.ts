import { PLANCK, planckToQtc } from "../mining/math";

/**
 * Emission arithmetic for the network dashboard, free of I/O.
 *
 * `pallet-mining-rewards` mints `(MaxSupply − TotalIssuance) / EmissionDivisor`
 * to the miner of every block. The mainnet runtime (`quantus-runtime`, spec
 * 152) sets MaxSupply to 21,000,000 QTC and EmissionDivisor to 50,000,000, so
 * every block mints one fifty-millionth of whatever is left. That is a smooth
 * exponential decay with no halving step in it: the reward simply shrinks by
 * a factor of `1 − 1/50,000,000` per block, and the point where it has fallen
 * to half takes `ln2 × 50,000,000` blocks to reach.
 *
 * The two constants are runtime parameters, not storage, so they are written
 * here rather than read; the page states which runtime they belong to.
 */

/** Mainnet runtime the constants below were read from. */
export const RUNTIME_SPEC = 152;
export const MAX_SUPPLY_QTC = 21_000_000;
export const MAX_SUPPLY_PLANCK = BigInt(MAX_SUPPLY_QTC) * PLANCK;
export const EMISSION_DIVISOR = 50_000_000;
/** Blocks until the per-block reward has halved: `ln2 × EmissionDivisor`. */
export const HALVING_BLOCKS = Math.LN2 * EMISSION_DIVISOR;
/** Seconds in a Gregorian year (365.2425 days), the unit the page says "year" in. */
export const SECONDS_PER_YEAR = 31_557_600;

export type Supply = {
  issuedPlanck: bigint;
  remainingPlanck: bigint;
  /** Planck the next block mints. */
  rewardPlanck: bigint;
  /** Issued divided by the maximum supply, 0..1. */
  issuedShare: number;
};

/**
 * The supply picture implied by a `Balances.TotalIssuance` reading. An
 * issuance above the cap (which the chain never produces) is clamped so the
 * page shows a full bar rather than a negative remainder.
 */
export function readSupply(issuancePlanck: bigint): Supply {
  const issued = issuancePlanck < 0n ? 0n : issuancePlanck > MAX_SUPPLY_PLANCK ? MAX_SUPPLY_PLANCK : issuancePlanck;
  const remaining = MAX_SUPPLY_PLANCK - issued;
  return {
    issuedPlanck: issued,
    remainingPlanck: remaining,
    rewardPlanck: remaining / BigInt(EMISSION_DIVISOR),
    issuedShare: Number(issued) / Number(MAX_SUPPLY_PLANCK),
  };
}

/**
 * The share of the remaining supply still unminted after `blocks` more
 * blocks: `(1 − 1/D)^blocks`, computed through `log1p` so the tiny per-block
 * factor keeps its precision over tens of millions of blocks.
 */
export function decayFactor(blocks: number): number {
  if (!Number.isFinite(blocks) || blocks <= 0) return 1;
  return Math.exp(blocks * Math.log1p(-1 / EMISSION_DIVISOR));
}

/** QTC the block after `blocks` more blocks will mint. */
export function projectedRewardQtc(supply: Supply, blocks: number): number {
  return (planckToQtc(supply.remainingPlanck) * decayFactor(blocks)) / EMISSION_DIVISOR;
}

/** QTC minted over the next `blocks` blocks, exactly — not the reward times the count. */
export function emittedQtc(supply: Supply, blocks: number): number {
  return planckToQtc(supply.remainingPlanck) * (1 - decayFactor(blocks));
}

export function blocksPerDay(blockTimeSeconds: number): number {
  return blockTimeSeconds > 0 && Number.isFinite(blockTimeSeconds) ? 86_400 / blockTimeSeconds : 0;
}

export function blocksPerYear(blockTimeSeconds: number): number {
  return blockTimeSeconds > 0 && Number.isFinite(blockTimeSeconds) ? SECONDS_PER_YEAR / blockTimeSeconds : 0;
}

/** Years until the reward has halved at the measured block time; null without one. */
export function halvingYears(blockTimeSeconds: number): number | null {
  if (!(blockTimeSeconds > 0) || !Number.isFinite(blockTimeSeconds)) return null;
  return (HALVING_BLOCKS * blockTimeSeconds) / SECONDS_PER_YEAR;
}

export type EmissionRow = {
  /** Years from now, 0 for the current block. */
  years: number;
  blocks: number;
  rewardQtc: number;
  /** QTC minted during the twelve months that start at this point. */
  yearEmissionQtc: number;
  /** Total issued QTC at this point. */
  issuedQtc: number;
};

/**
 * The reward and the following year's emission at a few points ahead, so the
 * decay is visible as numbers instead of as a claim. Every row is derived
 * from today's remainder; nothing is carried over from the row before it.
 */
export function emissionOutlook(supply: Supply, blockTimeSeconds: number, years: number[]): EmissionRow[] {
  const perYear = blocksPerYear(blockTimeSeconds);
  const remainingQtc = planckToQtc(supply.remainingPlanck);
  const maxQtc = planckToQtc(MAX_SUPPLY_PLANCK);
  return years.map((year) => {
    const blocks = perYear * Math.max(0, year);
    const left = remainingQtc * decayFactor(blocks);
    return {
      years: year,
      blocks,
      rewardQtc: left / EMISSION_DIVISOR,
      yearEmissionQtc: left - remainingQtc * decayFactor(blocks + perYear),
      issuedQtc: maxQtc - left,
    };
  });
}
