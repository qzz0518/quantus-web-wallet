/**
 * Built-in GPU reference table. Hashrates are Quanpool's published
 * benchmarks (`/api/terms`) captured on SNAPSHOT_DATE: `ours` is the pool's
 * own miner, `stock` the official quantus-miner. Power is a typical board
 * draw under this workload and is only a starting point; the calculator lets
 * the user overwrite it. The live table replaces the hashrates when the pool
 * API is reachable, never the power figures.
 */
export const SNAPSHOT_DATE = "2026-09-10";

export type Gpu = {
  /** Stable id used in persisted inputs; derived from the device name. */
  id: string;
  /** Full device name as reported by the benchmark source. */
  device: string;
  /** Short label for tables and selects. */
  short: string;
  /** Hashrate with the pool miner, in H/s. */
  ours: number;
  /** Hashrate with the official miner, in H/s. */
  stock: number;
  /** Typical board power under load in watts; null when unknown. */
  powerW: number | null;
  note?: string;
};

export type PoolTerms = {
  poolFeePercent: number;
  minerDevFeePercent: number;
  gpus: Gpu[];
  /** ms since epoch when the table was captured or fetched. */
  capturedAt: number;
  source: "snapshot" | "live";
};

export function gpuId(device: string): string {
  return device
    .toLowerCase()
    .replace(/nvidia|geforce|amd|radeon/g, " ")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function shortName(device: string): string {
  return device.replace(/^\s*(NVIDIA|AMD)\s+(GeForce|Radeon)?\s*/i, "").trim() || device;
}

const TYPICAL_POWER: Record<string, number> = {
  "rtx-5090": 500,
  "rtx-4090": 380,
  "rtx-4070-ti": 260,
  "rtx-3080-ti": 330,
  "rtx-5060-ti": 170,
};

export function typicalPower(id: string): number | null {
  return TYPICAL_POWER[id] ?? null;
}

const SNAPSHOT: { device: string; ours: number; stock: number; note: string }[] = [
  { device: "NVIDIA GeForce RTX 5090", ours: 1_491_900_000, stock: 341_900_000, note: "steady state on this pool, GPU only" },
  { device: "NVIDIA GeForce RTX 4090", ours: 1_123_400_000, stock: 178_510_000, note: "median of three alternated 90 s runs" },
  { device: "NVIDIA GeForce RTX 4070 Ti", ours: 574_300_000, stock: 122_420_000, note: "steady state on this pool, GPU only" },
  { device: "NVIDIA GeForce RTX 3080 Ti", ours: 435_400_000, stock: 103_530_000, note: "median of three alternated 90 s runs" },
  { device: "NVIDIA GeForce RTX 5060 Ti", ours: 313_900_000, stock: 75_000_000, note: "steady state on this pool, GPU only" },
];

export const BUILT_IN_GPUS: readonly Gpu[] = Object.freeze(
  SNAPSHOT.map((row) => {
    const id = gpuId(row.device);
    return Object.freeze({ id, device: row.device, short: shortName(row.device), ours: row.ours, stock: row.stock, powerW: typicalPower(id), note: row.note });
  }),
);

export const BUILT_IN_TERMS: PoolTerms = Object.freeze({
  poolFeePercent: 1,
  minerDevFeePercent: 5,
  gpus: BUILT_IN_GPUS as Gpu[],
  capturedAt: Date.parse(`${SNAPSHOT_DATE}T00:00:00Z`),
  source: "snapshot",
});
