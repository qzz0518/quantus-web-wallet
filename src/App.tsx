import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
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
import {
  AboutDialog,
  AddWalletDialog,
  ManageDialog,
  ReceiveDialog,
  SetupDialog,
  copyText,
  download,
} from "./components/WalletDialogs";
import { SendDialog } from "./components/SendDialog";
import { disableBiometric } from "./lib/biometric";
import { hasPublicBalance, isWormhole } from "./lib/wallet";
import { WalletLayout } from "./components/wallet/WalletLayout";
import { WalletOverview } from "./components/wallet/WalletOverview";
import { ActivityPanel } from "./components/wallet/ActivityPanel";
import {
  WalletChooser,
  WalletSwitcher,
} from "./components/wallet/WalletSwitcher";
import type { WalletDialog, WalletPage } from "./components/wallet/types";

type Balance = Awaited<ReturnType<typeof readBalance>>;
type Network = Awaited<ReturnType<typeof readNetwork>>;

export default function App() {
  const [session, setSession] = useState<VaultSession | null>(null),
    [data, setData] = useState<VaultData | null>(null),
    [hasVault, setHasVault] = useState(
      () => !!localStorage.getItem(STORAGE_KEY),
    ),
    [selected, setSelected] = useState(""),
    [dialog, setDialog] = useState<WalletDialog>(null),
    [page, setPage] = useState<WalletPage>("overview"),
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
    [toast, setToast] = useState(""),
    [hidden, setHidden] = useState(false),
    [wormholeInfo, setWormholeInfo] = useState<Awaited<
      ReturnType<typeof readWormholeInfo>
    > | null>(null),
    [trackingRetry, setTrackingRetry] = useState(0);
  const sessionRef = useRef(session),
    dataRef = useRef(data),
    epoch = useRef(0),
    queue = useRef(Promise.resolve()),
    historyEpoch = useRef(0),
    balanceEpoch = useRef(0),
    tracking = useRef(new Map<string, AbortController>()),
    lastActivity = useRef(Date.now()),
    storageRef = useRef(localStorage.getItem(STORAGE_KEY));
  sessionRef.current = session;
  dataRef.current = data;
  const wallets = data?.wallets || [],
    wallet = wallets.find((w) => w.id === selected) || wallets[0],
    balance = wallet ? balances[wallet.address] : undefined;
  const notify = useCallback((message: string) => setToast(message), []);
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
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        storageRef.current = e.newValue;
        lock();
        notify("钱包数据已在另一个标签页更新，请重新解锁");
      }
    };
    const activity = () => {
      lastActivity.current = Date.now();
    };
    window.addEventListener("storage", changed);
    for (const event of ["pointerdown", "keydown", "touchstart"])
      window.addEventListener(event, activity, { passive: true });
    const id = setInterval(() => {
      if (sessionRef.current && Date.now() - lastActivity.current > 600_000) {
        lock();
        notify("闲置超过 10 分钟，钱包已锁定");
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
    const id = setTimeout(() => setToast(""), 4500);
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
            throw new Error("钱包已锁定，请重新解锁");
          if (storageRef.current !== localStorage.getItem(STORAGE_KEY)) {
            lock();
            throw new Error("钱包在其他标签页中有更改，请重新解锁");
          }
          const next = mutate(d),
            encrypted = await encryptVault(s, next);
          if (savedEpoch !== epoch.current)
            throw new Error("钱包已锁定，操作已取消");
          if (storageRef.current !== localStorage.getItem(STORAGE_KEY)) {
            lock();
            throw new Error("钱包在其他标签页中有更改，请重新解锁");
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
          throw new Error("钱包在其他标签页中有更改，请重新解锁");
        }
        if (!d || !raw || !sessionRef.current || savedEpoch !== epoch.current)
          throw new Error("请先解锁钱包");
        await unlockVault(oldPassword, raw);
        const nextSession = await createSession(newPassword),
          encrypted = await encryptVault(nextSession, d);
        if (
          savedEpoch !== epoch.current ||
          localStorage.getItem(STORAGE_KEY) !== raw
        )
          throw new Error("钱包数据已变化，请重试");
        disableBiometric();
        localStorage.setItem(STORAGE_KEY, encrypted);
        storageRef.current = encrypted;
        sessionRef.current = nextSession;
        setSession(nextSession);
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
    setBalanceError(errors.length ? "部分余额读取失败，请刷新重试" : "");
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
                ? "交易已获得最终确认"
                : "交易执行失败，请查看记录",
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
  const open = (target: WalletDialog) => {
    if (!session) {
      setDialog(hasVault ? "unlock" : "setup");
      return;
    }
    setDialog(target);
  };
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
    setDialog(d.wallets.length ? null : "choose");
  }
  async function saveWallet(w: Wallet) {
    await persist((d) => {
      if (d.wallets.some((v) => v.address === w.address))
        throw new Error("这个地址已经存在");
      return { ...d, wallets: [...d.wallets, w] };
    });
    setSelected(w.id);
    notify(w.kind === "watch" ? "观察钱包已添加" : "钱包已准备就绪");
  }
  function exportVault() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      download(
        raw,
        `quantus-wallet-backup-${new Date().toISOString().slice(0, 10)}.json`,
      );
      notify("已导出加密备份，请妥善保存");
    }
  }
  const pending = (data?.pending || []).filter(
    (p) =>
      p.address === wallet?.address &&
      !transactions.some((t) => t.hash === p.hash),
  );
  const filtered = transactions.filter((t) => {
    const incoming = t.to === wallet?.address,
      outgoing = t.from === wallet?.address,
      reward = t.type === "MINER_REWARD";
    return (
      (filter === "all" ||
        (filter === "in" && incoming) ||
        (filter === "out" && outgoing) ||
        (filter === "mining" && reward)) &&
      (!query ||
        `${t.hash} ${t.from} ${t.to} ${t.type}`
          .toLowerCase()
          .includes(query.toLowerCase()))
    );
  });
  const visibleTransactions =
    page === "overview" ? transactions.slice(0, 5) : filtered;
  const transparentWallets = wallets.filter((w) => w.kind === "mldsa87");
  const total =
    transparentWallets.length &&
    transparentWallets.every((w) => balances[w.address])
      ? transparentWallets.reduce(
          (v, w) =>
            v +
            BigInt(balances[w.address].free) +
            BigInt(balances[w.address].reserved),
          0n,
        )
      : null;
  async function copyAddress() {
    if (!wallet) {
      open("choose");
      return;
    }
    try {
      await copyText(wallet.address);
      notify("地址已复制");
    } catch {
      notify("复制失败，请手动复制地址");
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
        pendingCount={pending.length}
        onPageChange={setPage}
        onSelectWallet={setSelected}
        onOpen={open}
        onLock={lock}
        onRefresh={refresh}
        onExport={exportVault}
      >
        {page === "overview" && (
          <WalletOverview
            wallet={wallet}
            walletCount={wallets.length}
            balance={balance}
            hasVault={hasVault}
            unlocked={!!session}
            hidden={hidden}
            loading={loading}
            wormholeInfo={wormholeInfo}
            transparentWalletCount={transparentWallets.length}
            total={total}
            onToggleHidden={() => setHidden((value) => !value)}
            onOpen={open}
            onRestore={() => setDialog("restore")}
            onCopyAddress={copyAddress}
            onRefresh={refresh}
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
          onShowAll={() => setPage("activity")}
          onReload={() => wallet && void loadHistory(wallet.address)}
          onLoadMore={() =>
            wallet && void loadHistory(wallet.address, transactions.length)
          }
        />
      </WalletLayout>
      {dialog === "wallets" && session && (
        <WalletSwitcher
          wallets={wallets}
          wallet={wallet}
          onSelect={setSelected}
          onClose={() => setDialog(null)}
          onAdd={() => setDialog("choose")}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {(dialog === "setup" || dialog === "unlock" || dialog === "restore") && (
        <SetupDialog
          mode={dialog === "setup" ? "create" : dialog}
          onClose={() => setDialog(null)}
          onOpen={opened}
        />
      )}
      {dialog === "choose" && session && (
        <WalletChooser onClose={() => setDialog(null)} onChoose={setDialog} />
      )}
      {(dialog === "create" || dialog === "import" || dialog === "watch") &&
        session && (
          <AddWalletDialog
            mode={dialog}
            wallets={wallets}
            onClose={() => setDialog(null)}
            onSave={saveWallet}
          />
        )}
      {dialog === "receive" && wallet && (
        <ReceiveDialog wallet={wallet} onClose={() => setDialog(null)} />
      )}
      {dialog === "manage" && wallet && (
        <ManageDialog
          key={wallet.id}
          wallet={wallet}
          onClose={() => setDialog(null)}
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
      {dialog === "about" && session && (
        <AboutDialog
          onClose={() => setDialog(null)}
          onExport={exportVault}
          onChangePassword={changePassword}
        />
      )}
      {dialog === "send" && wallet && wallet.kind !== "watch" && (
        <SendDialog
          key={wallet.id}
          wallet={wallet}
          wallets={wallets}
          onClose={() => setDialog(null)}
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
