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
import { persistNewVault } from "../../lib/vault-storage";
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
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState("");
  const [deviceEnabled, setDeviceEnabled] = useState(
    () => mode === "unlock" && hasBiometric(),
  );
  const abort = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const fileRead = useRef(0);
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      fileRead.current++;
      abort.current?.abort();
    };
  }, []);

  async function deviceUnlock() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setDeviceBusy(true);
    setError("");
    abort.current = new AbortController();
    try {
      const { session, data } = await unlockBiometric(abort.current.signal);
      if (mounted.current && !abort.current.signal.aborted)
        onOpen(session, data);
    } catch (cause) {
      if (mounted.current) {
        setDeviceEnabled(hasBiometric());
        setError(deviceError(cause));
        requestAnimationFrame(() => passwordInput.current?.focus());
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        setDeviceBusy(false);
      }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || readingFile) return;
    if (mode === "create" && password !== confirmation) {
      setError("两次输入的密码不一致，请检查确认密码");
      confirmationInput.current?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        if (localStorage.getItem(STORAGE_KEY) !== null)
          throw new Error("已有钱包，请先解锁");
        const session = await createSession(password);
        const data = emptyVault();
        const encrypted = await encryptVault(session, data);
        if (!mounted.current) return;
        persistNewVault(encrypted);
        onOpen(session, data);
      } else {
        if (mode === "restore" && localStorage.getItem(STORAGE_KEY) !== null)
          throw new Error(
            "当前浏览器已有钱包，请在独立浏览器配置中恢复，避免覆盖",
          );
        const raw =
          mode === "restore" ? file : localStorage.getItem(STORAGE_KEY);
        if (!raw)
          throw new Error(
            mode === "unlock"
              ? "未找到本机钱包，请返回创建钱包或恢复备份"
              : "请先选择加密备份文件",
          );
        const { session, data } = await unlockVault(password, raw);
        for (const wallet of data.wallets) {
          validateAddress(wallet.address);
          if (
            wallet.kind !== "watch" &&
            wallet.mnemonic &&
            (await deriveAccount(wallet.kind, wallet.mnemonic, wallet.index))
              .address !== wallet.address
          )
            throw new Error("备份中的账户地址与密钥不一致");
        }
        if (!mounted.current) return;
        if (mode === "unlock" && localStorage.getItem(STORAGE_KEY) !== raw)
          throw new Error("钱包数据已变化，请重新解锁");
        if (mode === "restore") {
          persistNewVault(raw, disableBiometric);
        }
        onOpen(session, data);
      }
    } catch (cause) {
      if (mounted.current) setError(errorText(cause));
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setPassword("");
        setConfirmation("");
        setBusy(false);
      }
    }
  }

  const close = () => {
    if (!busyRef.current) {
      fileRead.current++;
      onClose();
    }
  };
  const title =
    mode === "unlock"
      ? "解锁钱包"
      : mode === "restore"
        ? "恢复备份"
        : "保护钱包";
  return (
    <Modal
      title={title}
      variant="flow"
      onBack={close}
      onClose={close}
      busy={busy}
    >
      <form
        className="flow-form"
        onSubmit={submit}
        aria-busy={busy || readingFile}
      >
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
                {deviceBusy ? "等待系统验证…" : "指纹 / 面容解锁"}
              </button>
              <p className="hint centered">或使用密码解锁</p>
            </>
          )}
          {mode === "restore" && (
            <label className="file-picker">
              <Upload size={20} />
              <span>
                {readingFile
                  ? "正在读取备份…"
                  : file
                    ? fileName
                    : "选择 .json 加密备份"}
              </span>
              <input
                type="file"
                accept=".json,application/json"
                aria-label="加密备份文件"
                disabled={busy}
                onChange={async (event) => {
                  const selected = event.target.files?.[0];
                  event.currentTarget.value = "";
                  const request = ++fileRead.current;
                  setFile("");
                  setFileName("");
                  setError("");
                  setReadingFile(!!selected);
                  try {
                    if (selected && selected.size > 5_000_000)
                      throw new Error("备份文件过大");
                    if (selected) {
                      const contents = await selected.text();
                      if (!mounted.current || request !== fileRead.current)
                        return;
                      if (!contents.trim())
                        throw new Error("备份文件为空，请重新选择");
                      setFile(contents);
                      setFileName(selected.name);
                    }
                  } catch (cause) {
                    if (mounted.current && request === fileRead.current)
                      setError(errorText(cause));
                  } finally {
                    if (mounted.current && request === fileRead.current)
                      setReadingFile(false);
                  }
                }}
              />
            </label>
          )}
          <label className="field">
            {mode === "create" ? "设置密码" : "解锁密码"}
            <input
              ref={passwordInput}
              type="password"
              autoComplete={
                mode === "create" ? "new-password" : "current-password"
              }
              required
              minLength={mode === "create" ? 6 : 1}
              placeholder={mode === "create" ? "至少 6 位" : "输入密码"}
              value={password}
              disabled={busy}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              autoFocus={mode !== "restore" && !deviceEnabled}
            />
          </label>
          {mode === "create" && (
            <label className="field">
              确认密码
              <input
                ref={confirmationInput}
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="再次输入密码"
                value={confirmation}
                disabled={busy}
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  setError("");
                }}
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
            disabled={
              busy ||
              readingFile ||
              !password ||
              (mode === "create" && !confirmation) ||
              (mode === "restore" && !file)
            }
          >
            {busy && !deviceBusy
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
