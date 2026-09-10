# Browser crypto boundary

`index.ts` is the application interface:

```ts
generateMnemonic(): Promise<string>
validateMnemonic(phrase: string): boolean
deriveAccount(scheme: WalletScheme, mnemonic: string, index: number): Promise<{ address: string; publicKey: string }>
signCall(scheme: WalletScheme, mnemonic: string, index: number, callHex: string, context: SignContext): Promise<string>
```

`WalletScheme` is `"mldsa65"` or `"mldsa87"`; `schemes.ts` holds the scheme table (`DEFAULT_SCHEME`, labels, WASM names, path components) and `derivationPath(scheme, index)`.

`publicKey`, `callHex`, hashes and the returned extrinsic are `0x` hex strings. Amounts/tips are decimal integer strings in base units. Index is the hardened **account** component; the last component is fixed by the scheme, following the official CLI/wallet defaults so one phrase never yields the same key material for both schemes:

| Scheme | HD path | Signature enum variant | Signature + public key |
| --- | --- | --- | --- |
| ML-DSA-65 (default, matches the official wallet) | `m/44'/189189'/index'/0'/1'` | `1` (`DilithiumSignatureScheme::Dilithium65`) | 3309 + 1952 bytes |
| ML-DSA-87 | `m/44'/189189'/index'/0'/0'` | `0` (`DilithiumSignatureScheme::Dilithium87`) | 4627 + 2592 bytes |

BIP39 passphrase is empty. Generated phrases contain 24 English words / 256 entropy bits. Mnemonic inputs are normalized and BIP39 checksum-validated before dispatch. The account id is the Poseidon hash of the public key for both schemes; the runtime tags the signer with the same variant index.

Each derive/sign request gets a new module Worker, which loads local WASM and is terminated after its single response. No RPC is performed inside signing. The UI must obtain live, validated runtime/genesis/nonce/era context, encode the intended call with metadata, show the recipient and amount, and obtain the user's send confirmation before broadcasting. Signing alone does not broadcast.

This module supports transparent ML-DSA-65 and ML-DSA-87 accounts. Wormhole private balances require their separate proving/spending protocol and must not be presented as an equivalent import.

For Wormhole balance scanning the WASM module additionally exports `wormholeAddresses(mnemonic, branch, start, count)` (SS58 addresses at `m/44'/189189189'/0'/<branch>'/<index>'`, branch 0 = receive, 1 = change) and `wormholeNullifier(mnemonic, branch, index, transferCount)` (`H(H("~nullif~" || secret || transferCount))`, matching the official circuit). Neither returns secrets.

## Wormhole exit prover

`wormhole-prover.worker.ts` is a second disposable module Worker that lazily imports the separate prover artifact `vendor/quantus-wasm/browser-prover/` (~4 MB, feature `wormhole-prover`, built by `scripts/build-prover.sh`; excluded from the app-shell precache). It receives the phrase and a chain-derived request once, calls `wormholeProveExit(mnemonic, request, onProgress)` and posts back progress `(stage, done, total)` and the result: proof bytes of one **private batch** (`wormhole.verifyPrivateBatch`, up to 7 deposits) plus the decoded public inputs (block, fee, nullifiers, exit slot). The proof is verified inside WASM with the official verifier and pinned circuit artifacts before it is returned; secrets never leave the module. `wormholeProverInfo()` reports the circuit version, sizes and pins; `wormholeSyntheticExitRequest()` only exists for measurements and tests.

The protocol around it — chain rules, fee preview, Merkle proofs and header, extrinsic encoding, `TaggedTransactionQueue_validate_transaction` pre-check, single broadcast guarded by a pending receipt and a Web Lock, tracking with re-broadcast, receipts in `localStorage` — lives in `src/lib/wormhole/exit.ts` (bridge in `src/lib/wormhole/prover.ts`). See `../../vendor/PROVENANCE.md` for the pins, measurements and why public batches are out of reach in a browser.

See `../../vendor/PROVENANCE.md` for upstream pins, the mainnet context adaptation, licenses, rebuild and validation instructions. `core.ts` is an internal bridge used by the Worker and offline tests; UI code should import `index.ts`.
