/** English text for the mining calculator, keyed by the Chinese source. */
export const mining: Record<string, string> = {
  // Headline
  "关键结果": "Key figures",
  "期望产量": "Expected output",
  "QTC / 天": "QTC / day",
  "占全网 {0}": "{0} of the network",
  "利润 / 天": "Profit / day",
  "利润率 {0}": "margin {0}",
  "保本价": "Break-even price",
  "低于此价即亏损": "Below it you lose money",
  "没有运行成本": "No running costs",
  "保本租金 / 天": "Break-even rent / day",
  "租金已含电费，全部产值都能付租金": "Rent covers the electricity, so all of the output can pay for it",
  "保本电价": "Break-even electricity",
  "高于此电价即亏损": "Above it you lose money",
  "填写 QTC 价格": "Enter a QTC price",
  "等待网络数据": "Waiting for network data",
  "填写算力后显示": "Enter a hashrate to see it",
  "金额按 SafeTrade 最新成交价计算；产量和保本价与价格无关。":
    "Amounts use SafeTrade's last trade; output and the break-even price do not follow it.",
  "金额按你填写的 QTC 价格计算；产量和保本价与价格无关。":
    "Amounts use the QTC price you entered; output and the break-even price do not follow it.",
  "填写 QTC 价格后才有收入和利润；产量和保本价与价格无关。":
    "Revenue and profit need a QTC price; output and the break-even price do not follow it.",

  // Network strip
  "更新于 {0}": "Updated {0}",
  "正在读取…": "Loading…",
  "尚未读取": "Not loaded yet",
  "刷新网络数据": "Refresh network data",
  "难度": "Difficulty",
  "出块": "Block time",
  "全网算力": "Network hashrate",
  "区块奖励": "Block reward",
  "每日出块": "Blocks per day",
  "区块高度": "Block height",
  "上一块": "Last block",
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
  "行情接口返回的数据无效。": "The market API returned invalid data.",

  // Inputs
  "参数": "Inputs",
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
  "保本租金": "Break-even rent",
  "需要 QTC 价格": "needs a QTC price",
  "/天": "/day",
  "/小时": "/hour",
  "{0} / 小时 · 租金已含电费": "{0} / hour · rent covers the electricity",
  "算力与功耗": "Hashrate and power",
  "单卡算力": "Hashrate per card",
  "算力单位": "Hashrate unit",
  "基准：{0}（{1}）": "Benchmark: {0} ({1})",
  "单卡功耗": "Power per card",
  "典型值 {0} W，可修改": "Typical {0} W, editable",
  "整机满载功耗，用于电费": "Full-load power, used for electricity",
  "矿工软件费": "Miner software fee",
  "添加显卡": "Add GPU",
  "矿池页面显示的算力，或你自己统计的总算力。": "The hashrate your pool page shows, or your own total.",
  "这个算力已经扣除了矿工软件费（矿池显示的通常是扣除后的数字）":
    "This figure is already net of the miner software fee (pool pages usually show it that way)",
  "总功耗": "Total power",
  "可选，用于电费": "Optional, used for electricity",
  "电价": "Electricity price",
  "租金（全部设备，含电费）": "Rent (all devices, electricity included)",
  "租金（每张卡，含电费）": "Rent (per card, electricity included)",
  "保本租金 / 小时": "Break-even rent / hour",
  "1 GH/s 日产量": "Output per GH/s per day",
  "最低算价比": "Most a GH/s may cost",
  "难度与运气": "Difficulty and luck",
  "Quanpool 实测运气，100% 为期望值，低于 100% 表示比期望多花了算力：": "Luck measured by Quanpool. 100% is the expected effort; below 100% means the blocks cost more work than expected:",
  "近 {0} 块": "Last {0} blocks",
  "本轮进度": "Current round",
  "算价比 {0} {1}/GH·小时": "{0} {1} per GH·hour",
  "每 GH/s 每小时；每天 {0}": "Per GH/s per hour; {0} per day",
  "{0} / 天": "{0} / day",
  "共 {0} 张卡 · 合计 {1} {2}": "{0} cards · {1} {2} in total",
  "租金周期": "Rent period",
  "改为自有设备付电费": "Switch to own hardware and pay electricity",
  "改为整机租用（租金含电费）": "Switch to a rented rig (rent includes electricity)",

  // Price
  "QTC 价格": "QTC price",
  "改回市场价 {0}": "Back to the market price, {0}",
  "正在读取市场价…": "Reading the market price…",
  "暂时取不到市场价，请手动填写": "The market price is out of reach; enter one yourself",
  "最新成交价 · 更新于 {0}": "Last trade · updated {0}",
  "市场价以 USDT 计，而你的货币标签是 {0}；不一致时请自行填写价格。":
    "The market price is in USDT while your currency label says {0}; enter your own price if they differ.",

  // More settings
  "更多设置": "More settings",
  "在线 {0}%": "uptime {0}%",
  "矿池费 {0}%": "pool fee {0}%",
  "在线率": "Uptime",
  "实际开机挖矿的时间占比，产量和电费同比例减少": "Share of time actually mining; output and electricity scale with it",
  "矿池费率": "Pool fee",
  "Quanpool 公布值 {0}%": "Quanpool publishes {0}%",
  "恢复为矿池公布值 {0}%": "Reset to the pool's {0}%",
  "每天": "Per day",
  "每小时": "Per hour",
  "货币": "Currency",
  "只是标签，所有金额按同一货币": "Just a label; every amount uses the same currency",
  "设备成本（可选）": "Hardware cost (optional)",
  "全部设备的购置价，用于折旧和回本": "Purchase price of all devices, for amortisation and payback",
  "折旧天数": "Amortisation days",
  "天": "days",

  // Results
  "估算结果": "Estimate",
  "正在读取网络状态…": "Reading the network state…",
  "需要链上难度和区块奖励才能估算。读取失败时请刷新网络数据。":
    "The estimate needs the chain difficulty and block reward. Refresh the network data if a read failed.",
  "填写显卡算力或总算力后显示估算。": "Enter a GPU hashrate or a total hashrate to see the estimate.",
  "周期": "Period",
  "每周": "Per week",
  "30 天": "30 days",
  "收入": "Revenue",
  "成本": "Cost",
  "租金": "Rent",
  "利润": "Profit",
  "每天的产量、利润和保本线见上方；这里是同一台机器换算到其他周期。":
    "Output, profit and the break-even lines per day are above; this is the same rig over the other periods.",
  "每日用电": "Electricity per day",
  "{0} kWh": "{0} kWh",
  "电费 / 天": "Electricity / day",
  "折旧 / 天": "Amortisation / day",
  "保本价（含折旧）": "Break-even price (with amortisation)",
  "填写功耗后显示": "Enter power to see it",
  "填写价格后显示": "Enter a price to see it",
  "回本时间": "Payback",
  "无法回本": "Never at this price",
  "{0} 年": "{0} years",
  "{0} 天": "{0} days",
  "{0} 小时": "{0} hours",
  "单干出块间隔": "Solo block interval",
  "不进矿池时的期望值": "Expected when mining solo",

  // Per-device table
  "各显卡明细": "Per GPU",
  "{0} 张卡": "{0} rows",
  "金额单位：{0}。": "Amounts in {0}.",
  "每张卡的产量，以及租金和设备成本按算力占比分摊到它的份额。":
    "What each card yields, and the share of the rent and hardware cost that its hashrate carries.",
  "租金 / 天": "Rent / day",
  "显卡": "GPU",

  // Sensitivity
  "难度上涨敏感性": "Difficulty growth",
  "新矿机加入会推高难度，同样的算力分到的份额随之下降；这里假设出块时间和奖励不变。":
    "New rigs push difficulty up and the same hashrate earns a smaller share; block time and reward are assumed unchanged.",
  "以上都是期望值。矿池按 PPLNS 分配，短期收益随矿池运气波动：":
    "Everything above is an expectation. PPLNS payouts follow the pool's luck in the short term: ",
  "按 Quanpool 当前份额，单日约 ±{0}、单周约 ±{1}（1σ）。": "at Quanpool's current share about ±{0} per day and ±{1} per week (1σ).",
  "统计周期越短，偏离越大。": "the shorter the period, the larger the deviation.",

  // Comparison
  "显卡对比": "GPU comparison",
  "{0} 款": "{0} cards",
  "算力 / 功耗": "Hashrate / power",
  "单卡、按当前网络状态与你填写的在线率、费率和电价计算；功耗为典型值。":
    "One card each, at the current network state with your uptime, fees and electricity price; power is a typical figure.",
  "按保本租金排序。": "Sorted by the rent each can carry.",
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
  "保本电价 = 每日产值 ÷ 每日用电；保本租金 = 每日产值 − 不含在租金里的运行成本，整机租用时电费已含在租金里，所以就是全部产值。两者都不含设备折旧。":
    "Break-even electricity price = daily output value ÷ daily kWh; break-even rent = daily output value − the running costs the rent does not cover, and renting a whole rig includes the electricity, so it is the full value of the output. Neither deducts hardware amortisation.",
  "忽略：出块时间和奖励的未来变化、矿池的最低起付额、孤块与拒绝份额、显卡以外的整机功耗、损耗与维护、税费和汇率。":
    "Ignored: future changes in block time and reward, the pool's payout threshold, orphaned blocks and rejected shares, system power beyond the GPUs, wear and maintenance, taxes and exchange rates.",
  "显卡基准与费率取自 Quanpool 公开接口，只作为参考；不同驱动、超频和温度下的实际算力请以自己的矿机为准。":
    "GPU benchmarks and fees come from Quanpool's public API and are only a reference; actual hashrate depends on drivers, overclocking and temperature, so trust your own rig.",
  "QTC 价格取自 SafeTrade 公开接口的 QUAN/USDT 最新成交价，读取时交易所会看到你的 IP；QUAN 与 QTC 是同一资产。读取失败或被你改写时用你填的数字，其他金额按同一货币，不做汇率换算。":
    "The QTC price is the last QUAN/USDT trade from SafeTrade's public API, so the exchange sees your IP when it is read; QUAN and QTC are the same asset. When that read fails or you overwrite it, your own figure is used, and every other amount is in the same currency with no conversion.",
};
