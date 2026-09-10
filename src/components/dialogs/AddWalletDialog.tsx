import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  ClipboardPaste,
  Download,
  Eye,
  Wallet as WalletIcon,
} from "lucide-react";
import { Modal } from "../Modal";
import type { Wallet } from "../../lib/vault";
import {
  DEFAULT_SCHEME,
  derivationPath,
  deriveAccount,
  generateMnemonic,
  normalizeMnemonic,
  schemeLabel,
  validateMnemonic,
  type WalletScheme,
} from "../../crypto";
import { useT } from "../../lib/i18n";
import { validateAddress } from "../../lib/chain";
import { errorText, shortAddress } from "../../lib/amount";
import {
  checkMnemonicQuiz,
  createMnemonicQuiz,
  downloadMnemonicBackup,
  type MnemonicAnswers,
  type MnemonicQuestion,
} from "../../lib/mnemonic-backup";

type WalletAction = "create" | "import" | "watch";

function parseAccountIndex(value: string): number {
  const accountIndex = Number(value);
  if (
    !Number.isInteger(accountIndex) ||
    accountIndex < 0 ||
    accountIndex > 2 ** 31 - 1
  )
    throw new Error("账户序号必须是有效的非负整数");
  return accountIndex;
}

/** Display form of the HD path with typographic primes. */
function displayPath(scheme: WalletScheme, index: string): string {
  return derivationPath(scheme, index || "0").replaceAll("'", "′");
}

export function AddWalletDialog({
  mode,
  wallets,
  onClose,
  onBack,
  onSave,
}: {
  mode: WalletAction;
  wallets: Wallet[];
  onClose: () => void;
  onBack?: () => void;
  onSave: (wallet: Wallet) => Promise<void>;
}) {
  const defaultName =
    mode === "watch" ? "观察钱包" : "钱包 " + (wallets.length + 1);
  const [name, setName] = useState("");
  const [phrase, setPhrase] = useState("");
  const [address, setAddress] = useState("");
  const [index, setIndex] = useState("0");
  const [step, setStep] = useState(0);
  const [questions, setQuestions] = useState<MnemonicQuestion[]>([]);
  const [answers, setAnswers] = useState<MnemonicAnswers>({});
  const [incorrect, setIncorrect] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(mode === "create");
  const [generationFailed, setGenerationFailed] = useState(false);
  const [generationAttempt, setGenerationAttempt] = useState(0);
  const [pasting, setPasting] = useState(false);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [wormhole, setWormhole] = useState(false);
  const [scheme, setScheme] = useState<WalletScheme>(DEFAULT_SCHEME);
  const [preview, setPreview] = useState<{ address: string } | null>(null);
  const [saved, setSaved] = useState<{ name: string; address: string } | null>(
    null,
  );
  const t = useT();
  const busyRef = useRef(false);
  const savedRef = useRef(false);
  const mounted = useRef(true);
  const pasteRequest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pasteRequest.current++;
    };
  }, []);

  useEffect(() => {
    if (mode !== "create") return;
    let alive = true;
    setGenerating(true);
    setGenerationFailed(false);
    setError("");
    generateMnemonic()
      .then((value) => {
        if (!alive) return;
        const quiz = createMnemonicQuiz(value);
        if (alive) {
          setPhrase(value);
          setQuestions(quiz);
        }
      })
      .catch(() => {
        if (alive) {
          setError("暂时无法生成助记词，请重试");
          setGenerationFailed(true);
        }
      })
      .finally(() => {
        if (alive) setGenerating(false);
      });
    return () => {
      alive = false;
    };
  }, [mode, generationAttempt]);

  function close() {
    if (busyRef.current) return;
    pasteRequest.current++;
    onClose();
  }

  function back() {
    if (busyRef.current) return;
    if (mode === "create" && step === 1 && !savedRef.current) {
      setStep(0);
      setError("");
      setIncorrect([]);
    } else if (mode === "import" && step === 1 && !savedRef.current) {
      setStep(0);
      setPreview(null);
      setError("");
    } else {
      pasteRequest.current++;
      (onBack || onClose)();
    }
  }

  async function paste() {
    if (busyRef.current || savedRef.current || pasting) return;
    const request = ++pasteRequest.current;
    setPasting(true);
    setError("");
    try {
      const value = await navigator.clipboard.readText();
      if (
        !mounted.current ||
        request !== pasteRequest.current ||
        busyRef.current ||
        savedRef.current
      )
        return;
      if (!value.trim()) {
        setError("剪贴板为空，请先复制助记词或地址");
        return;
      }
      if (value.length > (mode === "watch" ? 256 : 1000)) {
        setError(
          mode === "watch"
            ? "内容过长，请只粘贴钱包地址"
            : "内容过长，请只粘贴助记词",
        );
        return;
      }
      if (mode === "watch") setAddress(value);
      else setPhrase(value);
    } catch {
      if (mounted.current && request === pasteRequest.current)
        setError("无法读取剪贴板，请在输入框中手动粘贴");
    } finally {
      if (mounted.current && request === pasteRequest.current)
        setPasting(false);
    }
  }

  function backup() {
    setError("");
    try {
      downloadMnemonicBackup(phrase, name.trim() || defaultName, 0, scheme);
      setDownloaded(true);
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || savedRef.current || pasting) return;
    setError("");
    if (mode === "create" && step === 0) {
      if (generationFailed && !phrase) {
        setGenerating(true);
        setGenerationFailed(false);
        setGenerationAttempt((attempt) => attempt + 1);
        return;
      }
      if (phrase && questions.length === 3) setStep(1);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    if (mode === "import" && step === 0) {
      // Show the derived address first so it can be compared with the
      // official wallet before anything is stored.
      try {
        const accountIndex = parseAccountIndex(index);
        const normalized = normalizeMnemonic(phrase);
        if (!validateMnemonic(normalized))
          throw new Error("助记词无效，请检查单词和顺序");
        const derived = await deriveAccount(scheme, normalized, accountIndex);
        if (!mounted.current) return;
        setPreview({ address: derived.address });
        setStep(1);
      } catch (cause) {
        if (mounted.current) setError(errorText(cause));
      } finally {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
      return;
    }
    try {
      const accountIndex = parseAccountIndex(index);
      const normalized = normalizeMnemonic(phrase);
      if (mode !== "watch" && !validateMnemonic(normalized))
        throw new Error("助记词无效，请检查单词和顺序");
      if (mode === "create") {
        const result = checkMnemonicQuiz(normalized, questions, answers);
        setIncorrect(result.incorrect);
        if (!result.complete) throw new Error("请为每道题选择一个单词");
        if (!result.correct)
          throw new Error("还有单词没有选对，请重新选择，或返回查看助记词");
      }
      const target =
        mode === "watch"
          ? validateAddress(address.trim())
          : (await deriveAccount(scheme, normalized, accountIndex)).address;
      if (!mounted.current) return;
      if (mode === "import" && preview?.address !== target)
        throw new Error(t("地址已变化，请返回重新查看后再导入"));
      if (wallets.some((wallet) => wallet.address === target))
        throw new Error("这个地址已经在钱包列表中");
      const walletName = name.trim() || defaultName;
      await onSave({
        id: crypto.randomUUID(),
        name: walletName,
        address: target,
        kind: mode === "watch" ? "watch" : scheme,
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
      savedRef.current = true;
      if (!mounted.current) return;
      setSaved({ name: walletName, address: target });
      setPhrase("");
      setQuestions([]);
      setAnswers({});
      setIncorrect([]);
    } catch (cause) {
      if (mounted.current) setError(errorText(cause));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const normalizedPhrase = normalizeMnemonic(phrase);
  const words = normalizedPhrase ? normalizedPhrase.split(" ") : [];
  const answeredCount = questions.filter(
    (question) => !!answers[question.position],
  ).length;
  const allAnswered =
    questions.length === 3 &&
    questions.every((question) => !!answers[question.position]);
  const title = saved
    ? "完成"
    : mode === "create"
      ? "创建钱包"
      : mode === "import"
        ? "导入钱包"
        : "添加观察钱包";
  return (
    <Modal
      title={title}
      variant="flow"
      stepKey={step}
      busy={busy}
      onBack={saved ? undefined : back}
      onClose={close}
    >
      {saved ? (
        <div className="flow-form">
          <div className="flow-body flow-success" role="status">
            <div className="flow-success-mark">
              <Check size={36} strokeWidth={2} />
            </div>
            <div className="flow-heading">
              <h3>钱包已准备好</h3>
              <p>
                {mode === "watch"
                  ? wormhole
                    ? "现在可以查看这个地址的公开入账记录。"
                    : "现在可以查看这个地址的余额与交易。"
                  : "现在可以接收 QTC，管理你的资产。"}
              </p>
            </div>
            <div className="flow-account">
              <span className="wallet-avatar">
                <WalletIcon size={21} />
              </span>
              <span>
                <strong>{saved.name}</strong>
                <code title={saved.address}>{shortAddress(saved.address)}</code>
              </span>
            </div>
          </div>
          <div className="flow-footer">
            <button className="button primary full" onClick={onClose} autoFocus>
              进入钱包
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      ) : (
        <form
          className="flow-form"
          onSubmit={save}
          aria-busy={busy || generating || pasting}
        >
          <div className="flow-body">
            {mode === "create" ? (
              <>
                <div
                  className="step-progress"
                  aria-label={
                    step === 0
                      ? "第 1 步，共 2 步：备份助记词"
                      : "第 2 步，共 2 步：验证备份"
                  }
                >
                  <span className="active" />
                  <span className={step === 1 ? "active" : ""} />
                </div>
                <div className="flow-heading">
                  <h3>{step === 0 ? "备份你的助记词" : "确认你的备份"}</h3>
                  <p>
                    {step === 0
                      ? "这 24 个单词可以恢复钱包，请按顺序保存。"
                      : "根据刚才保存的助记词，选出对应位置的单词。"}
                  </p>
                </div>
                {step === 0 ? (
                  <>
                    <div className="mnemonic-grid" data-private="true">
                      {words.length ? (
                        words.map((word, position) => (
                          <div key={position}>
                            <span>{String(position + 1).padStart(2, "0")}</span>
                            {word}
                          </div>
                        ))
                      ) : (
                        <p className="muted">
                          {generating
                            ? "正在生成助记词…"
                            : "助记词暂未生成，请重试。"}
                        </p>
                      )}
                    </div>
                    <div className="mnemonic-actions">
                      <button
                        type="button"
                        className="button full"
                        disabled={!phrase || busy}
                        onClick={backup}
                      >
                        {downloaded ? (
                          <Check size={17} />
                        ) : (
                          <Download size={17} />
                        )}
                        {downloaded ? "再次下载助记词 TXT" : "下载助记词 TXT"}
                      </button>
                      <p>这是未加密的助记词文件，请离线保管，不要分享。</p>
                    </div>
                    <details className="flow-details">
                      <summary>{t("高级选项")}</summary>
                      <label className="field">
                        {t("签名方案")}
                        <select
                          aria-label={t("签名方案")}
                          value={scheme}
                          disabled={busy}
                          onChange={(event) => {
                            if (
                              event.target.value === "mldsa65" ||
                              event.target.value === "mldsa87"
                            )
                              setScheme(event.target.value);
                            setError("");
                          }}
                        >
                          <option value="mldsa65">
                            {t("ML-DSA-65（官方钱包默认）")}
                          </option>
                          <option value="mldsa87">ML-DSA-87</option>
                        </select>
                        <small>
                          {t("路径 {0}", displayPath(scheme, "0"))}
                        </small>
                      </label>
                    </details>
                  </>
                ) : (
                  <div className="word-questions" data-private="true">
                    <p className="hint" role="status">
                      已选择 {answeredCount} / 3 个单词
                    </p>
                    {questions.map((question) => (
                      <fieldset
                        className="word-question"
                        key={question.position}
                        data-invalid={
                          incorrect.includes(question.position) || undefined
                        }
                        aria-invalid={
                          incorrect.includes(question.position) || undefined
                        }
                      >
                        <legend>第 {question.position} 个单词</legend>
                        <div className="word-options">
                          {question.options.map((option) => (
                            <button
                              type="button"
                              key={option}
                              className={
                                "word-option" +
                                (answers[question.position] === option
                                  ? " selected"
                                  : "")
                              }
                              aria-pressed={
                                answers[question.position] === option
                              }
                              disabled={busy}
                              onClick={() => {
                                setAnswers((current) => ({
                                  ...current,
                                  [question.position]: option,
                                }));
                                setIncorrect((current) =>
                                  current.filter(
                                    (position) =>
                                      position !== question.position,
                                  ),
                                );
                                setError("");
                              }}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                )}
              </>
            ) : mode === "import" && step === 1 && preview ? (
              <>
                <div className="flow-heading">
                  <h3>{t("确认账户地址")}</h3>
                  <p>
                    {t("请与官方钱包收款页面显示的地址对比，一致后再导入。")}
                  </p>
                </div>
                <div className="account-detail-card">
                  <span className="label">{t("派生地址")}</span>
                  <p className="account-detail-address">{preview.address}</p>
                  <span className="label">{t("签名方案与派生路径")}</span>
                  <p className="account-detail-address">
                    {schemeLabel(scheme)} · {displayPath(scheme, index)}
                  </p>
                </div>
                <p className="hint">
                  {t("地址不一致时，请返回切换签名方案或账户序号。")}
                </p>
              </>
            ) : (
              <>
                <div className="flow-heading">
                  <h3>{mode === "import" ? "找回你的钱包" : "关注一个钱包"}</h3>
                  <p>
                    {mode === "import"
                      ? "输入助记词，恢复你的 Quantus 钱包。"
                      : "添加公开地址，随时查看余额与交易。"}
                  </p>
                </div>
                <label className="field">
                  <span className="field-label-row">
                    <span>{mode === "import" ? "助记词" : "钱包地址"}</span>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || pasting}
                      onClick={paste}
                    >
                      <ClipboardPaste size={15} />
                      {pasting ? "正在读取…" : "粘贴"}
                    </button>
                  </span>
                  <textarea
                    aria-label={mode === "import" ? "助记词" : "钱包地址"}
                    data-private={mode === "import" ? "true" : undefined}
                    rows={mode === "import" ? 5 : 3}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    maxLength={mode === "import" ? 1000 : 256}
                    disabled={busy}
                    value={mode === "import" ? phrase : address}
                    onChange={(event) => {
                      pasteRequest.current++;
                      setPasting(false);
                      setError("");
                      mode === "import"
                        ? setPhrase(event.target.value)
                        : setAddress(event.target.value);
                    }}
                    placeholder={
                      mode === "import"
                        ? "按顺序输入单词，以空格分隔"
                        : "粘贴完整的 Quantus 地址"
                    }
                    autoFocus
                  />
                  {mode === "import" && words.length > 0 && (
                    <small>已输入 {words.length} 个单词</small>
                  )}
                </label>
                {mode === "import" && (
                  <>
                    <label className="field">
                      {t("签名方案")}
                      <select
                        aria-label={t("签名方案")}
                        value={scheme}
                        disabled={busy}
                        onChange={(event) => {
                          if (
                            event.target.value === "mldsa65" ||
                            event.target.value === "mldsa87"
                          )
                            setScheme(event.target.value);
                          setError("");
                        }}
                      >
                        <option value="mldsa65">
                          {t("ML-DSA-65（官方钱包默认）")}
                        </option>
                        <option value="mldsa87">
                          {t("ML-DSA-87（早期版本）")}
                        </option>
                      </select>
                    </label>
                    <p className="hint">
                      {t(
                        "官方钱包与命令行工具当前默认使用 ML-DSA-65；Wormhole 隐私账户请使用官方钱包。",
                      )}
                    </p>
                  </>
                )}
                <label className="field">
                  钱包名称（可选）
                  <input
                    maxLength={60}
                    value={name}
                    disabled={busy}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError("");
                    }}
                    placeholder={defaultName}
                  />
                </label>
                {mode === "import" ? (
                  <details className="flow-details">
                    <summary>账户选项</summary>
                    <label className="field">
                      账户序号
                      <input
                        type="number"
                        min="0"
                        max="2147483647"
                        step="1"
                        value={index}
                        disabled={busy}
                        onChange={(event) => {
                          setIndex(event.target.value);
                          setError("");
                        }}
                      />
                      <small>
                        {t("通常为 0。路径 {0}", displayPath(scheme, index))}
                      </small>
                    </label>
                  </details>
                ) : (
                  <>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={wormhole}
                        disabled={busy}
                        onChange={(event) => {
                          setWormhole(event.target.checked);
                          setError("");
                        }}
                      />
                      这是 Wormhole 隐私地址
                    </label>
                    <div className="soft-note">
                      <Eye size={16} />
                      <p>
                        {wormhole
                          ? "Wormhole 地址仅展示公开入账；未花费余额与转出请在官方钱包查看。"
                          : "观察钱包可以查看资产与记录，转账需要持有对应密钥。"}
                      </p>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flow-footer">
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              disabled={
                busy ||
                pasting ||
                (mode === "create"
                  ? step === 0
                    ? generating || (!phrase && !generationFailed)
                    : !allAnswered
                  : mode === "import"
                    ? step === 0
                      ? !normalizedPhrase
                      : !preview
                    : !address.trim())
              }
            >
              {busy
                ? "正在准备钱包…"
                : mode === "create"
                  ? step === 0
                    ? generating
                      ? "正在生成助记词…"
                      : generationFailed
                        ? "重新生成助记词"
                        : "我已备份，继续"
                    : "验证并创建钱包"
                  : mode === "import"
                    ? step === 0
                      ? t("查看地址")
                      : t("确认导入")
                    : "添加钱包"}
              <ArrowRight size={17} />
            </button>
            {mode === "create" && step === 1 && (
              <button
                type="button"
                className="text-button full"
                disabled={busy}
                onClick={back}
              >
                返回查看助记词
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
