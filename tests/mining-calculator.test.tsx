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

describe("mining calculator page", () => {
  test("leads with the answer, keeps the form short and folds the rest away", () => {
    const html = renderToStaticMarkup(<MiningCalculator onBack={() => {}} />);
    for (const label of [
      "挖矿计算",
      "关键结果",
      "期望产量",
      "保本租金 / 天",
      "难度",
      "设备",
      "显卡 1",
      "矿池矿工",
      "官方矿工",
      "算力与功耗",
      "QTC 价格",
      "更多设置",
      "在线率",
      "矿池费率",
      "电价",
      "估算结果",
      "计算方法与假设",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-label="返回"');
    expect(html).toContain("RTX 4090");
    expect(html).not.toContain("<select");
    expect(html).toContain('role="combobox"');
    // The secondary settings and the tables are there, but behind a disclosure.
    expect(html.match(/<details/g)?.length ?? 0).toBeGreaterThan(2);
  });
  test("names the market, links to it and stays usable when the quote is out of reach", () => {
    const html = renderToStaticMarkup(<MiningCalculator onBack={() => {}} />);
    expect(html).toContain("SafeTrade · QUAN/USDT");
    expect(html).toContain('href="https://safetrade.com/exchange/QUAN-USDT?type=basic"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("暂时取不到市场价，请手动填写");
    expect(html).not.toContain("尚未上市");
  });
  test("renders in English", () => {
    setLanguage("en");
    const html = renderToStaticMarkup(<MiningCalculator onBack={() => {}} />);
    setLanguage("zh");
    expect(html).toContain("Mining calculator");
    expect(html).toContain("Break-even rent");
    expect(html).toContain("Break-even price");
    expect(html).toContain("More settings");
    expect(html).not.toMatch(/[一-鿿]/);
  });
});

describe("mining results", () => {
  test("shows the worked example for one RTX 4090", () => {
    const html = results(model());
    expect(html).toContain("0.1137");
    expect(html).toContain("保本价（电费）");
    expect(html).toContain("8.02 USDT/QTC");
    expect(html).toContain("整机保本租金");
    expect(html).toContain("填写 QTC 价格后显示");
    expect(html).toContain("难度上涨敏感性");
    expect(html).toContain("× 1.5");
    expect(html).toContain("显卡对比");
    for (const gpu of ["RTX 5090", "RTX 4070 Ti", "RTX 3080 Ti", "RTX 5060 Ti"]) expect(html).toContain(gpu);
    expect(html).toContain("500 W");
    expect(html).not.toContain("各显卡明细");
    expect(html).not.toContain("<dt>回本时间</dt>");
  });
  test("prices revenue, profit, rent budget and payback once a price is given", () => {
    const html = results(model("20", "1800"));
    // 0.1137 QTC/day × 20 = 2.27 revenue, less 0.91 of electricity = 1.36 of rent.
    expect(html).toContain("2.27");
    expect(html).toContain("1.36");
    expect(html).toContain("保本价（含折旧）");
    expect(html).toContain("<dt>回本时间</dt>");
    expect(html).toContain("利润率");
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
    expect(market).toContain("SafeTrade 最新价");
    expect(market).toContain("8.02");
    const manual = summary(model("20"));
    expect(manual).toContain("你填写的");
    const none = summary(model());
    expect(none).toContain("填写 QTC 价格");
    // Output and break-even price are there without a price; profit and rent are not.
    expect(none).toContain("0.1137");
    expect(none).toContain("8.02");
  });
});
