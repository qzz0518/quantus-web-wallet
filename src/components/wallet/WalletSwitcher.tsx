import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Eye,
  Plus,
  Wallet as WalletIcon,
} from "lucide-react";
import type { Wallet } from "../../lib/vault";
import { formatAmount, shortAddress } from "../../lib/amount";
import { useT } from "../../lib/i18n";
import { fiatValue, formatUsd, useMarketPrice } from "../../lib/market";
import {
  sumPublicBalances,
  walletBalanceKind,
  type PublicBalance,
} from "../../lib/wallet";
import { Modal } from "../Modal";

const HIDDEN = "••••";
/** Enough precision to tell the wallets apart without a column of long numbers. */
const LIST_DECIMALS = 4;

type WalletSwitcherProps = {
  wallets: Wallet[];
  wallet?: Wallet;
  balances: Record<string, PublicBalance | undefined>;
  hidden: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
  onAdd: () => void;
};

export function WalletSwitcher({
  wallets,
  wallet,
  balances,
  hidden,
  onSelect,
  onClose,
  onAdd,
}: WalletSwitcherProps) {
  const t = useT();
  const price = useMarketPrice();
  const totals = sumPublicBalances(wallets, balances);
  // A figure is only shown once every wallet that should have one reported it;
  // a partial sum would read as the whole and is worse than no number.
  const complete = totals.missing === 0 && totals.counted > 0;
  const notes = [
    totals.missing > 0 ? t("部分余额未更新") : "",
    totals.encrypted > 0 ? t("不含 {0} 个加密账户", totals.encrypted) : "",
    totals.unclassified > 0
      ? t("不含 {0} 个待确认账户", totals.unclassified)
      : "",
  ].filter(Boolean);
  return (
    <Modal title={t("切换钱包")} variant="flow" onClose={onClose}>
      <div className="flow-body">
        <div className="wallet-total" aria-label={t("总资产")}>
          <div className="wallet-total-head">
            <span>{t("总资产")}</span>
            {complete && price && !hidden && (
              <span className="wallet-total-fiat">
                ≈ {formatUsd(fiatValue(totals.total, price.last))}
              </span>
            )}
          </div>
          <strong className="wallet-total-amount">
            {hidden
              ? HIDDEN
              : complete
                ? formatAmount(totals.total, LIST_DECIMALS)
                : "—"}
            <small>QTC</small>
          </strong>
          {notes.length > 0 && (
            <p className="wallet-total-note">{notes.join(" · ")}</p>
          )}
        </div>
        <div className="wallet-switcher-list">
          {wallets.map((w, i) => {
            const balance =
              walletBalanceKind(w) === "standard"
                ? balances[w.address]
                : undefined;
            const amount = balance
              ? BigInt(balance.free) + BigInt(balance.reserved)
              : null;
            return (
              <button
                key={w.id}
                className={`wallet-switcher-item ${wallet?.id === w.id ? "selected" : ""}`}
                onClick={() => {
                  onSelect(w.id);
                  onClose();
                }}
              >
                <span className={`wallet-avatar color-${i % 4}`}>
                  {w.kind === "watch" ? (
                    <Eye size={19} />
                  ) : (
                    <WalletIcon size={19} />
                  )}
                </span>
                <span>
                  <strong>{w.name}</strong>
                  <small>{shortAddress(w.address, 7)}</small>
                </span>
                <span className="wallet-switcher-value">
                  <b>
                    {hidden
                      ? HIDDEN
                      : amount === null
                        ? "—"
                        : formatAmount(amount, LIST_DECIMALS)}
                  </b>
                  {!hidden && amount !== null && price && (
                    <small>≈ {formatUsd(fiatValue(amount, price.last))}</small>
                  )}
                </span>
                {wallet?.id === w.id && <Check size={18} />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flow-footer">
        <button className="button primary full" onClick={onAdd}>
          <Plus size={17} />
          {t("添加钱包")}
        </button>
      </div>
    </Modal>
  );
}

export function WalletChooser({
  onClose,
  onBack,
  onChoose,
}: {
  onClose: () => void;
  onBack?: () => void;
  onChoose: (mode: "create" | "import" | "watch") => void;
}) {
  const t = useT();
  return (
    <Modal
      title={t("添加一个钱包")}
      variant="flow"
      subtitle={t("选择适合你的开始方式。")}
      onClose={onClose}
      onBack={onBack}
    >
      <div className="flow-body">
        <div className="wallet-options">
          {[
            {
              mode: "create" as const,
              icon: <Plus size={21} />,
              title: t("创建新钱包"),
              desc: t("生成一个独立的地址与助记词"),
              color: "mint",
            },
            {
              mode: "import" as const,
              icon: <ArrowDownToLine size={21} />,
              title: t("导入已有钱包"),
              desc: t("通过助记词恢复 ML-DSA-65 或 ML-DSA-87 账户"),
              color: "lavender",
            },
            {
              mode: "watch" as const,
              icon: <Eye size={21} />,
              title: t("添加观察钱包"),
              desc: t("查看余额、转账记录与挖矿奖励"),
              color: "peach",
            },
          ].map((o) => (
            <button key={o.mode} onClick={() => onChoose(o.mode)}>
              <span className={`option-icon ${o.color}`}>{o.icon}</span>
              <span>
                <strong>{o.title}</strong>
                <small>{o.desc}</small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
      </div>
      <div className="flow-footer">
        <p className="flow-note centered">
          {t("你可以添加多个钱包，并随时切换。")}
        </p>
      </div>
    </Modal>
  );
}
