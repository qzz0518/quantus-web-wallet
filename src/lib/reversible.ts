import { useEffect, useState } from "react";
import { MIN_DELAY_BLOCKS, type ScheduledTransfer } from "./chain";
import { fetchChainStats } from "./mining/data";
import { t } from "./i18n";

/**
 * Delayed transfers. `pallet-reversible-transfers` holds the amount on the
 * sender's account and lets the chain pay it out after a delay the sender
 * chooses; until then the sender can take it back, and the chain charges
 * nothing for doing so.
 *
 * The runtime constants below are read from mainnet metadata
 * (`ReversibleTransfers.MinDelayPeriodBlocks`, `DefaultDelay`,
 * `MaxPendingPerAccount`) and are repeated here only to shape the choices and
 * the copy; every call still takes its values from the chain.
 */
export const DEFAULT_DELAY_BLOCKS = 7200;
export const MAX_PENDING_PER_ACCOUNT = 16;
/** The network's target, used when no measured block time is available. */
export const TARGET_BLOCK_SECONDS = 12;

export const DELAY_CHOICES = [50, 300, DEFAULT_DELAY_BLOCKS] as const;

export { MIN_DELAY_BLOCKS };

/** Seconds a number of blocks is expected to take. */
export function blockSpanSeconds(blocks: number, blockSeconds = TARGET_BLOCK_SECONDS): number {
  return blocks * blockSeconds;
}

/** "about ten minutes" rather than a false precision of seconds. */
export function formatBlockSpan(blocks: number, blockSeconds = TARGET_BLOCK_SECONDS): string {
  return formatSpan(blockSpanSeconds(blocks, blockSeconds));
}

export function formatSpan(seconds: number): string {
  const value = Math.max(0, seconds);
  if (value < 90) return t("约 {0} 秒", Math.max(1, Math.round(value)));
  if (value < 3600) return t("约 {0} 分钟", Math.round(value / 60));
  if (value < 86_400) return t("约 {0} 小时", trim(value / 3600));
  return t("约 {0} 天", trim(value / 86_400));
}

/** One decimal, and none when it would be a trailing zero. */
function trim(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

/** The block the chain is expected to execute a transfer scheduled now in. */
export function executeAtEstimate(currentBlock: number, delayBlocks: number): number {
  return currentBlock + delayBlocks;
}

/** When a due block is expected to arrive, as a wall-clock time. */
export function executeAtTime(
  executeAt: number,
  currentBlock: number,
  blockSeconds = TARGET_BLOCK_SECONDS,
  now = Date.now(),
): Date {
  return new Date(now + Math.max(0, executeAt - currentBlock) * blockSeconds * 1000);
}

/** How far a scheduled transfer has run, 0 to 1; unknown timings read as 0. */
export function scheduleProgress(transfer: Pick<ScheduledTransfer, "executeAt" | "submittedAt">, currentBlock: number): number {
  const { executeAt, submittedAt } = transfer;
  if (executeAt === null) return 0;
  const start = submittedAt !== null && submittedAt < executeAt ? submittedAt : executeAt - DEFAULT_DELAY_BLOCKS;
  const span = executeAt - start;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (currentBlock - start) / span));
}

/**
 * Soonest first. A transfer whose due block is not known yet sorts last: it
 * cannot be placed against the others, and guessing a position would put a
 * countdown next to it that is not real.
 */
export function sortScheduled(transfers: ScheduledTransfer[]): ScheduledTransfer[] {
  return [...transfers].sort((a, b) => {
    if (a.executeAt === b.executeAt) return a.txId < b.txId ? -1 : a.txId > b.txId ? 1 : 0;
    if (a.executeAt === null) return 1;
    if (b.executeAt === null) return -1;
    return a.executeAt - b.executeAt;
  });
}

/** A delay the chain will accept: a whole number of blocks, at least the minimum. */
export function parseDelayBlocks(value: string): number {
  const text = value.trim();
  if (!/^\d{1,9}$/.test(text)) throw new Error(t("请输入延迟区块数（整数）"));
  const blocks = Number(text);
  if (blocks < MIN_DELAY_BLOCKS) throw new Error(t("延迟至少 {0} 个区块", MIN_DELAY_BLOCKS));
  return blocks;
}

const BLOCK_SECONDS_TTL_MS = 10 * 60_000;
let measuredBlockTime: { seconds: number; at: number } | null = null;
let measuring: Promise<number | null> | null = null;

/** The block time measured over recent blocks, cached ten minutes; null while unknown. */
export function measureBlockSeconds(): Promise<number | null> {
  if (measuredBlockTime && Date.now() - measuredBlockTime.at < BLOCK_SECONDS_TTL_MS) {
    return Promise.resolve(measuredBlockTime.seconds);
  }
  if (measuring) return measuring;
  measuring = fetchChainStats()
    .then((stats) => {
      const seconds = stats.blockTimeSeconds;
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      measuredBlockTime = { seconds, at: Date.now() };
      return seconds;
    })
    .catch(() => null)
    .finally(() => {
      measuring = null;
    });
  return measuring;
}

/**
 * Block time for arrival estimates: the measured value once a reader has it,
 * the network target until then. `enabled` defers the measurement until the
 * estimate is actually on screen.
 */
export function useBlockSeconds(enabled = true): { seconds: number; measured: boolean } {
  const [value, setValue] = useState<number | null>(() =>
    measuredBlockTime && Date.now() - measuredBlockTime.at < BLOCK_SECONDS_TTL_MS ? measuredBlockTime.seconds : null,
  );
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void measureBlockSeconds().then((seconds) => {
      if (live && seconds !== null) setValue(seconds);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return value === null ? { seconds: TARGET_BLOCK_SECONDS, measured: false } : { seconds: value, measured: true };
}
