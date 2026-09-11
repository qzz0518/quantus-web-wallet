import type { ReactNode } from "react";
import { useT } from "../../lib/i18n";
import { formatFiat, formatPercent, formatQtc } from "../../lib/mining/format";
import type { Model } from "../../lib/mining/inputs";
import type { Estimate } from "../../lib/mining/math";
import { signClass } from "./MiningFields";

type Metric = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  hint?: ReactNode;
  tone?: string;
};

/**
 * The four figures a miner decides on, and the only place any of them is
 * printed: what the rig makes per day, what it earns, the QTC price below
 * which it stops paying, and the price of the thing it burns — rent for a
 * rented rig, electricity for one you own. Everything below explains these;
 * nothing below repeats them.
 */
export function MiningSummary({
  result,
  model,
  loading,
  hasNetwork,
  onNeedPrice,
}: {
  result: Estimate | null;
  model: Model;
  loading: boolean;
  hasNetwork: boolean;
  onNeedPrice: () => void;
}) {
  const t = useT();
  const currency = model.currency;
  const price = model.assumptions.price;
  const priced = price > 0;
  const total = result?.total ?? null;
  const rentMode = model.costs.mode === "rental";
  const bare = (value: number | null | undefined) =>
    value === null || value === undefined || !Number.isFinite(value) ? "—" : formatFiat(value, "");
  const perQtc = currency ? `${currency}/QTC` : "/ QTC";
  const needPrice = (
    <button type="button" className="text-button mining-inline-button" onClick={onNeedPrice}>
      {t("填写 QTC 价格")}
    </button>
  );
  const waiting = !hasNetwork ? (loading ? t("正在读取网络状态…") : t("等待网络数据")) : t("填写算力后显示");
  // Own hardware buys kilowatt-hours, not rent: the fourth decision is the
  // highest electricity price the output still covers. Stating a rent budget
  // there would print the profit a second time, since without a rent to pay
  // the two are the same number.
  const kwhCeiling = priced && total && total.qtcPerKwh !== null ? total.qtcPerKwh * price : null;

  const metrics: Metric[] = [
    {
      key: "output",
      label: t("期望产量"),
      value: total ? formatQtc(total.qtcPerDay) : "—",
      unit: t("QTC / 天"),
      hint: total ? t("占全网 {0}", formatPercent(total.share, 3)) : waiting,
    },
    {
      key: "profit",
      label: t("利润 / 天"),
      value: priced && total ? bare(total.profitPerDay) : "—",
      unit: currency || undefined,
      tone: priced && total ? signClass(total.profitPerDay) : undefined,
      hint: !priced
        ? needPrice
        : total && total.margin !== null
          ? t("利润率 {0}", formatPercent(total.margin))
          : t("填写功耗后显示"),
    },
    {
      key: "breakeven",
      label: t("保本价"),
      value: total ? bare(total.breakEvenPrice) : "—",
      unit: perQtc,
      // A zero here means nothing has to be paid for; saying "below it you
      // lose money" about zero would be nonsense.
      hint:
        !total || total.breakEvenPrice === null
          ? t("填写功耗后显示")
          : total.breakEvenPrice === 0
            ? t("没有运行成本")
            : t("低于此价即亏损"),
    },
    rentMode
      ? {
          key: "rent",
          label: t("保本租金 / 天"),
          value: priced && total ? bare(total.breakEvenRentPerDay) : "—",
          unit: currency || undefined,
          tone: priced && total ? signClass(total.breakEvenRentPerDay) : undefined,
          hint: !priced
            ? needPrice
            : total && total.breakEvenRentPerHour !== null
              ? t("{0} / 小时 · 租金已含电费", bare(total.breakEvenRentPerHour))
              : t("租金已含电费，全部产值都能付租金"),
        }
      : {
          key: "kwh",
          label: t("保本电价"),
          value: kwhCeiling === null ? "—" : bare(kwhCeiling),
          unit: currency ? `${currency}/kWh` : undefined,
          hint: !priced ? needPrice : kwhCeiling === null ? t("填写功耗后显示") : t("高于此电价即亏损"),
        },
  ];

  return (
    <div className="mining-summary">
      <section className="mining-summary-card" aria-label={t("关键结果")}>
        <dl className="mining-metrics">
          {metrics.map((metric) => (
            <div key={metric.key} className="mining-metric">
              <dt>{metric.label}</dt>
              <dd>
                <strong className={metric.tone}>
                  {metric.value}
                  {/* A dash has no unit: "— USDT" would read as a missing amount of something. */}
                  {metric.unit && metric.value !== "—" && <em>{metric.unit}</em>}
                </strong>
                <small>{metric.hint}</small>
              </dd>
            </div>
          ))}
        </dl>
        {/* Where the price came from, not what it is: the number itself has
            one home, the field in the form. */}
        <p className="mining-summary-note">
          {model.priceSource === "market"
            ? t("金额按 SafeTrade 市场价计算；产量和保本价与价格无关。")
            : model.priceSource === "manual"
              ? t("金额按你填写的 QTC 价格计算；产量和保本价与价格无关。")
              : t("填写 QTC 价格后才有收入和利润；产量和保本价与价格无关。")}
        </p>
      </section>
    </div>
  );
}
