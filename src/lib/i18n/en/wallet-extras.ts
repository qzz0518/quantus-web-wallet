/**
 * English for the later wallet additions: the total across wallets, the check
 * phrase, delayed (reversible) transfers and depositing into one's own
 * encrypted account.
 */
export const walletExtras: Record<string, string> = {
  总资产: "Total balance",
  部分余额未更新: "Some balances are out of date",
  "不含 {0} 个加密账户": "Excludes {0} encrypted account(s)",
  "不含 {0} 个待确认账户": "Excludes {0} unconfirmed account(s)",
  校验短语: "Check phrase",
  "正在生成校验短语…": "Generating the check phrase…",
  "对方读出的五个词一致，地址就没抄错":
    "If the five words match the ones they read out, the address is right",
  "让对方核对这五个词，确认地址没抄错":
    "Ask them to check these five words against their own address",
};
