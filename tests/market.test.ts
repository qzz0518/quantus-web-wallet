import { describe, expect, test } from "bun:test";
import { fiatValue, formatUsd } from "../src/lib/market";
import { UNIT } from "../src/lib/amount";

describe("fiatValue", () => {
  test("multiplies whole and fractional QTC by the unit price", () => {
    expect(fiatValue(370n * UNIT + UNIT / 2n, 0.04)).toBeCloseTo(14.82, 6);
    expect(fiatValue(0n, 0.04)).toBe(0);
  });
  test("keeps precision for balances beyond the double range of planck", () => {
    expect(fiatValue(123_456_789n * UNIT, 1)).toBe(123_456_789);
  });
});

describe("formatUsd", () => {
  test("drops cents above a thousand, keeps two below, and two significant digits under a dollar", () => {
    expect(formatUsd(1234.56)).toBe("$1,235");
    expect(formatUsd(14.816)).toBe("$14.82");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.03456)).toBe("$0.035");
  });
  test("unit prices keep four significant digits", () => {
    expect(formatUsd(0.03456, true)).toBe("$0.03456");
    expect(formatUsd(0.0333333, true)).toBe("$0.03333");
  });
  test("rejects nonsense", () => {
    expect(formatUsd(Number.NaN)).toBe("—");
    expect(formatUsd(-1)).toBe("—");
  });
});
