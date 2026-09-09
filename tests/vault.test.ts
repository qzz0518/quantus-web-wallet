import { describe, it, expect } from "bun:test";
import {
  createSession,
  encryptVault,
  unlockVault,
  emptyVault,
  validateData,
} from "../src/lib/vault";
import { parseAmount, formatAmount } from "../src/lib/amount";
describe("encrypted vault", () => {
  it("roundtrips with fresh IVs, hides plaintext and rejects wrong passwords/tampering", async () => {
    const session = await createSession("test-only-password-long");
    const data = emptyVault();
    data.wallets.push({
      id: "1",
      name: "私人账户",
      address: "qztest",
      kind: "mldsa87",
      mnemonic: "test secret never plaintext",
      index: 0,
      createdAt: Date.now(),
    });
    const first = await encryptVault(session, data),
      second = await encryptVault(session, data);
    expect(first).not.toBe(second);
    expect(first).not.toContain("test secret");
    expect(session.key.extractable).toBe(false);
    expect((await unlockVault("test-only-password-long", first)).data).toEqual(
      data,
    );
    await expect(unlockVault("wrong-password", first)).rejects.toThrow();
    const tampered = JSON.parse(first);
    tampered.ciphertext = "AAAA" + tampered.ciphertext.slice(4);
    await expect(
      unlockVault("test-only-password-long", JSON.stringify(tampered)),
    ).rejects.toThrow();
  });
  it("rejects duplicate wallets and secret-bearing watch records", () => {
    const w = {
      id: "x",
      name: "test",
      address: "qztest",
      kind: "watch",
      index: 0,
      createdAt: 1,
    };
    expect(() =>
      validateData({ version: 1, wallets: [w, w], pending: [] }),
    ).toThrow();
    expect(() =>
      validateData({
        version: 1,
        wallets: [{ ...w, mnemonic: "secret" }],
        pending: [],
      }),
    ).toThrow();
  });
});
describe("QTC amount precision", () => {
  it("preserves smallest unit and values beyond JS number precision", () => {
    expect(parseAmount("0.000000000001")).toBe(1n);
    expect(parseAmount("12345678.123456789012")).toBe(12345678123456789012n);
    expect(formatAmount("12345678123456789012")).toBe(
      "12,345,678.123456789012",
    );
  });
  it("rejects floats, negatives, commas, excess precision and zero", () => {
    for (const value of [
      "-1",
      "1e3",
      "1,000",
      "0",
      "0.0000000000001",
      "NaN",
      "Infinity",
      "01",
      "1.",
    ])
      expect(() => parseAmount(value)).toThrow();
  });
});
