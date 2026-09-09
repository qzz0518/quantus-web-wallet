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
  onClose,
  onOpen,
}: {
  mode: "create" | "unlock" | "restore";
  onClose: () => void;
  onOpen: (s: VaultSession, d: VaultData) => void;
}) {
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [file, setFile] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [deviceEnabled, setDeviceEnabled] = useState(
    () => mode === "unlock" && hasBiometric(),
  );
  const abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );
  async function deviceUnlock() {
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    try {
      const { session, data } = await unlockBiometric(abort.current.signal);
      if (!abort.current.signal.aborted) onOpen(session, data);
    } catch (e) {
      setDeviceEnabled(hasBiometric());
      setError(deviceError(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        if (password !== confirmation) throw new Error("两次输入的密码不一致");
        if (localStorage.getItem(STORAGE_KEY))
          throw new Error("已有钱包空间，请先解锁");
        const s = await createSession(password),
          d = emptyVault();
        localStorage.setItem(STORAGE_KEY, await encryptVault(s, d));
        onOpen(s, d);
      } else {
        if (mode === "restore" && localStorage.getItem(STORAGE_KEY))
          throw new Error(
            "当前浏览器已有钱包，请在独立浏览器配置中恢复，避免覆盖",
          );
        const raw =
          mode === "restore" ? file : localStorage.getItem(STORAGE_KEY);
        if (!raw) throw new Error("请先选择加密备份文件");
        const { session, data } = await unlockVault(password, raw);
        for (const w of data.wallets) {
          validateAddress(w.address);
          if (
            w.mnemonic &&
            (await deriveAccount(w.mnemonic, w.index)).address !== w.address
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
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPassword("");
      setConfirmation("");
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        mode === "unlock"
          ? "欢迎回来"
          : mode === "restore"
            ? "恢复钱包空间"
            : "创建你的钱包空间"
      }
      subtitle={
        mode === "unlock"
          ? "输入本机密码，继续管理你的 Quantus 资产。"
          : mode === "restore"
            ? "选择之前导出的加密备份，并输入当时的密码。"
            : "用一个密码，保护这台设备上的所有钱包。"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="dialog-emblem">
        <LockKeyhole size={27} />
      </div>
      {deviceEnabled && (
        <>
          <button
            className="button primary full"
            disabled={busy}
            onClick={deviceUnlock}
          >
            <Fingerprint size={18} />
            {busy ? "等待系统验证…" : "指纹 / 面容解锁"}
          </button>
          <p className="hint centered">或使用密码解锁</p>
        </>
      )}
      <form onSubmit={submit}>
        {mode === "restore" && (
          <label className="file-picker">
            <Upload size={19} />
            <span>{file ? "已选择加密备份" : "选择 .json 加密备份"}</span>
            <input
              type="file"
              accept=".json,application/json"
              aria-label="加密备份文件"
              onChange={async (e) => {
                try {
                  const f = e.target.files?.[0];
                  if (f && f.size > 5_000_000) throw new Error("备份文件过大");
                  setFile(f ? await f.text() : "");
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            />
          </label>
        )}
        <label className="field">
          {mode === "create" ? "设置解锁密码" : "解锁密码"}
          <input
            type="password"
            autoComplete={
              mode === "create" ? "new-password" : "current-password"
            }
            required
            minLength={mode === "create" ? 6 : 1}
            placeholder={mode === "create" ? "至少 6 位" : "输入密码"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        {mode === "create" && (
          <label className="field">
            再次输入密码
            <input
              type="password"
              autoComplete="new-password"
              required
              placeholder="确认解锁密码"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
        )}
        <div className="soft-note">
          <ShieldCheck size={17} />
          <p>
            密钥在浏览器中加密保存。密码无法重置，请保管好助记词和加密备份。
          </p>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy
            ? "正在解锁…"
            : mode === "create"
              ? "创建钱包空间"
              : mode === "restore"
                ? "恢复钱包"
                : "解锁钱包"}
          <ArrowRight size={16} />
        </button>
      </form>
    </Modal>
  );
}
