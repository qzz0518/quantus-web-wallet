import { useMemo, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { useT } from "../../lib/i18n";
import type { PoolStats } from "../../lib/mining/data";
import type { Gpu, PoolTerms } from "../../lib/mining/gpus";
import { formatFiat, formatHashrate, formatPercent, formatQtc, trimNumber } from "../../lib/mining/format";
import type { Model, Software } from "../../lib/mining/inputs";
import {
  DAYS_PER_MONTH,
  deriveNetwork,
  estimate,
  estimateDevice,
  luckDeviation,
  mulPlanck,
  planckToQtc,
  scaleNetwork,
  type Estimate,
  type Network,
  type Yield,
} from "../../lib/mining/math";

const PERIODS: { key: string; factor: number }[] = [
  { key: "每小时", factor: 1 / 24 },
  { key: "每天", factor: 1 },
  { key: "每周", factor: 7 },
  { key: "30 天", factor: DAYS_PER_MONTH },
];
const SENSITIVITY = [1, 1.5, 2];

type Props = {
  network: Network | null;
  model: Model;
  terms: PoolTerms;
  pool: PoolStats | null;
  loading: boolean;
};

/** Results side of the calculator: totals, per-device rows, sensitivity, GPU comparison and method. */
export function MiningResults({ network, model, terms, pool, loading }: Props) {
  const t = useT();
  const [compareSoftware, setCompareSoftware] = useState<Software>("pool");
  const { devices, assumptions, costs, currency } = model;
  const priced = assumptions.price > 0;
  const fiat = (value: number | null) => (value === null ? "—" : formatFiat(value, currency));
  /** Table cells carry no unit; the column header or the note under the table names the currency. */
  const bare = (value: number | null) => (value === null ? "—" : formatFiat(value, ""));
  const fiatIfPriced = (value: number | null) => (priced ? bare(value) : "—");
  const withCurrency = (label: string) => (currency ? `${label} (${currency})` : label);
  const currencyNote = currency ? t("金额单位：{0}。", currency) + " " : "";

  const result = useMemo(() => (network ? estimate(network, devices, assumptions, costs) : null), [network, devices, assumptions, costs]);
  const sensitivity = useMemo(
    () =>
      network
        ? SENSITIVITY.map((factor) => ({ factor, result: estimate(scaleNetwork(network, factor), devices, assumptions, costs) }))
        : [],
    [network, devices, assumptions, costs],
  );
  const comparison = useMemo(() => {
    if (!network) return [];
    const derived = deriveNetwork(network);
    const rows = terms.gpus.map((gpu) => ({
      gpu,
      row: estimateDevice(
        derived,
        {
          id: gpu.id,
          label: gpu.short,
          hashrate: compareSoftware === "pool" ? gpu.ours : gpu.stock,
          quantity: 1,
          powerW: gpu.powerW,
          minerFeePercent: compareSoftware === "pool" ? terms.minerDevFeePercent : 0,
        },
        assumptions,
        costs.mode === "electricity" ? { mode: "electricity", pricePerKwh: costs.pricePerKwh, hardwareCost: 0, amortiseDays: 0 } : { mode: "rental", rentPerDay: 0 },
      ),
    }));
    const score = (row: Yield) => (priced && row.profitPerDay !== null ? row.profitPerDay : row.qtcPerDay);
    return rows.sort((a, b) => score(b.row) - score(a.row));
  }, [network, terms, compareSoftware, assumptions, costs, priced]);

  if (!network || !model.ready || !result) {
    return (
      <>
        <section className="settings-group" aria-label={t("估算结果")}>
          <h2>{t("估算结果")}</h2>
          <div className="mining-card mining-empty">
            {!network && loading ? (
              <>
                <LoaderCircle size={18} className="spin" aria-hidden="true" />
                <span>{t("正在读取网络状态…")}</span>
              </>
            ) : !network ? (
              <span>{t("需要链上难度和区块奖励才能估算。读取失败时请刷新网络数据。")}</span>
            ) : (
              <span>{t("填写显卡算力或总算力后显示估算。")}</span>
            )}
          </div>
        </section>
        <Method />
      </>
    );
  }

  const { total } = result;
  const derived = result.network;
  const cashUnknown = total.runningCostPerDay === null;
  const rentMode = costs.mode === "rental";
  const hardware = costs.mode === "electricity" && costs.hardwareCost > 0;
  const payback = (days: number | null): string => {
    if (days === null) return "—";
    if (!Number.isFinite(days)) return t("无法回本");
    if (days >= 365) return t("{0} 年", trimNumber(days / 365, 1));
    return t("{0} 天", trimNumber(days, 0));
  };
  const soloInterval = total.soloBlocksPerDay > 0 ? 1 / total.soloBlocksPerDay : null;
  const poolBlocksPerDay = pool ? Math.min(derived.blocksPerDay, (pool.poolHashrate / derived.hashrate) * derived.blocksPerDay) : null;
  const luckDay = poolBlocksPerDay !== null ? luckDeviation(poolBlocksPerDay) : null;
  const luckWeek = poolBlocksPerDay !== null ? luckDeviation(poolBlocksPerDay * 7) : null;

  return (
    <>
      <section className="settings-group" aria-label={t("估算结果")}>
        <h2>{t("估算结果")}</h2>
        <div className="mining-card">
          <div className="mining-hero">
            <span>{t("期望产量")}</span>
            <strong>
              {formatQtc(total.qtcPerDay)} <em>{t("QTC / 天")}</em>
            </strong>
            <small>
              {priced
                ? t("≈ {0} / 天，按你填写的价格", fiat(total.revenuePerDay))
                : t("填写 QTC 价格后显示收入和利润")}
            </small>
          </div>
          <div className="mining-table-wrap">
            <table className="mining-table">
              <thead>
                <tr>
                  <th>{t("周期")}</th>
                  <th>QTC</th>
                  <th>{withCurrency(t("收入"))}</th>
                  <th>{withCurrency(t("利润"))}</th>
                </tr>
              </thead>
              <tbody>
                {PERIODS.map(({ key, factor }) => (
                  <tr key={key}>
                    <th scope="row">{t(key)}</th>
                    <td>{formatQtc(planckToQtc(mulPlanck(total.planckPerDay, factor)))}</td>
                    <td>{fiatIfPriced(total.revenuePerDay * factor)}</td>
                    <td className={priced && total.profitPerDay !== null ? (total.profitPerDay >= 0 ? "positive" : "negative") : undefined}>
                      {priced && total.profitPerDay !== null ? bare(total.profitPerDay * factor) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mining-stats">
            <Stat label={t("总算力")} value={formatHashrate(total.hashrate)} />
            <Stat label={t("全网占比")} value={formatPercent(total.share, 3)} />
            <Stat
              label={rentMode ? t("保本价（租金）") : t("保本价（电费）")}
              value={total.breakEvenPrice === null ? "—" : `${fiat(total.breakEvenPrice)}/QTC`}
              highlight
              hint={cashUnknown ? t("填写功耗后显示") : undefined}
            />
            {hardware && (
              <Stat
                label={t("保本价（含折旧）")}
                value={total.breakEvenPriceWithHardware === null ? "—" : `${fiat(total.breakEvenPriceWithHardware)}/QTC`}
                highlight
              />
            )}
            {rentMode ? (
              <Stat label={t("租金 / 天")} value={fiat(total.rentPerDay)} />
            ) : (
              <Stat
                label={t("电费 / 天")}
                value={fiat(total.electricityPerDay)}
                hint={total.kwhPerDay === null ? t("填写功耗后显示") : t("{0} kWh", trimNumber(total.kwhPerDay, 1))}
              />
            )}
            {hardware && <Stat label={t("折旧 / 天")} value={fiat(total.hardwarePerDay)} />}
            <Stat label={t("利润 / 天")} value={priced ? fiat(total.profitPerDay) : "—"} hint={priced ? undefined : t("填写价格后显示")} />
            <Stat label={t("利润率")} value={priced && total.margin !== null ? formatPercent(total.margin) : "—"} />
            {!rentMode && (
              <Stat label={t("电费成本 / 枚")} value={total.electricityPerQtc === null ? "—" : `${fiat(total.electricityPerQtc)}/QTC`} />
            )}
            <Stat label={t("总成本 / 枚")} value={total.costPerQtc === null ? "—" : `${fiat(total.costPerQtc)}/QTC`} />
            {!rentMode && <Stat label={t("每 kWh 产量")} value={total.qtcPerKwh === null ? "—" : `${formatQtc(total.qtcPerKwh)} QTC`} />}
            {hardware && (
              <Stat label={t("回本时间")} value={priced ? payback(total.paybackDays) : "—"} hint={priced ? undefined : t("填写价格后显示")} />
            )}
            <Stat
              label={t("单干出块间隔")}
              value={soloInterval === null ? "—" : soloInterval < 1 ? t("{0} 小时", trimNumber(soloInterval * 24, 1)) : t("{0} 天", trimNumber(soloInterval, 1))}
              hint={t("不进矿池时的期望值")}
            />
          </dl>
        </div>
      </section>

      {result.devices.length > 1 && (
        <section className="settings-group" aria-label={t("各显卡明细")}>
          <h2>{t("各显卡明细")}</h2>
          <div className="mining-card">
            <div className="mining-table-wrap">
            <table className="mining-table">
              <thead>
                <tr>
                  <th>{t("显卡")}</th>
                  <th>{t("算力")}</th>
                  <th>{t("QTC / 天")}</th>
                  <th>{rentMode ? t("租金 / 天") : t("电费 / 天")}</th>
                  <th>{t("保本价")}</th>
                  <th>{t("利润 / 天")}</th>
                </tr>
              </thead>
              <tbody>
                {result.devices.map((row, index) => (
                  <tr key={index}>
                    <th scope="row">
                      {row.device.label === "custom" ? t("自定义") : row.device.label}
                      {row.device.quantity !== 1 && <small> × {row.device.quantity}</small>}
                    </th>
                    <td>{formatHashrate(row.hashrate)}</td>
                    <td>{formatQtc(row.qtcPerDay)}</td>
                    <td>{bare(rentMode ? row.rentPerDay : row.electricityPerDay)}</td>
                    <td>{row.breakEvenPrice === null ? "—" : bare(row.breakEvenPrice)}</td>
                    <td className={signClass(priced ? row.profitPerDay : null)}>{priced ? bare(row.profitPerDay) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="mining-note">
              {currencyNote}
              {t("租金和设备成本按算力占比分摊到各显卡。")}
            </p>
          </div>
        </section>
      )}

      <section className="settings-group" aria-label={t("难度上涨敏感性")}>
        <h2>{t("难度上涨敏感性")}</h2>
        <div className="mining-card">
          <div className="mining-table-wrap">
            <table className="mining-table">
              <thead>
                <tr>
                  <th>{t("全网算力")}</th>
                  <th>{t("QTC / 天")}</th>
                  <th>{t("保本价")}</th>
                  <th>{t("利润 / 天")}</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.map(({ factor, result: scaled }) => (
                  <tr key={factor}>
                    <th scope="row">
                      {factor === 1 ? t("当前") : `× ${factor}`}
                      <small> {formatHashrate(scaled.network.hashrate)}</small>
                    </th>
                    <td>{formatQtc(scaled.total.qtcPerDay)}</td>
                    <td>{scaled.total.breakEvenPrice === null ? "—" : bare(scaled.total.breakEvenPrice)}</td>
                    <td className={signClass(priced ? scaled.total.profitPerDay : null)}>{priced ? bare(scaled.total.profitPerDay) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mining-note">
            {currencyNote}
            {t("新矿机加入会推高难度，同样的算力分到的份额随之下降；这里假设出块时间和奖励不变。")}{" "}
            {t("以上都是期望值。矿池按 PPLNS 分配，短期收益随矿池运气波动：")}
            {luckDay !== null && luckWeek !== null
              ? t("按 Quanpool 当前份额，单日约 ±{0}、单周约 ±{1}（1σ）。", formatPercent(luckDay), formatPercent(luckWeek))
              : t("统计周期越短，偏离越大。")}
          </p>
        </div>
      </section>

      <section className="settings-group" aria-label={t("显卡对比")}>
        <h2>{t("显卡对比")}</h2>
        <div className="mining-card">
          <div className="segmented mining-segmented" role="radiogroup" aria-label={t("矿工软件")}>
            {(["pool", "stock"] as Software[]).map((software) => (
              <button
                type="button"
                key={software}
                role="radio"
                aria-checked={compareSoftware === software}
                onClick={() => setCompareSoftware(software)}
              >
                <span>{software === "pool" ? t("矿池矿工") : t("官方矿工")}</span>
              </button>
            ))}
          </div>
          <div className="mining-table-wrap">
            <table className="mining-table">
              <thead>
                <tr>
                  <th>{t("显卡")}</th>
                  <th>{t("算力 / 功耗")}</th>
                  <th>{t("QTC / 天")}</th>
                  <th>{t("电费 / 天")}</th>
                  <th>{t("保本价")}</th>
                  <th>{t("利润 / 天")}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map(({ gpu, row }) => (
                  <tr key={gpu.id}>
                    <th scope="row">{gpu.short}</th>
                    <td>
                      {formatHashrate(row.hashrate)}
                      <small>{powerText(gpu)}</small>
                    </td>
                    <td>{formatQtc(row.qtcPerDay)}</td>
                    <td>{rentMode ? "—" : bare(row.electricityPerDay)}</td>
                    <td>{rentMode || row.breakEvenPrice === null ? "—" : bare(row.breakEvenPrice)}</td>
                    <td className={signClass(priced && !rentMode ? row.profitPerDay : null)}>
                      {priced && !rentMode ? bare(row.profitPerDay) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mining-note">
            {currencyNote}
            {t("单卡、按当前网络状态与你填写的在线率、费率和电价计算；功耗为典型值。")}{" "}
            {rentMode ? t("租用模式下不计算单卡成本。") : priced ? t("按利润排序。") : t("按产量排序。")}
          </p>
        </div>
      </section>

      <Method />
    </>
  );
}

function powerText(gpu: Gpu): string {
  return gpu.powerW === null ? "—" : `${gpu.powerW} W`;
}

function signClass(value: number | null): string | undefined {
  if (value === null) return undefined;
  return value >= 0 ? "positive" : "negative";
}

function Stat({ label, value, hint, highlight }: { label: ReactNode; value: ReactNode; hint?: ReactNode; highlight?: boolean }) {
  return (
    <div className={highlight ? "highlight" : undefined}>
      <dt>{label}</dt>
      <dd>
        {value}
        {hint && <small>{hint}</small>}
      </dd>
    </div>
  );
}

function Method() {
  const t = useT();
  return (
    <section className="settings-group" aria-label={t("计算方法与假设")}>
      <h2>{t("计算方法与假设")}</h2>
      <div className="mining-card mining-method">
        <code>{t("QTC/天 = 算力 ÷ 全网算力 × 每日出块 × 区块奖励 × 在线率 × (1 − 矿池费) × (1 − 矿工软件费)")}</code>
        <ul>
          <li>{t("全网算力 = 链上难度 ÷ 近 200 块的实测平均出块时间；每日出块 = 86400 ÷ 出块时间；区块奖励取索引器最近 50 块的平均值。")}</li>
          <li>{t("电费 = 功耗 × 数量 × 24 h × 在线率 × 电价；租金和设备成本按各显卡算力占比分摊；折旧 = 设备成本 ÷ 折旧天数。")}</li>
          <li>{t("保本价 = 每日运行成本（电费或租金）÷ 每日产量，与你填写的价格无关；含折旧的保本价再加上每日折旧。回本时间 = 设备成本 ÷（每日收入 − 每日运行成本）。")}</li>
          <li>{t("忽略：出块时间和奖励的未来变化、矿池的最低起付额、孤块与拒绝份额、显卡以外的整机功耗、损耗与维护、税费和汇率。")}</li>
          <li>{t("显卡基准与费率取自 Quanpool 公开接口，只作为参考；不同驱动、超频和温度下的实际算力请以自己的矿机为准。")}</li>
        </ul>
      </div>
    </section>
  );
}
