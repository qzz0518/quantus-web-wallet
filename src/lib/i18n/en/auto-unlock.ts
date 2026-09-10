// Password-free mode: settings row, panel, notices and storage errors.
export const autoUnlock: Record<string, string> = {
  // SettingsPage
  "免密模式": "Password-free mode",

  // AutoUnlockSettings
  "打开页面，钱包即已解锁": "Open the page, and the wallet is unlocked",
  "在这台电脑上打开钱包时自动解锁，不再输入密码。设备解锁和密码解锁仍然保留。":
    "The wallet unlocks by itself whenever you open it on this computer, with no password to type. Device unlock and the password stay available.",
  "解锁密钥会保存在这个浏览器里。任何能在这台电脑上打开这个浏览器的人，都能打开钱包。请只在私人电脑上使用。":
    "The unlock key is kept in this browser. Anyone who can open this browser on this computer can open the wallet. Use it only on a private computer.",
  "免密模式已开启": "Password-free mode is on",
  "打开页面时自动解锁，闲置不再自动锁定。手动锁定后，本次页面内需用密码解锁。":
    "The wallet unlocks when the page opens and no longer locks itself when idle. After you lock it by hand, this page asks for the password until it is loaded again.",
  "开启免密模式": "Turn on password-free mode",
  "开启免密模式的密码": "Password to turn on password-free mode",
  "免密模式已开启，下次打开页面时自动解锁":
    "Password-free mode is on. The wallet will unlock the next time the page opens.",
  "免密模式已关闭，下次打开页面需要密码":
    "Password-free mode is off. The next page load asks for the password.",
  "正在关闭…": "Turning off…",
  "关闭免密模式": "Turn off password-free mode",

  // App
  "正在解锁钱包…": "Unlocking the wallet…",
  "免密模式已失效，请使用密码解锁":
    "Password-free mode is no longer valid. Unlock with your password.",
  "免密解锁未完成，请使用密码解锁":
    "Password-free unlock didn't finish. Unlock with your password.",
  "免密模式已关闭，可在设置中重新开启":
    "Password-free mode was turned off. You can turn it back on in Settings.",
  "钱包数据已在另一个标签页更新": "Wallet data was updated in another tab",

  // auto-unlock.ts
  "当前浏览器不支持免密模式": "This browser does not support password-free mode",
  "无法访问浏览器密钥存储": "Couldn't access the browser's key storage",
};
