import { t } from "../i18n";
import type { WormholeExitProgress } from "./types";

/**
 * Bridge to the Wormhole exit prover (`vendor/quantus-wasm/browser-prover/`,
 * feature `wormhole-prover`). The prover runs in a dedicated Web Worker that is
 * created per proof and terminated afterwards; the phrase is posted to it once
 * and never comes back. Everything below mirrors the Rust request/response
 * shapes (`ExitRequest` / `ExitProof` in `src/prover.rs`).
 */

export interface WormholeProofInput {
  branch: 0 | 1;
  index: number;
  transferCount: string;
  leafIndex: string;
  amountPlanck: string;
  /** SCALE `ZkLeaf` bytes from `zkTree_getMerkleProof` (0x hex, 60 bytes). */
  leafData: string;
  leafHash: string;
  /** Unsorted sibling hashes per level, three per level (0x hex). */
  siblings: [string, string, string][];
}

export interface WormholeProofHeader {
  parentHash: string;
  number: number;
  stateRoot: string;
  extrinsicsRoot: string;
  zkTreeRoot: string;
  /** SCALE-encoded digest logs, exactly 110 bytes (0x hex). */
  digest: string;
  blockHash: string;
}

export interface WormholeProofRequest {
  inputs: WormholeProofInput[];
  header: WormholeProofHeader;
  treeRoot: string;
  exitAddress: string;
  volumeFeeBps: number;
  quantumPlanck: string;
}

export interface WormholeProofExit {
  account: string;
  amountQuanta: string;
  amountPlanck: string;
}

export interface WormholeProofResult {
  kind: "private-batch";
  proofHex: string;
  proofBytes: number;
  assetId: number;
  volumeFeeBps: number;
  blockNumber: number;
  blockHash: string;
  nullifiers: string[];
  inputNullifiers: string[];
  exits: WormholeProofExit[];
  inputQuanta: string;
  outputQuanta: string;
  numLeafProofs: number;
  circuitVersion: string;
  circuitDigest: string;
  publicInputs: string[];
}

export interface WormholeProverInfo {
  kind: "private-batch";
  circuitVersion: string;
  numLeafProofs: number;
  quantumPlanck: string;
  maxProofBytes: number;
  circuitDigest: string;
  verifierBlake2: string;
  commonBlake2: string;
}

/** Circuit constants of the compiled prover; the chain rules must agree with them. */
export const WORMHOLE_PROVER = Object.freeze({
  kind: "private-batch",
  circuitVersion: "4.3.0",
  numLeafProofs: 7,
  quantumPlanck: "10000000000",
  maxProofBytes: 512 * 1024,
  circuitDigest: "e912c68ce58e801247829313c4a0f9e12d6c24f501e617252de459b67b624549",
} as const);

export type WormholeProverStage = "leaf" | "circuit" | "prove" | "verify";

export type WormholeProverMessage =
  | { type: "progress"; stage: WormholeProverStage; done: number; total: number }
  | { type: "done"; result: WormholeProofResult; memoryBytes?: number }
  | { type: "error"; message: string };

/** Peak linear memory of the last worker proof, for diagnostics. */
export let lastWormholeProverMemoryBytes: number | undefined;

export interface WormholeProverRequestMessage {
  mnemonic: string;
  request: WormholeProofRequest;
}

/** A function that proves an exit; the worker bridge below is the default, tests may inject another. */
export type WormholeProver = (
  mnemonic: string,
  request: WormholeProofRequest,
  onProgress?: (stage: WormholeProverStage, done: number, total: number) => void,
  signal?: AbortSignal,
) => Promise<WormholeProofResult>;

/** Maps prover stages onto the exit progress the UI shows. */
export function proverProgress(stage: WormholeProverStage, done: number, total: number): WormholeExitProgress {
  switch (stage) {
    case "leaf": {
      const fraction = total > 0 ? Math.min(done, total) / total : 0;
      return { stage: "prove", percent: Math.round(5 + 35 * fraction), message: t("正在生成第 {0}/{1} 笔存款的证明…", Math.min(done + 1, total), total) };
    }
    case "circuit":
      return { stage: "circuit", percent: done >= total ? 50 : 42, message: t("正在构建聚合电路…") };
    case "prove":
      return { stage: "prove", percent: done >= total ? 90 : 55, message: t("正在生成零知识证明，可能需要几分钟…") };
    case "verify":
      return { stage: "verify", percent: done >= total ? 98 : 92, message: t("正在本地验证证明…") };
  }
}

/** Runs the prover in a disposable module Worker. */
export const proveWormholeExitInWorker: WormholeProver = (mnemonic, request, onProgress, signal) =>
  new Promise<WormholeProofResult>((resolve, reject) => {
    if (typeof Worker === "undefined") {
      reject(new Error(t("当前环境不支持后台证明线程。")));
      return;
    }
    const worker = new Worker(new URL("../../crypto/wormhole-prover.worker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = () => {
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      if (settled) return;
      finish();
      reject(new DOMException(t("已取消取回。"), "AbortError"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<WormholeProverMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress?.(message.stage, message.done, message.total);
        return;
      }
      finish();
      if (message.type === "done") {
        lastWormholeProverMemoryBytes = message.memoryBytes;
        resolve(message.result);
      } else reject(new Error(t("生成证明失败：{0}", message.message)));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (settled) return;
      finish();
      reject(new Error(t("无法加载证明组件，请刷新页面重试。")));
    };
    const payload: WormholeProverRequestMessage = { mnemonic, request };
    worker.postMessage(payload);
    payload.mnemonic = "";
  });
