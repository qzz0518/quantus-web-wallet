/** English text for the network dashboard, keyed by the Chinese source. */
export const network: Record<string, string> = {
  // Tools card
  网络状态: "Network",
  "算力、出块、发行进度和区块奖励的衰减曲线": "Hashrate, block time, how much supply exists and how the block reward decays",

  // Headline
  当前状态: "Current state",
  出块时间: "Block time",
  "索引器已收录 {0} 块": "Indexer has {0} blocks",
  "难度 ÷ 出块时间": "Difficulty ÷ block time",
  "目标 {0} 秒，取近 {1} 块平均": "Target {0} s, averaged over the last {1} blocks",
  按剩余待发行量计算: "Derived from the supply left to mint",
  "全部数据由你的浏览器直接读取公开节点和索引器，每 10 分钟缓存一次。{0}":
    "Everything here is read straight from the public node and indexer by your own browser, cached for 10 minutes. {0}",
  "发行量读取失败：{0}": "Could not read total issuance: {0}",

  // Issuance
  发行与奖励衰减: "Issuance and reward decay",
  "已发行 {0}%": "{0}% minted",
  已发行: "Minted",
  剩余待发行: "Left to mint",
  "上限 {0} QTC": "Cap {0} QTC",
  每天新增: "Minted per day",
  等待出块时间: "Waiting for a block time",
  "按每天 {0} 块": "At {0} blocks a day",
  奖励减半还需: "Reward halves in",
  "{0} 块，按当前出块速度": "{0} blocks, at the current block time",
  "每块铸造「剩余待发行量 ÷ {0}」给矿工，所以奖励每块按剩余量的 1/{0} 平滑递减，没有减半台阶。交易费也一并铸给矿工。":
    "Every block mints the supply left to mint divided by {0} and pays it to the miner, so the reward shrinks by one {0}th of the remainder per block — a smooth decay with no halving step. Transaction fees are minted to the miner too.",
  时间: "When",
  每块奖励: "Reward / block",
  当年发行: "Minted that year",
  累计已发行: "Total minted",
  现在: "Now",
  "{0} 年后": "In {0} years",
  "表中金额单位为 QTC，按当前出块速度外推；出块变快或变慢，时间会变，曲线的形状不会。":
    "Amounts are QTC, extrapolated at the current block time: faster or slower blocks move the dates, not the shape of the curve.",
  "常量按主网 runtime {0}：上限 {1} QTC，发行除数 {2}。":
    "Constants from mainnet runtime {0}: cap {1} QTC, emission divisor {2}.",
  "正在读取发行量…": "Reading total issuance…",
  "需要链上发行量才能计算。读取失败时请刷新。": "This needs total issuance from the chain. Refresh if the read failed.",

  // Daily counters
  "近 30 天": "Last 30 days",
  每天出块: "Blocks a day",
  "最近一天；索引器当天可能尚未统计完": "Latest day; the indexer may not have finished counting it",
  块: "blocks",
  每天交易: "Transactions a day",
  笔: "transactions",
  活跃地址: "Active addresses",
  个: "addresses",
  总地址数: "Addresses",
  出过块的地址: "Addresses that mined",
  "索引器目前只有 {0} 天的每日统计，图上就画多少天。":
    "The indexer only has {0} days of daily counters, so that is what the charts draw.",
  "正在读取每日统计…": "Reading the daily counters…",
  "索引器暂时没有每日统计。": "The indexer has no daily counters yet.",
  "{0} 至 {1}": "{0} to {1}",

  // Hashrate and difficulty
  算力与难度: "Hashrate and difficulty",
  当前难度: "Difficulty",
  上一块用时: "Last block took",
  "近 24 小时出块": "Blocks in 24 h",
  "按当前出块速度应为 {0} 块": "{0} at the current block time",
  "按 24 小时反推算力": "Hashrate from 24 h",
  "与头部采样相差 {0}": "{0} against the head sample",
  "头部采样跟得快，24 小时反推更平稳，两者差得多说明算力刚变过。":
    "The head sample follows a change quickly, the 24-hour figure is steadier; a wide gap between them means the hashrate moved recently.",
};
