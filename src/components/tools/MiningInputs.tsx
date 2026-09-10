import type { RefObject } from "react";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { useT } from "../../lib/i18n";
import { Select } from "../Select";
import { MARKET_PAIR, MARKET_QUOTE, SAFETRADE_MARKET_URL, type MarketPrice } from "../../lib/mining/data";
import type { PoolTerms } from "../../lib/mining/gpus";
import { formatFiat, formatHashrate } from "../../lib/mining/format";
import type { DeviceYield } from "../../lib/mining/math";
import {
  benchmark,
  CUSTOM_GPU,
  deviceFromGpu,
  hashrateText,
  minerFeeFor,
  parseNumber,
  priceFieldText,
  UNIT_FACTOR,
  type DeviceInput,
  type MiningInputs as Inputs,
  type Software,
} from "../../lib/mining/inputs";
import { Fold, NumberField, Segmented, signClass, UNIT_OPTIONS } from "./MiningFields";

type Update = (patch: Partial<Inputs>) => void;

const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function updateAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

/**
 * What one row of a multi-row rig can pay in rent. With a single row this
 * is the headline figure again, so it only appears once the rig has more
 * than one kind of card in it.
 */
function RentLine({ row, currency, priced }: { row: DeviceYield | null; currency: string; priced: boolean }) {
  const t = useT();
  const perDay = row?.breakEvenRentPerDay ?? null;
  const unit = (suffix: string) => (currency ? `${currency}${suffix}` : suffix);
  return (
    <p className="mining-rent-line">
      <span className="mining-rent-label">{t("保本租金")}</span>
      {perDay === null ? (
        <span className="mining-rent-empty">
          <span aria-hidden="true">—</span>
          <small>{priced ? t("填写功耗后显示") : t("需要 QTC 价格")}</small>
        </span>
      ) : (
        <span className={`mining-rent-values ${signClass(perDay) ?? ""}`}>
          <b>
            {formatFiat(perDay, "")}
            <em>{unit(t("/天"))}</em>
          </b>
        </span>
      )}
    </p>
  );
}

/** Hashrate, power and miner fee: filled in from the benchmark, opened only to override it. */
function Tuning({
  row,
  terms,
  onChange,
}: {
  row: DeviceInput;
  terms: PoolTerms;
  onChange: (patch: Partial<DeviceInput>) => void;
}) {
  const t = useT();
  const gpu = terms.gpus.find((item) => item.id === row.gpu);
  return (
    <>
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
          hint={
            gpu
              ? t(
                  "基准：{0}（{1}）",
                  formatHashrate(benchmark(gpu, row.software)),
                  row.software === "pool" ? t("矿池矿工") : t("官方矿工"),
                )
              : undefined
          }
        />
        <NumberField
          label={t("单卡功耗")}
          value={row.powerW}
          onChange={(powerW) => onChange({ powerW })}
          placeholder="—"
          suffix="W"
          hint={
            gpu?.powerW !== null && gpu?.powerW !== undefined
              ? t("典型值 {0} W，可修改", gpu.powerW)
              : t("整机满载功耗，用于电费")
          }
        />
      </div>
      <NumberField
        label={t("矿工软件费")}
        value={row.minerFee}
        onChange={(minerFee) => onChange({ minerFee })}
        placeholder="0"
        suffix="%"
        hint={
          row.software === "pool"
            ? t("矿池自带矿工，算力更高，内置 {0}% 开发者费。", terms.minerDevFeePercent)
            : t("官方 quantus-miner，无内置费用。")
        }
      />
    </>
  );
}

function DeviceRow({
  row,
  index,
  terms,
  removable,
  showRent,
  result,
  currency,
  priced,
  onChange,
  onRemove,
}: {
  row: DeviceInput;
  index: number;
  terms: PoolTerms;
  removable: boolean;
  showRent: boolean;
  result: DeviceYield | null;
  currency: string;
  priced: boolean;
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
  // The row's own totals, read straight from the inputs so they show before
  // the network state arrives.
  const quantity = Math.max(0, Math.floor(parseNumber(row.quantity) ?? 0));
  const power = parseNumber(row.powerW);
  const hashrate = (parseNumber(row.hashrate) ?? 0) * UNIT_FACTOR[row.unit] * quantity;
  const spec = [hashrate > 0 ? formatHashrate(hashrate) : null, power === null ? null : `${power * quantity} W`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mining-device">
      {removable && (
        <div className="mining-device-head">
          <strong>{t("显卡 {0}", index + 1)}</strong>
          <button type="button" className="text-button" onClick={onRemove}>
            <Trash2 size={15} aria-hidden="true" />
            {t("移除")}
          </button>
        </div>
      )}
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
      </div>
      {showRent && <RentLine row={result} currency={currency} priced={priced} />}
      {row.gpu === CUSTOM_GPU ? (
        <Tuning row={row} terms={terms} onChange={onChange} />
      ) : (
        <details className="flow-details mining-fold mining-row-more">
          <summary>
            <span className="mining-fold-title">{t("算力与功耗")}</span>
            <span className="mining-fold-meta">{spec}</span>
          </summary>
          <div className="mining-fold-body">
            <Tuning row={row} terms={terms} onChange={onChange} />
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Everything the reader types, ordered by how often they type it: the cards,
 * what the power or the rig costs, and the QTC price stay in the open; the
 * assumptions that are set once live behind one disclosure.
 */
export function MiningInputs({
  inputs,
  update,
  terms,
  rows,
  currency,
  priced,
  market,
  loading,
  priceRef,
}: {
  inputs: Inputs;
  update: Update;
  terms: PoolTerms;
  rows: DeviceYield[] | null;
  currency: string;
  priced: boolean;
  market: MarketPrice | null;
  loading: boolean;
  priceRef: RefObject<HTMLInputElement | null>;
}) {
  const t = useT();
  const poolFeeValue = inputs.poolFee ?? String(terms.poolFeePercent);
  const following = inputs.price === null && market !== null;
  const rentMode = inputs.costMode === "rental";
  const settingsMeta = [
    inputs.mode === "devices" ? t("按显卡") : t("总算力"),
    t("在线 {0}%", inputs.uptime || "100"),
    t("矿池费 {0}%", poolFeeValue),
  ].join(" · ");
  // One row is the whole rig, and the headline already states its rent
  // budget; several rows each carry their own share.
  const showRent = inputs.devices.length > 1;

  return (
    <>
      <section className="settings-group" aria-label={t("参数")}>
        <h2>{t("参数")}</h2>
        <div className="mining-card">
          {inputs.mode === "devices" ? (
            <>
              {inputs.devices.map((row, index) => (
                <DeviceRow
                  key={row.key}
                  row={row}
                  index={index}
                  terms={terms}
                  removable={inputs.devices.length > 1}
                  showRent={showRent}
                  result={rows?.[index] ?? null}
                  currency={currency}
                  priced={priced}
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
            </>
          ) : (
            <div className="mining-total">
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
                  onChange={(software) =>
                    update({ total: { ...inputs.total, software, minerFee: minerFeeFor(software, terms) } })
                  }
                  options={[
                    { value: "pool", label: t("矿池矿工") },
                    { value: "stock", label: t("官方矿工") },
                  ]}
                />
              </div>
              <details className="flow-details mining-fold mining-row-more">
                <summary>
                  <span className="mining-fold-title">{t("算力与功耗")}</span>
                  <span className="mining-fold-meta">{inputs.total.powerW ? `${inputs.total.powerW} W` : ""}</span>
                </summary>
                <div className="mining-fold-body">
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
                </div>
              </details>
            </div>
          )}

          {/* What the running hours cost, and what the output is worth: the
              two numbers that move the answer most often. */}
          <div className="mining-costs">
            <div className="mining-fields">
              {rentMode ? (
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
                  hint={
                    <button type="button" className="text-button mining-inline-button" onClick={() => update({ costMode: "electricity" })}>
                      {t("改为自有设备付电费")}
                    </button>
                  }
                />
              ) : (
                <NumberField
                  label={t("电价")}
                  value={inputs.electricity}
                  onChange={(electricity) => update({ electricity })}
                  placeholder="0.10"
                  suffix={`${currency || "—"}/kWh`}
                  hint={
                    <button type="button" className="text-button mining-inline-button" onClick={() => update({ costMode: "rental" })}>
                      {t("改为整机租用（租金含电费）")}
                    </button>
                  }
                />
              )}

              <NumberField
                label={t("QTC 价格")}
                value={priceFieldText(inputs, market?.lastText ?? null)}
                onChange={(price) => update({ price })}
                placeholder="0"
                inputRef={priceRef}
                suffix={`${currency || "—"}/QTC`}
                hint={
                  !following && market ? (
                    <button type="button" className="text-button mining-inline-button" onClick={() => update({ price: null })}>
                      {t("改回市场价 {0}", `${market.lastText} ${MARKET_QUOTE}`)}
                    </button>
                  ) : undefined
                }
              />
            </div>
            {/* The quote's own line: who is asked, how fresh, which way it
                moved. The number itself belongs to the field above. */}
            <a
              className={market ? "mining-market" : "mining-market quiet"}
              href={SAFETRADE_MARKET_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="mining-market-copy">
                <strong>{`SafeTrade · ${MARKET_PAIR}`}</strong>
                <small>
                  {market
                    ? t("最新成交价 · 更新于 {0}", clock(market.fetchedAt))
                    : loading
                      ? t("正在读取市场价…")
                      : t("暂时取不到市场价，请手动填写")}
                </small>
              </span>
              {market?.changePercent && (
                <span className={`mining-market-change ${market.changePercent.startsWith("-") ? "negative" : "positive"}`}>
                  {market.changePercent}
                </span>
              )}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            {following && currency && currency.toUpperCase() !== MARKET_QUOTE && (
              <p className="mining-note warn">{t("市场价以 USDT 计，而你的货币标签是 {0}；不一致时请自行填写价格。", currency)}</p>
            )}
          </div>
        </div>
      </section>

      <Fold title={t("更多设置")} meta={settingsMeta}>
        <div className="field mining-field">
          <span>{t("输入方式")}</span>
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
        </div>
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
                <button
                  type="button"
                  className="text-button mining-inline-button"
                  onClick={() => update({ poolFee: null })}
                >
                  {t("恢复为矿池公布值 {0}%", terms.poolFeePercent)}
                </button>
              )
            }
          />
        </div>
        <div className="mining-fields">
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
          {!rentMode && (
            <NumberField
              label={t("设备成本（可选）")}
              value={inputs.hardwareCost}
              onChange={(hardwareCost) => update({ hardwareCost })}
              placeholder="0"
              suffix={currency || undefined}
              hint={t("全部设备的购置价，用于折旧和回本")}
            />
          )}
        </div>
        {!rentMode && (
          <NumberField
            label={t("折旧天数")}
            value={inputs.amortiseDays}
            onChange={(amortiseDays) => update({ amortiseDays })}
            placeholder="365"
            suffix={t("天")}
          />
        )}
      </Fold>
    </>
  );
}
