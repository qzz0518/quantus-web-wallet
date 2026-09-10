/** ML-DSA parameter set of a transparent account; both are regular Quantus accounts. */
export type WalletScheme = 'mldsa65' | 'mldsa87';

export interface AccountPublic {
  address: string;
  publicKey: string;
}

export interface SignContext {
  nonce: number;
  genesisHash: string;
  blockHash: string;
  blockNumber: number;
  period: number;
  specVersion: number;
  transactionVersion: number;
  tip: string;
}

export type CryptoRequest =
  | { method: 'derive'; scheme: WalletScheme; mnemonic: string; index: number }
  | { method: 'sign'; scheme: WalletScheme; mnemonic: string; index: number; callHex: string; context: SignContext };

export type CryptoResponse =
  | { ok: true; result: AccountPublic | string }
  | { ok: false; error: string };
