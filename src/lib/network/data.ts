import { MAINNET } from "../chain";
import { t } from "../i18n";
import { decodeLeUint, postJson, rpcCall, storageKey, type Fetcher } from "../mining/data";

/**
 * The three readings the network dashboard adds to what the mining
 * calculator already fetches: total issuance from the chain, the daily
 * counters and running totals from the indexer, and a block count over a
 * window. Everything is read straight from the public RPC and the public
 * indexer by the reader's own browser, and every field is validated before
 * it reaches the page, so a malformed answer leaves the last good value in
 * place instead of printing a fabricated number.
 */

export const TOTAL_ISSUANCE_KEY = storageKey("Balances", "TotalIssuance");
/** Days of daily counters the chart asks for. */
export const DAILY_WINDOW = 30;

type Options = { fetcher?: Fetcher; signal?: AbortSignal; indexerUrl?: string; rpcUrl?: string };

const indexer = <T>(options: Options, query: string, variables: Record<string, unknown>) =>
  postJson<{ data?: T; errors?: unknown[] }>(
    options.fetcher ?? fetch,
    options.indexerUrl ?? MAINNET.indexerUrl,
    { query, variables },
    options.signal,
  );

function invalid(): never {
  throw new Error(t("索引器返回的数据无效。"));
}

const counter = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : invalid();

/** `Balances.TotalIssuance`, the planck that exist right now. */
export async function fetchTotalIssuance(options: Options = {}): Promise<{ issuancePlanck: bigint; fetchedAt: number }> {
  const hex = await rpcCall<unknown>(
    options.fetcher ?? fetch,
    options.rpcUrl ?? MAINNET.rpcUrl,
    "state_getStorage",
    [TOTAL_ISSUANCE_KEY],
    options.signal,
  );
  const issuancePlanck = decodeLeUint(hex, 16);
  if (issuancePlanck <= 0n) throw new Error(t("链上数据格式无效。"));
  return { issuancePlanck, fetchedAt: Date.now() };
}

export type DailyStat = {
  /** Calendar day as the indexer keys it, `YYYY-MM-DD`. */
  date: string;
  blocks: number;
  transactions: number;
  activeAccounts: number;
};

const DAILY_QUERY = `query DailyChainStats($limit: Int!) {
  daily_chain_stats(order_by: {date: desc}, limit: $limit) { id blocks_count tx_count active_accounts }
}`;

/**
 * The indexer's per-day counters, oldest first so the charts read left to
 * right. The indexer keeps one placeholder row at the epoch for the genesis
 * block; it is dropped rather than drawn as a thirty-year gap.
 */
export async function fetchDailyStats(options: Options & { days?: number } = {}): Promise<DailyStat[]> {
  const limit = Math.max(1, Math.min(options.days ?? DAILY_WINDOW, 365));
  const reply = await indexer<{ daily_chain_stats?: unknown }>(options, DAILY_QUERY, { limit: limit + 1 });
  if (reply?.errors?.length || !Array.isArray(reply?.data?.daily_chain_stats)) invalid();
  const rows = reply.data.daily_chain_stats as { id?: unknown; blocks_count?: unknown; tx_count?: unknown; active_accounts?: unknown }[];
  return rows
    .map((row) => {
      const date = typeof row?.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.id) ? row.id : invalid();
      return {
        date,
        blocks: counter(row.blocks_count),
        transactions: counter(row.tx_count),
        activeAccounts: counter(row.active_accounts),
      };
    })
    .filter((row) => row.date !== "1970-01-01")
    .slice(0, limit)
    .reverse();
}

export type ChainTotals = {
  blockHeight: number;
  totalAccounts: number;
  totalMiners: number;
  /** Blocks that have paid a mining reward. */
  totalMinerRewards: number;
  fetchedAt: number;
};

const TOTALS_QUERY = `query ChainTotals {
  chain_stats_by_pk(id: "global") { block_height total_accounts total_miners total_miner_rewards }
}`;

export async function fetchChainTotals(options: Options = {}): Promise<ChainTotals> {
  const reply = await indexer<{ chain_stats_by_pk?: unknown }>(options, TOTALS_QUERY, {});
  if (reply?.errors?.length) invalid();
  const row = reply?.data?.chain_stats_by_pk as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== "object") invalid();
  return {
    blockHeight: counter(row.block_height),
    totalAccounts: counter(row.total_accounts),
    totalMiners: counter(row.total_miners),
    totalMinerRewards: counter(row.total_miner_rewards),
    fetchedAt: Date.now(),
  };
}

const BLOCK_COUNT_QUERY = `query BlocksSince($since: timestamptz!) {
  block_aggregate(where: {timestamp: {_gte: $since}}) { aggregate { count } }
}`;

/** How many blocks the indexer has seen since `since` (an ISO timestamp). */
export async function fetchBlocksSince(since: Date, options: Options = {}): Promise<number> {
  const reply = await indexer<{ block_aggregate?: { aggregate?: { count?: unknown } | null } | null }>(
    options,
    BLOCK_COUNT_QUERY,
    { since: since.toISOString() },
  );
  if (reply?.errors?.length) invalid();
  return counter(reply?.data?.block_aggregate?.aggregate?.count);
}
