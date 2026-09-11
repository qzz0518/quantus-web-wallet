import { describe, expect, test } from "bun:test";
import {
  EMPTY_PREFS,
  MINER_STORAGE_KEY,
  RECENT_LIMIT,
  WINDOWS,
  effectiveHashrate,
  fetchIncomingTransfers,
  fetchMinerRewards,
  fetchMinerTotals,
  groupByDay,
  groupSources,
  loadMinerPrefs,
  localDay,
  luckRatio,
  markPool,
  normalizePrefs,
  rememberAddress,
  saveMinerPrefs,
  splitRewardPayouts,
  windowTotals,
  type Entry,
  type Payout,
} from "../src/lib/mining/miner";

/** Three mainnet addresses: a miner, the chain's minting account, and a third party. */
const MINER = "qzmb4MVgBfg1fhcH6uf4uyqgrsLeCaDfUucrVPpnfGubJHTSR";
const MINT = "qzjUYyuN4L3HKmBPMxHvK2n8HYnaLZcQvLSQTgdwB2nQ1g2mc";
const OTHER = "qzowWAgbzjc2XfHY4vyEo2eVLKbknTESUFoXnisQuUh1x1koo";
const REWARD = 310_000_000_000n;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Local noon, so every offset below stays inside its own calendar day. */
const NOW = new Date(2026, 8, 11, 12, 0, 0).getTime();

const entry = (id: string, ago: number, height: number, planck = REWARD): Entry => ({
  id,
  timestamp: NOW - ago,
  planck,
  height,
});
const payout = (id: string, ago: number, height: number, from: string, planck = REWARD): Payout => ({
  ...entry(id, ago, height, planck),
  from,
});

function fetcher(payload: unknown, seen: { variables?: Record<string, unknown>[] } = {}): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { variables: Record<string, unknown> };
    (seen.variables ??= []).push(body.variables);
    const list = Array.isArray(payload) ? payload : [payload];
    const index = Math.min(seen.variables.length - 1, list.length - 1);
    return new Response(JSON.stringify(list[index]), { status: 200 });
  }) as typeof fetch;
}

/** A store the test owns, so nothing here depends on a browser being present. */
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("stored preferences", () => {
  test("keeps only valid addresses, newest first, up to the limit", () => {
    let prefs = EMPTY_PREFS;
    for (const value of [MINER, OTHER, MINT, MINER]) prefs = rememberAddress(prefs, value);
    expect(prefs.recent).toEqual([MINER, MINT, OTHER]);
    expect(rememberAddress(prefs, "not-an-address")).toBe(prefs);
  });

  test("never grows past the recent limit", () => {
    let prefs = EMPTY_PREFS;
    // Distinct values are scarce, so repeat the three known ones and check the cap holds.
    for (let i = 0; i < 10; i += 1) prefs = rememberAddress(prefs, [MINER, OTHER, MINT][i % 3]);
    expect(prefs.recent.length).toBeLessThanOrEqual(RECENT_LIMIT);
  });

  test("marks and unmarks a pool, trimming the label", () => {
    const marked = markPool(EMPTY_PREFS, MINT, "  Pool A  ");
    expect(marked.pools[MINT]).toBe("Pool A");
    expect(markPool(marked, MINT, null).pools).toEqual({});
    expect(markPool(marked, MINT, "   ").pools).toEqual({});
    expect(markPool(EMPTY_PREFS, "nope", "x")).toBe(EMPTY_PREFS);
  });

  test("reads back what it wrote and drops what it cannot trust", () => {
    const storage = memoryStorage();
    saveMinerPrefs(markPool(rememberAddress(EMPTY_PREFS, MINER), MINT, "Pool A"), storage);
    expect(loadMinerPrefs(storage)).toEqual({ recent: [MINER], pools: { [MINT]: "Pool A" } });

    storage.setItem(MINER_STORAGE_KEY, "{ not json");
    expect(loadMinerPrefs(storage)).toEqual(EMPTY_PREFS);
    expect(loadMinerPrefs(null)).toEqual(EMPTY_PREFS);
  });

  test("salvages an older or partly broken record instead of discarding it", () => {
    expect(normalizePrefs({ recent: [MINER, "junk", MINER], pools: { junk: "x", [MINT]: 7 } })).toEqual({
      recent: [MINER],
      pools: {},
    });
    expect(normalizePrefs(null)).toEqual(EMPTY_PREFS);
    expect(normalizePrefs({ recent: "no", pools: "no" })).toEqual(EMPTY_PREFS);
    expect(normalizePrefs({ pools: { [MINT]: "x".repeat(80) } }).pools[MINT].length).toBe(40);
  });
});

describe("daily grouping", () => {
  const rows = [entry("a", 0, 10), entry("b", HOUR, 9), entry("c", DAY, 8), entry("d", 40 * DAY, 1)];

  test("keeps one bucket per local day, oldest first, empty days included", () => {
    const days = groupByDay(rows, 30, NOW);
    expect(days.length).toBe(30);
    expect(days[29].date).toBe(localDay(NOW));
    expect(days[29].count).toBe(2);
    expect(days[29].planck).toBe(REWARD * 2n);
    expect(days[28].count).toBe(1);
    expect(days[0].count).toBe(0);
  });

  test("ignores entries outside the window rather than folding them into day one", () => {
    const days = groupByDay(rows, 30, NOW);
    expect(days.reduce((sum, day) => sum + day.count, 0)).toBe(3);
  });

  test("keys days by the reader's own calendar, not by UTC", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30).getTime())).toBe("2026-01-05");
    expect(localDay(new Date(2026, 0, 6, 0, 30).getTime())).toBe("2026-01-06");
  });
});

describe("window totals", () => {
  const rows = [entry("a", HOUR, 10), entry("b", 3 * DAY, 9), entry("c", 20 * DAY, 8), entry("d", 60 * DAY, 1)];

  test("counts each trailing window back from now", () => {
    const [day, week, month] = windowTotals(rows, NOW, WINDOWS);
    expect([day.count, week.count, month.count]).toEqual([1, 2, 3]);
    expect(month.planck).toBe(REWARD * 3n);
    expect(day.hours).toBe(24);
  });

  test("ignores entries dated in the future", () => {
    expect(windowTotals([entry("x", -HOUR, 11)], NOW, [24])[0].count).toBe(0);
  });
});

describe("effective hashrate", () => {
  test("scales the network hashrate by the share of blocks found", () => {
    expect(effectiveHashrate(100, 5000, 13e12)).toBeCloseTo(2.6e11, 0);
    expect(effectiveHashrate(0, 5000, 13e12)).toBe(0);
  });

  test("answers null rather than dividing by nothing", () => {
    expect(effectiveHashrate(10, 0, 13e12)).toBeNull();
    expect(effectiveHashrate(10, 5000, 0)).toBeNull();
    expect(effectiveHashrate(-1, 5000, 13e12)).toBeNull();
    expect(effectiveHashrate(10, 5000, Number.NaN)).toBeNull();
  });

  test("reads luck as actual over expected", () => {
    expect(luckRatio(120, 100)).toBeCloseTo(1.2, 6);
    expect(luckRatio(0, 100)).toBe(0);
    expect(luckRatio(10, 0)).toBeNull();
  });
});

describe("payout sources", () => {
  const rewards = [entry("r1", HOUR, 100), entry("r2", 2 * HOUR, 99)];
  const transfers = [
    payout("t1", HOUR, 100, MINT),
    payout("t2", 2 * HOUR, 99, MINT),
    payout("t3", 3 * HOUR, 98, OTHER, 5_000_000_000_000n),
    payout("t4", 4 * HOUR, 97, OTHER, 1_000_000_000_000n),
    payout("t5", 5 * HOUR, 96, MINER, 2_000_000_000_000n),
  ];

  test("takes out the transfers that are this address's own block rewards", () => {
    const { payouts, rest } = splitRewardPayouts(transfers, rewards);
    expect(payouts.map((row) => row.id)).toEqual(["t1", "t2"]);
    expect(rest.map((row) => row.id)).toEqual(["t3", "t4", "t5"]);
  });

  test("accounts for a reward paid as a base amount plus the block's fees", () => {
    const split = [
      payout("s1", HOUR, 100, MINT, REWARD - 20_000_000_000n),
      payout("s2", HOUR, 100, MINT, 20_000_000_000n),
    ];
    const { payouts, rest } = splitRewardPayouts(split, rewards);
    expect(payouts.map((row) => row.id)).toEqual(["s1", "s2"]);
    expect(rest).toEqual([]);
  });

  test("keeps a payment larger than the reward still unaccounted for", () => {
    const mixed = [payout("t1", HOUR, 100, MINT), payout("big", HOUR, 100, OTHER, 5_000_000_000_000n)];
    const { payouts, rest } = splitRewardPayouts(mixed, rewards);
    expect(payouts.map((row) => row.id)).toEqual(["t1"]);
    expect(rest.map((row) => row.id)).toEqual(["big"]);
  });

  test("treats everything else from the minting account as emission too", () => {
    // The chain also credits small amounts the `miner_reward` row does not
    // cover; once its account is identified they belong with the rewards.
    const extra = [
      payout("t1", HOUR, 100, MINT),
      payout("dust", HOUR, 100, MINT, 20_000_000_000n),
      payout("pool", 3 * HOUR, 98, OTHER, 20_000_000_000n),
    ];
    const { payouts, rest } = splitRewardPayouts(extra, rewards);
    expect(payouts.map((row) => row.id)).toEqual(["t1", "dust"]);
    expect(rest.map((row) => row.id)).toEqual(["pool"]);
  });

  test("keeps a transfer in a block this address never mined", () => {
    const odd = [payout("t9", HOUR, 5, OTHER, 1n)];
    expect(splitRewardPayouts(odd, rewards).rest.map((row) => row.id)).toEqual(["t9"]);
  });

  test("groups the rest by sender, biggest total first", () => {
    const { rest } = splitRewardPayouts(transfers, rewards);
    const sources = groupSources(rest);
    expect(sources.map((source) => source.address)).toEqual([OTHER, MINER]);
    expect(sources[0]).toMatchObject({ count: 2, planck: 6_000_000_000_000n });
    expect(sources[0].latest).toBe(NOW - 3 * HOUR);
  });

  test("breaks a tie on the more recent payment", () => {
    const sources = groupSources([
      payout("a", 5 * HOUR, 5, OTHER, 1n),
      payout("b", HOUR, 6, MINER, 1n),
    ]);
    expect(sources[0].address).toBe(MINER);
  });
});

describe("indexer reads", () => {
  test("returns null when the address has never been indexed", async () => {
    expect(await fetchMinerTotals(MINER, { fetcher: fetcher({ data: { account_stats_by_pk: null } }) })).toBeNull();
  });

  test("reads lifetime totals", async () => {
    const totals = await fetchMinerTotals(MINER, {
      fetcher: fetcher({ data: { account_stats_by_pk: { total_mined_blocks: 1980, total_rewards: "610940000000000" } } }),
    });
    expect(totals).toEqual({ minedBlocks: 1980, rewardPlanck: 610_940_000_000_000n });
  });

  test("pages through the rewards until a short page arrives", async () => {
    const full = {
      data: {
        miner_reward: Array.from({ length: 1000 }, (_, index) => ({
          id: `p1-${index}`,
          reward: "310000000000",
          timestamp: "2026-09-11T16:31:57.999+00:00",
          block: { height: 27_766 - index },
        })),
      },
    };
    const tail = {
      data: {
        miner_reward: [
          { id: "p2-0", reward: "300000000000", timestamp: "2026-09-10T16:31:57.999+00:00", block: { height: 20_000 } },
        ],
      },
    };
    const seen: { variables?: Record<string, unknown>[] } = {};
    const rows = await fetchMinerRewards(MINER, new Date("2026-08-12T00:00:00.000Z"), {
      fetcher: fetcher([full, tail], seen),
    });
    expect(rows.length).toBe(1001);
    expect(seen.variables?.map((variables) => variables.offset)).toEqual([0, 1000]);
    expect(seen.variables?.[0].since).toBe("2026-08-12T00:00:00.000Z");
    expect(rows[1000]).toMatchObject({ planck: 300_000_000_000n, height: 20_000 });
  });

  test("reads incoming transfers with their sender", async () => {
    const rows = await fetchIncomingTransfers(MINER, new Date("2026-08-12T00:00:00.000Z"), {
      fetcher: fetcher({
        data: {
          transfer: [
            { id: "t1", amount: "310000000000", timestamp: "2026-09-11T16:31:57.999+00:00", from_id: MINT, block: { height: 27_766 } },
          ],
        },
      }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from: MINT, planck: REWARD, height: 27_766 });
  });

  test("rejects malformed rows instead of counting them as zero", async () => {
    await expect(
      fetchMinerRewards(MINER, new Date(), { fetcher: fetcher({ data: { miner_reward: [{ id: "x", reward: "abc" }] } }) }),
    ).rejects.toThrow();
    await expect(
      fetchIncomingTransfers(MINER, new Date(), { fetcher: fetcher({ errors: [{ message: "no" }] }) }),
    ).rejects.toThrow();
    await expect(fetchMinerTotals("not-an-address", { fetcher: fetcher({ data: {} }) })).rejects.toThrow();
  });
});
