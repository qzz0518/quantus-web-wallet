import { ChevronRight, Copy, Eye, EyeOff, Ellipsis } from "lucide-react";
import type { CSSProperties } from "react";
import type { Balance, WormholeInfo } from "../../lib/chain";
import type { Wallet } from "../../lib/vault";
import { formatAmount, shortAddress } from "../../lib/amount";
import {
  hasPublicBalance,
  isWormhole,
  walletBalanceKind,
} from "../../lib/wallet";
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
  const kind = walletBalanceKind(wallet);
  const amount = hidden
    ? "••••"
    : !hasPublicBalance(wallet)
      ? "—"
      : balance
        ? formatAmount(BigInt(balance.free) + BigInt(balance.reserved))
        : "—";
  const [whole, decimal] = amount.split(".");
  return (
    <section className="wallet-overview">
      <div className="wallet-hero" aria-label="钱包余额">
        <div className="hero-balance-label">
          <span>
            {kind === "unknown"
              ? "余额待确认"
              : kind === "wormhole"
                ? "隐私账户"
                : wallet.kind === "watch"
                  ? "公开余额"
                  : "账户余额"}
          </span>
          <button
            className="balance-visibility"
            aria-label={hidden ? "显示余额" : "隐藏余额"}
            onClick={onToggleHidden}
          >
            {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <div
          className={`hero-balance ${amount.length > 13 ? "long-value" : ""}`}
          style={
            {
              "--balance-width": Math.max(amount.length * 0.57, 1),
            } as CSSProperties
          }
        >
          <span>
            {whole}
            {decimal && <span className="balance-fraction">.{decimal}</span>}
          </span>
          <small>QTC</small>
        </div>
        <div className="hero-available">
          {kind === "wormhole" ? (
            "未花费余额需在官方钱包查看"
          ) : kind === "unknown" ? (
            "请在钱包详情中确认账户类型"
          ) : balance ? (
            <span className="available-pill">
              {wallet.kind === "watch" ? (
                "仅查看"
              ) : (
                <>
                  可用 {hidden ? "••••" : formatAmount(balance.spendable)} QTC
                </>
              )}
            </span>
          ) : balanceError ? (
            "余额暂未更新"
          ) : loading ? (
            "正在更新…"
          ) : (
            "等待余额更新"
          )}
        </div>
        <div className="wallet-quick-actions">
          <button className="button primary" onClick={() => onOpen("receive")}>
            接收
          </button>
          <button
            className="button"
            disabled={wallet.kind === "watch"}
            onClick={() => onOpen("send")}
          >
            发送
          </button>
        </div>
      </div>
      <div className="account-card-wrapper">
        <section className="wallet-account-panel" aria-label="当前钱包卡片">
          <div className="account-panel-top">
            <span className="account-card-brand">
              <WalletLogo />
              quantus
            </span>
            <button
              className="card-menu"
              aria-label="管理当前钱包"
              onClick={() => onOpen("manage")}
            >
              <Ellipsis size={21} />
            </button>
          </div>
          <button
            className="account-card-identity"
            onClick={() => onOpen("manage")}
          >
            <span>{wallet.kind === "watch" ? "观察钱包" : "我的账户"}</span>
            <strong>{wallet.name}</strong>
          </button>
          <div className="account-card-footer">
            <button
              aria-label="复制当前钱包地址"
              onClick={() => void onCopyAddress()}
            >
              {shortAddress(wallet.address, 6)}
              <Copy size={14} />
            </button>
            <button
              className="card-details"
              aria-label="查看钱包详情"
              onClick={() => onOpen("manage")}
            >
              详情
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
        {isWormhole(wallet) ? (
          <p className="account-privacy-note">
            {wormholeInfo?.indexedMiningRewards != null ? (
              <>
                累计公开入账{" "}
                {hidden
                  ? "••••"
                  : formatAmount(wormholeInfo.indexedMiningRewards, 4)}{" "}
                QTC，不代表可用余额。
              </>
            ) : (
              "仅查看公开入账，转出请使用官方钱包。"
            )}
          </p>
        ) : kind === "unknown" ? (
          <button
            className="account-type-notice"
            onClick={() => onOpen("manage")}
          >
            确认观察账户类型
            <ChevronRight size={14} />
          </button>
        ) : (
          <div className="account-card-caption">
            <i className="status-dot" />
            {wallet.kind === "watch"
              ? "观察账户无法发送资产"
              : "Quantus 主网账户"}
          </div>
        )}
      </div>
    </section>
  );
}
