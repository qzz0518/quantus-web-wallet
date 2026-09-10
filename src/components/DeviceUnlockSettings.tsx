import { useEffect, useId, useRef, useState, type FormEvent } from "react";
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
import { useT } from "../lib/i18n";
import { FlowStatus } from "./FlowStatus";

export function DeviceUnlockSettings({
  section,
  onChangePassword,
  onExport,
  onBusyChange,
  onDone,
}: {
  section: "password" | "biometric";
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  onExport: () => void;
  onBusyChange?: (busy: boolean) => void;
  onDone?: () => void;
}) {
  const t = useT();
  const [support, setSupport] = useState<DeviceSupport | null>(null);
  const [enabled, setEnabled] = useState(() => hasBiometric());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [deviceReset, setDeviceReset] = useState(false);
  const [passwordErrorField, setPasswordErrorField] = useState<
    "current" | "new" | "confirmation" | null
  >(null);
  const controller = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const currentPasswordInput = useRef<HTMLInputElement>(null);
  const newPasswordInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const devicePasswordInput = useRef<HTMLInputElement>(null);
  const errorId = useId();

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
  useEffect(() => {
    if (!error || busy) return;
    if (section === "biometric") devicePasswordInput.current?.focus();
    else if (passwordErrorField === "current")
      currentPasswordInput.current?.focus();
  }, [error, busy, passwordErrorField, section]);

  async function enable(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    controller.current = new AbortController();
    try {
      await enrollBiometric(password, controller.current.signal);
      setEnabled(true);
      setMessage(t("设备解锁已开启，下次锁定后即可使用"));
    } catch (error) {
      setError(deviceError(error));
    } finally {
      setPassword("");
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || passwordChanged) return;
    setError("");
    setMessage("");
    setPasswordErrorField(null);
    if (newPassword.length < 6) {
      setPasswordErrorField("new");
      setError(t("新密码至少需要 6 位"));
      newPasswordInput.current?.focus();
      return;
    }
    if (newPassword !== confirmation) {
      setPasswordErrorField("confirmation");
      setError(t("两次输入的新密码不一致，请检查确认密码"));
      confirmationInput.current?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await onChangePassword(oldPassword, newPassword);
      setDeviceReset(enabled);
      setEnabled(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmation("");
      setPasswordChanged(true);
    } catch (error) {
      const text = deviceError(error);
      setError(text);
      if (/密码不正确|incorrect password/i.test(text)) {
        setOldPassword("");
        setPasswordErrorField("current");
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function exportBackup() {
    setError("");
    setMessage("");
    try {
      onExport();
      setMessage(t("备份下载已开始"));
    } catch {
      setError(t("备份导出失败，请重试。"));
    }
  }

  const feedback = (
    <FlowStatus error={error} errorId={errorId} message={message} />
  );

  return (
    <div className={`device-settings device-settings-${section}`}>
      {section === "password" ? (
        passwordChanged ? (
          <>
            <div className="flow-body">
              <div className="flow-heading">
                <span className="flow-symbol">
                  <Check size={30} />
                </span>
                <h2>{t("密码已更新")}</h2>
                <p>{t("请使用新密码解锁，并重新导出一份加密备份。")}</p>
              </div>
              {deviceReset && (
                <p className="flow-note">
                  {t("原设备解锁已停用，可返回设置重新开启。")}
                </p>
              )}
              {feedback}
            </div>
            <div className="flow-footer">
              <button className="button primary full" onClick={exportBackup}>
                <Download size={18} />
                {t("导出新备份")}
              </button>
              {onDone && (
                <button className="button full" onClick={onDone}>
                  {t("完成")}
                </button>
              )}
            </div>
          </>
        ) : (
          <form
            className="flow-form"
            aria-label={t("修改解锁密码")}
            onSubmit={changePassword}
          >
            <div className="flow-body">
              <div className="flow-heading">
                <span className="flow-symbol">
                  <KeyRound size={29} />
                </span>
                <h2>{t("更新解锁密码")}</h2>
                <p>{t("至少 6 位。修改后，请使用新密码解锁并重新备份钱包。")}</p>
              </div>
              <label className="field">
                {t("当前密码")}
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  autoFocus
                  aria-label={t("修改密码的当前密码")}
                  ref={currentPasswordInput}
                  aria-invalid={passwordErrorField === "current" || undefined}
                  aria-describedby={
                    passwordErrorField === "current" ? errorId : undefined
                  }
                  value={oldPassword}
                  onChange={(event) => {
                    setOldPassword(event.target.value);
                    setError("");
                    setPasswordErrorField(null);
                  }}
                  disabled={busy}
                />
              </label>
              <label className="field">
                {t("新密码")}
                <input
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  required
                  placeholder={t("至少 6 位")}
                  ref={newPasswordInput}
                  aria-invalid={passwordErrorField === "new" || undefined}
                  aria-describedby={
                    passwordErrorField === "new" ? errorId : undefined
                  }
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(event.target.value);
                    setError("");
                    setPasswordErrorField(null);
                  }}
                  disabled={busy}
                />
              </label>
              <label className="field">
                {t("确认新密码")}
                <input
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  required
                  placeholder={t("再次输入新密码")}
                  ref={confirmationInput}
                  aria-invalid={
                    passwordErrorField === "confirmation" || undefined
                  }
                  aria-describedby={
                    passwordErrorField === "confirmation" ? errorId : undefined
                  }
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setError("");
                    setPasswordErrorField(null);
                  }}
                  disabled={busy}
                />
              </label>
              {feedback}
            </div>
            <div className="flow-footer">
              <button
                className="button primary full"
                disabled={busy || !oldPassword || !newPassword || !confirmation}
              >
                {busy ? t("正在更新…") : t("更新密码")}
              </button>
            </div>
          </form>
        )
      ) : (
        <>
          <div className="flow-body">
            <div className="flow-heading">
              <span className="flow-symbol">
                <Fingerprint size={31} />
              </span>
              <h2>{t("轻触一下，解锁钱包")}</h2>
              <p>
                {t(
                  "使用指纹、面容或设备验证快速解锁。可用方式由系统决定，密码解锁始终保留。",
                )}
              </p>
            </div>
            {enabled ? (
              <div className="device-enabled-state">
                <Check size={20} />
                <strong>{t("设备解锁已开启")}</strong>
                <p>{t("每次解锁都需要系统验证。")}</p>
              </div>
            ) : support?.available ? (
              <form
                id="enable-device-unlock"
                className="flow-form"
                aria-label={t("开启设备解锁")}
                onSubmit={enable}
              >
                <label className="field">
                  {t("验证当前密码")}
                  <input
                    aria-label={t("开启设备解锁的密码")}
                    ref={devicePasswordInput}
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
            ) : (
              <div className="flow-note">
                <p>{support?.reason || t("正在检测设备支持…")}</p>
                {support?.needsLocalhost && (
                  <>
                    <div className="button-row">
                      <button className="text-button" onClick={exportBackup}>
                        {t("导出加密备份")}
                      </button>
                      <a
                        className="text-button"
                        href={`http://localhost:${location.port || "5189"}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("打开 localhost")}
                        <ArrowUpRight size={13} />
                      </a>
                    </div>
                    <p>
                      {t(
                        "两个地址的浏览器存储相互独立。在新地址恢复备份后即可设置，旧地址的钱包仍会保留。",
                      )}
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
                  setMessage("");
                  try {
                    disableBiometric();
                    setEnabled(false);
                    setMessage(t("设备解锁已停用，系统中的通行密钥可自行删除"));
                  } catch (error) {
                    setError(deviceError(error));
                  }
                }}
              >
                {t("停用设备解锁")}
              </button>
            </div>
          ) : support?.available ? (
            <div className="flow-footer">
              <button
                form="enable-device-unlock"
                className="button primary full"
                disabled={busy || !password}
              >
                <Fingerprint size={18} />
                {busy ? t("等待系统验证…") : t("开启指纹 / 面容解锁")}
              </button>
            </div>
          ) : onDone ? (
            <div className="flow-footer">
              <button className="button primary full" onClick={onDone}>
                {t("返回设置")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
