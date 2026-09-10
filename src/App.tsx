import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "./components/Toast";
import { dismissModal, useMotionPreferences } from "./lib/motion";
import {
  readBalance,
  readHistory,
  readNetwork,
  trackTransfer,
  readWormholeInfo,
} from "./lib/chain";
import type { Transaction } from "./lib/chain";
import {
  STORAGE_KEY,
  encryptVault,
  unlockVault,
  createSession,
  type VaultSession,
  type VaultData,
  type Wallet,
  type Pending,
} from "./lib/vault";
import { errorText } from "./lib/amount";
import { useT } from "./lib/i18n";
import {
  AddWalletDialog,
  ManageDialog,
  ReceiveDialog,
  SetupDialog,
  copyText,
  download,
} from "./components/WalletDialogs";
import { SendDialog } from "./components/SendDialog";
import { disableBiometric } from "./lib/biometric";
import {
  autoUnlock,
  clearManualLock,
  enableAutoUnlock,
  hasAutoUnlock,
  manuallyLocked,
  markManualLock,
} from "./lib/auto-unlock";
import { LoaderCircle } from "lucide-react";
import { hasPublicBalance, isWormhole } from "./lib/wallet";
import { WalletLayout } from "./components/wallet/WalletLayout";
import { WalletOverview } from "./components/wallet/WalletOverview";
import { Welcome } from "./components/wallet/Welcome";
import { SettingsPage } from "./components/settings/SettingsPage";
import { applyTheme, readThemePreference } from "./lib/theme";
import { ActivityPanel } from "./components/wallet/ActivityPanel";
import {
  WalletChooser,
  WalletSwitcher,
} from "./components/wallet/WalletSwitcher";
import type { WalletDialog, WalletPage } from "./components/wallet/types";

type Balance = Awaited<ReturnType<typeof readBalance>>;
type Network = Awaited<ReturnType<typeof readNetwork>>;

export default function App() {
  const t = useT();
  useMotionPreferences();
  const [session, setSession] = useState<VaultSession | null>(null),
    [data, setData] = useState<VaultData | null>(null),
    [hasVault, setHasVault] = useState(
      () => !!localStorage.getItem(STORAGE_KEY),
    ),
    // A fresh page load always retries the password-free mode; a manual lock
    // only holds until then.
    [booting, setBooting] = useState(() => {
      clearManualLock();
      return hasAutoUnlock();
    }),
    [selected, setSelected] = useState(""),
    [dialog, setDialog] = useState<WalletDialog>(null),
    [page, setPage] = useState<WalletPage>(() =>
      location.hash === "#settings"
        ? "settings"
        : location.hash === "#activity"
          ? "activity"
          : "overview",
    ),
    [balances, setBalances] = useState<Record<string, Balance>>({}),
    [network, setNetwork] = useState<Network | null>(null),
    [networkError, setNetworkError] = useState(""),
    [balanceError, setBalanceError] = useState(""),
    [historyError, setHistoryError] = useState(""),
    [transactions, setTransactions] = useState<Transaction[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(false),
    [historyLoading, setHistoryLoading] = useState(false),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState<{ message: string; success: boolean } | null>(
      null,
    ),
    [hidden, setHidden] = useState(false),
    [wormholeInfo, setWormholeInfo] = useState<Awaited<
      ReturnType<typeof readWormholeInfo>
    > | null>(null),
    [trackingRetry, setTrackingRetry] = useState(0);
  const nextAction = useRef<"create" | "import" | "watch" | null>(null);
  const navigate = useCallback((next: WalletPage) => {
    setPage(next);
    if (location.hash !== `#${next}`) history.pushState(null, "", `#${next}`);
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const restore = () =>
      setPage(
        location.hash === "#settings"
          ? "settings"
          : location.hash === "#activity"
            ? "activity"
            : "overview",
      );
    const system = matchMedia("(prefers-color-scheme: dark)");
    const theme = () => applyTheme(readThemePreference(), system.matches);
    window.addEventListener("popstate", restore);
    system.addEventListener("change", theme);
    return () => {
      window.removeEventListener("popstate", restore);
      system.removeEventListener("change", theme);
    };
  }, []);
  const sessionRef = useRef(session),
    dataRef = useRef(data),
    epoch = useRef(0),
    queue = useRef(Promise.resolve()),
    historyEpoch = useRef(0),
    balanceEpoch = useRef(0),
    tracking = useRef(new Map<string, AbortController>()),
    lastActivity = useRef(Date.now()),
    autoUnlocking = useRef(false),
    storageRef = useRef(localStorage.getItem(STORAGE_KEY));
  sessionRef.current = session;
  dataRef.current = data;
  const wallets = data?.wallets || [],
    wallet = wallets.find((w) => w.id === selected) || wallets[0],
    balance = wallet ? balances[wallet.address] : undefined;
  const notify = useCallback(
    (message: string, success = false) => setToast({ message, success }),
    [],
  );
  const lock = useCallback(() => {
    epoch.current++;
    setSession(null);
    setData(null);
    sessionRef.current = null;
    dataRef.current = null;
    setBalances({});
    setTransactions([]);
    setWormholeInfo(null);
    setDialog(null);
    setBalanceError("");
    setHistoryError("");
    setLoading(false);
    setHistoryLoading(false);
    balanceEpoch.current++;
    historyEpoch.current++;
    tracking.current.forEach((c) => c.abort());
    tracking.current.clear();
    setHasVault(!!localStorage.getItem(STORAGE_KEY));
  }, []);
  // "Lock wallet" means it: the page stays locked until it is loaded again.
  const lockManually = useCallback(() => {
    markManualLock();
    lock();
  }, [lock]);
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        storageRef.current = e.newValue;
        lock();
        notify(
          hasAutoUnlock() && !manuallyLocked()
            ? t("钱包数据已在另一个标签页更新")
            : t("钱包数据已在另一个标签页更新，请重新解锁"),
        );
      }
    };
    const activity = () => {
      lastActivity.current = Date.now();
    };
    window.addEventListener("storage", changed);
    for (const event of ["pointerdown", "keydown", "touchstart"])
      window.addEventListener(event, activity, { passive: true });
    const id = setInterval(() => {
      // The password-free mode exists so the wallet stays open on a private
      // computer; the idle lock is skipped while it is on.
      if (
        sessionRef.current &&
        !hasAutoUnlock() &&
        Date.now() - lastActivity.current > 600_000
      ) {
        lock();
        notify(t("闲置超过 10 分钟，钱包已锁定"));
      }
    }, 15000);
    return () => {
      window.removeEventListener("storage", changed);
      for (const event of ["pointerdown", "keydown", "touchstart"])
        window.removeEventListener(event, activity);
      clearInterval(id);
      tracking.current.forEach((c) => c.abort());
    };
  }, [lock, notify]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  const persist = useCallback(
    async (mutate: (old: VaultData) => VaultData) => {
      const savedEpoch = epoch.current;
      const operation = queue.current
        .catch(() => {})
        .then(async () => {
          const s = sessionRef.current,
            d = dataRef.current;
          if (!s || !d || savedEpoch !== epoch.current)
            throw new Error(t("钱包已锁定，请重新解锁"));
          if (storageRef.current !== localStorage.getItem(STORAGE_KEY)) {
            lock();
            throw new Error(t("钱包在其他标签页中有更改，请重新解锁"));
          }
          const next = mutate(d),
            encrypted = await encryptVault(s, next);
          if (savedEpoch !== epoch.current)
            throw new Error(t("钱包已锁定，操作已取消"));
          if (storageRef.current !== localStorage.getItem(STORAGE_KEY)) {
            lock();
            throw new Error(t("钱包在其他标签页中有更改，请重新解锁"));
          }
          localStorage.setItem(STORAGE_KEY, encrypted);
          storageRef.current = encrypted;
          dataRef.current = next;
          setData(next);
        });
      queue.current = operation;
      return operation;
    },
    [lock],
  );
  async function changePassword(oldPassword: string, newPassword: string) {
    const savedEpoch = epoch.current;
    const operation = queue.current
      .catch(() => {})
      .then(async () => {
        const d = dataRef.current,
          raw = localStorage.getItem(STORAGE_KEY);
        if (storageRef.current !== raw) {
          lock();
          throw new Error(t("钱包在其他标签页中有更改，请重新解锁"));
        }
        if (!d || !raw || !sessionRef.current || savedEpoch !== epoch.current)
          throw new Error(t("请先解锁钱包"));
        await unlockVault(oldPassword, raw);
        const nextSession = await createSession(newPassword),
          encrypted = await encryptVault(nextSession, d);
        if (
          savedEpoch !== epoch.current ||
          localStorage.getItem(STORAGE_KEY) !== raw
        )
          throw new Error(t("钱包数据已变化，请重试"));
        // The new vault has a new salt, which invalidates the stored wrap; the
        // mode is re-wrapped with the new key so it stays on.
        const keepAutoUnlock = hasAutoUnlock();
        disableBiometric();
        localStorage.setItem(STORAGE_KEY, encrypted);
        storageRef.current = encrypted;
        sessionRef.current = nextSession;
        setSession(nextSession);
        if (keepAutoUnlock)
          await enableAutoUnlock(newPassword).catch(() => {
            notify(t("免密模式已关闭，可在设置中重新开启"));
          });
      });
    queue.current = operation;
    return operation;
  }
  async function refreshNetwork() {
    try {
      setNetwork(await readNetwork());
      setNetworkError("");
    } catch (e) {
      setNetwork(null);
      setNetworkError(errorText(e));
    }
  }
  useEffect(() => {
    void refreshNetwork();
    const id = setInterval(() => void refreshNetwork(), 20000);
    return () => clearInterval(id);
  }, []);
  const refreshBalances = useCallback(async () => {
    const saved = epoch.current,
      request = ++balanceEpoch.current,
      list = dataRef.current?.wallets;
    if (!list?.length) return;
    setLoading(true);
    const values = await Promise.allSettled(
      list
        .filter(hasPublicBalance)
        .map(async (w) => [w.address, await readBalance(w.address)] as const),
    );
    if (saved !== epoch.current || request !== balanceEpoch.current) return;
    const errors = values.filter((v) => v.status === "rejected");
    setBalances(
      Object.fromEntries(
        values.flatMap((v) => (v.status === "fulfilled" ? [v.value] : [])),
      ),
    );
    setBalanceError(errors.length ? t("部分余额读取失败，请刷新重试") : "");
    setLoading(false);
  }, []);
  const addresses = wallets
    .map((w) => `${w.address}:${w.watchKind ?? w.kind}`)
    .join(",");
  useEffect(() => {
    void refreshBalances();
    const id = setInterval(() => void refreshBalances(), 20000);
    return () => clearInterval(id);
  }, [addresses, refreshBalances]);
  const loadHistory = useCallback(async (address: string, offset = 0) => {
    const request = ++historyEpoch.current,
      saved = epoch.current;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const rows = await readHistory(address, offset);
      if (request !== historyEpoch.current || saved !== epoch.current) return;
      setTransactions((old) =>
        offset
          ? [...old, ...rows.filter((r) => !old.some((o) => o.id === r.id))]
          : rows,
      );
      setMore(rows.length === 25);
    } catch (e) {
      if (request === historyEpoch.current && saved === epoch.current)
        setHistoryError(errorText(e));
    } finally {
      if (request === historyEpoch.current && saved === epoch.current)
        setHistoryLoading(false);
    }
  }, []);
  useEffect(() => {
    setTransactions([]);
    setFilter("all");
    setQuery("");
    setMore(false);
    if (wallet) void loadHistory(wallet.address);
    else historyEpoch.current++;
  }, [wallet?.address, loadHistory]);
  useEffect(() => {
    if (!data) return;
    for (const [hash, controller] of tracking.current) {
      if (
        data.pending.some(
          (p) => p.hash === hash && ["finalized", "failed"].includes(p.status),
        )
      ) {
        controller.abort();
        tracking.current.delete(hash);
      }
    }
    for (const tx of data.pending.filter(
      (p) => !["finalized", "failed"].includes(p.status),
    )) {
      if (tracking.current.has(tx.hash)) continue;
      const controller = new AbortController();
      tracking.current.set(tx.hash, controller);
      void trackTransfer(
        tx.hash,
        tx.startBlock,
        (state) => {
          if (controller.signal.aborted) return;
          const status: Pending["status"] =
            state.status === "retracted"
              ? "pending"
              : state.status === "expired"
                ? "unknown"
                : state.status;
          void persist((d) => ({
            ...d,
            pending: d.pending.map((p) =>
              p.hash === tx.hash ? { ...p, status, error: state.error } : p,
            ),
          })).catch(() => {});
          if (state.status === "finalized" || state.status === "failed") {
            void refreshBalances();
            if (wallet?.address === tx.address) void loadHistory(tx.address);
            notify(
              state.status === "finalized"
                ? t("交易已获得最终确认")
                : t("交易执行失败，请查看记录"),
              state.status === "finalized",
            );
          }
        },
        { signal: controller.signal },
      ).catch(() => {});
    }
  }, [
    data,
    persist,
    refreshBalances,
    loadHistory,
    notify,
    wallet?.address,
    trackingRetry,
  ]);
  useEffect(() => {
    setWormholeInfo(null);
    if (!wallet || !isWormhole(wallet)) return;
    let active = true;
    readWormholeInfo(wallet.address)
      .then((value) => {
        if (active) setWormholeInfo(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [wallet?.address, wallet?.watchKind]);
  const closeDialog = () => {
    const generation = epoch.current;
    dismissModal(() => {
      if (epoch.current === generation) setDialog(null);
    });
  };
  const open = (target: WalletDialog) => {
    nextAction.current =
      target === "create" || target === "import" || target === "watch"
        ? target
        : null;
    if (!session) {
      setDialog(hasVault ? "unlock" : "setup");
      return;
    }
    setDialog(target);
  };
  const openedRef = useRef(opened);
  openedRef.current = opened;
  // Password-free mode: open the vault on page load, and again after a lock
  // this page did not ask for (another tab changed the vault). A manual lock
  // is honoured until the next page load.
  useEffect(() => {
    if (session || !hasVault || autoUnlocking.current) return;
    if (!hasAutoUnlock() || manuallyLocked()) {
      setBooting(false);
      return;
    }
    autoUnlocking.current = true;
    const generation = epoch.current;
    autoUnlock()
      .then((result) => {
        if (!result) {
          notify(t("免密模式已失效，请使用密码解锁"));
          return;
        }
        if (epoch.current !== generation || sessionRef.current) return;
        openedRef.current(result.session, result.data);
      })
      .catch(() => notify(t("免密解锁未完成，请使用密码解锁")))
      .finally(() => {
        autoUnlocking.current = false;
        setBooting(false);
      });
  }, [session, hasVault, notify]);
  function opened(s: VaultSession, d: VaultData) {
    epoch.current++;
    setSession(s);
    setData(d);
    sessionRef.current = s;
    dataRef.current = d;
    storageRef.current = localStorage.getItem(STORAGE_KEY);
    setHasVault(true);
    lastActivity.current = Date.now();
    setSelected(d.wallets[0]?.id || "");
    const action = nextAction.current;
    nextAction.current = null;
    setDialog(action || (d.wallets.length ? null : "choose"));
  }
  async function saveWallet(w: Wallet) {
    await persist((d) => {
      if (d.wallets.some((v) => v.address === w.address))
        throw new Error(t("这个地址已经存在"));
      return { ...d, wallets: [...d.wallets, w] };
    });
    setSelected(w.id);
  }
  // Every caller reports the result in its own panel, so this does not also
  // raise a toast; a failure is thrown for the caller to show.
  function exportVault() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error(t("未找到本机钱包，请返回创建钱包或恢复备份"));
    download(
      raw,
      `quantus-wallet-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
  }
  const pending = (data?.pending || []).filter(
    (p) =>
      p.address === wallet?.address &&
      !transactions.some((t) => t.hash === p.hash),
  );
  const filtered = transactions.filter((t) => {
    const incoming = t.to === wallet?.address,
      outgoing = t.from === wallet?.address,
      reward = t.type === "MINER_REWARD" || t.type === "REWARD";
    return (
      (filter === "all" ||
        (filter === "in" && incoming) ||
        (filter === "out" && outgoing) ||
        (filter === "mining" && reward)) &&
      (!query ||
        `${t.hash} ${t.from} ${t.to} ${t.type}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()))
    );
  });
  const visibleTransactions =
    page === "overview" ? transactions.slice(0, 5) : filtered;
  async function copyAddress() {
    if (!wallet) {
      open("choose");
      return;
    }
    try {
      await copyText(wallet.address);
      notify(t("地址已复制"), true);
    } catch {
      notify(t("复制失败，请手动复制地址"));
    }
  }
  function refresh() {
    void refreshNetwork();
    void refreshBalances();
    if (wallet) {
      void loadHistory(wallet.address);
      if (isWormhole(wallet))
        void readWormholeInfo(wallet.address)
          .then(setWormholeInfo)
          .catch(() => {});
    }
    tracking.current.forEach((c) => c.abort());
    tracking.current.clear();
    setTrackingRetry((n) => n + 1);
  }
  return (
    <div className={`app-shell wallet-app page-${page}`}>
      <WalletLayout
        page={page}
        wallets={wallets}
        wallet={wallet}
        network={network}
        networkError={networkError}
        balanceError={balanceError}
        loading={loading}
        unlocked={!!session}
        hasVault={hasVault}
        pendingCount={
          pending.filter((tx) => !["finalized", "failed"].includes(tx.status))
            .length
        }
        onPageChange={navigate}
        onOpen={open}
        onLock={lockManually}
        onRefresh={refresh}
      >
        {page === "settings" ? (
          <SettingsPage
            key={session ? "unlocked" : "locked"}
            wallet={wallet}
            wallets={wallets}
            walletCount={wallets.length}
            unlocked={!!session}
            onManage={() => open("manage")}
            onWallets={() => open(wallets.length ? "wallets" : "choose")}
            onExport={exportVault}
            onChangePassword={changePassword}
            onLock={lockManually}
            onUnlock={() => open("unlock")}
          />
        ) : booting ? (
          <div className="wallet-booting" role="status" aria-live="polite">
            <LoaderCircle size={24} className="spin" aria-hidden="true" />
            <span>{t("正在解锁钱包…")}</span>
          </div>
        ) : !session || !wallet ? (
          <Welcome
            hasVault={hasVault}
            unlocked={!!session}
            onOpen={open}
            onRestore={() => {
              nextAction.current = null;
              setDialog("restore");
            }}
          />
        ) : (
          <>
            {page === "overview" && (
              <WalletOverview
                wallet={wallet}
                balance={balance}
                hidden={hidden}
                loading={loading}
                balanceError={balanceError}
                wormholeInfo={wormholeInfo}
                onToggleHidden={() => setHidden((value) => !value)}
                onOpen={open}
                onCopyAddress={copyAddress}
              />
            )}
            <ActivityPanel
              page={page}
              wallet={wallet}
              unlocked={!!session}
              pending={pending}
              transactions={transactions}
              visibleTransactions={visibleTransactions}
              filter={filter}
              query={query}
              historyError={historyError}
              historyLoading={historyLoading}
              more={more}
              onFilterChange={setFilter}
              onQueryChange={setQuery}
              onShowAll={() => navigate("activity")}
              onReload={() => wallet && void loadHistory(wallet.address)}
              onLoadMore={() =>
                wallet && void loadHistory(wallet.address, transactions.length)
              }
            />
          </>
        )}
      </WalletLayout>
      {dialog === "wallets" && session && (
        <WalletSwitcher
          wallets={wallets}
          wallet={wallet}
          onSelect={setSelected}
          onClose={closeDialog}
          onAdd={() => setDialog("choose")}
        />
      )}
      <Toast notice={toast} onDismiss={() => setToast(null)} />
      {(dialog === "setup" || dialog === "unlock" || dialog === "restore") && (
        <SetupDialog
          mode={dialog === "setup" ? "create" : dialog}
          initialAction={nextAction.current || undefined}
          onClose={() => {
            nextAction.current = null;
            closeDialog();
          }}
          onOpen={opened}
        />
      )}
      {dialog === "choose" && session && (
        <WalletChooser
          onClose={closeDialog}
          onBack={wallets.length ? () => setDialog("wallets") : undefined}
          onChoose={setDialog}
        />
      )}
      {(dialog === "create" || dialog === "import" || dialog === "watch") &&
        session && (
          <AddWalletDialog
            mode={dialog}
            wallets={wallets}
            onClose={closeDialog}
            onBack={() => setDialog("choose")}
            onSave={saveWallet}
          />
        )}
      {dialog === "receive" && wallet && (
        <ReceiveDialog wallet={wallet} onClose={closeDialog} />
      )}
      {dialog === "manage" && wallet && (
        <ManageDialog
          key={wallet.id}
          wallet={wallet}
          onClose={closeDialog}
          onUpdate={(name) =>
            persist((d) => ({
              ...d,
              wallets: d.wallets.map((w) =>
                w.id === wallet.id ? { ...w, name } : w,
              ),
            }))
          }
          onWatchKindChange={(watchKind) =>
            persist((d) => ({
              ...d,
              wallets: d.wallets.map((w) =>
                w.id === wallet.id && w.kind === "watch"
                  ? { ...w, watchKind }
                  : w,
              ),
            }))
          }
          onRemove={() =>
            persist((d) => ({
              ...d,
              wallets: d.wallets.filter((w) => w.id !== wallet.id),
            }))
          }
        />
      )}
      {dialog === "send" && wallet && wallet.kind !== "watch" && (
        <SendDialog
          key={wallet.id}
          wallet={wallet}
          wallets={wallets}
          onClose={closeDialog}
          onSubmitted={(tx) =>
            persist((d) => ({
              ...d,
              pending: [
                tx,
                ...d.pending.filter((p) => p.hash !== tx.hash),
              ].slice(0, 500),
            }))
          }
        />
      )}
    </div>
  );
}
