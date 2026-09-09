import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityPanel } from "../src/components/wallet/ActivityPanel";
import type { Transaction } from "../src/lib/chain";
import type { Pending, Wallet } from "../src/lib/vault";

const wallet = {
  id: "test",
  name: "Test",
  address: "test-recipient",
  kind: "watch",
  index: 0,
  createdAt: 0,
} as Wallet;
const pending: Pending = {
  hash: "0xpending",
  address: wallet.address,
  to: "test-destination",
  amount: "1",
  fee: "0",
  startBlock: 1,
  createdAt: 0,
  status: "unknown",
};
const noop = () => {};
function render(query = "", filter = "all", records: Transaction[] = []) {
  return renderToStaticMarkup(
    <ActivityPanel
      page="activity"
      wallet={wallet}
      unlocked
      pending={[pending]}
      transactions={records}
      visibleTransactions={records}
      filter={filter}
      query={query}
      historyError=""
      historyLoading={false}
      more={false}
      onFilterChange={noop}
      onQueryChange={noop}
      onShowAll={noop}
      onReload={noop}
      onLoadMore={noop}
    />,
  );
}

describe("activity feedback", () => {
  it("does not show an empty history below a submitted transaction", () => {
    const html = render();
    expect(html).toContain("0xpending");
    expect(html).not.toContain("暂无交易记录");
    expect(html).not.toContain('class="spin"');
  });
  it("applies trimmed case-insensitive search to the submission journal", () => {
    expect(render("  0xPENDING  ")).toContain("0xpending");
    const html = render("unrelated-address");
    expect(html).not.toContain("0xpending");
    expect(html).toContain("没有符合条件的记录");
    expect(html).toContain("试试其他地址");
  });
  it("does not include outbound submissions in incoming or mining filters", () => {
    expect(render("", "in")).not.toContain("0xpending");
    expect(render("", "mining")).not.toContain("0xpending");
    expect(render("", "out")).toContain("0xpending");
  });
  it("never marks failed incoming transfers as positive credited funds", () => {
    const tx = {
      id: "failed",
      hash: "0x" + "f".repeat(64),
      from: "sender",
      to: wallet.address,
      amount: "1",
      type: "IMMEDIATE",
      status: "FAILED",
      timestamp: "2026-09-10T00:00:00Z",
    } as Transaction;
    const html = render("", "all", [tx]);
    expect(html).not.toContain("positive");
    expect(html).not.toContain("+0.000000000001");
    expect(html).toContain("0.000000000001");
    expect(html).toContain("失败");
  });
});
