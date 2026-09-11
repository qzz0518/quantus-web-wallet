import { afterAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkDashboard, type NetworkState } from "../src/components/tools/NetworkPage";
import { setLanguage } from "../src/lib/i18n";

afterAll(() => setLanguage("zh"));

/** Readings taken from mainnet on 2026-09-11. */
const STATE: NetworkState = {
  chain: {
    height: 27_784,
    difficulty: 223_590_508_401_362n,
    lastBlockDurationMs: 15_567,
    blockTimeSeconds: 17.468,
    sampledBlocks: 200,
    fetchedAt: 1_789_000_000_000,
  },
  issuancePlanck: 5_678_494_528_063_958_854n,
  daily: [
    { date: "2026-09-09", blocks: 17_193, transactions: 6369, activeAccounts: 26 },
    { date: "2026-09-10", blocks: 6972, transactions: 8839, activeAccounts: 553 },
    { date: "2026-09-11", blocks: 3608, transactions: 5882, activeAccounts: 684 },
  ],
  totals: { blockHeight: 27_772, totalAccounts: 2045, totalMiners: 77, totalMinerRewards: 27_772, fetchedAt: 1_789_000_000_000 },
  blocks24h: 5752,
  errors: {},
  loading: false,
  fetchedAt: 1_789_000_000_000,
};

const render = (state: NetworkState, price: number | null = null) =>
  renderToStaticMarkup(<NetworkDashboard data={state} price={price} onBack={() => {}} onRefresh={() => {}} />);

describe("network dashboard", () => {
  test("leads with the four figures that describe the chain right now", () => {
    const html = render(STATE);
    expect(html).toContain("27,784");
    expect(html).toContain("12.8 TH/s");
    expect(html).toContain("17.47 s");
    expect(html).toContain("0.3064");
  });

  test("answers the halving question with the decay, not a schedule", () => {
    const html = render(STATE);
    expect(html).toContain("没有减半台阶");
    expect(html).toContain("50,000,000");
    expect(html).toContain("19.2 年");
    expect(html).not.toContain("减半周期");
  });

  test("states the supply as a share of the cap", () => {
    const html = render(STATE);
    expect(html).toContain("27.04%");
    expect(html).toContain("21,000,000");
    expect(html).toContain("runtime 152");
  });

  test("draws one bar per indexed day and says so when there are fewer than 30", () => {
    const html = render(STATE);
    expect(html.match(/class="chart-bar/g)?.length).toBe(3);
    expect(html).toContain("索引器目前只有 3 天的每日统计");
    expect(html).toContain("2,045");
  });

  test("prints a dollar value for the reward only when a price is known", () => {
    expect(render(STATE)).toContain("按剩余待发行量计算");
    expect(render(STATE, 12.5)).toContain("$3.83");
  });

  test("shows dashes and the read errors instead of inventing figures", () => {
    const html = render({
      ...STATE,
      chain: null,
      issuancePlanck: null,
      daily: null,
      totals: null,
      blocks24h: null,
      errors: { chain: "节点拒绝了请求。", issuance: "节点拒绝了请求。" },
    });
    expect(html).toContain("链上数据读取失败");
    expect(html).toContain("发行量读取失败");
    expect(html).toContain("需要链上发行量才能计算");
    expect(html).not.toContain("chart-bar");
  });

  test("translates the whole page", () => {
    setLanguage("en");
    const html = render(STATE);
    expect(html).toContain("Issuance and reward decay");
    expect(html).toContain("Reward halves in");
    expect(html).toContain("no halving step");
    expect(html).not.toContain("没有减半台阶");
    setLanguage("zh");
  });
});
