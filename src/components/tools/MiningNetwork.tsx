import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useT } from "../../lib/i18n";
import { errorText } from "../../lib/amount";
import {
  BUILT_IN_TERMS,
  fetchBlockReward,
  fetchChainStats,
  fetchMarketPrice,
  fetchPoolLuck,
  fetchPoolStats,
  fetchPoolTerms,
  type ChainStats,
  type MarketPrice,
  type PoolLuck,
  type PoolStats,
  type RewardStats,
} from "../../lib/mining/data";
import { SNAPSHOT_DATE, type PoolTerms } from "../../lib/mining/gpus";
import { formatCompact, formatHashrate, formatInteger, formatQtc, formatSeconds } from "../../lib/mining/format";
import { planckToQtc, type Network } from "../../lib/mining/math";
import { Stat } from "./MiningFields";

const REFRESH_MS = 60_000;
export const STALE_MS = 5 * 60_000;
/** The indexer occasionally answers without CORS headers; a couple of quick retries cover that. */
const RETRY_MS = 4_000;
const MAX_RETRIES = 2;

export type DataState = {
  chain: ChainStats | null;
  reward: RewardStats | null;
  pool: PoolStats | null;
  luck: PoolLuck | null;
  /** Last price of the QUAN/USDT market; null while it has never been read. */
  market: MarketPrice | null;
  terms: PoolTerms;
  errors: { chain?: string; reward?: string; terms?: string; market?: string };
  loading: boolean;
  /** When the last refresh attempt finished, successful or not. */
  checkedAt: number | null;
};

/**
 * Reads the network state from the chain, the indexer and the pool API,
 * refreshing every minute while the page is visible. A failed source keeps
 * its last good value and shows its error; nothing is ever estimated from
 * a guess. Fetching is skipped outside a browser so the page renders in
 * tests unchanged.
 */
export function useMiningData(): DataState & { refresh: () => void } {
  const [state, setState] = useState<DataState>({
    chain: null,
    reward: null,
    pool: null,
    luck: null,
    market: null,
    terms: BUILT_IN_TERMS,
    errors: {},
    loading: false,
    checkedAt: null,
  });
  const running = useRef<AbortController | null>(null);
  const retries = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (typeof window === "undefined") return;
    running.current?.abort();
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    const controller = new AbortController();
    running.current = controller;
    setState((prev) => ({ ...prev, loading: true }));
    const signal = controller.signal;
    void Promise.allSettled([
      fetchChainStats({ signal }),
      fetchBlockReward({ signal }),
      fetchPoolTerms({ signal }),
      fetchPoolStats({ signal }),
      fetchPoolLuck({ signal }),
      fetchMarketPrice({ signal }),
    ]).then(([chain, reward, terms, pool, luck, market]) => {
      if (signal.aborted) return;
      const essentialFailed = chain.status === "rejected" || reward.status === "rejected";
      if (essentialFailed && retries.current < MAX_RETRIES) {
        retries.current += 1;
        retryTimer.current = setTimeout(refresh, RETRY_MS);
      } else if (!essentialFailed) retries.current = 0;
      setState((prev) => ({
        chain: chain.status === "fulfilled" ? chain.value : prev.chain,
        reward: reward.status === "fulfilled" ? reward.value : prev.reward,
        terms: terms.status === "fulfilled" ? terms.value : prev.terms,
        pool: pool.status === "fulfilled" ? pool.value : prev.pool,
        luck: luck.status === "fulfilled" ? luck.value : prev.luck,
        // The exchange turns some visitors away; keep the last good quote and
        // let the price field fall back to whatever the reader types.
        market: market.status === "fulfilled" ? market.value : prev.market,
        errors: {
          chain: chain.status === "rejected" ? errorText(chain.reason) : undefined,
          reward: reward.status === "rejected" ? errorText(reward.reason) : undefined,
          terms: terms.status === "rejected" ? errorText(terms.reason) : undefined,
          market: market.status === "rejected" ? errorText(market.reason) : undefined,
        },
        loading: false,
        checkedAt: Date.now(),
      }));
    });
  }, []);

  useEffect(() => {
    refresh();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(refresh, REFRESH_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        start();
      } else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      running.current?.abort();
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    };
  }, [refresh]);

  return { ...state, refresh };
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <span className="mining-network-item">
      <span>{label}</span>
      {value}
    </span>
  );
}

/**
 * The state the estimate rests on, condensed to one line: difficulty,
 * measured block time, inferred network hashrate, block reward and when it
 * was read. Sampling detail sits inside the disclosure; anything that would
 * make the numbers wrong (a stale read, a failed source) stays outside it.
 */
export function MiningNetwork({ data, network }: { data: DataState & { refresh: () => void }; network: Network | null }) {
  const t = useT();
  const networkHashrate = network ? Number(network.difficulty) / network.blockTimeSeconds : 0;
  const blocksPerDay = network ? 86_400 / network.blockTimeSeconds : 0;
  const lastGood = Math.max(data.chain?.fetchedAt ?? 0, data.reward?.fetchedAt ?? 0);
  const stale = lastGood > 0 && data.checkedAt !== null && data.checkedAt - lastGood > STALE_MS;
  const time = (ms: number) =>
    new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const updated = lastGood > 0 ? t("更新于 {0}", time(lastGood)) : data.loading ? t("正在读取…") : t("尚未读取");

  return (
    <div className="mining-network">
      <div className="mining-network-strip">
        <details className="flow-details mining-fold">
          <summary>
            <span className="mining-network-line">
              <Item label={t("难度")} value={data.chain ? formatCompact(data.chain.difficulty) : "—"} />
              <Item label={t("出块")} value={data.chain ? formatSeconds(data.chain.blockTimeSeconds) : "—"} />
              <Item label={t("全网算力")} value={network ? formatHashrate(networkHashrate) : "—"} />
              <Item
                label={t("区块奖励")}
                value={data.reward ? `${formatQtc(planckToQtc(data.reward.blockRewardPlanck))} QTC` : "—"}
              />
              <span className="mining-updated">{updated}</span>
            </span>
          </summary>
          <div className="mining-fold-body">
            {/* Only what the line above cannot fit; the difficulty, block
                time and reward are already on it. */}
            <dl className="mining-stats">
              <Stat label={t("每日出块")} value={network ? formatInteger(blocksPerDay) : "—"} />
              <Stat label={t("区块高度")} value={data.chain ? formatInteger(data.chain.height) : "—"} />
              <Stat
                label={t("上一块")}
                value={data.chain ? formatSeconds(data.chain.lastBlockDurationMs / 1000) : "—"}
              />
            </dl>
            <p className="mining-note">
              {t("全网算力 = 难度 ÷ 实测出块时间，不是任何矿池上报的数字。")}
              {data.pool && network && (
                <>
                  {" "}
                  {t(
                    "Quanpool 自报算力 {0}（约占 {1}），量级相符。",
                    formatHashrate(data.pool.poolHashrate),
                    `${Math.round((data.pool.poolHashrate / networkHashrate) * 100)}%`,
                  )}
                </>
              )}
            </p>
          </div>
        </details>
        <button
          type="button"
          className="circle-button subtle"
          aria-label={t("刷新网络数据")}
          onClick={data.refresh}
          disabled={data.loading}
        >
          <RefreshCw size={16} className={data.loading ? "spin" : undefined} aria-hidden="true" />
        </button>
      </div>
      {stale && (
        <div className="callout warm mining-callout">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <p>{t("数据已超过 5 分钟未更新，估算基于上次成功读取的状态。")}</p>
          </div>
        </div>
      )}
      {data.errors.chain && <p className="error mining-error">{t("链上数据读取失败：{0}", data.errors.chain)}</p>}
      {data.errors.reward && <p className="error mining-error">{t("区块奖励读取失败：{0}", data.errors.reward)}</p>}
      {data.errors.terms && (
        <p className="error mining-error">
          {t("矿池基准读取失败，使用 {0} 的内置快照：{1}", SNAPSHOT_DATE, data.errors.terms)}
        </p>
      )}
    </div>
  );
}
