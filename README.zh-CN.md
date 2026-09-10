# Quantus Web Wallet

[打开钱包](https://qtc.zezn.dev) · [English](README.md) | 简体中文

用于 Quantus 的网页钱包。

## 功能

- 创建、导入和管理多个 ML-DSA-65（官方钱包默认）和 ML-DSA-87 钱包及观察账户；导入时先显示派生地址，便于与官方钱包核对。
- 查询余额、发送 QTC、通过二维码收款、查看交易记录。
- 下载助记词，通过候选词选择验证备份。
- 快速在 Quantus 区块浏览器中查看账户与交易。
- 使用至少 6 位密码在本地加密钱包，支持加密备份导出与恢复。
- 在支持 WebAuthn PRF 的浏览器中，通过设备指纹、人脸或锁屏验证解锁。
- 发送前核对收款地址：疑似加密账户（Wormhole）地址会先提示后果并要求确认，没有链上记录的地址会给出提醒。
- 中英文界面，首次使用跟随浏览器语言，可在设置中切换。
- 支持浅色、深色及跟随系统主题，适配手机屏幕。
- 支持安装为 PWA，以独立窗口打开并离线启动。
- 支持只读查看虫洞地址。

## 安装

打开[网页钱包](https://qtc.zezn.dev)，在浏览器中选择 **安装应用** 或 **添加到主屏幕**。iPhone 请使用 Safari → 分享 → 添加到主屏幕。余额更新与转账需要联网。

本地运行：

需要 [Bun](https://bun.sh) 1.4.0。也可通过 [mise](https://mise.jdx.dev) 运行 `mise install` 安装项目固定版本的工具。

```sh
git clone https://github.com/qzz0518/quantus-web-wallet.git
cd quantus-web-wallet
bun install --frozen-lockfile
bun run dev
```

打开 [http://127.0.0.1:5189](http://127.0.0.1:5189)。

构建并预览生产版本：

```sh
bun run build
bun run preview
```

将 `dist/` 部署到启用 HTTPS 的静态托管服务即可。`_headers` 文件包含内容安全策略和 HSTS，支持该文件的托管平台会自动应用。部署后运行 `node scripts/verify-deployment.mjs [站点地址]`，可校验线上每个文件与本地构建一致，并检查安全响应头。仓库已包含浏览器签名模块，仅在[重新编译该模块](vendor/PROVENANCE.md#rebuild)时需要 Rust。
