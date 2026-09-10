# Quantus Web Wallet

[Open wallet](https://qtc.zezn.dev) · English | [简体中文](README.zh-CN.md)

A browser wallet for Quantus.

## Features

- Create, import and manage multiple ML-DSA-65 (the official wallet default) and ML-DSA-87 wallets plus watch-only accounts. Imports show the derived address first so it can be compared with the official wallet.
- View balances, send QTC, receive with a QR code, and browse transaction history.
- Download recovery words and confirm backups with a word-selection check.
- Open accounts and transactions in the Quantus explorer.
- Encrypt wallets locally with a password of at least 6 characters; export and restore encrypted backups.
- Unlock with your device's fingerprint, face or screen lock on browsers that support WebAuthn PRF.
- Warns before sending to an address that looks like an encrypted (Wormhole) account, and hints when a recipient has no on-chain history.
- Chinese and English interface; the language follows the browser on first use and can be changed in settings.
- Light, dark and system themes, with a responsive mobile layout.
- Install as a PWA for a standalone app window and offline startup.
- Monitor wormhole addresses as watch-only accounts.
- Recover funds sent to an encrypted (Wormhole) account: scan with the official wallet's seed phrase to see the real unspent balance and withdraw to a regular account (see below).

## Encrypted account recovery

**What it is.** The official Quantus wallet has an "Encrypted Account" (Wormhole). Its addresses look like ordinary addresses but are derived from the seed phrase at `m/44'/189189189'/0'/<branch>'/<index>'`. Every transfer into such an address becomes a deposit in the privacy pool, and only the holder of the seed phrase can tell which deposits are still unspent — a watch-only view can only show "unknown". Many users have received funds on these addresses by mistake.

**What the tool does.** Under *Settings → Tools → Encrypted account recovery* you can scan an encrypted account with the official wallet's seed phrase. The scan is read-only: it derives the receiving and change addresses locally in a disposable worker, asks the official indexer for deposits to those addresses, derives each deposit's nullifier locally and checks on the official RPC node whether it has been spent. Unspent deposits can then be withdrawn to a regular account: a zero-knowledge proof is generated in the browser and submitted once.

**Steps.**

1. Open *Settings → Tools → Encrypted account recovery* and read the introduction.
2. Enter the official wallet's 24-word seed phrase. Optionally paste the encrypted account address shown by the official wallet — the result will say whether it is among the derived addresses.
3. Confirm the network notice and start the scan. The progress view shows the stage, the branch, the number of addresses scanned and the deposits found; the scan can be cancelled.
4. Review the results: withdrawable balance, spent deposits, the snapshot block and a list of unspent deposits with checkboxes.
5. Select up to 7 deposits, choose the receiving account (one of this wallet's signing accounts, or the regular account derived from the same phrase), check the fee preview and submit. The receipt shows the transaction hash, its phase and an explorer link; previous receipts are listed on the tool's start page.

**Costs.** The chain charges a 0.04% volume fee on the withdrawn amount. Amounts are rounded down to 0.01 QTC first, and the remainder below 0.01 QTC of each deposit is lost. When withdrawing to your own account, half of the fee comes back to the receiving account as a rebate. Proof generation needs about 1 GB of memory; a desktop browser is recommended.

**Limits.** The scan snapshots one finalized block that the RPC node and the indexer agree on; deposits after that block are not included. It stops after 20 consecutive unused addresses per branch and refuses to report a balance when an account exceeds 1000 addresses per branch or 10 000 deposits, so an incomplete scan is shown as an error rather than a smaller balance. One withdrawal takes at most 7 deposits; larger accounts are withdrawn in several rounds. The seed phrase stays in the page and the local signing module — it is never stored or uploaded — but the official indexer and RPC node see the derived addresses and your IP address.

## Installation

Open the [web wallet](https://qtc.zezn.dev) and choose **Install app** or **Add to Home Screen** in your browser. On iPhone, use Safari → Share → Add to Home Screen. Balance updates and transfers require an internet connection.

To run locally:

Requires [Bun](https://bun.sh) 1.4.0. [mise](https://mise.jdx.dev) can install the pinned tools with `mise install`.

```sh
git clone https://github.com/qzz0518/quantus-web-wallet.git
cd quantus-web-wallet
bun install --frozen-lockfile
bun run dev
```

Open [http://127.0.0.1:5189](http://127.0.0.1:5189).

To build and preview the production app:

```sh
bun run build
bun run preview
```

Deploy `dist/` to a static host with HTTPS. The `_headers` file carries the Content Security Policy and HSTS for hosts that support it. After deploying, `node scripts/verify-deployment.mjs [origin]` checks that every file on the site matches the local build and that the security headers are served. The browser signing module is included; Rust is only needed to [rebuild it](vendor/PROVENANCE.md#rebuild).
