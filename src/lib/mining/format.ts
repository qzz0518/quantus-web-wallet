/** Number formatting for the mining calculator; language-neutral, digits only. */

const HASHRATE_UNITS = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"];

export function formatHashrate(hps: number, digits = 2): string {
  if (!Number.isFinite(hps) || hps <= 0) return "0 H/s";
  let index = 0;
  let value = hps;
  while (value >= 1000 && index < HASHRATE_UNITS.length - 1) {
    value /= 1000;
    index += 1;
  }
  return `${trimNumber(value, digits)} ${HASHRATE_UNITS[index]}`;
}

/** Large integers in SI notation: 248898629370016 → "248.9 T". */
export function formatCompact(value: bigint | number, digits = 3): string {
  let n = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(n) || n === 0) return "0";
  const suffixes = ["", " K", " M", " G", " T", " P", " E"];
  let index = 0;
  while (Math.abs(n) >= 1000 && index < suffixes.length - 1) {
    n /= 1000;
    index += 1;
  }
  return `${trimNumber(n, digits)}${suffixes[index]}`;
}

/** QTC amounts keep enough digits to show tiny yields without drowning large ones. */
export function formatQtc(qtc: number): string {
  if (!Number.isFinite(qtc)) return "—";
  const abs = Math.abs(qtc);
  if (abs === 0) return "0";
  if (abs >= 1000) return qtc.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 100) return qtc.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (abs >= 1) return qtc.toLocaleString("en-US", { maximumFractionDigits: 3 });
  if (abs >= 0.01) return qtc.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return qtc.toLocaleString("en-US", { maximumSignificantDigits: 3, maximumFractionDigits: 10 });
}

export function formatFiat(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  let text: string;
  if (abs >= 1000) text = value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  else if (abs >= 1) text = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  else if (abs === 0) text = "0";
  else text = value.toLocaleString("en-US", { maximumSignificantDigits: 3, maximumFractionDigits: 8 });
  return currency ? `${text} ${currency}` : text;
}

export function formatPercent(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  const percent = fraction * 100;
  const abs = Math.abs(percent);
  if (abs > 0 && abs < 0.01) return percent.toLocaleString("en-US", { maximumSignificantDigits: 2 }) + "%";
  return percent.toLocaleString("en-US", { maximumFractionDigits: digits }) + "%";
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  return `${trimNumber(seconds, 2)} s`;
}

export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

/** Up to `digits` decimals, trailing zeros removed. */
export function trimNumber(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}
