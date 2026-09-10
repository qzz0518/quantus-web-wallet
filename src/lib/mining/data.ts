import { xxhashAsHex } from "@polkadot/util-crypto";
import { MAINNET } from "../chain";
import { t } from "../i18n";
import { BUILT_IN_TERMS, gpuId, shortName, typicalPower, type Gpu, type PoolTerms } from "./gpus";

/**
 * Network state for the calculator, read from three public sources and
 * validated field by field: the chain RPC (difficulty, block timestamps),
 * the indexer (recent block rewards) and Quanpool's public API (GPU
 * benchmarks, fee terms, the pool's own hashrate). Nothing is sent but the
 * queries; every function throws on malformed data so callers keep their
 * last good value instead of showing a fabricated number.
 */
export const QUANPOOL_URL = "https://quanpool.com";
export const REQUEST_TIMEOUT_MS = 15_000;
/** Blocks averaged for the block time; enough to smooth luck, short enough to follow difficulty. */
export const BLOCK_TIME_SAMPLE = 200;
export const REWARD_SAMPLE = 50;

export type Fetcher = typeof fetch;

export type ChainStats = {
  height: number;
  difficulty: bigint;
  lastBlockDurationMs: number;
  /** Average over `sampledBlocks` blocks ending at `height`. */
  blockTimeSeconds: number;
  sampledBlocks: number;
  fetchedAt: number;
};

export type RewardStats = {
  /** Average of the sampled rewards. */
  blockRewardPlanck: bigint;
  samples: number;
  latestHeight: number;
  fetchedAt: number;
};

export type PoolStats = {
  /** H/s the pool reports for itself: the median of its windows, since the shortest one swings by a third within minutes. */
  poolHashrate: number;
  blocks24h: number | null;
  networkMiners: number | null;
  fetchedAt: number;
};

type Options = { fetcher?: Fetcher; signal?: AbortSignal };

export function storageKey(pallet: string, item: string): string {
  return xxhashAsHex(pallet, 128) + xxhashAsHex(item, 128).slice(2);
}

export const STORAGE_KEYS = Object.freeze({
  difficulty: storageKey("QPoW", "CurrentDifficulty"),
  lastBlockDuration: storageKey("QPoW", "LastBlockDuration"),
  timestamp: storageKey("Timestamp", "Now"),
});

/** Decode a little-endian unsigned integer of exactly `bytes` bytes. */
export function decodeLeUint(hex: unknown, bytes: number): bigint {
  if (typeof hex !== "string" || !/^0x[\da-f]*$/i.test(hex) || hex.length !== 2 + bytes * 2) {
    throw new Error(t("链上数据格式无效。"));
  }
  let value = 0n;
  for (let i = hex.length - 2; i >= 2; i -= 2) value = (value << 8n) | BigInt(parseInt(hex.slice(i, i + 2), 16));
  return value;
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function post<T>(fetcher: Fetcher, url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: withTimeout(signal),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(t("网络服务暂不可用（HTTP {0}）。", response.status));
  return (await response.json()) as T;
}

async function get<T>(fetcher: Fetcher, url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetcher(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: withTimeout(signal),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(t("网络服务暂不可用（HTTP {0}）。", response.status));
  return (await response.json()) as T;
}

let requestId = 0;
async function rpc<T>(fetcher: Fetcher, url: string, method: string, params: unknown[], signal?: AbortSignal): Promise<T> {
  const id = ++requestId;
  const reply = await post<{ id?: number; result?: T; error?: { message?: string } }>(
    fetcher,
    url,
    { jsonrpc: "2.0", id, method, params },
    signal,
  );
  if (!reply || reply.id !== id) throw new Error(t("RPC 响应编号不匹配。"));
  if (reply.error) throw new Error(reply.error.message || t("节点拒绝了请求。"));
  if (!Object.prototype.hasOwnProperty.call(reply, "result")) throw new Error(t("RPC 响应不完整。"));
  return reply.result as T;
}

const HASH = /^0x[\da-f]{64}$/i;
function hash32(value: unknown): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error(t("链上数据格式无效。"));
  return value;
}

function blockNumber(header: unknown): number {
  const raw = (header as { number?: unknown } | null)?.number;
  if (typeof raw !== "string" || !/^0x[\da-f]{1,14}$/i.test(raw)) throw new Error(t("链上数据格式无效。"));
  return parseInt(raw, 16);
}

/**
 * Difficulty and block time from the chain. Block time is the average gap
 * between `Timestamp.Now` at the head and `sample` blocks earlier, so the
 * inferred network hashrate (difficulty ÷ block time) is anchored in what
 * the chain measured, not in what any pool reports.
 */
export async function fetchChainStats(
  options: Options & { rpcUrl?: string; sample?: number } = {},
): Promise<ChainStats> {
  const fetcher = options.fetcher ?? fetch;
  const url = options.rpcUrl ?? MAINNET.rpcUrl;
  const call = <T>(method: string, params: unknown[] = []) => rpc<T>(fetcher, url, method, params, options.signal);

  const headHash = hash32(await call<string>("chain_getBlockHash", []));
  const height = blockNumber(await call<unknown>("chain_getHeader", [headHash]));
  const sample = Math.max(1, Math.min(options.sample ?? BLOCK_TIME_SAMPLE, height));
  if (height < 1) throw new Error(t("链上数据格式无效。"));
  const [oldHash, nowHex, difficultyHex, durationHex] = await Promise.all([
    call<string>("chain_getBlockHash", [height - sample]).then(hash32),
    call<unknown>("state_getStorage", [STORAGE_KEYS.timestamp, headHash]),
    call<unknown>("state_getStorage", [STORAGE_KEYS.difficulty, headHash]),
    call<unknown>("state_getStorage", [STORAGE_KEYS.lastBlockDuration, headHash]),
  ]);
  const thenHex = await call<unknown>("state_getStorage", [STORAGE_KEYS.timestamp, oldHash]);

  const difficulty = decodeLeUint(difficultyHex, 64);
  const now = decodeLeUint(nowHex, 8);
  const then = decodeLeUint(thenHex, 8);
  const lastBlockDurationMs = Number(decodeLeUint(durationHex, 8));
  if (difficulty <= 0n || now <= then) throw new Error(t("链上数据格式无效。"));
  const blockTimeSeconds = Number(now - then) / sample / 1000;
  if (!(blockTimeSeconds >= 0.5 && blockTimeSeconds <= 3600)) throw new Error(t("链上数据格式无效。"));
  return { height, difficulty, lastBlockDurationMs, blockTimeSeconds, sampledBlocks: sample, fetchedAt: Date.now() };
}

const REWARD_QUERY = `query RecentRewards($limit: Int!) {
  miner_reward(limit: $limit, order_by: {block: {height: desc}}) { reward block { height } }
}`;

type RewardRow = { reward?: unknown; block?: { height?: unknown } | null };

/** Average of the most recent block rewards on the indexer. */
export async function fetchBlockReward(
  options: Options & { indexerUrl?: string; sample?: number } = {},
): Promise<RewardStats> {
  const fetcher = options.fetcher ?? fetch;
  const sample = Math.max(1, Math.min(options.sample ?? REWARD_SAMPLE, 500));
  const reply = await post<{ data?: { miner_reward?: unknown }; errors?: unknown[] }>(
    fetcher,
    options.indexerUrl ?? MAINNET.indexerUrl,
    { query: REWARD_QUERY, variables: { limit: sample } },
    options.signal,
  );
  if (reply?.errors?.length || !Array.isArray(reply?.data?.miner_reward)) throw new Error(t("索引器返回的数据无效。"));
  const rows = reply.data.miner_reward as RewardRow[];
  if (!rows.length) throw new Error(t("索引器返回的数据无效。"));
  let sum = 0n;
  let latestHeight = 0;
  for (const row of rows) {
    if (typeof row?.reward !== "string" || !/^\d{1,30}$/.test(row.reward)) throw new Error(t("索引器返回的数据无效。"));
    const reward = BigInt(row.reward);
    // A block reward above 1 000 QTC or of zero is not a reward but a broken row.
    if (reward <= 0n || reward > 1_000_000_000_000_000n) throw new Error(t("索引器返回的数据无效。"));
    sum += reward;
    const height = row.block?.height;
    if (typeof height === "number" && height > latestHeight) latestHeight = height;
  }
  return { blockRewardPlanck: sum / BigInt(rows.length), samples: rows.length, latestHeight, fetchedAt: Date.now() };
}

type TermsReply = {
  benchmarks?: unknown;
  fee_percent?: unknown;
  miner_dev_fee_percent?: unknown;
};

const percent = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const hashrate = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1e18 ? value : null;

/**
 * Live GPU benchmarks and fee terms from Quanpool's public API. Devices are
 * matched to the built-in table by name to keep the typical power figures;
 * unknown devices arrive without power and the user fills it in.
 */
export async function fetchPoolTerms(options: Options & { baseUrl?: string } = {}): Promise<PoolTerms> {
  const fetcher = options.fetcher ?? fetch;
  const reply = await get<TermsReply>(fetcher, `${options.baseUrl ?? QUANPOOL_URL}/api/terms`, options.signal);
  const poolFeePercent = percent(reply?.fee_percent);
  const minerDevFeePercent = percent(reply?.miner_dev_fee_percent);
  if (poolFeePercent === null || minerDevFeePercent === null || !Array.isArray(reply.benchmarks)) {
    throw new Error(t("矿池接口返回的数据无效。"));
  }
  const gpus: Gpu[] = [];
  const seen = new Set<string>();
  for (const row of reply.benchmarks as { device?: unknown; ours?: unknown; stock?: unknown; note?: unknown }[]) {
    const device = typeof row?.device === "string" ? row.device.trim() : "";
    const ours = hashrate(row?.ours);
    const stock = hashrate(row?.stock);
    if (!device || device.length > 80 || ours === null || stock === null) throw new Error(t("矿池接口返回的数据无效。"));
    const id = gpuId(device);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    gpus.push({
      id,
      device,
      short: shortName(device),
      ours,
      stock,
      powerW: typicalPower(id),
      note: typeof row.note === "string" ? row.note.slice(0, 120) : undefined,
    });
  }
  if (!gpus.length) throw new Error(t("矿池接口返回的数据无效。"));
  return { poolFeePercent, minerDevFeePercent, gpus, capturedAt: Date.now(), source: "live" };
}

type StatsReply = { hashrate_windows?: unknown; blocks_24h?: unknown; network_miners?: unknown };

/** The pool's own hashrate; only used to show that the inferred network figure is plausible. */
export async function fetchPoolStats(options: Options & { baseUrl?: string } = {}): Promise<PoolStats> {
  const fetcher = options.fetcher ?? fetch;
  const reply = await get<StatsReply>(fetcher, `${options.baseUrl ?? QUANPOOL_URL}/api/stats/mainnet`, options.signal);
  const windows = (Array.isArray(reply?.hashrate_windows) ? reply.hashrate_windows : [])
    .map(hashrate)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  if (!windows.length) throw new Error(t("矿池接口返回的数据无效。"));
  const poolHashrate = windows[Math.floor(windows.length / 2)];
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);
  return { poolHashrate, blocks24h: count(reply.blocks_24h), networkMiners: count(reply.network_miners), fetchedAt: Date.now() };
}

export { BUILT_IN_TERMS };
