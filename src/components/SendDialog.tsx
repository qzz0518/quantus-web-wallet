import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Modal } from "./Modal";
import type { Wallet, Pending } from "../lib/vault";
import { parseAmount, formatAmount, errorText } from "../lib/amount";
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
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [recipient, setRecipient] = useState(""),
    [amount, setAmount] = useState(""),
    [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ack, setAck] = useState(false),
    [hash, setHash] = useState(""),
    [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!quote) return;
    const id = setInterval(
      () => setExpired(Date.now() - quote.at > 60_000),
      1000,
    );
    return () => clearInterval(id);
  }, [quote]);
  async function review(e: FormEvent) {
    e.preventDefault();
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
      setBusy(false);
    }
  }
  async function confirm() {
    if (!quote || busy || !ack) return;
    setBusy(true);
    setError("");
    let journal: Pending | undefined;
    try {
      if (Date.now() - quote.at > 60_000)
        throw new Error("费用报价已过期，请返回重新预览");
      const prepared = await services.prepareTransfer(
        wallet.address,
        quote.recipient,
        quote.amount,
      );
      if (
        prepared.ctx.nonce !== quote.nonce ||
        prepared.ctx.blockNumber - quote.block >= 48
      )
        throw new Error("账户或网络状态已变化，请返回重新预览");
      const balance = await services.readBalance(wallet.address),
        freshFee = await services.estimateFee(quote.hex);
      if (
        BigInt(freshFee) > BigInt(quote.fee) ||
        BigInt(balance.spendable) < BigInt(quote.amount) + BigInt(freshFee) ||
        BigInt(balance.free) - BigInt(quote.amount) - BigInt(freshFee) <
          BigInt(prepared.existentialDeposit)
      )
        throw new Error("余额或手续费已变化，请返回重新预览");
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
      setBusy(false);
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
            ? "确认这笔转账"
            : `发送 ${services.symbol}`
      }
      subtitle={
        hash
          ? error
            ? "请用交易哈希核对结果，暂勿重复发送。"
            : "交易正在等待网络确认，请在活动记录中查看结果。"
          : `付款钱包 · ${wallet.name}`
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {hash ? (
        <>
          <div className="success-emblem">
            {error ? <LoaderCircle size={28} /> : <Check size={28} />}
          </div>
          <p className="label">交易哈希</p>
          <p className="address-block">{hash}</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <a
            className="button full"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://explorer.quantus.com/transactions/${hash}`}
          >
            在 Explorer 中查看
            <ArrowUpRight size={16} />
          </a>
          <button className="button primary full spaced" onClick={onClose}>
            完成
          </button>
        </>
      ) : quote ? (
        <>
          <div className="send-amount">
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
              onChange={(e) => setAck(e.target.checked)}
            />
            我已核对完整收款地址与金额
          </label>
          {expired && <p className="error">报价已过期，请返回更新费用。</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                setQuote(null);
                setError("");
              }}
            >
              <ChevronLeft size={16} />
              返回
            </button>
            <button
              className="button primary grow"
              disabled={!ack || busy || expired}
              onClick={confirm}
            >
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ArrowUpRight size={16} />
              )}{" "}
              {busy ? "正在提交…" : "确认并发送"}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={review}>
          <label className="field">
            收款地址
            <textarea
              rows={3}
              required
              spellCheck={false}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="输入或粘贴 Quantus 主网地址"
              autoFocus
            />
          </label>
          {wallets.some((w) => w.id !== wallet.id) && (
            <label className="field compact-field">
              或转至我的钱包
              <select value="" onChange={(e) => setRecipient(e.target.value)}>
                <option value="">选择另一个钱包</option>
                {wallets
                  .filter((w) => w.id !== wallet.id)
                  .map((w) => (
                    <option key={w.id} value={w.address}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="field">
            发送金额
            <div className="amount-input">
              <input
                required
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span>{services.symbol}</span>
            </div>
          </label>
          <div className="soft-note">
            <ShieldCheck size={17} />
            <p>
              下一步核对地址与手续费。确认后，交易将提交到{" "}
              {services.networkName}。
            </p>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="button primary full" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : null}
            {busy ? "正在计算费用…" : "预览转账"}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>
      )}
    </Modal>
  );
}
