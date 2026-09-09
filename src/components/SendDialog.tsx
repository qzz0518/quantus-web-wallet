import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Copy,
  Wallet as WalletIcon,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { SwapIcon } from "./SwapIcon";
import { Modal } from "./Modal";
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
    [expired, setExpired] = useState(false);
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
        throw new Error("观察钱包不能签名");
      const to = validateAddress(recipient.trim()),
        atomic = parseAmount(amount).toString();
      if (to === wallet.address) throw new Error("收款地址与当前钱包相同");
      const prepared = await services.prepareTransfer(
        wallet.address,
        to,
        atomic,
      );
      const hex = await signCall(
        wallet.mnemonic,
        wallet.index,
        prepared.callHex,
        prepared.ctx,
      );
      const fee = await services.estimateFee(hex),
        balance = await services.readBalance(wallet.address);
      if (BigInt(balance.spendable) < BigInt(atomic) + BigInt(fee))
        throw new Error("可用余额不足以支付金额和手续费");
      if (
        BigInt(balance.free) - BigInt(atomic) - BigInt(fee) <
        BigInt(prepared.existentialDeposit)
      )
        throw new Error(
          `转账后需保留至少 ${formatAmount(prepared.existentialDeposit)} ${services.symbol} 以维持账户`,
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
        throw new Error("费用报价已过期，请更新费用后重新确认");
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
        throw new Error("账户或网络状态已变化，请更新费用后重新确认");
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
        throw new Error("余额或手续费已变化，请更新费用后重新确认");
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
        setError("提交结果待确认，请保留哈希并核对链上状态，勿重复发送。");
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
            error: "提交结果待确认，请核对链上状态",
          });
        } catch {
          setError(
            "提交结果待确认，且本机记录保存失败。请保留交易哈希并在 Explorer 中核对，勿重复发送。",
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
              error: "节点拒绝提交：" + e.message,
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
  function nextRecipient(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const to = validateAddress(recipient.trim());
      if (to === wallet.address) throw new Error("收款地址与当前钱包相同");
      setRecipient(to);
      setStep("amount");
    } catch (cause) {
      setError(errorText(cause));
    }
  }
  return (
    <Modal
      title={
        hash
          ? error
            ? "交易状态待确认"
            : "交易已提交"
          : quote
            ? "确认转账"
            : step === "amount"
              ? "发送金额"
              : `发送 ${services.symbol}`
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
              <h2>{error ? "请核对交易结果" : "已发送至网络"}</h2>
              <p>
                {error
                  ? "请核对链上状态，暂勿重复发送。"
                  : "交易正在等待确认，可在活动记录中查看进度。"}
              </p>
            </div>
            <p className="label">交易哈希</p>
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
                  setCopyError("复制失败，请手动复制上方哈希");
                }
              }}
            >
              <SwapIcon
                active={copied}
                size={16}
                idle={<Copy size={16} />}
                done={<Check size={16} />}
              />
              {copied ? "哈希已复制" : "复制交易哈希"}
            </button>
            {copyError && (
              <p className="error" role="alert">
                {copyError}
              </p>
            )}
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
              在 Explorer 查看
              <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="flow-footer">
            <button className="button primary full" onClick={onClose}>
              完成
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
                <dt>付款钱包</dt>
                <dd>
                  {wallet.name}
                  <small>{wallet.address}</small>
                </dd>
              </div>
              <div>
                <dt>收款地址</dt>
                <dd className="mono">{quote.recipient}</dd>
              </div>
              <div>
                <dt>网络</dt>
                <dd>{services.networkName}</dd>
              </div>
              <div>
                <dt>预估手续费</dt>
                <dd>
                  {formatAmount(quote.fee)} {services.symbol}
                </dd>
              </div>
              <div className="review-total">
                <dt>预计总支出</dt>
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
              我已核对完整收款地址与金额
            </label>
          </div>
          <div className="flow-footer">
            {expired && !error && (
              <p className="flow-note">费用需要更新，更新后请重新核对。</p>
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
                  ? "正在更新费用…"
                  : "正在提交…"
                : expired
                  ? "更新费用"
                  : "确认并发送"}
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
                  <h2>发送给谁？</h2>
                  <p>输入收款人的 Quantus 主网地址。</p>
                </div>
                <label className="field">
                  收款地址
                  <textarea
                    rows={3}
                    required
                    spellCheck={false}
                    autoComplete="off"
                    value={recipient}
                    onChange={(event) => {
                      setRecipient(event.target.value);
                      setError("");
                    }}
                    placeholder="输入或粘贴 Quantus 地址"
                    autoFocus
                  />
                </label>
                {wallets.some((w) => w.id !== wallet.id) && (
                  <label className="field">
                    我的其他钱包
                    <select
                      value=""
                      onChange={(event) => {
                        setRecipient(event.target.value);
                        setError("");
                      }}
                    >
                      <option value="">选择一个钱包</option>
                      {wallets
                        .filter((w) => w.id !== wallet.id)
                        .map((w) => (
                          <option key={w.id} value={w.address}>
                            {w.name} · {shortAddress(w.address, 4)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <div className="soft-note">
                  <ShieldCheck size={17} />
                  <p>
                    请确认对方使用 Quantus 主网。下一步输入金额，再核对手续费。
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flow-heading">
                  <h2>发送多少？</h2>
                  <p>
                    从 {wallet.name} 发送 {services.symbol}。
                  </p>
                </div>
                <div className="send-recipient-chip">
                  <WalletIcon size={20} />
                  <span>
                    <strong>收款地址</strong>
                    <small>{recipient}</small>
                  </span>
                  <button type="button" disabled={busy} onClick={back}>
                    修改
                  </button>
                </div>
                <label className="field">
                  <span className="sr-only">发送金额</span>
                  <div
                    className={`amount-input ${amount.length > 12 ? "long-value" : ""}`}
                  >
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
                    <span>{services.symbol}</span>
                  </div>
                </label>
                <p className="flow-note centered">
                  下一步预览网络手续费与总支出。
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
                (step === "recipient" ? !recipient.trim() : !amount.trim())
              }
            >
              {busy && <LoaderCircle size={18} className="spin" />}
              {busy
                ? "正在计算费用…"
                : step === "recipient"
                  ? "继续"
                  : "预览转账"}
              {!busy && <ArrowRight size={17} />}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
