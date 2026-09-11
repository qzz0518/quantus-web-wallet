import { hexToU8a, u8aConcat, u8aToHex } from "@polkadot/util";
import { blake2AsU8a, xxhashAsU8a } from "@polkadot/util-crypto";
import {
  computeWormholeNullifiers,
  deriveWormholeAddresses,
  normalizeMnemonic,
  validateMnemonic,
  type WormholeNullifierInput,
} from "../../crypto";
import { MAINNET, validateAddress } from "../chain";
import { t } from "../i18n";
import type {
  WormholeBranch,
  WormholeBranchScan,
  WormholeDeposit,
  WormholeScanProgress,
  WormholeSnapshot,
} from "./types";

/**
 * Read-only scan of an encrypted (Wormhole) account.
 *
 * The seed phrase only ever reaches the disposable crypto worker; this module
 * sees addresses and nullifiers. Everything is pinned to one finalized block
 * that the RPC node and the indexer agree on, and any gap, cap or mismatch
 * is an error rather than a smaller balance.
 */

/** Addresses derived per worker call and the unused-address stop condition. */
export const WORMHOLE_ADDRESS_BATCH = 20;
export const WORMHOLE_GAP_LIMIT = 20;
export const WORMHOLE_DEPOSIT_PAGE = 300;
export const WORMHOLE_NULLIFIER_BATCH = 250;
export const WORMHOLE_STORAGE_BATCH = 100;
export const WORMHOLE_DEFAULT_MAX_ADDRESSES = 1000;
export const WORMHOLE_DEFAULT_MAX_DEPOSITS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;
const HEX_32 = /^0x[\da-f]{64}$/i;
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;

export type WormholeScanErrorCode = "invalid" | "network" | "mismatch" | "incomplete" | "aborted";

export class WormholeScanError extends Error {
  constructor(
    public readonly code: WormholeScanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WormholeScanError";
  }
}

/** A deposit as returned by the scanner: the shared shape plus the indexed time when known. */
export interface WormholeScannedDeposit extends WormholeDeposit {
  /** ISO timestamp of the block from the indexer, when it provided one. */
  timestamp?: string;
}

export interface WormholeScanSnapshot extends WormholeSnapshot {
  deposits: WormholeScannedDeposit[];
}

/** Derivation and nullifier back end; the default runs in the disposable worker. */
export interface WormholeScanWorker {
  deriveAddresses(mnemonic: string, branch: WormholeBranch, start: number, count: number): Promise<string[]>;
  computeNullifiers(mnemonic: string, inputs: WormholeNullifierInput[]): Promise<string[]>;
}

export interface WormholeScanOptions {
  mnemonic: string;
  /** Address shown by the official wallet; reported as found or not, never used for lookups. */
  expectedAddress?: string;
  onProgress?: (progress: WormholeScanProgress) => void;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  worker?: WormholeScanWorker;
  maxAddressesPerBranch?: number;
  maxDeposits?: number;
}

const ANCHOR_QUERY = `query WormholeScanAnchor($height: Int!) {
  head: block(order_by: {height: desc}, limit: 1) { height hash }
  anchor: block(where: {height: {_eq: $height}}) { height hash }
  genesis: block(where: {height: {_eq: 0}}) { height hash }
}`;

const DEPOSITS_QUERY = `query WormholeScanDeposits($tos: [String!]!, $height: Int!, $limit: Int!, $offset: Int!) {
  transfer(where: {to: {id: {_in: $tos}}, block: {height: {_lte: $height}}},
    order_by: [{block: {height: asc}}, {id: asc}], limit: $limit, offset: $offset) {
    id amount timestamp leaf_index transfer_count to_hash to { id } block { height hash }
  }
}`;

const defaultWorker: WormholeScanWorker = {
  deriveAddresses: deriveWormholeAddresses,
  computeNullifiers: computeWormholeNullifiers,
};

/**
 * The first receiving index that has never taken a deposit, so a new deposit
 * goes to an address nothing else points at: reusing one that already holds a
 * deposit ties the two payments to the same account in public view. `after`
 * asks for the next one beyond an index already offered.
 */
export function nextUnusedWormholeIndex(
  snapshot: Pick<WormholeSnapshot, "branches">,
  after = -1,
): number {
  const receiving = snapshot.branches.find((entry) => entry.branch === 0);
  const used = new Set(receiving?.used ?? []);
  let index = Math.max(0, Math.floor(after) + 1);
  while (used.has(index)) index++;
  return index;
}

/** Storage key of `Wormhole.UsedNullifiers[nullifier]` (Blake2_128Concat map). */
export function usedNullifierKey(nullifier: string): string {
  const bytes = hexToU8a(hash32(nullifier));
  return u8aToHex(u8aConcat(xxhashAsU8a("Wormhole", 128), xxhashAsU8a("UsedNullifiers", 128), blake2AsU8a(bytes, 128), bytes));
}

function invalid(message: string): WormholeScanError {
  return new WormholeScanError("invalid", message);
}

function hash32(value: unknown): string {
  if (typeof value !== "string" || !HEX_32.test(value)) throw invalid(t("服务返回了无效的区块或交易哈希。"));
  return value.toLowerCase();
}

function safeInteger(value: unknown, message: string): number {
  const number = typeof value === "string" && /^(0x[\da-f]+|\d+)$/i.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) throw invalid(message);
  return number;
}

/** Unsigned decimal string within `max`; the indexer sends numerics as strings, sometimes as numbers. */
function unsigned(value: unknown, max: bigint, message: string): string {
  let big: bigint;
  if (typeof value === "string" && /^\d+$/.test(value)) big = BigInt(value);
  else if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) big = BigInt(value);
  else throw invalid(message);
  if (big > max) throw invalid(message);
  return big.toString();
}

type PendingDeposit = Omit<WormholeScannedDeposit, "nullifier" | "spent">;

export async function scanWormhole(options: WormholeScanOptions): Promise<WormholeScanSnapshot> {
  const {
    onProgress,
    signal,
    fetcher = fetch,
    worker = defaultWorker,
    maxAddressesPerBranch = WORMHOLE_DEFAULT_MAX_ADDRESSES,
    maxDeposits = WORMHOLE_DEFAULT_MAX_DEPOSITS,
  } = options;
  const mnemonic = normalizeMnemonic(options.mnemonic);
  if (!validateMnemonic(mnemonic)) throw invalid(t("助记词无效，请检查单词、顺序和数量"));
  const expected = options.expectedAddress?.trim() ? validateAddress(options.expectedAddress) : undefined;
  if (!Number.isSafeInteger(maxAddressesPerBranch) || maxAddressesPerBranch < 1) throw invalid(t("扫描上限无效。"));
  if (!Number.isSafeInteger(maxDeposits) || maxDeposits < 1) throw invalid(t("扫描上限无效。"));

  let requestId = 0;
  const aborted = () => new WormholeScanError("aborted", t("已取消扫描。"));
  const checkAborted = () => {
    if (signal?.aborted) throw aborted();
  };
  const progress = (update: WormholeScanProgress) => onProgress?.(update);

  async function post<T>(url: string, body: unknown): Promise<T> {
    checkAborted();
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
    } catch {
      if (signal?.aborted) throw aborted();
      throw new WormholeScanError("network", t("无法连接网络服务，请检查网络后重试。"));
    }
    if (!response.ok) throw new WormholeScanError("network", t("网络服务暂不可用（HTTP {0}）。", response.status));
    try {
      return (await response.json()) as T;
    } catch {
      throw invalid(t("网络服务返回了无法解析的数据。"));
    }
  }

  async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const id = ++requestId;
    const reply = await post<{ id?: number; result?: T; error?: { message?: string } } | null>(MAINNET.rpcUrl, {
      jsonrpc: "2.0",
      id,
      method,
      params,
    });
    if (!reply || reply.id !== id) throw invalid(t("RPC 响应编号不匹配。"));
    if (reply.error) throw new WormholeScanError("network", reply.error.message || t("节点拒绝了请求。"));
    if (!Object.prototype.hasOwnProperty.call(reply, "result")) throw invalid(t("RPC 响应不完整。"));
    return reply.result as T;
  }

  async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const reply = await post<{ data?: T; errors?: unknown[] } | null>(MAINNET.indexerUrl, { query, variables });
    if (!reply || reply.errors?.length || !reply.data) {
      throw new WormholeScanError("network", t("交易索引暂不可用，请稍后重试。"));
    }
    return reply.data;
  }

  // 1. One finalized block that both the node and the indexer agree on.
  progress({ stage: "network" });
  const [finalizedHash, genesisHash] = await Promise.all([
    rpc<string>("chain_getFinalizedHead"),
    rpc<string>("chain_getBlockHash", [0]),
  ]);
  const snapshotHash = hash32(finalizedHash);
  if (hash32(genesisHash) !== MAINNET.genesisHash) throw new WormholeScanError("mismatch", t("RPC 网络不匹配，已停止操作。"));
  const header = await rpc<{ number?: unknown } | null>("chain_getHeader", [snapshotHash]);
  const snapshotHeight = safeInteger(header?.number, t("最终确认高度 无效。"));
  type BlockRow = { height?: unknown; hash?: unknown };
  const anchor = await graphql<{ head?: BlockRow[]; anchor?: BlockRow[]; genesis?: BlockRow[] }>(ANCHOR_QUERY, {
    height: snapshotHeight,
  });
  const row = (rows: BlockRow[] | undefined): BlockRow | undefined => (Array.isArray(rows) ? rows[0] : undefined);
  const head = row(anchor.head);
  const indexedHeight = safeInteger(head?.height, t("索引高度 无效。"));
  const mismatch = () => new WormholeScanError("mismatch", t("索引服务与节点的区块不一致，请稍后重试。"));
  if (indexedHeight < snapshotHeight) throw mismatch();
  const indexedAnchor = row(anchor.anchor);
  if (!indexedAnchor || safeInteger(indexedAnchor.height, t("索引高度 无效。")) !== snapshotHeight) throw mismatch();
  if (hash32(indexedAnchor.hash) !== snapshotHash) throw mismatch();
  const indexedGenesis = row(anchor.genesis);
  if (!indexedGenesis || hash32(indexedGenesis.hash) !== MAINNET.genesisHash) {
    throw new WormholeScanError("mismatch", t("索引服务网络不匹配，已停止操作。"));
  }

  // 2. Deposits per branch, walking the derivation path until a gap of unused addresses.
  const pending: PendingDeposit[] = [];
  const seenIds = new Set<string>();
  const knownAddresses = new Set<string>();

  function parseRow(raw: unknown, batch: Map<string, number>, branch: WormholeBranch): PendingDeposit {
    const r = raw as {
      id?: unknown; amount?: unknown; timestamp?: unknown; leaf_index?: unknown; transfer_count?: unknown;
      to_hash?: unknown; to?: { id?: unknown } | null; block?: { height?: unknown; hash?: unknown } | null;
    };
    const bad = t("入账索引返回了无效的数据。");
    if (!r || typeof r.id !== "string" || !r.id) throw invalid(bad);
    const index = typeof r.to?.id === "string" ? batch.get(r.to.id) : undefined;
    if (index === undefined) throw invalid(bad);
    const blockHeight = safeInteger(r.block?.height, t("入账高度 无效。"));
    if (blockHeight > snapshotHeight) throw invalid(bad);
    const timestamp = typeof r.timestamp === "string" && Number.isFinite(Date.parse(r.timestamp)) ? r.timestamp : undefined;
    return {
      id: r.id,
      branch,
      index,
      address: r.to!.id as string,
      amountPlanck: unsigned(r.amount, U128_MAX, t("服务返回了无效的金额。")),
      blockHeight,
      blockHash: hash32(r.block?.hash),
      leafIndex: unsigned(r.leaf_index, U64_MAX, t("入账索引 无效。")),
      transferCount: unsigned(r.transfer_count, U64_MAX, t("入账计数 无效。")),
      toHash: hash32(r.to_hash),
      ...(timestamp ? { timestamp } : {}),
    };
  }

  async function fetchDeposits(batch: Map<string, number>, branch: WormholeBranch): Promise<Set<number>> {
    const usedIndices = new Set<number>();
    const tos = [...batch.keys()];
    for (let offset = 0; ; offset += WORMHOLE_DEPOSIT_PAGE) {
      const page = await graphql<{ transfer?: unknown[] }>(DEPOSITS_QUERY, {
        tos,
        height: snapshotHeight,
        limit: WORMHOLE_DEPOSIT_PAGE,
        offset,
      });
      if (!Array.isArray(page.transfer) || page.transfer.length > WORMHOLE_DEPOSIT_PAGE) {
        throw invalid(t("入账索引返回了无效的数据。"));
      }
      for (const raw of page.transfer) {
        const deposit = parseRow(raw, batch, branch);
        if (seenIds.has(deposit.id)) continue;
        seenIds.add(deposit.id);
        pending.push(deposit);
        usedIndices.add(deposit.index);
        if (pending.length > maxDeposits) {
          throw new WormholeScanError("incomplete", t("入账记录超过 {0} 条，本工具无法完整扫描。", maxDeposits));
        }
      }
      progress({ stage: "deposits", branch, scanned: batch.size, deposits: pending.length });
      if (page.transfer.length < WORMHOLE_DEPOSIT_PAGE) return usedIndices;
    }
  }

  async function scanBranch(branch: WormholeBranch): Promise<WormholeBranchScan> {
    let scanned = 0;
    let trailingUnused = 0;
    const used: number[] = [];
    while (trailingUnused < WORMHOLE_GAP_LIMIT) {
      if (scanned >= maxAddressesPerBranch) {
        throw new WormholeScanError("incomplete", t("分支 {0} 在 {1} 个地址内仍有入账，本工具无法完整扫描。", branch, maxAddressesPerBranch));
      }
      checkAborted();
      const count = Math.min(WORMHOLE_ADDRESS_BATCH, maxAddressesPerBranch - scanned);
      const addresses = await worker.deriveAddresses(mnemonic, branch, scanned, count);
      if (!Array.isArray(addresses) || addresses.length !== count) throw invalid(t("地址派生结果不完整。"));
      const batch = new Map<string, number>();
      addresses.forEach((address, position) => {
        if (typeof address !== "string" || !address || knownAddresses.has(address)) throw invalid(t("地址派生结果不完整。"));
        knownAddresses.add(address);
        batch.set(address, scanned + position);
      });
      progress({ stage: "addresses", branch, scanned: scanned + count, deposits: pending.length });
      const usedIndices = await fetchDeposits(batch, branch);
      for (let position = 0; position < count; position++) {
        const index = scanned + position;
        if (usedIndices.has(index)) {
          used.push(index);
          trailingUnused = 0;
        } else trailingUnused++;
      }
      scanned += count;
      progress({ stage: "deposits", branch, scanned, deposits: pending.length });
    }
    return { branch, scanned, used };
  }

  const branches: [WormholeBranchScan, WormholeBranchScan] = [await scanBranch(0), await scanBranch(1)];

  // 3. Nullifiers from the worker, then their presence in Wormhole.UsedNullifiers at the snapshot.
  progress({ stage: "nullifiers", deposits: pending.length });
  const nullifiers: string[] = [];
  for (let start = 0; start < pending.length; start += WORMHOLE_NULLIFIER_BATCH) {
    checkAborted();
    const slice = pending.slice(start, start + WORMHOLE_NULLIFIER_BATCH);
    const result = await worker.computeNullifiers(
      mnemonic,
      slice.map(({ branch, index, transferCount }) => ({ branch, index, transferCount })),
    );
    if (!Array.isArray(result) || result.length !== slice.length) throw invalid(t("空值符计算结果不完整。"));
    for (const nullifier of result) nullifiers.push(hash32(nullifier));
    progress({ stage: "nullifiers", deposits: pending.length, scanned: nullifiers.length });
  }
  const keys = nullifiers.map(usedNullifierKey);
  const spentByKey = new Map<string, boolean>();
  for (let start = 0; start < keys.length; start += WORMHOLE_STORAGE_BATCH) {
    const batch = keys.slice(start, start + WORMHOLE_STORAGE_BATCH);
    const reply = await rpc<unknown>("state_queryStorageAt", [batch, snapshotHash]);
    if (!Array.isArray(reply) || reply.length !== 1) throw invalid(t("节点返回了无效的存储数据。"));
    const set = reply[0] as { block?: unknown; changes?: unknown };
    if (hash32(set.block) !== snapshotHash) throw new WormholeScanError("mismatch", t("节点返回的存储数据未固定在快照区块。"));
    if (!Array.isArray(set.changes)) throw invalid(t("节点返回了无效的存储数据。"));
    const changes = new Map<string, unknown>();
    for (const change of set.changes as unknown[]) {
      if (!Array.isArray(change) || typeof change[0] !== "string") throw invalid(t("节点返回了无效的存储数据。"));
      changes.set(change[0].toLowerCase(), change[1]);
    }
    for (const key of batch) {
      if (!changes.has(key)) throw invalid(t("节点返回的存储数据缺少查询的键。"));
      const value = changes.get(key);
      if (value !== null && (typeof value !== "string" || !/^0x(?:[\da-f]{2})*$/i.test(value))) {
        throw invalid(t("节点返回了无效的存储数据。"));
      }
      spentByKey.set(key, value !== null);
    }
  }

  let unspent = 0n;
  let spent = 0n;
  const deposits: WormholeScannedDeposit[] = pending.map((deposit, position) => {
    const nullifier = nullifiers[position];
    const isSpent = spentByKey.get(keys[position]) === true;
    if (isSpent) spent += BigInt(deposit.amountPlanck);
    else unspent += BigInt(deposit.amountPlanck);
    return { ...deposit, nullifier, spent: isSpent };
  });
  deposits.sort((a, b) => a.blockHeight - b.blockHeight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    blockHeight: snapshotHeight,
    blockHash: snapshotHash,
    indexedHeight,
    deposits,
    unspentPlanck: unspent.toString(),
    spentPlanck: spent.toString(),
    branches,
    ...(expected !== undefined ? { expectedAddressFound: knownAddresses.has(expected) } : {}),
    createdAt: Date.now(),
  };
}
