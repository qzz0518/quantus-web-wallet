import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useT } from "../../lib/i18n";
import { errorText } from "../../lib/amount";
import { fiatValue, formatUsd, useMarketPrice } from "../../lib/market";
import { fetchChainStats, type ChainStats } from "../../lib/mining/data";
import { formatCompact, formatHashrate, formatInteger, formatPercent, formatQtc, formatSeconds, trimNumber } from "../../lib/mining/format";
import { planckToQtc } from "../../lib/mining/math";
import {
  fetchBlocksSince,
  fetchChainTotals,
  fetchDailyStats,
  fetchTotalIssuance,
  type ChainTotals,
  type DailyStat,
} from "../../lib/network/data";
import {
  EMISSION_DIVISOR,
  HALVING_BLOCKS,
  MAX_SUPPLY_QTC,
  RUNTIME_SPEC,
  blocksPerDay,
  emissionOutlook,
  halvingYears,
  readSupply,
} from "../../lib/network/issuance";
import { Fold, Stat } from "./MiningFields";
import { BarChart, ChartBlock, Sparkline, type Point } from "./Charts";

/** How long a reading stays good before the page asks again. */
export const CACHE_MS = 10 * 60_000;
/** Target block time written into the runtime; the measured one sits beside it. */
export const TARGET_BLOCK_SECONDS = 12;
const OUTLOOK_YEARS = [0, 1, 2, 5];

type Errors = { chain?: string; issuance?: string; daily?: string; totals?: string };

export type NetworkState = {
  chain: ChainStats | null;
  issuancePlanck: bigint | null;
  daily: DailyStat[] | null;
  totals: ChainTotals | null;
  blocks24h: number | null;
  errors: Errors;
  loading: boolean;
  fetchedAt: number | null;
};

const EMPTY: NetworkState = {
  chain: null,
  issuancePlanck: null,
  daily: null,
  totals: null,
  blocks24h: null,
  errors: {},
  loading: false,
  fetchedAt: null,
};

/**
 * The dashboard's readings, cached for ten minutes across visits to the
 * page so walking in and out of the tool does not re-query the chain. A
 * source that fails keeps its last good value and shows its own error.
 */
let cache: NetworkState = EMPTY;

export function useNetworkData(): NetworkState & { refresh: () => void } {
  const [state, setState] = useState<NetworkState>(cache);
  const running = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    if (typeof window === "undefined") return;
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    const signal = controller.signal;
    const next = (patch: NetworkState) => {
      cache = patch;
      setState(patch);
    };
    next({ ...cache, loading: true });
    const since = new Date(Date.now() - 86_400_000);
    void Promise.allSettled([
      fetchChainStats({ signal }),
      fetchTotalIssuance({ signal }),
      fetchDailyStats({ signal }),
      fetchChainTotals({ signal }),
      fetchBlocksSince(since, { signal }),
    ]).then(([chain, issuance, daily, totals, blocks]) => {
      if (signal.aborted) return;
      next({
        chain: chain.status === "fulfilled" ? chain.value : cache.chain,
        issuancePlanck: issuance.status === "fulfilled" ? issuance.value.issuancePlanck : cache.issuancePlanck,
        daily: daily.status === "fulfilled" ? daily.value : cache.daily,
        totals: totals.status === "fulfilled" ? totals.value : cache.totals,
        blocks24h: blocks.status === "fulfilled" ? blocks.value : cache.blocks24h,
        errors: {
          chain: chain.status === "rejected" ? errorText(chain.reason) : undefined,
          issuance: issuance.status === "rejected" ? errorText(issuance.reason) : undefined,
          daily: daily.status === "rejected" ? errorText(daily.reason) : undefined,
          totals: totals.status === "rejected" ? errorText(totals.reason) : undefined,
        },
        loading: false,
        fetchedAt: Date.now(),
      });
    });
  }, []);

  useEffect(() => {
    if (cache.fetchedAt === null || Date.now() - cache.fetchedAt > CACHE_MS) refresh();
    return () => running.current?.abort();
  }, [refresh]);

  return { ...state, refresh };
}

/**
 * What the network is doing right now, and — the question this page exists
 * to answer — how the block reward changes over time. Every figure is read
 * from the public chain RPC or the public indexer by the reader's own
 * browser and is printed exactly once: the four headline numbers own the
 * present, the issuance section owns the future.
 */
export function NetworkPage({ onBack }: { onBack: () => void }) {
  const data = useNetworkData();
  const market = useMarketPrice();
  return <NetworkDashboard data={data} price={market?.last ?? null} onBack={onBack} onRefresh={data.refresh} />;
}

/** The page itself, given its readings, so it can be rendered without a network. */
export function NetworkDashboard({
  data,
  price,
  onBack,
  onRefresh,
}: {
  data: NetworkState;
  price: number | null;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const t = useT();
  const { chain, issuancePlanck, daily, totals } = data;

  const supply = useMemo(() => (issuancePlanck === null ? null : readSupply(issuancePlanck)), [issuancePlanck]);
  const blockTime = chain?.blockTimeSeconds ?? null;
  const perDay = blockTime === null ? null : blocksPerDay(blockTime);
  const hashrate = chain && blockTime ? Number(chain.difficulty) / blockTime : null;
  const outlook = useMemo(
    () => (supply && blockTime ? emissionOutlook(supply, blockTime, OUTLOOK_YEARS) : []),
    [supply, blockTime],
  );
  const halving = blockTime === null ? null : halvingYears(blockTime);
  const rewardQtc = supply ? planckToQtc(supply.rewardPlanck) : null;
  const rewardUsd = supply && price !== null ? fiatValue(supply.rewardPlanck, price) : null;
  // The indexer counts whole blocks over 24 h, which is a second, independent
  // measure of how fast the chain is running; it is only worth printing when
  // it disagrees with the head sample by enough to notice.
  const hashrate24h = chain && data.blocks24h !== null && data.blocks24h > 0
    ? (Number(chain.difficulty) * data.blocks24h) / 86_400
    : null;

  const qtc = (value: number | null) => (value === null ? "—" : `${formatQtc(value)} QTC`);
  const waiting = data.loading ? t("正在读取…") : t("尚未读取");
  const updated = data.fetchedAt
    ? t("更新于 {0}", new Date(data.fetchedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }))
    : waiting;

  const metrics = [
    {
      key: "height",
      label: t("区块高度"),
      value: chain ? formatInteger(chain.height) : "—",
      hint: totals ? t("索引器已收录 {0} 块", formatInteger(totals.blockHeight)) : waiting,
    },
    {
      key: "hashrate",
      label: t("全网算力"),
      value: hashrate === null ? "—" : formatHashrate(hashrate),
      // The difficulty itself lives in the fold below; here only the method.
      hint: chain ? t("难度 ÷ 出块时间") : waiting,
    },
    {
      key: "blocktime",
      label: t("出块时间"),
      value: blockTime === null ? "—" : formatSeconds(blockTime),
      hint: chain ? t("目标 {0} 秒，取近 {1} 块平均", TARGET_BLOCK_SECONDS, chain.sampledBlocks) : waiting,
    },
    {
      key: "reward",
      label: t("区块奖励"),
      value: rewardQtc === null ? "—" : formatQtc(rewardQtc),
      unit: "QTC",
      hint: supply === null ? waiting : rewardUsd === null ? t("按剩余待发行量计算") : t("≈ {0}", formatUsd(rewardUsd, true)),
    },
  ];

  const dayLabel = (date: string) => date.slice(5).replace("-", "/");
  const chart = (pick: (row: DailyStat) => number, unit: string): Point[] =>
    (daily ?? []).map((row) => ({ key: row.date, value: pick(row), title: `${row.date} · ${formatInteger(pick(row))} ${unit}` }));
  const latest = (pick: (row: DailyStat) => number) => (daily?.length ? pick(daily[daily.length - 1]) : null);
  const span = daily?.length
    ? daily.length === 1
      ? dayLabel(daily[0].date)
      : t("{0} 至 {1}", dayLabel(daily[0].date), dayLabel(daily[daily.length - 1].date))
    : "";

  return (
    <section className="settings-page tools-page network-page" aria-label={t("网络状态")}>
      <header className="page-heading tools-heading">
        <button type="button" className="circle-button" aria-label={t("返回")} onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <h1>{t("网络状态")}</h1>
        <button
          type="button"
          className="circle-button subtle network-refresh"
          aria-label={t("刷新网络数据")}
          onClick={onRefresh}
          disabled={data.loading}
        >
          <RefreshCw size={16} className={data.loading ? "spin" : undefined} aria-hidden="true" />
        </button>
      </header>

      <div className="mining-summary">
        <section className="mining-summary-card" aria-label={t("当前状态")}>
          <dl className="mining-metrics">
            {metrics.map((metric) => (
              <div key={metric.key} className="mining-metric">
                <dt>{metric.label}</dt>
                <dd>
                  <strong>
                    {metric.value}
                    {metric.unit && metric.value !== "—" && <em>{metric.unit}</em>}
                  </strong>
                  <small>{metric.hint}</small>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mining-summary-note">
            {t("全部数据由你的浏览器直接读取公开节点和索引器，每 10 分钟缓存一次。{0}", updated)}
          </p>
        </section>
      </div>

      {data.errors.chain && <p className="error mining-error">{t("链上数据读取失败：{0}", data.errors.chain)}</p>}
      {data.errors.issuance && <p className="error mining-error">{t("发行量读取失败：{0}", data.errors.issuance)}</p>}

      <Fold
        title={t("发行与奖励衰减")}
        meta={supply ? t("已发行 {0}%", trimNumber(supply.issuedShare * 100, 2)) : undefined}
        open
      >
        {supply ? (
          <>
            <div className="supply-bar" role="img" aria-label={t("已发行 {0}%", trimNumber(supply.issuedShare * 100, 2))}>
              <span style={{ width: `${Math.min(100, Math.max(0.5, supply.issuedShare * 100))}%` }} />
            </div>
            <dl className="mining-stats supply-stats">
              {/* The share has one home, the bar and the fold's own meta;
                  printing it again beside the amount would say it twice. */}
              <Stat label={t("已发行")} value={`${formatQtc(planckToQtc(supply.issuedPlanck))} QTC`} />
              <Stat
                label={t("剩余待发行")}
                value={`${formatQtc(planckToQtc(supply.remainingPlanck))} QTC`}
                hint={t("上限 {0} QTC", formatInteger(MAX_SUPPLY_QTC))}
              />
              <Stat
                label={t("每天新增")}
                value={qtc(perDay === null || rewardQtc === null ? null : rewardQtc * perDay)}
                hint={perDay === null ? t("等待出块时间") : t("按每天 {0} 块", formatInteger(perDay))}
              />
              <Stat
                label={t("奖励减半还需")}
                value={halving === null ? "—" : t("{0} 年", trimNumber(halving, 1))}
                hint={t("{0} 块，按当前出块速度", formatCompact(HALVING_BLOCKS, 1))}
              />
            </dl>
            <p className="mining-note">
              {t(
                "每块铸造「剩余待发行量 ÷ {0}」给矿工，所以奖励每块按剩余量的 1/{0} 平滑递减，没有减半台阶。交易费也一并铸给矿工。",
                formatInteger(EMISSION_DIVISOR),
              )}
            </p>
            <div className="mining-table-wrap">
              <table className="mining-table">
                <thead>
                  <tr>
                    <th>{t("时间")}</th>
                    <th>{t("每块奖励")}</th>
                    <th>{t("当年发行")}</th>
                    <th>{t("累计已发行")}</th>
                  </tr>
                </thead>
                <tbody>
                  {outlook.map((row) => (
                    <tr key={row.years}>
                      <th scope="row">{row.years === 0 ? t("现在") : t("{0} 年后", row.years)}</th>
                      <td>{formatQtc(row.rewardQtc)}</td>
                      <td>{formatQtc(row.yearEmissionQtc)}</td>
                      <td>{formatQtc(row.issuedQtc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mining-note">
              {t("表中金额单位为 QTC，按当前出块速度外推；出块变快或变慢，时间会变，曲线的形状不会。")}{" "}
              {t("常量按主网 runtime {0}：上限 {1} QTC，发行除数 {2}。", RUNTIME_SPEC, formatInteger(MAX_SUPPLY_QTC), formatInteger(EMISSION_DIVISOR))}
            </p>
          </>
        ) : (
          <div className="mining-empty">
            <span>{data.loading ? t("正在读取发行量…") : t("需要链上发行量才能计算。读取失败时请刷新。")}</span>
          </div>
        )}
      </Fold>

      <Fold title={t("近 30 天")} meta={span || undefined} open>
        {daily?.length ? (
          <>
            <div className="chart-grid">
              <ChartBlock
                title={t("每天出块")}
                value={formatInteger(latest((row) => row.blocks) ?? 0)}
                meta={t("最近一天；索引器当天可能尚未统计完")}
              >
                <BarChart points={chart((row) => row.blocks, t("块"))} label={t("每天出块")} />
              </ChartBlock>
              <ChartBlock title={t("每天交易")} value={formatInteger(latest((row) => row.transactions) ?? 0)}>
                <Sparkline points={chart((row) => row.transactions, t("笔"))} label={t("每天交易")} />
              </ChartBlock>
              <ChartBlock title={t("活跃地址")} value={formatInteger(latest((row) => row.activeAccounts) ?? 0)}>
                <Sparkline points={chart((row) => row.activeAccounts, t("个"))} label={t("活跃地址")} />
              </ChartBlock>
            </div>
            <dl className="mining-stats">
              <Stat label={t("总地址数")} value={totals ? formatInteger(totals.totalAccounts) : "—"} />
              <Stat label={t("出过块的地址")} value={totals ? formatInteger(totals.totalMiners) : "—"} />
            </dl>
            {daily.length < 30 && (
              <p className="mining-note">{t("索引器目前只有 {0} 天的每日统计，图上就画多少天。", daily.length)}</p>
            )}
          </>
        ) : (
          <div className="mining-empty">
            <span>{data.loading ? t("正在读取每日统计…") : (data.errors.daily ?? t("索引器暂时没有每日统计。"))}</span>
          </div>
        )}
      </Fold>

      <Fold title={t("算力与难度")}>
        <dl className="mining-stats">
          <Stat label={t("当前难度")} value={chain ? formatCompact(chain.difficulty) : "—"} />
          <Stat
            label={t("上一块用时")}
            value={chain ? formatSeconds(chain.lastBlockDurationMs / 1000) : "—"}
          />
          <Stat
            label={t("近 24 小时出块")}
            value={data.blocks24h === null ? "—" : formatInteger(data.blocks24h)}
            hint={perDay === null ? undefined : t("按当前出块速度应为 {0} 块", formatInteger(perDay))}
          />
          <Stat
            label={t("按 24 小时反推算力")}
            value={hashrate24h === null ? "—" : formatHashrate(hashrate24h)}
            hint={
              hashrate === null || hashrate24h === null
                ? undefined
                : t("与头部采样相差 {0}", formatPercent(hashrate24h / hashrate - 1, 1))
            }
          />
        </dl>
        <p className="mining-note">
          {t("头部采样跟得快，24 小时反推更平稳，两者差得多说明算力刚变过。")}
        </p>
      </Fold>
    </section>
  );
}
