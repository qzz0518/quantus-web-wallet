import { useMemo, useState } from "react";
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
import { Fold, Stat, signClass } from "./MiningFields";

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
  result: Estimate | null;
  terms: PoolTerms;
  pool: PoolStats | null;
  loading: boolean;
};

/**
 * Supporting detail for the headline figures: the whole rig's rent budget,
 * output by period, the cost breakdown, and — folded away until asked for —
 * per-GPU rows, difficulty sensitivity, the GPU table and the method.
 */
export function MiningResults({ network, model, result, terms, pool, loading }: Props) {
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
  const rentMode = costs.mode === "rental";

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
        costs.mode === "electricity"
          ? { mode: "electricity", pricePerKwh: costs.pricePerKwh, hardwareCost: 0, amortiseDays: 0 }
          : { mode: "rental", rentPerDay: 0 },
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
  const hardware = costs.mode === "electricity" && costs.hardwareCost > 0;
  // Without rent or amortisation the profit is exactly the rent budget, so a
  // profit column beside it would just repeat the same number.
  const showProfit = rentMode || hardware;
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
  const rentHint = !priced ? t("填写 QTC 价格后显示") : cashUnknown ? t("填写功耗后显示") : null;

  return (
    <>
      <section className="settings-group" aria-label={t("估算结果")}>
        <h2>{t("估算结果")}</h2>
        <div className="mining-card">
          <div className="mining-budget">
            <div className="mining-budget-head">
              <strong>{t("整机保本租金")}</strong>
              <small>
                {rentMode
                  ? t("租金已含电费，全部产值都可用来付租金")
                  : t("产值减去电费后还能付出的最高租金")}
              </small>
            </div>
            {rentHint ? (
              <p className="mining-budget-empty">
                <span aria-hidden="true">—</span>
                {rentHint}
              </p>
            ) : (
              <div className="mining-budget-figures">
                <div>
                  <strong className={signClass(total.breakEvenRentPerHour)}>
                    {bare(total.breakEvenRentPerHour)}
                    {currency && <em>{currency}</em>}
                  </strong>
                  <span>{t("每小时")}</span>
                </div>
                <div>
                  <strong className={signClass(total.breakEvenRentPerDay)}>
                    {bare(total.breakEvenRentPerDay)}
                    {currency && <em>{currency}</em>}
                  </strong>
                  <span>{t("每天")}</span>
                </div>
              </div>
            )}
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
                    <td className={priced && total.profitPerDay !== null ? signClass(total.profitPerDay) : undefined}>
                      {priced && total.profitPerDay !== null ? bare(total.profitPerDay * factor) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mining-stats">
            <Stat label={t("总算力")} value={formatHashrate(total.hashrate)} hint={t("占全网 {0}", formatPercent(total.share, 3))} />
            <Stat
              label={rentMode ? t("保本价（租金）") : t("保本价（电费）")}
              value={total.breakEvenPrice === null ? "—" : `${fiat(total.breakEvenPrice)}/QTC`}
              highlight
              hint={cashUnknown ? t("填写功耗后显示") : total.breakEvenPrice === 0 ? t("没有运行成本") : undefined}
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
            <Stat label={t("利润率")} value={priced && total.margin !== null ? formatPercent(total.margin) : "—"} hint={priced ? undefined : t("填写价格后显示")} />
            <Stat label={t("总成本 / 枚")} value={total.costPerQtc === null ? "—" : `${fiat(total.costPerQtc)}/QTC`} />
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
        <Fold title={t("各显卡明细")} meta={t("{0} 张卡", result.devices.length)}>
          <div className="mining-table-wrap">
            <table className="mining-table">
              <thead>
                <tr>
                  <th>{t("显卡")}</th>
                  <th>{t("保本租金 / 天")}</th>
                  <th>{t("QTC / 天")}</th>
                  <th>{t("保本价")}</th>
                  <th>{rentMode ? t("租金 / 天") : t("电费 / 天")}</th>
                  <th>{t("算力")}</th>
                  {showProfit && <th>{t("利润 / 天")}</th>}
                </tr>
              </thead>
              <tbody>
                {result.devices.map((row, index) => (
                  <tr key={index}>
                    <th scope="row">
                      {row.device.label === "custom" ? t("自定义") : row.device.label}
                      {row.device.quantity !== 1 && <small> × {row.device.quantity}</small>}
                    </th>
                    <td className={signClass(row.breakEvenRentPerDay)}>{bare(row.breakEvenRentPerDay)}</td>
                    <td>{formatQtc(row.qtcPerDay)}</td>
                    <td>{row.breakEvenPrice === null ? "—" : bare(row.breakEvenPrice)}</td>
                    <td>{bare(rentMode ? row.rentPerDay : row.electricityPerDay)}</td>
                    <td>{formatHashrate(row.hashrate)}</td>
                    {showProfit && (
                      <td className={signClass(priced ? row.profitPerDay : null)}>{priced ? bare(row.profitPerDay) : "—"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mining-note">
            {currencyNote}
            {t("租金和设备成本按算力占比分摊到各显卡。")}
          </p>
        </Fold>
      )}

      <Fold title={t("难度上涨敏感性")} meta={t("× 1.5 / × 2")}>
        <div className="mining-table-wrap">
          <table className="mining-table">
            <thead>
              <tr>
                <th>{t("全网算力")}</th>
                <th>{t("保本租金 / 天")}</th>
                <th>{t("QTC / 天")}</th>
                <th>{t("保本价")}</th>
                {showProfit && <th>{t("利润 / 天")}</th>}
              </tr>
            </thead>
            <tbody>
              {sensitivity.map(({ factor, result: scaled }) => (
                <tr key={factor}>
                  <th scope="row">
                    {factor === 1 ? t("当前") : `× ${factor}`}
                    <small> {formatHashrate(scaled.network.hashrate)}</small>
                  </th>
                  <td className={signClass(scaled.total.breakEvenRentPerDay)}>{bare(scaled.total.breakEvenRentPerDay)}</td>
                  <td>{formatQtc(scaled.total.qtcPerDay)}</td>
                  <td>{scaled.total.breakEvenPrice === null ? "—" : bare(scaled.total.breakEvenPrice)}</td>
                  {showProfit && (
                    <td className={signClass(priced ? scaled.total.profitPerDay : null)}>
                      {priced ? bare(scaled.total.profitPerDay) : "—"}
                    </td>
                  )}
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
      </Fold>

      <Fold title={t("显卡对比")} meta={t("{0} 款", comparison.length)}>
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
                <th>{t("保本租金 / 天")}</th>
                <th>{t("QTC / 天")}</th>
                {!rentMode && <th>{t("保本价")}</th>}
                {!rentMode && <th>{t("电费 / 天")}</th>}
                <th>{t("算力 / 功耗")}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(({ gpu, row }) => (
                <tr key={gpu.id}>
                  <th scope="row">{gpu.short}</th>
                  <td className={signClass(row.breakEvenRentPerDay)}>
                    {bare(row.breakEvenRentPerDay)}
                    {row.breakEvenRentPerHour !== null && <small>{t("{0} / 小时", bare(row.breakEvenRentPerHour))}</small>}
                  </td>
                  <td>{formatQtc(row.qtcPerDay)}</td>
                  {!rentMode && <td>{row.breakEvenPrice === null ? "—" : bare(row.breakEvenPrice)}</td>}
                  {!rentMode && <td>{bare(row.electricityPerDay)}</td>}
                  <td>
                    {formatHashrate(row.hashrate)}
                    <small>{powerText(gpu)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mining-note">
          {currencyNote}
          {t("单卡、按当前网络状态与你填写的在线率、费率和电价计算；功耗为典型值。")}{" "}
          {priced ? t("按保本租金排序。") : t("按产量排序。")}
        </p>
      </Fold>

      <Method />
    </>
  );
}

function powerText(gpu: Gpu): string {
  return gpu.powerW === null ? "—" : `${gpu.powerW} W`;
}

function Method() {
  const t = useT();
  return (
    <Fold title={t("计算方法与假设")}>
      <div className="mining-method">
        <code>{t("QTC/天 = 算力 ÷ 全网算力 × 每日出块 × 区块奖励 × 在线率 × (1 − 矿池费) × (1 − 矿工软件费)")}</code>
        <ul>
          <li>{t("全网算力 = 链上难度 ÷ 近 200 块的实测平均出块时间；每日出块 = 86400 ÷ 出块时间；区块奖励取索引器最近 50 块的平均值。")}</li>
          <li>{t("电费 = 功耗 × 数量 × 24 h × 在线率 × 电价；租金和设备成本按各显卡算力占比分摊；折旧 = 设备成本 ÷ 折旧天数。")}</li>
          <li>{t("保本价 = 每日运行成本（电费或租金）÷ 每日产量，与你填写的价格无关；含折旧的保本价再加上每日折旧。回本时间 = 设备成本 ÷（每日收入 − 每日运行成本）。")}</li>
          <li>{t("保本租金 = 每日产量 × QTC 价格 − 不含在租金里的运行成本：租整机时电费已含在租金里，所以就是全部产值；自有设备时先减掉电费。每小时 = 每天 ÷ 24，不含设备折旧。")}</li>
          <li>{t("忽略：出块时间和奖励的未来变化、矿池的最低起付额、孤块与拒绝份额、显卡以外的整机功耗、损耗与维护、税费和汇率。")}</li>
          <li>{t("显卡基准与费率取自 Quanpool 公开接口，只作为参考；不同驱动、超频和温度下的实际算力请以自己的矿机为准。")}</li>
          <li>{t("QTC 价格取自 SafeTrade 的 QUAN/USDT 最新成交价，读取失败或被你改写时用你填的数字；其他金额按同一货币，不做汇率换算。")}</li>
        </ul>
      </div>
    </Fold>
  );
}
