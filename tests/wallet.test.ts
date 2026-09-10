import { describe, expect, it } from "bun:test";
import type { Wallet } from "../src/lib/vault";
import {
  hasPublicBalance,
  isWormhole,
  walletBalanceKind,
  walletScheme,
} from "../src/lib/wallet";

const base = { id: "w", name: "Wallet", address: "qztest", index: 0, createdAt: 0 };

describe("wallet kind helpers", () => {
  it("treats both ML-DSA schemes as standard signing accounts", () => {
    for (const kind of ["mldsa65", "mldsa87"] as const) {
      const wallet: Wallet = { ...base, kind, mnemonic: "secret" };
      expect(walletScheme(wallet)).toBe(kind);
      expect(walletBalanceKind(wallet)).toBe("standard");
      expect(hasPublicBalance(wallet)).toBe(true);
      expect(isWormhole(wallet)).toBe(false);
    }
  });

  it("keeps watch-only classification by the selected watch kind", () => {
    const unknown: Wallet = { ...base, kind: "watch" };
    expect(walletScheme(unknown)).toBeNull();
    expect(walletBalanceKind(unknown)).toBe("unknown");
    expect(hasPublicBalance(unknown)).toBe(false);
    const wormhole: Wallet = { ...base, kind: "watch", watchKind: "wormhole" };
    expect(isWormhole(wormhole)).toBe(true);
    expect(hasPublicBalance(wormhole)).toBe(false);
    const standard: Wallet = { ...base, kind: "watch", watchKind: "standard" };
    expect(walletBalanceKind(standard)).toBe("standard");
    expect(walletScheme(standard)).toBeNull();
  });
});
