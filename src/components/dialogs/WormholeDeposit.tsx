import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Coins,
  Copy,
  LoaderCircle,
  MemoryStick,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Select } from "../Select";
import { SwapIcon } from "../SwapIcon";
import { FlowStatus } from "../FlowStatus";
import { CheckPhrase } from "../CheckPhrase";
import type { Wallet } from "../../lib/vault";
import { copyText } from "../../lib/browser";
import { errorText, formatAmount, shortAddress } from "../../lib/amount";
import { useT } from "../../lib/i18n";
import { deriveWormholeAddresses } from "../../crypto";
import {
  nextUnusedWormholeIndex,
  scanWormhole,
  type WormholeScanSnapshot,
} from "../../lib/wormhole/scan";
import { readWormholeRules } from "../../lib/wormhole/exit";
import type { WormholeRules } from "../../lib/wormhole/types";

const services = { scanWormhole, deriveWormholeAddresses, readWormholeRules };
export type DepositServices = typeof services;

export type DepositState = {
  walletId: string;
  snapshot: WormholeScanSnapshot;
  index: number;
  address: string;
};

/**
 * Paying into one's own encrypted (Wormhole) account. The address to use is
 * the first derived receiving address that has never taken a deposit — an
 * address that already holds one would tie the two payments together in public
 * view — so the seed phrase's receiving branch is scanned first to find it.
 */
export function WormholeDeposit({
  wallets,
  onDeposit,
  onWatch,
  initial,
  initialRules,
  services: injected = services,
}: {
  wallets: Wallet[];
  /** Opens the send flow with this address filled in; absent when the host cannot. */
  onDeposit?: (address: string, index: number) => void;
  /** Saves the address as a watch-only record; absent when the host cannot. */
  onWatch?: (address: string, index: number) => Promise<void>;
  /** Opens on a finished scan (used by tests). */
  initial?: DepositState;
  initialRules?: WormholeRules;
  services?: DepositServices;
}) {
  const t = useT();
  const signing = wallets.filter(
    (wallet) => wallet.kind !== "watch" && !!wallet.mnemonic,
  );
  const [walletId, setWalletId] = useState(
    () => initial?.walletId ?? signing[0]?.id ?? "",
  );
  const [state, setState] = useState<DepositState | null>(initial ?? null);
  const [rules, setRules] = useState<WormholeRules | null>(initialRules ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [watching, setWatching] = useState(false);
  const mounted = useRef(true);
  const request = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);
  // The fee and the granularity are quoted from the chain, never assumed.
  useEffect(() => {
    if (rules) return;
    let alive = true;
    injected
      .readWormholeRules()
      .then((value) => alive && setRules(value))
      .catch(() => {
        // The address still works; only the numbers in the note are missing.
      });
    return () => {
      alive = false;
    };
  }, []);
  const wallet = signing.find((entry) => entry.id === walletId);

  async function derive(after = -1) {
    if (!wallet?.mnemonic || busy) return;
    const current = ++request.current;
    setBusy(true);
    setError("");
    setMessage("");
    setCopied(false);
    try {
      // The scan is what makes "never used" true; it is repeated for a new
      // wallet so an address is never offered from another account's snapshot.
      const snapshot =
        state && state.walletId === wallet.id
          ? state.snapshot
          : await injected.scanWormhole({ mnemonic: wallet.mnemonic });
      const index = nextUnusedWormholeIndex(snapshot, after);
      const [address] = await injected.deriveWormholeAddresses(
        wallet.mnemonic,
        0,
        index,
        1,
      );
      if (!address) throw new Error(t("未能派生隐私地址，请重试"));
      if (!mounted.current || current !== request.current) return;
      setState({ walletId: wallet.id, snapshot, index, address });
    } catch (cause) {
      if (mounted.current && current === request.current)
        setError(errorText(cause));
    } finally {
      if (mounted.current && current === request.current) setBusy(false);
    }
  }

  const address = state && state.walletId === walletId ? state.address : "";
  const quantum = rules ? formatAmount(rules.quantumPlanck) : null;
  return (
    <>
      <div className="flow-body">
        <div className="flow-heading">
          <h3>{t("存入自己的隐私账户")}</h3>
          <p>
            {t(
              "从本钱包的助记词派生一个从未收过款的隐私地址。转入的资产进入隐私池，只有持有这份助记词的人能取回。",
            )}
          </p>
        </div>
        {signing.length === 0 ? (
          <div className="soft-note">
            <ShieldCheck size={17} />
            <p>{t("观察钱包没有助记词，无法派生隐私地址。请先创建或导入一个钱包。")}</p>
          </div>
        ) : (
          <>
            <label className="field">
              {t("使用哪个钱包的助记词")}
              <Select
                aria-label={t("使用哪个钱包的助记词")}
                disabled={busy}
                value={walletId}
                onChange={(value) => {
                  setWalletId(value);
                  setError("");
                  setMessage("");
                }}
                options={signing.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                  description: shortAddress(entry.address, 6),
                }))}
              />
            </label>
            {address ? (
              <div className="wormhole-deposit-address">
                <span className="label">
                  {t("隐私地址 #{0}", state?.index ?? 0)}
                </span>
                <div className="receive-qr">
                  <QRCodeSVG
                    value={address}
                    size={188}
                    level="M"
                    marginSize={3}
                    bgColor="#ffffff"
                    fgColor="#111111"
                  />
                </div>
                <p className="address-block">{address}</p>
                <CheckPhrase
                  address={address}
                  hint={t("这五个词属于这个隐私地址，转账前核对一遍")}
                />
              </div>
            ) : (
              <div className="soft-note">
                <ShieldCheck size={17} />
                <p>
                  {t(
                    "生成地址需要扫描这份助记词派生出的收款地址，官方索引服务会看到这些地址和你的 IP。助记词不会离开本页面。",
                  )}
                </p>
              </div>
            )}
            {address && (
              <ul className="wormhole-points compact">
                <li>
                  <Coins size={18} />
                  <div>
                    <strong>{t("取回时的成本")}</strong>
                    {rules
                      ? t(
                          "金额按 {0} QTC 向下取整，链上收 {1}% 的成交量费用，不足的零头会丢失。建议转整数倍的 {0} QTC。",
                          quantum ?? "",
                          (rules.volumeFeeBps / 100).toString(),
                        )
                      : t("正在读取链上规则…")}
                  </div>
                </li>
                <li>
                  <MemoryStick size={18} />
                  <div>
                    <strong>{t("取回时的设备要求")}</strong>
                    {t("在浏览器里生成零知识证明约需 1.5 GB 内存和一分钟，建议在桌面浏览器上取回。")}
                  </div>
                </li>
              </ul>
            )}
            {address && onWatch && (
              <label className="check-row">
                <input
                  type="checkbox"
                  disabled={watching || busy}
                  onChange={async (event) => {
                    if (!event.target.checked || !state) return;
                    setWatching(true);
                    setError("");
                    try {
                      await onWatch(state.address, state.index);
                      if (mounted.current)
                        setMessage(t("已加入观察列表，可在钱包列表中看到公开入账"));
                    } catch (cause) {
                      if (mounted.current) setError(errorText(cause));
                    } finally {
                      if (mounted.current) setWatching(false);
                    }
                  }}
                />
                {t("把这个地址加入观察列表")}
              </label>
            )}
            <FlowStatus error={error} message={message} />
          </>
        )}
      </div>
      {signing.length > 0 && (
        <div className="flow-footer">
          {address ? (
            <>
              {onDeposit ? (
                <button
                  className="button primary full"
                  disabled={busy}
                  onClick={() => onDeposit(address, state?.index ?? 0)}
                >
                  {t("从本钱包转入")}
                  <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  className="button primary full"
                  disabled={busy}
                  onClick={async () => {
                    setError("");
                    setMessage("");
                    try {
                      await copyText(address);
                      setCopied(true);
                      setMessage(t("地址已复制，回到钱包页用“发送”转入"));
                    } catch {
                      setError(t("复制失败，请手动选中地址"));
                    }
                  }}
                >
                  <SwapIcon
                    active={copied}
                    size={17}
                    idle={<Copy size={17} />}
                    done={<Check size={17} />}
                  />
                  {copied ? t("地址已复制") : t("复制隐私地址")}
                </button>
              )}
              <button
                className="text-button full"
                disabled={busy}
                onClick={() => void derive(state?.index ?? -1)}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                {busy ? t("正在生成…") : t("换下一个地址")}
              </button>
            </>
          ) : (
            <button
              className="button primary full"
              disabled={busy || !wallet}
              onClick={() => void derive()}
            >
              {busy && <LoaderCircle size={18} className="spin" />}
              {busy ? t("正在扫描并派生…") : t("生成隐私地址")}
              {!busy && <ArrowRight size={17} />}
            </button>
          )}
        </div>
      )}
    </>
  );
}
