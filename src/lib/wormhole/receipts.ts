import type { WormholeExitPhase, WormholeExitReceipt } from "./types";

/** Public withdrawal records of this browser (no secrets, no proof witnesses). */
export const WORMHOLE_EXIT_STORAGE_KEY = "quantus-wallet-wormhole-exits-v1";
const MAX_RECEIPTS = 200;
const HEX_32 = /^0x[\da-f]{64}$/i;
const PHASES: WormholeExitPhase[] = [
  "preparing", "proving", "submitting", "submitted", "included", "finalized", "failed", "unknown", "expired",
];

function isDecimal(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function isHexList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && HEX_32.test(item));
}

/** Accepts only well-formed public records; anything else is dropped rather than trusted. */
export function isWormholeExitReceipt(value: unknown): value is WormholeExitReceipt {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return r.version === 1 && typeof r.hash === "string" && HEX_32.test(r.hash) &&
    (r.bytes === undefined || (typeof r.bytes === "string" && /^0x(?:[\da-f]{2})+$/i.test(r.bytes) && r.bytes.length <= 2_200_000)) &&
    typeof r.exitAddress === "string" && r.exitAddress.length <= 128 &&
    isHexList(r.nullifiers) && Array.isArray(r.depositIds) && r.depositIds.every((id) => typeof id === "string" && id.length <= 200) &&
    isDecimal(r.inputPlanck) && isDecimal(r.feePlanck) && isDecimal(r.netPlanck) &&
    Number.isSafeInteger(r.proofBlock) && typeof r.proofBlockHash === "string" && HEX_32.test(r.proofBlockHash) &&
    Number.isSafeInteger(r.expiresAt) && PHASES.includes(r.phase as WormholeExitPhase) &&
    (r.includedHeight === undefined || Number.isSafeInteger(r.includedHeight)) &&
    (r.includedHash === undefined || (typeof r.includedHash === "string" && HEX_32.test(r.includedHash))) &&
    (r.finalizedHeight === undefined || Number.isSafeInteger(r.finalizedHeight)) &&
    (r.deniedNullifiers === undefined || isHexList(r.deniedNullifiers)) &&
    typeof r.message === "string" && r.message.length <= 2000 && Number.isSafeInteger(r.createdAt) &&
    typeof r.endpoint === "string" && r.endpoint.length <= 300 &&
    (r.resubmits === undefined || Number.isSafeInteger(r.resubmits)) &&
    (r.proofBytes === undefined || Number.isSafeInteger(r.proofBytes));
}

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Receipts stored in this browser, newest first. Invalid entries are ignored. */
export function readWormholeExitReceipts(): WormholeExitReceipt[] {
  const store = storage();
  if (!store) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(store.getItem(WORMHOLE_EXIT_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const receipts: WormholeExitReceipt[] = [];
  for (const item of parsed) {
    if (!isWormholeExitReceipt(item) || seen.has(item.hash.toLowerCase())) continue;
    seen.add(item.hash.toLowerCase());
    receipts.push(item);
  }
  return receipts.sort((a, b) => b.createdAt - a.createdAt);
}

function writeReceipts(receipts: WormholeExitReceipt[]): void {
  const store = storage();
  if (!store) return;
  store.setItem(WORMHOLE_EXIT_STORAGE_KEY, JSON.stringify(receipts.slice(0, MAX_RECEIPTS)));
}

/** Inserts or replaces the receipt with the same hash; returns the stored copy. */
export function saveWormholeExitReceipt(receipt: WormholeExitReceipt): WormholeExitReceipt {
  const copy: WormholeExitReceipt = JSON.parse(JSON.stringify(receipt));
  // Broadcast bytes are only needed while the outcome is open; drop them afterwards.
  if (copy.phase === "finalized" || copy.phase === "failed" || copy.phase === "expired") delete copy.bytes;
  const others = readWormholeExitReceipts().filter((item) => item.hash.toLowerCase() !== copy.hash.toLowerCase());
  writeReceipts([copy, ...others].sort((a, b) => b.createdAt - a.createdAt));
  return copy;
}

/** Receipts whose outcome is still open and that already claim one of `nullifiers`. */
export function findOpenWormholeExitReceipt(nullifiers: string[]): WormholeExitReceipt | undefined {
  const wanted = new Set(nullifiers.map((n) => n.toLowerCase()));
  return readWormholeExitReceipts().find((receipt) =>
    !["finalized", "failed", "expired"].includes(receipt.phase) &&
    receipt.nullifiers.some((n) => wanted.has(n.toLowerCase())));
}
