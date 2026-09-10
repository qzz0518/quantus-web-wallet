import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { reveal } from "../../lib/motion";
import {
  ChevronDown,
  History,
  House,
  LockKeyhole,
  RefreshCw,
  Settings2,
  Wrench,
} from "lucide-react";
import type { NetworkState } from "../../lib/chain";
import type { Wallet } from "../../lib/vault";
import { localeTag, useT } from "../../lib/i18n";
import { ThemePicker } from "../ThemePicker";
import { LanguagePicker } from "../LanguagePicker";
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
// Labels stay in the Chinese source form; they are translated where rendered.
const tabs = [
  { id: "overview", label: "钱包", Icon: House },
  { id: "activity", label: "活动", Icon: History },
  { id: "tools", label: "工具", Icon: Wrench },
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
  const t = useT();
  // Tools and settings are full pages without the wallet toolbar.
  const plainPage = page === "settings" || page === "tools";
  const content = useRef<HTMLElement>(null);
  const previous = useRef({ page, unlocked });
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { page, unlocked };
    if (
      (before.page === page && before.unlocked === unlocked) ||
      (before.unlocked && !unlocked)
    )
      return;
    const direction =
      tabs.findIndex((tab) => tab.id === page) <
      tabs.findIndex((tab) => tab.id === before.page)
        ? -1
        : 1;
    const animations = [...(content.current?.children || [])].map(
      (element, index) =>
        reveal(element, direction * 12, 0, 220 + Math.min(index, 2) * 20),
    );
    return () => animations.forEach((a) => a?.cancel());
  }, [page, unlocked]);
  const navigation = (mobile: boolean) => (
    <nav
      className={mobile ? "wallet-bottom-nav" : "wallet-navigation"}
      aria-label={mobile ? t("移动端导航") : t("主要导航")}
      style={
        {
          "--active-tab": tabs.findIndex((tab) => tab.id === page),
        } as CSSProperties
      }
    >
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={page === id ? "active" : ""}
          aria-label={t(label)}
          aria-current={page === id ? "page" : undefined}
          onClick={() => onPageChange(id)}
        >
          <Icon size={20} />
          <span>{t(label)}</span>
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
      aria-label={t("切换钱包")}
      onClick={() => onOpen(wallets.length ? "wallets" : "choose")}
    >
      <span className="current-wallet-avatar">
        <WalletLogo />
      </span>
      <strong>{wallet?.name || t("我的钱包")}</strong>
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
            {unlocked && !plainPage && (
              <button
                className="circle-button mobile-refresh"
                aria-label={t("刷新余额与交易")}
                disabled={loading}
                onClick={onRefresh}
              >
                <RefreshCw size={17} className={loading ? "spin" : ""} />
              </button>
            )}
            {!unlocked && (
              <>
                <LanguagePicker variant="compact" />
                <ThemePicker variant="menu" />
              </>
            )}
            <button
              className="circle-button header-lock"
              aria-label={
                unlocked ? t("锁定钱包") : hasVault ? t("解锁钱包") : t("设置")
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
        ref={content}
        className={`wallet-content ${!unlocked && !plainPage ? "welcome-content" : ""}`}
      >
        {unlocked && !plainPage && (
          <div className="wallet-page-toolbar">
            <div className="desktop-wallet-selector">{selector}</div>
            <div className="toolbar-status">
              <span
                className="network-label"
                title={
                  networkError
                    ? t("连接中断，请刷新重试")
                    : network
                      ? t(
                          "Quantus 主网 · 区块 #{0}",
                          network.block.toLocaleString(localeTag()),
                        )
                      : t("正在连接 Quantus 主网")
                }
              >
                <i
                  className={`status-dot ${network && !networkError ? "" : "offline"}`}
                />
                {networkError
                  ? t("连接中断")
                  : network
                    ? t("Quantus 主网")
                    : t("正在连接")}
              </span>
              <button
                className="circle-button subtle"
                aria-label={t("刷新余额与交易")}
                disabled={loading}
                onClick={onRefresh}
              >
                <RefreshCw size={17} className={loading ? "spin" : ""} />
              </button>
            </div>
          </div>
        )}
        {unlocked && !plainPage && (networkError || balanceError) && (
          <div className="inline-warning" role="status">
            {networkError ? t("暂时无法连接网络，请联网后刷新。") : balanceError}
            <button disabled={loading} onClick={onRefresh}>
              {t("重试")}
            </button>
          </div>
        )}
        {children}
      </main>
      {unlocked && navigation(true)}
    </>
  );
}
