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
  | { method: 'derive'; mnemonic: string; index: number }
  | { method: 'sign'; mnemonic: string; index: number; callHex: string; context: SignContext };

export type CryptoResponse =
  | { ok: true; result: AccountPublic | string }
  | { ok: false; error: string };
