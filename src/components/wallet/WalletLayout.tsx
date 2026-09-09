import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Download,
  ExternalLink,
  Eye,
  Github,
  History,
  House,
  LockKeyhole,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Wallet as WalletIcon,
} from "lucide-react";
import type { NetworkState } from "../../lib/chain";
import { MAINNET } from "../../lib/chain";
import type { Wallet } from "../../lib/vault";
import { shortAddress } from "../../lib/amount";
import { GITHUB_URL, PROJECT_NAME, X_URL } from "../../lib/project";
import { ThemePicker } from "../ThemePicker";
import { WalletLogo } from "./WalletLogo";
import type { WalletDialog, WalletPage } from "./types";

const EXPLORER = MAINNET.explorerUrl;

type WalletLayoutProps = {
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
  onSelectWallet: (id: string) => void;
  onOpen: (dialog: WalletDialog) => void;
  onLock: () => void;
  onRefresh: () => void;
  onExport: () => void;
};

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
  onSelectWallet,
  onOpen,
  onLock,
  onRefresh,
  onExport,
}: WalletLayoutProps) {
  return (
    <>
      <aside className="wallet-rail">
        <a
          className="wallet-brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onPageChange("overview");
          }}
        >
          <WalletLogo />
          <span>
            quantus<span className="wallet-brand-note">钱包</span>
          </span>
        </a>
        <nav className="rail-navigation" aria-label="主要导航">
          <button
            aria-label="首页"
            className={page === "overview" ? "active" : ""}
            aria-pressed={page === "overview"}
            onClick={() => onPageChange("overview")}
          >
            <House size={20} />
            <span>首页</span>
          </button>
          <button
            aria-label="交易活动"
            className={page === "activity" ? "active" : ""}
            aria-pressed={page === "activity"}
            onClick={() => onPageChange("activity")}
          >
            <History size={20} />
            <span>活动</span>
            {pendingCount > 0 && <b>{pendingCount}</b>}
          </button>
          <button aria-label="安全与备份" onClick={() => onOpen("about")}>
            <Settings2 size={20} />
            <span>安全与备份</span>
          </button>
        </nav>
        <div className="rail-wallet-heading">
          <span>我的钱包</span>
          <button
            className="icon-button"
            aria-label="添加钱包"
            onClick={() => onOpen("choose")}
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="rail-wallet-list">
          {wallets.map((w, i) => (
            <button
              key={w.id}
              className={`rail-wallet ${wallet?.id === w.id ? "selected" : ""}`}
              onClick={() => onSelectWallet(w.id)}
            >
              <span className={`wallet-avatar color-${i % 4}`}>
                {w.kind === "watch" ? (
                  <Eye size={17} />
                ) : (
                  <WalletIcon size={17} />
                )}
              </span>
              <span>
                <strong>{w.name}</strong>
                <small>{shortAddress(w.address, 4)}</small>
              </span>
              {wallet?.id === w.id && <span className="wallet-selection-dot" />}
            </button>
          ))}
          {!wallets.length && (
            <p className="rail-empty">
              {unlocked ? "添加钱包，查看链上资产" : "解锁后查看你的钱包"}
            </p>
          )}
          <button className="rail-add-wallet" onClick={() => onOpen("choose")}>
            <Plus size={16} />
            添加钱包
          </button>
        </div>
        <div className="rail-footer">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            <Github size={17} />
            GitHub
            <ArrowUpRight size={14} />
          </a>
          <a href={X_URL} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">𝕏</span>
            X
            <ArrowUpRight size={14} />
          </a>
          <a href={EXPLORER} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={17} />
            区块浏览器
            <ArrowUpRight size={14} />
          </a>
          <div className="rail-network">
            <i className={`status-dot ${network ? "" : "offline"}`} />
            <span>
              {network
                ? "主网已连接"
                : networkError
                  ? "主网连接失败"
                  : "正在连接主网"}
              <small>
                {network
                  ? `区块 #${network.block.toLocaleString()}`
                  : "Quantus Mainnet"}
              </small>
            </span>
          </div>
        </div>
      </aside>
      <div className="wallet-main-shell">
        <header className="wallet-topbar">
          <button
            className="current-wallet-selector"
            onClick={() => onOpen(wallets.length ? "wallets" : "choose")}
            aria-label="切换钱包"
          >
            <span className="current-wallet-avatar">
              <WalletLogo />
            </span>
            <span>
              <strong>{wallet?.name || "我的钱包"}</strong>
              <small>
                {wallet
                  ? shortAddress(wallet.address, 5)
                  : hasVault && !unlocked
                    ? "已锁定"
                    : "Quantus 主网"}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
          <div className="wallet-header-actions">
            <ThemePicker />
            <button
              className="header-lock"
              aria-label={
                unlocked ? "锁定钱包" : hasVault ? "解锁钱包" : "开始使用"
              }
              onClick={() => (unlocked ? onLock() : onOpen("unlock"))}
            >
              <LockKeyhole size={18} />
              <span>{unlocked ? "锁定" : hasVault ? "解锁" : "开始使用"}</span>
            </button>
          </div>
        </header>
        <main className="wallet-content">
          <div className="wallet-page-heading">
            <div>
              <h1>{page === "overview" ? "我的资产" : "交易活动"}</h1>
            </div>
            <button
              className="wallet-refresh"
              aria-label="刷新余额与交易"
              disabled={loading}
              onClick={onRefresh}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
              <span>刷新</span>
            </button>
          </div>
          {(networkError || balanceError) && (
            <div className="inline-warning" role="status">
              {networkError
                ? "暂时无法连接主网，余额和交易状态可能无法更新。"
                : balanceError}
            </div>
          )}
          {children}
          {unlocked && wallet && (
            <button className="wallet-backup" onClick={onExport}>
              <span className="wallet-backup-icon">
                <ShieldCheck size={21} />
              </span>
              <span>
                <strong>备份你的钱包</strong>
                <small>导出加密文件，保存在另一台设备</small>
              </span>
              <Download size={18} />
            </button>
          )}
          <footer className="wallet-page-footer">
            <span>{PROJECT_NAME} · 社区网页版</span>
            <a
              href="https://github.com/Quantus-Network/quantus-wasm"
              target="_blank"
              rel="noopener noreferrer"
            >
              开源技术
              <ArrowUpRight size={12} />
            </a>
          </footer>
        </main>
      </div>
      <nav className="wallet-bottom-nav" aria-label="移动端导航">
        <button
          className={page === "overview" ? "active" : ""}
          aria-pressed={page === "overview"}
          onClick={() => onPageChange("overview")}
        >
          <House size={22} />
          <span>首页</span>
        </button>
        <button
          className={page === "activity" ? "active" : ""}
          aria-pressed={page === "activity"}
          onClick={() => onPageChange("activity")}
        >
          <History size={22} />
          <span>活动</span>
          {pendingCount > 0 && <i />}
        </button>
        <button onClick={() => onOpen("about")}>
          <Settings2 size={22} />
          <span>安全</span>
        </button>
      </nav>
    </>
  );
}
