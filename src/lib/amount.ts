export const UNIT = 1_000_000_000_000n;
export function parseAmount(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,12})?$/.test(value.trim()))
    throw new Error("请输入有效金额，最多支持 12 位小数");
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = BigInt(whole) * UNIT + BigInt(fraction.padEnd(12, "0"));
  if (amount <= 0n || amount >= 2n ** 128n) throw new Error("转账金额超出范围");
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
export const shortAddress = (address: string, size = 7) =>
  address.slice(0, size) + "…" + address.slice(-size);
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "操作未完成，请重试";
}
