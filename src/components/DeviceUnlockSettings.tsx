import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Fingerprint,
  KeyRound,
  ArrowUpRight,
  Check,
  Download,
} from "lucide-react";
import {
  deviceSupport,
  hasBiometric,
  enrollBiometric,
  disableBiometric,
  deviceError,
  type DeviceSupport,
} from "../lib/biometric";

export function DeviceUnlockSettings({
  section,
  onChangePassword,
  onExport,
  onBusyChange,
}: {
  section: "password" | "biometric";
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  onExport: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [support, setSupport] = useState<DeviceSupport | null>(null);
  const [enabled, setEnabled] = useState(() => hasBiometric());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    if (section === "biometric") {
      deviceSupport().then((value) => {
        if (active) setSupport(value);
      });
    }
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, [section]);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  async function enable(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    controller.current = new AbortController();
    try {
      await enrollBiometric(password, controller.current.signal);
      setEnabled(true);
      setMessage("设备解锁已开启，下次锁定后即可使用");
    } catch (error) {
      setError(deviceError(error));
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (newPassword !== confirmation)
        throw new Error("两次输入的新密码不一致");
      await onChangePassword(oldPassword, newPassword);
      setEnabled(false);
      setMessage("密码已更新，请重新导出备份。原设备解锁已停用，可重新开启。");
    } catch (error) {
      setError(deviceError(error));
    } finally {
      setOldPassword("");
      setNewPassword("");
      setConfirmation("");
      setBusy(false);
    }
  }

  const feedback = (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="flow-success" role="status">
          <Check size={17} />
          {message}
        </p>
      )}
    </>
  );

  return (
    <div className={`device-settings device-settings-${section}`}>
      {section === "password" ? (
        <form
          className="flow-form"
          aria-label="修改解锁密码"
          onSubmit={changePassword}
        >
          <div className="flow-body">
            <div className="flow-heading">
              <span className="flow-symbol">
                <KeyRound size={29} />
              </span>
              <h2>更新解锁密码</h2>
              <p>至少 6 位。修改后，请使用新密码解锁并重新备份钱包。</p>
            </div>
            <label className="field">
              当前密码
              <input
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                aria-label="修改密码的当前密码"
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="field">
              新密码
              <input
                type="password"
                minLength={6}
                autoComplete="new-password"
                required
                placeholder="至少 6 位"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="field">
              确认新密码
              <input
                type="password"
                minLength={6}
                autoComplete="new-password"
                required
                placeholder="再次输入新密码"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={busy}
              />
            </label>
            {feedback}
            {message && (
              <button type="button" className="text-button" onClick={onExport}>
                <Download size={16} />
                导出新备份
              </button>
            )}
          </div>
          <div className="flow-footer">
            <button className="button primary full" disabled={busy}>
              {busy ? "正在更新…" : "更新密码"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flow-body">
            <div className="flow-heading">
              <span className="flow-symbol">
                <Fingerprint size={31} />
              </span>
              <h2>轻触一下，解锁钱包</h2>
              <p>
                使用指纹、面容或设备验证快速解锁。可用方式由系统决定，密码解锁始终保留。
              </p>
            </div>
            {enabled ? (
              <div className="device-enabled-state">
                <Check size={20} />
                <strong>设备解锁已开启</strong>
                <p>每次解锁都需要系统验证。</p>
              </div>
            ) : support?.available ? (
              <form
                id="enable-device-unlock"
                className="flow-form"
                aria-label="开启设备解锁"
                onSubmit={enable}
              >
                <label className="field">
                  验证当前密码
                  <input
                    aria-label="开启设备解锁的密码"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={busy}
                  />
                </label>
              </form>
            ) : (
              <div className="flow-note">
                <p>{support?.reason || "正在检测设备支持…"}</p>
                {support?.needsLocalhost && (
                  <>
                    <div className="button-row">
                      <button className="text-button" onClick={onExport}>
                        导出加密备份
                      </button>
                      <a
                        className="text-button"
                        href={`http://localhost:${location.port || "5189"}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        打开 localhost
                        <ArrowUpRight size={13} />
                      </a>
                    </div>
                    <p>
                      两个地址的浏览器存储相互独立。在新地址恢复备份后即可设置，旧地址的钱包仍会保留。
                    </p>
                  </>
                )}
              </div>
            )}
            {feedback}
          </div>
          {enabled ? (
            <div className="flow-footer">
              <button
                className="button full"
                disabled={busy}
                onClick={() => {
                  setError("");
                  try {
                    disableBiometric();
                    setEnabled(false);
                    setMessage("设备解锁已停用，系统中的通行密钥可自行删除");
                  } catch (error) {
                    setError(deviceError(error));
                  }
                }}
              >
                停用设备解锁
              </button>
            </div>
          ) : (
            support?.available && (
              <div className="flow-footer">
                <button
                  form="enable-device-unlock"
                  className="button primary full"
                  disabled={busy}
                >
                  <Fingerprint size={18} />
                  {busy ? "等待系统验证…" : "开启指纹 / 面容解锁"}
                </button>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
