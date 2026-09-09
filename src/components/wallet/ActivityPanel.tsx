import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  History,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { explorerTransactionUrl, MAINNET } from "../../lib/chain";
import type { Transaction } from "../../lib/chain";
import type { Pending, Wallet } from "../../lib/vault";
import { formatAmount, shortAddress } from "../../lib/amount";
import { isWormhole } from "../../lib/wallet";
import type { WalletPage } from "./types";

const EXPLORER = MAINNET.explorerUrl;
const txLabel = (type: string) =>
  ({
    IMMEDIATE: "普通转账",
    MINER_REWARD: "挖矿奖励",
    REWARD: "挖矿奖励",
    WORMHOLE: "Wormhole",
    SCHEDULED_REVERSIBLE: "待执行转账",
    EXECUTED_REVERSIBLE: "已执行转账",
    CANCELLED_REVERSIBLE: "已取消转账",
  })[type] || type.replaceAll("_", " ").toLowerCase();

type ActivityPanelProps = {
  page: WalletPage;
  wallet?: Wallet;
  unlocked: boolean;
  pending: Pending[];
  transactions: Transaction[];
  visibleTransactions: Transaction[];
  filter: string;
  query: string;
  historyError: string;
  historyLoading: boolean;
  more: boolean;
  onFilterChange: (filter: string) => void;
  onQueryChange: (query: string) => void;
  onShowAll: () => void;
  onReload: () => void;
  onLoadMore: () => void;
};

export function ActivityPanel({
  page,
  wallet,
  unlocked,
  pending,
  transactions,
  visibleTransactions,
  filter,
  query,
  historyError,
  historyLoading,
  more,
  onFilterChange,
  onQueryChange,
  onShowAll,
  onReload,
  onLoadMore,
}: ActivityPanelProps) {
  return (
    <section className="wallet-activity">
      <div className="wallet-section-title">
        <div>
          <h2>{page === "overview" ? "最近活动" : "全部记录"}</h2>
          {wallet && isWormhole(wallet) && <p>公开入账记录</p>}
        </div>
        {page === "overview" && wallet ? (
          <button onClick={onShowAll}>
            查看全部
            <ArrowRight size={15} />
          </button>
        ) : wallet ? (
          <a
            href={`${EXPLORER}/accounts/${wallet.address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Explorer
            <ArrowUpRight size={15} />
          </a>
        ) : (
          <History size={19} />
        )}
      </div>
      {page === "activity" && (
        <div className="wallet-activity-toolbar">
          <div className="filter-tabs" aria-label="交易筛选">
            {[
              ["all", "全部"],
              ["in", "转入"],
              ["out", "转出"],
              ["mining", "挖矿"],
            ].map(([id, label]) => (
              <button
                aria-pressed={filter === id}
                key={id}
                className={filter === id ? "active" : ""}
                onClick={() => onFilterChange(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="搜索交易"
              placeholder="搜索地址或哈希"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </label>
        </div>
      )}
      {historyError && (
        <div className="history-error" role="alert">
          <p>
            {transactions.length
              ? "交易记录暂未更新，以下为上次加载的结果。"
              : "暂时无法加载交易记录，请稍后重试。"}
          </p>
          <button className="text-button" onClick={onReload}>
            重新加载
            <RefreshCw size={13} />
          </button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="pending-list">
          {pending
            .filter(
              () => page === "overview" || filter === "all" || filter === "out",
            )
            .map((p) => (
              <div className="pending-row" key={p.hash}>
                <span className="transaction-icon outgoing">
                  {p.status === "failed" ? (
                    <X size={17} />
                  ) : p.status === "finalized" ? (
                    <Check size={17} />
                  ) : (
                    <LoaderCircle size={17} className="spin" />
                  )}
                </span>
                <div>
                  <strong>发送至 {shortAddress(p.to)}</strong>
                  <small>
                    {p.status === "pending"
                      ? "已提交，等待入块"
                      : p.status === "included"
                        ? "已入块，等待最终确认"
                        : p.status === "finalized"
                          ? "已最终确认"
                          : p.status === "failed"
                            ? "执行失败"
                            : p.error || "状态待核实，请在 Explorer 中确认"}
                  </small>
                  {p.status === "failed" && p.error && (
                    <small className="danger-text">{p.error}</small>
                  )}
                </div>
                <b>
                  −{formatAmount(p.amount)} <small>QTC</small>
                </b>
                <a
                  aria-label="查看已提交交易"
                  href={`${EXPLORER}/transactions/${p.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ArrowUpRight size={16} />
                </a>
              </div>
            ))}
        </div>
      )}
      {visibleTransactions.length > 0 ? (
        <div className="wallet-transactions">
          {visibleTransactions.map((t) => {
            const incoming = t.to === wallet?.address,
              reward = t.type === "MINER_REWARD",
              other = incoming ? t.from : t.to;
            return (
              <a
                className="wallet-transaction"
                key={t.id}
                href={explorerTransactionUrl(t)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`在 Explorer 查看${reward ? "挖矿奖励" : "交易"}`}
              >
                <span
                  className={`transaction-icon ${incoming ? "incoming" : "outgoing"}`}
                >
                  {incoming ? (
                    <ArrowDownLeft size={19} />
                  ) : (
                    <ArrowUpRight size={19} />
                  )}
                </span>
                <span className="wallet-transaction-main">
                  <strong>
                    {reward
                      ? "挖矿奖励"
                      : t.type === "NETWORK_REWARD"
                        ? "网络奖励"
                        : incoming
                          ? "收到转账"
                          : t.from === wallet?.address
                            ? "发送转账"
                            : txLabel(t.type)}
                  </strong>
                  <small title={other || ""}>
                    {other ? shortAddress(other, 4) : txLabel(t.type)}
                    <span className="transaction-date">
                      {" "}
                      ·{" "}
                      {new Date(t.timestamp).toLocaleDateString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                      })}{" "}
                      {new Date(t.timestamp).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </small>
                </span>
                <span
                  className={`wallet-transaction-amount ${incoming ? "positive" : ""}`}
                >
                  <strong>
                    {incoming ? "+" : t.from === wallet?.address ? "−" : ""}
                    {formatAmount(t.amount)}
                    <small> QTC</small>
                  </strong>
                  <span
                    className={`transaction-status ${/SUCCESS|EXECUTED/.test(t.status) ? "success" : "neutral"}`}
                  >
                    <span />
                    {{
                      SUCCESS: "成功",
                      FAILED: "失败",
                      PENDING: "待执行",
                      EXECUTED: "已执行",
                      CANCELLED: "已取消",
                    }[t.status] || t.status}
                  </span>
                </span>
                <ArrowUpRight className="transaction-external" size={17} />
              </a>
            );
          })}
        </div>
      ) : (
        !historyError && (
          <div className="wallet-empty-activity">
            <span className="empty-activity-art">
              {!unlocked ? (
                <LockKeyhole size={25} />
              ) : historyLoading ? (
                <LoaderCircle size={25} className="spin" />
              ) : (
                <History size={26} />
              )}
            </span>
            <h3>
              {!unlocked
                ? "解锁后查看交易"
                : historyLoading
                  ? "正在读取链上记录…"
                  : !wallet
                    ? "添加钱包后查看交易"
                    : page === "activity" && (filter !== "all" || query)
                      ? "没有符合条件的记录"
                      : "暂无交易记录"}
            </h3>
            <p>
              {!unlocked
                ? "余额与交易记录仅在解锁后显示"
                : !wallet
                  ? "支持创建、导入和观察钱包"
                  : "交易确认并被索引后，会出现在这里"}
            </p>
          </div>
        )
      )}
      {more && page === "activity" && (
        <button
          className="load-more"
          disabled={historyLoading}
          onClick={onLoadMore}
        >
          {historyLoading ? "正在加载…" : "加载更多记录"}
          <ChevronDown size={14} />
        </button>
      )}
      {wallet && page === "activity" && (
        <div className="wallet-indexer-note">
          <span className="status-dot" />
          Explorer 索引可能稍有延迟
        </div>
      )}
    </section>
  );
}
