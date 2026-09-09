import type { ReactNode } from "react";
import {
  ChevronDown,
  History,
  House,
  LockKeyhole,
  RefreshCw,
  Settings2,
} from "lucide-react";
import type { NetworkState } from "../../lib/chain";
import type { Wallet } from "../../lib/vault";
import { ThemePicker } from "../ThemePicker";
import { WalletLogo } from "./WalletLogo";
import type { WalletDialog, WalletPage } from "./types";

type Props = {
  children: ReactNode;
  page: WalletPage;
  wallets: Wallet[];
  wallet?: Wallet;
  network: NetworkState | null;
  networkError: string;
  balanceError: string;
  loading: boolean;
  unlocked: boolean;
  hasVault: boolean;
  pendingCount: number;
  onPageChange: (page: WalletPage) => void;
  onOpen: (dialog: WalletDialog) => void;
  onLock: () => void;
  onRefresh: () => void;
};
const tabs = [
  { id: "overview", label: "钱包", Icon: House },
  { id: "activity", label: "活动", Icon: History },
  { id: "settings", label: "设置", Icon: Settings2 },
] as const;

export function WalletLayout({
  children,
  page,
  wallets,
  wallet,
  network,
  networkError,
  balanceError,
  loading,
  unlocked,
  hasVault,
  pendingCount,
  onPageChange,
  onOpen,
  onLock,
  onRefresh,
}: Props) {
  const navigation = (mobile: boolean) => (
    <nav
      className={mobile ? "wallet-bottom-nav" : "wallet-navigation"}
      aria-label={mobile ? "移动端导航" : "主要导航"}
    >
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={page === id ? "active" : ""}
          aria-label={label}
          aria-current={page === id ? "page" : undefined}
          onClick={() => onPageChange(id)}
        >
          <Icon size={20} />
          <span>{label}</span>
          {id === "activity" && pendingCount > 0 && (
            <i className="nav-notification" />
          )}
        </button>
      ))}
    </nav>
  );
  const selector = (
    <button
      className="current-wallet-selector"
      aria-label="切换钱包"
      onClick={() => onOpen(wallets.length ? "wallets" : "choose")}
    >
      <span className="current-wallet-avatar">
        <WalletLogo />
      </span>
      <strong>{wallet?.name || "我的钱包"}</strong>
      <ChevronDown size={15} />
    </button>
  );
  return (
    <>
      <header className="wallet-header">
        <div className="wallet-topbar">
          <a
            className="wallet-brand"
            href="#overview"
            onClick={(event) => {
              event.preventDefault();
              onPageChange("overview");
            }}
          >
            <WalletLogo />
            <span>quantus</span>
          </a>
          {unlocked && <div className="mobile-wallet-selector">{selector}</div>}
          {unlocked && navigation(false)}
          <div className="wallet-header-actions">
            {unlocked && page !== "settings" && (
              <button
                className="circle-button mobile-refresh"
                aria-label="刷新余额与交易"
                disabled={loading}
                onClick={onRefresh}
              >
                <RefreshCw size={17} className={loading ? "spin" : ""} />
              </button>
            )}
            {!unlocked && <ThemePicker />}
            <button
              className="circle-button header-lock"
              aria-label={
                unlocked ? "锁定钱包" : hasVault ? "解锁钱包" : "设置"
              }
              onClick={() =>
                unlocked
                  ? onLock()
                  : hasVault
                    ? onOpen("unlock")
                    : onPageChange("settings")
              }
            >
              {unlocked || hasVault ? (
                <LockKeyhole size={19} />
              ) : (
                <Settings2 size={19} />
              )}
            </button>
          </div>
        </div>
      </header>
      <main
        className={`wallet-content ${!unlocked && page !== "settings" ? "welcome-content" : ""}`}
      >
        {unlocked && page !== "settings" && (
          <div className="wallet-page-toolbar">
            <div className="desktop-wallet-selector">{selector}</div>
            <div className="toolbar-status">
              <span
                className="network-label"
                title={
                  networkError
                    ? "连接中断，请刷新重试"
                    : network
                      ? `Quantus 主网 · 区块 #${network.block.toLocaleString()}`
                      : "正在连接 Quantus 主网"
                }
              >
                <i
                  className={`status-dot ${network && !networkError ? "" : "offline"}`}
                />
                {networkError
                  ? "连接中断"
                  : network
                    ? "Quantus 主网"
                    : "正在连接"}
              </span>
              <button
                className="circle-button subtle"
                aria-label="刷新余额与交易"
                disabled={loading}
                onClick={onRefresh}
              >
                <RefreshCw size={17} className={loading ? "spin" : ""} />
              </button>
            </div>
          </div>
        )}
        {unlocked && page !== "settings" && (networkError || balanceError) && (
          <div className="inline-warning" role="status">
            {networkError ? "暂时无法连接网络，请联网后刷新。" : balanceError}
            <button disabled={loading} onClick={onRefresh}>
              重试
            </button>
          </div>
        )}
        {children}
      </main>
      {unlocked && navigation(true)}
    </>
  );
}
