import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Share2,
  Wallet as WalletIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { SwapIcon } from "../SwapIcon";
import { Modal } from "../Modal";
import type { Wallet } from "../../lib/vault";
import { copyText, download } from "../../lib/browser";
import { MAINNET } from "../../lib/chain";
import { useT } from "../../lib/i18n";

export function ReceiveDialog({
  wallet,
  onClose,
}: {
  wallet: Wallet;
  onClose: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copying, setCopying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const qr = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyBusy = useRef(false);
  const shareBusy = useRef(false);
  const request = useRef(0);
  const shareData = {
    title: `${wallet.name} · Quantus`,
    text: t("Quantus 主网收款地址：{0}", wallet.address),
  };
  const canShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (!navigator.canShare || navigator.canShare(shareData));
  useEffect(() => {
    setCopied(false);
    setError("");
    setMessage("");
    setCopying(false);
    setSharing(false);
    copyBusy.current = false;
    shareBusy.current = false;
    return () => {
      request.current++;
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, [wallet.address]);

  async function copyAddress() {
    if (copyBusy.current) return;
    copyBusy.current = true;
    const savedRequest = request.current;
    setCopying(true);
    setCopied(false);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    setError("");
    setMessage("");
    try {
      await copyText(wallet.address);
      if (savedRequest !== request.current) return;
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      if (savedRequest === request.current)
        setError(t("复制失败，请手动选中地址"));
    } finally {
      if (savedRequest === request.current) {
        copyBusy.current = false;
        setCopying(false);
      }
    }
  }
  function saveQr() {
    setError("");
    setMessage("");
    try {
      const svg = qr.current?.querySelector("svg");
      if (!svg) throw new Error(t("二维码尚未准备好"));
      download(
        new XMLSerializer().serializeToString(svg),
        `quantus-receive-${wallet.address.slice(0, 8)}.svg`,
        "image/svg+xml",
      );
      setMessage(t("收款二维码下载已开始"));
    } catch {
      setError(t("暂时无法保存二维码，请稍后重试"));
    }
  }

  return (
    <Modal
      title={t("接收 QTC")}
      variant="flow"
      onClose={onClose}
      onBack={onClose}
    >
      <div className="flow-body receive-flow">
        <div className="receive-wallet">
          <span className="receive-wallet-icon">
            <WalletIcon size={19} />
          </span>
          <strong title={wallet.name}>{wallet.name}</strong>
          <span>{t("Quantus 主网")}</span>
        </div>
        <div className="receive-qr-panel">
          <div className="receive-qr" ref={qr}>
            <QRCodeSVG
              value={wallet.address}
              size={244}
              level="M"
              marginSize={3}
              bgColor="#ffffff"
              fgColor="#111111"
            />
          </div>
          <p className="receive-address" aria-label={t("完整收款地址")}>
            {wallet.address}
          </p>
        </div>
        <div className="receive-secondary-actions">
          <button className="text-button" onClick={saveQr}>
            <Download size={16} />
            {t("保存二维码")}
          </button>
          {canShare && (
            <button
              className="text-button"
              disabled={sharing}
              onClick={async () => {
                if (shareBusy.current) return;
                shareBusy.current = true;
                setSharing(true);
                const savedRequest = request.current;
                setError("");
                setMessage("");
                try {
                  await navigator.share(shareData);
                } catch (error) {
                  if (
                    savedRequest === request.current &&
                    !(
                      error instanceof DOMException &&
                      error.name === "AbortError"
                    )
                  )
                    setError(t("分享未完成，可以复制地址后发送"));
                } finally {
                  if (savedRequest === request.current) {
                    shareBusy.current = false;
                    setSharing(false);
                  }
                }
              }}
            >
              <Share2 size={16} />
              {sharing ? t("正在分享…") : t("分享地址")}
            </button>
          )}
        </div>
        <a
          className="receive-explorer text-button"
          href={`${MAINNET.explorerUrl}/accounts/${wallet.address}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("在 Explorer 查看账户")}
          <ArrowUpRight size={14} />
        </a>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="flow-success" role="status">
            {message}
          </p>
        )}
      </div>
      <div className="flow-footer">
        <p className="flow-note centered">
          {t("请仅通过 Quantus 主网向此地址发送 QTC。")}
        </p>
        <button
          className="button primary full"
          disabled={copying}
          onClick={() => void copyAddress()}
        >
          <SwapIcon
            active={copied}
            idle={<Copy size={18} />}
            done={<Check size={18} />}
          />
          {copying
            ? t("正在复制…")
            : copied
              ? t("地址已复制")
              : t("复制完整地址")}
        </button>
        <span className="sr-only" role="status">
          {copied ? t("地址已复制") : ""}
        </span>
      </div>
    </Modal>
  );
}
