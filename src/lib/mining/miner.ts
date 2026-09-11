import { MAINNET, validateAddress } from "../chain";
import { t } from "../i18n";
import { postJson, type Fetcher } from "./data";

/**
 * What one address earned from mining, read from the public indexer, plus
 * the arithmetic that turns it into daily bars, window totals and an
 * effective hashrate. Only an address is sent; nothing here knows or needs
 * to know whose address it is.
 *
 * The chain pays a block reward as a transfer from its minting account, so
 * every reward shows up twice in the indexer: once in `miner_reward` and
 * once in `transfer`. `splitRewardPayouts` matches the two up by block and
 * amount and takes the duplicates out before the remaining transfers are
 * grouped into payout sources — otherwise the minting account would top the
 * list of "who paid me" on every solo miner's page.
 */

export const MINER_STORAGE_KEY = "quantus-wallet-miner-v1";
/** Bumped when a stored field changes meaning; see `normalizePrefs`. */
const SCHEMA = 1;
/** Addresses the page offers as shortcuts. */
export const RECENT_LIMIT = 5;
/** Days of history the page asks the indexer for. */
export const WINDOW_DAYS = 30;
/** Rows per indexer page; the indexer answers a thousand at a time. */
export const PAGE_SIZE = 1000;
/** Pages at most, so a very large miner cannot spin forever. */
export const MAX_PAGES = 12;
/** Incoming transfers to look through for payouts. */
export const TRANSFER_LIMIT = 500;
/** The windows the page reports, in hours. */
export const WINDOWS = [24, 24 * 7, 24 * WINDOW_DAYS];

export type MinerPrefs = {
  /** Addresses looked up before, most recent first. */
  recent: string[];
  /** Sender address to the label the user gave it. */
  pools: Record<string, string>;
};

export const EMPTY_PREFS: MinerPrefs = { recent: [], pools: {} };

const address = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    return validateAddress(value);
  } catch {
    return null;
  }
};

/**
 * Read back what was stored, field by field. An older or broken record
 * degrades to whatever parts of it are still valid rather than throwing the
 * page away.
 */
export function normalizePrefs(value: unknown): MinerPrefs {
  const raw = (value ?? {}) as { recent?: unknown; pools?: unknown };
  const recent: string[] = [];
  for (const entry of Array.isArray(raw.recent) ? raw.recent : []) {
    const canonical = address(entry);
    if (canonical && !recent.includes(canonical)) recent.push(canonical);
    if (recent.length >= RECENT_LIMIT) break;
  }
  const pools: Record<string, string> = {};
  const source = raw.pools && typeof raw.pools === "object" ? (raw.pools as Record<string, unknown>) : {};
  for (const [key, label] of Object.entries(source)) {
    const canonical = address(key);
    if (canonical && typeof label === "string" && label.trim()) pools[canonical] = label.trim().slice(0, 40);
  }
  return { recent, pools };
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadMinerPrefs(storage: Pick<Storage, "getItem"> | null = defaultStorage()): MinerPrefs {
  try {
    const stored = storage?.getItem(MINER_STORAGE_KEY);
    return stored ? normalizePrefs(JSON.parse(stored)) : EMPTY_PREFS;
  } catch {
    // A broken or blocked store must not keep the page from opening.
    return EMPTY_PREFS;
  }
}

export function saveMinerPrefs(prefs: MinerPrefs, storage: Pick<Storage, "setItem"> | null = defaultStorage()) {
  try {
    storage?.setItem(MINER_STORAGE_KEY, JSON.stringify({ schema: SCHEMA, ...prefs }));
  } catch {
    // Keep the choice for this page session when storage is unavailable.
  }
}

/** The address moves to the front; the list never grows past `RECENT_LIMIT`. */
export function rememberAddress(prefs: MinerPrefs, value: string): MinerPrefs {
  const canonical = address(value);
  if (!canonical) return prefs;
  return { ...prefs, recent: [canonical, ...prefs.recent.filter((entry) => entry !== canonical)].slice(0, RECENT_LIMIT) };
}

/** A label marks a sender as a pool; `null` takes the mark off again. */
export function markPool(prefs: MinerPrefs, sender: string, label: string | null): MinerPrefs {
  const canonical = address(sender);
  if (!canonical) return prefs;
  const pools = { ...prefs.pools };
  if (label === null || !label.trim()) delete pools[canonical];
  else pools[canonical] = label.trim().slice(0, 40);
  return { ...prefs, pools };
}

export type Entry = {
  id: string;
  /** Milliseconds since the epoch. */
  timestamp: number;
  planck: bigint;
  height: number;
};

export type Payout = Entry & { from: string };

export type MinerTotals = {
  minedBlocks: number;
  rewardPlanck: bigint;
};

type Options = { fetcher?: Fetcher; signal?: AbortSignal; indexerUrl?: string };

const query = <T>(options: Options, text: string, variables: Record<string, unknown>) =>
  postJson<{ data?: T; errors?: unknown[] }>(
    options.fetcher ?? fetch,
    options.indexerUrl ?? MAINNET.indexerUrl,
    { query: text, variables },
    options.signal,
  );

function invalid(): never {
  throw new Error(t("索引器返回的数据无效。"));
}

const planck = (value: unknown): bigint => {
  if (typeof value !== "string" || !/^\d{1,30}$/.test(value)) invalid();
  return BigInt(value);
};

const moment = (value: unknown): number => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) invalid();
  return parsed;
};

const height = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : invalid();

const STATS_QUERY = `query MinerTotals($id: String!) {
  account_stats_by_pk(id: $id) { total_mined_blocks total_rewards }
}`;

/** Lifetime mined blocks and rewards; null when the indexer has never seen the address. */
export async function fetchMinerTotals(value: string, options: Options = {}): Promise<MinerTotals | null> {
  const reply = await query<{ account_stats_by_pk?: unknown }>(options, STATS_QUERY, { id: validateAddress(value) });
  if (reply?.errors?.length) invalid();
  const row = reply?.data?.account_stats_by_pk as { total_mined_blocks?: unknown; total_rewards?: unknown } | null | undefined;
  if (row === null || row === undefined) return null;
  return { minedBlocks: height(row.total_mined_blocks), rewardPlanck: planck(row.total_rewards) };
}

const REWARDS_QUERY = `query MinerRewards($id: String!, $since: timestamptz!, $limit: Int!, $offset: Int!) {
  miner_reward(
    where: {miner_id: {_eq: $id}, timestamp: {_gte: $since}}
    order_by: [{timestamp: desc}, {id: desc}]
    limit: $limit
    offset: $offset
  ) { id reward timestamp block { height } }
}`;

/** Every block this address mined since `since`, newest first, paged through. */
export async function fetchMinerRewards(value: string, since: Date, options: Options = {}): Promise<Entry[]> {
  const id = validateAddress(value);
  const rows: Entry[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const reply = await query<{ miner_reward?: unknown }>(options, REWARDS_QUERY, {
      id,
      since: since.toISOString(),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    if (reply?.errors?.length || !Array.isArray(reply?.data?.miner_reward)) invalid();
    const batch = reply.data.miner_reward as { id?: unknown; reward?: unknown; timestamp?: unknown; block?: { height?: unknown } | null }[];
    for (const row of batch) {
      if (typeof row?.id !== "string") invalid();
      rows.push({ id: row.id, planck: planck(row.reward), timestamp: moment(row.timestamp), height: height(row.block?.height) });
    }
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

const TRANSFERS_QUERY = `query MinerIncoming($id: String!, $since: timestamptz!, $limit: Int!) {
  transfer(
    where: {to_id: {_eq: $id}, timestamp: {_gte: $since}}
    order_by: [{timestamp: desc}, {id: desc}]
    limit: $limit
  ) { id amount timestamp from_id block { height } }
}`;

/** Transfers into the address since `since`, newest first. */
export async function fetchIncomingTransfers(value: string, since: Date, options: Options = {}): Promise<Payout[]> {
  const reply = await query<{ transfer?: unknown }>(options, TRANSFERS_QUERY, {
    id: validateAddress(value),
    since: since.toISOString(),
    limit: TRANSFER_LIMIT,
  });
  if (reply?.errors?.length || !Array.isArray(reply?.data?.transfer)) invalid();
  const rows = reply.data.transfer as {
    id?: unknown;
    amount?: unknown;
    timestamp?: unknown;
    from_id?: unknown;
    block?: { height?: unknown } | null;
  }[];
  return rows.map((row) => {
    if (typeof row?.id !== "string" || typeof row?.from_id !== "string") invalid();
    return {
      id: row.id,
      planck: planck(row.amount),
      timestamp: moment(row.timestamp),
      height: height(row.block?.height),
      from: row.from_id,
    };
  });
}

/**
 * The transfers that are really this address's own block rewards arriving,
 * separated from the ones somebody actually paid it.
 *
 * The chain credits a reward with one or more transfers inside the block it
 * was earned, and the amounts do not line up one to one: the base reward and
 * the block's fees arrive separately, and the indexer's `miner_reward` row
 * carries only part of the total. So the split runs in two passes. First,
 * inside each block this address mined, transfers are counted against that
 * block's reward until it is used up — that identifies the account the chain
 * mints from without hard-coding an address the runtime is free to change.
 * Second, everything else that account sent is emission too, so it joins the
 * payouts rather than heading a solo miner's list of "who paid me".
 *
 * A real payment from that same account would be misread as emission, which
 * is the right trade: it is a runtime pseudo-account that pays no one.
 */
export function splitRewardPayouts(transfers: Payout[], rewards: Entry[]): { payouts: Payout[]; rest: Payout[] } {
  const budget = new Map<number, bigint>();
  for (const reward of rewards) budget.set(reward.height, (budget.get(reward.height) ?? 0n) + reward.planck);
  const minters = new Set<string>();
  const matched = new Set<string>();
  for (const transfer of transfers) {
    const left = budget.get(transfer.height) ?? 0n;
    if (transfer.planck > 0n && transfer.planck <= left) {
      budget.set(transfer.height, left - transfer.planck);
      minters.add(transfer.from);
      matched.add(transfer.id);
    }
  }
  const payouts: Payout[] = [];
  const rest: Payout[] = [];
  for (const transfer of transfers) {
    (matched.has(transfer.id) || minters.has(transfer.from) ? payouts : rest).push(transfer);
  }
  return { payouts, rest };
}

/** Local calendar day of a moment, `YYYY-MM-DD`, which is how the bars are grouped. */
export function localDay(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, "0")}`;
}

export type DayBucket = { date: string; count: number; planck: bigint };

/**
 * One bucket per local day over the last `days` days, oldest first, with
 * empty days kept so the bars keep their spacing. Entries outside the window
 * are ignored rather than folded into the first day.
 */
export function groupByDay(entries: Entry[], days: number, now: number): DayBucket[] {
  const buckets = new Map<string, DayBucket>();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (let back = days - 1; back >= 0; back -= 1) {
    const day = new Date(start);
    day.setDate(day.getDate() - back);
    const key = localDay(day.getTime());
    buckets.set(key, { date: key, count: 0, planck: 0n });
  }
  for (const entry of entries) {
    const bucket = buckets.get(localDay(entry.timestamp));
    if (!bucket) continue;
    bucket.count += 1;
    bucket.planck += entry.planck;
  }
  return [...buckets.values()];
}

export type WindowTotal = { hours: number; count: number; planck: bigint };

/** Totals over the trailing windows, each measured back from `now`. */
export function windowTotals(entries: Entry[], now: number, windows: number[] = WINDOWS): WindowTotal[] {
  return windows.map((hours) => {
    const from = now - hours * 3_600_000;
    let count = 0;
    let total = 0n;
    for (const entry of entries) {
      if (entry.timestamp >= from && entry.timestamp <= now) {
        count += 1;
        total += entry.planck;
      }
    }
    return { hours, count, planck: total };
  });
}

/**
 * The hashrate implied by how many blocks this address actually found: its
 * share of the blocks the whole network produced over the same window,
 * applied to the network hashrate. Null when either count is missing, and
 * deliberately not "corrected" for luck — over a short window the number
 * swings, which is exactly what the page says next to it.
 */
export function effectiveHashrate(
  minedBlocks: number,
  networkBlocks: number,
  networkHashrate: number,
): number | null {
  if (!Number.isFinite(minedBlocks) || !Number.isFinite(networkBlocks) || !Number.isFinite(networkHashrate)) return null;
  if (minedBlocks < 0 || networkBlocks <= 0 || networkHashrate <= 0) return null;
  return (minedBlocks / networkBlocks) * networkHashrate;
}

/** Actual blocks against the blocks the calculator expected, 1 being exactly on plan. */
export function luckRatio(actualBlocks: number, expectedBlocks: number): number | null {
  if (!Number.isFinite(actualBlocks) || !Number.isFinite(expectedBlocks) || expectedBlocks <= 0) return null;
  return actualBlocks / expectedBlocks;
}

export type Source = {
  address: string;
  count: number;
  planck: bigint;
  /** Most recent payment from this sender. */
  latest: number;
};

/** Who paid, biggest total first; ties broken by the more recent payment. */
export function groupSources(transfers: Payout[]): Source[] {
  const sources = new Map<string, Source>();
  for (const transfer of transfers) {
    const source = sources.get(transfer.from) ?? { address: transfer.from, count: 0, planck: 0n, latest: 0 };
    source.count += 1;
    source.planck += transfer.planck;
    source.latest = Math.max(source.latest, transfer.timestamp);
    sources.set(transfer.from, source);
  }
  return [...sources.values()].sort((a, b) =>
    a.planck === b.planck ? b.latest - a.latest : a.planck > b.planck ? -1 : 1,
  );
}
