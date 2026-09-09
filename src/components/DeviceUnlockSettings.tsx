import { useEffect, useRef, useState, type FormEvent } from "react";
import { Fingerprint, KeyRound, ArrowUpRight } from "lucide-react";
import {
  deviceSupport,
  hasBiometric,
  enrollBiometric,
  disableBiometric,
  deviceError,
  type DeviceSupport,
} from "../lib/biometric";
export function DeviceUnlockSettings({
  onChangePassword,
  onExport,
}: {
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  onExport: () => void;
}) {
  const [support, setSupport] = useState<DeviceSupport | null>(null),
    [enabled, setEnabled] = useState(() => hasBiometric()),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [oldPassword, setOldPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    deviceSupport().then((s) => {
      if (active) setSupport(s);
    });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);
  async function enable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    controller.current = new AbortController();
    try {
      await enrollBiometric(password, controller.current.signal);
      setEnabled(true);
      setMessage("设备解锁已开启，下次锁定后即可使用");
    } catch (e) {
      setError(deviceError(e));
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (newPassword !== confirmation)
        throw new Error("两次输入的新密码不一致");
      await onChangePassword(oldPassword, newPassword);
      setEnabled(false);
      setMessage("密码已更新，请重新导出备份。原设备解锁已停用，可重新开启。");
    } catch (e) {
      setError(deviceError(e));
    } finally {
      setOldPassword("");
      setNewPassword("");
      setConfirmation("");
      setBusy(false);
    }
  }
  return (
    <div className="device-settings">
      <section className="manage-section">
        <h3>
          <Fingerprint size={18} />
          生物识别 / 设备解锁
        </h3>
        <p>
          使用系统指纹、面容或设备验证快速解锁。可用方式由浏览器和设备决定，密码解锁始终保留。
        </p>
        {enabled ? (
          <>
            <div className="soft-note">已开启 · 解锁时需要系统验证</div>
            <button
              className="button full"
              disabled={busy}
              onClick={() => {
                disableBiometric();
                setEnabled(false);
                setMessage("设备解锁已停用，系统中的通行密钥可自行删除");
              }}
            >
              停用设备解锁
            </button>
          </>
        ) : support?.available ? (
          <form aria-label="开启设备解锁" onSubmit={enable}>
            <label className="field">
              验证当前密码
              <input
                aria-label="开启设备解锁的密码"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <button className="button full" disabled={busy}>
              <Fingerprint size={16} />
              {busy ? "等待系统验证…" : "开启指纹 / 面容解锁"}
            </button>
          </form>
        ) : (
          <div className="soft-note">
            <p>
              {support?.reason || "正在检测设备支持…"}
              {support?.needsLocalhost && (
                <>
                  <br />
                  <button className="text-button" onClick={onExport}>
                    先导出加密备份
                  </button>
                  <span> · </span>
                  <a
                    className="text-button"
                    href={`http://localhost:${location.port || "5189"}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    打开 localhost
                    <ArrowUpRight size={12} />
                  </a>
                  <br />
                  两个地址的浏览器存储相互独立。在新地址恢复备份后即可设置，旧地址的钱包仍会保留。
                </>
              )}
            </p>
          </div>
        )}
      </section>
      <section className="manage-section">
        <h3>
          <KeyRound size={17} />
          修改解锁密码
        </h3>
        <p>
          最低 6 位，可使用数字或其他字符。已有密码继续有效，修改后请重新备份。
        </p>
        <form aria-label="修改解锁密码" onSubmit={changePassword}>
          <label className="field">
            当前密码
            <input
              type="password"
              autoComplete="current-password"
              required
              aria-label="修改密码的当前密码"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="button-row">
            <label className="field grow">
              新密码
              <input
                type="password"
                minLength={6}
                autoComplete="new-password"
                required
                placeholder="至少 6 位"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="field grow">
              确认新密码
              <input
                type="password"
                minLength={6}
                autoComplete="new-password"
                required
                placeholder="再次输入新密码"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          <button className="button full" disabled={busy}>
            更新密码
          </button>
        </form>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="soft-note" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
