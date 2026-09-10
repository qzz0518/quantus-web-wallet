import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check, LockKeyholeOpen, TriangleAlert } from "lucide-react";
import {
  disableAutoUnlock,
  enableAutoUnlock,
  hasAutoUnlock,
} from "../lib/auto-unlock";
import { errorText } from "../lib/amount";
import { useT } from "../lib/i18n";
import { FlowStatus } from "./FlowStatus";

/** Settings panel for the password-free mode: explain, warn, enable, disable. */
export function AutoUnlockSettings({
  onBusyChange,
}: {
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useT();
  const [enabled, setEnabled] = useState(() => hasAutoUnlock());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const passwordInput = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (error && !busy) passwordInput.current?.focus();
  }, [error, busy]);

  async function enable(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await enableAutoUnlock(password);
      if (!mounted.current) return;
      setEnabled(true);
      setMessage(t("免密模式已开启，下次打开页面时自动解锁"));
    } catch (cause) {
      if (mounted.current) setError(errorText(cause));
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setPassword("");
        setBusy(false);
      }
    }
  }
  async function disable() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await disableAutoUnlock();
      if (!mounted.current) return;
      setEnabled(false);
      setMessage(t("免密模式已关闭，下次打开页面需要密码"));
    } catch (cause) {
      if (mounted.current) setError(errorText(cause));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="device-settings device-settings-autounlock">
      <div className="flow-body">
        <div className="flow-heading">
          <span className="flow-symbol">
            <LockKeyholeOpen size={30} />
          </span>
          <h2>{t("打开页面，钱包即已解锁")}</h2>
          <p>
            {t(
              "在这台电脑上打开钱包时自动解锁，不再输入密码。设备解锁和密码解锁仍然保留。",
            )}
          </p>
        </div>
        <div className="callout warm" role="note">
          <TriangleAlert size={17} />
          <div>
            {t(
              "解锁密钥会保存在这个浏览器里。任何能在这台电脑上打开这个浏览器的人，都能打开钱包。请只在私人电脑上使用。",
            )}
          </div>
        </div>
        {enabled ? (
          <div className="device-enabled-state">
            <Check size={20} />
            <strong>{t("免密模式已开启")}</strong>
            <p>
              {t(
                "打开页面时自动解锁，闲置不再自动锁定。手动锁定后，本次页面内需用密码解锁。",
              )}
            </p>
          </div>
        ) : (
          <form
            id="enable-auto-unlock"
            className="flow-form"
            aria-label={t("开启免密模式")}
            onSubmit={enable}
          >
            <label className="field">
              {t("验证当前密码")}
              <input
                aria-label={t("开启免密模式的密码")}
                ref={passwordInput}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                required
                disabled={busy}
              />
            </label>
          </form>
        )}
        <FlowStatus error={error} errorId={errorId} message={message} />
      </div>
      <div className="flow-footer">
        {enabled ? (
          <button className="button full" disabled={busy} onClick={disable}>
            {busy ? t("正在关闭…") : t("关闭免密模式")}
          </button>
        ) : (
          <button
            form="enable-auto-unlock"
            className="button primary full"
            disabled={busy || !password}
          >
            <LockKeyholeOpen size={18} />
            {busy ? t("正在验证…") : t("开启免密模式")}
          </button>
        )}
      </div>
    </div>
  );
}
