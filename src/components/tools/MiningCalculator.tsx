import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useT } from "../../lib/i18n";
import { errorText } from "../../lib/amount";
import { Select } from "../Select";
import {
  BUILT_IN_TERMS,
  fetchBlockReward,
  fetchChainStats,
  fetchPoolStats,
  fetchPoolTerms,
  type ChainStats,
  type PoolStats,
  type RewardStats,
} from "../../lib/mining/data";
import type { PoolTerms } from "../../lib/mining/gpus";
import { SNAPSHOT_DATE } from "../../lib/mining/gpus";
import { formatCompact, formatHashrate, formatInteger, formatQtc, formatSeconds } from "../../lib/mining/format";
import { planckToQtc, type Network } from "../../lib/mining/math";
import {
  benchmark,
  CUSTOM_GPU,
  deviceFromGpu,
  hashrateText,
  loadInputs,
  minerFeeFor,
  saveInputs,
  toModel,
  type DeviceInput,
  type HashrateUnit,
  type MiningInputs,
  type Software,
} from "../../lib/mining/inputs";
import { MiningResults } from "./MiningResults";

const REFRESH_MS = 60_000;
const STALE_MS = 5 * 60_000;
/** The indexer occasionally answers without CORS headers; a couple of quick retries cover that. */
const RETRY_MS = 4_000;
const MAX_RETRIES = 2;

type DataState = {
  chain: ChainStats | null;
  reward: RewardStats | null;
  pool: PoolStats | null;
  terms: PoolTerms;
  errors: { chain?: string; reward?: string; terms?: string };
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
function useMiningData(): DataState & { refresh: () => void } {
  const [state, setState] = useState<DataState>({
    chain: null,
    reward: null,
    pool: null,
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
    ]).then(([chain, reward, terms, pool]) => {
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
        errors: {
          chain: chain.status === "rejected" ? errorText(chain.reason) : undefined,
          reward: reward.status === "rejected" ? errorText(reward.reason) : undefined,
          terms: terms.status === "rejected" ? errorText(terms.reason) : undefined,
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

function Segmented<V extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: V;
  options: { value: V; label: ReactNode }[];
  onChange: (value: V) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`segmented ${className}`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  hint,
  placeholder,
  disabled,
  id,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  suffix?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  // The suffix may hold its own control (a unit switch), so it sits outside
  // the label: the input's accessible name stays the label text alone.
  return (
    <div className="field mining-field">
      <label htmlFor={inputId}>{label}</label>
      <span className="mining-input">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && <span className="mining-input-suffix">{suffix}</span>}
      </span>
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}

const UNIT_OPTIONS: { value: HashrateUnit; label: string }[] = [
  { value: "MH", label: "MH/s" },
  { value: "GH", label: "GH/s" },
];

function DeviceRow({
  row,
  index,
  terms,
  removable,
  onChange,
  onRemove,
}: {
  row: DeviceInput;
  index: number;
  terms: PoolTerms;
  removable: boolean;
  onChange: (patch: Partial<DeviceInput>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const gpu = terms.gpus.find((item) => item.id === row.gpu);
  const options = [
    ...terms.gpus.map((item) => ({
      value: item.id,
      label: item.short,
      description: `${formatHashrate(item.ours)} · ${formatHashrate(item.stock)}`,
    })),
    { value: CUSTOM_GPU, label: t("自定义"), description: t("自行填写算力和功耗") },
  ];
  const chooseGpu = (id: string) => {
    const next = terms.gpus.find((item) => item.id === id);
    if (!next) {
      onChange({ gpu: CUSTOM_GPU });
      return;
    }
    const filled = deviceFromGpu(next, row.software, terms, row.quantity);
    onChange({ gpu: next.id, hashrate: filled.hashrate, unit: filled.unit, powerW: filled.powerW, minerFee: filled.minerFee });
  };
  const chooseSoftware = (software: Software) => {
    const patch: Partial<DeviceInput> = { software, minerFee: minerFeeFor(software, terms) };
    if (gpu) Object.assign(patch, hashrateText(benchmark(gpu, software)));
    onChange(patch);
  };
  return (
    <div className="mining-device">
      <div className="mining-device-head">
        <strong>{t("显卡 {0}", index + 1)}</strong>
        {removable && (
          <button type="button" className="text-button" onClick={onRemove}>
            <Trash2 size={15} aria-hidden="true" />
            {t("移除")}
          </button>
        )}
      </div>
      <div className="mining-fields split">
        <label className="field mining-field">
          <span>{t("型号")}</span>
          <Select value={row.gpu} options={options} onChange={chooseGpu} aria-label={t("型号")} />
        </label>
        <NumberField label={t("数量")} value={row.quantity} onChange={(quantity) => onChange({ quantity })} placeholder="1" />
      </div>
      <div className="field mining-field">
        <span>{t("矿工软件")}</span>
        <Segmented
          className="mining-segmented"
          label={t("矿工软件")}
          value={row.software}
          onChange={chooseSoftware}
          options={[
            { value: "pool", label: t("矿池矿工") },
            { value: "stock", label: t("官方矿工") },
          ]}
        />
        <small>
          {row.software === "pool"
            ? t("矿池自带矿工，算力更高，内置 {0}% 开发者费。", terms.minerDevFeePercent)
            : t("官方 quantus-miner，无内置费用。")}
        </small>
      </div>
      <div className="mining-fields">
        <NumberField
          label={t("单卡算力")}
          value={row.hashrate}
          onChange={(hashrate) => onChange({ hashrate })}
          placeholder="0"
          suffix={
            <Segmented
              label={t("算力单位")}
              value={row.unit}
              onChange={(unit) => onChange({ unit })}
              options={UNIT_OPTIONS}
            />
          }
          hint={gpu ? t("基准：{0}（{1}）", formatHashrate(benchmark(gpu, row.software)), row.software === "pool" ? t("矿池矿工") : t("官方矿工")) : undefined}
        />
        <NumberField
          label={t("单卡功耗")}
          value={row.powerW}
          onChange={(powerW) => onChange({ powerW })}
          placeholder="—"
          suffix="W"
          hint={gpu?.powerW !== null && gpu?.powerW !== undefined ? t("典型值 {0} W，可修改", gpu.powerW) : t("整机满载功耗，用于电费")}
        />
      </div>
      <NumberField
        label={t("矿工软件费")}
        value={row.minerFee}
        onChange={(minerFee) => onChange({ minerFee })}
        placeholder="0"
        suffix="%"
        hint={t("按软件自动填写，可修改")}
      />
    </div>
  );
}

function updateAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

/** Mining calculator: expected yield, costs, break-even price and payback for a GPU setup. */
export function MiningCalculator({ onBack }: { onBack: () => void }) {
  const t = useT();
  const data = useMiningData();
  const { terms } = data;
  const [inputs, setInputs] = useState<MiningInputs>(() => loadInputs(BUILT_IN_TERMS));
  useEffect(() => saveInputs(inputs), [inputs]);
  const update = (patch: Partial<MiningInputs>) => setInputs((prev) => ({ ...prev, ...patch }));

  const network: Network | null = useMemo(
    () =>
      data.chain && data.reward
        ? {
            difficulty: data.chain.difficulty,
            blockTimeSeconds: data.chain.blockTimeSeconds,
            blockRewardPlanck: data.reward.blockRewardPlanck,
          }
        : null,
    [data.chain, data.reward],
  );
  const model = useMemo(() => toModel(inputs, terms), [inputs, terms]);
  const networkHashrate = network ? Number(network.difficulty) / network.blockTimeSeconds : 0;
  const blocksPerDay = network ? 86_400 / network.blockTimeSeconds : 0;
  const lastGood = Math.max(data.chain?.fetchedAt ?? 0, data.reward?.fetchedAt ?? 0);
  const stale = lastGood > 0 && data.checkedAt !== null && data.checkedAt - lastGood > STALE_MS;
  const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const poolFeeValue = inputs.poolFee ?? String(terms.poolFeePercent);

  return (
    <section className="settings-page tools-page mining-page" aria-label={t("挖矿计算")}>
      <header className="page-heading tools-heading">
        <button type="button" className="circle-button" aria-label={t("返回")} onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <h1>{t("挖矿计算")}</h1>
      </header>
      <p className="flow-note mining-intro">
        {t("按显卡算力估算 QTC 产量、电费与其他成本、利润、保本价和回本周期。全网数据来自链上和索引器，显卡基准来自 Quanpool 公开接口；QTC 尚未上市，价格由你填写。")}
      </p>

      <div className="mining-grid">
        <div className="mining-column">
          <section className="settings-group" aria-label={t("网络状态")}>
            <h2>{t("网络状态")}</h2>
            <div className="mining-card">
              <div className="mining-card-head">
                <span className="mining-updated">
                  {lastGood > 0 ? t("更新于 {0}", time(lastGood)) : data.loading ? t("正在读取…") : t("尚未读取")}
                </span>
                <button
                  type="button"
                  className="circle-button"
                  aria-label={t("刷新网络数据")}
                  onClick={data.refresh}
                  disabled={data.loading}
                >
                  <RefreshCw size={17} className={data.loading ? "spin" : undefined} aria-hidden="true" />
                </button>
              </div>
              <dl className="mining-stats">
                <div>
                  <dt>{t("难度")}</dt>
                  <dd>{data.chain ? formatCompact(data.chain.difficulty) : "—"}</dd>
                </div>
                <div>
                  <dt>{t("出块时间（近 {0} 块均值）", data.chain?.sampledBlocks ?? 200)}</dt>
                  <dd>
                    {data.chain ? formatSeconds(data.chain.blockTimeSeconds) : "—"}
                    {data.chain && <small>{t("上一块 {0}", formatSeconds(data.chain.lastBlockDurationMs / 1000))}</small>}
                  </dd>
                </div>
                <div>
                  <dt>{t("全网算力（推算）")}</dt>
                  <dd>{network ? formatHashrate(networkHashrate) : "—"}</dd>
                </div>
                <div>
                  <dt>{t("区块奖励（近 {0} 块均值）", data.reward?.samples ?? 50)}</dt>
                  <dd>{data.reward ? `${formatQtc(planckToQtc(data.reward.blockRewardPlanck))} QTC` : "—"}</dd>
                </div>
                <div>
                  <dt>{t("每日出块")}</dt>
                  <dd>{network ? formatInteger(blocksPerDay) : "—"}</dd>
                </div>
                <div>
                  <dt>{t("区块高度")}</dt>
                  <dd>{data.chain ? formatInteger(data.chain.height) : "—"}</dd>
                </div>
              </dl>
              <p className="mining-note">
                {t("全网算力 = 难度 ÷ 实测出块时间，不是任何矿池上报的数字。")}
                {data.pool && network && (
                  <>
                    {" "}
                    {t("Quanpool 自报算力 {0}（约占 {1}），量级相符。", formatHashrate(data.pool.poolHashrate), `${Math.round((data.pool.poolHashrate / networkHashrate) * 100)}%`)}
                  </>
                )}
              </p>
              {stale && (
                <div className="callout warm mining-callout">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <div>
                    <p>{t("数据已超过 5 分钟未更新，估算基于上次成功读取的状态。")}</p>
                  </div>
                </div>
              )}
              {data.errors.chain && <p className="error">{t("链上数据读取失败：{0}", data.errors.chain)}</p>}
              {data.errors.reward && <p className="error">{t("区块奖励读取失败：{0}", data.errors.reward)}</p>}
              {data.errors.terms && (
                <p className="error">{t("矿池基准读取失败，使用 {0} 的内置快照：{1}", SNAPSHOT_DATE, data.errors.terms)}</p>
              )}
            </div>
          </section>

          <section className="settings-group" aria-label={t("设备")}>
            <h2>{t("设备")}</h2>
            <div className="mining-card">
              <Segmented
                className="mining-segmented"
                label={t("输入方式")}
                value={inputs.mode}
                onChange={(mode) => update({ mode })}
                options={[
                  { value: "devices", label: t("按显卡") },
                  { value: "total", label: t("总算力") },
                ]}
              />
              {inputs.mode === "devices" ? (
                <>
                  {inputs.devices.map((row, index) => (
                    <DeviceRow
                      key={row.key}
                      row={row}
                      index={index}
                      terms={terms}
                      removable={inputs.devices.length > 1}
                      onChange={(patch) => update({ devices: updateAt(inputs.devices, index, patch) })}
                      onRemove={() => update({ devices: inputs.devices.filter((_, i) => i !== index) })}
                    />
                  ))}
                  <button
                    type="button"
                    className="text-button mining-add"
                    disabled={inputs.devices.length >= 20}
                    onClick={() => {
                      const last = inputs.devices[inputs.devices.length - 1];
                      const gpu = terms.gpus.find((item) => item.id === last?.gpu) ?? terms.gpus[0];
                      update({ devices: [...inputs.devices, deviceFromGpu(gpu, last?.software ?? "pool", terms)] });
                    }}
                  >
                    <Plus size={15} aria-hidden="true" />
                    {t("添加显卡")}
                  </button>
                  <p className="mining-note">
                    {t("基准算力来自 Quanpool 公开接口（{0}），功耗为典型满载值，均可修改。", terms.source === "live" ? t("实时") : t("{0} 快照", SNAPSHOT_DATE))}
                  </p>
                </>
              ) : (
                <>
                  <NumberField
                    label={t("总算力")}
                    value={inputs.total.hashrate}
                    onChange={(hashrate) => update({ total: { ...inputs.total, hashrate } })}
                    placeholder="0"
                    suffix={
                      <Segmented
                        label={t("算力单位")}
                        value={inputs.total.unit}
                        onChange={(unit) => update({ total: { ...inputs.total, unit } })}
                        options={UNIT_OPTIONS}
                      />
                    }
                    hint={t("矿池页面显示的算力，或你自己统计的总算力。")}
                  />
                  <div className="field mining-field">
                    <span>{t("矿工软件")}</span>
                    <Segmented
                      className="mining-segmented"
                      label={t("矿工软件")}
                      value={inputs.total.software}
                      onChange={(software) => update({ total: { ...inputs.total, software, minerFee: minerFeeFor(software, terms) } })}
                      options={[
                        { value: "pool", label: t("矿池矿工") },
                        { value: "stock", label: t("官方矿工") },
                      ]}
                    />
                  </div>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={inputs.total.netOfMinerFee}
                      onChange={(event) => update({ total: { ...inputs.total, netOfMinerFee: event.target.checked } })}
                    />
                    <span>{t("这个算力已经扣除了矿工软件费（矿池显示的通常是扣除后的数字）")}</span>
                  </label>
                  <div className="mining-fields">
                    <NumberField
                      label={t("矿工软件费")}
                      value={inputs.total.minerFee}
                      onChange={(minerFee) => update({ total: { ...inputs.total, minerFee } })}
                      placeholder="0"
                      suffix="%"
                      disabled={inputs.total.netOfMinerFee}
                    />
                    <NumberField
                      label={t("总功耗")}
                      value={inputs.total.powerW}
                      onChange={(powerW) => update({ total: { ...inputs.total, powerW } })}
                      placeholder="—"
                      suffix="W"
                      hint={t("可选，用于电费")}
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="settings-group" aria-label={t("费率与在线率")}>
            <h2>{t("费率与在线率")}</h2>
            <div className="mining-card">
              <div className="mining-fields">
                <NumberField
                  label={t("在线率")}
                  value={inputs.uptime}
                  onChange={(uptime) => update({ uptime })}
                  placeholder="100"
                  suffix="%"
                  hint={t("实际开机挖矿的时间占比，产量和电费同比例减少")}
                />
                <NumberField
                  label={t("矿池费率")}
                  value={poolFeeValue}
                  onChange={(poolFee) => update({ poolFee })}
                  placeholder="1"
                  suffix="%"
                  hint={
                    inputs.poolFee === null ? (
                      t("Quanpool 公布值 {0}%", terms.poolFeePercent)
                    ) : (
                      <button type="button" className="text-button mining-inline-button" onClick={() => update({ poolFee: null })}>
                        {t("恢复为矿池公布值 {0}%", terms.poolFeePercent)}
                      </button>
                    )
                  }
                />
              </div>
            </div>
          </section>

          <section className="settings-group" aria-label={t("成本")}>
            <h2>{t("成本")}</h2>
            <div className="mining-card">
              <Segmented
                className="mining-segmented"
                label={t("成本方式")}
                value={inputs.costMode}
                onChange={(costMode) => update({ costMode })}
                options={[
                  { value: "electricity", label: t("自有设备付电费") },
                  { value: "rental", label: t("整机租用") },
                ]}
              />
              <div className="mining-fields">
                {inputs.costMode === "electricity" ? (
                  <NumberField
                    label={t("电价")}
                    value={inputs.electricity}
                    onChange={(electricity) => update({ electricity })}
                    placeholder="0.10"
                    suffix={`${inputs.currency || "—"}/kWh`}
                  />
                ) : (
                  <NumberField
                    label={t("租金（全部设备，含电费）")}
                    value={inputs.rent}
                    onChange={(rent) => update({ rent })}
                    placeholder="0"
                    suffix={
                      <Segmented
                        label={t("租金周期")}
                        value={inputs.rentPer}
                        onChange={(rentPer) => update({ rentPer })}
                        options={[
                          { value: "day", label: t("每天") },
                          { value: "hour", label: t("每小时") },
                        ]}
                      />
                    }
                  />
                )}
                <label className="field mining-field">
                  <span>{t("货币")}</span>
                  <input
                    type="text"
                    autoComplete="off"
                    maxLength={12}
                    value={inputs.currency}
                    placeholder="USD"
                    onChange={(event) => update({ currency: event.target.value })}
                  />
                  <small>{t("只是标签，所有金额按同一货币")}</small>
                </label>
              </div>
              {inputs.costMode === "electricity" && (
                <div className="mining-fields">
                  <NumberField
                    label={t("设备成本（可选）")}
                    value={inputs.hardwareCost}
                    onChange={(hardwareCost) => update({ hardwareCost })}
                    placeholder="0"
                    suffix={inputs.currency || undefined}
                    hint={t("全部设备的购置价，用于折旧和回本")}
                  />
                  <NumberField
                    label={t("折旧天数")}
                    value={inputs.amortiseDays}
                    onChange={(amortiseDays) => update({ amortiseDays })}
                    placeholder="365"
                    suffix={t("天")}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="settings-group" aria-label={t("QTC 价格")}>
            <h2>{t("QTC 价格")}</h2>
            <div className="mining-card">
              <NumberField
                label={t("假设价格")}
                value={inputs.price}
                onChange={(price) => update({ price })}
                placeholder="0"
                suffix={`${inputs.currency || "—"}/QTC`}
                hint={t("QTC 尚未在交易所上市，没有市场价。这里填你自己的假设，收入和利润都按它计算；保本价不依赖它。")}
              />
            </div>
          </section>
        </div>

        <div className="mining-column">
          <MiningResults network={network} model={model} terms={terms} pool={data.pool} loading={data.loading && !network} />
        </div>
      </div>
    </section>
  );
}
