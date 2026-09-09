import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Eye, KeyRound } from "lucide-react";
import { Modal } from "../Modal";
import type { Wallet } from "../../lib/vault";
import { deriveAccount, generateMnemonic, validateMnemonic } from "../../crypto";
import { validateAddress } from "../../lib/chain";
import { errorText } from "../../lib/amount";

export function AddWalletDialog({
  mode,
  wallets,
  onClose,
  onSave,
}: {
  mode: "create" | "import" | "watch";
  wallets: Wallet[];
  onClose: () => void;
  onSave: (w: Wallet) => Promise<void>;
}) {
  const [name, setName] = useState(
      mode === "watch" ? "观察钱包" : `钱包 ${wallets.length + 1}`,
    ),
    [phrase, setPhrase] = useState(""),
    [address, setAddress] = useState(""),
    [index, setIndex] = useState("0"),
    [step, setStep] = useState(0),
    [answers, setAnswers] = useState(["", "", ""]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ack, setAck] = useState(false),
    [wormhole, setWormhole] = useState(false);
  useEffect(() => {
    if (mode === "create") {
      let alive = true;
      generateMnemonic()
        .then((p) => {
          if (alive) setPhrase(p);
        })
        .catch((e) => {
          if (alive) setError(errorText(e));
        });
      return () => {
        alive = false;
      };
    }
  }, [mode]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const accountIndex = Number(index);
      if (
        !Number.isInteger(accountIndex) ||
        accountIndex < 0 ||
        accountIndex > 2 ** 31 - 1
      )
        throw new Error("账户序号必须是有效的非负整数");
      const normalized = phrase.trim().toLowerCase().split(/\s+/).join(" ");
      if (mode !== "watch" && !(await validateMnemonic(normalized)))
        throw new Error("助记词无效，请检查单词和顺序");
      if (
        mode === "create" &&
        answers.some(
          (a, i) =>
            a.trim().toLowerCase() !== normalized.split(" ")[[2, 10, 19][i]],
        )
      )
        throw new Error("备份验证未通过，请检查第 3、11、20 个单词");
      const target =
        mode === "watch"
          ? validateAddress(address.trim())
          : (await deriveAccount(normalized, accountIndex)).address;
      if (wallets.some((w) => w.address === target))
        throw new Error("这个地址已经在钱包列表中");
      if (!name.trim()) throw new Error("请输入钱包名称");
      await onSave({
        id: crypto.randomUUID(),
        name: name.trim(),
        address: target,
        kind: mode === "watch" ? "watch" : "mldsa87",
        ...(mode === "watch"
          ? {
              watchKind: wormhole
                ? ("wormhole" as const)
                : ("standard" as const),
            }
          : {}),
        index: accountIndex,
        ...(mode !== "watch" ? { mnemonic: normalized } : {}),
        createdAt: Date.now(),
      });
      setPhrase("");
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const words = phrase.split(" ");
  return (
    <Modal
      title={
        mode === "create"
          ? step
            ? "验证你的备份"
            : "创建新钱包"
          : mode === "import"
            ? "导入助记词"
            : "添加观察钱包"
      }
      subtitle={
        mode === "create"
          ? "全新的地址，由你独立掌握。"
          : mode === "import"
            ? "恢复 Quantus ML-DSA-87 透明账户。"
            : "只需一个公开地址，即可查看余额和活动。"
      }
      wide={mode === "create" && !step}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        {mode === "create" && !step ? (
          <>
            <div className="callout warm">
              <KeyRound size={19} />
              <p>
                将这 24
                个单词按顺序离线保存。拥有助记词的人可以控制钱包，请勿截图或发送给他人。
              </p>
            </div>
            <div className="mnemonic-grid" data-private="true">
              {phrase ? (
                words.map((w, i) => (
                  <div key={i}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {w}
                  </div>
                ))
              ) : (
                <p className="muted">正在生成助记词…</p>
              )}
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              我已按顺序离线备份，接下来验证其中 3 个单词
            </label>
            <button
              type="button"
              className="button primary full"
              disabled={!phrase || !ack}
              onClick={() => setStep(1)}
            >
              我已备份，继续
              <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <>
            <label className="field">
              钱包名称
              <input
                maxLength={60}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：日常钱包"
                autoFocus
              />
            </label>
            {mode === "create" && (
              <div className="verify-words">
                {[3, 11, 20].map((n, i) => (
                  <label className="field" key={n}>
                    第 {n} 个单词
                    <input
                      autoComplete="off"
                      spellCheck={false}
                      value={answers[i]}
                      onChange={(e) =>
                        setAnswers((a) =>
                          a.map((v, j) => (i === j ? e.target.value : v)),
                        )
                      }
                      required
                    />
                  </label>
                ))}
              </div>
            )}
            {mode === "import" && (
              <>
                <label className="field">
                  助记词
                  <textarea
                    data-private="true"
                    rows={3}
                    autoComplete="off"
                    spellCheck={false}
                    required
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                    placeholder="按顺序输入，以空格分隔"
                  />
                </label>
                <label className="field">
                  账户序号
                  <input
                    type="number"
                    min="0"
                    max="2147483647"
                    step="1"
                    value={index}
                    onChange={(e) => setIndex(e.target.value)}
                  />
                  <small>
                    通常为 0。路径 m/44′/189189′/{index || "0"}′/0′/0′
                  </small>
                </label>
                <div className="soft-note">
                  <KeyRound size={16} />
                  <p>
                    此导入方式适用于 ML-DSA-87，不适用于 ML-DSA-65 或 Wormhole
                    挖矿账户。请核对生成的地址。
                  </p>
                </div>
              </>
            )}
            {mode === "watch" && (
              <>
                <label className="field">
                  Quantus 地址
                  <textarea
                    required
                    rows={3}
                    spellCheck={false}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="粘贴完整的主网地址"
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={wormhole}
                    onChange={(e) => setWormhole(e.target.checked)}
                  />
                  这是 Wormhole 挖矿 / 隐私地址
                </label>
                <div className="soft-note">
                  <Eye size={17} />
                  <p>
                    观察钱包可查看资产与记录，转账需使用持有对应密钥的钱包。Wormhole
                    地址只能公开查看入账，未花费余额和转出需使用官方钱包。
                  </p>
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="button-row">
              {mode === "create" && (
                <button
                  type="button"
                  className="button"
                  onClick={() => setStep(0)}
                >
                  返回查看
                </button>
              )}
              <button className="button primary grow" disabled={busy}>
                {busy
                  ? "正在处理…"
                  : mode === "create"
                    ? "创建钱包"
                    : mode === "watch"
                      ? "添加地址"
                      : "导入钱包"}
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
        {error && mode === "create" && !step && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
