<div align="center">
  <img src="./public/icons/icon-192.png" alt="Quantus Web Wallet" width="96" height="96">
  <h1>Quantus Web Wallet</h1>
  <p><strong>Quantus 网络的网页钱包：没有服务器、没有手续费，密钥只留在你的设备上</strong></p>

  <p>
    <a href="https://qtc.zezn.dev"><img src="https://img.shields.io/badge/open-qtc.zezn.dev-1f6f4a" alt="打开钱包"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="License"></a>
  </p>

  <a href="README.md">English</a> | 简体中文
</div>

打开 [qtc.zezn.dev](https://qtc.zezn.dev)，创建或导入钱包，它就像一个
App：可以安装到主屏幕，用密码或设备指纹解锁，用后量子 ML-DSA 签名发送
QTC。页面只连接官方节点、公开索引器和 SafeTrade 行情接口，不收集任何数据。

## 功能

- **钱包** — 创建、导入和管理 ML-DSA-65 / ML-DSA-87 账户；观察地址；本机加密备份与助记词导出
- **收发** — 二维码收款、实时手续费、追踪到最终确认，五个词的校验短语让双方口头就能核对地址
- **延时可撤回转账** — 转账先冻结 10 分钟、1 小时或 1 天，到账前随时撤回
- **加密账户（Wormhole）** — 存入自己的隐私地址，或用官方钱包助记词扫描并在浏览器里取回未花费资产
- **美元估值** — 每个钱包和全部钱包的合计，按 QUANTUS/USDT 实时行情折算
- **工具** — 带保本价和保本租金的挖矿计算、含奖励衰减曲线的网络状态、任意地址的矿工看板
- **免密模式** — 私人电脑上验证一次密码，之后打开页面自动解锁
- **中英文**、亮暗主题、手机和桌面

## 安装

打开[钱包](https://qtc.zezn.dev)，在浏览器里选择**安装应用**或**添加到主屏幕**。iPhone 用 Safari → 分享 → 添加到主屏幕。

## 开发

需要 [Bun](https://bun.sh) 1.4。

```bash
git clone https://github.com/qzz0518/quantus-web-wallet.git
cd quantus-web-wallet
bun install
bun run dev        # http://127.0.0.1:5189
bun run test
bun run build
```

签名模块和 Wormhole 证明器以编译好的 WASM 形式提交在仓库里，只有[重新构建](vendor/PROVENANCE.md)时才需要 Rust。`bun run deploy` 发布到 Cloudflare，`node scripts/verify-deployment.mjs` 核对线上文件与本地构建一致。

## 许可证

[GPL-3.0](LICENSE)。第三方密码学库各有自己的许可证，见 [vendor/PROVENANCE.md](vendor/PROVENANCE.md)。
