import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import { useT } from "../../lib/i18n";
import { errorText } from "../../lib/amount";
import { validateAddress } from "../../lib/chain";
import { fiatValue, formatUsd, useMarketPrice } from "../../lib/market";
import type { Wallet } from "../../lib/vault";
import { fetchChainStats, type ChainStats } from "../../lib/mining/data";
import { formatHashrate, formatInteger, formatPercent, formatQtc, trimNumber } from "../../lib/mining/format";
import { BUILT_IN_TERMS } from "../../lib/mining/gpus";
import { loadInputs, toModel } from "../../lib/mining/inputs";
import { deriveNetwork, estimate, planckToQtc, type Network } from "../../lib/mining/math";
import {
  TRANSFER_LIMIT,
  WINDOWS,
  WINDOW_DAYS,
  effectiveHashrate,
  fetchIncomingTransfers,
  fetchMinerRewards,
  fetchMinerTotals,
  groupByDay,
  groupSources,
  loadMinerPrefs,
  luckRatio,
  markPool,
  rememberAddress,
  saveMinerPrefs,
  splitRewardPayouts,
  windowTotals,
  type Entry,
  type MinerPrefs,
  type MinerTotals,
  type Payout,
  type Source,
} from "../../lib/mining/miner";
import { fetchBlocksSince } from "../../lib/network/data";
import { Fold, Stat } from "./MiningFields";
import { BarChart, ChartBlock, type Point } from "./Charts";

/**
 * The wallet App remembers which wallet is open under this key; the miner
 * page only reads it, to offer that address as the default.
 */
const SELECTED_KEY = "quantus-wallet-selected";
/** Sources shown before the list is cut off. */
const TOP_SOURCES = 5;

export type MinerState = {
  totals: MinerTotals | null;
  rewards: Entry[];
  transfers: Payout[];
  chain: ChainStats | null;
  /** Blocks the whole network produced over each of `WINDOWS`. */
  networkBlocks: (number | null)[];
  error: string | null;
  loading: boolean;
  /** The address these readings belong to; null before the first lookup. */
  address: string | null;
};

const EMPTY: MinerState = {
  totals: null,
  rewards: [],
  transfers: [],
  chain: null,
  networkBlocks: WINDOWS.map(() => null),
  error: null,
  loading: false,
  address: null,
};

/**
 * Everything the dashboard needs for one address. A failed read shows its
 * error and clears the figures rather than mixing two addresses' numbers.
 */
export function useMinerData(address: string | null): MinerState & { refresh: () => void } {
  const [state, setState] = useState<MinerState>(EMPTY);
  const running = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    running.current?.abort();
    if (typeof window === "undefined" || !address) {
      setState(EMPTY);
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    const signal = controller.signal;
    setState((prev) => ({ ...(prev.address === address ? prev : EMPTY), loading: true, error: null, address }));
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    void Promise.all([
      fetchMinerTotals(address, { signal }),
      fetchMinerRewards(address, since, { signal }),
      fetchIncomingTransfers(address, since, { signal }),
    ])
      .then(async ([totals, rewards, transfers]) => {
        // The chain state and the window counts only sharpen the picture, so
        // they are allowed to fail without taking the earnings down with them.
        const extras = await Promise.allSettled([
          fetchChainStats({ signal }),
          ...WINDOWS.map((hours) => fetchBlocksSince(new Date(Date.now() - hours * 3_600_000), { signal })),
        ]);
        if (signal.aborted) return;
        const [chain, ...counts] = extras;
        setState({
          totals,
          rewards,
          transfers,
          chain: chain.status === "fulfilled" ? (chain.value as ChainStats) : null,
          networkBlocks: counts.map((count) => (count.status === "fulfilled" ? (count.value as number) : null)),
          error: null,
          loading: false,
          address,
        });
      })
      .catch((cause) => {
        if (signal.aborted) return;
        setState({ ...EMPTY, error: errorText(cause), address });
      });
  }, [address]);

  useEffect(() => {
    refresh();
    return () => running.current?.abort();
  }, [refresh]);

  return { ...state, refresh };
}

/** The address of the wallet the user last had open, when it is still there. */
function defaultAddress(wallets: Wallet[]): string {
  if (!wallets.length) return "";
  try {
    const id = localStorage.getItem(SELECTED_KEY);
    const wallet = wallets.find((entry) => entry.id === id);
    if (wallet) return wallet.address;
  } catch {
    // Storage restrictions only cost us the convenience of a default.
  }
  return wallets[0].address;
}

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-6)}`;

/**
 * What one address earned from mining over the last 30 days: the totals, the
 * daily blocks, the hashrate those blocks imply, and who paid it. Each
 * figure is printed once — the headline owns the windows, the folds own the
 * detail behind them.
 */
export function MinerPage({ wallets, onBack }: { wallets: Wallet[]; onBack: () => void }) {
  const t = useT();
  const [prefs, setPrefs] = useState<MinerPrefs>(() => loadMinerPrefs());
  const [text, setText] = useState(() => prefs.recent[0] ?? defaultAddress(wallets));
  const [address, setAddress] = useState<string | null>(() => {
    try {
      return validateAddress(prefs.recent[0] ?? defaultAddress(wallets));
    } catch {
      return null;
    }
  });
  const [formError, setFormError] = useState("");
  const data = useMinerData(address);
  const market = useMarketPrice();
  const price = market?.last ?? null;

  const update = (next: MinerPrefs) => {
    setPrefs(next);
    saveMinerPrefs(next);
  };
  const look = (value: string) => {
    try {
      const canonical = validateAddress(value);
      setFormError("");
      setText(canonical);
      setAddress(canonical);
      update(rememberAddress(prefs, canonical));
    } catch (cause) {
      setFormError(errorText(cause));
      setAddress(null);
    }
  };

  const now = Date.now();
  const { payouts, rest } = useMemo(
    () => splitRewardPayouts(data.transfers, data.rewards),
    [data.transfers, data.rewards],
  );
  const mined = useMemo(() => windowTotals(data.rewards, now, WINDOWS), [data.rewards, now]);
  const days = useMemo(() => groupByDay(data.rewards, WINDOW_DAYS, now), [data.rewards, now]);
  const sources = useMemo(() => groupSources(rest), [rest]);
  const pools = useMemo(
    () => sources.filter((source) => prefs.pools[source.address] !== undefined),
    [sources, prefs.pools],
  );

  // Only the hashrate and the block rate are read off this, never an amount,
  // so the reward the page never prints is left at zero.
  const network: Network | null = data.chain
    ? { difficulty: data.chain.difficulty, blockTimeSeconds: data.chain.blockTimeSeconds, blockRewardPlanck: 0n }
    : null;
  const networkHashrate = network ? deriveNetwork(network).hashrate : 0;
  const effective = mined.map((span, index) =>
    effectiveHashrate(span.count, data.networkBlocks[index] ?? 0, networkHashrate),
  );

  // The calculator's own inputs, when the reader has used it: what they said
  // the rig should do, next to what it did.
  const expected = useMemo(() => {
    if (!network || typeof window === "undefined") return null;
    const model = toModel(loadInputs(BUILT_IN_TERMS), BUILT_IN_TERMS, null);
    if (!model.ready) return null;
    const result = estimate(network, model.devices, model.assumptions, model.costs);
    return { hashrate: result.total.hashrate, blocksPerDay: result.total.soloBlocksPerDay };
  }, [network]);

  const windowLabel = (hours: number) => (hours <= 24 ? t("近 24 小时") : t("近 {0} 天", hours / 24));
  const usd = (planck: bigint) => (price === null ? null : formatUsd(fiatValue(planck, price)));
  const qtcText = (planck: bigint) => formatQtc(planckToQtc(planck));
  const waiting = data.loading ? t("正在读取…") : t("尚未读取");
  const hasIncome = data.rewards.length > 0 || rest.length > 0;

  const metrics = [
    ...mined.map((span) => {
      const dollars = usd(span.planck);
      const blocks = t("{0} 块", formatInteger(span.count));
      return {
        key: `w${span.hours}`,
        label: windowLabel(span.hours),
        value: data.address ? qtcText(span.planck) : "—",
        unit: "QTC" as string | undefined,
        hint: data.address ? (dollars ? `${blocks} · ≈ ${dollars}` : blocks) : waiting,
      };
    }),
    {
      key: "lifetime",
      label: t("累计出块"),
      value: data.totals ? formatInteger(data.totals.minedBlocks) : data.address ? "0" : "—",
      unit: undefined,
      hint: data.totals
        ? t("共 {0} QTC", qtcText(data.totals.rewardPlanck))
        : data.address
          ? t("索引器没有这个地址的记录")
          : waiting,
    },
  ];

  const dayPoints = (buckets: { date: string; count: number; planck: bigint }[], unit: string): Point[] =>
    buckets.map((bucket) => ({
      key: bucket.date,
      value: bucket.count,
      title: `${bucket.date} · ${formatInteger(bucket.count)} ${unit} · ${qtcText(bucket.planck)} QTC`,
    }));

  return (
    <section className="settings-page tools-page miner-page" aria-label={t("矿工看板")}>
      <header className="page-heading tools-heading">
        <button type="button" className="circle-button" aria-label={t("返回")} onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <h1>{t("矿工看板")}</h1>
        <button
          type="button"
          className="circle-button subtle network-refresh"
          aria-label={t("刷新矿工数据")}
          onClick={data.refresh}
          disabled={data.loading || !address}
        >
          <RefreshCw size={16} className={data.loading ? "spin" : undefined} aria-hidden="true" />
        </button>
      </header>

      <form
        className="miner-form"
        onSubmit={(event) => {
          event.preventDefault();
          look(text);
        }}
      >
        <label className="field">
          {t("矿工地址")}
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={text}
            placeholder={t("粘贴一个 qz 开头的地址")}
            onChange={(event) => {
              setText(event.target.value);
              setFormError("");
            }}
          />
        </label>
        <button type="submit" className="button primary" disabled={!text.trim()}>
          <Search size={17} aria-hidden="true" />
          {t("查询")}
        </button>
      </form>
      {formError && <p className="error mining-error">{formError}</p>}
      {prefs.recent.length > 1 && (
        <div className="miner-recent" aria-label={t("最近查过的地址")}>
          {prefs.recent.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-current={entry === address}
              onClick={() => look(entry)}
            >
              {short(entry)}
            </button>
          ))}
        </div>
      )}

      {data.error && <p className="error mining-error">{t("矿工数据读取失败：{0}", data.error)}</p>}

      <div className="mining-summary">
        <section className="mining-summary-card" aria-label={t("挖矿收入")}>
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
            {t("只读公开索引器和节点，按你的浏览器本地日期分组；近 {0} 天之外的记录不在这里。", WINDOW_DAYS)}
          </p>
        </section>
      </div>

      {data.address && !data.loading && !data.error && !hasIncome && (
        <div className="mining-card mining-empty">
          <span>{t("这个地址近 {0} 天没有挖矿收入。", WINDOW_DAYS)}</span>
        </div>
      )}
      {data.address && !data.loading && !data.error && data.rewards.length === 0 && rest.length > 0 && (
        <div className="mining-card mining-empty">
          <span>{t("这个地址近 {0} 天没有自己出块，下面只有转入记录。", WINDOW_DAYS)}</span>
        </div>
      )}

      {data.rewards.length > 0 && (
        <Fold title={t("每天出块")} open>
          <ChartBlock
            title={t("今天到现在")}
            value={t("{0} 块", formatInteger(days[days.length - 1]?.count ?? 0))}
            meta={t("每根柱子是一天，最左边是 {0} 天前", WINDOW_DAYS)}
          >
            <BarChart points={dayPoints(days, t("块"))} label={t("每天出块")} />
          </ChartBlock>
        </Fold>
      )}

      {data.rewards.length > 0 && (
        <Fold title={t("实际算力")} open>
          <dl className="mining-stats miner-windows">
            {mined.map((span, index) => (
              <Stat
                key={span.hours}
                label={windowLabel(span.hours)}
                value={effective[index] === null ? "—" : formatHashrate(effective[index] as number)}
                hint={
                  data.networkBlocks[index] === null
                    ? t("等待全网出块数")
                    : t("{0} / {1} 块", formatInteger(span.count), formatInteger(data.networkBlocks[index] as number))
                }
              />
            ))}
          </dl>
          <p className="mining-note">
            {t("有效算力 = 你的出块数 ÷ 同期全网出块数 × 全网算力。窗口越短，运气的影响越大。")}
          </p>
          {expected && (
            <>
              <dl className="mining-stats">
                <Stat
                  label={t("计算器里的算力")}
                  value={formatHashrate(expected.hashrate)}
                  hint={t("按 {0} 天应出 {1} 块", WINDOW_DAYS, trimNumber(expected.blocksPerDay * WINDOW_DAYS, 1))}
                />
                <Stat
                  label={t("实际 / 期望")}
                  value={(() => {
                    const luck = luckRatio(mined[mined.length - 1].count, expected.blocksPerDay * WINDOW_DAYS);
                    // Past a few times over, "1,500%" stops being readable as a
                    // ratio; the same number reads better as "15 times".
                    if (luck === null) return "—";
                    return luck >= 10 ? t("{0} 倍", trimNumber(luck, 0)) : formatPercent(luck, 0);
                  })()}
                  hint={t("高于 100% 是运气好，低于说明算力或在线率没到")}
                />
              </dl>
              <p className="mining-note">{t("期望值来自你在挖矿计算里填的输入，只保存在本机。")}</p>
            </>
          )}
        </Fold>
      )}

      {sources.length > 0 && (
        <Fold title={t("转入来源")} meta={t("{0} 个地址", formatInteger(sources.length))} open>
          <div className="miner-sources">
            {sources.slice(0, TOP_SOURCES).map((source) => (
              <div key={source.address} className="miner-source">
                <span className="miner-source-copy">
                  <strong>{prefs.pools[source.address] ?? short(source.address)}</strong>
                  <small>
                    {prefs.pools[source.address] ? `${short(source.address)} · ` : ""}
                    {t("{0} 笔 · 最近 {1}", formatInteger(source.count), new Date(source.latest).toLocaleDateString())}
                  </small>
                </span>
                <span className="miner-source-amount">
                  {qtcText(source.planck)} QTC
                  {usd(source.planck) && <small>{t("≈ {0}", usd(source.planck) as string)}</small>}
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    update(
                      markPool(
                        prefs,
                        source.address,
                        prefs.pools[source.address] === undefined ? t("矿池 {0}", short(source.address)) : null,
                      ),
                    )
                  }
                >
                  {prefs.pools[source.address] === undefined ? t("标记为矿池") : t("取消标记")}
                </button>
              </div>
            ))}
          </div>
          {(sources.length > TOP_SOURCES || data.transfers.length >= TRANSFER_LIMIT) && (
            <p className="mining-note">
              {sources.length > TOP_SOURCES && t("只列出金额最大的 {0} 个来源。", TOP_SOURCES)}
              {data.transfers.length >= TRANSFER_LIMIT && (
                <>{" " + t("转入很多，只统计了最近 {0} 笔。", formatInteger(TRANSFER_LIMIT))}</>
              )}
            </p>
          )}
          <p className="mining-note">
            {t("标记为矿池后，该来源会单独统计一张收益卡片。标记只保存在本机。")}
            {payouts.length > 0 && (
              <>
                {" "}
                {t("链上把区块奖励也记成转账，这里已经把这 {0} 笔挖矿到账去掉了。", formatInteger(payouts.length))}
              </>
            )}
          </p>
        </Fold>
      )}

      {pools.map((pool) => (
        <PoolCard key={pool.address} pool={pool} label={prefs.pools[pool.address]} transfers={rest} price={price} now={now} />
      ))}
    </section>
  );
}

/** One marked sender's payments: the same daily bars and windows, for that sender alone. */
function PoolCard({
  pool,
  label,
  transfers,
  price,
  now,
}: {
  pool: Source;
  label: string;
  transfers: Payout[];
  price: number | null;
  now: number;
}) {
  const t = useT();
  const own = useMemo(() => transfers.filter((row) => row.from === pool.address), [transfers, pool.address]);
  const days = useMemo(() => groupByDay(own, WINDOW_DAYS, now), [own, now]);
  const windows = useMemo(() => windowTotals(own, now, WINDOWS), [own, now]);
  const qtcText = (planck: bigint) => formatQtc(planckToQtc(planck));
  return (
    <Fold title={label} meta={t("{0} 笔", formatInteger(pool.count))} open>
      <ChartBlock
        title={t("今天到现在")}
        value={`${qtcText(days[days.length - 1]?.planck ?? 0n)} QTC`}
        meta={t("每根柱子是一天，最左边是 {0} 天前", WINDOW_DAYS)}
      >
        <BarChart
          points={days.map((day) => ({
            key: day.date,
            value: Number(day.planck) / 1e12,
            title: `${day.date} · ${qtcText(day.planck)} QTC · ${formatInteger(day.count)}`,
          }))}
          label={label}
        />
      </ChartBlock>
      <dl className="mining-stats miner-windows">
        {windows.map((span) => (
          <Stat
            key={span.hours}
            label={span.hours <= 24 ? t("近 24 小时") : t("近 {0} 天", span.hours / 24)}
            value={`${qtcText(span.planck)} QTC`}
            hint={
              price === null
                ? t("{0} 笔", formatInteger(span.count))
                : t("{0} 笔 · ≈ {1}", formatInteger(span.count), formatUsd(fiatValue(span.planck, price)))
            }
          />
        ))}
      </dl>
    </Fold>
  );
}
