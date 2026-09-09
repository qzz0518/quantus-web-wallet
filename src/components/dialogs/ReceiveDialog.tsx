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
import { Modal } from "../Modal";
import type { Wallet } from "../../lib/vault";
import { copyText, download } from "../../lib/browser";
import { MAINNET } from "../../lib/chain";

export function ReceiveDialog({
  wallet,
  onClose,
}: {
  wallet: Wallet;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const qr = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareData = {
    title: `${wallet.name} · Quantus`,
    text: `Quantus 主网收款地址：${wallet.address}`,
  };
  const canShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (!navigator.canShare || navigator.canShare(shareData));
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  async function copyAddress() {
    setError("");
    setMessage("");
    try {
      await copyText(wallet.address);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("复制失败，请手动选中地址");
    }
  }
  function saveQr() {
    setError("");
    try {
      const svg = qr.current?.querySelector("svg");
      if (!svg) throw new Error("二维码尚未准备好");
      download(
        new XMLSerializer().serializeToString(svg),
        `quantus-receive-${wallet.address.slice(0, 8)}.svg`,
        "image/svg+xml",
      );
      setMessage("收款二维码下载已开始");
    } catch {
      setError("暂时无法保存二维码，请稍后重试");
    }
  }

  return (
    <Modal title="接收 QTC" variant="flow" onClose={onClose} onBack={onClose}>
      <div className="flow-body receive-flow">
        <div className="receive-wallet">
          <span className="receive-wallet-icon">
            <WalletIcon size={19} />
          </span>
          <strong>{wallet.name}</strong>
          <span>Quantus 主网</span>
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
          <p className="receive-address" aria-label="完整收款地址">
            {wallet.address}
          </p>
        </div>
        <div className="receive-secondary-actions">
          <button className="text-button" onClick={saveQr}>
            <Download size={16} />
            保存二维码
          </button>
          {canShare && (
            <button
              className="text-button"
              onClick={async () => {
                setError("");
                try {
                  await navigator.share(shareData);
                } catch (error) {
                  if (
                    !(
                      error instanceof DOMException &&
                      error.name === "AbortError"
                    )
                  )
                    setError("分享未完成，可以复制地址后发送");
                }
              }}
            >
              <Share2 size={16} />
              分享地址
            </button>
          )}
        </div>
        <a
          className="receive-explorer text-button"
          href={`${MAINNET.explorerUrl}/accounts/${wallet.address}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          在 Explorer 查看账户
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
          请仅通过 Quantus 主网向此地址发送 QTC。
        </p>
        <button
          className="button primary full"
          onClick={() => void copyAddress()}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? "地址已复制" : "复制完整地址"}
        </button>
      </div>
    </Modal>
  );
}
