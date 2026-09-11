import { afterAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MinerPage } from "../src/components/tools/MinerPage";
import { setLanguage } from "../src/lib/i18n";

afterAll(() => setLanguage("zh"));

const render = () => renderToStaticMarkup(<MinerPage wallets={[]} onBack={() => {}} />);

describe("miner dashboard", () => {
  test("opens on the address form with the windows waiting for one", () => {
    const html = render();
    expect(html).toContain("矿工地址");
    expect(html).toContain("近 24 小时");
    expect(html).toContain("近 7 天");
    expect(html).toContain("近 30 天");
    expect(html).toContain("累计出块");
    expect(html).toContain("尚未读取");
  });

  test("shows no charts, sources or empty-state claim before an address is looked up", () => {
    const html = render();
    expect(html).not.toContain("chart-bar");
    expect(html).not.toContain("转入来源");
    expect(html).not.toContain("没有挖矿收入");
  });

  test("translates the whole page", () => {
    setLanguage("en");
    const html = render();
    expect(html).toContain("Miner address");
    expect(html).toContain("Blocks mined");
    expect(html).not.toContain("矿工地址");
    setLanguage("zh");
  });
});
