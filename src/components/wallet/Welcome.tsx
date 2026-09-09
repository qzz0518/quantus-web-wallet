import {
  ArrowDownToLine,
  ArrowUpRight,
  Fingerprint,
  Plus,
  Wallet,
} from "lucide-react";
import { WalletLogo } from "./WalletLogo";
import type { WalletDialog } from "./types";

export function Welcome({
  hasVault,
  unlocked,
  onOpen,
  onRestore,
}: {
  hasVault: boolean;
  unlocked: boolean;
  onOpen: (target: WalletDialog) => void;
  onRestore: () => void;
}) {
  const locked = hasVault && !unlocked;
  return (
    <section className="welcome-screen">
      <div className="welcome-art" aria-hidden="true">
        <div className="welcome-card">
          <WalletLogo />
          <span>quantus</span>
          <small>由你掌握</small>
        </div>
      </div>
      <div className="welcome-copy">
        <h1>{locked ? "欢迎回来" : "你的钱包，由你掌握"}</h1>
        <p>
          {locked
            ? "解锁钱包，继续管理你的 Quantus 资产。"
            : "发送、接收与管理 Quantus。\n从一个属于自己的钱包开始。"}
        </p>
        <div className="welcome-actions">
          {locked ? (
            <button
              className="button primary full"
              onClick={() => onOpen("unlock")}
            >
              <Fingerprint size={19} />
              解锁钱包
            </button>
          ) : (
            <>
              <button
                className="button primary full"
                onClick={() => onOpen("create")}
              >
                <Plus size={18} />
                创建新钱包
              </button>
              <button className="button full" onClick={() => onOpen("import")}>
                <ArrowDownToLine size={18} />
                导入已有钱包
              </button>
              <div className="welcome-secondary">
                <button onClick={() => onOpen("watch")}>
                  <Wallet size={15} />
                  观察地址
                </button>
                {!hasVault && (
                  <button onClick={onRestore}>
                    恢复加密备份
                    <ArrowUpRight size={13} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <p className="welcome-note">密钥加密保存在这台设备上</p>
      </div>
    </section>
  );
}
