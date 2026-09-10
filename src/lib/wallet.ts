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

export function isWormhole(wallet: Wallet): boolean {
  return walletBalanceKind(wallet) === "wormhole";
}
