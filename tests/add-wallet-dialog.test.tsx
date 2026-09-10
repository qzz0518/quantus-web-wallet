import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AddWalletDialog } from "../src/components/dialogs/AddWalletDialog";

const noop = () => {};
const save = async () => {};

describe("add wallet dialog schemes", () => {
  it("imports default to ML-DSA-65 with ML-DSA-87 selectable and previews the address first", () => {
    const html = renderToStaticMarkup(
      <AddWalletDialog mode="import" wallets={[]} onClose={noop} onSave={save} />,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain("ML-DSA-65（官方钱包默认）");
    expect(html).toMatch(/<button[^>]*role="combobox"[^>]*aria-label="签名方案"/);
    expect(html).not.toContain("仅支持 ML-DSA-87");
    expect(html).toContain("m/44′/189189′/0′/0′/1′");
    expect(html).toContain("查看地址");
    expect(html).not.toContain("确认导入");
  });

  it("offers the ML-DSA-87 scheme as an advanced option when creating a wallet", () => {
    const html = renderToStaticMarkup(
      <AddWalletDialog mode="create" wallets={[]} onClose={noop} onSave={save} />,
    );
    expect(html).toContain("高级选项");
    expect(html).toContain('aria-label="签名方案"');
    expect(html).toContain("m/44′/189189′/0′/0′/1′");
  });

  it("does not show scheme controls for watch-only wallets", () => {
    const html = renderToStaticMarkup(
      <AddWalletDialog mode="watch" wallets={[]} onClose={noop} onSave={save} />,
    );
    expect(html).not.toContain("签名方案");
    expect(html).toContain("Wormhole");
  });
});
