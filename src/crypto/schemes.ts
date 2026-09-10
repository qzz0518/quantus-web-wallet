import type { WalletScheme } from './types';

/**
 * Signature schemes of transparent Quantus accounts. The official CLI and wallet
 * default to ML-DSA-65 and keep the schemes apart by the last hardened path
 * component (`…/0'/1'` for ML-DSA-65, `…/0'/0'` for ML-DSA-87), so one phrase
 * never yields the same key material for both. The WASM module checks this table
 * (`canonicalAddressIndex`) in the crypto tests.
 */
export const SCHEMES = {
  mldsa65: { label: 'ML-DSA-65', wasmName: 'ml-dsa-65', addressIndex: 1 },
  mldsa87: { label: 'ML-DSA-87', wasmName: 'ml-dsa-87', addressIndex: 0 },
} as const satisfies Record<WalletScheme, { label: string; wasmName: string; addressIndex: number }>;

export const WALLET_SCHEMES: readonly WalletScheme[] = ['mldsa65', 'mldsa87'];

/** Matches the official wallet so a phrase created there recovers the same account here. */
export const DEFAULT_SCHEME: WalletScheme = 'mldsa65';

export function isWalletScheme(value: unknown): value is WalletScheme {
  return value === 'mldsa65' || value === 'mldsa87';
}

export function schemeLabel(scheme: WalletScheme): string {
  return SCHEMES[scheme].label;
}

/** Hardened BIP44-style path of account `index`; the index is the account component. */
export function derivationPath(scheme: WalletScheme, index: number | string = '<index>'): string {
  return `m/44'/189189'/${index}'/0'/${SCHEMES[scheme].addressIndex}'`;
}
