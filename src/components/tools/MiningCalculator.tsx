import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useT } from "../../lib/i18n";
import { BUILT_IN_TERMS } from "../../lib/mining/data";
import { estimate, type Network } from "../../lib/mining/math";
import { loadInputs, saveInputs, toModel, type MiningInputs as Inputs } from "../../lib/mining/inputs";
import { MiningInputs } from "./MiningInputs";
import { MiningNetwork, useMiningData } from "./MiningNetwork";
import { MiningResults } from "./MiningResults";
import { MiningSummary } from "./MiningSummary";

/**
 * Mining calculator. The page leads with the four figures a miner decides
 * on — output, profit, break-even price, and the price of whatever the rig
 * burns — then the short form that changes them, and only then the tables
 * that explain where they came from. Each figure is printed once: the
 * headline owns "per day", everything below it says something else.
 */
export function MiningCalculator({ onBack }: { onBack: () => void }) {
  const t = useT();
  const data = useMiningData();
  const { terms } = data;
  const [inputs, setInputs] = useState<Inputs>(() => loadInputs(BUILT_IN_TERMS));
  useEffect(() => saveInputs(inputs), [inputs]);
  const update = (patch: Partial<Inputs>) => setInputs((prev) => ({ ...prev, ...patch }));
  const priceRef = useRef<HTMLInputElement | null>(null);

  const network: Network | null = useMemo(
    () =>
      data.chain && data.reward
        ? {
            difficulty: data.chain.difficulty,
            blockTimeSeconds: data.chain.blockTimeSeconds,
            blockRewardPlanck: data.reward.blockRewardPlanck,
          }
        : null,
    [data.chain, data.reward],
  );
  const model = useMemo(() => toModel(inputs, terms, data.market?.last ?? null), [inputs, terms, data.market]);
  const result = useMemo(
    () => (network && model.ready ? estimate(network, model.devices, model.assumptions, model.costs) : null),
    [network, model],
  );
  const focusPrice = () => {
    const input = priceRef.current;
    if (!input) return;
    input.scrollIntoView({ block: "center", behavior: "smooth" });
    input.focus();
  };

  return (
    <section className="settings-page tools-page mining-page" aria-label={t("挖矿计算")}>
      <header className="page-heading tools-heading">
        <button type="button" className="circle-button" aria-label={t("返回")} onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <h1>{t("挖矿计算")}</h1>
      </header>

      <MiningSummary
        result={result}
        model={model}
        loading={data.loading && !network}
        hasNetwork={network !== null}
        onNeedPrice={focusPrice}
      />
      {/* One grid holds all three: on a phone they read top to bottom, on a
          wide screen the form takes the left column while the network line
          and the estimate stack up the right, so neither side runs long. */}
      <div className="mining-grid">
        <MiningNetwork data={data} network={network} />
        <div className="mining-column mining-column-form">
          <MiningInputs
            inputs={inputs}
            update={update}
            terms={terms}
            rows={result?.devices ?? null}
            currency={model.currency}
            priced={model.assumptions.price > 0}
            market={data.market}
            loading={data.loading && data.market === null && !data.errors.market}
            priceRef={priceRef}
          />
        </div>
        <div className="mining-column mining-column-results">
          <MiningResults
            network={network}
            model={model}
            result={result}
            terms={terms}
            pool={data.pool}
            luck={data.luck}
            loading={data.loading && !network}
          />
        </div>
      </div>
    </section>
  );
}
