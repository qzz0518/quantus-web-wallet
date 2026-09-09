# Quantus Web Wallet

[Open wallet](https://qtc.zezn.dev) · English | [简体中文](README.zh-CN.md)

A browser wallet for Quantus.

## Features

- Create, import and manage multiple ML-DSA-87 wallets and watch-only accounts.
- View balances, send QTC, receive with a QR code, and browse transaction history.
- Open accounts and transactions in the Quantus explorer.
- Encrypt wallets locally with a password of at least 6 characters; export and restore encrypted backups.
- Unlock with your device's fingerprint, face or screen lock on browsers that support WebAuthn PRF.
- Light, dark and system themes, with a responsive mobile layout.
- Install as a PWA for a standalone app window and offline startup.
- Monitor wormhole addresses as watch-only accounts.

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

Deploy `dist/` to a static host with HTTPS. The browser signing module is included; Rust is only needed to [rebuild it](vendor/PROVENANCE.md#rebuild).
