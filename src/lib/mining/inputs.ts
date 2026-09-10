import type { Gpu, PoolTerms } from "./gpus";
import type { Assumptions, Costs, Device } from "./math";

/**
 * What the user types, kept as strings so a half-typed value never snaps
 * back, plus the conversion to the numbers the math needs. Persisted under
 * one localStorage key; every field is re-validated when read back.
 */
export const STORAGE_KEY = "quantus-wallet-mining-v1";
export const CUSTOM_GPU = "custom";
/** The quote asset of the market the price comes from; kept in sync with data.ts. */
export const DEFAULT_CURRENCY = "USDT";

export type Software = "pool" | "stock";
export type HashrateUnit = "MH" | "GH";
export type CostMode = "electricity" | "rental";
export type RentPeriod = "day" | "hour";

export type DeviceInput = {
  key: string;
  /** Gpu id from the reference table, or CUSTOM_GPU. */
  gpu: string;
  quantity: string;
  software: Software;
  hashrate: string;
  unit: HashrateUnit;
  powerW: string;
  minerFee: string;
};

export type TotalInput = {
  hashrate: string;
  unit: HashrateUnit;
  software: Software;
  minerFee: string;
  /** The pool already shows this figure after the miner's fee. */
  netOfMinerFee: boolean;
  powerW: string;
};

export type MiningInputs = {
  mode: "devices" | "total";
  devices: DeviceInput[];
  total: TotalInput;
  uptime: string;
  /** Null follows the pool's published fee. */
  poolFee: string | null;
  costMode: CostMode;
  electricity: string;
  rent: string;
  rentPer: RentPeriod;
  hardwareCost: string;
  amortiseDays: string;
  currency: string;
  /** Null follows the market's last price; a string is the user's own figure, empty included. */
  price: string | null;
};

export const UNIT_FACTOR: Record<HashrateUnit, number> = { MH: 1e6, GH: 1e9 };

let keyCounter = 0;
export function deviceKey(): string {
  keyCounter += 1;
  return `d${Date.now().toString(36)}${keyCounter}`;
}

/** Parse a user-typed number; empty or invalid text is null. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function benchmark(gpu: Gpu, software: Software): number {
  return software === "pool" ? gpu.ours : gpu.stock;
}

/** Hashrate text plus unit that reads naturally for the given H/s. */
export function hashrateText(hps: number): { hashrate: string; unit: HashrateUnit } {
  if (hps >= 1e9) return { hashrate: trim(hps / 1e9), unit: "GH" };
  return { hashrate: trim(hps / 1e6), unit: "MH" };
}

const trim = (value: number) => String(Math.round(value * 1000) / 1000);

export function minerFeeFor(software: Software, terms: PoolTerms): string {
  return software === "pool" ? String(terms.minerDevFeePercent) : "0";
}

export function deviceFromGpu(gpu: Gpu, software: Software, terms: PoolTerms, quantity = "1"): DeviceInput {
  return {
    key: deviceKey(),
    gpu: gpu.id,
    quantity,
    software,
    ...hashrateText(benchmark(gpu, software)),
    powerW: gpu.powerW === null ? "" : String(gpu.powerW),
    minerFee: minerFeeFor(software, terms),
  };
}

export function defaultInputs(terms: PoolTerms): MiningInputs {
  const gpu = terms.gpus.find((row) => row.id === "rtx-4090") ?? terms.gpus[0];
  return {
    mode: "devices",
    devices: [deviceFromGpu(gpu, "pool", terms)],
    total: { hashrate: "", unit: "GH", software: "pool", minerFee: minerFeeFor("pool", terms), netOfMinerFee: true, powerW: "" },
    uptime: "100",
    poolFee: null,
    costMode: "electricity",
    electricity: "0.10",
    rent: "",
    rentPer: "day",
    hardwareCost: "",
    amortiseDays: "365",
    // The market quotes QTC in USDT, so that is what the other amounts default to.
    currency: DEFAULT_CURRENCY,
    price: null,
  };
}

const text = (value: unknown, fallback: string, max = 32): string =>
  typeof value === "string" && value.length <= max ? value : fallback;
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

function normalizeDevice(raw: unknown, fallback: DeviceInput): DeviceInput | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return {
    key: deviceKey(),
    gpu: text(row.gpu, fallback.gpu, 64),
    quantity: text(row.quantity, "1"),
    software: oneOf(row.software, ["pool", "stock"] as const, "pool"),
    hashrate: text(row.hashrate, ""),
    unit: oneOf(row.unit, ["MH", "GH"] as const, "MH"),
    powerW: text(row.powerW, ""),
    minerFee: text(row.minerFee, fallback.minerFee),
  };
}

/** Bring anything found in storage back to a well-formed input set. */
export function normalizeInputs(raw: unknown, terms: PoolTerms): MiningInputs {
  const base = defaultInputs(terms);
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Record<string, unknown>;
  const devices = Array.isArray(data.devices)
    ? data.devices.slice(0, 20).map((row) => normalizeDevice(row, base.devices[0])).filter((row): row is DeviceInput => row !== null)
    : [];
  const total = (data.total && typeof data.total === "object" ? data.total : {}) as Record<string, unknown>;
  return {
    mode: oneOf(data.mode, ["devices", "total"] as const, base.mode),
    devices: devices.length ? devices : base.devices,
    total: {
      hashrate: text(total.hashrate, ""),
      unit: oneOf(total.unit, ["MH", "GH"] as const, "GH"),
      software: oneOf(total.software, ["pool", "stock"] as const, "pool"),
      minerFee: text(total.minerFee, base.total.minerFee),
      netOfMinerFee: typeof total.netOfMinerFee === "boolean" ? total.netOfMinerFee : true,
      powerW: text(total.powerW, ""),
    },
    uptime: text(data.uptime, base.uptime),
    poolFee: data.poolFee === null ? null : typeof data.poolFee === "string" && data.poolFee.length <= 32 ? data.poolFee : null,
    costMode: oneOf(data.costMode, ["electricity", "rental"] as const, base.costMode),
    electricity: text(data.electricity, base.electricity),
    rent: text(data.rent, ""),
    rentPer: oneOf(data.rentPer, ["day", "hour"] as const, "day"),
    hardwareCost: text(data.hardwareCost, ""),
    amortiseDays: text(data.amortiseDays, base.amortiseDays),
    currency: text(data.currency, base.currency, 12),
    // An override that was left blank is no override: fall back to the market.
    price: typeof data.price === "string" && data.price.trim() !== "" && data.price.length <= 32 ? data.price : null,
  };
}

export function loadInputs(terms: PoolTerms, storage: Pick<Storage, "getItem"> | null = defaultStorage()): MiningInputs {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? normalizeInputs(JSON.parse(raw), terms) : defaultInputs(terms);
  } catch {
    return defaultInputs(terms);
  }
}

export function saveInputs(inputs: MiningInputs, storage: Pick<Storage, "setItem"> | null = defaultStorage()) {
  try {
    // Row keys are session-local; everything else is what the user typed.
    const devices = inputs.devices.map(({ key: _key, ...row }) => row);
    storage?.setItem(STORAGE_KEY, JSON.stringify({ ...inputs, devices }));
  } catch {
    // Storage restrictions must not break the calculator.
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export type PriceSource = "market" | "manual" | "none";

export type Model = {
  devices: Device[];
  assumptions: Assumptions;
  costs: Costs;
  currency: string;
  /** Where `assumptions.price` came from, so the UI can say so. */
  priceSource: PriceSource;
  /** True when at least one device row has a usable hashrate. */
  ready: boolean;
};

/** What the price field shows: the user's own text, or the market's digits. */
export function priceFieldText(inputs: MiningInputs, marketText: string | null): string {
  return inputs.price ?? marketText ?? "";
}

function deviceLabel(row: DeviceInput, terms: PoolTerms): string {
  const gpu = terms.gpus.find((item) => item.id === row.gpu);
  return gpu ? gpu.short : CUSTOM_GPU;
}

/**
 * Turn the text inputs into numbers; blanks become 0 or null as the math
 * expects. `marketPrice` is the exchange's last price and is used only when
 * the user has not entered one of their own.
 */
export function toModel(inputs: MiningInputs, terms: PoolTerms, marketPrice: number | null = null): Model {
  const num = (value: string) => parseNumber(value) ?? 0;
  const power = (value: string) => (value.trim() === "" ? null : parseNumber(value));
  let devices: Device[];
  if (inputs.mode === "total") {
    const total = inputs.total;
    devices = [
      {
        id: "total",
        label: "total",
        hashrate: num(total.hashrate) * UNIT_FACTOR[total.unit],
        quantity: 1,
        powerW: power(total.powerW),
        minerFeePercent: total.netOfMinerFee ? 0 : num(total.minerFee),
      },
    ];
  } else {
    devices = inputs.devices.map((row) => ({
      id: row.gpu,
      label: deviceLabel(row, terms),
      hashrate: num(row.hashrate) * UNIT_FACTOR[row.unit],
      quantity: Math.max(0, Math.floor(num(row.quantity))),
      powerW: power(row.powerW),
      minerFeePercent: num(row.minerFee),
    }));
  }
  const rent = num(inputs.rent);
  const market = marketPrice !== null && Number.isFinite(marketPrice) && marketPrice > 0 ? marketPrice : null;
  const price = inputs.price === null ? (market ?? 0) : num(inputs.price);
  const priceSource: PriceSource = price <= 0 ? "none" : inputs.price === null ? "market" : "manual";
  return {
    devices,
    assumptions: {
      uptime: Math.min(100, num(inputs.uptime)) / 100,
      poolFeePercent: inputs.poolFee === null ? terms.poolFeePercent : num(inputs.poolFee),
      price,
    },
    costs:
      inputs.costMode === "rental"
        ? { mode: "rental", rentPerDay: inputs.rentPer === "hour" ? rent * 24 : rent }
        : {
            mode: "electricity",
            pricePerKwh: num(inputs.electricity),
            hardwareCost: num(inputs.hardwareCost),
            amortiseDays: num(inputs.amortiseDays),
          },
    currency: inputs.currency.trim(),
    priceSource,
    ready: devices.some((device) => device.hashrate > 0 && device.quantity > 0),
  };
}
