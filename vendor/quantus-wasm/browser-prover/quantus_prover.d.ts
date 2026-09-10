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
     * ML-DSA public key (1952 bytes for ML-DSA-65, 2592 bytes for ML-DSA-87).
     */
    readonly publicKey: Uint8Array;
    /**
     * `"ml-dsa-65"` or `"ml-dsa-87"`.
     */
    readonly scheme: string;
    /**
     * ML-DSA secret key (4032 bytes for ML-DSA-65, 4896 bytes for ML-DSA-87).
     */
    readonly secretKey: Uint8Array;
}

/**
 * Derive an ML-DSA-87 Quantus account from a 32-byte seed.
 */
export function account(seed: Uint8Array): Account;

/**
 * Derive an ML-DSA-87 Quantus account from a mnemonic at the given HD indices.
 */
export function accountFromMnemonic(mnemonic: string, account: number, change: number, address_index: number, passphrase?: string | null): Account;

/**
 * Derive a Quantus account from a mnemonic at the given HD indices for the
 * named scheme (`"ml-dsa-65"` or `"ml-dsa-87"`).
 */
export function accountFromMnemonicScheme(scheme: string, mnemonic: string, account: number, change: number, address_index: number, passphrase?: string | null): Account;

/**
 * Exposed for the JS bridge so its scheme table can be checked against this crate.
 */
export function canonicalAddressIndex(scheme: string): number;

/**
 * BIP39 mnemonic -> 64-byte seed (bridge to the seed-based API).
 */
export function mnemonicToSeed(mnemonic: string, passphrase?: string | null): Uint8Array;

/**
 * Sign an already-encoded `RuntimeCall` (e.g. polkadot.js `tx.method.toU8a()`)
 * with the ML-DSA-87 seed account, returning the SCALE-encoded v4 extrinsic.
 */
export function signCall(seed: Uint8Array, call: Uint8Array, context: any): Uint8Array;

/**
 * Sign an already-encoded `RuntimeCall` with ML-DSA-87 from a mnemonic at the
 * given HD indices.
 */
export function signCallFromMnemonic(mnemonic: string, call: Uint8Array, context: any, account: number, change: number, address_index: number, passphrase?: string | null): Uint8Array;

/**
 * Sign an already-encoded `RuntimeCall` from a mnemonic at the given HD indices
 * for the named scheme.
 */
export function signCallFromMnemonicScheme(scheme: string, mnemonic: string, call: Uint8Array, context: any, account: number, change: number, address_index: number, passphrase?: string | null): Uint8Array;

/**
 * Sign a balances/assets transfer with the ML-DSA-87 seed account, returning
 * the SCALE-encoded v4 extrinsic.
 */
export function signTransfer(seed: Uint8Array, params: any): Uint8Array;

/**
 * Sign a transfer with ML-DSA-87 from a mnemonic at the given HD indices.
 */
export function signTransferFromMnemonic(mnemonic: string, params: any, account: number, change: number, address_index: number, passphrase?: string | null): Uint8Array;

/**
 * Sign a transfer from a mnemonic at the given HD indices for the named scheme.
 */
export function signTransferFromMnemonicScheme(scheme: string, mnemonic: string, params: any, account: number, change: number, address_index: number, passphrase?: string | null): Uint8Array;

/**
 * Variant index the runtime's `DilithiumSignatureScheme` / `DilithiumSigner`
 * enums use for the named scheme (`0` = ML-DSA-87, `1` = ML-DSA-65).
 */
export function signatureVariant(scheme: string): number;

/**
 * Verify a raw ML-DSA-87 signature using the mainnet extrinsic domain.
 * Used to check browser signing against native runtime compatibility tests.
 */
export function verifySignature(public_key: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;

/**
 * Verify a raw signature of the named scheme using the mainnet extrinsic domain.
 */
export function verifySignatureScheme(scheme: string, public_key: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;

/**
 * SS58 wormhole receiving (`branch = 0`) or change (`branch = 1`) addresses
 * for indices `start..start + count`. Secrets are not returned.
 */
export function wormholeAddresses(mnemonic: string, branch: number, start: number, count: number, passphrase?: string | null): string[];

/**
 * 32-byte nullifier for the deposit with `transfer_count` to the wormhole
 * account at (`branch`, `index`). Secrets are not returned.
 */
export function wormholeNullifier(mnemonic: string, branch: number, index: number, transfer_count: bigint, passphrase?: string | null): Uint8Array;

/**
 * Prove an exit of the given deposits to `exitAddress`. `onProgress` receives
 * `(stage, done, total)`. Returns the proof and its decoded public inputs;
 * the phrase and derived secrets never leave the module.
 */
export function wormholeProveExit(mnemonic: string, request: any, on_progress?: Function | null): any;

/**
 * Describe the compiled prover (batch kind, sizes, pinned artifact hashes).
 */
export function wormholeProverInfo(): any;

/**
 * Synthetic request builder for browser measurements and tests (see
 * [`synthetic_request`]); returns the request as a JSON string.
 */
export function wormholeSyntheticExitRequest(mnemonic: string, count: number, exit_address: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_account_free: (a: number, b: number) => void;
    readonly account: (a: number, b: number) => [number, number, number];
    readonly accountFromMnemonic: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly accountFromMnemonicScheme: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly account_accountId: (a: number) => [number, number];
    readonly account_address: (a: number) => [number, number];
    readonly account_publicKey: (a: number) => [number, number];
    readonly account_scheme: (a: number) => [number, number];
    readonly account_secretKey: (a: number) => [number, number];
    readonly canonicalAddressIndex: (a: number, b: number) => [number, number, number];
    readonly mnemonicToSeed: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly signCall: (a: number, b: number, c: number, d: number, e: any) => [number, number, number, number];
    readonly signCallFromMnemonic: (a: number, b: number, c: number, d: number, e: any, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly signCallFromMnemonicScheme: (a: number, b: number, c: number, d: number, e: number, f: number, g: any, h: number, i: number, j: number, k: number, l: number) => [number, number, number, number];
    readonly signTransfer: (a: number, b: number, c: any) => [number, number, number, number];
    readonly signTransferFromMnemonic: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly signTransferFromMnemonicScheme: (a: number, b: number, c: number, d: number, e: any, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly signatureVariant: (a: number, b: number) => [number, number, number];
    readonly verifySignature: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly verifySignatureScheme: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly wormholeAddresses: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly wormholeNullifier: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: number) => [number, number, number, number];
    readonly wormholeProveExit: (a: number, b: number, c: any, d: number) => [number, number, number];
    readonly wormholeProverInfo: () => [number, number, number];
    readonly wormholeSyntheticExitRequest: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly _critical_section_1_0_acquire: () => number;
    readonly _critical_section_1_0_release: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
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
