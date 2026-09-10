import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
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
import { localeTag, useT } from "../../lib/i18n";
import { isWormhole } from "../../lib/wallet";
import type { WalletPage } from "./types";

const EXPLORER = MAINNET.explorerUrl;
// Chinese source labels; translate at the usage site with t().
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
  const t = useT();
  const search = query.trim().toLowerCase();
  const visiblePending = pending.filter(
    (p) =>
      page === "overview" ||
      ((filter === "all" || filter === "out") &&
        `${p.hash} ${p.to} ${p.address}`.toLowerCase().includes(search)),
  );
  const filtered = page === "activity" && (filter !== "all" || !!search);
  return (
    <section className="wallet-activity">
      <div className="wallet-section-title">
        <div>
          <h2>{page === "overview" ? t("最近活动") : t("全部记录")}</h2>
          {wallet && isWormhole(wallet) && <p>{t("公开入账记录")}</p>}
        </div>
        {page === "overview" && wallet ? (
          <button onClick={onShowAll}>
            {t("查看全部")}
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
          <div className="filter-tabs" aria-label={t("交易筛选")}>
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
                {t(label)}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label={t("搜索交易")}
              placeholder={t("搜索地址或哈希")}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
            {query && (
              <button
                className="clear-search"
                type="button"
                aria-label={t("清除搜索")}
                onClick={() => onQueryChange("")}
              >
                <X size={16} />
              </button>
            )}
          </label>
        </div>
      )}
      {historyError && (
        <div className="history-error" role="alert">
          <p>
            {transactions.length
              ? t("交易记录暂未更新，以下为上次加载的结果。")
              : t("暂时无法加载交易记录，请稍后重试。")}
          </p>
          <button
            className="text-button"
            disabled={historyLoading}
            onClick={onReload}
          >
            {t("重新加载")}
            <RefreshCw size={13} />
          </button>
        </div>
      )}
      {visiblePending.length > 0 && (
        <div className="pending-list">
          {visiblePending.map((p) => (
            <div className="pending-row" key={p.hash}>
              <span className="transaction-icon outgoing">
                {p.status === "failed" ? (
                  <X size={17} />
                ) : p.status === "finalized" ? (
                  <Check size={17} />
                ) : ["unknown", "expired"].includes(p.status) ? (
                  <CircleHelp size={17} />
                ) : (
                  <LoaderCircle size={17} className="spin" />
                )}
              </span>
              <div>
                <strong>{t("发送至 {0}", shortAddress(p.to))}</strong>
                <small>
                  {p.status === "pending"
                    ? t("已提交，等待入块")
                    : p.status === "included"
                      ? t("已入块，等待最终确认")
                      : p.status === "finalized"
                        ? t("已最终确认")
                        : p.status === "failed"
                          ? t("执行失败")
                          : p.error || t("状态待核实，请在 Explorer 中确认")}
                </small>
                {p.status === "failed" && p.error && (
                  <small className="danger-text">{p.error}</small>
                )}
              </div>
              <b>
                {p.status === "failed" ? "" : "−"}
                {formatAmount(p.amount)} <small>QTC</small>
              </b>
              <a
                aria-label={t("查看已提交交易")}
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
          {visibleTransactions.map((tx) => {
            const incoming = tx.to === wallet?.address,
              reward = tx.type === "MINER_REWARD" || tx.type === "REWARD",
              unsuccessful = /FAILED|CANCELLED/.test(tx.status),
              other = incoming ? tx.from : tx.to;
            return (
              <a
                className="wallet-transaction"
                key={tx.id}
                href={explorerTransactionUrl(tx)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={
                  reward ? t("在 Explorer 查看挖矿奖励") : t("在 Explorer 查看交易")
                }
              >
                <span
                  className={`transaction-icon ${incoming && !unsuccessful ? "incoming" : "outgoing"}`}
                >
                  {unsuccessful ? (
                    <X size={19} />
                  ) : incoming ? (
                    <ArrowDownLeft size={19} />
                  ) : (
                    <ArrowUpRight size={19} />
                  )}
                </span>
                <span className="wallet-transaction-main">
                  <strong>
                    {reward
                      ? t("挖矿奖励")
                      : tx.type === "NETWORK_REWARD"
                        ? t("网络奖励")
                        : incoming
                          ? t("收到转账")
                          : tx.from === wallet?.address
                            ? t("发送转账")
                            : t(txLabel(tx.type))}
                  </strong>
                  <small title={other || ""}>
                    {other ? shortAddress(other, 4) : t(txLabel(tx.type))}
                    <span className="transaction-date">
                      {new Date(tx.timestamp).toLocaleDateString(localeTag(), {
                        month: "2-digit",
                        day: "2-digit",
                      })}{" "}
                      {new Date(tx.timestamp).toLocaleTimeString(localeTag(), {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </small>
                </span>
                <span
                  className={`wallet-transaction-amount ${incoming && !unsuccessful ? "positive" : ""} ${formatAmount(tx.amount).length > 12 ? "long-value" : ""}`}
                >
                  <strong>
                    {unsuccessful
                      ? ""
                      : incoming
                        ? "+"
                        : tx.from === wallet?.address
                          ? "−"
                          : ""}
                    {formatAmount(tx.amount)}
                    <small> QTC</small>
                  </strong>
                  <span
                    className={`transaction-status ${/SUCCESS|EXECUTED/.test(tx.status) ? "success" : "neutral"}`}
                  >
                    <span />
                    {t(
                      {
                        SUCCESS: "成功",
                        FAILED: "失败",
                        PENDING: "待执行",
                        EXECUTED: "已执行",
                        CANCELLED: "已取消",
                      }[tx.status] || tx.status,
                    )}
                  </span>
                </span>
                <ArrowUpRight className="transaction-external" size={17} />
              </a>
            );
          })}
        </div>
      ) : (
        !historyError &&
        visiblePending.length === 0 && (
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
                ? t("解锁后查看交易")
                : historyLoading
                  ? t("正在读取链上记录…")
                  : !wallet
                    ? t("添加钱包后查看交易")
                    : filtered
                      ? t("没有符合条件的记录")
                      : t("暂无交易记录")}
            </h3>
            <p>
              {!unlocked
                ? t("余额与交易记录仅在解锁后显示")
                : !wallet
                  ? t("支持创建、导入和观察钱包")
                  : filtered
                    ? t("试试其他地址、交易哈希或筛选条件")
                    : t("交易确认并被索引后，会出现在这里")}
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
          {historyLoading ? t("正在加载…") : t("加载更多记录")}
          <ChevronDown size={14} />
        </button>
      )}
      {wallet && page === "activity" && (
        <div className="wallet-indexer-note">
          <span className="status-dot" />
          {t("Explorer 索引可能稍有延迟")}
        </div>
      )}
    </section>
  );
}
