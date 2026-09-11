import { useState } from "react";
import { Activity, ChevronRight, Hammer, LifeBuoy, Pickaxe } from "lucide-react";
import type { Wallet } from "../../lib/vault";
import { useT } from "../../lib/i18n";
import { WormholeRecoveryDialog } from "../dialogs/WormholeRecoveryDialog";
import { MiningCalculator } from "./MiningCalculator";
import { MinerPage } from "./MinerPage";
import { NetworkPage } from "./NetworkPage";

type Tool = "recovery" | "mining" | "network" | "miner";

/**
 * Auxiliary tools live on their own tab so the wallet's main screens stay
 * focused. Each tool explains itself before asking for anything.
 */
export function ToolsPage({
  wallets,
  unlocked,
  onUnlock,
  onDeposit,
  onWatch,
}: {
  wallets: Wallet[];
  unlocked: boolean;
  onUnlock: () => void;
  /** Opens the send flow to one's own encrypted address from the wallet that derived it. */
  onDeposit?: (address: string, index: number, walletId: string) => void;
  /** Keeps a derived encrypted address as a watch-only record. */
  onWatch?: (address: string, index: number) => Promise<void>;
}) {
  const t = useT();
  const [tool, setTool] = useState<Tool | null>(null);
  if (tool === "mining") return <MiningCalculator onBack={() => setTool(null)} />;
  if (tool === "network") return <NetworkPage onBack={() => setTool(null)} />;
  if (tool === "miner") return <MinerPage wallets={wallets} onBack={() => setTool(null)} />;
  const tools: { id: Tool; Icon: typeof LifeBuoy; title: string; description: string }[] = [
    {
      id: "mining",
      Icon: Pickaxe,
      title: t("挖矿计算"),
      description: t("按显卡算力估算产量、成本、保本价和利润"),
    },
    {
      id: "network",
      Icon: Activity,
      title: t("网络状态"),
      description: t("算力、出块、发行进度和区块奖励的衰减曲线"),
    },
    {
      id: "miner",
      Icon: Hammer,
      title: t("矿工看板"),
      description: t("查一个地址近 30 天的出块、收益、实际算力和转入来源"),
    },
    {
      id: "recovery",
      Icon: LifeBuoy,
      title: t("加密账户（Wormhole）"),
      description: t("存入自己的隐私地址，或扫描并取回其中的资产"),
    },
  ];
  return (
    <section className="settings-page tools-page" aria-label={t("工具")}>
      <header className="page-heading">
        <h1>{t("工具")}</h1>
        <p>{t("和钱包主功能分开的辅助工具，每个都附带说明。")}</p>
      </header>
      <section className="settings-group" aria-label={t("工具列表")}>
        {tools.map(({ id, Icon, title, description }) => (
          <button
            key={id}
            type="button"
            className="settings-row"
            onClick={() => {
              if (id === "recovery" && !unlocked) onUnlock();
              else setTool(id);
            }}
          >
            <span className="settings-row-icon" aria-hidden="true">
              <Icon size={19} />
            </span>
            <span className="settings-row-copy">
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
            <ChevronRight />
          </button>
        ))}
      </section>
      {tool === "recovery" && (
        <WormholeRecoveryDialog
          wallets={wallets}
          onClose={() => setTool(null)}
          onBack={() => setTool(null)}
          onDeposit={onDeposit}
          onWatch={onWatch}
        />
      )}
    </section>
  );
}
