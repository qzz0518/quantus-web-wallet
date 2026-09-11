import { describe, expect, test } from "bun:test";
import {
  TOTAL_ISSUANCE_KEY,
  fetchBlocksSince,
  fetchChainTotals,
  fetchDailyStats,
  fetchTotalIssuance,
} from "../src/lib/network/data";
import { storageKey } from "../src/lib/mining/data";

/** The reply the mainnet RPC gave for Balances.TotalIssuance on 2026-09-11. */
const ISSUANCE_HEX = "0x466f40f4af10ce4e0000000000000000";

function rpcFetcher(result: unknown, seen: { key?: string } = {}): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
    seen.key = body.params[0] as string;
    expect(body.method).toBe("state_getStorage");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { status: 200 });
  }) as typeof fetch;
}

function graphql(payload: unknown, seen: { variables?: Record<string, unknown> } = {}): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    seen.variables = (JSON.parse(String(init?.body)) as { variables: Record<string, unknown> }).variables;
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;
}

const daily = (id: string, blocks: number, tx: number, accounts: number) => ({
  id,
  blocks_count: blocks,
  tx_count: tx,
  active_accounts: accounts,
});

describe("total issuance", () => {
  test("asks for the Balances.TotalIssuance key and decodes the u128", async () => {
    const seen: { key?: string } = {};
    const result = await fetchTotalIssuance({ fetcher: rpcFetcher(ISSUANCE_HEX, seen) });
    expect(seen.key).toBe(storageKey("Balances", "TotalIssuance"));
    expect(seen.key).toBe(TOTAL_ISSUANCE_KEY);
    expect(result.issuancePlanck).toBe(5_678_494_528_063_958_854n);
  });

  test("refuses a reading that is not a 16-byte little-endian integer", async () => {
    await expect(fetchTotalIssuance({ fetcher: rpcFetcher("0x1234") })).rejects.toThrow();
    await expect(fetchTotalIssuance({ fetcher: rpcFetcher(null) })).rejects.toThrow();
    await expect(fetchTotalIssuance({ fetcher: rpcFetcher("0x" + "00".repeat(16)) })).rejects.toThrow();
  });
});

describe("daily counters", () => {
  test("returns them oldest first without the genesis placeholder", async () => {
    const seen: { variables?: Record<string, unknown> } = {};
    const rows = await fetchDailyStats({
      days: 30,
      fetcher: graphql(
        {
          data: {
            daily_chain_stats: [
              daily("2026-09-11", 3608, 5882, 684),
              daily("2026-09-10", 6972, 8839, 553),
              daily("2026-09-09", 17193, 6369, 26),
              daily("1970-01-01", 1, 0, 0),
            ],
          },
        },
        seen,
      ),
    });
    expect(seen.variables?.limit).toBe(31);
    expect(rows.map((row) => row.date)).toEqual(["2026-09-09", "2026-09-10", "2026-09-11"]);
    expect(rows[2]).toEqual({ date: "2026-09-11", blocks: 3608, transactions: 5882, activeAccounts: 684 });
  });

  test("never returns more days than asked for", async () => {
    const rows = await fetchDailyStats({
      days: 2,
      fetcher: graphql({
        data: {
          daily_chain_stats: [
            daily("2026-09-11", 1, 1, 1),
            daily("2026-09-10", 2, 2, 2),
            daily("2026-09-09", 3, 3, 3),
          ],
        },
      }),
    });
    expect(rows.map((row) => row.date)).toEqual(["2026-09-10", "2026-09-11"]);
  });

  test("rejects a malformed row instead of drawing it", async () => {
    await expect(
      fetchDailyStats({ fetcher: graphql({ data: { daily_chain_stats: [{ id: "yesterday" }] } }) }),
    ).rejects.toThrow();
    await expect(
      fetchDailyStats({ fetcher: graphql({ data: { daily_chain_stats: [daily("2026-09-11", -1, 0, 0)] } }) }),
    ).rejects.toThrow();
    await expect(fetchDailyStats({ fetcher: graphql({ errors: [{ message: "no" }] }) })).rejects.toThrow();
  });
});

describe("running totals", () => {
  test("reads the global row", async () => {
    const totals = await fetchChainTotals({
      fetcher: graphql({
        data: {
          chain_stats_by_pk: {
            block_height: 27772,
            total_accounts: 2045,
            total_miners: 77,
            total_miner_rewards: 27772,
          },
        },
      }),
    });
    expect(totals.totalAccounts).toBe(2045);
    expect(totals.totalMiners).toBe(77);
    expect(totals.blockHeight).toBe(27772);
  });

  test("rejects a missing row rather than printing zeros", async () => {
    await expect(fetchChainTotals({ fetcher: graphql({ data: { chain_stats_by_pk: null } }) })).rejects.toThrow();
  });
});

describe("blocks over a window", () => {
  test("sends the window as an ISO timestamp and returns the count", async () => {
    const seen: { variables?: Record<string, unknown> } = {};
    const since = new Date("2026-09-10T16:00:00.000Z");
    const count = await fetchBlocksSince(since, {
      fetcher: graphql({ data: { block_aggregate: { aggregate: { count: 5752 } } } }, seen),
    });
    expect(seen.variables?.since).toBe("2026-09-10T16:00:00.000Z");
    expect(count).toBe(5752);
  });

  test("rejects an aggregate without a count", async () => {
    await expect(
      fetchBlocksSince(new Date(), { fetcher: graphql({ data: { block_aggregate: { aggregate: null } } }) }),
    ).rejects.toThrow();
  });
});
