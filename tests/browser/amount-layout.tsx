import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { WalletLayout } from "../../src/components/wallet/WalletLayout";
import { WalletOverview } from "../../src/components/wallet/WalletOverview";
import { ActivityPanel } from "../../src/components/wallet/ActivityPanel";
import type { Wallet } from "../../src/lib/vault";
import "../../src/style.css";

// This fixture uses presentation components only: no vault, RPC or signing calls.
if (!import.meta.env.DEV) throw new Error("Development fixture only");
const cases = [
  ["zero", "0", "0"],
  ["one", "1000000000000", "1"],
  ["smallest unit", "1", "0.000000000001"],
  ["reported balance", "101861966975000", "101.861966975"],
  ["12 characters", "12345678901000", "12.345678901"],
  ["13 characters", "999999999999000", "999.999999999"],
  ["14 characters", "101123456789100", "101.1234567891"],
  ["all decimals", "101123456789123", "101.123456789123"],
  ["grouped integer", "100000000000000000000", "100,000,000"],
  ["long integer", "999999999999000000000000", "999,999,999,999"],
  [
    "u128 maximum",
    "340282366920938463463374607431768211455",
    "340,282,366,920,938,463,463,374,607.431768211455",
  ],
] as const;
const wallet: Wallet = {
  id: "layout-fixture",
  name: "观察钱包",
  address: "layout-fixture-address",
  kind: "watch",
  watchKind: "standard",
  index: 0,
  createdAt: 0,
};
const root = createRoot(document.getElementById("root")!);
const noop = () => {};
let selected = 3;
let hidden = false;
function renderCase(index = selected, mask = hidden) {
  selected = index;
  hidden = mask;
  const [, free] = cases[index];
  flushSync(() =>
    root.render(
      <div className="wallet-app page-overview">
        <WalletLayout
          page="overview"
          wallets={[wallet]}
          wallet={wallet}
          network={null}
          networkError=""
          balanceError=""
          loading={false}
          unlocked
          hasVault
          pendingCount={0}
          onPageChange={noop}
          onOpen={noop}
          onLock={noop}
          onRefresh={noop}
        >
          <WalletOverview
            wallet={wallet}
            balance={{
              free,
              reserved: "0",
              frozen: "0",
              spendable: free,
              block: 0,
            }}
            hidden={hidden}
            loading={false}
            wormholeInfo={null}
            onToggleHidden={() => renderCase(selected, !hidden)}
            onOpen={noop}
            onCopyAddress={async () => {}}
          />
          <ActivityPanel
            page="overview"
            wallet={wallet}
            unlocked
            pending={[]}
            transactions={[]}
            visibleTransactions={[]}
            filter="all"
            query=""
            historyError=""
            historyLoading={false}
            more={false}
            onFilterChange={noop}
            onQueryChange={noop}
            onShowAll={noop}
            onReload={noop}
            onLoadMore={noop}
          />
        </WalletLayout>
      </div>,
    ),
  );
}
function check() {
  const balance = document.querySelector<HTMLElement>(".hero-balance")!;
  const number = balance.firstElementChild!;
  const unit = balance.lastElementChild!;
  const range = document.createRange();
  range.selectNodeContents(number);
  const glyphs = [...range.getClientRects()];
  const box = balance.getBoundingClientRect();
  const currency = unit.getBoundingClientRect();
  const errors: string[] = [];
  if (number.textContent !== (hidden ? "••••" : cases[selected][2]))
    errors.push("Amount precision changed");
  if (glyphs.some((r) => r.left < box.left - 1 || r.right > currency.left - 4))
    errors.push("Number exceeds its space or overlaps QTC");
  if (currency.right > box.right + 1)
    errors.push("QTC exceeds the balance container");
  if (parseFloat(getComputedStyle(balance).fontSize) < 24)
    errors.push("Amount too small to read");
  if (document.documentElement.scrollWidth > innerWidth)
    errors.push("Page overflows horizontally");
  return {
    case: cases[selected][0],
    width: innerWidth,
    theme: document.documentElement.dataset.theme,
    hidden,
    errors,
  };
}
Object.assign(window, { amountLayout: { cases, renderCase, check } });
renderCase();
