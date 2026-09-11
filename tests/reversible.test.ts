import { describe, expect, it } from "bun:test";
import type { ScheduledTransfer } from "../src/lib/chain";
import {
  DEFAULT_DELAY_BLOCKS,
  DELAY_CHOICES,
  MAX_PENDING_PER_ACCOUNT,
  MIN_DELAY_BLOCKS,
  TARGET_BLOCK_SECONDS,
  blockSpanSeconds,
  executeAtEstimate,
  executeAtTime,
  formatBlockSpan,
  formatSpan,
  parseDelayBlocks,
  scheduleProgress,
  sortScheduled,
} from "../src/lib/reversible";

const transfer = (overrides: Partial<ScheduledTransfer>): ScheduledTransfer => ({
  txId: "0x" + "11".repeat(32),
  from: "from",
  to: "to",
  amount: "1000000000000",
  executeAt: null,
  submittedAt: null,
  timestamp: null,
  ...overrides,
});

describe("delay choices", () => {
  it("matches the runtime constants the chain enforces", () => {
    expect(MIN_DELAY_BLOCKS).toBe(2);
    expect(DEFAULT_DELAY_BLOCKS).toBe(7200);
    expect(MAX_PENDING_PER_ACCOUNT).toBe(16);
    expect(DELAY_CHOICES).toContain(DEFAULT_DELAY_BLOCKS);
    expect(DELAY_CHOICES.every((blocks) => blocks >= MIN_DELAY_BLOCKS)).toBe(true);
  });

  it("turns blocks into the wait the presets are named for", () => {
    expect(blockSpanSeconds(300)).toBe(300 * TARGET_BLOCK_SECONDS);
    expect(formatBlockSpan(50)).toBe("约 10 分钟");
    expect(formatBlockSpan(300)).toBe("约 1 小时");
    expect(formatBlockSpan(7200)).toBe("约 1 天");
  });

  it("scales the unit to the size of the wait", () => {
    expect(formatSpan(0)).toBe("约 1 秒");
    expect(formatSpan(45)).toBe("约 45 秒");
    expect(formatSpan(600)).toBe("约 10 分钟");
    expect(formatSpan(2700)).toBe("约 45 分钟");
    expect(formatSpan(5400)).toBe("约 1.5 小时");
    expect(formatSpan(9000)).toBe("约 2.5 小时");
    expect(formatSpan(432_000)).toBe("约 5 天");
  });

  it("accepts only a whole number of blocks at or above the chain minimum", () => {
    expect(parseDelayBlocks(" 240 ")).toBe(240);
    expect(parseDelayBlocks(String(MIN_DELAY_BLOCKS))).toBe(MIN_DELAY_BLOCKS);
    for (const bad of ["", "0", "1", "-5", "2.5", "1e3", "abc", "1".repeat(10)]) {
      expect(() => parseDelayBlocks(bad)).toThrow();
    }
  });
});

describe("scheduled transfers", () => {
  it("estimates the due block and the time it lands", () => {
    expect(executeAtEstimate(1000, 7200)).toBe(8200);
    const now = Date.UTC(2026, 8, 12, 10, 0, 0);
    expect(executeAtTime(8200, 1000, 12, now).getTime()).toBe(now + 7200 * 12 * 1000);
    // A due block already passed is not in the future.
    expect(executeAtTime(500, 1000, 12, now).getTime()).toBe(now);
  });

  it("measures progress from the block it was submitted in", () => {
    const row = transfer({ submittedAt: 1000, executeAt: 1100 });
    expect(scheduleProgress(row, 1000)).toBe(0);
    expect(scheduleProgress(row, 1050)).toBeCloseTo(0.5, 6);
    expect(scheduleProgress(row, 1100)).toBe(1);
    // Never beyond the ends, whatever the chain reports.
    expect(scheduleProgress(row, 900)).toBe(0);
    expect(scheduleProgress(row, 5000)).toBe(1);
  });

  it("shows no progress while the due block is unknown", () => {
    expect(scheduleProgress(transfer({}), 1000)).toBe(0);
  });

  it("puts the soonest first and the undated last", () => {
    const rows = [
      transfer({ txId: "0x" + "33".repeat(32), executeAt: null }),
      transfer({ txId: "0x" + "22".repeat(32), executeAt: 900 }),
      transfer({ txId: "0x" + "11".repeat(32), executeAt: 5000 }),
      transfer({ txId: "0x" + "44".repeat(32), executeAt: null }),
    ];
    expect(sortScheduled(rows).map((row) => row.executeAt)).toEqual([900, 5000, null, null]);
    // Ties resolve on the transaction id, so the order does not wobble.
    expect(sortScheduled(rows).slice(2).map((row) => row.txId)).toEqual([
      "0x" + "33".repeat(32),
      "0x" + "44".repeat(32),
    ]);
    // The input is left alone.
    expect(rows[0].executeAt).toBeNull();
  });
});
