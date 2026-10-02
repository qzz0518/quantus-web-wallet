import { describe, expect, test } from "bun:test";
import { MAX_AMOUNT_STEP, maxSendable, parseAmount, plainAmount, UNIT } from "../src/lib/amount";

const ED = "1000000000"; // 0.001 QTC
const FEE = "819802500"; // ~0.00082 QTC, mainnet runtime 153

describe("max sendable amount", () => {
  test("keeps the existential deposit and the fee, rounded down to a readable step", () => {
    const max = maxSendable({ free: "467786550000", frozen: "0" }, FEE, ED)!;
    expect(max).toBe(465966000000n);
    expect(max % MAX_AMOUNT_STEP).toBe(0n);
    expect(BigInt(467786550000) - max - BigInt(FEE)).toBeGreaterThanOrEqual(BigInt(ED));
  });
  test("keeps a frozen amount larger than the deposit", () => {
    expect(maxSendable({ free: (2n * UNIT).toString(), frozen: UNIT.toString() }, FEE, ED)).toBe(999180000000n);
  });
  test("is null when the fee and the deposit use everything", () => {
    expect(maxSendable({ free: "1500000000", frozen: "0" }, FEE, ED)).toBeNull();
    expect(maxSendable({ free: "0", frozen: "0" }, FEE, ED)).toBeNull();
  });
  test("writes the amount the field accepts and reads back the same planck", () => {
    for (const value of [465966000000n, 1n, UNIT, 123456789n * UNIT + 5n, 10n ** 30n]) {
      const text = plainAmount(value);
      expect(text).not.toContain(",");
      expect(parseAmount(text)).toBe(value);
    }
    expect(plainAmount(465966000000n)).toBe("0.465966");
    expect(plainAmount(2n * UNIT)).toBe("2");
  });
});
