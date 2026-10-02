import { t } from "./i18n";

export const UNIT = 1_000_000_000_000n;
export function parseAmount(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,12})?$/.test(value.trim()))
    throw new Error(t("请输入有效金额，最多支持 12 位小数"));
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = BigInt(whole) * UNIT + BigInt(fraction.padEnd(12, "0"));
  if (amount <= 0n || amount >= 2n ** 128n)
    throw new Error(t("转账金额超出范围"));
  return amount;
}
export function formatAmount(value: string | bigint, maxDecimals = 12): string {
  const n = BigInt(value),
    sign = n < 0 ? "-" : "",
    abs = n < 0 ? -n : n;
  const fraction = (abs % UNIT)
    .toString()
    .padStart(12, "0")
    .slice(0, maxDecimals)
    .replace(/0+$/, "");
  return (
    sign +
    (abs / UNIT).toLocaleString("en-US") +
    (fraction ? "." + fraction : "")
  );
}
/** A planck amount as the plain decimal the amount field accepts: no grouping, no trailing zeros. */
export function plainAmount(value: bigint): string {
  if (value < 0n) throw new Error(t("金额不能为负"));
  const fraction = (value % UNIT).toString().padStart(12, "0").replace(/0+$/, "");
  return (value / UNIT).toString() + (fraction ? "." + fraction : "");
}
/** The amount "Max" fills in: rounded down to this many planck (0.000001 QTC). */
export const MAX_AMOUNT_STEP = 1_000_000n;
/**
 * The most a transfer can send: free balance minus what must stay (the larger
 * of the frozen amount and the existential deposit) minus the fee, rounded
 * down to a readable step. Null when nothing is left to send.
 */
export function maxSendable(balance: { free: string; frozen: string }, fee: string, existentialDeposit: string): bigint | null {
  const free = BigInt(balance.free), frozen = BigInt(balance.frozen), ed = BigInt(existentialDeposit);
  const keep = frozen > ed ? frozen : ed;
  const left = free - keep - BigInt(fee);
  const rounded = left - (left % MAX_AMOUNT_STEP);
  return rounded > 0n ? rounded : null;
}
export const shortAddress = (address: string, size = 7) =>
  address.slice(0, size) + "…" + address.slice(-size);
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : t("操作未完成，请重试");
}
