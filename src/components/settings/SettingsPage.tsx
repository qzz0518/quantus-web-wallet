import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Download,
  Fingerprint,
  Info,
  KeyRound,
  Languages,
  LockKeyhole,
  Palette,
  Smartphone,
  Wallet as WalletIcon,
  WalletCards,
} from "lucide-react";
import type { Wallet } from "../../lib/vault";
import { hasBiometric } from "../../lib/biometric";
import { installPwa, usePwaInstall } from "../../lib/pwa";
import { PROJECT_NAME } from "../../lib/project";
import { shortAddress } from "../../lib/amount";
import { useT } from "../../lib/i18n";
import { DeviceUnlockSettings } from "../DeviceUnlockSettings";
import { ThemePicker } from "../ThemePicker";
import { LanguagePicker } from "../LanguagePicker";
import { dismissModal } from "../../lib/motion";
import { Modal } from "../Modal";
import { AboutDialog } from "../dialogs/AboutDialog";
import { FlowStatus } from "../FlowStatus";

type SettingsPanel =
  | "password"
  | "biometric"
  | "backup"
  | "install"
  | "about"
  | null;

type SettingsPageProps = {
  wallet?: Wallet;
  walletCount: number;
  unlocked?: boolean;
  onManage: () => void;
  onWallets: () => void;
  onExport: () => void;
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  onLock: () => void;
  onUnlock?: () => void;
};

function SettingsRow({
  icon,
  title,
  value,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  value?: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button className="settings-row" onClick={onClick}>
      <span className="settings-row-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="settings-row-copy">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      {value && <span className="settings-row-value">{value}</span>}
      <ChevronRight size={17} aria-hidden="true" />
    </button>
  );
}

export function SettingsPage({
  wallet,
  walletCount,
  unlocked = true,
  onManage,
  onWallets,
  onExport,
  onChangePassword,
  onLock,
  onUnlock,
}: SettingsPageProps) {
  const t = useT();
  const [panel, setPanel] = useState<SettingsPanel>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [installError, setInstallError] = useState("");
  const [installBusy, setInstallBusy] = useState(false);
  const [backupExported, setBackupExported] = useState(false);
  const [backupError, setBackupError] = useState("");
  const installation = usePwaInstall();
  const deviceEnabled = unlocked && hasBiometric();
  const visibleWallet = unlocked ? wallet : undefined;
  const secured = (action: () => void) => {
    if (unlocked) action();
    else onUnlock?.();
  };
  const openPanel = (next: SettingsPanel) => {
    setInstallError("");
    setBackupExported(false);
    setBackupError("");
    setPanel(next);
  };
  const closePanel = () => {
    if (!panelBusy && !installBusy) dismissModal(() => setPanel(null));
  };

  return (
    <section className="settings-page" aria-label={t("钱包设置")}>
      <button
        className="settings-profile"
        onClick={() => secured(wallet ? onManage : onWallets)}
        aria-label={
          unlocked
            ? wallet
              ? t("查看当前钱包详情")
              : t("添加钱包")
            : t("解锁钱包")
        }
      >
        <span className="settings-profile-avatar" aria-hidden="true">
          {visibleWallet ? (
            Array.from(visibleWallet.name.trim())[0]?.toUpperCase() || (
              <WalletIcon size={29} />
            )
          ) : (
            <WalletIcon size={29} />
          )}
        </span>
        <strong>
          {unlocked ? wallet?.name || t("我的钱包") : t("钱包已锁定")}
        </strong>
        <span className="settings-profile-address">
          {visibleWallet
            ? shortAddress(visibleWallet.address, 6)
            : unlocked
              ? t("添加你的第一个账户")
              : t("解锁后管理账户")}
          <ChevronRight size={14} />
        </span>
      </button>

      <section className="settings-group" aria-label={t("账户")}>
        <h2>{t("账户")}</h2>
        <SettingsRow
          icon={<WalletCards size={19} />}
          title={unlocked && !walletCount ? t("添加钱包") : t("我的钱包")}
          value={
            unlocked
              ? walletCount
                ? t("{0} 个", walletCount)
                : undefined
              : t("解锁后查看")
          }
          onClick={() => secured(onWallets)}
        />
      </section>

      <section className="settings-group" aria-label={t("安全与备份")}>
        <h2>{t("安全与备份")}</h2>
        <SettingsRow
          icon={<KeyRound size={19} />}
          title={t("解锁密码")}
          onClick={() => secured(() => openPanel("password"))}
        />
        <SettingsRow
          icon={<Fingerprint size={19} />}
          title={t("设备解锁")}
          value={
            unlocked
              ? deviceEnabled
                ? t("已开启")
                : t("未开启")
              : t("解锁后查看")
          }
          onClick={() => secured(() => openPanel("biometric"))}
        />
        <SettingsRow
          icon={<Download size={19} />}
          title={t("加密备份")}
          onClick={() => secured(() => openPanel("backup"))}
        />
      </section>

      <section className="settings-group" aria-label={t("应用")}>
        <h2>{t("应用")}</h2>
        <div className="settings-row settings-appearance">
          <span className="settings-row-icon" aria-hidden="true">
            <Palette size={19} />
          </span>
          <span className="settings-row-copy">
            <strong>{t("外观")}</strong>
          </span>
          <ThemePicker />
        </div>
        <div className="settings-row settings-appearance">
          <span className="settings-row-icon" aria-hidden="true">
            <Languages size={19} />
          </span>
          <span className="settings-row-copy">
            <strong>{t("语言")}</strong>
          </span>
          <LanguagePicker />
        </div>
        <SettingsRow
          icon={<Smartphone size={19} />}
          title={t("添加到主屏幕")}
          value={installation.installed ? t("已添加") : undefined}
          onClick={() => openPanel("install")}
        />
        <SettingsRow
          icon={<Info size={19} />}
          title={t("关于钱包")}
          onClick={() => openPanel("about")}
        />
      </section>

      <div className="settings-footer">
        <button
          className="settings-lock"
          onClick={unlocked ? onLock : onUnlock}
          disabled={!unlocked && !onUnlock}
        >
          <LockKeyhole size={17} />
          {unlocked ? t("锁定钱包") : t("解锁钱包")}
        </button>
        <span>{PROJECT_NAME}</span>
      </div>

      {(panel === "password" || panel === "biometric") && (
        <Modal
          title={panel === "password" ? t("解锁密码") : t("设备解锁")}
          variant="flow"
          busy={panelBusy}
          onClose={closePanel}
          onBack={closePanel}
        >
          <DeviceUnlockSettings
            key={panel}
            section={panel}
            onChangePassword={onChangePassword}
            onExport={onExport}
            onBusyChange={setPanelBusy}
            onDone={closePanel}
          />
        </Modal>
      )}
      {panel === "backup" && (
        <Modal
          title={t("加密备份")}
          variant="flow"
          onClose={closePanel}
          onBack={closePanel}
        >
          <div className="flow-body">
            <div className="flow-heading">
              <span className="flow-symbol">
                <Download size={29} />
              </span>
              <h2>{t("为钱包留一份备份")}</h2>
              <p>{t("导出这台设备上的全部钱包。恢复时需要当前解锁密码。")}</p>
            </div>
            <div className="flow-summary">
              <span>{t("备份内容")}</span>
              <strong>
                {walletCount === 1
                  ? t("1 个钱包")
                  : t("{0} 个钱包", walletCount)}
              </strong>
              <span>{t("文件格式")}</span>
              <strong>{t("加密 JSON")}</strong>
            </div>
            <p className="flow-note">
              {t(
                "请将备份文件保存在另一台设备。修改密码或添加钱包后，记得重新备份。",
              )}
            </p>
            <FlowStatus
              error={backupError}
              message={backupExported ? t("备份下载已开始") : ""}
            />
          </div>
          <div className="flow-footer">
            <button
              className="button primary full"
              onClick={() => {
                setBackupExported(false);
                setBackupError("");
                try {
                  onExport();
                  setBackupExported(true);
                } catch {
                  setBackupError(t("备份导出失败，请重试。"));
                }
              }}
            >
              <Download size={18} />
              {backupExported ? t("再次导出备份") : t("导出加密备份")}
            </button>
          </div>
        </Modal>
      )}
      {panel === "install" && (
        <Modal
          title={t("添加到主屏幕")}
          variant="flow"
          busy={installBusy}
          onClose={closePanel}
          onBack={closePanel}
        >
          <div className="flow-body">
            <div className="flow-heading">
              <span className="flow-symbol">
                <Smartphone size={29} />
              </span>
              <h2>
                {installation.installed
                  ? t("钱包已在主屏幕")
                  : t("随手打开你的钱包")}
              </h2>
              <p>
                {installation.installed
                  ? t("下次可以直接从主屏幕打开，继续管理你的账户。")
                  : t("像应用一样打开钱包，快速查看资产和交易。")}
              </p>
            </div>
            {!installation.installed &&
              !installation.canPrompt &&
              !installBusy && (
                <div className="flow-note install-instructions">
                  {!installation.secure ? (
                    <p>{t("请通过 HTTPS 或 localhost 打开钱包后安装。")}</p>
                  ) : installation.isIOS ? (
                    <ol>
                      <li>{t("用 Safari 打开钱包。")}</li>
                      <li>{t("点击浏览器的分享按钮。")}</li>
                      <li>{t("选择“添加到主屏幕”。")}</li>
                    </ol>
                  ) : (
                    <p>
                      {t("打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。")}
                    </p>
                  )}
                </div>
              )}
            {installError && (
              <p className="error" role="alert">
                {installError}
              </p>
            )}
          </div>
          <div className="flow-footer">
            {(installation.canPrompt || installBusy) &&
            !installation.installed ? (
              <button
                className="button primary full"
                disabled={installBusy}
                onClick={async () => {
                  if (installBusy) return;
                  setInstallError("");
                  setInstallBusy(true);
                  try {
                    await installPwa();
                  } catch {
                    setInstallError(
                      t("暂时无法打开安装窗口，请从浏览器菜单安装。"),
                    );
                  } finally {
                    setInstallBusy(false);
                  }
                }}
              >
                <ArrowUpRight size={18} />
                {installBusy ? t("请在系统窗口中确认…") : t("安装钱包应用")}
              </button>
            ) : (
              <button className="button primary full" onClick={closePanel}>
                {t("知道了")}
              </button>
            )}
          </div>
        </Modal>
      )}
      {panel === "about" && (
        <AboutDialog onClose={closePanel} onBack={closePanel} />
      )}
    </section>
  );
}
