// Settings page, device unlock, About, and wallet management dialogs.
export const settings: Record<string, string> = {
  // SettingsPage
  "钱包设置": "Wallet settings",
  "查看当前钱包详情": "View current wallet details",
  "添加钱包": "Add wallet",
  "解锁钱包": "Unlock wallet",
  "我的钱包": "My wallet",
  "全部钱包": "All wallets",
  "钱包已锁定": "Wallet locked",
  "添加你的第一个账户": "Add your first account",
  "解锁后管理账户": "Unlock to manage accounts",
  "账户": "Accounts",
  "{0} 个": "{0}",
  "解锁后查看": "Unlock to view",
  "安全与备份": "Security & backup",
  "解锁密码": "Unlock password",
  "设备解锁": "Device unlock",
  "已开启": "On",
  "未开启": "Off",
  "加密备份": "Encrypted backup",
  "应用": "App",
  "外观": "Appearance",
  "添加到主屏幕": "Add to Home Screen",
  "已添加": "Added",
  "关于钱包": "About",
  "锁定钱包": "Lock wallet",
  "为钱包留一份备份": "Keep a backup of your wallets",
  "导出这台设备上的全部钱包。恢复时需要当前解锁密码。":
    "Export every wallet on this device. You'll need your current unlock password to restore it.",
  "备份内容": "Contents",
  "1 个钱包": "1 wallet",
  "{0} 个钱包": "{0} wallets",
  "文件格式": "Format",
  "加密 JSON": "Encrypted JSON",
  "请将备份文件保存在另一台设备。修改密码或添加钱包后，记得重新备份。":
    "Store the backup file on another device. Back up again after changing your password or adding a wallet.",
  "备份下载已开始": "Backup download started",
  "备份导出失败，请重试。": "Backup export failed. Please try again.",
  "再次导出备份": "Export again",
  "导出加密备份": "Export encrypted backup",
  "钱包已在主屏幕": "Already on your Home Screen",
  "随手打开你的钱包": "Open your wallet in a tap",
  "下次可以直接从主屏幕打开，继续管理你的账户。":
    "Next time, open it straight from your Home Screen to keep managing your accounts.",
  "像应用一样打开钱包，快速查看资产和交易。":
    "Open the wallet like an app for quick access to your assets and transactions.",
  "请通过 HTTPS 或 localhost 打开钱包后安装。":
    "Open the wallet over HTTPS or localhost to install it.",
  "用 Safari 打开钱包。": "Open the wallet in Safari.",
  "点击浏览器的分享按钮。": "Tap the Share button.",
  "选择“添加到主屏幕”。": "Choose “Add to Home Screen”.",
  "打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。":
    "Open the browser menu and choose “Install app” or “Add to Home Screen”.",
  "暂时无法打开安装窗口，请从浏览器菜单安装。":
    "Couldn't open the install prompt. Install from the browser menu instead.",
  "请在系统窗口中确认…": "Confirm in the system prompt…",
  "安装钱包应用": "Install wallet app",
  "知道了": "Got it",

  // DeviceUnlockSettings
  "设备解锁已开启，下次锁定后即可使用":
    "Device unlock is on. It'll be available the next time the wallet locks.",
  "新密码至少需要 6 位": "New password must be at least 6 characters",
  "两次输入的新密码不一致，请检查确认密码":
    "The new passwords don't match. Check the confirmation.",
  "密码已更新": "Password updated",
  "请使用新密码解锁，并重新导出一份加密备份。":
    "Use your new password to unlock, and export a fresh encrypted backup.",
  "原设备解锁已停用，可返回设置重新开启。":
    "Device unlock was turned off. You can turn it back on in Settings.",
  "导出新备份": "Export new backup",
  "完成": "Done",
  "修改解锁密码": "Change unlock password",
  "更新解锁密码": "Update unlock password",
  "至少 6 位。修改后，请使用新密码解锁并重新备份钱包。":
    "At least 6 characters. After changing it, unlock with the new password and back up your wallets again.",
  "当前密码": "Current password",
  "修改密码的当前密码": "Current password for password change",
  "新密码": "New password",
  "至少 6 位": "At least 6 characters",
  "确认新密码": "Confirm new password",
  "再次输入新密码": "Enter the new password again",
  "正在更新…": "Updating…",
  "更新密码": "Update password",
  "轻触一下，解锁钱包": "Unlock with a touch",
  "使用指纹、面容或设备验证快速解锁。可用方式由系统决定，密码解锁始终保留。":
    "Unlock quickly with your fingerprint, face, or device verification. Your system decides what's available, and password unlock always stays.",
  "设备解锁已开启": "Device unlock is on",
  "每次解锁都需要系统验证。": "Every unlock requires system verification.",
  "开启设备解锁": "Turn on device unlock",
  "验证当前密码": "Verify current password",
  "开启设备解锁的密码": "Password to turn on device unlock",
  "正在检测设备支持…": "Checking device support…",
  "打开 localhost": "Open localhost",
  "两个地址的浏览器存储相互独立。在新地址恢复备份后即可设置，旧地址的钱包仍会保留。":
    "Browser storage is separate for each address. Restore the backup at the new address to set it up there; wallets at the old address stay in place.",
  "设备解锁已停用，系统中的通行密钥可自行删除":
    "Device unlock is off. You can delete the passkey from your system.",
  "停用设备解锁": "Turn off device unlock",
  "等待系统验证…": "Waiting for system verification…",
  "开启指纹 / 面容解锁": "Turn on fingerprint / face unlock",
  "返回设置": "Back to Settings",

  // AboutDialog
  "在浏览器中管理你的 Quantus 账户。社区开发，非 Quantus 官方产品。":
    "Manage your Quantus accounts in the browser. Community-built, not an official Quantus product.",
  "项目与作者链接": "Project and author links",
  "钱包网站": "Website",
  "查看源代码": "View source code",
  "关注作者": "Follow the author",

  // ManageDialog
  "钱包详情": "Wallet details",
  "重命名钱包": "Rename wallet",
  "助记词备份": "Seed phrase backup",
  "观察账户类型": "Watch-only account type",
  "移除钱包": "Remove wallet",
  "钱包数据已变化，请重新解锁": "Wallet data changed. Please unlock again.",
  "当前钱包没有可查看的助记词": "This wallet has no seed phrase to show",
  "Wormhole 观察账户": "Watch-only (Wormhole)",
  "普通观察账户": "Watch-only (standard)",
  "观察账户 · 类型待确认": "Watch-only · type unconfirmed",
  "自主保管账户": "Self-custody account",
  "钱包地址": "Wallet address",
  "地址已复制": "Address copied",
  "复制失败，请手动选中地址": "Copy failed. Select the address manually.",
  "正在复制…": "Copying…",
  "复制地址": "Copy address",
  "管理钱包": "Manage wallet",
  "钱包名称已更新": "Wallet name updated",
  "给钱包起个名字": "Name your wallet",
  "用容易辨认的名称区分你的账户。":
    "Use a recognizable name to tell your accounts apart.",
  "钱包名称": "Wallet name",
  "正在保存…": "Saving…",
  "保存名称": "Save name",
  "观察账户类型已更新": "Watch-only account type updated",
  "确认观察账户类型": "Confirm watch-only account type",
  "普通账户显示公开余额；Wormhole 隐私账户只显示公开入账。请按地址来源选择。":
    "Standard accounts show their public balance; encrypted accounts (Wormhole) only show public incoming transfers. Choose based on where the address came from.",
  "账户类型": "Account type",
  "请选择账户类型": "Select an account type",
  "普通公开账户": "Standard public account",
  "Wormhole 隐私账户": "Encrypted account (Wormhole)",
  "保存账户类型": "Save account type",
  "你的助记词": "Your seed phrase",
  "请按顺序保存。任何获得助记词的人都可以使用这个钱包。":
    "Save the words in order. Anyone with this seed phrase can use this wallet.",
  "钱包助记词": "Wallet seed phrase",
  "下载的 TXT 是明文文件，请离线保管。":
    "The downloaded TXT is plain text. Keep it offline.",
  "隐藏助记词": "Hide seed phrase",
  "助记词备份下载已开始": "Seed phrase backup download started",
  "下载助记词 TXT": "Download seed phrase TXT",
  "查看前，验证是你": "Verify it's you first",
  "输入解锁密码后，在当前设备查看和备份助记词。":
    "Enter your unlock password to view and back up the seed phrase on this device.",
  "查看助记词的密码": "Password to view seed phrase",
  "正在验证…": "Verifying…",
  "查看助记词": "View seed phrase",
  "移除 {0}？": "Remove {0}?",
  "这会从当前设备移除钱包，不会改变链上资产。{0}":
    "This removes the wallet from this device. Your on-chain assets aren't affected. {0}",
  "之后可通过公开地址重新添加。":
    "You can add it again later with its public address.",
  "恢复时需要助记词或加密备份。":
    "You'll need the seed phrase or an encrypted backup to restore it.",
  "我已保存恢复此钱包所需的信息": "I've saved what I need to restore this wallet",
  "正在移除…": "Removing…",
  "确认移除钱包": "Remove wallet",
};
