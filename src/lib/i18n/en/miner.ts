/** English text for the miner dashboard, keyed by the Chinese source. */
export const miner: Record<string, string> = {
  // Tools card
  矿工看板: "Miner dashboard",
  "查一个地址近 30 天的出块、收益、实际算力和转入来源":
    "Look up an address's blocks, earnings, effective hashrate and payout sources over 30 days",

  // Address form
  刷新矿工数据: "Refresh miner data",
  矿工地址: "Miner address",
  "粘贴一个 qz 开头的地址": "Paste an address starting with qz",
  查询: "Look up",
  最近查过的地址: "Recently looked up",
  "矿工数据读取失败：{0}": "Could not read the miner data: {0}",

  // Headline
  挖矿收入: "Mining income",
  "近 24 小时": "Last 24 h",
  "近 {0} 天": "Last {0} days",
  "{0} 块": "{0} blocks",
  累计出块: "Blocks mined",
  "共 {0} QTC": "{0} QTC in total",
  索引器没有这个地址的记录: "The indexer has no record of this address",
  "只读公开索引器和节点，按你的浏览器本地日期分组；近 {0} 天之外的记录不在这里。":
    "Read from the public indexer and node only, grouped by your browser's local dates; nothing older than {0} days is here.",
  "这个地址近 {0} 天没有挖矿收入。": "This address has had no mining income in the last {0} days.",
  "这个地址近 {0} 天没有自己出块，下面只有转入记录。":
    "This address mined no blocks of its own in the last {0} days; below are the transfers it received.",

  // Daily blocks
  每天出块: "Blocks a day",
  今天到现在: "Today so far",
  "每根柱子是一天，最左边是 {0} 天前": "One bar per day, the left-hand one {0} days ago",
  块: "blocks",

  // Effective hashrate
  实际算力: "Effective hashrate",
  等待全网出块数: "Waiting for the network block count",
  "{0} / {1} 块": "{0} of {1} blocks",
  "有效算力 = 你的出块数 ÷ 同期全网出块数 × 全网算力。窗口越短，运气的影响越大。":
    "Effective hashrate is your blocks divided by the network's blocks over the same window, times the network hashrate. The shorter the window, the more luck shows.",
  计算器里的算力: "Hashrate in the calculator",
  "按 {0} 天应出 {1} 块": "{1} blocks expected over {0} days",
  "实际 / 期望": "Actual / expected",
  "高于 100% 是运气好，低于说明算力或在线率没到":
    "Above 100% is good luck; below it the hashrate or the uptime fell short",
  "期望值来自你在挖矿计算里填的输入，只保存在本机。":
    "The expectation comes from what you entered in the mining calculator, which stays on this device.",

  // Payout sources
  转入来源: "Incoming sources",
  "{0} 个地址": "{0} addresses",
  "{0} 笔 · 最近 {1}": "{0} payments · latest {1}",
  "矿池 {0}": "Pool {0}",
  标记为矿池: "Mark as pool",
  取消标记: "Unmark",
  "只列出金额最大的 {0} 个来源。": "Only the {0} largest sources are listed.",
  "转入很多，只统计了最近 {0} 笔。": "There are many incoming transfers; only the most recent {0} are counted.",
  "链上把区块奖励也记成转账，这里已经把这 {0} 笔挖矿到账去掉了。":
    "The chain credits a block reward as transfers too; {0} of those have been taken out of this list.",
  "{0} 倍": "{0}×",
  "标记为矿池后，该来源会单独统计一张收益卡片。标记只保存在本机。":
    "Marking a source as a pool gives it its own earnings card. The mark stays on this device.",
  "{0} 笔": "{0} payments",
  "{0} 笔 · ≈ {1}": "{0} payments · ≈ {1}",
};
