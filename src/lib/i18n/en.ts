import { activity } from "./en/activity";
import { lib } from "./en/lib";
import { mldsa65 } from "./en/mldsa65";
import { settings } from "./en/settings";
import { setup } from "./en/setup";
import { wallet } from "./en/wallet";
import { wormhole } from "./en/wormhole";
import { wormholeExit } from "./en/wormhole-exit";

/** English translations keyed by the Chinese source text, merged from per-area fragments. */
export const en: Record<string, string> = {
  ...activity,
  ...lib,
  ...mldsa65,
  ...settings,
  ...setup,
  ...wallet,
  ...wormhole,
  ...wormholeExit,
  外观模式: "Appearance",
  跟随系统: "System",
  白天: "Light",
  黑夜: "Dark",
  返回: "Back",
  关闭: "Close",
  语言: "Language",
  切换语言: "Switch language",
  "这是你标记为 Wormhole 隐私账户的观察地址。": "This is a watch-only address you marked as an encrypted (Wormhole) account.",
  "该地址只收到过挖矿奖励、从未发出过交易，很可能是官方钱包的加密账户（Wormhole）地址。":
    "This address has only received mining rewards and has never sent a transaction. It is most likely an encrypted (Wormhole) account address from the official wallet.",
  "普通转账会进入隐私池：收款方必须用该账户的助记词生成零知识证明才能取出，并会损失 0.04% 的链上费用和不足 0.01 QTC 的零头。":
    "A regular transfer goes into the privacy pool: the recipient must generate a zero-knowledge proof with that account's seed phrase to withdraw it, losing the 0.04% chain fee and any remainder below 0.01 QTC.",
  "我已确认收款方能够从加密账户取出这笔资产，仍要继续。": "I have confirmed the recipient can withdraw from the encrypted account. Continue anyway.",
  "该地址在链上还没有任何记录。新账户属正常情况，否则请再核对一遍。": "This address has no on-chain history yet. That is normal for a new account; otherwise double-check it.",
  "正在核对收款地址…": "Checking the recipient…",
  "账户类型：{0}": "Account type: {0}",
};
