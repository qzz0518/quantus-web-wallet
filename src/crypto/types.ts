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

/** 0 = receiving branch, 1 = change branch of the Wormhole path `m/44'/189189189'/0'/<branch>'/<index>'`. */
export type WormholeBranch = 0 | 1;

export interface WormholeNullifierInput {
  branch: WormholeBranch;
  index: number;
  /** Per-address transfer counter of the deposit (u64, decimal string). */
  transferCount: string;
}

export type CryptoRequest =
  | { method: 'derive'; scheme: WalletScheme; mnemonic: string; index: number }
  | { method: 'sign'; scheme: WalletScheme; mnemonic: string; index: number; callHex: string; context: SignContext }
  | { method: 'wormholeAddresses'; mnemonic: string; branch: WormholeBranch; start: number; count: number }
  | { method: 'wormholeNullifiers'; mnemonic: string; inputs: WormholeNullifierInput[] };

export type CryptoResult = AccountPublic | string | string[];

export type CryptoResponse =
  | { ok: true; result: CryptoResult }
  | { ok: false; error: string };
