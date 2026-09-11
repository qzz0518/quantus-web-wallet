import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useT } from "../../lib/i18n";
import type { PoolLuck, PoolStats } from "../../lib/mining/data";
import type { Gpu, PoolTerms } from "../../lib/mining/gpus";
import { formatFiat, formatHashrate, formatInteger, formatPercent, formatQtc, trimNumber } from "../../lib/mining/format";
import type { Model, Software } from "../../lib/mining/inputs";
import {
  DAYS_PER_MONTH,
  deriveNetwork,
  estimate,
  estimateDevice,
  gigahashRate,
  luckDeviation,
  mulPlanck,
  planckToQtc,
  scaleNetwork,
  type Estimate,
  type Network,
  type Yield,
} from "../../lib/mining/math";
import { Fold, Stat, signClass } from "./MiningFields";

/**
 * Every period except the day: the headline already answers "per day", so
 * repeating it here would print the same three figures twice.
 */
const PERIODS: { key: string; factor: number }[] = [
  { key: "每小时", factor: 1 / 24 },
  { key: "每周", factor: 7 },
  { key: "30 天", factor: DAYS_PER_MONTH },
];
/** The current difficulty is the headline; only the growth cases are new. */
const SENSITIVITY = [1.5, 2];

type Props = {
  network: Network | null;
  model: Model;
  result: Estimate | null;
  terms: PoolTerms;
  pool: PoolStats | null;
  luck: PoolLuck | null;
  loading: boolean;
};

/**
 * What the headline cannot say: the same estimate over the other periods,
 * with the cost beside the revenue so the profit adds up, plus the handful
 * of figures that appear nowhere else. Difficulty growth, the GPU table and
 * the method stay folded until asked for.
 */
/** Hashrate per unit of money, the shape rental markets quote. */
function ratioText(mh: number): string {
  return mh >= 1000 ? `${trimNumber(mh / 1000, 2)} GH` : `${formatInteger(mh)} MH`;
}

export function MiningResults({ network, model, result, terms, pool, luck, loading }: Props) {
  const t = useT();
  const [compareSoftware, setCompareSoftware] = useState<Software>("pool");
  const { devices, assumptions, costs, currency } = model;
  const priced = assumptions.price > 0;
  const fiat = (value: number | null) => (value === null ? "—" : formatFiat(value, currency));
  /** Table cells carry no unit; the column header or the note under the table names the currency. */
  const bare = (value: number | null) => (value === null ? "—" : formatFiat(value, ""));
  const fiatIfPriced = (value: number | null) => (priced ? bare(value) : "—");
  const currencyNote = currency ? t("金额单位：{0}。", currency) + " " : "";
  const rentMode = costs.mode === "rental";
  const perGh = useMemo(
    () =>
      network
        ? gigahashRate(network, assumptions, devices[0]?.minerFeePercent ?? terms.minerDevFeePercent)
        : null,
    [network, assumptions, devices, terms.minerDevFeePercent],
  );

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
          hashrate: (compareSoftware === "pool" ? gpu.ours : gpu.stock) ?? 0,
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
  const hardware = costs.mode === "electricity" && costs.hardwareCost > 0;
  // Several rows make a sum worth stating; a single row is just the input.
  const manyRows = result.devices.length > 1;
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
          <div className="mining-table-wrap">
            <table className="mining-table">
              <thead>
                <tr>
                  <th>{t("周期")}</th>
                  <th>QTC</th>
                  <th>{t("收入")}</th>
                  <th>{rentMode ? t("租金") : t("成本")}</th>
                  <th>{t("利润")}</th>
                </tr>
              </thead>
              <tbody>
                {PERIODS.map(({ key, factor }) => (
                  <tr key={key}>
                    <th scope="row">{t(key)}</th>
                    <td>{formatQtc(planckToQtc(mulPlanck(total.planckPerDay, factor)))}</td>
                    <td>{fiatIfPriced(total.revenuePerDay * factor)}</td>
                    <td>{total.costPerDay === null ? "—" : bare(total.costPerDay * factor)}</td>
                    <td className={priced && total.profitPerDay !== null ? signClass(total.profitPerDay) : undefined}>
                      {priced && total.profitPerDay !== null ? bare(total.profitPerDay * factor) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mining-note">
            {currencyNote}
            {t("每天的产量、利润和保本线见上方；这里是同一台机器换算到其他周期。")}
          </p>
          <dl className="mining-stats">
            {manyRows && <Stat label={t("总算力")} value={formatHashrate(total.hashrate)} />}
            {costs.mode === "electricity" && (
              <Stat
                label={t("每日用电")}
                value={total.kwhPerDay === null ? "—" : t("{0} kWh", trimNumber(total.kwhPerDay, 1))}
                hint={total.kwhPerDay === null ? t("填写功耗后显示") : undefined}
              />
            )}
            {hardware && <Stat label={t("电费 / 天")} value={fiat(total.electricityPerDay)} />}
            {hardware && <Stat label={t("折旧 / 天")} value={fiat(total.hardwarePerDay)} />}
            {hardware && (
              <Stat
                label={t("保本价（含折旧）")}
                value={total.breakEvenPriceWithHardware === null ? "—" : `${fiat(total.breakEvenPriceWithHardware)}/QTC`}
                highlight
              />
            )}
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

      {manyRows && (
        <Fold title={t("各显卡明细")} meta={t("{0} 张卡", result.devices.length)}>
          <div className="mining-table-wrap">
            <table className="mining-table">
              <thead>
                <tr>
                  <th>{t("显卡")}</th>
                  <th>{t("QTC / 天")}</th>
                  <th>{rentMode ? t("租金 / 天") : t("电费 / 天")}</th>
                </tr>
              </thead>
              <tbody>
                {result.devices.map((row, index) => (
                  <tr key={index}>
                    <th scope="row">
                      {row.device.label === "custom" ? t("自定义") : row.device.label}
                      {row.device.quantity !== 1 && <small> × {row.device.quantity}</small>}
                    </th>
                    <td>{formatQtc(row.qtcPerDay)}</td>
                    <td>{bare(rentMode ? row.rentPerDay : row.electricityPerDay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mining-note">
            {currencyNote}
            {t("每张卡的产量，以及租金和设备成本按算力占比分摊到它的份额。")}
          </p>
        </Fold>
      )}

      <Fold
        open
        title={t("难度与运气")}
        meta={
          perGh?.ratePerHour != null
            ? t("算价比 {0} {1}/GH·小时", bare(perGh.ratePerHour), currency)
            : t("× 1.5 / × 2")
        }
      >
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
                    {`× ${factor}`}
                    <small> {formatHashrate(scaled.network.hashrate)}</small>
                  </th>
                  <td>{formatQtc(scaled.total.qtcPerDay)}</td>
                  <td>{scaled.total.breakEvenPrice === null ? "—" : bare(scaled.total.breakEvenPrice)}</td>
                  <td className={signClass(priced ? scaled.total.profitPerDay : null)}>
                    {priced ? bare(scaled.total.profitPerDay) : "—"}
                  </td>
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
        {luck && (
          <div className="mining-luck">
            <p className="mining-note">
              {t("Quanpool 实测运气，100% 为期望值，低于 100% 表示比期望多花了算力：")}
            </p>
            <div className="mining-luck-windows">
              {luck.windows.map((window) => (
                <span key={window.blocks}>
                  <b>{trimNumber(window.luckPercent, 0)}%</b>
                  <small>{t("近 {0} 块", window.blocks)}</small>
                </span>
              ))}
              {luck.roundProgressPercent !== null && (
                <span>
                  <b>{trimNumber(luck.roundProgressPercent, 0)}%</b>
                  <small>{t("本轮进度")}</small>
                </span>
              )}
            </div>
          </div>
        )}
        {perGh && (
          <dl className="mining-stats mining-per-gh">
            <Stat label={t("1 GH/s 日产量")} value={`${formatQtc(perGh.qtcPerDay)} QTC`} />
            <Stat
              label={t("QTC 价格")}
              value={priced ? `${bare(assumptions.price)} ${currency}` : "—"}
              hint={priced ? undefined : t("填写 QTC 价格")}
            />
            <Stat
              label={t("保本算价比")}
              value={perGh.ratePerHour === null ? "—" : ratioText(1000 / perGh.ratePerHour)}
              hint={
                perGh.ratePerHour === null
                  ? t("填写 QTC 价格")
                  : t("每 {0} 每小时，租赁报价高于此值才有利润；每 GH/s 每小时 {1}", currency, bare(perGh.ratePerHour))
              }
            />
          </dl>
        )}
      </Fold>

      <Fold open title={t("显卡对比")} meta={t("{0} 款", comparison.length)}>
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
                <th>{t("保本租金 / 小时")}</th>
                {!rentMode && <th>{t("保本价")}</th>}
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
                  <td className={signClass(row.breakEvenRentPerDay)}>
                    {bare(row.breakEvenRentPerHour)}
                    <small>{t("{0} / 天", bare(row.breakEvenRentPerDay))}</small>
                  </td>
                  {!rentMode && <td>{row.breakEvenPrice === null ? "—" : bare(row.breakEvenPrice)}</td>}
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
          <li>{t("保本电价 = 每日产值 ÷ 每日用电；保本租金 = 每日产值 − 不含在租金里的运行成本，整机租用时电费已含在租金里，所以就是全部产值。两者都不含设备折旧。")}</li>
          <li>{t("忽略：出块时间和奖励的未来变化、矿池的最低起付额、孤块与拒绝份额、显卡以外的整机功耗、损耗与维护、税费和汇率。")}</li>
          <li>{t("显卡基准与费率取自 Quanpool 公开接口，只作为参考；不同驱动、超频和温度下的实际算力请以自己的矿机为准。")}</li>
          <li>{t("QTC 价格取自 SafeTrade 公开接口的 QUANTUS/USDT 最新成交价，没有成交时取买一卖一的中间价；读取时交易所会看到你的 IP。读取失败或被你改写时用你填的数字，其他金额按同一货币，不做汇率换算。")}</li>
        </ul>
      </div>
    </Fold>
  );
}
