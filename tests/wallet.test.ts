import { describe, expect, it } from "bun:test";
import type { Wallet } from "../src/lib/vault";
import {
  hasPublicBalance,
  isWormhole,
  sumPublicBalances,
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

const account = (id: string, kind: Wallet["kind"], watchKind?: Wallet["watchKind"]): Wallet => ({
  ...base,
  id,
  address: `addr-${id}`,
  kind,
  ...(kind === "watch" ? { watchKind } : { mnemonic: "secret" }),
});
const held = (free: string, reserved = "0") => ({ free, reserved });

describe("total across wallets", () => {
  it("adds free and reserved for every public balance and keeps the others apart", () => {
    const wallets = [
      account("a", "mldsa65"),
      account("b", "watch", "standard"),
      account("c", "watch", "wormhole"),
      account("d", "watch"),
    ];
    const totals = sumPublicBalances(wallets, {
      "addr-a": held("1000", "250"),
      "addr-b": held("4"),
      // An encrypted account cannot have a public figure; a stray one is ignored.
      "addr-c": held("9999999"),
      "addr-d": held("9999999"),
    });
    expect(totals.total).toBe(1254n);
    expect(totals.counted).toBe(2);
    expect(totals.missing).toBe(0);
    expect(totals.encrypted).toBe(1);
    expect(totals.unclassified).toBe(1);
  });

  it("reports a balance that has not arrived as missing instead of counting it as zero", () => {
    const wallets = [account("a", "mldsa87"), account("b", "mldsa65")];
    const totals = sumPublicBalances(wallets, { "addr-a": held("7") });
    expect(totals.total).toBe(7n);
    expect(totals.counted).toBe(1);
    expect(totals.missing).toBe(1);
  });

  it("stays at zero with no wallets and keeps amounts beyond Number range exact", () => {
    expect(sumPublicBalances([], {})).toEqual({
      total: 0n,
      counted: 0,
      missing: 0,
      encrypted: 0,
      unclassified: 0,
    });
    const huge = "21000000000000000000";
    const totals = sumPublicBalances([account("a", "mldsa65")], { "addr-a": held(huge, huge) });
    expect(totals.total).toBe(42000000000000000000n);
  });
});
