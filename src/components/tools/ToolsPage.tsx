import { useState } from "react";
import { Activity, ChevronRight, LifeBuoy, Pickaxe } from "lucide-react";
import type { Wallet } from "../../lib/vault";
import { useT } from "../../lib/i18n";
import { WormholeRecoveryDialog } from "../dialogs/WormholeRecoveryDialog";
import { MiningCalculator } from "./MiningCalculator";
import { NetworkPage } from "./NetworkPage";

type Tool = "recovery" | "mining" | "network";

/**
 * Auxiliary tools live on their own tab so the wallet's main screens stay
 * focused. Each tool explains itself before asking for anything.
 */
export function ToolsPage({
  wallets,
  unlocked,
  onUnlock,
}: {
  wallets: Wallet[];
  unlocked: boolean;
  onUnlock: () => void;
}) {
  const t = useT();
  const [tool, setTool] = useState<Tool | null>(null);
  if (tool === "mining") return <MiningCalculator onBack={() => setTool(null)} />;
  if (tool === "network") return <NetworkPage onBack={() => setTool(null)} />;
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
      id: "recovery",
      Icon: LifeBuoy,
      title: t("加密账户恢复"),
      description: t("查看并取回转入 Wormhole 加密账户的资产"),
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
        />
      )}
    </section>
  );
}
