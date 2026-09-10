import { ApiPromise, HttpProvider } from "@polkadot/api";
import type { EventRecord } from "@polkadot/types/interfaces";
import { compactToU8a, hexToU8a, u8aConcat, u8aToHex } from "@polkadot/util";
import { blake2AsHex, decodeAddress } from "@polkadot/util-crypto";
import { normalizeMnemonic, validateMnemonic } from "../../crypto";
import { MAINNET, validateAddress } from "../chain";
import { t } from "../i18n";
import {
  WORMHOLE_PROVER,
  proveWormholeExitInWorker,
  proverProgress,
  type WormholeProofInput,
  type WormholeProofRequest,
  type WormholeProofResult,
  type WormholeProver,
} from "./prover";
import { findOpenWormholeExitReceipt, readWormholeExitReceipts, saveWormholeExitReceipt } from "./receipts";
import type {
  WormholeDeposit,
  WormholeExitPhase,
  WormholeExitProgress,
  WormholeExitReceipt,
  WormholeExitSummary,
  WormholeRules,
} from "./types";

export { WORMHOLE_EXIT_STORAGE_KEY } from "./receipts";

/**
 * Withdrawal ("exit") of encrypted-account deposits.
 *
 * The browser builds a *private-batch* proof (`qp-wormhole-aggregator` 4.3.0,
 * up to 7 leaves) and submits it unsigned with `wormhole.verifyPrivateBatch`.
 * That is the client path the official tooling uses; the public-batch circuit
 * (53 inner private batches, `verifyPublicBatch`) needs ~10 GB while proving
 * and cannot run inside a 4 GiB wasm32 module, so its aggregator rebate is not
 * available here.
 *
 * Rules confirmed from `pallets/wormhole` at chain commit f5828f0 (runtime 152):
 * - amounts are committed in quanta of `SCALE_DOWN_FACTOR = 10^10` planck
 *   (equal to `Vesting.PayoutQuantum`); the remainder of a deposit below one
 *   quantum can never be withdrawn;
 * - the circuit enforces `out · 10000 ≤ in · (10000 − bps)` once per private
 *   segment, so the optimum is `floor(Σin · 9996 / 10000)` quanta for 4 bps;
 * - the pallet settles `fee = ceil(out · bps / (10000 − bps))` quanta, burns
 *   `ceil(burnRate · fee)` and mints the rest to the block author; the
 *   aggregator rebate (`VolumeFeesAggregatorRate` of the burn bucket) exists
 *   only for public batches;
 * - the proof references a block by (number, hash); it is accepted while that
 *   hash is still in `System.BlockHash`, i.e. for `BlockHashCount` blocks;
 * - the transaction pool keeps the unsigned exit for 5 blocks (`longevity`),
 *   so tracking re-broadcasts the identical bytes if they were dropped;
 * - a mint that fails (below the existential deposit) burns the nullifiers
 *   (`ExitMintFailed`), so the net amount must stay above the deposit.
 */

/** At most this many deposits go into one proof. */
export const WORMHOLE_EXIT_MAX_INPUTS = 7;
/** Web Locks name that serializes broadcasts across tabs. */
export const WORMHOLE_EXIT_LOCK = "quantus-wallet-wormhole-exit";

export interface WormholeExitEndpoint {
  rpcUrl: string;
  genesisHash: string;
  specVersion: number;
  transactionVersion: number;
}

/** Mainnet RPC; the only endpoint used unless a caller passes an isolated dev chain. */
export const MAINNET_EXIT_ENDPOINT: WormholeExitEndpoint = Object.freeze({
  rpcUrl: MAINNET.rpcUrl,
  genesisHash: MAINNET.genesisHash,
  specVersion: MAINNET.specVersion,
  transactionVersion: MAINNET.transactionVersion,
});

export interface WormholeExitOptions {
  /** Seed phrase of the official wallet whose encrypted account owns the deposits. */
  mnemonic: string;
  deposits: WormholeDeposit[];
  /** Account that receives the net amount and the aggregator rebate. */
  exitAddress: string;
  onProgress?: (progress: WormholeExitProgress) => void;
  signal?: AbortSignal;
  /** Chain to use; defaults to mainnet. Tests pass the local dev chain. */
  endpoint?: WormholeExitEndpoint;
  /** Prover implementation; defaults to the Web Worker bridge. */
  prover?: WormholeProver;
  /** Tracking options after the broadcast. */
  track?: WormholeTrackOptions;
}

export interface WormholeTrackOptions {
  endpoint?: WormholeExitEndpoint;
  pollIntervalMs?: number;
  /** Give up waiting (phase `unknown`) after this long; the receipt can be tracked again later. */
  timeoutMs?: number;
  /** Re-broadcast the stored bytes when the pool dropped them (default true). */
  resubmit?: boolean;
}

const HEX_32 = /^0x[\da-f]{64}$/i;
const QUANTUM = BigInt(WORMHOLE_PROVER.quantumPlanck);
const BPS_DENOMINATOR = 10_000n;
const PPM = 1_000_000n;
const DIGEST_LOGS_SIZE = 110;
/** `TransactionSource::External` for `TaggedTransactionQueue_validate_transaction`. */
const TRANSACTION_SOURCE_EXTERNAL = 2;
/** `ValidTransaction.longevity` of wormhole exits in the pool. */
const POOL_LONGEVITY_BLOCKS = 5;
const MAX_RESUBMITS = 20;

class RpcRejection extends Error {}

interface RpcHeader {
  parentHash: string;
  number: string;
  stateRoot: string;
  extrinsicsRoot: string;
  zkTreeRoot: string;
  digest: { logs: string[] };
}
interface RuntimeVersion { specVersion: number; transactionVersion: number }
interface RawBlock { block: { header: RpcHeader; extrinsics: string[] } }
type ByteArray = number[] | string;
interface RpcMerkleProof {
  leaf_index: number | string;
  leaf_data: ByteArray;
  leaf_hash: ByteArray;
  siblings: [ByteArray, ByteArray, ByteArray][];
  root: ByteArray;
  depth: number;
}

function hash32(value: unknown, invalid = t("服务返回了无效的区块或交易哈希。")): string {
  if (typeof value !== "string" || !HEX_32.test(value)) throw new Error(invalid);
  return value.toLowerCase();
}

function safeInteger(value: unknown, invalid: string): number {
  const number = typeof value === "string" && /^(0x[\da-f]+|\d+)$/i.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) throw new Error(invalid);
  return number;
}

function decimal(value: unknown, invalid: string): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error(invalid);
  return BigInt(value);
}

function bytesHex(value: ByteArray, invalid: string): string {
  if (typeof value === "string") {
    if (!/^0x(?:[\da-f]{2})*$/i.test(value)) throw new Error(invalid);
    return value.toLowerCase();
  }
  if (!Array.isArray(value) || value.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) throw new Error(invalid);
  return u8aToHex(Uint8Array.from(value));
}

function aborted(): DOMException {
  return new DOMException(t("已取消取回。"), "AbortError");
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    const onAbort = () => { clearTimeout(timer); reject(aborted()); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** `ceil(a · ppm / 10^6)` — `Permill::mul_ceil`. */
function ppmCeil(value: bigint, ppm: bigint): bigint {
  return (value * ppm + PPM - 1n) / PPM;
}

interface ExitClient {
  endpoint: WormholeExitEndpoint;
  rpc<T>(method: string, params?: unknown[], signal?: AbortSignal): Promise<T>;
  api(): Promise<ApiPromise>;
}

const clients = new Map<string, ExitClient>();

function clientFor(endpoint: WormholeExitEndpoint): ExitClient {
  const key = `${endpoint.rpcUrl}|${endpoint.genesisHash.toLowerCase()}`;
  const existing = clients.get(key);
  if (existing) return existing;
  let requestId = 0;
  let apiPromise: Promise<ApiPromise> | undefined;
  const client: ExitClient = {
    endpoint,
    async rpc<T>(method: string, params: unknown[] = [], signal?: AbortSignal): Promise<T> {
      const id = ++requestId;
      const timeout = AbortSignal.timeout(30_000);
      const response = await fetch(endpoint.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(t("网络服务暂不可用（HTTP {0}）。", response.status));
      const reply = await response.json() as { id: number; result?: T; error?: { message?: string } };
      if (reply.id !== id) throw new Error(t("RPC 响应编号不匹配。"));
      if (reply.error) throw new RpcRejection(reply.error.message || t("节点拒绝了请求。"));
      if (!Object.prototype.hasOwnProperty.call(reply, "result")) throw new Error(t("RPC 响应不完整。"));
      return reply.result as T;
    },
    api(): Promise<ApiPromise> {
      apiPromise ??= ApiPromise.create({
        provider: new HttpProvider(endpoint.rpcUrl),
        noInitWarn: true,
        throwOnConnect: true,
        types: { U512: "[u8;64]" },
      }).then(async (api) => {
        if (api.genesisHash.toHex().toLowerCase() !== endpoint.genesisHash.toLowerCase()) {
          await api.disconnect();
          throw new Error(t("RPC 网络不匹配，已停止操作。"));
        }
        return api;
      }).catch((error: unknown) => { apiPromise = undefined; throw error; });
      return apiPromise;
    },
  };
  clients.set(key, client);
  return client;
}

/** Closes cached API connections (tests). */
export async function disconnectWormholeExitClients(): Promise<void> {
  const pending = [...clients.values()];
  clients.clear();
  await Promise.all(pending.map(async (client) => {
    try { await (await client.api()).disconnect(); } catch { /* not connected */ }
  }));
}

async function assertRuntime(client: ExitClient, signal?: AbortSignal): Promise<RuntimeVersion> {
  const [genesis, version] = await Promise.all([
    client.rpc<string>("chain_getBlockHash", [0], signal),
    client.rpc<RuntimeVersion>("state_getRuntimeVersion", [], signal),
  ]);
  if (hash32(genesis) !== client.endpoint.genesisHash.toLowerCase()) throw new Error(t("RPC 网络不匹配，已停止操作。"));
  const specVersion = safeInteger(version.specVersion, t("运行时版本 无效。"));
  const transactionVersion = safeInteger(version.transactionVersion, t("交易版本 无效。"));
  // The circuit and call encoding are pinned to one runtime; refuse anything else.
  if (specVersion !== client.endpoint.specVersion || transactionVersion !== client.endpoint.transactionVersion) {
    throw new Error(t("运行时已变更（{0}/{1}），取回功能需要更新后才能使用。", specVersion, transactionVersion));
  }
  return { specVersion, transactionVersion };
}

/** Reads the current fee, quantum, expiry and runtime rules from the chain. */
export async function readWormholeRules(endpoint: WormholeExitEndpoint = MAINNET_EXIT_ENDPOINT): Promise<WormholeRules> {
  const client = clientFor(endpoint);
  const [version, api] = await Promise.all([assertRuntime(client), client.api()]);
  const wormhole = api.consts.wormhole as Record<string, { toString(): string }> | undefined;
  if (!wormhole?.volumeFeeRateBps || !wormhole.volumeFeesBurnRate || !wormhole.volumeFeesAggregatorRate ||
      !findExitCall(api) || !api.query.wormhole?.usedNullifiers) {
    throw new Error(t("当前网络不支持加密账户取回。"));
  }
  const volumeFeeBps = safeInteger(Number(wormhole.volumeFeeRateBps.toString()), t("费率 无效。"));
  const burnRatePpm = safeInteger(Number(wormhole.volumeFeesBurnRate.toString()), t("费率 无效。"));
  const aggregatorRatePpm = safeInteger(Number(wormhole.volumeFeesAggregatorRate.toString()), t("费率 无效。"));
  const quantumPlanck = decimal(api.consts.vesting?.payoutQuantum?.toString(), t("金额单位 无效。"));
  const blockHashCount = safeInteger(Number(api.consts.system.blockHashCount.toString()), t("区块有效期 无效。"));
  const existentialDepositPlanck = decimal(api.consts.balances.existentialDeposit.toString(), t("最低余额 无效。"));
  if (quantumPlanck !== QUANTUM) throw new Error(t("链上金额单位与证明电路不一致，已停止取回。"));
  if (volumeFeeBps >= 10_000 || burnRatePpm > 1_000_000 || aggregatorRatePpm > 1_000_000 || blockHashCount === 0) {
    throw new Error(t("链上取回参数超出预期范围，已停止取回。"));
  }
  return {
    specVersion: version.specVersion,
    transactionVersion: version.transactionVersion,
    genesisHash: endpoint.genesisHash.toLowerCase(),
    volumeFeeBps,
    aggregatorRatePpm,
    quantumPlanck: quantumPlanck.toString(),
    blockHashCount,
    existentialDepositPlanck: existentialDepositPlanck.toString(),
    burnRatePpm,
    batchKind: "private-batch",
    rpcUrl: endpoint.rpcUrl,
  };
}

function checkDeposits(deposits: WormholeDeposit[]): void {
  if (!deposits.length) throw new Error(t("请至少选择一笔存款。"));
  if (deposits.length > WORMHOLE_EXIT_MAX_INPUTS) throw new Error(t("一次最多取回 {0} 笔存款。", WORMHOLE_EXIT_MAX_INPUTS));
  const ids = new Set<string>();
  const nullifiers = new Set<string>();
  for (const deposit of deposits) {
    if (deposit.spent) throw new Error(t("所选存款中有已花费的记录。"));
    if ((deposit.branch !== 0 && deposit.branch !== 1) || !Number.isSafeInteger(deposit.index) || deposit.index < 0) {
      throw new Error(t("存款派生信息无效。"));
    }
    decimal(deposit.amountPlanck, t("存款金额 无效。"));
    decimal(deposit.leafIndex, t("存款叶子序号 无效。"));
    decimal(deposit.transferCount, t("存款计数 无效。"));
    if (!HEX_32.test(deposit.nullifier)) throw new Error(t("存款作废标识无效。"));
    if (ids.has(deposit.id) || nullifiers.has(deposit.nullifier.toLowerCase())) throw new Error(t("存款重复选择。"));
    ids.add(deposit.id);
    nullifiers.add(deposit.nullifier.toLowerCase());
    validateAddress(deposit.address);
  }
}

/** Fee and rounding preview for a selection; pure and synchronous. */
export function summarizeWormholeExit(deposits: WormholeDeposit[], rules: WormholeRules): WormholeExitSummary {
  checkDeposits(deposits);
  const quantum = decimal(rules.quantumPlanck, t("金额单位 无效。"));
  if (quantum <= 0n || rules.volumeFeeBps < 0 || rules.volumeFeeBps >= 10_000) throw new Error(t("链上取回参数超出预期范围，已停止取回。"));
  const bps = BigInt(rules.volumeFeeBps);
  let inputPlanck = 0n;
  let inputQuanta = 0n;
  for (const deposit of deposits) {
    const amount = BigInt(deposit.amountPlanck);
    inputPlanck += amount;
    inputQuanta += amount / quantum;
  }
  const quantizedPlanck = inputQuanta * quantum;
  const outputQuanta = (inputQuanta * (BPS_DENOMINATOR - bps)) / BPS_DENOMINATOR;
  const netPlanck = outputQuanta * quantum;
  // What the pallet books as fee on the minted amount (never more than the gap the circuit locks).
  const settledFeeQuanta = outputQuanta === 0n ? 0n : (outputQuanta * bps + (BPS_DENOMINATOR - bps) - 1n) / (BPS_DENOMINATOR - bps);
  return {
    deposits,
    inputPlanck: inputPlanck.toString(),
    quantizedPlanck: quantizedPlanck.toString(),
    dustPlanck: (inputPlanck - quantizedPlanck).toString(),
    feePlanck: (quantizedPlanck - netPlanck).toString(),
    // Only public batches proved by an aggregator earn the rebate; the browser proves private batches.
    rebatePlanck: "0",
    netPlanck: netPlanck.toString(),
    settledFeePlanck: (settledFeeQuanta * quantum).toString(),
  };
}

/** SCALE `Digest` (compact length + items) padded to the fixed 110-byte hash window. */
export function encodeHeaderDigest(logs: string[]): string {
  const encoded = u8aConcat(compactToU8a(logs.length), ...logs.map((log) => hexToU8a(log)));
  const window = new Uint8Array(DIGEST_LOGS_SIZE);
  window.set(encoded.subarray(0, DIGEST_LOGS_SIZE));
  return u8aToHex(window);
}

interface MerkleProofData {
  leafData: string;
  leafHash: string;
  siblings: [string, string, string][];
  root: string;
  depth: number;
}

function parseMerkleProof(raw: RpcMerkleProof | null, leafIndex: string): MerkleProofData {
  const invalid = t("节点返回的存款证明数据无效。");
  if (!raw || typeof raw !== "object") throw new Error(t("节点没有该存款的证明数据，请稍后重试。"));
  if (String(safeInteger(raw.leaf_index, invalid)) !== leafIndex) throw new Error(invalid);
  const depth = safeInteger(raw.depth, invalid);
  if (!Array.isArray(raw.siblings) || raw.siblings.length !== depth || depth > 16) throw new Error(invalid);
  const siblings = raw.siblings.map((level): [string, string, string] => {
    if (!Array.isArray(level) || level.length !== 3) throw new Error(invalid);
    return [bytesHex(level[0], invalid), bytesHex(level[1], invalid), bytesHex(level[2], invalid)];
  });
  const leafData = bytesHex(raw.leaf_data, invalid);
  if (leafData.length !== 2 + 60 * 2) throw new Error(invalid);
  return { leafData, leafHash: hash32(bytesHex(raw.leaf_hash, invalid), invalid), siblings, root: hash32(bytesHex(raw.root, invalid), invalid), depth };
}

function decodeLeaf(leafData: string): { to: string; transferCount: bigint; assetId: number; amount: bigint } {
  const bytes = hexToU8a(leafData);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    to: u8aToHex(bytes.subarray(0, 32)),
    transferCount: view.getBigUint64(32, true),
    assetId: view.getUint32(40, true),
    amount: view.getBigUint64(44, true) | (view.getBigUint64(52, true) << 64n),
  };
}

function accountHex(address: string): string {
  return u8aToHex(decodeAddress(address, false, MAINNET.ss58Prefix));
}

/** Metadata of `wormhole.verify_private_batch`, or undefined when the runtime lacks it. */
function findExitCall(api: ApiPromise): { palletIndex: number; callIndex: number } | undefined {
  const pallet = api.registry.metadata.pallets.find((p) => p.name.toString() === "Wormhole");
  const calls = pallet?.calls.isSome ? pallet.calls.unwrap() : undefined;
  const variant = calls && api.registry.lookup.getSiType(calls.type).def.asVariant.variants
    .find((v) => v.name.toString() === "verify_private_batch");
  if (!pallet || !variant) return undefined;
  const fields = variant.fields;
  if (fields.length !== 1 || fields[0].name.unwrapOr("").toString() !== "proof_bytes") return undefined;
  return { palletIndex: pallet.index.toNumber(), callIndex: variant.index.toNumber() };
}

/**
 * Unsigned v4 extrinsic `wormhole.verify_private_batch(proof_bytes)`, built by hand
 * because polkadot.js cannot instantiate Quantus's 7,219-byte signature type. The
 * encoding is checked byte for byte against the metadata-driven `Call` codec.
 */
export function encodeWormholeExitExtrinsic(api: ApiPromise, proofHex: string): { txHex: string; hash: string; callHex: string } {
  const target = findExitCall(api);
  if (!target) throw new Error(t("当前网络不支持加密账户取回。"));
  if (!/^0x(?:[\da-f]{2})+$/i.test(proofHex)) throw new Error(t("交易编码与证明不一致，已停止。"));
  const proof = hexToU8a(proofHex);
  const callBytes = u8aConcat(new Uint8Array([target.palletIndex, target.callIndex]), compactToU8a(proof.length), proof);
  const viaCodec = api.registry.createType("Call", { callIndex: new Uint8Array([target.palletIndex, target.callIndex]), args: [proofHex] });
  if (u8aToHex(viaCodec.toU8a()) !== u8aToHex(callBytes)) throw new Error(t("交易编码与证明不一致，已停止。"));
  // Bare (unsigned) extrinsic: compact length, version byte 4 without the signed bit, call.
  const body = u8aConcat(new Uint8Array([4]), callBytes);
  const txBytes = u8aConcat(compactToU8a(body.length), body);
  return { txHex: u8aToHex(txBytes), hash: blake2AsHex(txBytes).toLowerCase(), callHex: u8aToHex(callBytes) };
}

/** Decodes `TransactionValidity` returned by `TaggedTransactionQueue_validate_transaction`. */
export function decodeTransactionValidity(hex: string): { valid: true } | { valid: false; reason: string } {
  const bytes = hexToU8a(hex);
  if (bytes[0] === 0) return { valid: true };
  if (bytes[0] !== 1) throw new Error(t("节点返回了无法解析的预检结果。"));
  const invalidNames = ["Call", "Payment", "Future", "Stale", "BadProof", "AncientBirthBlock", "ExhaustsResources", "Custom", "BadMandatory", "MandatoryValidation", "BadSigner", "IndeterminateImplicit", "UnknownOrigin"];
  const unknownNames = ["CannotLookup", "NoUnsignedValidator", "Custom"];
  if (bytes[1] === 0) {
    const name = invalidNames[bytes[2]] ?? `Invalid(${bytes[2]})`;
    return { valid: false, reason: name === "Custom" ? `Invalid.Custom(${bytes[3]})` : `Invalid.${name}` };
  }
  const name = unknownNames[bytes[2]] ?? `Unknown(${bytes[2]})`;
  return { valid: false, reason: name === "Custom" ? `Unknown.Custom(${bytes[3]})` : `Unknown.${name}` };
}

function explainValidity(reason: string): string {
  // `validate_unsigned` maps every pre-validation failure (proof shape, block reference,
  // spent nullifiers, fee rate) to `InvalidTransaction::Call`.
  if (reason === "Invalid.Call") return t("节点预检拒绝了证明（证明格式、区块引用或存款状态无效），未广播。");
  return t("节点预检拒绝了交易（{0}），未广播。", reason);
}

async function withLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return task();
  return locks.request(name, { mode: "exclusive" }, task);
}

function receiptMessage(phase: WormholeExitPhase, detail?: string): string {
  switch (phase) {
    case "preparing": return t("正在准备取回…");
    case "proving": return t("正在生成证明…");
    case "submitting": return t("正在广播取回交易…");
    case "submitted": return detail ?? t("已广播，等待打包。");
    case "included": return detail ?? t("已打包，等待最终确认。");
    case "finalized": return detail ?? t("取回已最终确认。");
    case "failed": return detail ?? t("取回失败。");
    case "unknown": return detail ?? t("取回状态未知，请稍后继续查询。");
    case "expired": return detail ?? t("证明引用的区块已过期，交易未被打包；存款未花费，可以重新取回。");
  }
}

/**
 * Builds and verifies the proof locally, broadcasts once, and returns the
 * receipt. Rejects before broadcasting on any rule mismatch.
 */
export async function withdrawWormhole(options: WormholeExitOptions): Promise<WormholeExitReceipt> {
  const { deposits, signal, onProgress } = options;
  const endpoint = options.endpoint ?? MAINNET_EXIT_ENDPOINT;
  const prover = options.prover ?? proveWormholeExitInWorker;
  const progress = (update: WormholeExitProgress) => {
    if (signal?.aborted) throw aborted();
    onProgress?.(update);
  };
  const mnemonic = normalizeMnemonic(options.mnemonic);
  if (!validateMnemonic(mnemonic)) throw new Error(t("助记词无效，请检查单词、顺序和数量"));
  const exitAddress = validateAddress(options.exitAddress);
  checkDeposits(deposits);
  const nullifiers = deposits.map((deposit) => deposit.nullifier.toLowerCase());
  const open = findOpenWormholeExitReceipt(nullifiers);
  if (open) throw new Error(t("这些存款已有进行中的取回（交易 {0}），请先查询其结果。", open.hash));

  progress({ stage: "rules", percent: 1, message: t("正在读取链上规则…") });
  const client = clientFor(endpoint);
  const rules = await readWormholeRules(endpoint);
  const summary = summarizeWormholeExit(deposits, rules);
  const net = BigInt(summary.netPlanck);
  if (net === 0n) throw new Error(t("所选存款扣除费用和零头后没有可取回的金额。"));
  if (net < BigInt(rules.existentialDepositPlanck)) throw new Error(t("取回金额低于账户最低余额，交易会失败并作废存款。"));
  const api = await client.api();

  progress({ stage: "merkle", percent: 2, message: t("正在核对存款状态…") });
  const used = await Promise.all(deposits.map((deposit) => api.query.wormhole.usedNullifiers(deposit.nullifier)));
  const spent = deposits.filter((_, i) => {
    const value = used[i] as unknown as { isTrue?: boolean; isSome?: boolean; toString(): string };
    return value.isTrue === true || (value.isSome === true) || value.toString() === "true";
  });
  if (spent.length) throw new Error(t("存款已在链上花费：{0}", spent.map((d) => d.id).join(", ")));

  // Proof against the finalized head: its hash cannot change under us and stays in
  // `System.BlockHash` for `BlockHashCount` blocks.
  const finalizedHash = hash32(await client.rpc<string>("chain_getFinalizedHead", [], signal));
  const header = await client.rpc<RpcHeader>("chain_getHeader", [finalizedHash], signal);
  const blockNumber = safeInteger(header.number, t("区块高度 无效。"));
  if (blockNumber > 0xffff_ffff) throw new Error(t("区块高度超出电路范围。"));
  if (hash32(await client.rpc<string>("chain_getBlockHash", [blockNumber], signal)) !== finalizedHash) {
    throw new Error(t("最终确认区块与主链不一致，请重试。"));
  }
  if (!Array.isArray(header.digest?.logs) || header.digest.logs.some((log) => typeof log !== "string" || !/^0x(?:[\da-f]{2})*$/i.test(log))) {
    throw new Error(t("区块头格式无效。"));
  }
  const proofHeader = {
    parentHash: hash32(header.parentHash),
    number: blockNumber,
    stateRoot: hash32(header.stateRoot),
    extrinsicsRoot: hash32(header.extrinsicsRoot),
    zkTreeRoot: hash32(header.zkTreeRoot, t("区块头缺少零知识树根。")),
    digest: encodeHeaderDigest(header.digest.logs),
    blockHash: finalizedHash,
  };

  progress({ stage: "merkle", percent: 3, message: t("正在获取存款的默克尔证明…") });
  const inputs: WormholeProofInput[] = [];
  for (const deposit of deposits) {
    const raw = await client.rpc<RpcMerkleProof | null>("zkTree_getMerkleProof", [Number(deposit.leafIndex), finalizedHash], signal);
    const proof = parseMerkleProof(raw, deposit.leafIndex);
    if (proof.root !== proofHeader.zkTreeRoot) throw new Error(t("存款证明的树根与区块头不一致，请重试。"));
    const leaf = decodeLeaf(proof.leafData);
    if (leaf.to !== accountHex(deposit.address) || leaf.transferCount !== BigInt(deposit.transferCount) ||
        leaf.assetId !== 0 || leaf.amount !== BigInt(deposit.amountPlanck)) {
      throw new Error(t("链上叶子数据与存款记录不一致：{0}", deposit.id));
    }
    inputs.push({
      branch: deposit.branch, index: deposit.index, transferCount: deposit.transferCount, leafIndex: deposit.leafIndex,
      amountPlanck: deposit.amountPlanck, leafData: proof.leafData, leafHash: proof.leafHash, siblings: proof.siblings,
    });
  }
  const request: WormholeProofRequest = {
    inputs, header: proofHeader, treeRoot: proofHeader.zkTreeRoot, exitAddress,
    volumeFeeBps: rules.volumeFeeBps, quantumPlanck: rules.quantumPlanck,
  };

  progress({ stage: "circuit", percent: 5, message: t("正在启动证明组件…") });
  const result = await prover(mnemonic, request, (stage, done, total) => progress(proverProgress(stage, done, total)), signal);
  checkProof(result, request, summary, deposits);

  progress({ stage: "submit", percent: 99, message: t("正在编码并预检交易…") });
  const { txHex, hash } = encodeWormholeExitExtrinsic(api, result.proofHex);
  const bestHash = hash32(await client.rpc<string>("chain_getBlockHash", [], signal));
  const validity = decodeTransactionValidity(await client.rpc<string>("state_call", [
    "TaggedTransactionQueue_validate_transaction",
    u8aToHex(u8aConcat(new Uint8Array([TRANSACTION_SOURCE_EXTERNAL]), hexToU8a(txHex), hexToU8a(bestHash))),
    bestHash,
  ], signal));
  if (!validity.valid) throw new Error(explainValidity(validity.reason));

  const receipt = await withLock(WORMHOLE_EXIT_LOCK, async () => {
    if (signal?.aborted) throw aborted();
    const raced = findOpenWormholeExitReceipt(nullifiers);
    if (raced) throw new Error(t("这些存款已有进行中的取回（交易 {0}），请先查询其结果。", raced.hash));
    // The pending receipt is written before the broadcast so a reload can only resume, never resend.
    let pending = saveWormholeExitReceipt({
      version: 1, hash: hash.toLowerCase(), bytes: txHex, exitAddress, nullifiers, depositIds: deposits.map((d) => d.id),
      inputPlanck: summary.inputPlanck, feePlanck: summary.feePlanck, netPlanck: summary.netPlanck,
      proofBlock: blockNumber, proofBlockHash: finalizedHash, expiresAt: blockNumber + rules.blockHashCount,
      phase: "submitting", message: receiptMessage("submitting"), createdAt: Date.now(), endpoint: endpoint.rpcUrl,
      resubmits: 0, proofBytes: result.proofBytes,
    });
    try {
      const returned = hash32(await client.rpc<string>("author_submitExtrinsic", [txHex]));
      if (returned !== hash.toLowerCase()) {
        pending = saveWormholeExitReceipt({ ...pending, phase: "unknown", message: t("节点返回的交易哈希与本地不一致，请查询状态后再操作。") });
        return pending;
      }
      pending = saveWormholeExitReceipt({ ...pending, phase: "submitted", message: receiptMessage("submitted") });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("提交交易时连接中断。");
      if (error instanceof RpcRejection && !/already\s+(?:imported|known|in\s+the\s+pool)/i.test(message)) {
        pending = saveWormholeExitReceipt({ ...pending, phase: "failed", message: t("节点拒绝了取回交易：{0}", message) });
        throw new Error(pending.message);
      }
      // Transport failure after the node may have accepted it: keep the bytes and track.
      pending = saveWormholeExitReceipt({ ...pending, phase: "unknown", message: t("{0} 正在查询交易状态，请勿重复取回。", message) });
    }
    return pending;
  });
  if (receipt.phase === "failed") throw new Error(receipt.message);
  progress({ stage: "track", percent: 100, message: receipt.message });
  return trackWormholeExit(receipt, (update) => progress({ stage: "track", percent: 100, message: update.message }), signal,
    { endpoint, ...options.track });
}

function checkProof(result: WormholeProofResult, request: WormholeProofRequest, summary: WormholeExitSummary, deposits: WormholeDeposit[]): void {
  const exitHex = accountHex(request.exitAddress);
  const mismatch = () => new Error(t("证明的公开输入与请求不一致，已停止。"));
  if (result.kind !== "private-batch" || result.assetId !== 0 || result.volumeFeeBps !== request.volumeFeeBps ||
      result.blockNumber !== request.header.number || result.blockHash.toLowerCase() !== request.header.blockHash ||
      result.circuitDigest !== WORMHOLE_PROVER.circuitDigest || result.numLeafProofs !== WORMHOLE_PROVER.numLeafProofs ||
      !/^0x(?:[\da-f]{2})+$/i.test(result.proofHex) || result.proofBytes !== (result.proofHex.length - 2) / 2 ||
      result.proofBytes > WORMHOLE_PROVER.maxProofBytes) throw mismatch();
  if (result.exits.length !== 1 || result.exits[0].account.toLowerCase() !== exitHex || result.exits[0].amountPlanck !== summary.netPlanck ||
      BigInt(result.outputQuanta) * QUANTUM !== BigInt(summary.netPlanck) || BigInt(result.inputQuanta) * QUANTUM !== BigInt(summary.quantizedPlanck)) throw mismatch();
  const published = new Set(result.nullifiers.map((n) => n.toLowerCase()));
  const proved = new Set(result.inputNullifiers.map((n) => n.toLowerCase()));
  // The scanner's nullifiers and the prover's must agree, or the wrong deposit would be marked spent.
  for (const deposit of deposits) {
    const nullifier = deposit.nullifier.toLowerCase();
    if (!proved.has(nullifier) || !published.has(nullifier)) throw new Error(t("证明的作废标识与扫描结果不一致，已停止。"));
  }
}

interface Outcome { failed: boolean; message: string; denied?: string[] }

async function extrinsicOutcome(api: ApiPromise, blockHash: string, extrinsicIndex: number, receipt: WormholeExitReceipt): Promise<Outcome> {
  const at = await api.at(blockHash);
  const events = (await at.query.system.events() as unknown as EventRecord[])
    .filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === extrinsicIndex);
  const result = events.find(({ event }) => event.section === "system" && (event.method === "ExtrinsicSuccess" || event.method === "ExtrinsicFailed"));
  if (!result) throw new Error(t("已找到交易，但尚未确认执行结果。"));
  if (result.event.method === "ExtrinsicFailed") {
    const dispatch = result.event.data[0] as unknown as { isModule: boolean; asModule: Parameters<typeof at.registry.findMetaError>[0]; toString(): string };
    let error = dispatch.toString();
    if (dispatch.isModule) {
      const meta = at.registry.findMetaError(dispatch.asModule);
      error = `${meta.section}.${meta.name}: ${meta.docs.join(" ")}`;
    }
    return { failed: true, message: t("取回交易执行失败：{0}", error) };
  }
  const wormhole = events.filter(({ event }) => event.section === "wormhole");
  const denied = wormhole.find(({ event }) => event.method === "SegmentsDenied");
  const mintFailed = wormhole.find(({ event }) => event.method === "ExitMintFailed");
  const verified = wormhole.find(({ event }) => event.method === "ProofVerified");
  if (denied) return { failed: true, denied: receipt.nullifiers, message: t("链上拒绝了该批次：存款已被其他证明花费。") };
  if (mintFailed) return { failed: true, denied: receipt.nullifiers, message: t("取回金额无法入账（低于最低余额），存款作废标识已被消耗。") };
  if (!verified) return { failed: true, message: t("交易成功但没有取回事件，请人工核对。") };
  const data = verified.event.data as unknown as { toJSON(): unknown }[];
  const published = (data[1]?.toJSON() as string[] | undefined)?.map((n) => String(n).toLowerCase()) ?? [];
  const missing = receipt.nullifiers.filter((n) => !published.includes(n.toLowerCase()));
  if (missing.length) return { failed: true, message: t("交易成功但作废标识不匹配，请人工核对。") };
  const amount = data[0]?.toJSON();
  const exitAmount = typeof amount === "number" || typeof amount === "string" ? BigInt(amount) : undefined;
  if (exitAmount !== undefined && exitAmount !== BigInt(receipt.netPlanck)) {
    return { failed: false, message: t("已入账 {0} planck（与预估 {1} 不同）。", exitAmount.toString(), receipt.netPlanck) };
  }
  return { failed: false, message: t("已入账 {0} planck。", receipt.netPlanck) };
}

/** Follows a receipt to inclusion and finality, updating its phase. */
export async function trackWormholeExit(
  receipt: WormholeExitReceipt,
  onUpdate: (receipt: WormholeExitReceipt) => void,
  signal?: AbortSignal,
  options: WormholeTrackOptions = {},
): Promise<WormholeExitReceipt> {
  const endpoint = options.endpoint ?? MAINNET_EXIT_ENDPOINT;
  const { pollIntervalMs = 4_000, timeoutMs = 20 * 60_000, resubmit = true } = options;
  let current: WormholeExitReceipt = { ...receipt };
  const emit = (patch: Partial<WormholeExitReceipt>): WormholeExitReceipt => {
    const next = { ...current, ...patch };
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      current = saveWormholeExitReceipt(next);
      onUpdate(current);
    }
    return current;
  };
  if (receipt.endpoint !== endpoint.rpcUrl) return emit({ phase: "unknown", message: t("该记录属于其他网络端点，无法在当前网络查询。") });
  if (current.phase === "finalized" || current.phase === "failed" || current.phase === "expired") return current;
  const client = clientFor(endpoint);
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const cache = new Map<number, { blockHash: string; outcome?: Outcome; index?: number }>();
  let scannedThrough: { block: number; blockHash: string } | undefined;
  let finalizedScanned = current.proofBlock;
  let inclusion: { block: number; blockHash: string; outcome: Outcome } | undefined;
  let lastSubmitHeight = current.proofBlock;
  let lastError: string | undefined;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw aborted();
    try {
      const api = await client.api();
      const [head, finalizedHash] = await Promise.all([
        client.rpc<RpcHeader>("chain_getHeader", [], signal), client.rpc<string>("chain_getFinalizedHead", [], signal),
      ]);
      const finalizedHeader = await client.rpc<RpcHeader>("chain_getHeader", [hash32(finalizedHash)], signal);
      const height = safeInteger(head.number, t("区块高度 无效。"));
      const finalizedHeight = safeInteger(finalizedHeader.number, t("最终确认高度 无效。"));
      if (inclusion) {
        const canonical = await client.rpc<string>("chain_getBlockHash", [inclusion.block], signal);
        if (canonical !== inclusion.blockHash) {
          emit({ phase: "submitted", includedHeight: undefined, includedHash: undefined, message: t("打包区块已被回滚，继续等待。") });
          inclusion = undefined;
          scannedThrough = undefined;
        } else if (inclusion.block <= finalizedHeight) {
          return emit({
            phase: inclusion.outcome.failed ? "failed" : "finalized", finalizedHeight: inclusion.block,
            deniedNullifiers: inclusion.outcome.denied, message: inclusion.outcome.message,
          });
        } else {
          emit({ phase: "included", includedHeight: inclusion.block, includedHash: inclusion.blockHash, message: t("{0} 等待最终确认。", inclusion.outcome.message) });
          await pause(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())), signal);
          continue;
        }
      }
      let nextBlock = Math.max(current.proofBlock + 1, finalizedScanned + 1);
      if (scannedThrough && await client.rpc<string>("chain_getBlockHash", [scannedThrough.block], signal) === scannedThrough.blockHash) {
        nextBlock = scannedThrough.block + 1;
        finalizedScanned = Math.max(finalizedScanned, Math.min(finalizedHeight, scannedThrough.block));
      }
      for (let number = nextBlock; number <= height; number++) {
        if (signal?.aborted) throw aborted();
        const blockHash = hash32(await client.rpc<string>("chain_getBlockHash", [number], signal));
        let entry = cache.get(number);
        if (entry?.blockHash !== blockHash) {
          const block = await client.rpc<RawBlock>("chain_getBlock", [blockHash], signal);
          const index = block.block.extrinsics.findIndex((bytes) => blake2AsHex(hexToU8a(bytes)).toLowerCase() === current.hash.toLowerCase());
          entry = { blockHash };
          if (index >= 0) entry.outcome = await extrinsicOutcome(api, blockHash, index, current);
          cache.set(number, entry);
        }
        scannedThrough = { block: number, blockHash };
        if (entry.outcome) {
          inclusion = { block: number, blockHash, outcome: entry.outcome };
          if (number <= finalizedHeight) {
            return emit({
              phase: entry.outcome.failed ? "failed" : "finalized", includedHeight: number, includedHash: blockHash,
              finalizedHeight: number, deniedNullifiers: entry.outcome.denied, message: entry.outcome.message,
            });
          }
          emit({ phase: "included", includedHeight: number, includedHash: blockHash, message: t("{0} 等待最终确认。", entry.outcome.message) });
          break;
        }
        if (number <= finalizedHeight) { finalizedScanned = number; cache.delete(number); }
      }
      if (inclusion) { await pause(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())), signal); continue; }
      if (finalizedHeight >= current.expiresAt) {
        const stillUnspent = await unspent(api, current.nullifiers);
        return emit({ phase: "expired", message: stillUnspent ? receiptMessage("expired") : t("证明引用的区块已过期；存款已被其他交易花费。") });
      }
      // The pool keeps the unsigned exit for 5 blocks. Re-broadcasting the identical
      // bytes cannot settle twice: the nullifiers gate every copy.
      if (resubmit && current.bytes && height - lastSubmitHeight > POOL_LONGEVITY_BLOCKS && (current.resubmits ?? 0) < MAX_RESUBMITS) {
        const pool = await client.rpc<string[]>("author_pendingExtrinsics", [], signal);
        const queued = pool.some((bytes) => blake2AsHex(hexToU8a(bytes)).toLowerCase() === current.hash.toLowerCase());
        lastSubmitHeight = height;
        if (!queued && await unspent(api, current.nullifiers)) {
          try {
            hash32(await client.rpc<string>("author_submitExtrinsic", [current.bytes], signal));
            emit({ phase: "submitted", resubmits: (current.resubmits ?? 0) + 1, message: t("交易已从待处理池中丢失，已重新广播（第 {0} 次）。", (current.resubmits ?? 0) + 1) });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (error instanceof RpcRejection && !/already\s+(?:imported|known|in\s+the\s+pool)/i.test(message)) {
              return emit({ phase: "failed", message: t("节点拒绝了重新广播的取回交易：{0}", message) });
            }
          }
        }
      }
      if (current.phase === "unknown") emit({ phase: "submitted", message: receiptMessage("submitted") });
      lastError = undefined;
    } catch (error) {
      if (signal?.aborted) throw aborted();
      lastError = error instanceof Error ? error.message : t("交易状态查询中断。");
      emit({ phase: "unknown", message: t("{0} 正在重试，请勿重复取回。", lastError) });
    }
    await pause(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())), signal);
  }
  return emit({ phase: "unknown", message: lastError || t("等待确认超时，可稍后继续查询此取回记录，请勿重复取回。") });
}

async function unspent(api: ApiPromise, nullifiers: string[]): Promise<boolean> {
  const used = await Promise.all(nullifiers.map((n) => api.query.wormhole.usedNullifiers(n)));
  return used.every((value) => {
    const v = value as unknown as { isTrue?: boolean; isSome?: boolean; toString(): string };
    return !(v.isTrue === true || v.isSome === true || v.toString() === "true");
  });
}

/** Receipts stored in this browser, newest first. */
export function listWormholeExitReceipts(): WormholeExitReceipt[] {
  return readWormholeExitReceipts();
}
