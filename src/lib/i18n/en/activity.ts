/** Activity panel, app-level toasts/errors, Toast, and amount helpers. */
export const activity: Record<string, string> = {
  // ActivityPanel: headings and toolbar
  "最近活动": "Recent activity",
  "全部记录": "All activity",
  "公开入账记录": "Public incoming transfers",
  "查看全部": "View all",
  "交易筛选": "Filter transactions",
  "全部": "All",
  "转入": "Incoming",
  "转出": "Outgoing",
  "挖矿": "Mining",
  "搜索交易": "Search transactions",
  "搜索地址或哈希": "Search address or hash",
  "清除搜索": "Clear search",
  // ActivityPanel: history errors
  "交易记录暂未更新，以下为上次加载的结果。":
    "Activity couldn't be refreshed. Showing the last loaded results.",
  "暂时无法加载交易记录，请稍后重试。":
    "Couldn't load activity. Please try again later.",
  "重新加载": "Reload",
  // ActivityPanel: submitted (pending) transfers
  "发送至 {0}": "Sent to {0}",
  "已提交，等待入块": "Submitted, waiting to be included in a block",
  "已入块，等待最终确认": "Included in a block, awaiting finalization",
  "已最终确认": "Finalized",
  "执行失败": "Failed",
  "状态待核实，请在 Explorer 中确认": "Status unconfirmed. Check it in Explorer",
  "查看已提交交易": "View submitted transaction",
  // ActivityPanel: transaction rows
  "在 Explorer 查看挖矿奖励": "View mining reward in Explorer",
  "在 Explorer 查看交易": "View transaction in Explorer",
  "挖矿奖励": "Mining reward",
  "网络奖励": "Network reward",
  "收到转账": "Received",
  "发送转账": "Sent",
  "普通转账": "Transfer",
  "待执行转账": "Pending transfer",
  "已执行转账": "Executed transfer",
  "已取消转账": "Cancelled transfer",
  "成功": "Success",
  "失败": "Failed",
  "待执行": "Pending",
  "已执行": "Executed",
  "已取消": "Cancelled",
  // ActivityPanel: empty states
  "解锁后查看交易": "Unlock to view activity",
  "正在读取链上记录…": "Loading on-chain activity…",
  "添加钱包后查看交易": "Add a wallet to view activity",
  "没有符合条件的记录": "No matching transactions",
  "暂无交易记录": "No transactions yet",
  "余额与交易记录仅在解锁后显示":
    "Balances and activity are shown only after unlocking",
  "支持创建、导入和观察钱包": "Create, import, or add a watch-only wallet",
  "试试其他地址、交易哈希或筛选条件":
    "Try another address, transaction hash, or filter",
  "交易确认并被索引后，会出现在这里":
    "Transactions appear here once confirmed and indexed",
  "正在加载…": "Loading…",
  "加载更多记录": "Load more",
  "Explorer 索引可能稍有延迟": "Explorer indexing may lag slightly",
  // App: toasts and errors
  "钱包数据已在另一个标签页更新，请重新解锁":
    "Wallet data was updated in another tab. Please unlock again",
  "闲置超过 10 分钟，钱包已锁定": "Wallet locked after 10 minutes of inactivity",
  "钱包已锁定，请重新解锁": "Wallet is locked. Please unlock again",
  "钱包在其他标签页中有更改，请重新解锁":
    "Wallet was changed in another tab. Please unlock again",
  "钱包已锁定，操作已取消": "Wallet was locked, so the action was cancelled",
  "请先解锁钱包": "Unlock the wallet first",
  "钱包数据已变化，请重试": "Wallet data changed. Please try again",
  "部分余额读取失败，请刷新重试":
    "Some balances couldn't be loaded. Refresh to try again",
  "交易已获得最终确认": "Transaction finalized",
  "交易执行失败，请查看记录": "Transaction failed. Check activity for details",
  "这个地址已经存在": "This address is already added",
  "已导出加密备份，请妥善保存":
    "Encrypted backup exported. Keep it somewhere safe",
  "地址已复制": "Address copied",
  "复制失败，请手动复制地址": "Couldn't copy. Please copy the address manually",
  // Toast
  "关闭提示": "Dismiss",
  // amount.ts
  "请输入有效金额，最多支持 12 位小数":
    "Enter a valid amount with up to 12 decimal places",
  "转账金额超出范围": "Amount is out of range",
  "操作未完成，请重试": "Something went wrong. Please try again",
};
