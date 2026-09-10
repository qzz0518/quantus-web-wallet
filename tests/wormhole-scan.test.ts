import { describe, expect, test } from "bun:test";
import { stringToU8a } from "@polkadot/util";
import { blake2AsHex, encodeAddress } from "@polkadot/util-crypto";
import { MAINNET } from "../src/lib/chain";
import {
  WormholeScanError,
  scanWormhole,
  usedNullifierKey,
  type WormholeScanWorker,
} from "../src/lib/wormhole/scan";
import type { WormholeBranch, WormholeScanProgress } from "../src/lib/wormhole/types";

// Well-known BIP39 test phrase; never holds funds.
const PHRASE = `${"abandon ".repeat(23)}art`;
const QTC = 1_000_000_000_000n;
const FINALIZED = "0x" + "ab".repeat(32);
const HEIGHT = 5000;

type MockDeposit = {
  branch: WormholeBranch;
  index: number;
  transferCount: number;
  amount: bigint;
  spent?: boolean;
  height?: number;
  id?: string;
};

/** Deterministic stand-ins for the WASM derivations; only shapes matter here. */
function addressOf(branch: WormholeBranch, index: number): string {
  const bytes = new Uint8Array(32);
  bytes[0] = branch + 1;
  bytes[1] = (index >>> 16) & 0xff;
  bytes[2] = (index >>> 8) & 0xff;
  bytes[3] = index & 0xff;
  return encodeAddress(bytes, MAINNET.ss58Prefix);
}
const nullifierOf = (branch: number, index: number, transferCount: string) =>
  blake2AsHex(stringToU8a(`nullifier:${branch}:${index}:${transferCount}`), 256);

function mockWorker(): WormholeScanWorker & { calls: { addresses: number; nullifiers: number } } {
  const calls = { addresses: 0, nullifiers: 0 };
  return {
    calls,
    async deriveAddresses(mnemonic, branch, start, count) {
      expect(mnemonic).toBe(PHRASE);
      calls.addresses++;
      return Array.from({ length: count }, (_, i) => addressOf(branch, start + i));
    },
    async computeNullifiers(mnemonic, inputs) {
      expect(mnemonic).toBe(PHRASE);
      calls.nullifiers++;
      return inputs.map((input) => nullifierOf(input.branch, input.index, input.transferCount));
    },
  };
}

type World = {
  deposits: MockDeposit[];
  rpcGenesis?: string;
  indexerGenesis?: string;
  indexerHead?: number;
  anchorHash?: string;
  storageBlock?: string;
  dropKeys?: boolean;
  onRequest?: (url: string, body: Record<string, unknown>) => void;
};

function mockFetcher(world: World) {
  const log: { url: string; body: Record<string, unknown> }[] = [];
  const unknownKeys: string[] = [];
  const spentKeys = new Set(
    world.deposits
      .filter((deposit) => deposit.spent)
      .map((deposit) => usedNullifierKey(nullifierOf(deposit.branch, deposit.index, String(deposit.transferCount)))),
  );
  const allKeys = new Set(
    world.deposits.map((deposit) =>
      usedNullifierKey(nullifierOf(deposit.branch, deposit.index, String(deposit.transferCount))),
    ),
  );
  const rows = world.deposits.map((deposit, position) => ({
    id: deposit.id ?? `t${String(position).padStart(6, "0")}`,
    amount: deposit.amount.toString(),
    timestamp: "2026-09-01T00:00:00Z",
    leaf_index: String(position),
    transfer_count: String(deposit.transferCount),
    to_hash: "0x" + "cd".repeat(32),
    to: { id: addressOf(deposit.branch, deposit.index) },
    block: { height: deposit.height ?? 100 + position, hash: "0x" + "ef".repeat(32) },
  }));
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    log.push({ url, body });
    world.onRequest?.(url, body);
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (url === MAINNET.rpcUrl) {
      const { id, method, params } = body as { id: number; method: string; params: unknown[] };
      let result: unknown;
      if (method === "chain_getFinalizedHead") result = FINALIZED;
      else if (method === "chain_getBlockHash") result = world.rpcGenesis ?? MAINNET.genesisHash;
      else if (method === "chain_getHeader") {
        expect(params[0]).toBe(FINALIZED);
        result = { number: "0x" + HEIGHT.toString(16) };
      } else if (method === "state_queryStorageAt") {
        const [keys, at] = params as [string[], string];
        expect(at).toBe(FINALIZED);
        expect(keys.length).toBeLessThanOrEqual(100);
        for (const key of keys) if (!allKeys.has(key)) unknownKeys.push(key);
        const answered = world.dropKeys ? keys.slice(1) : keys;
        result = [{ block: world.storageBlock ?? at, changes: answered.map((key) => [key, spentKeys.has(key) ? "0x" : null]) }];
      } else throw new Error(`unexpected rpc ${method}`);
      return Response.json({ jsonrpc: "2.0", id, result });
    }
    if (url === MAINNET.indexerUrl) {
      const { query, variables } = body as { query: string; variables: Record<string, unknown> };
      if (query.includes("WormholeScanAnchor")) {
        expect(variables.height).toBe(HEIGHT);
        return Response.json({
          data: {
            head: [{ height: world.indexerHead ?? HEIGHT + 3, hash: "0x" + "77".repeat(32) }],
            anchor: [{ height: HEIGHT, hash: world.anchorHash ?? FINALIZED }],
            genesis: [{ height: 0, hash: world.indexerGenesis ?? MAINNET.genesisHash }],
          },
        });
      }
      const { tos, height, limit, offset } = variables as { tos: string[]; height: number; limit: number; offset: number };
      expect(tos.length).toBeLessThanOrEqual(20);
      const matching = rows
        .filter((row) => tos.includes(row.to.id) && row.block.height <= height)
        .sort((a, b) => a.block.height - b.block.height || a.id.localeCompare(b.id));
      return Response.json({ data: { transfer: matching.slice(offset, offset + limit) } });
    }
    throw new Error(`unexpected host ${url}`);
  }) as unknown as typeof fetch;
  return { fetcher, log, unknownKeys };
}

async function failure(promise: Promise<unknown>): Promise<WormholeScanError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WormholeScanError) return error;
    throw error;
  }
  throw new Error("expected the scan to fail");
}

describe("wormhole scan", () => {
  test("stops after 20 unused addresses per branch and separates spent from unspent", async () => {
    const world: World = {
      deposits: [
        { branch: 0, index: 0, transferCount: 0, amount: 5n * QTC },
        { branch: 0, index: 0, transferCount: 1, amount: 3n * QTC, spent: true },
        { branch: 0, index: 25, transferCount: 0, amount: QTC },
        { branch: 1, index: 3, transferCount: 7, amount: 2n * QTC, spent: true },
        // Newer than the snapshot: must not appear.
        { branch: 0, index: 1, transferCount: 0, amount: 99n * QTC, height: HEIGHT + 1 },
      ],
    };
    const { fetcher, log, unknownKeys } = mockFetcher(world);
    const worker = mockWorker();
    const progress: WormholeScanProgress[] = [];
    const snapshot = await scanWormhole({
      mnemonic: PHRASE,
      expectedAddress: addressOf(0, 0),
      fetcher,
      worker,
      onProgress: (update) => progress.push(update),
    });
    expect(snapshot.blockHeight).toBe(HEIGHT);
    expect(snapshot.blockHash).toBe(FINALIZED);
    expect(snapshot.indexedHeight).toBe(HEIGHT + 3);
    expect(snapshot.branches[0]).toEqual({ branch: 0, scanned: 60, used: [0, 25] });
    expect(snapshot.branches[1]).toEqual({ branch: 1, scanned: 40, used: [3] });
    expect(snapshot.deposits.map((d) => [d.branch, d.index, d.transferCount, d.spent])).toEqual([
      [0, 0, "0", false],
      [0, 0, "1", true],
      [0, 25, "0", false],
      [1, 3, "7", true],
    ]);
    expect(snapshot.unspentPlanck).toBe((6n * QTC).toString());
    expect(snapshot.spentPlanck).toBe((5n * QTC).toString());
    expect(snapshot.expectedAddressFound).toBe(true);
    expect(snapshot.deposits[0].nullifier).toBe(nullifierOf(0, 0, "0"));
    expect(snapshot.deposits[0].timestamp).toBe("2026-09-01T00:00:00Z");
    expect(snapshot.deposits[0].address).toBe(addressOf(0, 0));
    expect(unknownKeys).toEqual([]);
    expect(worker.calls.addresses).toBe(5);
    expect(worker.calls.nullifiers).toBe(1);
    expect(new Set(log.map((entry) => entry.url))).toEqual(new Set([MAINNET.rpcUrl, MAINNET.indexerUrl]));
    expect(progress[0]).toEqual({ stage: "network" });
    expect(progress.some((p) => p.stage === "addresses" && p.branch === 1)).toBe(true);
    expect(progress.at(-1)?.stage).toBe("nullifiers");
  });

  test("computes the UsedNullifiers storage key as twox128 prefixes plus blake2_128 concat", () => {
    const nullifier = "0x" + "01".repeat(32);
    const key = usedNullifierKey(nullifier);
    // twox128("Wormhole") ++ twox128("UsedNullifiers") ++ blake2_128(n) ++ n = 16 + 16 + 16 + 32 bytes.
    expect(key).toMatch(/^0x[\da-f]{160}$/);
    expect(key.endsWith("01".repeat(32))).toBe(true);
    expect(() => usedNullifierKey("0x1234")).toThrow();
  });

  test("pages deposits 300 at a time until the page is short", async () => {
    const deposits: MockDeposit[] = Array.from({ length: 301 }, (_, i) => ({
      branch: 0,
      index: 2,
      transferCount: i,
      amount: QTC,
      spent: i % 2 === 0,
    }));
    const { fetcher, log } = mockFetcher({ deposits });
    const snapshot = await scanWormhole({ mnemonic: PHRASE, fetcher, worker: mockWorker() });
    expect(snapshot.deposits.length).toBe(301);
    expect(snapshot.unspentPlanck).toBe((150n * QTC).toString());
    expect(snapshot.spentPlanck).toBe((151n * QTC).toString());
    expect(snapshot.expectedAddressFound).toBeUndefined();
    const offsets = log
      .filter((entry) => entry.url === MAINNET.indexerUrl && String(entry.body.query).includes("WormholeScanDeposits"))
      .map((entry) => (entry.body.variables as { offset: number; tos: string[] }))
      .filter((v) => v.tos.includes(addressOf(0, 2)))
      .map((v) => v.offset);
    expect(offsets).toEqual([0, 300]);
    const storageCalls = log.filter((entry) => entry.body.method === "state_queryStorageAt");
    expect(storageCalls.length).toBe(4);
  });

  test("reports an incomplete scan instead of a smaller balance when a cap is hit", async () => {
    const busy: MockDeposit[] = Array.from({ length: 12 }, (_, i) => ({
      branch: 0,
      index: i * 15,
      transferCount: 0,
      amount: QTC,
    }));
    const addressCap = await failure(
      scanWormhole({ mnemonic: PHRASE, fetcher: mockFetcher({ deposits: busy }).fetcher, worker: mockWorker(), maxAddressesPerBranch: 100 }),
    );
    expect(addressCap.code).toBe("incomplete");
    const depositCap = await failure(
      scanWormhole({ mnemonic: PHRASE, fetcher: mockFetcher({ deposits: busy }).fetcher, worker: mockWorker(), maxDeposits: 5 }),
    );
    expect(depositCap.code).toBe("incomplete");
    // The same deposits scan fine with the default caps.
    const snapshot = await scanWormhole({ mnemonic: PHRASE, fetcher: mockFetcher({ deposits: busy }).fetcher, worker: mockWorker() });
    expect(snapshot.deposits.length).toBe(12);
    expect(snapshot.branches[0].scanned).toBe(200);
  });

  test("refuses to scan when the node and the indexer disagree", async () => {
    const deposits: MockDeposit[] = [{ branch: 0, index: 0, transferCount: 0, amount: QTC }];
    const cases: [World, string][] = [
      [{ deposits, anchorHash: "0x" + "99".repeat(32) }, "anchor hash"],
      [{ deposits, indexerHead: HEIGHT - 1 }, "indexer behind"],
      [{ deposits, indexerGenesis: "0x" + "99".repeat(32) }, "indexer genesis"],
      [{ deposits, rpcGenesis: "0x" + "99".repeat(32) }, "rpc genesis"],
      [{ deposits, storageBlock: "0x" + "99".repeat(32) }, "storage block"],
    ];
    for (const [world, label] of cases) {
      const error = await failure(scanWormhole({ mnemonic: PHRASE, fetcher: mockFetcher(world).fetcher, worker: mockWorker() }));
      expect(`${label}:${error.code}`).toBe(`${label}:mismatch`);
    }
    const missing = await failure(
      scanWormhole({ mnemonic: PHRASE, fetcher: mockFetcher({ deposits, dropKeys: true }).fetcher, worker: mockWorker() }),
    );
    expect(missing.code).toBe("invalid");
  });

  test("reports whether the address from the official wallet was derived", async () => {
    const deposits: MockDeposit[] = [{ branch: 1, index: 4, transferCount: 0, amount: QTC }];
    const found = await scanWormhole({ mnemonic: PHRASE, fetcher: mockFetcher({ deposits }).fetcher, worker: mockWorker(), expectedAddress: addressOf(1, 4) });
    expect(found.expectedAddressFound).toBe(true);
    const other = await scanWormhole({
      mnemonic: PHRASE,
      fetcher: mockFetcher({ deposits }).fetcher,
      worker: mockWorker(),
      expectedAddress: encodeAddress(new Uint8Array(32).fill(9), MAINNET.ss58Prefix),
    });
    expect(other.expectedAddressFound).toBe(false);
    await expect(scanWormhole({ mnemonic: PHRASE, fetcher: mockFetcher({ deposits }).fetcher, worker: mockWorker(), expectedAddress: "0x1234" })).rejects.toThrow();
    await expect(scanWormhole({ mnemonic: "not a phrase", fetcher: mockFetcher({ deposits }).fetcher, worker: mockWorker() })).rejects.toThrow();
  });

  test("finds nothing for an unused phrase and stops after one batch per branch", async () => {
    const { fetcher } = mockFetcher({ deposits: [] });
    const snapshot = await scanWormhole({ mnemonic: PHRASE, fetcher, worker: mockWorker() });
    expect(snapshot.deposits).toEqual([]);
    expect(snapshot.unspentPlanck).toBe("0");
    expect(snapshot.branches.map((b) => b.scanned)).toEqual([20, 20]);
  });

  test("stops with an aborted error when the signal fires", async () => {
    const controller = new AbortController();
    let requests = 0;
    const { fetcher } = mockFetcher({
      deposits: [{ branch: 0, index: 0, transferCount: 0, amount: QTC }],
      onRequest: () => {
        if (++requests === 4) controller.abort();
      },
    });
    const error = await failure(scanWormhole({ mnemonic: PHRASE, fetcher, worker: mockWorker(), signal: controller.signal }));
    expect(error.code).toBe("aborted");
    expect(requests).toBeLessThan(8);
  });
});
