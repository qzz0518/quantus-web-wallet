import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Modal } from "../Modal";
import type { Wallet } from "../../lib/vault";
import { copyText } from "../../lib/browser";

export function ReceiveDialog({
  wallet,
  onClose,
}: {
  wallet: Wallet;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="接收 QTC"
      subtitle={`收款钱包 · ${wallet.name}`}
      onClose={onClose}
    >
      <div className="receive-qr">
        <QRCodeSVG value={wallet.address} size={190} level="M" marginSize={1} />
        <span className="network-label">
          <i />
          Quantus Mainnet
        </span>
      </div>
      <p className="label">你的收款地址</p>
      <div className="address-block">{wallet.address}</div>
      <button
        className="button primary full"
        onClick={async () => {
          try {
            await copyText(wallet.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setError("复制失败，请手动选中地址");
          }
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
        {copied ? "地址已复制" : "复制完整地址"}
      </button>
      <p className="hint centered">请仅通过 Quantus 主网向此地址发送 QTC。</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
