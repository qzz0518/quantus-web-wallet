# Quantus Web Wallet

[Open wallet](https://qtc.zezn.dev) · English | [简体中文](README.zh-CN.md)

A browser wallet for the Quantus network. Keys never leave your device, there is no server and no fee, and the app installs as a PWA on phones and desktops.

## Features

- **Accounts.** Create, import and manage multiple wallets. Both signature schemes the network uses are supported: ML-DSA-65 (the official wallet's default, path `m/44'/189189'/n'/0'/1'`) and ML-DSA-87 (`…/0'/0'`). Imports show the derived address first so you can compare it with the official wallet before saving. Watch-only accounts, including Wormhole addresses, show public balances and deposits.
- **Transfers.** Send QTC, receive with a QR code, and follow every transaction from submission to finality. Before the amount step the wallet checks the recipient on the public indexer: an address that only ever received mining rewards and never sent anything is almost certainly an encrypted (Wormhole) account, so the wallet explains the consequences and asks for confirmation; an address with no on-chain history gets a hint.
- **History.** Incoming, outgoing and mining-reward activity with search and filters, linked to the Quantus explorer.
- **Backup and security.** Wallets are encrypted locally with a password of at least 6 characters; encrypted backups can be exported and restored; recovery words can be downloaded and are confirmed with a word-selection check. Unlock with your device's fingerprint, face or screen lock on browsers that support WebAuthn PRF. The wallet locks itself after 10 minutes without interaction.
- **Password-free mode.** Opt in from Settings on a private computer: after verifying the password once, the wallet opens by itself on every page load and the idle lock is off; a manual lock holds until the page is loaded again. The unlock key is wrapped with a non-extractable key kept in this browser, so anyone who can open the browser on that computer can open the wallet. Device unlock and the password stay available, and the mode turns itself off when the password changes or a backup is restored.
- **Encrypted account recovery.** Scan an official wallet's encrypted (Wormhole) account with its seed phrase to see the real unspent balance and withdraw deposits to a regular account. See [below](#encrypted-account-recovery).
- **Mining calculator.** Under Tools. The page opens with the four figures that decide a rig — expected QTC per day, profit per day, the break-even QTC price and the break-even rent — and keeps them in view while you edit. Pick your GPUs (or enter a total hashrate), quantity and miner software; uptime, pool and miner-software fees, electricity price or rig rent, an optional hardware cost and the currency label sit behind *More settings*, and the difficulty sensitivity, the GPU comparison, the network state and the method fold open only when you want them. Break-even rent — how much a machine can cost per hour and per day and still pay for itself — is shown under each GPU row, for the whole rig, and as a column in the comparison: the daily output valued at the QTC price, less the running costs the rent does not already cover (renting a whole rig includes the electricity; on your own hardware the electricity comes off first). Difficulty and measured block time come from the chain RPC, recent block rewards from the public indexer, GPU benchmarks and fee terms from Quanpool's public API (with a built-in snapshot as fallback), and the QTC price from SafeTrade's public QUAN/USDT ticker — that request tells the exchange your IP address, the exchange turns some visitors away, and either way you can type a price of your own, which is what the page then uses. Everything is an expectation, and inputs stay in your browser.
- **Interface.** Chinese and English (follows the browser on first use, switchable in settings), light, dark and system themes, a layout for phones and desktops, and installation as a PWA with offline startup.

## Security model

- Seed phrases and keys are stored only in this browser, encrypted with your password. Derivation and signing run inside a disposable Web Worker with the vendored Rust/WASM module; the phrase is never written to storage in clear text, never uploaded, and never shown to any server.
- The wallet screens talk only to the official Quantus RPC node and indexer; the mining calculator additionally reads Quanpool's public API and SafeTrade's public QUAN/USDT ticker, and nothing else on the page does. The Content Security Policy served with the site allows no other host. There is no telemetry, no analytics and no service fee.
- Signing is pinned to the mainnet runtime (`specVersion` 152, `transactionVersion` 6). When the network upgrades, the wallet refuses to sign until it has been reviewed and updated.
- The deployment can be verified: `node scripts/verify-deployment.mjs` compares every file on the site with a local build and checks the security headers.
- This project has not been independently audited. Keep a backup of your seed phrase outside the browser.

## Encrypted account recovery

**What it is.** The official Quantus wallet has an "Encrypted Account" (Wormhole). Its addresses look like ordinary addresses but are derived from the seed phrase at `m/44'/189189189'/0'/<branch>'/<index>'`. Every transfer into such an address becomes a deposit in the privacy pool, and only the holder of the seed phrase can tell which deposits are still unspent; a watch-only view can only show "unknown". Many users have received funds on these addresses by mistake.

**What the tool does.** Under *Settings → Tools → Encrypted account recovery* you can scan an encrypted account with the official wallet's seed phrase. The scan is read-only: it derives the receiving and change addresses locally in a disposable worker, asks the official indexer for deposits to those addresses, derives each deposit's nullifier locally and checks on the official RPC node whether it has been spent. Unspent deposits can then be withdrawn to a regular account: a zero-knowledge proof is generated in the browser, verified locally, and submitted once.

**Steps.**

1. Open *Settings → Tools → Encrypted account recovery* and read the introduction.
2. Enter the official wallet's 24-word seed phrase. Optionally paste the encrypted account address shown by the official wallet; the result will say whether it is among the derived addresses.
3. Confirm the network notice and start the scan. The progress view shows the stage, the branch, the number of addresses scanned and the deposits found; the scan can be cancelled.
4. Review the results: withdrawable balance, spent deposits, the snapshot block and a list of unspent deposits with checkboxes.
5. Select up to 7 deposits, choose the receiving account (one of this wallet's signing accounts, or the regular account derived from the same phrase), check the fee preview and submit. The receipt shows the transaction hash, its phase and an explorer link; previous receipts are listed on the tool's start page.

**Costs.** The chain charges a 0.04% volume fee on the withdrawn amount. Amounts are rounded down to 0.01 QTC first, and the remainder below 0.01 QTC of each deposit is lost. Half of the fee is burned and half goes to the block producer; there is no rebate. Proof generation needs about 1.5 GB of memory and roughly a minute; use a desktop browser and keep the page open.

**Limits.** The scan snapshots one finalized block that the RPC node and the indexer agree on; deposits after that block are not included. It stops after 20 consecutive unused addresses per branch and refuses to report a balance when an account exceeds 1000 addresses per branch or 10 000 deposits, so an incomplete scan is shown as an error rather than a smaller balance. One withdrawal takes at most 7 deposits; larger accounts are withdrawn in several rounds. A deposit below 0.02 QTC cannot be withdrawn on its own because the fee would consume it. The seed phrase stays in the page and the local signing module, but the official indexer and RPC node see the derived addresses and your IP address.

## Installation

Open the [web wallet](https://qtc.zezn.dev) and choose **Install app** or **Add to Home Screen** in your browser. On iPhone, use Safari → Share → Add to Home Screen. Balance updates and transfers require an internet connection.

## Development

Requires [Bun](https://bun.sh) 1.4.0. [mise](https://mise.jdx.dev) can install the pinned tools with `mise install`.

```sh
git clone https://github.com/qzz0518/quantus-web-wallet.git
cd quantus-web-wallet
bun install --frozen-lockfile
bun run dev        # http://127.0.0.1:5189
bun run check      # TypeScript
bun run test       # unit tests, including the English dictionary check
bun run build && bun run preview
```

Browser fixtures for layout checks live under `tests/browser/`. The end-to-end withdrawal test runs only against an isolated local dev chain and only when `QUANTUS_DEV_TEST=1` is set. The signing module and the Wormhole prover are checked in as compiled WASM; Rust is needed only to [rebuild them](vendor/PROVENANCE.md#rebuild) with `scripts/build-wasm.sh` and `scripts/build-prover.sh`.

## Deployment

Deploy `dist/` to a static host with HTTPS. The `_headers` file carries the Content Security Policy, HSTS and the other security headers for hosts that support it; `wrangler.jsonc` configures the Cloudflare deployment used by qtc.zezn.dev (`bun run deploy`). After deploying, run `node scripts/verify-deployment.mjs [origin]` to confirm that the site matches the local build and serves the expected headers.

## License

GPL-3.0-only. The vendored cryptography carries its own licenses; see [vendor/PROVENANCE.md](vendor/PROVENANCE.md).
