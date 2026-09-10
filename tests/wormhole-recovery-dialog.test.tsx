import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { encodeAddress } from "@polkadot/util-crypto";
import { WormholeRecoveryDialog } from "../src/components/dialogs/WormholeRecoveryDialog";
import { WORMHOLE_EXIT_MAX_INPUTS } from "../src/lib/wormhole/exit";
import type { WormholeScanSnapshot, WormholeScannedDeposit } from "../src/lib/wormhole/scan";
import type { Wallet } from "../src/lib/vault";

const noop = () => {};
const address = (fill: number) => encodeAddress(new Uint8Array(32).fill(fill), 189);
const QTC = 1_000_000_000_000n;

const wallets: Wallet[] = [
  { id: "w1", name: "主钱包", address: address(1), kind: "mldsa65", index: 0, createdAt: 1 },
  { id: "w2", name: "观察", address: address(2), kind: "watch", watchKind: "wormhole", index: 0, createdAt: 2 },
];

function deposit(overrides: Partial<WormholeScannedDeposit> & Pick<WormholeScannedDeposit, "id" | "spent">): WormholeScannedDeposit {
  return {
    branch: 0,
    index: 0,
    address: address(3),
    amountPlanck: (5n * QTC).toString(),
    blockHeight: 1200,
    blockHash: "0x" + "ab".repeat(32),
    leafIndex: "7",
    transferCount: "0",
    toHash: "0x" + "cd".repeat(32),
    nullifier: "0x" + "ef".repeat(32),
    timestamp: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

function snapshot(deposits: WormholeScannedDeposit[], expectedAddressFound?: boolean): WormholeScanSnapshot {
  const sum = (spent: boolean) => deposits.filter((d) => d.spent === spent).reduce((total, d) => total + BigInt(d.amountPlanck), 0n).toString();
  return {
    blockHeight: 123456,
    blockHash: "0x" + "11".repeat(32),
    indexedHeight: 123460,
    deposits,
    unspentPlanck: sum(false),
    spentPlanck: sum(true),
    branches: [
      { branch: 0, scanned: 40, used: [0] },
      { branch: 1, scanned: 20, used: [] },
    ],
    ...(expectedAddressFound === undefined ? {} : { expectedAddressFound }),
    createdAt: 1,
  };
}

describe("wormhole recovery dialog", () => {
  it("renders the introduction with costs, requirements, tutorial and a start button", () => {
    const html = renderToStaticMarkup(<WormholeRecoveryDialog wallets={wallets} onClose={noop} onBack={noop} />);
    expect(html).toContain("加密账户恢复");
    expect(html).toContain("找回转入加密账户的资产");
    expect(html).toContain("0.04%");
    expect(html).toContain("1 GB");
    expect(html).toContain("详细教程");
    expect(html).toContain("<ol");
    expect(html).toContain("开始扫描");
    expect(html).toContain('class="modal wide modal-flow"');
    // No withdrawals yet: the history list stays hidden.
    expect(html).not.toContain("此前的取回记录");
    // The phrase field belongs to the next step only.
    expect(html).not.toContain("<textarea");
  });

  it("renders the results step with totals, the match badge and selectable unspent deposits", () => {
    const deposits = [
      deposit({ id: "a", spent: false }),
      deposit({ id: "b", spent: true, amountPlanck: (2n * QTC).toString(), transferCount: "1" }),
      deposit({ id: "c", spent: false, branch: 1, index: 4, amountPlanck: "1500000000000", timestamp: undefined, blockHeight: 1300 }),
    ];
    const html = renderToStaticMarkup(
      <WormholeRecoveryDialog wallets={wallets} onClose={noop} initialSnapshot={snapshot(deposits, true)} />,
    );
    expect(html).toContain("扫描结果");
    expect(html).toContain("地址已匹配");
    expect(html).toContain("6.5 QTC");
    expect(html).toContain("1 条 · 2 QTC");
    expect(html).toContain("#123,456");
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect(html).toContain("找零 4");
    expect(html).toContain("区块 #1,300");
    expect(html).toContain(`已选择 0 / 2 条`);
    expect(html).toContain("取回所选入账");
    expect(html).not.toContain("没有找到可取回的入账");
    expect(WORMHOLE_EXIT_MAX_INPUTS).toBeGreaterThan(0);
  });

  it("shows the empty state and the not-found badge for a phrase without deposits", () => {
    const html = renderToStaticMarkup(
      <WormholeRecoveryDialog wallets={[]} onClose={noop} initialSnapshot={snapshot([], false)} />,
    );
    expect(html).toContain("没有找到可取回的入账");
    expect(html).toContain("未在派生地址中找到");
    expect(html).toContain("0 QTC");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("重新扫描");
  });
});
