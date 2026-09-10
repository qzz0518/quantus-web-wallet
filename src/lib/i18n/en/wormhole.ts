/** English for the encrypted-account (Wormhole) recovery tool: settings row, dialog and scanner. */
export const wormhole: Record<string, string> = {
  // SettingsPage
  "工具": "Tools",
  "加密账户恢复": "Encrypted account recovery",
  "查看并取回转入 Wormhole 加密账户的资产": "See and withdraw funds sent to a Wormhole encrypted account",

  // Stage and phase labels
  "正在核对节点与索引服务…": "Checking the node and the indexer…",
  "正在派生地址…": "Deriving addresses…",
  "正在查询入账记录…": "Looking up deposits…",
  "正在核对花费状态…": "Checking spent status…",
  "正在读取链上规则…": "Reading chain rules…",
  "正在构建默克尔路径…": "Building Merkle paths…",
  "正在准备电路…": "Preparing the circuit…",
  "正在生成零知识证明…": "Generating the zero-knowledge proof…",
  "正在本地验证证明…": "Verifying the proof locally…",
  "正在提交交易…": "Submitting the transaction…",
  "正在等待链上确认…": "Waiting for on-chain confirmation…",
  "准备中": "Preparing",
  "生成证明中": "Proving",
  "提交中": "Submitting",
  "已提交": "Submitted",
  "已打包": "Included",
  "状态未知": "Unknown",
  "已过期": "Expired",
  "区块 #{0}": "Block #{0}",
  "收款 {0}": "Receiving {0}",
  "找零 {0}": "Change {0}",
  "链上已拒绝 {0} 条入账（已被花费）。": "The chain rejected {0} deposit(s) as already spent.",
  "在区块浏览器中查看": "View in the explorer",
  "请先确认了解扫描会进行的网络查询": "Please confirm you understand the network queries the scan makes",

  // Intro
  "找回转入加密账户的资产": "Recover funds sent to an encrypted account",
  "加密账户（Wormhole）是官方钱包中的隐私账户。它的地址看起来和普通地址一样，但转入的每一笔资产都会进入隐私池：只有持有该账户助记词的人才能证明这笔资产尚未花费并取出，因此普通钱包和区块浏览器只会显示“未知”。":
    "An encrypted account (Wormhole) is the private account of the official wallet. Its address looks like any other, but every transfer into it enters the privacy pool: only someone holding that account's seed phrase can prove a deposit is unspent and withdraw it, so ordinary wallets and the explorer can only show “unknown”.",
  "这个工具做什么": "What this tool does",
  "用官方钱包的助记词只读扫描加密账户，显示真实的未花费余额；如需要，可把资产取回到你自己的普通账户。":
    "A read-only scan of the encrypted account with the official wallet's seed phrase that shows the real unspent balance. Optionally, withdraw the funds to a regular account of your own.",
  "你需要准备": "What you need",
  "收到资产的那个官方钱包的助记词（24 个单词）。可选：官方钱包里显示的加密账户地址，用于核对是否匹配。":
    "The seed phrase (24 words) of the official wallet that received the funds. Optional: the encrypted account address shown in the official wallet, to check that it matches.",
  "费用": "Costs",
  "链上按取回金额收取 0.04% 的成交量费用；金额先向下取整到 0.01 QTC，每笔入账不足 0.01 QTC 的零头会丢失。取回到自己的账户时，费用的一半会作为返还打回收款账户。":
    "The chain charges a 0.04% volume fee on the withdrawn amount. Amounts are first rounded down to 0.01 QTC, and the remainder below 0.01 QTC of each deposit is lost. When withdrawing to your own account, half of the fee comes back to the receiving account as a rebate.",
  "设备要求": "Device requirements",
  "生成零知识证明需要约 1 GB 内存，建议在桌面浏览器中操作；只查看余额不需要。":
    "Generating the zero-knowledge proof needs about 1 GB of memory; a desktop browser is recommended. Viewing the balance does not need it.",
  "隐私": "Privacy",
  "助记词只在本页面和本地签名组件中使用，不会存储或上传。官方索引服务与节点会看到派生出的地址和你的 IP 地址。":
    "The seed phrase is used only on this page and in the local signing module; it is never stored or uploaded. The official indexer and RPC node see the derived addresses and your IP address.",
  "详细教程": "Step-by-step guide",
  "准备助记词。": "Prepare the seed phrase.",
  "在官方钱包中导出或抄写收款账户的助记词。本工具不会保存它。":
    "Export or copy the seed phrase of the receiving account from the official wallet. This tool does not save it.",
  "开始扫描。": "Start the scan.",
  "点击“开始扫描”，输入助记词与可选的加密账户地址，勾选同意后扫描。你会看到派生地址与入账记录的进度。":
    "Press “Start scan”, enter the seed phrase and optionally the encrypted account address, tick the consent box and scan. You will see progress for derived addresses and deposits.",
  "查看结果。": "Review the results.",
  "结果页显示未花费余额、已花费入账和快照区块；每条未花费入账可勾选，一次最多 {0} 条。":
    "The results show the unspent balance, spent deposits and the snapshot block. Each unspent deposit can be selected, up to {0} at a time.",
  "选择收款账户。": "Choose the receiving account.",
  "选择本钱包中的普通账户，或从同一助记词派生的普通账户；页面会显示地址和费用预览。":
    "Pick a regular account from this wallet or the regular account derived from the same seed phrase; the page shows the address and a fee preview.",
  "生成证明并提交。": "Generate the proof and submit.",
  "证明在浏览器本地生成，可能需要几分钟，期间请保持页面打开。提交后会显示交易哈希与确认状态。":
    "The proof is generated locally in the browser and may take a few minutes; keep the page open. After submission you will see the transaction hash and its confirmation status.",
  "此前的取回记录": "Previous withdrawals",
  "开始扫描": "Start scan",

  // Input
  "输入官方钱包的助记词": "Enter the official wallet's seed phrase",
  "助记词只用于在本地派生地址和计算花费凭证，扫描结束后不会保留。":
    "The phrase is used only to derive addresses and spend proofs locally; it is not kept after the scan.",
  "官方钱包显示的加密账户地址（可选）": "Encrypted account address shown in the official wallet (optional)",
  "用于核对派生地址是否匹配": "Used to check that the derived addresses match",
  "我了解扫描会向官方节点与索引服务查询派生出的地址，对方能看到这些地址和我的 IP 地址。":
    "I understand the scan queries the official node and indexer for the derived addresses, and that they can see those addresses and my IP address.",
  "扫描只读取数据，不会签名或发送任何交易。关闭本窗口或锁定钱包后，助记词会从页面中清除。":
    "The scan only reads data; it never signs or sends a transaction. Closing this window or locking the wallet clears the phrase from the page.",

  // Scanning
  "正在扫描加密账户": "Scanning the encrypted account",
  "按派生顺序检查地址，连续 20 个未使用的地址后停止；入账较多时需要更长时间。":
    "Addresses are checked in derivation order and the scan stops after 20 consecutive unused addresses. Accounts with many deposits take longer.",
  "阶段": "Stage",
  "分支": "Branch",
  "收款地址": "Receiving addresses",
  "找零地址": "Change addresses",
  "已扫描地址": "Addresses scanned",
  "已找到入账": "Deposits found",
  "已核对入账": "Deposits checked",
  "取消扫描": "Cancel scan",

  // Results
  "扫描不完整": "Scan incomplete",
  "扫描未完成": "Scan did not finish",
  "这个账户的地址或入账数量超出了本工具的扫描上限，为避免显示偏小的余额，已停止扫描。":
    "This account has more addresses or deposits than this tool can scan. The scan stopped rather than show a balance that is too small.",
  "官方节点与索引服务的数据不一致，稍后重试通常可以解决。":
    "The official node and indexer disagree; trying again a little later usually resolves this.",
  "扫描过程中出现问题，请检查网络后重试。": "Something went wrong during the scan. Check your connection and try again.",
  "扫描结果": "Scan results",
  "以下为最终确认区块 #{0} 时的状态；之后的新入账不会包含在内。":
    "State as of finalized block #{0}; deposits after that block are not included.",
  "地址已匹配": "Address matched",
  "未在派生地址中找到": "Not among the derived addresses",
  "请确认助记词属于显示该地址的官方钱包；地址可能来自另一组助记词。":
    "Make sure the phrase belongs to the official wallet that shows this address; it may come from a different phrase.",
  "可取回余额": "Withdrawable balance",
  "已花费入账": "Spent deposits",
  "{0} 条 · {1}": "{0} · {1}",
  "已检查地址": "Addresses checked",
  "快照区块": "Snapshot block",
  "没有找到可取回的入账": "No withdrawable deposits found",
  "这个账户的入账都已经被花费。": "Every deposit to this account has already been spent.",
  "这组助记词派生出的地址还没有收到过任何转账。如果官方钱包显示有资产，请核对助记词是否属于那个钱包。":
    "The addresses derived from this phrase have not received any transfers. If the official wallet shows a balance, check that the phrase belongs to that wallet.",
  "已选择 {0} / {1} 条": "{0} of {1} selected",
  "清除选择": "Clear selection",
  "选择前 {0} 条": "Select first {0}",
  "一次取回最多 {0} 条入账；更多入账请分多次取回。": "Up to {0} deposits per withdrawal; withdraw more in several rounds.",
  "取回所选入账": "Withdraw selected",
  "重新扫描": "Scan again",
  "返回修改助记词": "Back to edit the phrase",

  // Exit form
  "取回到普通账户": "Withdraw to a regular account",
  "资产会转入下面选择的账户；取回不可撤销，请确认账户由你本人控制。":
    "The funds go to the account chosen below. A withdrawal cannot be undone; make sure you control the account.",
  "收款账户": "Receiving account",
  "选择收款账户": "Choose an account",
  "从同一助记词派生的普通账户": "Regular account from the same seed phrase",
  "官方钱包中与加密账户配对的普通账户": "The regular account paired with the encrypted account in the official wallet",
  "正在派生…": "Deriving…",
  "请与官方钱包中该普通账户（{0}）的地址核对。": "Compare with the address of that regular account ({0}) in the official wallet.",
  "取回功能暂不可用": "Withdrawal is not available yet",
  "扫描结果仍然有效，你可以稍后再试。": "The scan results are still valid; try again later.",
  "选中入账": "Selected deposits",
  "{0} 条": "{0}",
  "输入金额": "Input amount",
  "取整后金额": "Rounded amount",
  "舍去零头": "Remainder lost",
  "链上费用（{0}%）": "Chain fee ({0}%)",
  "链上费用": "Chain fee",
  "预计返还": "Expected rebate",
  "实际到账": "You receive",
  "生成证明需要约 1 GB 内存，可能持续几分钟，建议使用桌面浏览器并保持页面打开。手机浏览器可能因内存不足而失败。":
    "Generating the proof needs about 1 GB of memory and may take a few minutes. Use a desktop browser and keep the page open; mobile browsers may fail for lack of memory.",
  "我确认收款账户由我本人控制，并了解费用、舍去的零头以及取回不可撤销。":
    "I confirm I control the receiving account and understand the fee, the lost remainder and that a withdrawal cannot be undone.",
  "生成证明并提交": "Generate proof and submit",

  // Exit progress and receipt
  "正在生成证明": "Generating the proof",
  "请保持页面打开。证明只在本地生成，验证通过后才会提交到网络。":
    "Keep the page open. The proof is generated locally and only submitted after it verifies.",
  "进度": "Progress",
  "取消": "Cancel",
  "交易正在提交，请勿关闭页面。": "The transaction is being submitted; do not close the page.",
  "取回已提交": "Withdrawal submitted",
  "状态会自动更新；也可以稍后在“加密账户恢复”首页的取回记录中查看。":
    "The status updates automatically; you can also check it later under previous withdrawals on the recovery start page.",

  // scan.ts
  "扫描上限无效。": "Invalid scan limit.",
  "已取消扫描。": "Scan cancelled.",
  "无法连接网络服务，请检查网络后重试。": "Could not reach the network service. Check your connection and try again.",
  "网络服务返回了无法解析的数据。": "The network service returned unreadable data.",
  "交易索引暂不可用，请稍后重试。": "The transaction indexer is temporarily unavailable. Try again later.",
  "索引高度 无效。": "Invalid indexer height.",
  "索引服务与节点的区块不一致，请稍后重试。": "The indexer and the node disagree about the block. Try again later.",
  "索引服务网络不匹配，已停止操作。": "The indexer is on a different network; stopped.",
  "入账索引返回了无效的数据。": "The deposit indexer returned invalid data.",
  "入账计数 无效。": "Invalid transfer count.",
  "入账记录超过 {0} 条，本工具无法完整扫描。": "More than {0} deposits; this tool cannot scan the account completely.",
  "分支 {0} 在 {1} 个地址内仍有入账，本工具无法完整扫描。":
    "Branch {0} still has deposits within {1} addresses; this tool cannot scan the account completely.",
  "地址派生结果不完整。": "Address derivation returned an incomplete result.",
  "空值符计算结果不完整。": "Nullifier computation returned an incomplete result.",
  "节点返回了无效的存储数据。": "The node returned invalid storage data.",
  "节点返回的存储数据未固定在快照区块。": "The node's storage data is not pinned to the snapshot block.",
  "节点返回的存储数据缺少查询的键。": "The node's storage data is missing a queried key.",
};
