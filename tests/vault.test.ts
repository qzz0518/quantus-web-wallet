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
  it("loads a vault stored before ML-DSA-65 support without changing its records", async () => {
    // Envelope produced by the previous release's data shape: an ML-DSA-87
    // signing wallet, a watch wallet and one pending transfer. The phrase is the
    // public upstream test vector; the password is fixture-only.
    const legacy = '{"format":"quantus-vault","version":1,"kdf":"PBKDF2-SHA256","iterations":600000,"salt":"078RNWzMBtiqkR6/1VNTmw==","iv":"1O1nzHdZDAOahJEe","ciphertext":"JuROMjd9XDyrnoFyVxrVSpaeK8C/q5crFbAtDKKJrObyi36AwPBan/fCIrZ3sm9w9YUNvm5hgzZlLOy49UewnvQI8xOjvKGvKDcRYlO/hO2ongRdpDZNT1qkm7+HG7i3cAp6zzv9gaJKMW2U4Xg25CV1erIjY91V+GHbGTEClIdogYXJK+eUeLl0nj9n0cf28FhysLn16lCbvJATkBflVn6rMPtyn3V8xEXzaume0eOPrcVaDNfcRRrG+AeFbYRxRXwYYRD5gKJzoToVQYQ4FAtbsD1v5Ytfna+2GEQ1Siv47RDlkyEPw3+FSLMfxFEq5LjDuO6mvO7BfjL2fq+Ap5FXSq8xJLYPNoSzF1VxQZFqt8LyjglTtkjtDKB07FKWiCWyvJuEvgdRxsev/s+qDcdNUW9Tkjf2J8rvcqFWe6YccnYYXsLWHNtH21l06erJxcHfAWilh7qJV1SAJvfdi3mZjeN2QPwbZz2o9vEJVLBDbBrD6t+ybEmNzb61NYLKaMY9dkVby96wzxVaV5vZMfWwWfR0F6lzjKCAoknYh0crDq3r9GWAk066+/wRmKlKlSez26V3B68iqN+VmwyLkD9Z/disXjGumM85vdczHe+Xj2dbuOWNiJ65I83lBENhbkfoNMIk9UZWX7r34//uAgWYX7LxmerXlhKG0f81UtByGwtASBuzZeOSaQRQOxeuuHG5A72ObHuM8kira+TYAIlds7N6U9YAbCTyKsqrMcjZsAhDn+Ya9XNa/8MZeS9HyzjE3Ugur5rR45MwsAAoYn1OAKi7AwwKON9HI6JLoJzyKwtfWUw4a6fKGLOnwMn+apvYjdvUDPzOUwV+cMh2Hu7hcQAri4hlF4TmHNv023INYEyqH4jpYmWzJvAU7odWmS2FISnWMNstyYgy5KjhBr6YzfjnTZiD4wYE81FpUICpIOB/OKhn9P8JZMvUeEJfSVqd+EcDpLUnm0Us31D8fn+64Gfqo/LspwgtaF4KGc9Ork38J8jxRyWeLEX+UHu/UNTkQCZss4MWxRjK/arMlQgfI3FynSPalPyeiEZlHquYeCw//S3fpnpKf+TY/Xgdm+W5DICRQPX0RSsXwmc3GETgFHpo599EAPDUhC3EYI4="}';
    const { data } = await unlockVault("fixture-password-2026", legacy);
    expect(data.wallets.map((wallet) => wallet.kind)).toEqual(["mldsa87", "watch"]);
    expect(data.wallets[0]).toEqual({
      id: "legacy-1",
      name: "旧钱包",
      address: "qzm5QCox8Dp5A3oSXZZYHD8YoYgPz7enykZb6RPUropdCyN5h",
      kind: "mldsa87",
      index: 0,
      mnemonic:
        "orchard answer curve patient visual flower maze noise retreat penalty cage small earth domain scan pitch bottom crunch theme club client swap slice raven",
      createdAt: 1757400000000,
    });
    expect(data.wallets[1].watchKind).toBe("standard");
    expect(data.pending).toHaveLength(1);
    // A vault that mixes the old and new signing kinds validates unchanged.
    const mixed = {
      ...data,
      wallets: [
        ...data.wallets,
        { ...data.wallets[0], id: "new-65", address: "qzoyC4eRTrexYoutXABVsf61QJZxJim3iWvayRQwEjXWgA4mw", kind: "mldsa65" as const },
      ],
    };
    expect(validateData(structuredClone(mixed))).toEqual(mixed);
    const session = await createSession("fixture-password-2026");
    expect((await unlockVault("fixture-password-2026", await encryptVault(session, mixed))).data).toEqual(mixed);
  });

  it("requires a mnemonic for both signing kinds and rejects unknown kinds", () => {
    const wallet = { id: "k", name: "k", address: "qzk", index: 0, createdAt: 1 };
    for (const kind of ["mldsa65", "mldsa87"]) {
      expect(() => validateData({ version: 1, wallets: [{ ...wallet, kind }], pending: [] })).toThrow("钱包密钥数据无效");
      expect(validateData({ version: 1, wallets: [{ ...wallet, kind, mnemonic: "words" }], pending: [] }).wallets[0].kind).toBe(kind);
    }
    for (const kind of ["mldsa44", "ml-dsa-65", "", undefined]) {
      expect(() => validateData({ version: 1, wallets: [{ ...wallet, kind, mnemonic: "words" }], pending: [] })).toThrow("钱包数据格式无效");
    }
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

describe("delayed transfers in the journal", () => {
  const record = (extra: Record<string, unknown> = {}) => ({
    version: 1 as const,
    wallets: [],
    pending: [
      {
        hash: "0x" + "ab".repeat(32),
        address: "qzfrom",
        to: "qzto",
        amount: "1000000000000",
        fee: "8000000000",
        startBlock: 100,
        createdAt: 1757600000000,
        status: "pending" as const,
        ...extra,
      },
    ],
  });

  it("reads a journal written before delayed transfers existed", () => {
    const old = record();
    expect(validateData(old).pending[0].kind).toBeUndefined();
  });

  it("keeps what the chain answered about a scheduled transfer", () => {
    const scheduled = record({
      kind: "scheduled",
      delay: 7200,
      txId: "0x" + "cd".repeat(32),
      executeAt: 7300,
    });
    expect(validateData(scheduled).pending[0]).toMatchObject({
      kind: "scheduled",
      delay: 7200,
      executeAt: 7300,
    });
  });

  it("rejects a record whose delayed-transfer fields are not what they claim", () => {
    for (const bad of [
      { kind: "later" },
      { delay: -1 },
      { delay: 1.5 },
      { executeAt: "7300" },
      { txId: "0xnothex" },
      { txId: "0x1234" },
    ]) {
      expect(() => validateData(record(bad))).toThrow();
    }
  });
});
