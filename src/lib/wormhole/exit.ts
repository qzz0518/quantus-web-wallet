import type {
  WormholeDeposit,
  WormholeExitProgress,
  WormholeExitReceipt,
  WormholeExitSummary,
  WormholeRules,
} from "./types";

/** At most this many deposits go into one proof. */
export const WORMHOLE_EXIT_MAX_INPUTS = 7;

export interface WormholeExitOptions {
  /** Seed phrase of the official wallet whose encrypted account owns the deposits. */
  mnemonic: string;
  deposits: WormholeDeposit[];
  /** Account that receives the net amount and the aggregator rebate. */
  exitAddress: string;
  onProgress?: (progress: WormholeExitProgress) => void;
  signal?: AbortSignal;
}

/** Reads the current fee, quantum, expiry and runtime rules from the chain. */
export async function readWormholeRules(): Promise<WormholeRules> {
  throw new Error("Wormhole withdrawal is not available yet.");
}

/** Fee and rounding preview for a selection; pure and synchronous. */
export function summarizeWormholeExit(
  _deposits: WormholeDeposit[],
  _rules: WormholeRules,
): WormholeExitSummary {
  throw new Error("Wormhole withdrawal is not available yet.");
}

/**
 * Builds and verifies the proof locally, broadcasts once, and returns the
 * receipt. Rejects before broadcasting on any rule mismatch.
 */
export async function withdrawWormhole(
  _options: WormholeExitOptions,
): Promise<WormholeExitReceipt> {
  throw new Error("Wormhole withdrawal is not available yet.");
}

/** Follows a receipt to inclusion and finality, updating its phase. */
export async function trackWormholeExit(
  _receipt: WormholeExitReceipt,
  _onUpdate: (receipt: WormholeExitReceipt) => void,
  _signal?: AbortSignal,
): Promise<WormholeExitReceipt> {
  throw new Error("Wormhole withdrawal is not available yet.");
}

/** Receipts stored in this browser, newest first. */
export function listWormholeExitReceipts(): WormholeExitReceipt[] {
  return [];
}
