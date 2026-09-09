/* tslint:disable */
/* eslint-disable */

/**
 * Account material derived from a seed. Byte fields surface as `Uint8Array`.
 */
export class Account {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * 32-byte Poseidon `AccountId32`.
     */
    readonly accountId: Uint8Array;
    /**
     * SS58 address encoded with the Quantus prefix (189).
     */
    readonly address: string;
    /**
     * ML-DSA-87 public key (2592 bytes).
     */
    readonly publicKey: Uint8Array;
    /**
     * ML-DSA-87 secret key (4896 bytes).
     */
    readonly secretKey: Uint8Array;
}

/**
 * Derive a Quantus account from a 32-byte seed.
 */
export function account(seed: Uint8Array): Account;

/**
 * Derive a Quantus account from a mnemonic at the given HD indices.
 */
export function accountFromMnemonic(mnemonic: string, account: number, change: number, address_index: number, passphrase?: string | null): Account;

/**
 * BIP39 mnemonic -> 64-byte seed (bridge to the seed-based API).
 */
export function mnemonicToSeed(mnemonic: string, passphrase?: string | null): Uint8Array;

/**
 * Sign an already-encoded `RuntimeCall` (e.g. polkadot.js `tx.method.toU8a()`),
 * returning the SCALE-encoded v4 extrinsic.
 */
export function signCall(seed: Uint8Array, call: Uint8Array, context: any): Uint8Array;

/**
 * Sign an already-encoded `RuntimeCall` from a mnemonic at the given HD indices.
 */
export function signCallFromMnemonic(mnemonic: string, call: Uint8Array, context: any, account: number, change: number, address_index: number, passphrase?: string | null): Uint8Array;

/**
 * Sign a balances/assets transfer, returning the SCALE-encoded v4 extrinsic.
 */
export function signTransfer(seed: Uint8Array, params: any): Uint8Array;

/**
 * Sign a transfer from a mnemonic at the given HD indices.
 */
export function signTransferFromMnemonic(mnemonic: string, params: any, account: number, change: number, address_index: number, passphrase?: string | null): Uint8Array;

/**
 * Verify a raw ML-DSA-87 signature using the mainnet extrinsic domain.
 * Used to check browser signing against native runtime compatibility tests.
 */
export function verifySignature(public_key: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_account_free: (a: number, b: number) => void;
    readonly account: (a: number, b: number) => [number, number, number];
    readonly accountFromMnemonic: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly account_accountId: (a: number) => [number, number];
    readonly account_address: (a: number) => [number, number];
    readonly account_publicKey: (a: number) => [number, number];
    readonly account_secretKey: (a: number) => [number, number];
    readonly mnemonicToSeed: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly signCall: (a: number, b: number, c: number, d: number, e: any) => [number, number, number, number];
    readonly signCallFromMnemonic: (a: number, b: number, c: number, d: number, e: any, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly signTransfer: (a: number, b: number, c: any) => [number, number, number, number];
    readonly signTransferFromMnemonic: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly verifySignature: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
