import {
  ArrowUpRight,
  Github,
  Globe,
  Wallet as WalletIcon,
} from "lucide-react";
import { Modal } from "../Modal";
import {
  GITHUB_URL,
  PROJECT_NAME,
  WEBSITE_URL,
  X_URL,
} from "../../lib/project";

export function AboutDialog({
  onClose,
  onBack,
}: {
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <Modal title="关于钱包" variant="flow" onClose={onClose} onBack={onBack}>
      <div className="flow-body about-page">
        <div className="flow-heading">
          <span className="flow-symbol">
            <WalletIcon size={30} />
          </span>
          <h2>{PROJECT_NAME}</h2>
          <p>
            在浏览器中管理你的 Quantus 账户。社区开发，非 Quantus 官方产品。
          </p>
        </div>
        <nav className="settings-group about-links" aria-label="项目与作者链接">
          <a
            className="settings-row"
            href={WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="settings-row-icon">
              <Globe size={19} />
            </span>
            <span className="settings-row-copy">
              <strong>钱包网站</strong>
              <small>qtc.zezn.dev</small>
            </span>
            <ArrowUpRight size={17} />
          </a>
          <a
            className="settings-row"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="settings-row-icon">
              <Github size={19} />
            </span>
            <span className="settings-row-copy">
              <strong>GitHub</strong>
              <small>查看源代码</small>
            </span>
            <ArrowUpRight size={17} />
          </a>
          <a
            className="settings-row"
            href={X_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="settings-row-icon" aria-hidden="true">
              𝕏
            </span>
            <span className="settings-row-copy">
              <strong>关注作者</strong>
              <small>@zerah_eth</small>
            </span>
            <ArrowUpRight size={17} />
          </a>
        </nav>
      </div>
      <div className="flow-footer">
        <button className="button primary full" onClick={onBack || onClose}>
          返回设置
        </button>
      </div>
    </Modal>
  );
}
