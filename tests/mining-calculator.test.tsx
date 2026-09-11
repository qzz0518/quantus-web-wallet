import { afterAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MiningCalculator } from "../src/components/tools/MiningCalculator";
import { MiningResults } from "../src/components/tools/MiningResults";
import { MiningSummary } from "../src/components/tools/MiningSummary";
import { setLanguage } from "../src/lib/i18n";
import { BUILT_IN_TERMS } from "../src/lib/mining/gpus";
import { defaultInputs, toModel, type Model } from "../src/lib/mining/inputs";
import { estimate, type Network } from "../src/lib/mining/math";

const NETWORK: Network = {
  difficulty: 248_898_629_370_016n,
  blockTimeSeconds: 12.28,
  blockRewardPlanck: 310_000_000_000n,
};

afterAll(() => setLanguage("zh"));

const model = (price: string | null = null, hardwareCost = "", market: number | null = null): Model => {
  const inputs = defaultInputs(BUILT_IN_TERMS);
  inputs.price = price;
  inputs.hardwareCost = hardwareCost;
  return toModel(inputs, BUILT_IN_TERMS, market);
};
const rented = (price: string | null = "20"): Model => {
  const inputs = defaultInputs(BUILT_IN_TERMS);
  inputs.price = price;
  inputs.costMode = "rental";
  inputs.rent = "3";
  return toModel(inputs, BUILT_IN_TERMS, null);
};
const results = (value: Model) =>
  renderToStaticMarkup(
    <MiningResults
      network={NETWORK}
      model={value}
      result={estimate(NETWORK, value.devices, value.assumptions, value.costs)}
      terms={BUILT_IN_TERMS}
      pool={null}
      loading={false}
    />,
  );
const summary = (value: Model) =>
  renderToStaticMarkup(
    <MiningSummary
      result={estimate(NETWORK, value.devices, value.assumptions, value.costs)}
      model={value}
      loading={false}
      hasNetwork
      onNeedPrice={() => {}}
    />,
  );
/** Just the estimate card, without the folds that open on demand. */
const estimateCard = (html: string) => {
  const start = html.indexOf('aria-label="估算结果"');
  return html.slice(start, html.indexOf("</section>", start));
};

describe("mining calculator page", () => {
  test("leads with the answer, keeps the form short and folds the rest away", () => {
    const html = renderToStaticMarkup(<MiningCalculator onBack={() => {}} />);
    for (const label of [
      "挖矿计算",
      "关键结果",
      "期望产量",
      "保本电价",
      "难度",
      "参数",
      "型号",
      "矿池矿工",
      "官方矿工",
      "算力与功耗",
      "QTC 价格",
      "电价",
      "更多设置",
      "在线率",
      "矿池费率",
      "估算结果",
      "计算方法与假设",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-label="返回"');
    expect(html).toContain("RTX 4090");
    expect(html).not.toContain("<select");
    expect(html).toContain('role="combobox"');
    // A single card is the whole rig, so it needs no number of its own.
    expect(html).not.toContain("显卡 1");
    // The secondary settings and the tables are there, but behind a disclosure.
    expect(html.match(/<details/g)?.length ?? 0).toBeGreaterThan(2);
  });
  test("puts the rarely typed settings behind the disclosure, not in the card", () => {
    const html = renderToStaticMarkup(<MiningCalculator onBack={() => {}} />);
    const fold = html.indexOf("更多设置");
    for (const late of ["输入方式", "在线率", "矿池费率", "货币", "折旧天数"]) {
      expect(html.indexOf(late)).toBeGreaterThan(fold);
    }
    // The two figures that change most often stay in the open card.
    for (const early of ["电价", "QTC 价格"]) expect(html.indexOf(early)).toBeLessThan(fold);
  });
  test("names the market, links to it and stays usable when the quote is out of reach", () => {
    const html = renderToStaticMarkup(<MiningCalculator onBack={() => {}} />);
    expect(html).toContain("SafeTrade · QUANTUS/USDT");
    expect(html).toContain('href="https://safetrade.com/exchange/QUANTUS-USDT?type=basic"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("暂时取不到市场价，请手动填写");
    expect(html).not.toContain("尚未上市");
  });
  test("renders in English", () => {
    setLanguage("en");
    const html = renderToStaticMarkup(<MiningCalculator onBack={() => {}} />);
    setLanguage("zh");
    expect(html).toContain("Mining calculator");
    expect(html).toContain("Break-even electricity");
    expect(html).toContain("Break-even price");
    expect(html).toContain("More settings");
    expect(html).not.toMatch(/[一-鿿]/);
  });
});

describe("mining results", () => {
  test("shows the other periods with the cost beside the revenue", () => {
    const html = results(model("20"));
    expect(html).toContain("每小时");
    expect(html).toContain("每周");
    expect(html).toContain("30 天");
    expect(html).toContain("成本");
    expect(html).toContain("收入");
    // 0.1137 QTC/day × 20 = 2.27/day, so 15.91 a week and 68.19 over 30 days.
    expect(html).toContain("15.91");
    expect(html).toContain("68.19");
    expect(html).toContain("每日用电");
    expect(html).toContain("难度与运气");
    expect(html).toContain("× 1.5");
    expect(html).toContain("显卡对比");
    for (const gpu of ["RTX 5090", "RTX 4070 Ti", "RTX 3080 Ti", "RTX 5060 Ti"]) expect(html).toContain(gpu);
    expect(html).toContain("500 W");
    expect(html).not.toContain("各显卡明细");
    expect(html).not.toContain("<dt>回本时间</dt>");
  });
  test("never reprints a figure the headline already carries", () => {
    const card = estimateCard(results(model("20")));
    // Output, profit and both break-even lines are stated once, up top.
    for (const headline of ["0.1137", "8.02", "保本价", "利润率", "总成本", "整机保本租金"]) {
      expect(card).not.toContain(headline);
    }
    // The day is the headline's; the periods here start at the hour.
    expect(card).not.toContain('<th scope="row">每天</th>');
    const rent = estimateCard(results(rented()));
    expect(rent).not.toContain('<th scope="row">每天</th>');
    expect(rent).toContain("租金");
  });
  test("adds the amortised figures only when hardware is paid for", () => {
    const html = results(model("20", "1800"));
    expect(html).toContain("保本价（含折旧）");
    expect(html).toContain("<dt>折旧 / 天</dt>");
    expect(html).toContain("<dt>电费 / 天</dt>");
    expect(html).toContain("<dt>回本时间</dt>");
    expect(html).toContain("按保本租金排序。");
  });
  test("waits for the network instead of inventing numbers", () => {
    const html = renderToStaticMarkup(
      <MiningResults network={null} model={model()} result={null} terms={BUILT_IN_TERMS} pool={null} loading={false} />,
    );
    expect(html).toContain("需要链上难度和区块奖励才能估算");
    expect(html).not.toContain("QTC/QTC");
    expect(html).toContain("计算方法与假设");
  });
});

describe("headline figures", () => {
  test("says where the price came from and keeps break-even independent of it", () => {
    const market = summary(model(null, "", 47));
    expect(market).toContain("SafeTrade 市场价");
    expect(market).toContain("8.02");
    const manual = summary(model("20"));
    expect(manual).toContain("你填写的 QTC 价格");
    const none = summary(model());
    expect(none).toContain("填写 QTC 价格");
    // Output and break-even price are there without a price; profit is not.
    expect(none).toContain("0.1137");
    expect(none).toContain("8.02");
  });
  test("asks about the cost the reader actually pays", () => {
    // Own hardware buys kilowatt-hours: a rent budget there would only be
    // the profit again, so the fourth figure is the electricity ceiling.
    const own = summary(model("20"));
    expect(own).toContain("保本电价");
    expect(own).toContain("kWh");
    expect(own).not.toContain("保本租金");
    const rig = summary(rented());
    expect(rig).toContain("保本租金 / 天");
    expect(rig).not.toContain("保本电价");
  });
});
