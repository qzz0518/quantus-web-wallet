import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Eye,
  Plus,
  Wallet as WalletIcon,
} from "lucide-react";
import type { Wallet } from "../../lib/vault";
import { shortAddress } from "../../lib/amount";
import { Modal } from "../Modal";

type WalletSwitcherProps = {
  wallets: Wallet[];
  wallet?: Wallet;
  onSelect: (id: string) => void;
  onClose: () => void;
  onAdd: () => void;
};

export function WalletSwitcher({
  wallets,
  wallet,
  onSelect,
  onClose,
  onAdd,
}: WalletSwitcherProps) {
  return (
    <Modal title="切换钱包" onClose={onClose}>
      <div className="wallet-switcher-list">
        {wallets.map((w, i) => (
          <button
            key={w.id}
            className={`wallet-switcher-item ${wallet?.id === w.id ? "selected" : ""}`}
            onClick={() => {
              onSelect(w.id);
              onClose();
            }}
          >
            <span className={`wallet-avatar color-${i % 4}`}>
              {w.kind === "watch" ? (
                <Eye size={19} />
              ) : (
                <WalletIcon size={19} />
              )}
            </span>
            <span>
              <strong>{w.name}</strong>
              <small>{shortAddress(w.address, 7)}</small>
            </span>
            {wallet?.id === w.id && <Check size={18} />}
          </button>
        ))}
      </div>
      <button className="button primary full spaced" onClick={onAdd}>
        <Plus size={17} />
        添加钱包
      </button>
    </Modal>
  );
}

export function WalletChooser({
  onClose,
  onChoose,
}: {
  onClose: () => void;
  onChoose: (mode: "create" | "import" | "watch") => void;
}) {
  return (
    <Modal
      title="添加一个钱包"
      subtitle="选择适合你的开始方式。"
      onClose={onClose}
    >
      <div className="wallet-options">
        {[
          {
            mode: "create" as const,
            icon: <Plus size={21} />,
            title: "创建新钱包",
            desc: "生成一个独立的地址与助记词",
            color: "mint",
          },
          {
            mode: "import" as const,
            icon: <ArrowDownToLine size={21} />,
            title: "导入已有钱包",
            desc: "通过 ML-DSA-87 助记词恢复",
            color: "lavender",
          },
          {
            mode: "watch" as const,
            icon: <Eye size={21} />,
            title: "添加观察钱包",
            desc: "查看余额、转账记录与挖矿奖励",
            color: "peach",
          },
        ].map((o) => (
          <button key={o.mode} onClick={() => onChoose(o.mode)}>
            <span className={`option-icon ${o.color}`}>{o.icon}</span>
            <span>
              <strong>{o.title}</strong>
              <small>{o.desc}</small>
            </span>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
      <p className="hint centered">你可以添加多个钱包，并随时切换。</p>
    </Modal>
  );
}
