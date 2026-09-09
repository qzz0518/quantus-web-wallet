import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Download,
  Fingerprint,
  Info,
  KeyRound,
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
import { DeviceUnlockSettings } from "../DeviceUnlockSettings";
import { ThemePicker } from "../ThemePicker";
import { dismissModal } from "../../lib/motion";
import { Modal } from "../Modal";
import { AboutDialog } from "../dialogs/AboutDialog";

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
    <section className="settings-page" aria-label="钱包设置">
      <button
        className="settings-profile"
        onClick={() => secured(wallet ? onManage : onWallets)}
        aria-label={
          unlocked ? (wallet ? "查看当前钱包详情" : "添加钱包") : "解锁钱包"
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
        <strong>{unlocked ? wallet?.name || "我的钱包" : "钱包已锁定"}</strong>
        <span className="settings-profile-address">
          {visibleWallet
            ? shortAddress(visibleWallet.address, 6)
            : unlocked
              ? "添加你的第一个账户"
              : "解锁后管理账户"}
          <ChevronRight size={14} />
        </span>
      </button>

      <section className="settings-group" aria-label="账户">
        <h2>账户</h2>
        <SettingsRow
          icon={<WalletCards size={19} />}
          title={unlocked && !walletCount ? "添加钱包" : "我的钱包"}
          value={
            unlocked
              ? walletCount
                ? `${walletCount} 个`
                : undefined
              : "解锁后查看"
          }
          onClick={() => secured(onWallets)}
        />
      </section>

      <section className="settings-group" aria-label="安全与备份">
        <h2>安全与备份</h2>
        <SettingsRow
          icon={<KeyRound size={19} />}
          title="解锁密码"
          onClick={() => secured(() => openPanel("password"))}
        />
        <SettingsRow
          icon={<Fingerprint size={19} />}
          title="设备解锁"
          value={
            unlocked ? (deviceEnabled ? "已开启" : "未开启") : "解锁后查看"
          }
          onClick={() => secured(() => openPanel("biometric"))}
        />
        <SettingsRow
          icon={<Download size={19} />}
          title="加密备份"
          onClick={() => secured(() => openPanel("backup"))}
        />
      </section>

      <section className="settings-group" aria-label="应用">
        <h2>应用</h2>
        <div className="settings-row settings-appearance">
          <span className="settings-row-icon" aria-hidden="true">
            <Palette size={19} />
          </span>
          <span className="settings-row-copy">
            <strong>外观</strong>
          </span>
          <ThemePicker />
        </div>
        <SettingsRow
          icon={<Smartphone size={19} />}
          title="添加到主屏幕"
          value={installation.installed ? "已添加" : undefined}
          onClick={() => openPanel("install")}
        />
        <SettingsRow
          icon={<Info size={19} />}
          title="关于钱包"
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
          {unlocked ? "锁定钱包" : "解锁钱包"}
        </button>
        <span>{PROJECT_NAME}</span>
      </div>

      {(panel === "password" || panel === "biometric") && (
        <Modal
          title={panel === "password" ? "解锁密码" : "设备解锁"}
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
          title="加密备份"
          variant="flow"
          onClose={closePanel}
          onBack={closePanel}
        >
          <div className="flow-body">
            <div className="flow-heading">
              <span className="flow-symbol">
                <Download size={29} />
              </span>
              <h2>为钱包留一份备份</h2>
              <p>导出这台设备上的全部钱包。恢复时需要当前解锁密码。</p>
            </div>
            <div className="flow-summary">
              <span>备份内容</span>
              <strong>{walletCount} 个钱包</strong>
              <span>文件格式</span>
              <strong>加密 JSON</strong>
            </div>
            <p className="flow-note">
              请将备份文件保存在另一台设备。修改密码或添加钱包后，记得重新备份。
            </p>
            {backupExported && (
              <p className="flow-success" role="status">
                <Check size={17} />
                备份下载已开始
              </p>
            )}
            {backupError && (
              <p className="error" role="alert">
                {backupError}
              </p>
            )}
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
                  setBackupError("备份导出失败，请重试。");
                }
              }}
            >
              <Download size={18} />
              {backupExported ? "再次导出备份" : "导出加密备份"}
            </button>
          </div>
        </Modal>
      )}
      {panel === "install" && (
        <Modal
          title="添加到主屏幕"
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
                {installation.installed ? "钱包已在主屏幕" : "随手打开你的钱包"}
              </h2>
              <p>
                {installation.installed
                  ? "下次可以直接从主屏幕打开，继续管理你的账户。"
                  : "像应用一样打开钱包，快速查看资产和交易。"}
              </p>
            </div>
            {!installation.installed &&
              !installation.canPrompt &&
              !installBusy && (
                <div className="flow-note install-instructions">
                  {!installation.secure ? (
                    <p>请通过 HTTPS 或 localhost 打开钱包后安装。</p>
                  ) : installation.isIOS ? (
                    <ol>
                      <li>用 Safari 打开钱包。</li>
                      <li>点击浏览器的分享按钮。</li>
                      <li>选择“添加到主屏幕”。</li>
                    </ol>
                  ) : (
                    <p>打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。</p>
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
                      "暂时无法打开安装窗口，请从浏览器菜单安装。",
                    );
                  } finally {
                    setInstallBusy(false);
                  }
                }}
              >
                <ArrowUpRight size={18} />
                {installBusy ? "请在系统窗口中确认…" : "安装钱包应用"}
              </button>
            ) : (
              <button className="button primary full" onClick={closePanel}>
                知道了
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
