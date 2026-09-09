import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Modal } from "../Modal";
import {
  createSession,
  encryptVault,
  unlockVault,
  emptyVault,
  STORAGE_KEY,
  type VaultSession,
  type VaultData,
} from "../../lib/vault";
import { deriveAccount } from "../../crypto";
import { validateAddress } from "../../lib/chain";
import { errorText } from "../../lib/amount";
import {
  hasBiometric,
  unlockBiometric,
  deviceError,
  disableBiometric,
} from "../../lib/biometric";

export function SetupDialog({
  mode,
  initialAction,
  onClose,
  onOpen,
}: {
  mode: "create" | "unlock" | "restore";
  initialAction?: "create" | "import" | "watch";
  onClose: () => void;
  onOpen: (session: VaultSession, data: VaultData) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [file, setFile] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deviceEnabled, setDeviceEnabled] = useState(
    () => mode === "unlock" && hasBiometric(),
  );
  const abort = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  async function deviceUnlock() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    try {
      const { session, data } = await unlockBiometric(abort.current.signal);
      if (!abort.current.signal.aborted) onOpen(session, data);
    } catch (cause) {
      setDeviceEnabled(hasBiometric());
      setError(deviceError(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        if (password !== confirmation) throw new Error("两次输入的密码不一致");
        if (localStorage.getItem(STORAGE_KEY))
          throw new Error("已有钱包，请先解锁");
        const session = await createSession(password);
        const data = emptyVault();
        localStorage.setItem(STORAGE_KEY, await encryptVault(session, data));
        onOpen(session, data);
      } else {
        if (mode === "restore" && localStorage.getItem(STORAGE_KEY))
          throw new Error(
            "当前浏览器已有钱包，请在独立浏览器配置中恢复，避免覆盖",
          );
        const raw =
          mode === "restore" ? file : localStorage.getItem(STORAGE_KEY);
        if (!raw) throw new Error("请先选择加密备份文件");
        const { session, data } = await unlockVault(password, raw);
        for (const wallet of data.wallets) {
          validateAddress(wallet.address);
          if (
            wallet.mnemonic &&
            (await deriveAccount(wallet.mnemonic, wallet.index)).address !==
              wallet.address
          )
            throw new Error("备份中的账户地址与密钥不一致");
        }
        if (mode === "unlock" && localStorage.getItem(STORAGE_KEY) !== raw)
          throw new Error("钱包数据已变化，请重新解锁");
        if (mode === "restore") {
          disableBiometric();
          localStorage.setItem(STORAGE_KEY, raw);
        }
        onOpen(session, data);
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPassword("");
      setConfirmation("");
      busyRef.current = false;
      setBusy(false);
    }
  }

  const close = () => {
    if (!busyRef.current) onClose();
  };
  const title =
    mode === "unlock"
      ? "解锁钱包"
      : mode === "restore"
        ? "恢复备份"
        : "保护钱包";
  return (
    <Modal title={title} variant="flow" onBack={close} onClose={close}>
      <form className="flow-form" onSubmit={submit}>
        <div className="flow-body">
          <div className="flow-symbol">
            <LockKeyhole size={30} strokeWidth={1.6} />
          </div>
          <div className="flow-heading">
            <h3>
              {mode === "unlock"
                ? "欢迎回来"
                : mode === "restore"
                  ? "恢复你的钱包"
                  : "设置解锁密码"}
            </h3>
            <p>
              {mode === "unlock"
                ? "解锁后，继续管理你的 Quantus 资产。"
                : mode === "restore"
                  ? "选择加密备份，使用导出时的密码恢复。"
                  : initialAction === "import"
                    ? "先设置本机密码，接下来导入你的钱包。"
                    : initialAction === "watch"
                      ? "先设置本机密码，接下来添加观察钱包。"
                      : "用一个密码，保护这台设备上的所有钱包。"}
            </p>
          </div>
          {deviceEnabled && (
            <>
              <button
                type="button"
                className="button primary full"
                disabled={busy}
                onClick={deviceUnlock}
              >
                <Fingerprint size={19} />
                {busy ? "等待系统验证…" : "指纹 / 面容解锁"}
              </button>
              <p className="hint centered">或使用密码解锁</p>
            </>
          )}
          {mode === "restore" && (
            <label className="file-picker">
              <Upload size={20} />
              <span>{file ? fileName : "选择 .json 加密备份"}</span>
              <input
                type="file"
                accept=".json,application/json"
                aria-label="加密备份文件"
                disabled={busy}
                onChange={async (event) => {
                  setFile("");
                  setFileName("");
                  setError("");
                  try {
                    const selected = event.target.files?.[0];
                    if (selected && selected.size > 5_000_000)
                      throw new Error("备份文件过大");
                    if (selected) {
                      setFile(await selected.text());
                      setFileName(selected.name);
                    }
                  } catch (cause) {
                    setError(errorText(cause));
                  }
                }}
              />
            </label>
          )}
          <label className="field">
            {mode === "create" ? "设置密码" : "解锁密码"}
            <input
              type="password"
              autoComplete={
                mode === "create" ? "new-password" : "current-password"
              }
              required
              minLength={mode === "create" ? 6 : 1}
              placeholder={mode === "create" ? "至少 6 位" : "输入密码"}
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          </label>
          {mode === "create" && (
            <label className="field">
              确认密码
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="再次输入密码"
                value={confirmation}
                disabled={busy}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          )}
          <div className="soft-note">
            <ShieldCheck size={17} />
            <p>
              密码用于解锁当前设备。请保管好助记词和加密备份，以便恢复钱包。
            </p>
          </div>
        </div>
        <div className="flow-footer">
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            className="button primary full"
            disabled={busy || (mode === "restore" && !file)}
          >
            {busy
              ? mode === "create"
                ? "正在设置…"
                : "正在解锁…"
              : mode === "create"
                ? "继续"
                : mode === "restore"
                  ? "恢复钱包"
                  : "解锁钱包"}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
