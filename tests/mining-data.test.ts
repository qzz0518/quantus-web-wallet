import { describe, expect, test } from "bun:test";
import {
  decodeLeUint,
  fetchBlockReward,
  fetchChainStats,
  fetchMarketPrice,
  fetchPoolStats,
  fetchPoolTerms,
  STORAGE_KEYS,
  storageKey,
} from "../src/lib/mining/data";
import { BUILT_IN_GPUS, BUILT_IN_TERMS, gpuId, shortName } from "../src/lib/mining/gpus";
import {
  defaultInputs,
  loadInputs,
  normalizeInputs,
  parseNumber,
  priceFieldText,
  saveInputs,
  toModel,
} from "../src/lib/mining/inputs";

// Real values read from the mainnet RPC on 2026-09-10.
const HEAD_HASH = "0x" + "11".repeat(32);
const OLD_HASH = "0x88accd9ee1dcc8291536d537371df8f82ce15c3f7e0979a365eb0efdb8dbdf21";
const DIFFICULTY_HEX = "0xa080633a5fe200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
const DURATION_HEX = "0xcf3c000000000000";
const NOW_HEX = "0x7992728ba0010000";
const THEN_HEX = "0xaa174d8ba0010000";

type Handler = (method: string, params: unknown[]) => unknown;

function rpcFetcher(handler: Handler): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
    const result = handler(body.method, body.params);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { status: 200 });
  }) as typeof fetch;
}

function jsonFetcher(payload: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), { status })) as typeof fetch;
}

const chain: Handler = (method, params) => {
  switch (method) {
    case "chain_getBlockHash":
      return params.length === 0 ? HEAD_HASH : OLD_HASH;
    case "chain_getHeader":
      return { number: "0x52aa" };
    case "state_getStorage": {
      const [key, at] = params as [string, string];
      if (key === STORAGE_KEYS.difficulty) return DIFFICULTY_HEX;
      if (key === STORAGE_KEYS.lastBlockDuration) return DURATION_HEX;
      if (key === STORAGE_KEYS.timestamp) return at === HEAD_HASH ? NOW_HEX : THEN_HEX;
      return null;
    }
    default:
      throw new Error(`unexpected ${method}`);
  }
};

describe("storage keys", () => {
  test("are twox128(pallet) ++ twox128(item)", () => {
    expect(STORAGE_KEYS.difficulty).toBe("0xf70798a3fbcee5a2d178b8c516e36ae559769e16105568cee9f916e870cb6e6f");
    expect(STORAGE_KEYS.lastBlockDuration).toBe("0xf70798a3fbcee5a2d178b8c516e36ae56b96b0fad6a6b72fcc7f4cccb14c643e");
    expect(STORAGE_KEYS.timestamp).toBe("0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb");
    expect(storageKey("QPoW", "CurrentDifficulty")).toBe(STORAGE_KEYS.difficulty);
  });
  test("decodes little-endian integers of a fixed width", () => {
    expect(decodeLeUint(DIFFICULTY_HEX, 64)).toBe(248_898_629_370_016n);
    expect(decodeLeUint(DURATION_HEX, 8)).toBe(15567n);
    expect(decodeLeUint(NOW_HEX, 8)).toBe(1_789_045_936_761n);
    expect(() => decodeLeUint(DURATION_HEX, 64)).toThrow();
    expect(() => decodeLeUint("0xzz", 1)).toThrow();
    expect(() => decodeLeUint(null, 8)).toThrow();
  });
});

describe("chain stats", () => {
  test("reads difficulty and averages the block time over the sample", async () => {
    const stats = await fetchChainStats({ fetcher: rpcFetcher(chain) });
    expect(stats.height).toBe(21162);
    expect(stats.difficulty).toBe(248_898_629_370_016n);
    expect(stats.lastBlockDurationMs).toBe(15567);
    expect(stats.sampledBlocks).toBe(200);
    expect(stats.blockTimeSeconds).toBeCloseTo(12.281, 3);
  });
  test("samples no more blocks than exist", async () => {
    const stats = await fetchChainStats({
      fetcher: rpcFetcher((method, params) => (method === "chain_getHeader" ? { number: "0x5" } : chain(method, params))),
    });
    expect(stats.sampledBlocks).toBe(5);
  });
  test("rejects a missing or malformed difficulty", async () => {
    const broken: Handler = (method, params) =>
      method === "state_getStorage" && params[0] === STORAGE_KEYS.difficulty ? null : chain(method, params);
    await expect(fetchChainStats({ fetcher: rpcFetcher(broken) })).rejects.toThrow();
    const short: Handler = (method, params) =>
      method === "state_getStorage" && params[0] === STORAGE_KEYS.difficulty ? "0x0102" : chain(method, params);
    await expect(fetchChainStats({ fetcher: rpcFetcher(short) })).rejects.toThrow();
  });
  test("rejects timestamps that do not advance or an absurd block time", async () => {
    const frozen: Handler = (method, params) =>
      method === "state_getStorage" && params[0] === STORAGE_KEYS.timestamp ? NOW_HEX : chain(method, params);
    await expect(fetchChainStats({ fetcher: rpcFetcher(frozen) })).rejects.toThrow();
    const slow: Handler = (method, params) =>
      method === "state_getStorage" && params[0] === STORAGE_KEYS.timestamp && params[1] === OLD_HASH
        ? "0x0000000000000000"
        : chain(method, params);
    await expect(fetchChainStats({ fetcher: rpcFetcher(slow) })).rejects.toThrow();
  });
  test("rejects a bad hash, HTTP failure and mismatched ids", async () => {
    const badHash: Handler = (method, params) => (method === "chain_getBlockHash" ? "0x1234" : chain(method, params));
    await expect(fetchChainStats({ fetcher: rpcFetcher(badHash) })).rejects.toThrow();
    await expect(fetchChainStats({ fetcher: jsonFetcher({}, 503) })).rejects.toThrow("503");
    await expect(fetchChainStats({ fetcher: jsonFetcher({ jsonrpc: "2.0", id: -1, result: HEAD_HASH }) })).rejects.toThrow();
    await expect(fetchChainStats({ fetcher: jsonFetcher({ jsonrpc: "2.0", id: 1, error: { message: "nope" } }) })).rejects.toThrow();
  });
});

describe("block reward", () => {
  const rows = (rewards: unknown[]) => ({
    data: { miner_reward: rewards.map((reward, index) => ({ reward, block: { height: 21162 - index } })) },
  });
  test("averages recent rewards in planck", async () => {
    const reward = await fetchBlockReward({ fetcher: jsonFetcher(rows(["320000000000", "310000000000", "300000000000"])) });
    expect(reward.blockRewardPlanck).toBe(310_000_000_000n);
    expect(reward.samples).toBe(3);
    expect(reward.latestHeight).toBe(21162);
  });
  test("rejects empty, malformed or implausible rows", async () => {
    await expect(fetchBlockReward({ fetcher: jsonFetcher(rows([])) })).rejects.toThrow();
    await expect(fetchBlockReward({ fetcher: jsonFetcher(rows(["310000000000", 3.1])) })).rejects.toThrow();
    await expect(fetchBlockReward({ fetcher: jsonFetcher(rows(["0"])) })).rejects.toThrow();
    await expect(fetchBlockReward({ fetcher: jsonFetcher(rows(["9999999999999999999"])) })).rejects.toThrow();
    await expect(fetchBlockReward({ fetcher: jsonFetcher({ errors: [{ message: "boom" }] }) })).rejects.toThrow();
    await expect(fetchBlockReward({ fetcher: jsonFetcher({ data: {} }) })).rejects.toThrow();
    await expect(fetchBlockReward({ fetcher: jsonFetcher("not json shape") })).rejects.toThrow();
  });
});

const TERMS = {
  benchmarks: [
    { device: "NVIDIA GeForce RTX 5090", note: "steady state", ours: 1_491_900_000, stock: 341_900_000 },
    { device: "NVIDIA GeForce RTX 4090", note: "median", ours: 1_123_400_000, stock: 178_510_000 },
    { device: "NVIDIA GeForce RTX 6090", ours: 3_000_000_000, stock: 800_000_000 },
  ],
  fee_percent: 1,
  miner_dev_fee_percent: 5,
  block_reward_planck: "310000000000",
};

describe("pool terms", () => {
  test("keeps live hashrates, built-in power and marks unknown devices", async () => {
    const terms = await fetchPoolTerms({ fetcher: jsonFetcher(TERMS) });
    expect(terms.source).toBe("live");
    expect(terms.poolFeePercent).toBe(1);
    expect(terms.minerDevFeePercent).toBe(5);
    // The observed cards the pool does not benchmark are appended, once each.
    expect(terms.gpus.map((gpu) => gpu.id)).toEqual([
      "rtx-5090",
      "rtx-4090",
      "rtx-6090",
      "rtx-4070-ti-super",
      "rtx-4070-super",
      "rtx-3060-ti",
      "rtx-2070",
    ]);
    expect(terms.gpus.find((gpu) => gpu.id === "rtx-2070")).toMatchObject({ stock: null, powerW: 175 });
    expect(terms.gpus[0].powerW).toBe(500);
    expect(terms.gpus[1].short).toBe("RTX 4090");
    expect(terms.gpus[2].powerW).toBeNull();
    expect(terms.gpus[2].note).toBeUndefined();
  });
  test("rejects malformed benchmarks and fees", async () => {
    await expect(fetchPoolTerms({ fetcher: jsonFetcher({ ...TERMS, fee_percent: "1" }) })).rejects.toThrow();
    await expect(fetchPoolTerms({ fetcher: jsonFetcher({ ...TERMS, miner_dev_fee_percent: 500 }) })).rejects.toThrow();
    await expect(fetchPoolTerms({ fetcher: jsonFetcher({ ...TERMS, benchmarks: "x" }) })).rejects.toThrow();
    await expect(fetchPoolTerms({ fetcher: jsonFetcher({ ...TERMS, benchmarks: [] }) })).rejects.toThrow();
    await expect(
      fetchPoolTerms({ fetcher: jsonFetcher({ ...TERMS, benchmarks: [{ device: "RTX 4090", ours: "fast", stock: 1 }] }) }),
    ).rejects.toThrow();
    await expect(
      fetchPoolTerms({ fetcher: jsonFetcher({ ...TERMS, benchmarks: [{ device: "", ours: 1, stock: 1 }] }) }),
    ).rejects.toThrow();
    await expect(fetchPoolTerms({ fetcher: jsonFetcher(TERMS, 500) })).rejects.toThrow();
  });
  test("pool stats need a positive hashrate window", async () => {
    const stats = await fetchPoolStats({ fetcher: jsonFetcher({ hashrate_windows: [1.3e13, 1.8e13, 1.7e13], blocks_24h: 7145, network_miners: 25 }) });
    expect(stats.poolHashrate).toBe(1.7e13);
    expect(stats.blocks24h).toBe(7145);
    expect(stats.networkMiners).toBe(25);
    await expect(fetchPoolStats({ fetcher: jsonFetcher({ hashrate_windows: [] }) })).rejects.toThrow();
    await expect(fetchPoolStats({ fetcher: jsonFetcher({ hashrate_windows: ["18"] }) })).rejects.toThrow();
  });
});

// The shape SafeTrade answers with for the QUANTUS/USDT market.
const TICKER = {
  at: "1789049651",
  ticker: {
    at: "1789049651",
    avg_price: "45.62",
    buy: "47",
    high: "88",
    last: "47",
    low: "20",
    open: "30",
    price_change_percent: "+56.67%",
    sell: "44.88",
    vol: "41192.427432",
    amount: "907.281",
    volume: "41192.427432",
  },
};

describe("market price", () => {
  test("reads the last trade and keeps the exchange's own digits", async () => {
    const market = await fetchMarketPrice({ fetcher: jsonFetcher(TICKER) });
    expect(market.last).toBe(47);
    expect(market.lastText).toBe("47");
    expect(market.source).toBe("last");
    expect(market.bid).toBe(47);
    expect(market.ask).toBe(44.88);
    expect(market.changePercent).toBe("+56.67%");
    expect(market.quoteVolume).toBeCloseTo(41192.427432, 6);
    expect(market.fetchedAt).toBeGreaterThan(0);
  });
  test("keeps the decimals as written so the price field shows them back", async () => {
    const market = await fetchMarketPrice({ fetcher: jsonFetcher({ ticker: { ...TICKER.ticker, last: "0.004500" } }) });
    expect(market.lastText).toBe("0.004500");
    expect(market.last).toBe(0.0045);
  });
  test("refuses a price that is not a positive decimal string", async () => {
    for (const last of [47, "-3", "", "abc", "1e3", null, "1,5", "9999999999"]) {
      await expect(fetchMarketPrice({ fetcher: jsonFetcher({ ticker: { ...TICKER.ticker, last } }) })).rejects.toThrow();
    }
    await expect(fetchMarketPrice({ fetcher: jsonFetcher({}) })).rejects.toThrow();
    await expect(fetchMarketPrice({ fetcher: jsonFetcher({ ticker: "nope" }) })).rejects.toThrow();
    await expect(fetchMarketPrice({ fetcher: jsonFetcher(TICKER, 403) })).rejects.toThrow("403");
  });
  test("quotes the middle of the book while the market has had no trade", async () => {
    const fresh = { ...TICKER.ticker, last: "0", buy: "51.86", sell: "49.51", high: "0", low: "0", open: "0", volume: "0", vol: "0" };
    const market = await fetchMarketPrice({ fetcher: jsonFetcher({ ticker: fresh }) });
    expect(market.source).toBe("book");
    expect(market.last).toBeCloseTo(50.685, 9);
    expect(market.lastText).toBe("50.685");
    expect((await fetchMarketPrice({ fetcher: jsonFetcher({ ticker: { ...fresh, last: "0.00" } }) })).source).toBe("book");
    const oneSided = await fetchMarketPrice({ fetcher: jsonFetcher({ ticker: { ...fresh, buy: "0" } }) });
    expect(oneSided.last).toBe(49.51);
    expect(oneSided.source).toBe("book");
    await expect(fetchMarketPrice({ fetcher: jsonFetcher({ ticker: { ...fresh, buy: "0", sell: "0" } }) })).rejects.toThrow();
  });
  test("drops the extras it cannot trust but keeps the price", async () => {
    const market = await fetchMarketPrice({
      fetcher: jsonFetcher({ ticker: { last: "47", buy: "0", sell: "x", price_change_percent: "up a lot", vol: "-1" } }),
    });
    expect(market.last).toBe(47);
    expect(market.bid).toBeNull();
    expect(market.ask).toBeNull();
    expect(market.changePercent).toBeNull();
    expect(market.quoteVolume).toBeNull();
  });
  test("a zero-volume market is still a market", async () => {
    const market = await fetchMarketPrice({ fetcher: jsonFetcher({ ticker: { last: "47", vol: "0" } }) });
    expect(market.quoteVolume).toBe(0);
  });
});

describe("built-in table", () => {
  test("matches the snapshot captured from the pool", () => {
    expect(BUILT_IN_GPUS.map((gpu) => [gpu.id, gpu.ours, gpu.stock, gpu.powerW])).toEqual([
      ["rtx-5090", 1_491_900_000, 341_900_000, 500],
      ["rtx-4090", 1_123_400_000, 178_510_000, 380],
      ["rtx-4070-ti", 574_300_000, 122_420_000, 260],
      ["rtx-3080-ti", 435_400_000, 103_530_000, 330],
      ["rtx-5060-ti", 313_900_000, 75_000_000, 170],
    ]);
    expect(BUILT_IN_TERMS.source).toBe("snapshot");
  });
  test("derives ids and short names from device names", () => {
    expect(gpuId("NVIDIA GeForce RTX 4070 Ti")).toBe("rtx-4070-ti");
    expect(gpuId("AMD Radeon RX 7900 XTX")).toBe("rx-7900-xtx");
    expect(shortName("NVIDIA GeForce RTX 5060 Ti")).toBe("RTX 5060 Ti");
    expect(shortName("Some GPU")).toBe("Some GPU");
  });
});

describe("inputs", () => {
  test("parses typed numbers and rejects junk", () => {
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber(" 0.10 ")).toBe(0.1);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("-1")).toBeNull();
    expect(parseNumber("1e3")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });
  test("defaults start with one RTX 4090 on the pool miner", () => {
    const inputs = defaultInputs(BUILT_IN_TERMS);
    expect(inputs.devices).toHaveLength(1);
    expect(inputs.devices[0].gpu).toBe("rtx-4090");
    expect(inputs.devices[0].hashrate).toBe("1.123");
    expect(inputs.devices[0].unit).toBe("GH");
    expect(inputs.devices[0].powerW).toBe("380");
    expect(inputs.devices[0].minerFee).toBe("5");
    expect(inputs.poolFee).toBeNull();
    // No price of its own: the market's last trade fills the field.
    expect(inputs.price).toBeNull();
    expect(inputs.currency).toBe("USDT");
  });
  test("the price follows the market until the reader overrides it", () => {
    const inputs = defaultInputs(BUILT_IN_TERMS);
    expect(priceFieldText(inputs, "47")).toBe("47");
    expect(priceFieldText(inputs, null)).toBe("");
    expect(toModel(inputs, BUILT_IN_TERMS, 47).assumptions.price).toBe(47);
    expect(toModel(inputs, BUILT_IN_TERMS, 47).priceSource).toBe("market");
    expect(toModel(inputs, BUILT_IN_TERMS, null).assumptions.price).toBe(0);
    expect(toModel(inputs, BUILT_IN_TERMS, null).priceSource).toBe("none");
    // A broken quote must never reach the model.
    expect(toModel(inputs, BUILT_IN_TERMS, 0).priceSource).toBe("none");
    expect(toModel(inputs, BUILT_IN_TERMS, NaN).assumptions.price).toBe(0);

    inputs.price = "20";
    expect(priceFieldText(inputs, "47")).toBe("20");
    const manual = toModel(inputs, BUILT_IN_TERMS, 47);
    expect(manual.assumptions.price).toBe(20);
    expect(manual.priceSource).toBe("manual");
    // Clearing the field is an override too, and it means "no price".
    inputs.price = "";
    expect(priceFieldText(inputs, "47")).toBe("");
    expect(toModel(inputs, BUILT_IN_TERMS, 47).assumptions.price).toBe(0);
    expect(toModel(inputs, BUILT_IN_TERMS, 47).priceSource).toBe("none");
  });
  test("converts inputs to the model with fees, units and cost modes", () => {
    const inputs = defaultInputs(BUILT_IN_TERMS);
    inputs.price = "0.5";
    inputs.uptime = "95";
    const model = toModel(inputs, BUILT_IN_TERMS);
    expect(model.ready).toBe(true);
    expect(model.devices[0].hashrate).toBeCloseTo(1.123e9, 0);
    expect(model.devices[0].powerW).toBe(380);
    expect(model.devices[0].minerFeePercent).toBe(5);
    expect(model.assumptions).toEqual({ uptime: 0.95, poolFeePercent: 1, price: 0.5 });
    expect(model.costs).toEqual({ mode: "electricity", pricePerKwh: 0.1, hardwareCost: 0, amortiseDays: 365 });

    inputs.poolFee = "2.5";
    inputs.costMode = "rental";
    inputs.rent = "0.5";
    inputs.rentPer = "hour";
    inputs.mode = "total";
    inputs.total = { hashrate: "50", unit: "GH", software: "pool", minerFee: "5", netOfMinerFee: true, powerW: "" };
    const total = toModel(inputs, BUILT_IN_TERMS);
    expect(total.assumptions.poolFeePercent).toBe(2.5);
    expect(total.costs).toEqual({ mode: "rental", rentPerDay: 12 });
    expect(total.devices).toHaveLength(1);
    expect(total.devices[0].hashrate).toBe(5e10);
    expect(total.devices[0].minerFeePercent).toBe(0);
    expect(total.devices[0].powerW).toBeNull();
    inputs.total.netOfMinerFee = false;
    expect(toModel(inputs, BUILT_IN_TERMS).devices[0].minerFeePercent).toBe(5);
  });
  test("normalises whatever storage holds and survives junk", () => {
    expect(normalizeInputs(null, BUILT_IN_TERMS)).toEqual(expect.objectContaining({ mode: "devices" }));
    const restored = normalizeInputs(
      {
        mode: "total",
        devices: [{ gpu: "rtx-5090", quantity: "3", software: "stock", hashrate: "341.9", unit: "MH", powerW: "450", minerFee: "0" }, "junk"],
        total: { hashrate: "12", unit: "TH", netOfMinerFee: "yes" },
        uptime: 99,
        poolFee: "1.5",
        costMode: "rental",
        rentPer: "week",
        currency: "a-very-long-currency-label",
        price: "0.42",
      },
      BUILT_IN_TERMS,
    );
    expect(restored.mode).toBe("total");
    expect(restored.devices).toHaveLength(1);
    expect(restored.devices[0]).toEqual(expect.objectContaining({ gpu: "rtx-5090", quantity: "3", software: "stock", powerW: "450" }));
    expect(restored.total.unit).toBe("GH");
    expect(restored.total.netOfMinerFee).toBe(true);
    expect(restored.uptime).toBe("100");
    expect(restored.poolFee).toBe("1.5");
    expect(restored.rentPer).toBe("day");
    expect(restored.currency).toBe("USDT");
    expect(restored.price).toBe("0.42");
  });
  test("round-trips through storage without the session keys", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    const inputs = defaultInputs(BUILT_IN_TERMS);
    inputs.price = "1.25";
    saveInputs(inputs, storage);
    expect(store.has("quantus-wallet-mining-v1")).toBe(true);
    expect(store.get("quantus-wallet-mining-v1")).not.toContain('"key"');
    const back = loadInputs(BUILT_IN_TERMS, storage);
    expect(back.price).toBe("1.25");
    expect(back.devices[0].gpu).toBe("rtx-4090");
    store.set("quantus-wallet-mining-v1", "{not json");
    expect(loadInputs(BUILT_IN_TERMS, storage).price).toBeNull();
  });
});
