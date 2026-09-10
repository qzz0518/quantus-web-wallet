import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type CSSProperties,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Copy,
  Wallet as WalletIcon,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { SwapIcon } from "./SwapIcon";
import { Modal } from "./Modal";
import { FlowStatus } from "./FlowStatus";
import type { Wallet, Pending } from "../lib/vault";
import {
  parseAmount,
  formatAmount,
  errorText,
  shortAddress,
} from "../lib/amount";
import {
  prepareTransfer,
  estimateFee,
  readBalance,
  submitTransfer,
  validateAddress,
  SubmissionError,
} from "../lib/chain";
import { blake2AsHex } from "@polkadot/util-crypto";
import { hexToU8a } from "@polkadot/util";
import { signCall } from "../crypto";
import { copyText } from "../lib/browser";
import { useT } from "../lib/i18n";
import { readRecipientProfile, type RecipientProfile } from "../lib/recipient";
import { Select } from "./Select";
const mainnetServices = {
  prepareTransfer,
  estimateFee,
  readBalance,
  submitTransfer,
  networkName: "Quantus Mainnet",
  symbol: "QTC",
};
export type TransferServices = typeof mainnetServices;
type Quote = {
  hex: string;
  recipient: string;
  amount: string;
  fee: string;
  block: number;
  nonce: number;
  at: number;
};
export function SendDialog({
  wallet,
  wallets,
  onClose,
  onSubmitted,
  services = mainnetServices,
}: {
  wallet: Wallet;
  wallets: Wallet[];
  onClose: () => void;
  /** Persist the deterministic transaction hash BEFORE network submission. */
  onSubmitted: (tx: Pending) => Promise<void>;
  services?: TransferServices;
}) {
  const t = useT();
  const active = useRef(true);
  const processing = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [recipient, setRecipient] = useState(""),
    [amount, setAmount] = useState(""),
    [step, setStep] = useState<"recipient" | "amount">("recipient"),
    [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ack, setAck] = useState(false),
    [hash, setHash] = useState(""),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(""),
    [expired, setExpired] = useState(false),
    [profile, setProfile] = useState<{ address: string; data: RecipientProfile | null } | null>(null),
    [checking, setChecking] = useState(false),
    [riskAck, setRiskAck] = useState(false);
  useEffect(() => {
    if (!quote) return;
    const id = setInterval(() => {
      if (Date.now() - quote.at > 60_000) setExpired(true);
    }, 1000);
    return () => clearInterval(id);
  }, [quote]);
  async function review(e?: FormEvent) {
    e?.preventDefault();
    if (processing.current) return;
    processing.current = true;
    setBusy(true);
    setError("");
    try {
      if (!wallet.mnemonic || wallet.kind === "watch")
        throw new Error(t("观察钱包不能签名"));
      const to = validateAddress(recipient.trim()),
        atomic = parseAmount(amount).toString();
      if (to === wallet.address) throw new Error(t("收款地址与当前钱包相同"));
      const prepared = await services.prepareTransfer(
        wallet.address,
        to,
        atomic,
      );
      const hex = await signCall(
        wallet.kind,
        wallet.mnemonic,
        wallet.index,
        prepared.callHex,
        prepared.ctx,
      );
      const fee = await services.estimateFee(hex),
        balance = await services.readBalance(wallet.address);
      if (BigInt(balance.spendable) < BigInt(atomic) + BigInt(fee))
        throw new Error(t("可用余额不足以支付金额和手续费"));
      if (
        BigInt(balance.free) - BigInt(atomic) - BigInt(fee) <
        BigInt(prepared.existentialDeposit)
      )
        throw new Error(
          t(
            "转账后需保留至少 {0} {1} 以维持账户",
            formatAmount(prepared.existentialDeposit),
            services.symbol,
          ),
        );
      if (!active.current) return;
      setQuote({
        hex,
        recipient: to,
        amount: atomic,
        fee,
        block: prepared.ctx.blockNumber,
        nonce: prepared.ctx.nonce,
        at: Date.now(),
      });
      setExpired(false);
      setAck(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      processing.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (!quote || processing.current || !ack) return;
    processing.current = true;
    setBusy(true);
    setError("");
    let journal: Pending | undefined;
    try {
      if (Date.now() - quote.at > 60_000) {
        setExpired(true);
        throw new Error(t("费用报价已过期，请更新费用后重新确认"));
      }
      const prepared = await services.prepareTransfer(
        wallet.address,
        quote.recipient,
        quote.amount,
      );
      if (
        prepared.ctx.nonce !== quote.nonce ||
        prepared.ctx.blockNumber - quote.block >= 48
      ) {
        setExpired(true);
        throw new Error(t("账户或网络状态已变化，请更新费用后重新确认"));
      }
      const balance = await services.readBalance(wallet.address),
        freshFee = await services.estimateFee(quote.hex);
      if (
        BigInt(freshFee) > BigInt(quote.fee) ||
        BigInt(balance.spendable) < BigInt(quote.amount) + BigInt(freshFee) ||
        BigInt(balance.free) - BigInt(quote.amount) - BigInt(freshFee) <
          BigInt(prepared.existentialDeposit)
      ) {
        setExpired(true);
        throw new Error(t("余额或手续费已变化，请更新费用后重新确认"));
      }
      if (!active.current) return;
      journal = {
        hash: blake2AsHex(hexToU8a(quote.hex)),
        address: wallet.address,
        to: quote.recipient,
        amount: quote.amount,
        fee: freshFee,
        startBlock: quote.block,
        createdAt: Date.now(),
        status: "pending",
      };
      // A reload or connection loss after broadcasting must not lose the hash.
      await onSubmitted(journal);
      if (!active.current) return;
      const result = await services.submitTransfer(quote.hex);
      setHash(result);
    } catch (e) {
      if (e instanceof SubmissionError && e.submissionStatus === "unknown") {
        setHash(e.transactionHash);
        setError(t("提交结果待确认，请保留哈希并核对链上状态，勿重复发送。"));
        try {
          await onSubmitted({
            hash: e.transactionHash,
            address: wallet.address,
            to: quote.recipient,
            amount: quote.amount,
            fee: quote.fee,
            startBlock: quote.block,
            createdAt: Date.now(),
            status: "unknown",
            error: t("提交结果待确认，请核对链上状态"),
          });
        } catch {
          setError(
            t(
              "提交结果待确认，且本机记录保存失败。请保留交易哈希并在 Explorer 中核对，勿重复发送。",
            ),
          );
        }
      } else {
        if (
          journal &&
          e instanceof SubmissionError &&
          e.submissionStatus === "rejected"
        ) {
          try {
            await onSubmitted({
              ...journal,
              status: "failed",
              error: t("节点拒绝提交：{0}", e.message),
            });
          } catch {
            /* Existing pending journal still permits independent verification. */
          }
        }
        setError(errorText(e));
      }
    } finally {
      processing.current = false;
      setBusy(false);
    }
  }
  function back() {
    if (busy) return;
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
    if (dialog) dialog.dataset.stepDirection = "back";
    setError("");
    if (hash) onClose();
    else if (quote) setQuote(null);
    else if (step === "amount") setStep("recipient");
    else onClose();
  }
  async function nextRecipient(event: FormEvent) {
    event.preventDefault();
    setError("");
    let to: string;
    try {
      to = validateAddress(recipient.trim());
      if (to === wallet.address) throw new Error(t("收款地址与当前钱包相同"));
    } catch (cause) {
      setError(errorText(cause));
      return;
    }
    setRecipient(to);
    let checked = profile?.address === to ? profile.data : undefined;
    if (checked === undefined) {
      setChecking(true);
      try {
        checked = await readRecipientProfile(to, wallets);
      } catch {
        // The check is advisory; an unreachable indexer must not block sending.
        checked = null;
      } finally {
        if (active.current) setChecking(false);
      }
      if (!active.current) return;
      setProfile({ address: to, data: checked });
    }
    if (checked && (checked.ownWormhole || checked.minerDepositOnly) && !riskAck) return;
    setStep("amount");
  }
  const checked = profile?.address === recipient.trim() ? profile.data : null;
  const risk = !!checked && (checked.ownWormhole || checked.minerDepositOnly);
  return (
    <Modal
      title={
        hash
          ? error
            ? t("交易状态待确认")
            : t("交易已提交")
          : quote
            ? t("确认转账")
            : step === "amount"
              ? t("发送金额")
              : t("发送 {0}", services.symbol)
      }
      variant="flow"
      busy={busy}
      onBack={back}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {hash ? (
        <>
          <div className="flow-body">
            <div className="success-emblem">
              {error ? <CircleHelp size={29} /> : <Check size={29} />}
            </div>
            <div className="flow-heading centered">
              <h2>{error ? t("请核对交易结果") : t("已发送至网络")}</h2>
              <p>
                {error
                  ? t("请核对链上状态，暂勿重复发送。")
                  : t("交易正在等待确认，可在活动记录中查看进度。")}
              </p>
            </div>
            <p className="label">{t("交易哈希")}</p>
            <p className="address-block">{hash}</p>
            <button
              className="text-button full"
              onClick={async () => {
                setCopyError("");
                setCopied(false);
                try {
                  await copyText(hash);
                  setCopied(true);
                } catch {
                  setCopyError(t("复制失败，请手动复制上方哈希"));
                }
              }}
            >
              <SwapIcon
                active={copied}
                size={16}
                idle={<Copy size={16} />}
                done={<Check size={16} />}
              />
              {copied ? t("哈希已复制") : t("复制交易哈希")}
            </button>
            <FlowStatus error={copyError} />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <a
              className="text-button full"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://explorer.quantus.com/transactions/${hash}`}
            >
              {t("在 Explorer 查看")}
              <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="flow-footer">
            <button className="button primary full" onClick={onClose}>
              {t("完成")}
            </button>
          </div>
        </>
      ) : quote ? (
        <>
          <div className="flow-body">
            <div
              className={`send-amount ${formatAmount(quote.amount).length > 13 ? "long-value" : ""}`}
            >
              {formatAmount(quote.amount)} <span>{services.symbol}</span>
            </div>
            <dl className="review-details">
              <div>
                <dt>{t("付款钱包")}</dt>
                <dd>
                  {wallet.name}
                  <small>{wallet.address}</small>
                </dd>
              </div>
              <div>
                <dt>{t("收款地址")}</dt>
                <dd className="mono">{quote.recipient}</dd>
              </div>
              <div>
                <dt>{t("网络")}</dt>
                <dd>{services.networkName}</dd>
              </div>
              <div>
                <dt>{t("预估手续费")}</dt>
                <dd>
                  {formatAmount(quote.fee)} {services.symbol}
                </dd>
              </div>
              <div className="review-total">
                <dt>{t("预计总支出")}</dt>
                <dd>
                  {formatAmount(BigInt(quote.amount) + BigInt(quote.fee))}{" "}
                  {services.symbol}
                </dd>
              </div>
            </dl>
            <label className="check-row">
              <input
                type="checkbox"
                checked={ack}
                disabled={busy}
                onChange={(event) => setAck(event.target.checked)}
              />
              {t("我已核对完整收款地址与金额")}
            </label>
          </div>
          <div className="flow-footer">
            {expired && !error && (
              <p className="flow-note">
                {t("费用需要更新，更新后请重新核对。")}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              disabled={busy || (!expired && !ack)}
              onClick={expired ? () => void review() : confirm}
            >
              {busy && <LoaderCircle className="spin" size={18} />}{" "}
              {busy
                ? expired
                  ? t("正在更新费用…")
                  : t("正在提交…")
                : expired
                  ? t("更新费用")
                  : t("确认并发送")}
            </button>
          </div>
        </>
      ) : (
        <form
          className="flow-form"
          onSubmit={step === "recipient" ? nextRecipient : review}
        >
          <div className="flow-body">
            {step === "recipient" ? (
              <>
                <div className="flow-heading">
                  <h2>{t("发送给谁？")}</h2>
                  <p>{t("输入收款人的 Quantus 主网地址。")}</p>
                </div>
                <label className="field">
                  {t("收款地址")}
                  <textarea
                    rows={3}
                    required
                    spellCheck={false}
                    autoComplete="off"
                    value={recipient}
                    onChange={(event) => {
                      setRecipient(event.target.value);
                      setRiskAck(false);
                      setError("");
                    }}
                    placeholder={t("输入或粘贴 Quantus 地址")}
                    autoFocus
                  />
                </label>
                {wallets.some((w) => w.id !== wallet.id) && (
                  <label className="field">
                    {t("我的其他钱包")}
                    <Select
                      aria-label={t("我的其他钱包")}
                      placeholder={t("选择一个钱包")}
                      value={
                        wallets.some((w) => w.id !== wallet.id && w.address === recipient.trim())
                          ? recipient.trim()
                          : ""
                      }
                      onChange={(address) => {
                        setRecipient(address);
                        setRiskAck(false);
                        setError("");
                      }}
                      options={wallets
                        .filter((w) => w.id !== wallet.id)
                        .map((w) => ({
                          value: w.address,
                          label: w.name,
                          description: shortAddress(w.address, 6),
                        }))}
                    />
                  </label>
                )}
                {risk ? (
                  <div className="callout warm recipient-warning">
                    <TriangleAlert size={17} />
                    <div>
                      <p>
                        {checked.ownWormhole
                          ? t("这是你标记为 Wormhole 隐私账户的观察地址。")
                          : t(
                              "该地址只收到过挖矿奖励、从未发出过交易，很可能是官方钱包的加密账户（Wormhole）地址。",
                            )}{" "}
                        {t(
                          "普通转账会进入隐私池：收款方必须用该账户的助记词生成零知识证明才能取出，并会损失 0.04% 的链上费用和不足 0.01 QTC 的零头。",
                        )}
                      </p>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={riskAck}
                          onChange={(event) => setRiskAck(event.target.checked)}
                        />
                        <span>
                          {t("我已确认收款方能够从加密账户取出这笔资产，仍要继续。")}
                        </span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="soft-note">
                    <ShieldCheck size={17} />
                    <p>
                      {t(
                        "请确认对方使用 Quantus 主网。下一步输入金额，再核对手续费。",
                      )}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flow-heading">
                  <h2>{t("发送多少？")}</h2>
                  <p>{t("从 {0} 发送 {1}。", wallet.name, services.symbol)}</p>
                </div>
                <div className="send-recipient-chip">
                  <WalletIcon size={20} />
                  <span>
                    <strong>{t("收款地址")}</strong>
                    <small>{recipient}</small>
                  </span>
                  <button type="button" disabled={busy} onClick={back}>
                    {t("修改")}
                  </button>
                </div>
                {checked?.unknown && (
                  <p className="field-hint">
                    {t("该地址在链上还没有任何记录。新账户属正常情况，否则请再核对一遍。")}
                  </p>
                )}
                <label className="field">
                  <span className="sr-only">{t("发送金额")}</span>
                  <div
                    className="amount-input"
                    style={
                      {
                        "--amount-characters": Math.max(amount.length, 1),
                      } as CSSProperties
                    }
                  >
                    <span className="amount-field">
                      {/* Sizes the field to its value so the unit stays beside it. */}
                      <span aria-hidden="true">{amount || "0"}</span>
                      <input
                        key="send-amount"
                        required
                        inputMode="decimal"
                        placeholder="0"
                        autoComplete="off"
                        value={amount}
                        disabled={busy}
                        onChange={(event) => {
                          setAmount(event.target.value);
                          setError("");
                        }}
                        autoFocus
                      />
                    </span>
                    <span className="amount-unit">{services.symbol}</span>
                  </div>
                </label>
                <p className="flow-note centered">
                  {t("下一步预览网络手续费与总支出。")}
                </p>
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
                checking ||
                (step === "recipient"
                  ? !recipient.trim() || (risk && !riskAck)
                  : !amount.trim())
              }
            >
              {(busy || checking) && <LoaderCircle size={18} className="spin" />}
              {busy
                ? t("正在计算费用…")
                : checking
                  ? t("正在核对收款地址…")
                  : step === "recipient"
                    ? t("继续")
                    : t("预览转账")}
              {!busy && !checking && <ArrowRight size={17} />}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
