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
