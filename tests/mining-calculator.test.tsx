import { afterAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MiningCalculator } from "../src/components/tools/MiningCalculator";
import { MiningResults } from "../src/components/tools/MiningResults";
import { setLanguage } from "../src/lib/i18n";
import { BUILT_IN_TERMS } from "../src/lib/mining/gpus";
import { defaultInputs, toModel } from "../src/lib/mining/inputs";
import type { Network } from "../src/lib/mining/math";

const NETWORK: Network = {
  difficulty: 248_898_629_370_016n,
  blockTimeSeconds: 12.28,
  blockRewardPlanck: 310_000_000_000n,
};

afterAll(() => setLanguage("zh"));

describe("mining calculator page", () => {
  test("renders inputs, network panel and method without any network access", () => {
    const html = renderToStaticMarkup(<MiningCalculator onBack={() => {}} />);
    for (const label of ["挖矿计算", "网络状态", "设备", "显卡 1", "矿池矿工", "官方矿工", "费率与在线率", "在线率", "矿池费率", "成本", "电价", "QTC 价格", "估算结果", "计算方法与假设"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-label="返回"');
    expect(html).toContain("RTX 4090");
    expect(html).not.toContain("<select");
    expect(html).toContain('role="combobox"');
  });
  test("renders in English", () => {
    setLanguage("en");
    const html = renderToStaticMarkup(<MiningCalculator onBack={() => {}} />);
    setLanguage("zh");
    expect(html).toContain("Mining calculator");
    expect(html).toContain("Miner software fee");
    expect(html).toContain("Break-even price");
    expect(html).not.toMatch(/[一-鿿]/);
  });
});

describe("mining results", () => {
  const model = (price = "", hardwareCost = "") => {
    const inputs = defaultInputs(BUILT_IN_TERMS);
    inputs.price = price;
    inputs.hardwareCost = hardwareCost;
    return toModel(inputs, BUILT_IN_TERMS);
  };
  test("shows the worked example for one RTX 4090", () => {
    const html = renderToStaticMarkup(
      <MiningResults network={NETWORK} model={model()} terms={BUILT_IN_TERMS} pool={null} loading={false} />,
    );
    expect(html).toContain("0.1137");
    expect(html).toContain("保本价（电费）");
    expect(html).toContain("8.02 USD/QTC");
    expect(html).toContain("填写 QTC 价格后显示收入和利润");
    expect(html).toContain("难度上涨敏感性");
    expect(html).toContain("× 1.5");
    expect(html).toContain("显卡对比");
    for (const gpu of ["RTX 5090", "RTX 4070 Ti", "RTX 3080 Ti", "RTX 5060 Ti"]) expect(html).toContain(gpu);
    expect(html).toContain("500 W");
    expect(html).not.toContain("各显卡明细");
    expect(html).not.toContain("<dt>回本时间</dt>");
  });
  test("prices revenue, profit and payback once a price and hardware cost are given", () => {
    const html = renderToStaticMarkup(
      <MiningResults network={NETWORK} model={model("20", "1800")} terms={BUILT_IN_TERMS} pool={null} loading={false} />,
    );
    expect(html).toContain("≈ 2.27 USD / 天");
    expect(html).toContain("保本价（含折旧）");
    expect(html).toContain("<dt>回本时间</dt>");
    expect(html).toContain("利润率");
    expect(html).toContain("按利润排序。");
  });
  test("waits for the network instead of inventing numbers", () => {
    const html = renderToStaticMarkup(
      <MiningResults network={null} model={model()} terms={BUILT_IN_TERMS} pool={null} loading={false} />,
    );
    expect(html).toContain("需要链上难度和区块奖励才能估算");
    expect(html).not.toContain("QTC/QTC");
    expect(html).toContain("计算方法与假设");
  });
});
