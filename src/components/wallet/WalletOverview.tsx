import {
  ArrowUpRight,
  ChevronDown,
  Copy,
  Ellipsis,
  Eye,
  Plus,
  RefreshCw,
} from "lucide-react";
import { MAINNET } from "../../lib/chain";
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

const EXPLORER = MAINNET.explorerUrl;

type WalletOverviewProps = {
  wallet?: Wallet;
  walletCount: number;
  balance?: Balance;
  hasVault: boolean;
  unlocked: boolean;
  hidden: boolean;
  loading: boolean;
  wormholeInfo: WormholeInfo | null;
  transparentWalletCount: number;
  total: bigint | null;
  onToggleHidden: () => void;
  onOpen: (dialog: WalletDialog) => void;
  onRestore: () => void;
  onCopyAddress: () => Promise<void>;
  onRefresh: () => void;
};

export function WalletOverview({
  wallet,
  walletCount,
  balance,
  hasVault,
  unlocked,
  hidden,
  loading,
  wormholeInfo,
  transparentWalletCount,
  total,
  onToggleHidden,
  onOpen,
  onRestore,
  onCopyAddress,
  onRefresh,
}: WalletOverviewProps) {
  const accountKind = wallet ? walletBalanceKind(wallet) : null;
  const balanceText = hidden
    ? "••••••"
    : wallet && !hasPublicBalance(wallet)
      ? "—"
      : balance
        ? formatAmount(BigInt(balance.free) + BigInt(balance.reserved))
        : "—";
  return (
    <>
      <div className="wallet-overview">
        <section className="wallet-hero" aria-label="钱包余额">
          <div className="hero-topline">
            <span className="hero-balance-label">
              {accountKind === "wormhole"
                ? "隐私账户余额"
                : accountKind === "unknown"
                  ? "余额待确认"
                  : wallet?.kind === "watch"
                    ? "公开账面余额"
                    : "账户余额"}
              <button
                aria-label={hidden ? "显示余额" : "隐藏余额"}
                onClick={onToggleHidden}
              >
                <Eye size={16} />
              </button>
            </span>
          </div>
          <div
            className={`hero-balance ${balanceText.length > 13 ? "long-value" : ""} ${hidden ? "masked" : ""}`}
          >
            <span>{balanceText}</span>
            <small>QTC</small>
          </div>
          <div className="hero-available">
            {wallet && isWormhole(wallet) ? (
              "未花费余额需在官方钱包查看"
            ) : accountKind === "unknown" ? (
              "请在管理钱包中确认观察账户类型"
            ) : balance ? (
              wallet?.kind === "watch" ? (
                "观察账户 · 仅显示公开账面数据"
              ) : (
                <>
                  可用 {hidden ? "••••" : formatAmount(balance.spendable)} QTC
                  {BigInt(balance.frozen) > 0n && (
                    <>
                      {" "}
                      · 冻结 {hidden
                        ? "••••"
                        : formatAmount(balance.frozen)}{" "}
                      QTC
                    </>
                  )}
                </>
              )
            ) : wallet ? (
              "正在读取余额…"
            ) : hasVault && !unlocked ? (
              "解锁后查看你的资产"
            ) : (
              "从你的第一个 Quantus 钱包开始"
            )}
          </div>
          {wallet ? (
            <div className="wallet-quick-actions">
              <button onClick={() => onOpen("receive")}>
                <span>
                  <Plus size={19} />
                </span>
                <strong>接收</strong>
              </button>
              <button
                disabled={wallet.kind === "watch"}
                onClick={() => onOpen("send")}
              >
                <span>
                  <ArrowUpRight size={19} />
                </span>
                <strong>发送</strong>
              </button>
            </div>
          ) : (
            <div className="hero-onboarding">
              <button className="hero-start" onClick={() => onOpen("choose")}>
                <Plus size={18} />
                {hasVault && !unlocked ? "解锁钱包" : "添加钱包"}
              </button>
              {!hasVault && (
                <button className="hero-restore" onClick={onRestore}>
                  恢复备份
                </button>
              )}
            </div>
          )}
        </section>
        <div className="account-card-wrapper">
          <div className="account-card-heading">
            <span>我的钱包</span>
            <button onClick={() => onOpen(walletCount ? "wallets" : "choose")}>
              {walletCount ? `${walletCount} 个钱包` : "添加钱包"}
              <ChevronDown size={14} />
            </button>
          </div>
          <section
            className={`wallet-account-panel ${!wallet ? "empty-account-panel" : ""}`}
            aria-label="当前钱包卡片"
          >
            <div className="account-panel-top">
              <span className="account-card-brand">
                <WalletLogo />
                quantus
              </span>
              <span className="account-type-tag">
                {wallet
                  ? wallet.kind === "watch"
                    ? "观察钱包"
                    : "自主保管"
                  : "Quantus 主网"}
              </span>
            </div>
            <div className="account-card-mark" aria-hidden="true">
              <svg viewBox="0 0 260 200" fill="none">
                <circle cx="128" cy="92" r="69" />
                <circle cx="128" cy="92" r="60" />
                <circle cx="128" cy="92" r="51" />
                <path d="m155 128 50 55m-43-65 51 55m-40-66 49 54" />
              </svg>
            </div>
            <div className="account-card-name">
              {wallet?.name ||
                (hasVault && !unlocked ? "你的钱包已锁定" : "属于你的链上账户")}
            </div>
            <div className="account-card-footer">
              {wallet ? (
                <>
                  <button
                    onClick={() => void onCopyAddress()}
                    aria-label="复制当前钱包地址"
                  >
                    {shortAddress(wallet.address, 6)}
                    <Copy size={13} />
                  </button>
                  <a
                    href={`${EXPLORER}/accounts/${wallet.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="在 Explorer 查看当前账户"
                  >
                    Explorer
                    <ArrowUpRight size={15} />
                  </a>
                </>
              ) : (
                <>
                  <span>
                    {hasVault && !unlocked
                      ? "解锁后继续使用"
                      : "创建 · 导入 · 观察"}
                  </span>
                  <button
                    aria-label={
                      hasVault && !unlocked ? "解锁当前钱包" : "添加第一个钱包"
                    }
                    onClick={() => onOpen("choose")}
                  >
                    <ArrowUpRight size={20} />
                  </button>
                </>
              )}
            </div>
          </section>
          {wallet && (
            <div className="account-utility-row">
              <button onClick={() => void onCopyAddress()}>
                <Copy size={16} />
                复制地址
              </button>
              <button
                className="mobile-refresh"
                aria-label="刷新当前钱包"
                disabled={loading}
                onClick={onRefresh}
              >
                <RefreshCw size={16} className={loading ? "spin" : ""} />
                刷新
              </button>
              <button
                aria-label="管理当前钱包"
                onClick={() => onOpen("manage")}
              >
                <Ellipsis size={18} />
                管理钱包
              </button>
            </div>
          )}
          {wallet && isWormhole(wallet) && (
            <p className="account-privacy-note">
              {wormholeInfo?.indexedMiningRewards != null ? (
                <>
                  已索引挖矿入账{" "}
                  {hidden
                    ? "••••"
                    : formatAmount(wormholeInfo.indexedMiningRewards, 4)}{" "}
                  QTC，非可用余额。
                </>
              ) : (
                "此地址仅支持观察公开入账。"
              )}
              转出请使用官方钱包。
            </p>
          )}
        </div>
      </div>
      {wallet && (
        <section className="wallet-assets" aria-label="资产列表">
          <div className="wallet-section-title">
            <h2>资产</h2>
            <button
              className="asset-refresh"
              aria-label="刷新链上数据"
              disabled={loading}
              onClick={onRefresh}
            >
              Quantus 主网
              <RefreshCw size={14} className={loading ? "spin" : ""} />
            </button>
          </div>
          <a
            className="wallet-asset-row"
            href={`${EXPLORER}/accounts/${wallet.address}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="在 Explorer 查看当前钱包资产"
          >
            <span className="asset-coin">
              <WalletLogo />
            </span>
            <span className="asset-identity">
              <strong>
                Quantus<span>QTC</span>
              </strong>
              <small>QTC · 主网</small>
            </span>
            <span className="asset-amount">
              <strong>{balanceText}</strong>
              <small>
                {accountKind === "wormhole"
                  ? "隐私余额"
                  : accountKind === "unknown"
                    ? "账户类型待确认"
                    : wallet.kind === "watch"
                      ? "公开账面余额"
                      : "QTC"}
              </small>
            </span>
            <span className="asset-explorer-icon" aria-hidden="true">
              <ArrowUpRight size={18} />
            </span>
          </a>
          {transparentWalletCount > 1 && total !== null && (
            <p className="wallet-total">
              持钥钱包合计{" "}
              <strong>{hidden ? "••••" : formatAmount(total)} QTC</strong>
            </p>
          )}
        </section>
      )}
    </>
  );
}
