import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Clock, LoaderCircle, Undo2 } from "lucide-react";
import type { ScheduledTransfer } from "../../lib/chain";
import {
  estimateFee,
  prepareCancelScheduled,
  readBalance,
  submitTransfer,
} from "../../lib/chain";
import type { Wallet } from "../../lib/vault";
import { signCall } from "../../crypto";
import { errorText, formatAmount, shortAddress } from "../../lib/amount";
import { localeTag, useT } from "../../lib/i18n";
import {
  TARGET_BLOCK_SECONDS,
  executeAtTime,
  formatSpan,
  scheduleProgress,
  sortScheduled,
} from "../../lib/reversible";
import { CheckPhrase } from "../CheckPhrase";
import { FlowStatus } from "../FlowStatus";
import { Modal } from "../Modal";

const cancelServices = {
  prepareCancelScheduled,
  estimateFee,
  readBalance,
  submitTransfer,
};
export type CancelServices = typeof cancelServices;

type Props = {
  wallet: Wallet;
  block: number;
  blockSeconds?: number;
  transfers: ScheduledTransfer[];
  hidden: boolean;
  onNotify: (message: string, success?: boolean) => void;
  onSubmitted: () => void;
  services?: CancelServices;
};

/**
 * Transfers this account has scheduled and can still take back. The chain
 * decides what is in the list; the panel only shows when each is due and
 * offers the one action that is still available.
 */
export function ScheduledPanel({
  wallet,
  block,
  blockSeconds = TARGET_BLOCK_SECONDS,
  transfers,
  hidden,
  onNotify,
  onSubmitted,
  services = cancelServices,
}: Props) {
  const t = useT();
  const [phrase, setPhrase] = useState("");
  const [cancelling, setCancelling] = useState<ScheduledTransfer | null>(null);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const rows = sortScheduled(transfers);
  if (!rows.length) return null;
  return (
    <section className="wallet-scheduled">
      <div className="wallet-section-title">
        <div>
          <h2>{t("待到账")}</h2>
          <p>{t("到期前可以撤回，资金退回本账户")}</p>
        </div>
        <Clock size={19} aria-hidden="true" />
      </div>
      <div className="scheduled-list">
        {rows.map((row) => {
          const waiting = submitted.includes(row.txId);
          const remaining =
            row.executeAt === null
              ? null
              : Math.max(0, row.executeAt - block) * blockSeconds;
          return (
            <div className="scheduled-row" key={row.txId}>
              <div className="scheduled-head">
                <span className="transaction-icon outgoing" aria-hidden="true">
                  <Clock size={18} />
                </span>
                <span className="scheduled-target">
                  <strong>{t("发送至 {0}", shortAddress(row.to, 6))}</strong>
                  <button
                    type="button"
                    className="scheduled-phrase-toggle"
                    aria-expanded={phrase === row.txId}
                    onClick={() =>
                      setPhrase((open) => (open === row.txId ? "" : row.txId))
                    }
                  >
                    {phrase === row.txId ? t("隐藏校验短语") : t("校验短语")}
                  </button>
                </span>
                <b>
                  {hidden ? "••••" : `−${formatAmount(row.amount)}`}
                  <small> QTC</small>
                </b>
              </div>
              {phrase === row.txId && <CheckPhrase address={row.to} />}
              <div
                className="scheduled-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(scheduleProgress(row, block) * 100)}
                style={
                  { "--progress": scheduleProgress(row, block) } as CSSProperties
                }
              >
                <i />
              </div>
              <div className="scheduled-foot">
                <span>
                  {remaining === null
                    ? t("到账时间待链上确认")
                    : remaining === 0
                      ? t("已到期，等待链上执行")
                      : t(
                          "{0}后到账 · 第 {1} 块 · {2}",
                          formatSpan(remaining),
                          (row.executeAt ?? 0).toLocaleString("en-US"),
                          executeAtTime(
                            row.executeAt ?? block,
                            block,
                            blockSeconds,
                          ).toLocaleString(localeTag(), {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          }),
                        )}
                </span>
                <button
                  type="button"
                  className="button scheduled-cancel"
                  disabled={wallet.kind === "watch" || waiting}
                  onClick={() => setCancelling(row)}
                >
                  {waiting ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Undo2 size={15} />
                  )}
                  {waiting ? t("撤回已提交") : t("撤回")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="wallet-indexer-note">
        <span className="status-dot" />
        {t("到账时间按目标出块 {0} 秒估算，以链上执行为准", TARGET_BLOCK_SECONDS)}
      </div>
      {cancelling && (
        <CancelDialog
          wallet={wallet}
          transfer={cancelling}
          services={services}
          onClose={() => setCancelling(null)}
          onDone={(txId) => {
            setSubmitted((list) => [...list, txId]);
            setCancelling(null);
            onNotify(t("撤回已提交，资金将在确认后退回本账户"), true);
            onSubmitted();
          }}
        />
      )}
    </section>
  );
}

/**
 * The fee is quoted before the question is asked: cancelling costs nothing by
 * itself, but the cancellation is a transaction and the network charges for it.
 */
function CancelDialog({
  wallet,
  transfer,
  services,
  onClose,
  onDone,
}: {
  wallet: Wallet;
  transfer: ScheduledTransfer;
  services: CancelServices;
  onClose: () => void;
  onDone: (txId: string) => void;
}) {
  const t = useT();
  const [quote, setQuote] = useState<{ hex: string; fee: string } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const active = useRef(true);
  const working = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    setBusy(true);
    setError("");
    (async () => {
      try {
        if (!wallet.mnemonic || wallet.kind === "watch")
          throw new Error(t("观察钱包不能签名"));
        const prepared = await services.prepareCancelScheduled(
          wallet.address,
          transfer.txId,
        );
        const hex = await signCall(
          wallet.kind,
          wallet.mnemonic,
          wallet.index,
          prepared.callHex,
          prepared.ctx,
        );
        const fee = await services.estimateFee(hex);
        const balance = await services.readBalance(wallet.address);
        if (BigInt(balance.spendable) < BigInt(fee))
          throw new Error(t("可用余额不足以支付撤回交易的手续费"));
        if (current && active.current) setQuote({ hex, fee });
      } catch (cause) {
        if (current && active.current) setError(errorText(cause));
      } finally {
        if (current && active.current) setBusy(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [wallet.address, transfer.txId]);
  async function confirm() {
    if (!quote || working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await services.submitTransfer(quote.hex);
      onDone(transfer.txId);
    } catch (cause) {
      if (active.current) setError(errorText(cause));
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <Modal
      title={t("撤回延时转账")}
      variant="flow"
      busy={busy}
      onBack={onClose}
      onClose={onClose}
    >
      <div className="flow-body">
        <div className="flow-heading">
          <h2>{t("资金退回本账户")}</h2>
          <p>
            {t(
              "链上不对撤回收费，但这笔撤回本身是一次交易，要付网络手续费。",
            )}
          </p>
        </div>
        <dl className="review-details">
          <div>
            <dt>{t("原收款地址")}</dt>
            <dd className="mono">{transfer.to}</dd>
          </div>
          <div>
            <dt>{t("退回金额")}</dt>
            <dd>{formatAmount(transfer.amount)} QTC</dd>
          </div>
          <div>
            <dt>{t("撤回手续费")}</dt>
            <dd>
              {quote ? `${formatAmount(quote.fee)} QTC` : t("正在估算…")}
            </dd>
          </div>
        </dl>
      </div>
      <div className="flow-footer">
        <FlowStatus error={error} />
        <button
          className="button primary full"
          disabled={busy || !quote}
          onClick={() => void confirm()}
        >
          {busy && <LoaderCircle size={18} className="spin" />}
          {busy ? t("正在处理…") : t("确认撤回")}
        </button>
      </div>
    </Modal>
  );
}
