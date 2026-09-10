/** Wallet shell, overview, welcome, switcher, send and receive dialogs. */
export const wallet: Record<string, string> = {
  // SendDialog
  "观察钱包不能签名": "Watch-only wallets cannot sign transactions",
  "收款地址与当前钱包相同": "The recipient address is the same as this wallet",
  "可用余额不足以支付金额和手续费":
    "Insufficient available balance to cover the amount and network fee",
  "转账后需保留至少 {0} {1} 以维持账户":
    "At least {0} {1} must remain after sending to keep the account active",
  "费用报价已过期，请更新费用后重新确认":
    "The fee quote has expired. Refresh the fee and confirm again",
  "账户或网络状态已变化，请更新费用后重新确认":
    "The account or network state has changed. Refresh the fee and confirm again",
  "余额或手续费已变化，请更新费用后重新确认":
    "The balance or network fee has changed. Refresh the fee and confirm again",
  "提交结果待确认，请保留哈希并核对链上状态，勿重复发送。":
    "Submission result unconfirmed. Keep the hash, check the on-chain status and do not send again.",
  "提交结果待确认，请核对链上状态":
    "Submission result unconfirmed. Check the on-chain status",
  "提交结果待确认，且本机记录保存失败。请保留交易哈希并在 Explorer 中核对，勿重复发送。":
    "Submission result unconfirmed and the local record could not be saved. Keep the transaction hash, check it in Explorer and do not send again.",
  "节点拒绝提交：{0}": "Rejected by the node: {0}",
  "交易状态待确认": "Transaction status unconfirmed",
  "交易已提交": "Transaction submitted",
  "确认转账": "Confirm transfer",
  "发送金额": "Amount",
  "发送 {0}": "Send {0}",
  "请核对交易结果": "Check the transaction result",
  "已发送至网络": "Sent to the network",
  "请核对链上状态，暂勿重复发送。":
    "Check the on-chain status before sending again.",
  "交易正在等待确认，可在活动记录中查看进度。":
    "Waiting for confirmation. Track progress in Activity.",
  "交易哈希": "Transaction hash",
  "复制失败，请手动复制上方哈希": "Copy failed. Copy the hash above manually",
  "哈希已复制": "Hash copied",
  "复制交易哈希": "Copy transaction hash",
  "在 Explorer 查看": "View in Explorer",
  "完成": "Done",
  "付款钱包": "From",
  "收款地址": "Recipient address",
  "网络": "Network",
  "预估手续费": "Estimated network fee",
  "预计总支出": "Estimated total",
  "我已核对完整收款地址与金额":
    "I have checked the full recipient address and amount",
  "费用需要更新，更新后请重新核对。":
    "The fee needs to be refreshed. Check the details again afterwards.",
  "正在更新费用…": "Refreshing fee…",
  "正在提交…": "Submitting…",
  "更新费用": "Refresh fee",
  "确认并发送": "Confirm and send",
  "发送给谁？": "Who are you sending to?",
  "输入收款人的 Quantus 主网地址。":
    "Enter the recipient's Quantus mainnet address.",
  "输入或粘贴 Quantus 地址": "Enter or paste a Quantus address",
  "我的其他钱包": "My other wallets",
  "选择一个钱包": "Choose a wallet",
  "请确认对方使用 Quantus 主网。下一步输入金额，再核对手续费。":
    "Make sure the recipient is on Quantus mainnet. Next, enter the amount and review the network fee.",
  "发送多少？": "How much?",
  "从 {0} 发送 {1}。": "Send {1} from {0}.",
  "修改": "Edit",
  "下一步预览网络手续费与总支出。":
    "Next, preview the network fee and total.",
  "正在计算费用…": "Calculating fee…",
  "继续": "Continue",
  "预览转账": "Preview transfer",

  // WalletOverview
  "钱包余额": "Wallet balance",
  "余额待确认": "Balance unconfirmed",
  "隐私账户": "Encrypted account",
  "公开余额": "Public balance",
  "账户余额": "Balance",
  "显示余额": "Show balance",
  "隐藏余额": "Hide balance",
  "未花费余额需在官方钱包查看":
    "Check the unspent balance in the official wallet",
  "请在钱包详情中确认账户类型": "Confirm the account type in wallet details",
  "仅查看": "View only",
  "可用 {0} QTC": "{0} QTC available",
  "余额暂未更新": "Balance not updated",
  "正在更新…": "Updating…",
  "等待余额更新": "Waiting for balance",
  "接收": "Receive",
  "发送": "Send",
  "当前钱包卡片": "Current wallet card",
  "管理当前钱包": "Manage wallet",
  "观察钱包": "Watch-only wallet",
  "我的账户": "My account",
  "复制当前钱包地址": "Copy wallet address",
  "查看钱包详情": "View wallet details",
  "详情": "Details",
  "累计公开入账 {0} QTC，不代表可用余额。":
    "{0} QTC received publicly in total. This is not the available balance.",
  "仅查看公开入账，转出请使用官方钱包。":
    "Shows public deposits only. Use the official wallet to send.",
  "确认观察账户类型": "Confirm watch-only account type",
  "观察账户无法发送资产": "Watch-only accounts cannot send",
  "Quantus 主网账户": "Quantus mainnet account",

  // WalletLayout
  "钱包": "Wallet",
  "活动": "Activity",
  "设置": "Settings",
  "移动端导航": "Mobile navigation",
  "主要导航": "Main navigation",
  "切换钱包": "Switch wallet",
  "我的钱包": "My wallet",
  "刷新余额与交易": "Refresh balance and transactions",
  "锁定钱包": "Lock wallet",
  "解锁钱包": "Unlock wallet",
  "连接中断，请刷新重试": "Connection lost. Refresh to retry",
  "Quantus 主网 · 区块 #{0}": "Quantus mainnet · Block #{0}",
  "正在连接 Quantus 主网": "Connecting to Quantus mainnet",
  "连接中断": "Disconnected",
  "Quantus 主网": "Quantus mainnet",
  "正在连接": "Connecting",
  "暂时无法连接网络，请联网后刷新。":
    "Unable to connect. Check your connection and refresh.",
  "重试": "Retry",

  // WalletSwitcher / WalletChooser
  "添加钱包": "Add wallet",
  "添加一个钱包": "Add a wallet",
  "选择适合你的开始方式。": "Choose how you'd like to start.",
  "创建新钱包": "Create new wallet",
  "生成一个独立的地址与助记词": "Generate a new address and seed phrase",
  "导入已有钱包": "Import existing wallet",
  "通过 ML-DSA-87 助记词恢复": "Restore from an ML-DSA-87 seed phrase",
  "添加观察钱包": "Add watch-only wallet",
  "查看余额、转账记录与挖矿奖励":
    "View balance, transfers and mining rewards",
  "你可以添加多个钱包，并随时切换。":
    "You can add multiple wallets and switch at any time.",

  // Welcome
  "由你掌握": "In your hands",
  "欢迎回来": "Welcome back",
  "你的钱包，由你掌握": "Your wallet, in your hands",
  "解锁钱包，继续管理你的 Quantus 资产。":
    "Unlock your wallet to keep managing your Quantus assets.",
  "发送、接收与管理 Quantus。\n从一个属于自己的钱包开始。":
    "Send, receive and manage Quantus.\nStart with a wallet that's truly yours.",
  "观察地址": "Watch an address",
  "恢复加密备份": "Restore encrypted backup",
  "密钥加密保存在这台设备上": "Keys are encrypted and stored on this device",

  // ReceiveDialog
  "Quantus 主网收款地址：{0}": "Quantus mainnet address: {0}",
  "复制失败，请手动选中地址": "Copy failed. Select the address manually",
  "二维码尚未准备好": "The QR code is not ready yet",
  "收款二维码下载已开始": "QR code download started",
  "暂时无法保存二维码，请稍后重试":
    "Unable to save the QR code right now. Try again later",
  "接收 QTC": "Receive QTC",
  "完整收款地址": "Full receiving address",
  "保存二维码": "Save QR code",
  "分享未完成，可以复制地址后发送":
    "Sharing didn't complete. Copy the address and send it instead",
  "正在分享…": "Sharing…",
  "分享地址": "Share address",
  "在 Explorer 查看账户": "View account in Explorer",
  "请仅通过 Quantus 主网向此地址发送 QTC。":
    "Only send QTC to this address on Quantus mainnet.",
  "正在复制…": "Copying…",
  "地址已复制": "Address copied",
  "复制完整地址": "Copy full address",
};
