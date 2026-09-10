import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  SlidersHorizontal,
  Trash2,
  Wallet as WalletIcon,
} from "lucide-react";
import { Modal } from "../Modal";
import { FlowStatus } from "../FlowStatus";
import { unlockVault, STORAGE_KEY, type Wallet } from "../../lib/vault";
import { MAINNET } from "../../lib/chain";
import { errorText } from "../../lib/amount";
import { copyText } from "../../lib/browser";
import { downloadMnemonicBackup } from "../../lib/mnemonic-backup";
import { derivationPath, schemeLabel } from "../../crypto";
import { walletScheme } from "../../lib/wallet";
import { useT } from "../../lib/i18n";
import { Select } from "../Select";

type ManageView = "overview" | "rename" | "seed" | "type" | "remove";
// Chinese source keys; translated at render time with t().
const titles: Record<ManageView, string> = {
  overview: "钱包详情",
  rename: "重命名钱包",
  seed: "助记词备份",
  type: "观察账户类型",
  remove: "移除钱包",
};

export function ManageDialog({
  wallet,
  onClose,
  onUpdate,
  onWatchKindChange,
  onRemove,
}: {
  wallet: Wallet;
  onClose: () => void;
  onUpdate: (name: string) => Promise<void>;
  onWatchKindChange?: (kind: NonNullable<Wallet["watchKind"]>) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const t = useT();
  const scheme = walletScheme(wallet);
  const [view, setView] = useState<ManageView>("overview");
  const [name, setName] = useState(wallet.name);
  const [watchKind, setWatchKind] = useState<Wallet["watchKind"] | "">(
    wallet.watchKind ?? "",
  );
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copying, setCopying] = useState(false);
  const busyRef = useRef(false);
  const copyAttempt = useRef(0);
  const passwordInput = useRef<HTMLInputElement>(null);
  const overview = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<ManageView | null>(null);

  useEffect(
    () => () => {
      copyAttempt.current++;
    },
    [],
  );
  useEffect(() => {
    if (view === "seed" && !secret && error && !busy)
      passwordInput.current?.focus();
  }, [view, secret, error, busy]);
  useEffect(() => {
    if (view !== "overview" || !returnFocus.current) return;
    const target = returnFocus.current;
    returnFocus.current = null;
    const frame = requestAnimationFrame(() => {
      overview.current
        ?.querySelector<HTMLButtonElement>(`[data-manage-view="${target}"]`)
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [view]);

  function navigate(next: ManageView) {
    if (busyRef.current) return;
    copyAttempt.current++;
    setCopying(false);
    if (next === "rename") setName(wallet.name);
    if (next === "type") setWatchKind(wallet.watchKind ?? "");
    if (next === "overview") returnFocus.current = view;
    setView(next);
    setPassword("");
    setSecret(null);
    setAck(false);
    setError("");
    setMessage("");
  }
  function close() {
    if (!busyRef.current) onClose();
  }
  const back = () => (view === "overview" ? close() : navigate("overview"));
  async function action(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (error) {
      setError(errorText(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function reveal(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY) || "";
        const { data } = await unlockVault(password, raw);
        if (raw !== localStorage.getItem(STORAGE_KEY))
          throw new Error(t("钱包数据已变化，请重新解锁"));
        const verified = data.wallets.find(
          (entry) =>
            entry.id === wallet.id &&
            entry.address === wallet.address &&
            entry.kind !== "watch" &&
            entry.kind === wallet.kind,
        );
        if (!verified?.mnemonic)
          throw new Error(t("当前钱包没有可查看的助记词"));
        setSecret(verified.mnemonic);
      } finally {
        setPassword("");
      }
    });
  }
  const accountType =
    wallet.kind === "watch"
      ? wallet.watchKind === "wormhole"
        ? t("Wormhole 观察账户")
        : wallet.watchKind === "standard"
          ? t("普通观察账户")
          : t("观察账户 · 类型待确认")
      : scheme
        ? `${t("自主保管账户")} · ${schemeLabel(scheme)}`
        : t("自主保管账户");
  const feedback = <FlowStatus error={error} message={message} />;

  return (
    <Modal
      title={t(titles[view])}
      variant="flow"
      busy={busy}
      stepKey={`${view}:${!!secret}`}
      onClose={close}
      onBack={back}
    >
      {view === "overview" && (
        <div className="flow-body manage-overview" ref={overview}>
          <div className="settings-profile manage-profile">
            <span className="settings-profile-avatar" aria-hidden="true">
              {wallet.kind === "watch" ? (
                <Eye size={28} />
              ) : (
                <WalletIcon size={28} />
              )}
            </span>
            <strong>{wallet.name}</strong>
            <span className="settings-profile-address">{accountType}</span>
          </div>
          <div className="account-detail-card">
            <span className="label">{t("钱包地址")}</span>
            <p className="account-detail-address">{wallet.address}</p>
            {scheme && (
              <>
                <span className="label">{t("签名方案与派生路径")}</span>
                <p className="account-detail-address">
                  {schemeLabel(scheme)} ·{" "}
                  {derivationPath(scheme, wallet.index).replaceAll("'", "′")}
                </p>
              </>
            )}
            <div className="account-detail-actions">
              <button
                className="text-button"
                disabled={copying}
                onClick={async () => {
                  const attempt = ++copyAttempt.current;
                  setError("");
                  setMessage("");
                  setCopying(true);
                  try {
                    await copyText(wallet.address);
                    if (attempt === copyAttempt.current)
                      setMessage(t("地址已复制"));
                  } catch {
                    if (attempt === copyAttempt.current)
                      setError(t("复制失败，请手动选中地址"));
                  } finally {
                    if (attempt === copyAttempt.current) setCopying(false);
                  }
                }}
              >
                <Copy size={15} />
                {copying ? t("正在复制…") : t("复制地址")}
              </button>
              <a
                className="text-button"
                href={`${MAINNET.explorerUrl}/accounts/${wallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Explorer
                <ArrowUpRight size={15} />
              </a>
            </div>
          </div>
          <section className="settings-group" aria-label={t("管理钱包")}>
            <button
              className="settings-row"
              data-manage-view="rename"
              onClick={() => navigate("rename")}
            >
              <span className="settings-row-icon">
                <Pencil size={19} />
              </span>
              <span className="settings-row-copy">
                <strong>{t("重命名钱包")}</strong>
              </span>
              <ChevronRight size={17} />
            </button>
            {wallet.kind !== "watch" && (
              <button
                className="settings-row"
                data-manage-view="seed"
                onClick={() => navigate("seed")}
              >
                <span className="settings-row-icon">
                  <KeyRound size={19} />
                </span>
                <span className="settings-row-copy">
                  <strong>{t("助记词备份")}</strong>
                </span>
                <ChevronRight size={17} />
              </button>
            )}
            {wallet.kind === "watch" && onWatchKindChange && (
              <button
                className="settings-row"
                data-manage-view="type"
                onClick={() => navigate("type")}
              >
                <span className="settings-row-icon">
                  <SlidersHorizontal size={19} />
                </span>
                <span className="settings-row-copy">
                  <strong>{t("观察账户类型")}</strong>
                </span>
                <ChevronRight size={17} />
              </button>
            )}
            <button
              className="settings-row danger-text"
              data-manage-view="remove"
              onClick={() => navigate("remove")}
            >
              <span className="settings-row-icon">
                <Trash2 size={19} />
              </span>
              <span className="settings-row-copy">
                <strong>{t("移除钱包")}</strong>
              </span>
              <ChevronRight size={17} />
            </button>
          </section>
          {feedback}
        </div>
      )}
      {view === "rename" && (
        <form
          className="flow-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || name.trim() === wallet.name) return;
            void action(async () => {
              await onUpdate(name.trim());
              returnFocus.current = "rename";
              setView("overview");
              setMessage(t("钱包名称已更新"));
            });
          }}
        >
          <div className="flow-body">
            <div className="flow-heading">
              <span className="flow-symbol">
                <Pencil size={28} />
              </span>
              <h2>{t("给钱包起个名字")}</h2>
              <p>{t("用容易辨认的名称区分你的账户。")}</p>
            </div>
            <label className="field">
              {t("钱包名称")}
              <input
                aria-label={t("钱包名称")}
                autoFocus
                required
                value={name}
                maxLength={60}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {feedback}
          </div>
          <div className="flow-footer">
            <button
              className="button primary full"
              disabled={busy || !name.trim() || name.trim() === wallet.name}
            >
              {busy ? t("正在保存…") : t("保存名称")}
            </button>
          </div>
        </form>
      )}
      {view === "type" && (
        <form
          className="flow-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !onWatchKindChange ||
              watchKind === wallet.watchKind ||
              (watchKind !== "standard" && watchKind !== "wormhole")
            )
              return;
            void action(async () => {
              await onWatchKindChange(watchKind);
              returnFocus.current = "type";
              setView("overview");
              setMessage(t("观察账户类型已更新"));
            });
          }}
        >
          <div className="flow-body">
            <div className="flow-heading">
              <span className="flow-symbol">
                <SlidersHorizontal size={28} />
              </span>
              <h2>{t("确认观察账户类型")}</h2>
              <p>
                {t(
                  "普通账户显示公开余额；Wormhole 隐私账户只显示公开入账。请按地址来源选择。",
                )}
              </p>
            </div>
            <label className="field">
              {t("账户类型")}
              <Select<"standard" | "wormhole">
                aria-label={t("观察账户类型")}
                placeholder={t("请选择账户类型")}
                value={watchKind ?? ""}
                disabled={busy}
                onChange={(kind) => setWatchKind(kind)}
                options={[
                  { value: "standard", label: t("普通公开账户") },
                  { value: "wormhole", label: t("Wormhole 隐私账户") },
                ]}
              />
            </label>
            {feedback}
          </div>
          <div className="flow-footer">
            <button
              className="button primary full"
              disabled={busy || !watchKind || watchKind === wallet.watchKind}
            >
              {busy ? t("正在保存…") : t("保存账户类型")}
            </button>
          </div>
        </form>
      )}
      {view === "seed" &&
        (secret ? (
          <>
            <div className="flow-body">
              <div className="flow-heading">
                <h2>{t("你的助记词")}</h2>
                <p>{t("请按顺序保存。任何获得助记词的人都可以使用这个钱包。")}</p>
              </div>
              <ol
                className="mnemonic-grid"
                data-private="true"
                aria-label={t("钱包助记词")}
              >
                {secret
                  .trim()
                  .split(/\s+/)
                  .map((word, index) => (
                    <li key={index}>
                      <span>{index + 1}</span>
                      <strong>{word}</strong>
                    </li>
                  ))}
              </ol>
              <p className="flow-note">
                {t("下载的 TXT 是明文文件，请离线保管。")}
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setSecret(null);
                  setMessage("");
                  setError("");
                }}
              >
                <EyeOff size={16} />
                {t("隐藏助记词")}
              </button>
              {feedback}
            </div>
            <div className="flow-footer">
              <button
                className="button primary full"
                onClick={() => {
                  setError("");
                  setMessage("");
                  try {
                    downloadMnemonicBackup(
                      secret,
                      wallet.name,
                      wallet.index,
                      scheme ?? "mldsa87",
                    );
                    setMessage(t("助记词备份下载已开始"));
                  } catch (error) {
                    setError(errorText(error));
                  }
                }}
              >
                <Download size={18} />
                {t("下载助记词 TXT")}
              </button>
            </div>
          </>
        ) : (
          <form className="flow-form" onSubmit={reveal}>
            <div className="flow-body">
              <div className="flow-heading">
                <span className="flow-symbol">
                  <KeyRound size={29} />
                </span>
                <h2>{t("查看前，验证是你")}</h2>
                <p>{t("输入解锁密码后，在当前设备查看和备份助记词。")}</p>
              </div>
              <label className="field">
                {t("解锁密码")}
                <input
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  aria-label={t("查看助记词的密码")}
                  ref={passwordInput}
                  aria-invalid={!!error || undefined}
                  required
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {feedback}
            </div>
            <div className="flow-footer">
              <button
                className="button primary full"
                disabled={busy || !password}
              >
                <Eye size={18} />
                {busy ? t("正在验证…") : t("查看助记词")}
              </button>
            </div>
          </form>
        ))}
      {view === "remove" && (
        <>
          <div className="flow-body">
            <div className="flow-heading">
              <span className="flow-symbol danger-text">
                <Trash2 size={29} />
              </span>
              <h2>{t("移除 {0}？", wallet.name)}</h2>
              <p>
                {t(
                  "这会从当前设备移除钱包，不会改变链上资产。{0}",
                  wallet.kind === "watch"
                    ? t("之后可通过公开地址重新添加。")
                    : t("恢复时需要助记词或加密备份。"),
                )}
              </p>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={ack}
                disabled={busy}
                onChange={(event) => setAck(event.target.checked)}
              />
              {t("我已保存恢复此钱包所需的信息")}
            </label>
            {feedback}
          </div>
          <div className="flow-footer">
            <button
              className="button danger full"
              disabled={!ack || busy}
              onClick={() =>
                void action(async () => {
                  await onRemove();
                  onClose();
                })
              }
            >
              {busy ? t("正在移除…") : t("确认移除钱包")}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
