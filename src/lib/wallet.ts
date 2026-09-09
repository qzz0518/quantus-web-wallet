import type { Wallet } from "./vault";

export type WalletBalanceKind = "standard" | "wormhole" | "unknown";

/** Legacy watch records have no reliable account type until the user selects it. */
export function walletBalanceKind(wallet: Wallet): WalletBalanceKind {
  return wallet.kind === "mldsa87"
    ? "standard"
    : (wallet.watchKind ?? "unknown");
}

export function hasPublicBalance(wallet: Wallet): boolean {
  return walletBalanceKind(wallet) === "standard";
}

export function isWormhole(wallet: Wallet): boolean {
  return walletBalanceKind(wallet) === "wormhole";
}
