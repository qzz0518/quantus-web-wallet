import { useState } from "react";
import {
  Download,
  ExternalLink,
  Github,
  Smartphone,
  LockKeyhole,
  ShieldCheck,
  Wallet as WalletIcon,
} from "lucide-react";
import { Modal } from "../Modal";
import { DeviceUnlockSettings } from "../DeviceUnlockSettings";
import { GITHUB_URL, PROJECT_NAME, X_URL } from "../../lib/project";
import { installPwa, usePwaInstall } from "../../lib/pwa";

export function AboutDialog({
  onClose,
  onExport,
  onChangePassword,
}: {
  onClose: () => void;
  onExport: () => void;
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>;
}) {
  const installation = usePwaInstall();
  const [installError, setInstallError] = useState("");
  return (
    <Modal
      title="安全与备份"
      subtitle="管理解锁方式，备份这台设备上的钱包。"
      onClose={onClose}
    >
      <DeviceUnlockSettings
        onChangePassword={onChangePassword}
        onExport={onExport}
      />
      <button className="button primary full spaced" onClick={onExport}>
        <Download size={16} />
        导出全部钱包的加密备份
      </button>
      <p className="hint">
        备份由当前解锁密码保护。此社区钱包尚未经过独立安全审计，正式使用前请先小额验证。
      </p>
      <details className="security-details">
        <summary>了解钱包的安全机制</summary>
        <div className="security-list">
          <div>
            <LockKeyhole size={20} />
            <span>
              <strong>本机加密保存</strong>
              <p>
                AES-256-GCM 加密，密码通过 PBKDF2 派生。闲置 10 分钟自动锁定。
              </p>
            </span>
          </div>
          <div>
            <WalletIcon size={20} />
            <span>
              <strong>直接连接主网</strong>
              <p>余额来自官方 RPC，活动来自官方区块浏览器的索引服务。</p>
            </span>
          </div>
          <div>
            <ShieldCheck size={20} />
            <span>
              <strong>本地完成签名</strong>
              <p>
                基于官方 Quantus WASM，适配主网 ML-DSA-87。助记词不会发送到网络。
              </p>
            </span>
          </div>
        </div>
      </details>
      {!installation.installed && (
        <section className="manage-section">
          <h3>
            <Smartphone size={17} />
            添加到主屏幕
          </h3>
          {installation.canPrompt ? (
            <>
              <p>像应用一样打开钱包，快速管理你的账户。</p>
              <button
                className="button full"
                onClick={async () => {
                  setInstallError("");
                  try {
                    await installPwa();
                  } catch {
                    setInstallError("暂时无法打开安装窗口，请从浏览器菜单安装。");
                  }
                }}
              >
                <Download size={16} />
                安装钱包应用
              </button>
            </>
          ) : (
            <p>
              {!installation.secure
                ? "请通过 HTTPS 或 localhost 打开钱包后安装。"
                : installation.isIOS
                  ? "用 Safari 打开钱包，点击“分享” → “添加到主屏幕”。"
                  : "在浏览器菜单中选择“安装应用”或“添加到主屏幕”。"}
            </p>
          )}
          {installError && <p className="error" role="alert">{installError}</p>}
        </section>
      )}
      <section className="manage-section">
        <h3>{PROJECT_NAME}</h3>
        <nav className="button-row" aria-label="项目与作者链接">
          <a
            className="text-button grow"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github size={16} />
            GitHub
            <ExternalLink size={13} />
          </a>
          <a
            className="text-button grow"
            href={X_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            X / @zerah_eth
            <ExternalLink size={13} />
          </a>
        </nav>
      </section>
    </Modal>
  );
}
