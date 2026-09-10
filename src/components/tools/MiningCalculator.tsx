import { ArrowLeft } from "lucide-react";
import { useT } from "../../lib/i18n";

/** Placeholder until the calculator lands. */
export function MiningCalculator({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <section className="settings-page tools-page" aria-label={t("挖矿计算")}>
      <header className="page-heading tools-heading">
        <button type="button" className="circle-button" aria-label={t("返回")} onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <h1>{t("挖矿计算")}</h1>
      </header>
      <p className="flow-note">{t("挖矿计算即将推出。")}</p>
    </section>
  );
}
