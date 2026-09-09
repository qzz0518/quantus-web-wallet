import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Modal } from "../Modal";
import { unlockVault, STORAGE_KEY, type Wallet } from "../../lib/vault";
import { errorText } from "../../lib/amount";

export function ManageDialog({
  wallet,
  onClose,
  onUpdate,
  onWatchKindChange,
  onRemove,
}: {
  wallet: Wallet;
  onClose: () => void;
  onUpdate: (name: string) => Promise<void>;
  onWatchKindChange?: (kind: NonNullable<Wallet["watchKind"]>) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [name, setName] = useState(wallet.name),
    [watchKind, setWatchKind] = useState<Wallet["watchKind"] | "">(
      wallet.watchKind ?? "",
    ),
    [password, setPassword] = useState(""),
    [shown, setShown] = useState(false),
    [remove, setRemove] = useState(false),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="管理钱包"
      subtitle={
        wallet.kind === "watch" ? "观察钱包 · 仅查看" : "ML-DSA-87 · 透明账户"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <label className="field">
        钱包名称
        <input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <p className="address-block compact">{wallet.address}</p>
      <button
        className="button full"
        disabled={busy || !name.trim() || name.trim() === wallet.name}
        onClick={() =>
          action(async () => {
            await onUpdate(name.trim());
            onClose();
          })
        }
      >
        保存名称
      </button>
      {wallet.kind === "watch" && onWatchKindChange && (
        <section className="manage-section">
          <h3>观察账户类型</h3>
          <p>
            普通账户可查看公开余额；Wormhole 隐私账户只能查看公开入账。请按地址来源选择。
          </p>
          <label className="field">
            账户类型
            <select
              aria-label="观察账户类型"
              value={watchKind}
              disabled={busy}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "standard" || value === "wormhole")
                  setWatchKind(value);
              }}
            >
              <option value="" disabled>
                请选择账户类型
              </option>
              <option value="standard">普通公开账户</option>
              <option value="wormhole">Wormhole 隐私账户</option>
            </select>
          </label>
          <button
            className="button full"
            disabled={busy || !watchKind || watchKind === wallet.watchKind}
            onClick={() =>
              action(async () => {
                if (watchKind !== "standard" && watchKind !== "wormhole")
                  return;
                await onWatchKindChange(watchKind);
                onClose();
              })
            }
          >
            保存账户类型
          </button>
        </section>
      )}
      {wallet.kind !== "watch" && (
        <section className="manage-section">
          <h3>
            <KeyRound size={16} />
            助记词备份
          </h3>
          {shown ? (
            <>
              <p className="secret-display" data-private="true">
                {wallet.mnemonic}
              </p>
              <button className="text-button" onClick={() => setShown(false)}>
                <EyeOff size={15} />
                隐藏助记词
              </button>
            </>
          ) : (
            <>
              <p>输入解锁密码，在当前设备查看助记词。</p>
              <div className="button-row">
                <input
                  className="grow"
                  type="password"
                  autoComplete="current-password"
                  aria-label="查看助记词的密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="button"
                  disabled={busy || !password}
                  onClick={() =>
                    action(async () => {
                      await unlockVault(
                        password,
                        localStorage.getItem(STORAGE_KEY) || "",
                      );
                      setShown(true);
                      setPassword("");
                    })
                  }
                >
                  <Eye size={16} />
                  查看
                </button>
              </div>
            </>
          )}
        </section>
      )}
      <section className="manage-section">
        <h3>从此设备移除</h3>
        <p>
          移除不会改变链上资产。
          {wallet.kind !== "watch"
            ? "请先确认助记词已经备份。"
            : "之后可以重新添加公开地址。"}
        </p>
        {remove ? (
          <>
            <label className="check-row">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              我已保存恢复此钱包所需的信息
            </label>
            <button
              className="button danger full"
              disabled={!ack || busy}
              onClick={() =>
                action(async () => {
                  await onRemove();
                  onClose();
                })
              }
            >
              确认移除 {wallet.name}
            </button>
          </>
        ) : (
          <button
            className="text-button danger-text"
            onClick={() => setRemove(true)}
          >
            移除钱包
          </button>
        )}
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
