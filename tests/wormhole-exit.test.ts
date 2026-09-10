import { beforeEach, describe, expect, test } from "bun:test";
import { hexToU8a } from "@polkadot/util";
import {
  WORMHOLE_EXIT_MAX_INPUTS,
  WORMHOLE_EXIT_STORAGE_KEY,
  decodeTransactionValidity,
  encodeHeaderDigest,
  listWormholeExitReceipts,
  summarizeWormholeExit,
} from "../src/lib/wormhole/exit";
import { proverProgress, WORMHOLE_PROVER } from "../src/lib/wormhole/prover";
import { findOpenWormholeExitReceipt, isWormholeExitReceipt, saveWormholeExitReceipt } from "../src/lib/wormhole/receipts";
import type { WormholeDeposit, WormholeExitReceipt, WormholeRules } from "../src/lib/wormhole/types";

const QUANTUM = 10_000_000_000n;
const RULES: WormholeRules = {
  specVersion: 152, transactionVersion: 6,
  genesisHash: "0xfb5487c0be6ae4ade2d41d16e50465129861636c2b8d61fa94d7a19631626fba",
  volumeFeeBps: 4, aggregatorRatePpm: 500_000, quantumPlanck: QUANTUM.toString(), blockHashCount: 4096,
  existentialDepositPlanck: "1000000000", burnRatePpm: 500_000, batchKind: "private-batch",
};
const ADDRESS = "qzk1Nxai3dZD9Cn5kwGcgL6mKxsfxwqdis7kDQJ52aJS2vSn7";

function deposit(id: string, amountPlanck: bigint, extra: Partial<WormholeDeposit> = {}): WormholeDeposit {
  return {
    id, branch: 0, index: 0, address: ADDRESS, amountPlanck: amountPlanck.toString(), blockHeight: 10, blockHash: `0x${"11".repeat(32)}`,
    leafIndex: id, transferCount: "0", toHash: `0x${"22".repeat(32)}`,
    nullifier: `0x${id.padStart(2, "0").repeat(32).slice(0, 64)}`, spent: false, ...extra,
  };
}

/** `pallet_wormhole::volume_fee_for_exit`: `ceil(out · bps / (10000 − bps))` quanta. */
function palletFeeQuanta(outQuanta: bigint, bps: bigint): bigint {
  return (outQuanta * bps + (10_000n - bps) - 1n) / (10_000n - bps);
}

describe("summarizeWormholeExit", () => {
  test("applies the segment fee relation and quantization of the private-batch circuit", () => {
    const summary = summarizeWormholeExit([deposit("1", 1_000n * QUANTUM + 123n)], RULES);
    expect(summary.inputPlanck).toBe((1_000n * QUANTUM + 123n).toString());
    expect(summary.quantizedPlanck).toBe((1_000n * QUANTUM).toString());
    expect(summary.dustPlanck).toBe("123");
    // floor(1000 · 9996 / 10000) = 999 quanta out; the gap of one quantum is the fee.
    expect(summary.netPlanck).toBe((999n * QUANTUM).toString());
    expect(summary.feePlanck).toBe(QUANTUM.toString());
    expect(summary.settledFeePlanck).toBe((palletFeeQuanta(999n, 4n) * QUANTUM).toString());
    expect(summary.rebatePlanck).toBe("0");
  });

  test("the fee gap the circuit locks is at least what the pallet settles", () => {
    for (const quanta of [2n, 3n, 100n, 2501n, 9_999n, 10_000n, 123_456_789n]) {
      const summary = summarizeWormholeExit([deposit("1", quanta * QUANTUM)], RULES);
      const out = BigInt(summary.netPlanck) / QUANTUM;
      expect(out * 10_000n <= quanta * 9_996n).toBe(true);
      expect((out + 1n) * 10_000n > quanta * 9_996n).toBe(true);
      expect(palletFeeQuanta(out, 4n) <= quanta - out).toBe(true);
      expect(BigInt(summary.feePlanck)).toBe((quanta - out) * QUANTUM);
    }
    // 2501 quanta: the circuit locks 2 quanta, the pallet books 1 of them as fee.
    const edge = summarizeWormholeExit([deposit("1", 2_501n * QUANTUM)], RULES);
    expect(edge.netPlanck).toBe((2_499n * QUANTUM).toString());
    expect(edge.feePlanck).toBe((2n * QUANTUM).toString());
    expect(edge.settledFeePlanck).toBe(QUANTUM.toString());
  });

  test("sums up to seven deposits before applying the fee once", () => {
    const deposits = Array.from({ length: 7 }, (_, i) => deposit(String(i + 1), BigInt(i + 1) * QUANTUM + 5n, { index: i }));
    const summary = summarizeWormholeExit(deposits, RULES);
    expect(summary.quantizedPlanck).toBe((28n * QUANTUM).toString());
    expect(summary.dustPlanck).toBe("35");
    expect(summary.netPlanck).toBe((27n * QUANTUM).toString());
    expect(summary.feePlanck).toBe(QUANTUM.toString());
  });

  test("a single quantum leaves nothing and tiny amounts round to zero", () => {
    expect(summarizeWormholeExit([deposit("1", QUANTUM)], RULES).netPlanck).toBe("0");
    const tiny = summarizeWormholeExit([deposit("1", QUANTUM - 1n)], RULES);
    expect(tiny.quantizedPlanck).toBe("0");
    expect(tiny.dustPlanck).toBe((QUANTUM - 1n).toString());
    expect(tiny.netPlanck).toBe("0");
  });

  test("rejects empty, oversized, spent, duplicate and malformed selections", () => {
    expect(() => summarizeWormholeExit([], RULES)).toThrow();
    const many = Array.from({ length: WORMHOLE_EXIT_MAX_INPUTS + 1 }, (_, i) => deposit(String(i), QUANTUM, { index: i }));
    expect(() => summarizeWormholeExit(many, RULES)).toThrow();
    expect(() => summarizeWormholeExit([deposit("1", QUANTUM, { spent: true })], RULES)).toThrow();
    expect(() => summarizeWormholeExit([deposit("1", QUANTUM), deposit("1", QUANTUM)], RULES)).toThrow();
    expect(() => summarizeWormholeExit([deposit("1", QUANTUM, { nullifier: "0x12" })], RULES)).toThrow();
    expect(() => summarizeWormholeExit([deposit("1", QUANTUM, { amountPlanck: "1.5" })], RULES)).toThrow();
    expect(() => summarizeWormholeExit([deposit("1", QUANTUM, { address: "0x00" })], RULES)).toThrow();
    expect(() => summarizeWormholeExit([deposit("1", QUANTUM)], { ...RULES, volumeFeeBps: 10_000 })).toThrow();
  });
});

describe("header digest encoding", () => {
  test("SCALE-encodes the digest logs into the fixed 110-byte hash window", () => {
    // PreRuntime("pow_", 32 bytes) + Seal("pow_", 64 bytes) — the canonical Quantus digest.
    const preRuntime = `0x06${Buffer.from("pow_").toString("hex")}80${"ab".repeat(32)}`;
    const seal = `0x05${Buffer.from("pow_").toString("hex")}0101${"cd".repeat(64)}`;
    const digest = hexToU8a(encodeHeaderDigest([preRuntime, seal]));
    expect(digest.length).toBe(110);
    expect(digest[0]).toBe(8); // compact(2)
    expect(digest[1]).toBe(6);
    expect(Buffer.from(digest.subarray(2, 6)).toString()).toBe("pow_");
    expect(digest[6]).toBe(128); // compact(32)
    expect(digest[39]).toBe(5);
    expect(digest[44]).toBe(1); // compact(64) = 0x0101
    expect(digest[45]).toBe(1);
    expect(digest[109]).toBe(0xcd);
    // Shorter digests are zero-padded, longer ones are cut to the committed window.
    expect(hexToU8a(encodeHeaderDigest([])).length).toBe(110);
    expect(hexToU8a(encodeHeaderDigest([preRuntime, seal, "0x00"])).length).toBe(110);
  });
});

describe("transaction validity decoding", () => {
  test("distinguishes valid, invalid and unknown results", () => {
    expect(decodeTransactionValidity(`0x00${"00".repeat(8)}0000${"00".repeat(8)}01`)).toEqual({ valid: true });
    expect(decodeTransactionValidity("0x010000")).toEqual({ valid: false, reason: "Invalid.Call" });
    expect(decodeTransactionValidity("0x010003")).toEqual({ valid: false, reason: "Invalid.Stale" });
    expect(decodeTransactionValidity("0x01000709")).toEqual({ valid: false, reason: "Invalid.Custom(9)" });
    expect(decodeTransactionValidity("0x010101")).toEqual({ valid: false, reason: "Unknown.NoUnsignedValidator" });
    expect(() => decodeTransactionValidity("0x02")).toThrow();
  });
});

describe("prover bridge", () => {
  test("maps prover stages onto exit progress", () => {
    expect(proverProgress("leaf", 0, 2)).toMatchObject({ stage: "prove", percent: 5 });
    expect(proverProgress("leaf", 2, 2)).toMatchObject({ stage: "prove", percent: 40 });
    expect(proverProgress("circuit", 1, 1)).toMatchObject({ stage: "circuit", percent: 50 });
    expect(proverProgress("prove", 0, 1)).toMatchObject({ stage: "prove", percent: 55 });
    expect(proverProgress("verify", 1, 1)).toMatchObject({ stage: "verify", percent: 98 });
    expect(WORMHOLE_PROVER.numLeafProofs).toBe(WORMHOLE_EXIT_MAX_INPUTS);
    expect(WORMHOLE_PROVER.quantumPlanck).toBe(RULES.quantumPlanck);
  });
});

describe("exit receipts", () => {
  const memory = new Map<string, string>();
  beforeEach(() => {
    memory.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
      clear: () => memory.clear(),
      key: () => null,
      get length() { return memory.size; },
    };
  });

  function receipt(hash: string, phase: WormholeExitReceipt["phase"], createdAt: number): WormholeExitReceipt {
    return {
      version: 1, hash, bytes: "0x0400", exitAddress: ADDRESS, nullifiers: [`0x${"aa".repeat(32)}`], depositIds: ["1"],
      inputPlanck: "1", feePlanck: "0", netPlanck: "1", proofBlock: 5, proofBlockHash: `0x${"bb".repeat(32)}`, expiresAt: 4101,
      phase, message: "m", createdAt, endpoint: "https://rpc1-mainnet.quantus.com",
    };
  }

  test("stores public records newest first under the versioned key and drops bytes once settled", () => {
    saveWormholeExitReceipt(receipt(`0x${"01".repeat(32)}`, "submitted", 1));
    saveWormholeExitReceipt(receipt(`0x${"02".repeat(32)}`, "submitted", 2));
    expect(JSON.parse(memory.get(WORMHOLE_EXIT_STORAGE_KEY)!)).toHaveLength(2);
    expect(listWormholeExitReceipts().map((r) => r.hash)).toEqual([`0x${"02".repeat(32)}`, `0x${"01".repeat(32)}`]);
    expect(findOpenWormholeExitReceipt([`0x${"aa".repeat(32)}`])?.hash).toBe(`0x${"02".repeat(32)}`);
    const finalized = saveWormholeExitReceipt({ ...receipt(`0x${"02".repeat(32)}`, "finalized", 2), includedHeight: 7 });
    expect(finalized.bytes).toBeUndefined();
    expect(listWormholeExitReceipts()).toHaveLength(2);
    saveWormholeExitReceipt(receipt(`0x${"01".repeat(32)}`, "expired", 1));
    expect(findOpenWormholeExitReceipt([`0x${"aa".repeat(32)}`])).toBeUndefined();
    expect(memory.get(WORMHOLE_EXIT_STORAGE_KEY)).not.toContain("mnemonic");
  });

  test("ignores malformed or foreign entries instead of trusting them", () => {
    memory.set(WORMHOLE_EXIT_STORAGE_KEY, JSON.stringify([
      receipt(`0x${"03".repeat(32)}`, "included", 3),
      { ...receipt(`0x${"04".repeat(32)}`, "included", 4), phase: "done" },
      { ...receipt(`0x${"05".repeat(32)}`, "included", 5), nullifiers: ["nope"] },
      { ...receipt(`0x${"06".repeat(32)}`, "included", 6), version: 2 },
      "junk", null, 7,
    ]));
    expect(listWormholeExitReceipts().map((r) => r.hash)).toEqual([`0x${"03".repeat(32)}`]);
    memory.set(WORMHOLE_EXIT_STORAGE_KEY, "{not json");
    expect(listWormholeExitReceipts()).toEqual([]);
    expect(isWormholeExitReceipt(receipt(`0x${"03".repeat(32)}`, "included", 3))).toBe(true);
    expect(isWormholeExitReceipt({ ...receipt(`0x${"03".repeat(32)}`, "included", 3), message: "x".repeat(3000) })).toBe(false);
  });
});
