/** English text for the mining calculator, keyed by the Chinese source. */
export const mining: Record<string, string> = {
  // Page
  "按显卡算力估算 QTC 产量、电费与其他成本、利润、保本价和回本周期。全网数据来自链上和索引器，显卡基准来自 Quanpool 公开接口；QTC 尚未上市，价格由你填写。":
    "Estimate QTC output, electricity and other costs, profit, break-even price and payback from GPU hashrate. Network figures come from the chain and the indexer, GPU benchmarks from Quanpool's public API; QTC is not listed yet, so the price is yours to enter.",

  // Network panel
  "网络状态": "Network",
  "更新于 {0}": "Updated {0}",
  "正在读取…": "Loading…",
  "尚未读取": "Not loaded yet",
  "刷新网络数据": "Refresh network data",
  "难度": "Difficulty",
  "出块时间（近 {0} 块均值）": "Block time (avg. of last {0})",
  "上一块 {0}": "last block {0}",
  "全网算力（推算）": "Network hashrate (inferred)",
  "区块奖励（近 {0} 块均值）": "Block reward (avg. of last {0})",
  "每日出块": "Blocks per day",
  "区块高度": "Block height",
  "全网算力 = 难度 ÷ 实测出块时间，不是任何矿池上报的数字。":
    "Network hashrate = difficulty ÷ measured block time, not a figure reported by any pool.",
  "Quanpool 自报算力 {0}（约占 {1}），量级相符。": "Quanpool reports {0} of its own (about {1}), which is consistent.",
  "数据已超过 5 分钟未更新，估算基于上次成功读取的状态。":
    "Data is more than 5 minutes old; the estimate uses the last state read successfully.",
  "链上数据读取失败：{0}": "Chain read failed: {0}",
  "区块奖励读取失败：{0}": "Block reward read failed: {0}",
  "矿池基准读取失败，使用 {0} 的内置快照：{1}": "Pool benchmarks unavailable, using the built-in snapshot from {0}: {1}",
  "链上数据格式无效。": "The chain returned malformed data.",
  "索引器返回的数据无效。": "The indexer returned invalid data.",
  "矿池接口返回的数据无效。": "The pool API returned invalid data.",

  // Devices
  "设备": "Devices",
  "输入方式": "Input mode",
  "按显卡": "By GPU",
  "总算力": "Total hashrate",
  "显卡 {0}": "GPU {0}",
  "移除": "Remove",
  "型号": "Model",
  "数量": "Quantity",
  "自定义": "Custom",
  "自行填写算力和功耗": "Enter hashrate and power yourself",
  "矿工软件": "Miner software",
  "矿池矿工": "Pool miner",
  "官方矿工": "Official miner",
  "矿池自带矿工，算力更高，内置 {0}% 开发者费。": "The pool's own miner: higher hashrate, {0}% built-in dev fee.",
  "官方 quantus-miner，无内置费用。": "The official quantus-miner, no built-in fee.",
  "单卡算力": "Hashrate per card",
  "算力单位": "Hashrate unit",
  "基准：{0}（{1}）": "Benchmark: {0} ({1})",
  "单卡功耗": "Power per card",
  "典型值 {0} W，可修改": "Typical {0} W, editable",
  "整机满载功耗，用于电费": "Full-load power, used for electricity",
  "矿工软件费": "Miner software fee",
  "按软件自动填写，可修改": "Set from the software, editable",
  "添加显卡": "Add GPU",
  "基准算力来自 Quanpool 公开接口（{0}），功耗为典型满载值，均可修改。":
    "Benchmarks come from Quanpool's public API ({0}); power is a typical full-load figure. Both are editable.",
  "实时": "live",
  "{0} 快照": "snapshot of {0}",
  "矿池页面显示的算力，或你自己统计的总算力。": "The hashrate your pool page shows, or your own total.",
  "这个算力已经扣除了矿工软件费（矿池显示的通常是扣除后的数字）":
    "This figure is already net of the miner software fee (pool pages usually show it that way)",
  "总功耗": "Total power",
  "可选，用于电费": "Optional, used for electricity",

  // Fees and uptime
  "费率与在线率": "Fees and uptime",
  "在线率": "Uptime",
  "实际开机挖矿的时间占比，产量和电费同比例减少": "Share of time actually mining; output and electricity scale with it",
  "矿池费率": "Pool fee",
  "Quanpool 公布值 {0}%": "Quanpool publishes {0}%",
  "恢复为矿池公布值 {0}%": "Reset to the pool's {0}%",

  // Costs
  "成本": "Costs",
  "成本方式": "Cost mode",
  "自有设备付电费": "Own hardware, pay electricity",
  "整机租用": "Rented rig",
  "电价": "Electricity price",
  "租金（全部设备，含电费）": "Rent (all devices, electricity included)",
  "租金周期": "Rent period",
  "每天": "Per day",
  "每小时": "Per hour",
  "货币": "Currency",
  "只是标签，所有金额按同一货币": "Just a label; every amount uses the same currency",
  "设备成本（可选）": "Hardware cost (optional)",
  "全部设备的购置价，用于折旧和回本": "Purchase price of all devices, for amortisation and payback",
  "折旧天数": "Amortisation days",
  "天": "days",

  // Price
  "QTC 价格": "QTC price",
  "假设价格": "Assumed price",
  "QTC 尚未在交易所上市，没有市场价。这里填你自己的假设，收入和利润都按它计算；保本价不依赖它。":
    "QTC is not listed on any exchange and has no market price. Enter your own assumption; revenue and profit use it, the break-even price does not.",

  // Results
  "估算结果": "Estimate",
  "正在读取网络状态…": "Reading the network state…",
  "需要链上难度和区块奖励才能估算。读取失败时请刷新网络数据。":
    "The estimate needs the chain difficulty and block reward. Refresh the network data if a read failed.",
  "填写显卡算力或总算力后显示估算。": "Enter a GPU hashrate or a total hashrate to see the estimate.",
  "期望产量": "Expected output",
  "QTC / 天": "QTC / day",
  "≈ {0} / 天，按你填写的价格": "≈ {0} per day at your price",
  "填写 QTC 价格后显示收入和利润": "Enter a QTC price to see revenue and profit",
  "周期": "Period",
  "每周": "Per week",
  "30 天": "30 days",
  "收入": "Revenue",
  "利润": "Profit",
  "全网占比": "Share of network",
  "保本价（电费）": "Break-even price (electricity)",
  "保本价（租金）": "Break-even price (rent)",
  "保本价（含折旧）": "Break-even price (with amortisation)",
  "填写功耗后显示": "Enter power to see it",
  "租金 / 天": "Rent / day",
  "电费 / 天": "Electricity / day",
  "{0} kWh": "{0} kWh",
  "折旧 / 天": "Amortisation / day",
  "利润 / 天": "Profit / day",
  "填写价格后显示": "Enter a price to see it",
  "利润率": "Margin",
  "电费成本 / 枚": "Electricity per QTC",
  "总成本 / 枚": "Total cost per QTC",
  "每 kWh 产量": "Output per kWh",
  "回本时间": "Payback",
  "无法回本": "Never at this price",
  "{0} 年": "{0} years",
  "{0} 天": "{0} days",
  "{0} 小时": "{0} hours",
  "单干出块间隔": "Solo block interval",
  "不进矿池时的期望值": "Expected when mining solo",

  // Per-device table
  "各显卡明细": "Per GPU",
  "金额单位：{0}。": "Amounts in {0}.",
  "租金和设备成本按算力占比分摊到各显卡。": "Rent and hardware cost are split between GPUs by hashrate.",
  "显卡": "GPU",
  "算力": "Hashrate",
  "保本价": "Break-even",

  // Sensitivity
  "难度上涨敏感性": "Difficulty growth",
  "全网算力": "Network hashrate",
  "当前": "Now",
  "新矿机加入会推高难度，同样的算力分到的份额随之下降；这里假设出块时间和奖励不变。":
    "New rigs push difficulty up and the same hashrate earns a smaller share; block time and reward are assumed unchanged.",
  "以上都是期望值。矿池按 PPLNS 分配，短期收益随矿池运气波动：":
    "Everything above is an expectation. PPLNS payouts follow the pool's luck in the short term: ",
  "按 Quanpool 当前份额，单日约 ±{0}、单周约 ±{1}（1σ）。": "at Quanpool's current share about ±{0} per day and ±{1} per week (1σ).",
  "统计周期越短，偏离越大。": "the shorter the period, the larger the deviation.",

  // Comparison
  "显卡对比": "GPU comparison",
  "算力 / 功耗": "Hashrate / power",
  "单卡、按当前网络状态与你填写的在线率、费率和电价计算；功耗为典型值。":
    "One card each, at the current network state with your uptime, fees and electricity price; power is a typical figure.",
  "租用模式下不计算单卡成本。": "Per-card costs are not computed in rental mode.",
  "按利润排序。": "Sorted by profit.",
  "按产量排序。": "Sorted by output.",

  // Method
  "计算方法与假设": "Method and assumptions",
  "QTC/天 = 算力 ÷ 全网算力 × 每日出块 × 区块奖励 × 在线率 × (1 − 矿池费) × (1 − 矿工软件费)":
    "QTC/day = hashrate ÷ network hashrate × blocks per day × block reward × uptime × (1 − pool fee) × (1 − miner fee)",
  "全网算力 = 链上难度 ÷ 近 200 块的实测平均出块时间；每日出块 = 86400 ÷ 出块时间；区块奖励取索引器最近 50 块的平均值。":
    "Network hashrate = chain difficulty ÷ measured average block time over the last 200 blocks; blocks per day = 86400 ÷ block time; block reward is the average of the indexer's last 50 blocks.",
  "电费 = 功耗 × 数量 × 24 h × 在线率 × 电价；租金和设备成本按各显卡算力占比分摊；折旧 = 设备成本 ÷ 折旧天数。":
    "Electricity = power × quantity × 24 h × uptime × price; rent and hardware cost are split between GPUs by hashrate; amortisation = hardware cost ÷ amortisation days.",
  "保本价 = 每日运行成本（电费或租金）÷ 每日产量，与你填写的价格无关；含折旧的保本价再加上每日折旧。回本时间 = 设备成本 ÷（每日收入 − 每日运行成本）。":
    "Break-even price = daily running cost (electricity or rent) ÷ daily output, independent of the price you enter; the amortised break-even adds the daily amortisation. Payback = hardware cost ÷ (daily revenue − daily running cost).",
  "忽略：出块时间和奖励的未来变化、矿池的最低起付额、孤块与拒绝份额、显卡以外的整机功耗、损耗与维护、税费和汇率。":
    "Ignored: future changes in block time and reward, the pool's payout threshold, orphaned blocks and rejected shares, system power beyond the GPUs, wear and maintenance, taxes and exchange rates.",
  "显卡基准与费率取自 Quanpool 公开接口，只作为参考；不同驱动、超频和温度下的实际算力请以自己的矿机为准。":
    "GPU benchmarks and fees come from Quanpool's public API and are only a reference; actual hashrate depends on drivers, overclocking and temperature, so trust your own rig.",
};
