import { ChevronRight, Copy, Eye, EyeOff, Ellipsis } from "lucide-react";
import { Fragment, useRef, type CSSProperties } from "react";
import { useReveal } from "../../lib/motion";
import type { Balance, WormholeInfo } from "../../lib/chain";
import type { Wallet } from "../../lib/vault";
import { formatAmount, shortAddress } from "../../lib/amount";
import {
  hasPublicBalance,
  isWormhole,
  walletBalanceKind,
} from "../../lib/wallet";
import { useT } from "../../lib/i18n";
import { SwapIcon } from "../SwapIcon";
import { WalletLogo } from "./WalletLogo";
import type { WalletDialog } from "./types";

type Props = {
  wallet: Wallet;
  balance?: Balance;
  hidden: boolean;
  loading: boolean;
  balanceError?: string;
  wormholeInfo: WormholeInfo | null;
  onToggleHidden: () => void;
  onOpen: (dialog: WalletDialog) => void;
  onCopyAddress: () => Promise<void>;
};
export function WalletOverview({
  wallet,
  balance,
  hidden,
  loading,
  balanceError,
  wormholeInfo,
  onToggleHidden,
  onOpen,
  onCopyAddress,
}: Props) {
  const t = useT();
  const card = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  useReveal(card, wallet.id, 10);
  useReveal(hero, wallet.id, 6);
  const kind = walletBalanceKind(wallet);
  const amount = hidden
    ? "••••"
    : !hasPublicBalance(wallet)
      ? "—"
      : balance
        ? formatAmount(BigInt(balance.free) + BigInt(balance.reserved))
        : "—";
  const [whole, decimal] = amount.split(".");
  const groups = whole.split(",");
  return (
    <section className="wallet-overview">
      <div className="wallet-hero" aria-label={t("钱包余额")} ref={hero}>
        <div className="hero-balance-label">
          <span>
            {kind === "unknown"
              ? t("余额待确认")
              : kind === "wormhole"
                ? t("隐私账户")
                : wallet.kind === "watch"
                  ? t("公开余额")
                  : t("账户余额")}
          </span>
          <button
            className="balance-visibility"
            aria-label={hidden ? t("显示余额") : t("隐藏余额")}
            onClick={onToggleHidden}
          >
            <SwapIcon
              active={hidden}
              size={16}
              idle={<Eye size={16} />}
              done={<EyeOff size={16} />}
            />
          </button>
        </div>
        <div
          className="hero-balance"
          style={
            {
              "--amount-characters": Math.max(amount.length, 1),
            } as CSSProperties
          }
        >
          <span>
            {groups.map((group, index) => (
              <Fragment key={index}>
                {index > 0 && <wbr />}
                {group}
                {index < groups.length - 1 && ","}
              </Fragment>
            ))}
            {decimal && (
              <>
                <wbr />
                <span className="balance-fraction">.{decimal}</span>
              </>
            )}
          </span>
          <small>QTC</small>
        </div>
        <div className="hero-available">
          {kind === "wormhole" ? (
            t("未花费余额需在官方钱包查看")
          ) : kind === "unknown" ? (
            t("请在钱包详情中确认账户类型")
          ) : balance ? (
            <span className="available-pill">
              {wallet.kind === "watch"
                ? t("仅查看")
                : t(
                    "可用 {0} QTC",
                    hidden ? "••••" : formatAmount(balance.spendable),
                  )}
            </span>
          ) : balanceError ? (
            t("余额暂未更新")
          ) : loading ? (
            t("正在更新…")
          ) : (
            t("等待余额更新")
          )}
        </div>
        <div className="wallet-quick-actions">
          <button className="button primary" onClick={() => onOpen("receive")}>
            {t("接收")}
          </button>
          <button
            className="button"
            disabled={wallet.kind === "watch"}
            onClick={() => onOpen("send")}
          >
            {t("发送")}
          </button>
        </div>
      </div>
      <div className="account-card-wrapper" ref={card}>
        <section
          className="wallet-account-panel"
          aria-label={t("当前钱包卡片")}
        >
          <div className="account-panel-top">
            <span className="account-card-brand">
              <WalletLogo />
              quantus
            </span>
            <button
              className="card-menu"
              aria-label={t("管理当前钱包")}
              onClick={() => onOpen("manage")}
            >
              <Ellipsis size={21} />
            </button>
          </div>
          <button
            className="account-card-identity"
            onClick={() => onOpen("manage")}
          >
            <span>{wallet.kind === "watch" ? t("观察钱包") : t("我的账户")}</span>
            <strong>{wallet.name}</strong>
          </button>
          <div className="account-card-footer">
            <button
              aria-label={t("复制当前钱包地址")}
              onClick={() => void onCopyAddress()}
            >
              {shortAddress(wallet.address, 6)}
              <Copy size={14} />
            </button>
            <button
              className="card-details"
              aria-label={t("查看钱包详情")}
              onClick={() => onOpen("manage")}
            >
              {t("详情")}
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
        {isWormhole(wallet) ? (
          <p className="account-privacy-note">
            {wormholeInfo?.indexedMiningRewards != null
              ? t(
                  "累计公开入账 {0} QTC，不代表可用余额。",
                  hidden
                    ? "••••"
                    : formatAmount(wormholeInfo.indexedMiningRewards, 4),
                )
              : t("仅查看公开入账，转出请使用官方钱包。")}
          </p>
        ) : kind === "unknown" ? (
          <button
            className="account-type-notice"
            onClick={() => onOpen("manage")}
          >
            {t("确认观察账户类型")}
            <ChevronRight size={14} />
          </button>
        ) : (
          <div className="account-card-caption">
            <i className="status-dot" />
            {wallet.kind === "watch"
              ? t("观察账户无法发送资产")
              : t("Quantus 主网账户")}
          </div>
        )}
      </div>
    </section>
  );
}
