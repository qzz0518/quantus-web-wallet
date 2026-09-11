<div align="center">
  <img src="./public/icons/icon-192.png" alt="Quantus Web Wallet" width="96" height="96">
  <h1>Quantus Web Wallet</h1>
  <p><strong>A browser wallet for the Quantus network — no server, no fee, keys stay on your device</strong></p>

  <p>
    <a href="https://qtc.zezn.dev"><img src="https://img.shields.io/badge/open-qtc.zezn.dev-1f6f4a" alt="Open wallet"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="License"></a>
  </p>

  English | <a href="README.zh-CN.md">简体中文</a>
</div>

Open [qtc.zezn.dev](https://qtc.zezn.dev), create or import a wallet, and it
works like an app: install it to your home screen, unlock with a password or
your device's biometrics, and send QTC with post-quantum ML-DSA signatures.
The page talks only to the official Quantus node, the public indexer, and
SafeTrade's price ticker; nothing is collected.

## Features

- **Wallets** — create, import and manage ML-DSA-65 / ML-DSA-87 accounts;
  watch-only addresses; encrypted local backups and seed phrase export
- **Send and receive** — QR codes, live fee quotes, delivery tracking to
  finality, and a five-word check phrase so both sides can confirm an
  address by voice
- **Delayed, reversible transfers** — hold a transfer for 10 minutes, an
  hour or a day and take it back before it lands
- **Encrypted account (Wormhole)** — deposit to your own private address,
  or scan an official-wallet seed and withdraw its unspent funds in the
  browser
- **Balance in dollars** — every wallet and the total across wallets, from
  the live QUANTUS/USDT market
- **Tools** — mining calculator with break-even price and rent, network
  status with the reward decay curve, and a miner dashboard for any address
- **Password-free mode** — on a private computer, unlock once and the wallet
  opens by itself
- **Chinese and English**, light and dark, phone and desktop

## Install

Open the [wallet](https://qtc.zezn.dev) and choose **Install app** or
**Add to Home Screen** in your browser. On iPhone: Safari → Share → Add to
Home Screen.

## Development

Requires [Bun](https://bun.sh) 1.4.

```bash
git clone https://github.com/qzz0518/quantus-web-wallet.git
cd quantus-web-wallet
bun install
bun run dev        # http://127.0.0.1:5189
bun run test
bun run build
```

The signing module and the Wormhole prover are checked in as compiled WASM;
Rust is needed only to [rebuild them](vendor/PROVENANCE.md). `bun run deploy`
publishes to Cloudflare, and `node scripts/verify-deployment.mjs` checks that
the live site matches the local build.

## License

[GPL-3.0](LICENSE). Vendored cryptography carries its own licenses; see
[vendor/PROVENANCE.md](vendor/PROVENANCE.md).
