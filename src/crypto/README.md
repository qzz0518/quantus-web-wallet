# Browser crypto boundary

`index.ts` is the application interface:

```ts
generateMnemonic(): Promise<string>
validateMnemonic(phrase: string): boolean
deriveAccount(mnemonic: string, index: number): Promise<{ address: string; publicKey: string }>
signCall(mnemonic: string, index: number, callHex: string, context: SignContext): Promise<string>
```

`publicKey`, `callHex`, hashes and the returned extrinsic are `0x` hex strings. Amounts/tips are decimal integer strings in base units. Index is the hardened **account** component of `m/44'/189189'/index'/0'/0'`, not the last address component. BIP39 passphrase is empty. Generated phrases contain 24 English words / 256 entropy bits. Mnemonic inputs are normalized and BIP39 checksum-validated before dispatch.

Each derive/sign request gets a new module Worker, which loads local WASM and is terminated after its single response. No RPC is performed inside signing. The UI must obtain live, validated runtime/genesis/nonce/era context, encode the intended call with metadata, show the recipient and amount, and obtain the user's send confirmation before broadcasting. Signing alone does not broadcast.

This module supports transparent ML-DSA-87 accounts. The same phrase may identify a different account under ML-DSA-65; wormhole private balances require their separate proving/spending protocol. Those formats must not be silently presented as equivalent imports.

See `../../vendor/PROVENANCE.md` for upstream pins, the mainnet context adaptation, licenses, rebuild and validation instructions. `core.ts` is an internal bridge used by the Worker and offline tests; UI code should import `index.ts`.
