import type { WalletScheme } from "../crypto/types";
import type { Wallet } from "./vault";

export type WalletBalanceKind = "standard" | "wormhole" | "unknown";

/** The signing scheme of a self-custody wallet; watch-only records have none. */
export function walletScheme(wallet: Wallet): WalletScheme | null {
  return wallet.kind === "watch" ? null : wallet.kind;
}

/** Legacy watch records have no reliable account type until the user selects it. */
export function walletBalanceKind(wallet: Wallet): WalletBalanceKind {
  return wallet.kind === "watch" ? (wallet.watchKind ?? "unknown") : "standard";
}

export function hasPublicBalance(wallet: Wallet): boolean {
  return walletBalanceKind(wallet) === "standard";
}

/** Muted, dark hues that all keep white text legible. */
const CARD_HUES = [147, 168, 190, 122, 96, 205];

/** A stable hue per address: the card identifies the wallet, not just the brand. */
export function walletHue(address: string): number {
  let hash = 2166136261;
  for (let i = 0; i < address.length; i++) {
    hash ^= address.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return CARD_HUES[Math.abs(hash) % CARD_HUES.length];
}

export function isWormhole(wallet: Wallet): boolean {
  return walletBalanceKind(wallet) === "wormhole";
}

/** The parts of a balance the total is built from; the rest is not needed here. */
export type PublicBalance = { free: string; reserved: string };

export type WalletTotals = {
  /** free + reserved across every public balance that has actually been read. */
  total: bigint;
  counted: number;
  /** Public balances that have not arrived yet, so the total is incomplete. */
  missing: number;
  /** Encrypted accounts: no public figure exists to add. */
  encrypted: number;
  /** Watch-only records whose account type the user has not confirmed. */
  unclassified: number;
};

/**
 * Adds up what the wallets hold. Only public balances can be summed: an
 * encrypted account has no public figure, and an unconfirmed watch record
 * might be either kind. A balance that failed to load is counted as missing
 * rather than as zero, so the total is never quietly too low.
 */
export function sumPublicBalances(
  wallets: Wallet[],
  balances: Record<string, PublicBalance | undefined>,
): WalletTotals {
  const totals: WalletTotals = { total: 0n, counted: 0, missing: 0, encrypted: 0, unclassified: 0 };
  for (const wallet of wallets) {
    const kind = walletBalanceKind(wallet);
    if (kind === "wormhole") {
      totals.encrypted++;
      continue;
    }
    if (kind === "unknown") {
      totals.unclassified++;
      continue;
    }
    const balance = balances[wallet.address];
    if (!balance) {
      totals.missing++;
      continue;
    }
    totals.total += BigInt(balance.free) + BigInt(balance.reserved);
    totals.counted++;
  }
  return totals;
}
