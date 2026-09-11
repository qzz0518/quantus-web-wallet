import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  ClipboardPaste,
  Coins,
  ExternalLink,
  Eye,
  KeyRound,
  LifeBuoy,
  MemoryStick,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { Modal } from "../Modal";
import { Select } from "../Select";
import { WormholeDeposit } from "./WormholeDeposit";
import type { Wallet } from "../../lib/vault";
import {
  DEFAULT_SCHEME,
  derivationPath,
  deriveAccount,
  normalizeMnemonic,
  schemeLabel,
  validateMnemonic,
  type WalletScheme,
} from "../../crypto";
import { MAINNET, validateAddress } from "../../lib/chain";
import { errorText, formatAmount, shortAddress } from "../../lib/amount";
import { localeTag, t, useT } from "../../lib/i18n";
import {
  WormholeScanError,
  scanWormhole,
  type WormholeScanSnapshot,
  type WormholeScannedDeposit,
} from "../../lib/wormhole/scan";
import {
  WORMHOLE_EXIT_MAX_INPUTS,
  listWormholeExitReceipts,
  readWormholeRules,
  summarizeWormholeExit,
  trackWormholeExit,
  withdrawWormhole,
} from "../../lib/wormhole/exit";
import type {
  WormholeExitPhase,
  WormholeExitProgress,
  WormholeExitReceipt,
  WormholeExitSummary,
  WormholeRules,
  WormholeScanProgress,
} from "../../lib/wormhole/types";

type Step = "intro" | "input" | "scanning" | "results" | "exit";
/** The two things one does with an encrypted account: pay into it, or take out of it. */
type Tab = "deposit" | "recover";
type ExitStage = "form" | "working" | "done";
type ScanFailure = { code: WormholeScanError["code"] | "other"; message: string };

const DERIVED = "derived";
const SCAN_STAGES: Record<WormholeScanProgress["stage"], () => string> = {
  network: () => t("正在核对节点与索引服务…"),
  addresses: () => t("正在派生地址…"),
  deposits: () => t("正在查询入账记录…"),
  nullifiers: () => t("正在核对花费状态…"),
};
const EXIT_STAGES: Record<WormholeExitProgress["stage"], () => string> = {
  rules: () => t("正在读取链上规则…"),
  merkle: () => t("正在构建默克尔路径…"),
  circuit: () => t("正在准备电路…"),
  prove: () => t("正在生成零知识证明…"),
  verify: () => t("正在本地验证证明…"),
  submit: () => t("正在提交交易…"),
  track: () => t("正在等待链上确认…"),
};
const PHASES: Record<WormholeExitPhase, { label: () => string; tone: "ok" | "warn" | "bad" | "" }> = {
  preparing: { label: () => t("准备中"), tone: "" },
  proving: { label: () => t("生成证明中"), tone: "" },
  submitting: { label: () => t("提交中"), tone: "" },
  submitted: { label: () => t("已提交"), tone: "" },
  included: { label: () => t("已打包"), tone: "ok" },
  finalized: { label: () => t("已最终确认"), tone: "ok" },
  failed: { label: () => t("失败"), tone: "bad" },
  unknown: { label: () => t("状态未知"), tone: "warn" },
  expired: { label: () => t("已过期"), tone: "warn" },
};

const qtc = (planck: string | bigint) => `${formatAmount(planck)} QTC`;

function depositDate(deposit: WormholeScannedDeposit): string {
  if (deposit.timestamp) {
    return new Date(deposit.timestamp).toLocaleDateString(localeTag(), {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return t("区块 #{0}", deposit.blockHeight.toLocaleString("en-US"));
}

function branchLabel(deposit: Pick<WormholeScannedDeposit, "branch" | "index">): string {
  return deposit.branch === 0 ? t("收款 {0}", deposit.index) : t("找零 {0}", deposit.index);
}

function parseIndex(value: string): number {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index > 2 ** 31 - 1) throw new Error(t("账户序号必须是有效的非负整数"));
  return index;
}

function PhaseBadge({ phase }: { phase: WormholeExitPhase }) {
  const entry = PHASES[phase] ?? PHASES.unknown;
  return <span className={`wormhole-badge ${entry.tone}`}>{entry.label()}</span>;
}

function ReceiptCard({ receipt, detailed = false }: { receipt: WormholeExitReceipt; detailed?: boolean }) {
  const t = useT();
  return (
    <div className="wormhole-receipt">
      <div className="wormhole-receipt-head">
        <strong>{qtc(receipt.netPlanck)}</strong>
        <PhaseBadge phase={receipt.phase} />
      </div>
      <small>
        {new Date(receipt.createdAt).toLocaleString(localeTag(), { dateStyle: "medium", timeStyle: "short" })}
        {" · "}
        {t("收款 {0}", shortAddress(receipt.exitAddress))}
      </small>
      {detailed && (
        <>
          <span className="label">{t("交易哈希")}</span>
          <p className="wormhole-hash">{receipt.hash}</p>
          {receipt.message && <p className="wormhole-receipt-message">{receipt.message}</p>}
          {receipt.deniedNullifiers?.length ? (
            <p className="wormhole-receipt-message">{t("链上已拒绝 {0} 条入账（已被花费）。", receipt.deniedNullifiers.length)}</p>
          ) : null}
        </>
      )}
      <a
        className="text-button"
        href={`${MAINNET.explorerUrl}/transactions/${encodeURIComponent(receipt.hash)}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        <ExternalLink size={14} />
        {t("在区块浏览器中查看")}
      </a>
    </div>
  );
}

export function WormholeRecoveryDialog({
  wallets,
  onClose,
  onBack,
  initialSnapshot,
  initialTab,
  onDeposit,
  onWatch,
}: {
  wallets: Wallet[];
  onClose: () => void;
  onBack?: () => void;
  /** Opens on the deposit tab (used by tests and by a host that links to it). */
  initialTab?: Tab;
  /** Opens the send flow with the derived address filled in. */
  onDeposit?: (address: string, index: number) => void;
  /** Saves the derived address as a watch-only record. */
  onWatch?: (address: string, index: number) => Promise<void>;
  /** Opens directly on the results step for a completed scan (used by tests). */
  initialSnapshot?: WormholeScanSnapshot;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>(initialTab ?? "recover");
  const [step, setStep] = useState<Step>(initialSnapshot ? "results" : "intro");
  const [phrase, setPhrase] = useState("");
  const [expectedAddress, setExpectedAddress] = useState("");
  const [consent, setConsent] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [error, setError] = useState("");
  const [receipts, setReceipts] = useState<WormholeExitReceipt[]>(() => listWormholeExitReceipts());
  const [progress, setProgress] = useState<WormholeScanProgress>({ stage: "network" });
  const [snapshot, setSnapshot] = useState<WormholeScanSnapshot | null>(initialSnapshot ?? null);
  const [scanFailure, setScanFailure] = useState<ScanFailure | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [exitStage, setExitStage] = useState<ExitStage>("form");
  const [destination, setDestination] = useState("");
  const [scheme, setScheme] = useState<WalletScheme>(DEFAULT_SCHEME);
  const [accountIndex, setAccountIndex] = useState("0");
  const [derived, setDerived] = useState<{ address: string } | { error: string } | null>(null);
  const [rules, setRules] = useState<WormholeRules | null>(null);
  const [rulesError, setRulesError] = useState("");
  const [exitConsent, setExitConsent] = useState(false);
  const [exitProgress, setExitProgress] = useState<WormholeExitProgress>({ stage: "rules" });
  const [receipt, setReceipt] = useState<WormholeExitReceipt | null>(null);
  const scanAbort = useRef<AbortController | null>(null);
  const exitAbort = useRef<AbortController | null>(null);
  const trackAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const pasteRequest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pasteRequest.current++;
      scanAbort.current?.abort();
      exitAbort.current?.abort();
      trackAbort.current?.abort();
    };
  }, []);

  const normalizedPhrase = normalizeMnemonic(phrase);
  const words = normalizedPhrase ? normalizedPhrase.split(" ") : [];
  const unspent = useMemo(() => snapshot?.deposits.filter((deposit) => !deposit.spent) ?? [], [snapshot]);
  const spentCount = (snapshot?.deposits.length ?? 0) - unspent.length;
  const selectedDeposits = useMemo(
    () => unspent.filter((deposit) => selected.includes(deposit.id)),
    [unspent, selected],
  );
  const signingWallets = wallets.filter((wallet) => wallet.kind !== "watch");
  const exitAddress =
    destination === DERIVED
      ? derived && "address" in derived
        ? derived.address
        : ""
      : (signingWallets.find((wallet) => wallet.id === destination)?.address ?? "");
  const summary = useMemo<{ value?: WormholeExitSummary; error?: string }>(() => {
    if (!rules || !selectedDeposits.length) return {};
    try {
      return { value: summarizeWormholeExit(selectedDeposits, rules) };
    } catch (cause) {
      return { error: errorText(cause) };
    }
  }, [rules, selectedDeposits]);
  const busy = step === "exit" && exitStage === "working";

  // The exit account derived from the same phrase, shown before anything is sent.
  useEffect(() => {
    if (step !== "exit" || destination !== DERIVED) return;
    let alive = true;
    setDerived(null);
    let index: number;
    try {
      index = parseIndex(accountIndex);
    } catch (cause) {
      setDerived({ error: errorText(cause) });
      return;
    }
    deriveAccount(scheme, normalizedPhrase, index)
      .then((account) => alive && setDerived({ address: account.address }))
      .catch((cause) => alive && setDerived({ error: errorText(cause) }));
    return () => {
      alive = false;
    };
  }, [step, destination, scheme, accountIndex, normalizedPhrase]);

  // Chain rules are read when the withdrawal step opens; a failure disables the step.
  useEffect(() => {
    if (step !== "exit" || exitStage !== "form") return;
    let alive = true;
    setRules(null);
    setRulesError("");
    readWormholeRules()
      .then((value) => alive && setRules(value))
      .catch((cause) => alive && setRulesError(errorText(cause)));
    return () => {
      alive = false;
    };
  }, [step, exitStage]);

  // Keep the receipt's phase current while the dialog shows it.
  useEffect(() => {
    if (step !== "exit" || exitStage !== "done" || !receipt) return;
    if (["finalized", "failed", "expired"].includes(receipt.phase)) return;
    const controller = new AbortController();
    trackAbort.current = controller;
    trackWormholeExit(receipt, (update) => mounted.current && setReceipt(update), controller.signal)
      .then((final) => mounted.current && setReceipt(final))
      .catch(() => {});
    return () => controller.abort();
    // Tracking follows one receipt by hash; updates arrive through the callback.
  }, [step, exitStage, receipt?.hash]);

  function close() {
    if (busy) return;
    pasteRequest.current++;
    scanAbort.current?.abort();
    setPhrase("");
    onClose();
  }

  function cancelScan() {
    scanAbort.current?.abort();
    scanAbort.current = null;
    setStep("input");
  }

  function back() {
    if (busy) return;
    setError("");
    if (step === "input") setStep("intro");
    else if (step === "scanning") cancelScan();
    else if (step === "results") setStep("input");
    else if (step === "exit" && exitStage === "form") setStep("results");
    else if (step === "exit") {
      trackAbort.current?.abort();
      setReceipts(listWormholeExitReceipts());
      setExitStage("form");
      setReceipt(null);
      setStep("intro");
    } else (onBack || onClose)();
  }

  async function paste() {
    if (pasting) return;
    const request = ++pasteRequest.current;
    setPasting(true);
    setError("");
    try {
      const value = await navigator.clipboard.readText();
      if (!mounted.current || request !== pasteRequest.current) return;
      if (!value.trim()) setError(t("剪贴板为空，请先复制助记词或地址"));
      else if (value.length > 1000) setError(t("内容过长，请只粘贴助记词"));
      else setPhrase(value);
    } catch {
      if (mounted.current && request === pasteRequest.current) setError(t("无法读取剪贴板，请在输入框中手动粘贴"));
    } finally {
      if (mounted.current && request === pasteRequest.current) setPasting(false);
    }
  }

  async function startScan(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    if (!validateMnemonic(normalizedPhrase)) {
      setError(t("助记词无效，请检查单词、顺序和数量"));
      return;
    }
    let expected: string | undefined;
    if (expectedAddress.trim()) {
      try {
        expected = validateAddress(expectedAddress);
      } catch (cause) {
        setError(errorText(cause));
        return;
      }
    }
    if (!consent) {
      setError(t("请先确认了解扫描会进行的网络查询"));
      return;
    }
    scanAbort.current?.abort();
    const controller = new AbortController();
    scanAbort.current = controller;
    setSnapshot(null);
    setScanFailure(null);
    setSelected([]);
    setProgress({ stage: "network" });
    setStep("scanning");
    try {
      const result = await scanWormhole({
        mnemonic: normalizedPhrase,
        expectedAddress: expected,
        signal: controller.signal,
        onProgress: (update) => {
          if (mounted.current && scanAbort.current === controller) setProgress(update);
        },
      });
      if (!mounted.current || scanAbort.current !== controller) return;
      setSnapshot(result);
      setStep("results");
    } catch (cause) {
      if (!mounted.current || scanAbort.current !== controller) return;
      if (cause instanceof WormholeScanError && cause.code === "aborted") {
        setStep("input");
        return;
      }
      setScanFailure({
        code: cause instanceof WormholeScanError ? cause.code : "other",
        message: errorText(cause),
      });
      setStep("results");
    } finally {
      if (scanAbort.current === controller) scanAbort.current = null;
    }
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      if (!checked) return current.filter((value) => value !== id);
      if (current.includes(id) || current.length >= WORMHOLE_EXIT_MAX_INPUTS) return current;
      return [...current, id];
    });
  }

  function openExit() {
    setError("");
    setExitConsent(false);
    setExitStage("form");
    setReceipt(null);
    if (!destination) setDestination(signingWallets[0]?.id ?? DERIVED);
    setStep("exit");
  }

  async function withdraw(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!exitAddress || !summary.value || !exitConsent || busy) return;
    const controller = new AbortController();
    exitAbort.current = controller;
    setExitProgress({ stage: "rules" });
    setExitStage("working");
    try {
      const result = await withdrawWormhole({
        mnemonic: normalizedPhrase,
        deposits: selectedDeposits,
        exitAddress,
        signal: controller.signal,
        onProgress: (update) => mounted.current && setExitProgress(update),
      });
      if (!mounted.current) return;
      setReceipt(result);
      setReceipts(listWormholeExitReceipts());
      setExitStage("done");
    } catch (cause) {
      if (!mounted.current) return;
      setError(errorText(cause));
      setExitStage("form");
    } finally {
      if (exitAbort.current === controller) exitAbort.current = null;
    }
  }

  const stepKey = step === "exit" ? `exit-${exitStage}` : step;
  const scanStage = progress.stage;
  const canCancelExit = ["rules", "merkle", "circuit", "prove", "verify"].includes(exitProgress.stage);

  const tabs = (
    <div className="segmented wormhole-tabs" role="tablist" aria-label={t("加密账户（Wormhole）")}>
      {[
        { value: "deposit" as const, label: t("存入") },
        { value: "recover" as const, label: t("扫描与取回") },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-checked={tab === option.value}
          aria-selected={tab === option.value}
          onClick={() => {
            setError("");
            setTab(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <Modal
      title={tab === "deposit" ? t("存入隐私账户") : t("加密账户恢复")}
      variant="flow"
      wide
      stepKey={tab === "deposit" ? "deposit" : stepKey}
      busy={busy}
      onBack={back}
      onClose={close}
    >
      {tab === "deposit" ? (
        <>
          <div className="flow-body wormhole-tabs-row">{tabs}</div>
          <WormholeDeposit wallets={wallets} onDeposit={onDeposit} onWatch={onWatch} />
        </>
      ) : (
        <>
      {step === "intro" && (
        <div className="flow-form">
          <div className="flow-body">
            <div className="wormhole-tabs-row">{tabs}</div>
            <div className="flow-heading">
              <span className="flow-symbol">
                <LifeBuoy size={29} />
              </span>
              <h3>{t("找回转入加密账户的资产")}</h3>
              <p>
                {t(
                  "加密账户（Wormhole）是官方钱包中的隐私账户。它的地址看起来和普通地址一样，但转入的每一笔资产都会进入隐私池：只有持有该账户助记词的人才能证明这笔资产尚未花费并取出，因此普通钱包和区块浏览器只会显示“未知”。",
                )}
              </p>
            </div>
            <ul className="wormhole-points">
              <li>
                <ScanSearch size={18} />
                <div>
                  <strong>{t("这个工具做什么")}</strong>
                  {t("用官方钱包的助记词只读扫描加密账户，显示真实的未花费余额；如需要，可把资产取回到你自己的普通账户。")}
                </div>
              </li>
              <li>
                <KeyRound size={18} />
                <div>
                  <strong>{t("你需要准备")}</strong>
                  {t("收到资产的那个官方钱包的助记词（24 个单词）。可选：官方钱包里显示的加密账户地址，用于核对是否匹配。")}
                </div>
              </li>
              <li>
                <Coins size={18} />
                <div>
                  <strong>{t("费用")}</strong>
                  {t(
                    "链上按取回金额收取 0.04% 的成交量费用；金额先向下取整到 0.01 QTC，每笔入账不足 0.01 QTC 的零头会丢失。费用一半销毁、一半归出块矿工，没有返还。",
                  )}
                </div>
              </li>
              <li>
                <MemoryStick size={18} />
                <div>
                  <strong>{t("设备要求")}</strong>
                  {t("生成零知识证明需要约 1.5 GB 内存和一分钟左右，建议在桌面浏览器中操作；只查看余额不需要。")}
                </div>
              </li>
              <li>
                <Eye size={18} />
                <div>
                  <strong>{t("隐私")}</strong>
                  {t("助记词只在本页面和本地签名组件中使用，不会存储或上传。官方索引服务与节点会看到派生出的地址和你的 IP 地址。")}
                </div>
              </li>
            </ul>
            <details className="flow-details">
              <summary>{t("详细教程")}</summary>
              <ol className="wormhole-steps">
                <li>
                  <strong>{t("准备助记词。")}</strong>
                  {t("在官方钱包中导出或抄写收款账户的助记词。本工具不会保存它。")}
                </li>
                <li>
                  <strong>{t("开始扫描。")}</strong>
                  {t("点击“开始扫描”，输入助记词与可选的加密账户地址，勾选同意后扫描。你会看到派生地址与入账记录的进度。")}
                </li>
                <li>
                  <strong>{t("查看结果。")}</strong>
                  {t("结果页显示未花费余额、已花费入账和快照区块；每条未花费入账可勾选，一次最多 {0} 条。", WORMHOLE_EXIT_MAX_INPUTS)}
                </li>
                <li>
                  <strong>{t("选择收款账户。")}</strong>
                  {t("选择本钱包中的普通账户，或从同一助记词派生的普通账户；页面会显示地址和费用预览。")}
                </li>
                <li>
                  <strong>{t("生成证明并提交。")}</strong>
                  {t("证明在浏览器本地生成，可能需要几分钟，期间请保持页面打开。提交后会显示交易哈希与确认状态。")}
                </li>
              </ol>
            </details>
            {receipts.length > 0 && (
              <>
                <h4 className="wormhole-list-title">{t("此前的取回记录")}</h4>
                <div className="wormhole-receipts">
                  {receipts.map((item) => (
                    <ReceiptCard key={item.hash} receipt={item} />
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flow-footer">
            <button className="button primary full" onClick={() => { setError(""); setStep("input"); }} autoFocus>
              {t("开始扫描")}
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}

      {step === "input" && (
        <form className="flow-form" onSubmit={startScan} aria-busy={pasting}>
          <div className="flow-body">
            <div className="flow-heading">
              <h3>{t("输入官方钱包的助记词")}</h3>
              <p>{t("助记词只用于在本地派生地址和计算花费凭证，扫描结束后不会保留。")}</p>
            </div>
            <label className="field">
              <span className="field-label-row">
                <span>{t("助记词")}</span>
                <button type="button" className="text-button" disabled={pasting} onClick={paste}>
                  <ClipboardPaste size={15} />
                  {pasting ? t("正在读取…") : t("粘贴")}
                </button>
              </span>
              <textarea
                aria-label={t("助记词")}
                data-private="true"
                rows={5}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={1000}
                value={phrase}
                onChange={(event) => {
                  pasteRequest.current++;
                  setPasting(false);
                  setError("");
                  setPhrase(event.target.value);
                }}
                placeholder={t("按顺序输入单词，以空格分隔")}
                autoFocus
              />
              {words.length > 0 && <small>{t("已输入 {0} 个单词", words.length)}</small>}
            </label>
            <label className="field">
              {t("官方钱包显示的加密账户地址（可选）")}
              <input
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={128}
                value={expectedAddress}
                onChange={(event) => {
                  setError("");
                  setExpectedAddress(event.target.value);
                }}
                placeholder={t("用于核对派生地址是否匹配")}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => {
                  setError("");
                  setConsent(event.target.checked);
                }}
              />
              {t("我了解扫描会向官方节点与索引服务查询派生出的地址，对方能看到这些地址和我的 IP 地址。")}
            </label>
            <div className="soft-note">
              <ShieldCheck size={16} />
              <p>{t("扫描只读取数据，不会签名或发送任何交易。关闭本窗口或锁定钱包后，助记词会从页面中清除。")}</p>
            </div>
          </div>
          <div className="flow-footer">
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={pasting || words.length < 12 || !consent}>
              {t("开始扫描")}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
      )}

      {step === "scanning" && (
        <div className="flow-form">
          <div className="flow-body">
            <div className="flow-heading">
              <h3>{t("正在扫描加密账户")}</h3>
              <p>{t("按派生顺序检查地址，连续 20 个未使用的地址后停止；入账较多时需要更长时间。")}</p>
            </div>
            <div className="wormhole-progress" role="status" aria-live="polite">
              <div className="wormhole-progress-bar indeterminate">
                <span />
              </div>
              <dl>
                <dt>{t("阶段")}</dt>
                <dd>{SCAN_STAGES[scanStage]()}</dd>
                {progress.branch !== undefined && (
                  <>
                    <dt>{t("分支")}</dt>
                    <dd>{progress.branch === 0 ? t("收款地址") : t("找零地址")}</dd>
                  </>
                )}
                {scanStage !== "nullifiers" && (
                  <>
                    <dt>{t("已扫描地址")}</dt>
                    <dd>{progress.scanned ?? 0}</dd>
                  </>
                )}
                <dt>{t("已找到入账")}</dt>
                <dd>{progress.deposits ?? 0}</dd>
                {scanStage === "nullifiers" && progress.scanned !== undefined && (
                  <>
                    <dt>{t("已核对入账")}</dt>
                    <dd>{progress.scanned}</dd>
                  </>
                )}
              </dl>
            </div>
          </div>
          <div className="flow-footer">
            <button className="button full" onClick={cancelScan}>
              {t("取消扫描")}
            </button>
          </div>
        </div>
      )}

      {step === "results" && (
        <div className="flow-form">
          <div className="flow-body">
            {scanFailure ? (
              <>
                <div className="flow-heading">
                  <h3>{scanFailure.code === "incomplete" ? t("扫描不完整") : t("扫描未完成")}</h3>
                  <p>
                    {scanFailure.code === "incomplete"
                      ? t("这个账户的地址或入账数量超出了本工具的扫描上限，为避免显示偏小的余额，已停止扫描。")
                      : scanFailure.code === "mismatch"
                        ? t("官方节点与索引服务的数据不一致，稍后重试通常可以解决。")
                        : t("扫描过程中出现问题，请检查网络后重试。")}
                  </p>
                </div>
                <div className="callout warm" role="alert">
                  <CircleAlert size={17} />
                  <div>
                    <p>{scanFailure.message}</p>
                  </div>
                </div>
              </>
            ) : snapshot ? (
              <>
                <div className="flow-heading">
                  <h3>{t("扫描结果")}</h3>
                  <p>{t("以下为最终确认区块 #{0} 时的状态；之后的新入账不会包含在内。", snapshot.blockHeight.toLocaleString("en-US"))}</p>
                </div>
                {snapshot.expectedAddressFound !== undefined && (
                  <p className="wormhole-match">
                    {snapshot.expectedAddressFound ? (
                      <span className="wormhole-badge ok">
                        <Check size={13} />
                        {t("地址已匹配")}
                      </span>
                    ) : (
                      <span className="wormhole-badge warn">
                        <CircleAlert size={13} />
                        {t("未在派生地址中找到")}
                      </span>
                    )}
                    {!snapshot.expectedAddressFound && (
                      <small>{t("请确认助记词属于显示该地址的官方钱包；地址可能来自另一组助记词。")}</small>
                    )}
                  </p>
                )}
                <div className="flow-summary">
                  <span>{t("可取回余额")}</span>
                  <strong>{qtc(snapshot.unspentPlanck)}</strong>
                  <span>{t("已花费入账")}</span>
                  <strong>{t("{0} 条 · {1}", spentCount, qtc(snapshot.spentPlanck))}</strong>
                  <span>{t("已检查地址")}</span>
                  <strong>{snapshot.branches[0].scanned + snapshot.branches[1].scanned}</strong>
                  <span>{t("快照区块")}</span>
                  <strong>#{snapshot.blockHeight.toLocaleString("en-US")}</strong>
                </div>
                {unspent.length === 0 ? (
                  <div className="wormhole-empty" role="status">
                    <ScanSearch size={26} />
                    <p>
                      <strong>{t("没有找到可取回的入账")}</strong>
                    </p>
                    <p>
                      {snapshot.deposits.length
                        ? t("这个账户的入账都已经被花费。")
                        : t("这组助记词派生出的地址还没有收到过任何转账。如果官方钱包显示有资产，请核对助记词是否属于那个钱包。")}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="wormhole-selection">
                      <span>{t("已选择 {0} / {1} 条", selectedDeposits.length, Math.min(WORMHOLE_EXIT_MAX_INPUTS, unspent.length))}</span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          setSelected(
                            selectedDeposits.length ? [] : unspent.slice(0, WORMHOLE_EXIT_MAX_INPUTS).map((deposit) => deposit.id),
                          )
                        }
                      >
                        {selectedDeposits.length ? t("清除选择") : t("选择前 {0} 条", Math.min(WORMHOLE_EXIT_MAX_INPUTS, unspent.length))}
                      </button>
                    </div>
                    <ul className="wormhole-list">
                      {unspent.map((deposit) => {
                        const checked = selected.includes(deposit.id);
                        return (
                          <li key={deposit.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!checked && selected.length >= WORMHOLE_EXIT_MAX_INPUTS}
                                onChange={(event) => toggle(deposit.id, event.target.checked)}
                              />
                              <span className="main">
                                <strong>{qtc(deposit.amountPlanck)}</strong>
                                <small>
                                  {depositDate(deposit)} · {shortAddress(deposit.address, 5)} · {branchLabel(deposit)}
                                </small>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="hint">{t("一次取回最多 {0} 条入账；更多入账请分多次取回。", WORMHOLE_EXIT_MAX_INPUTS)}</p>
                  </>
                )}
              </>
            ) : null}
          </div>
          <div className="flow-footer">
            {snapshot && unspent.length > 0 && !scanFailure ? (
              <>
                <button className="button primary full" disabled={!selectedDeposits.length} onClick={openExit}>
                  {t("取回所选入账")}
                  <ArrowRight size={17} />
                </button>
                <button type="button" className="text-button full" onClick={() => void startScan()}>
                  <RotateCcw size={14} />
                  {t("重新扫描")}
                </button>
              </>
            ) : (
              <>
                <button className="button primary full" onClick={() => void startScan()}>
                  <RotateCcw size={16} />
                  {t("重新扫描")}
                </button>
                <button type="button" className="text-button full" onClick={() => setStep("input")}>
                  {t("返回修改助记词")}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {step === "exit" && exitStage === "form" && (
        <form className="flow-form" onSubmit={withdraw}>
          <div className="flow-body">
            <div className="flow-heading">
              <h3>{t("取回到普通账户")}</h3>
              <p>{t("资产会转入下面选择的账户；取回不可撤销，请确认账户由你本人控制。")}</p>
            </div>
            <label className="field">
              {t("收款账户")}
              <Select
                aria-label={t("收款账户")}
                value={destination}
                placeholder={t("选择收款账户")}
                onChange={(next) => {
                  setError("");
                  setDestination(next);
                }}
                options={[
                  ...signingWallets.map((wallet) => ({
                    value: wallet.id,
                    label: wallet.name,
                    description: shortAddress(wallet.address, 8),
                  })),
                  {
                    value: DERIVED,
                    label: t("从同一助记词派生的普通账户"),
                    description: t("官方钱包中与加密账户配对的普通账户"),
                  },
                ]}
              />
            </label>
            {destination === DERIVED && (
              <>
                <label className="field">
                  {t("签名方案")}
                  <Select
                    aria-label={t("签名方案")}
                    value={scheme}
                    onChange={(next) => {
                      setError("");
                      setScheme(next);
                    }}
                    options={[
                      { value: "mldsa65", label: t("ML-DSA-65（官方钱包默认）") },
                      { value: "mldsa87", label: t("ML-DSA-87（早期版本）") },
                    ]}
                  />
                </label>
                <label className="field">
                  {t("账户序号")}
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    value={accountIndex}
                    onChange={(event) => {
                      setError("");
                      setAccountIndex(event.target.value);
                    }}
                  />
                  <small>{t("通常为 0。路径 {0}", derivationPath(scheme, accountIndex || "0").replaceAll("'", "′"))}</small>
                </label>
                <div className="account-detail-card">
                  <span className="label">{t("派生地址")}</span>
                  <p className="account-detail-address">
                    {derived === null
                      ? t("正在派生…")
                      : "address" in derived
                        ? derived.address
                        : derived.error}
                  </p>
                  {derived && "address" in derived && (
                    <p className="hint">{t("请与官方钱包中该普通账户（{0}）的地址核对。", schemeLabel(scheme))}</p>
                  )}
                </div>
              </>
            )}
            {rulesError ? (
              <div className="callout warm" role="alert">
                <CircleAlert size={17} />
                <div>
                  <p>
                    <strong>{t("取回功能暂不可用")}</strong>
                  </p>
                  <p>{rulesError}</p>
                  <p>{t("扫描结果仍然有效，你可以稍后再试。")}</p>
                </div>
              </div>
            ) : summary.error ? (
              <div className="callout warm" role="alert">
                <CircleAlert size={17} />
                <div>
                  <p>{summary.error}</p>
                </div>
              </div>
            ) : (
              <div className="flow-summary">
                <span>{t("选中入账")}</span>
                <strong>{t("{0} 条", selectedDeposits.length)}</strong>
                <span>{t("输入金额")}</span>
                <strong>{summary.value ? qtc(summary.value.inputPlanck) : "…"}</strong>
                <span>{t("取整后金额")}</span>
                <strong>{summary.value ? qtc(summary.value.quantizedPlanck) : "…"}</strong>
                <span>{t("舍去零头")}</span>
                <strong>{summary.value ? qtc(summary.value.dustPlanck) : "…"}</strong>
                <span>{rules ? t("链上费用（{0}%）", (rules.volumeFeeBps / 100).toString()) : t("链上费用")}</span>
                <strong>{summary.value ? qtc(summary.value.feePlanck) : "…"}</strong>
                <span>{t("实际到账")}</span>
                <strong>{summary.value ? qtc(summary.value.netPlanck) : "…"}</strong>
              </div>
            )}
            <div className="callout">
              <MemoryStick size={17} />
              <div>
                <p>{t("生成证明需要约 1.5 GB 内存，通常一分钟左右，建议使用桌面浏览器并保持页面打开。手机浏览器可能因内存不足而失败。")}</p>
              </div>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={exitConsent}
                disabled={!!rulesError}
                onChange={(event) => {
                  setError("");
                  setExitConsent(event.target.checked);
                }}
              />
              {t("我确认收款账户由我本人控制，并了解费用、舍去的零头以及取回不可撤销。")}
            </label>
          </div>
          <div className="flow-footer">
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              disabled={!exitAddress || !summary.value || !exitConsent || !!rulesError}
            >
              {t("生成证明并提交")}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
      )}

      {step === "exit" && exitStage === "working" && (
        <div className="flow-form">
          <div className="flow-body">
            <div className="flow-heading">
              <h3>{t("正在生成证明")}</h3>
              <p>{t("请保持页面打开。证明只在本地生成，验证通过后才会提交到网络。")}</p>
            </div>
            <div className="wormhole-progress" role="status" aria-live="polite">
              <div className={`wormhole-progress-bar${exitProgress.percent === undefined ? " indeterminate" : ""}`}>
                <span style={exitProgress.percent === undefined ? undefined : { transform: `scaleX(${Math.min(100, Math.max(0, exitProgress.percent)) / 100})` }} />
              </div>
              <dl>
                <dt>{t("阶段")}</dt>
                <dd>{EXIT_STAGES[exitProgress.stage]()}</dd>
                {exitProgress.percent !== undefined && (
                  <>
                    <dt>{t("进度")}</dt>
                    <dd>{Math.round(exitProgress.percent)}%</dd>
                  </>
                )}
              </dl>
              {exitProgress.message && <p className="hint">{exitProgress.message}</p>}
            </div>
          </div>
          <div className="flow-footer">
            {canCancelExit ? (
              <button className="button full" onClick={() => exitAbort.current?.abort()}>
                {t("取消")}
              </button>
            ) : (
              <p className="flow-note">{t("交易正在提交，请勿关闭页面。")}</p>
            )}
          </div>
        </div>
      )}

      {step === "exit" && exitStage === "done" && receipt && (
        <div className="flow-form">
          <div className="flow-body">
            <div className="flow-heading">
              <span className="flow-symbol">
                <Check size={29} />
              </span>
              <h3>{t("取回已提交")}</h3>
              <p>{t("状态会自动更新；也可以稍后在“加密账户恢复”首页的取回记录中查看。")}</p>
            </div>
            <ReceiptCard receipt={receipt} detailed />
          </div>
          <div className="flow-footer">
            <button className="button primary full" onClick={close}>
              {t("完成")}
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </Modal>
  );
}
