import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { encodeAddress } from "@polkadot/util-crypto";
import { WormholeDeposit } from "../src/components/dialogs/WormholeDeposit";
import { nextUnusedWormholeIndex } from "../src/lib/wormhole/scan";
import type { WormholeScanSnapshot } from "../src/lib/wormhole/scan";
import type { WormholeRules } from "../src/lib/wormhole/types";
import type { Wallet } from "../src/lib/vault";

const address = (fill: number) => encodeAddress(new Uint8Array(32).fill(fill), 189);
const branches = (used: number[], scanned = 20): WormholeScanSnapshot["branches"] => [
  { branch: 0, scanned, used },
  { branch: 1, scanned: 20, used: [] },
];
const snapshot = (used: number[], scanned = 20): WormholeScanSnapshot => ({
  blockHeight: 27_000,
  blockHash: "0x" + "11".repeat(32),
  indexedHeight: 27_010,
  deposits: [],
  unspentPlanck: "0",
  spentPlanck: "0",
  branches: branches(used, scanned),
  createdAt: 1,
});

const rules: WormholeRules = {
  specVersion: 152,
  transactionVersion: 6,
  genesisHash: "0x" + "fb".repeat(32),
  volumeFeeBps: 4,
  aggregatorRatePpm: 0,
  quantumPlanck: "10000000000",
  blockHashCount: 4096,
  existentialDepositPlanck: "1000000000",
};

const wallets: Wallet[] = [
  { id: "w1", name: "主钱包", address: address(1), kind: "mldsa65", mnemonic: "phrase", index: 0, createdAt: 1 },
  { id: "w2", name: "只看", address: address(2), kind: "watch", watchKind: "standard", index: 0, createdAt: 2 },
];

describe("next unused receiving index", () => {
  it("starts at zero when nothing has been paid into", () => {
    expect(nextUnusedWormholeIndex(snapshot([]))).toBe(0);
  });

  it("skips every index that already took a deposit", () => {
    expect(nextUnusedWormholeIndex(snapshot([0, 1, 2]))).toBe(3);
    expect(nextUnusedWormholeIndex(snapshot([0, 2, 3]))).toBe(1);
  });

  it("walks past an index already offered, and past used ones after it", () => {
    const scan = snapshot([0, 2, 3]);
    expect(nextUnusedWormholeIndex(scan, 1)).toBe(4);
    expect(nextUnusedWormholeIndex(scan, 4)).toBe(5);
    // A negative or fractional starting point still lands on a whole index.
    expect(nextUnusedWormholeIndex(scan, -10)).toBe(1);
    expect(nextUnusedWormholeIndex(scan, 1.7)).toBe(4);
  });

  it("treats a snapshot without a receiving branch as unused", () => {
    expect(nextUnusedWormholeIndex({ branches: [
      { branch: 1, scanned: 20, used: [0, 1] },
      { branch: 1, scanned: 20, used: [] },
    ] as unknown as WormholeScanSnapshot["branches"] })).toBe(0);
  });
});

describe("deposit panel", () => {
  const state = {
    walletId: "w1",
    snapshot: snapshot([0, 1]),
    index: 2,
    address: address(7),
  };

  it("shows the derived address, its index, a code and the chain's own numbers", () => {
    const html = renderToStaticMarkup(
      <WormholeDeposit wallets={wallets} initial={state} initialRules={rules} />,
    );
    expect(html).toContain(address(7));
    expect(html).toContain("隐私地址 #2");
    // The address code is rendered inline, not fetched.
    expect(html).toContain('class="receive-qr"');
    expect(html).toContain('shape-rendering="crispEdges"');
    expect(html).toContain("校验短语");
    // 0.01 QTC granularity and 0.04% fee, both read from the rules.
    expect(html).toContain("0.01");
    expect(html).toContain("0.04%");
    // Only signing wallets can derive one.
    expect(html).not.toContain("只看");
    expect(html).toContain("换下一个地址");
  });

  it("offers the send flow only when the host can open it, and copying otherwise", () => {
    const plain = renderToStaticMarkup(
      <WormholeDeposit wallets={wallets} initial={state} initialRules={rules} />,
    );
    expect(plain).toContain("复制隐私地址");
    expect(plain).not.toContain("从本钱包转入");
    expect(plain).not.toContain("把这个地址加入观察列表");
    const wired = renderToStaticMarkup(
      <WormholeDeposit
        wallets={wallets}
        initial={state}
        initialRules={rules}
        onDeposit={() => {}}
        onWatch={async () => {}}
      />,
    );
    expect(wired).toContain("从本钱包转入");
    expect(wired).toContain("把这个地址加入观察列表");
  });

  it("explains why a watch-only wallet cannot derive one, and offers no button", () => {
    const html = renderToStaticMarkup(<WormholeDeposit wallets={[wallets[1]]} />);
    expect(html).toContain("观察钱包没有助记词");
    expect(html).not.toContain("生成隐私地址");
    expect(html).not.toContain("qrcode");
    expect(html).not.toContain("隐私地址 #");
  });

  it("asks for the scan before it will show an address", () => {
    const html = renderToStaticMarkup(<WormholeDeposit wallets={wallets} />);
    expect(html).toContain("生成隐私地址");
    expect(html).toContain("官方索引服务会看到这些地址和你的 IP");
    expect(html).not.toContain("隐私地址 #");
  });
});
