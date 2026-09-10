import init, { wormholeSyntheticExitRequest } from "../../vendor/quantus-wasm/browser-prover/quantus_prover.js";
import { lastWormholeProverMemoryBytes, proveWormholeExitInWorker, type WormholeProofRequest } from "../../src/lib/wormhole/prover";

// Measures the real prover Worker on a synthetic tree (no chain, no funds).
// `?count=N` picks the number of inputs (1..7). Results land in `window.__proverMeasurement`.
if (!import.meta.env.DEV) throw new Error("Development fixture only");
// Public upstream test phrase; never fund it.
const PHRASE = "orchard answer curve patient visual flower maze noise retreat penalty cage small earth domain scan pitch bottom crunch theme club client swap slice raven";
const EXIT = "0x0202020202020202020202020202020202020202020202020202020202020202";
const count = Number(new URLSearchParams(location.search).get("count") ?? "1");
const log = document.getElementById("log") as HTMLPreElement;
const print = (line: string) => { log.textContent += `${line}\n`; };

declare global {
  interface Window { __proverMeasurement?: Record<string, unknown> }
}

try {
  await init();
  const request = JSON.parse(wormholeSyntheticExitRequest(PHRASE, count, EXIT)) as WormholeProofRequest;
  const stages: Record<string, number> = {};
  let last = performance.now();
  const started = last;
  const result = await proveWormholeExitInWorker(PHRASE, request, (stage, done, total) => {
    const now = performance.now();
    if (done >= total) stages[stage] = (stages[stage] ?? 0) + (now - last);
    else if (stage === "leaf") stages.leaf = (stages.leaf ?? 0) + (now - last);
    last = now;
    print(`${stage} ${done}/${total} ${((now - started) / 1000).toFixed(1)}s`);
  });
  const total = performance.now() - started;
  window.__proverMeasurement = {
    count, totalSeconds: total / 1000, stagesSeconds: Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, v / 1000])),
    proofBytes: result.proofBytes, outputQuanta: result.outputQuanta, inputQuanta: result.inputQuanta,
    memoryBytes: lastWormholeProverMemoryBytes, circuitDigest: result.circuitDigest, nullifiers: result.nullifiers.length,
  };
  print(JSON.stringify(window.__proverMeasurement));
} catch (error) {
  window.__proverMeasurement = { count, error: error instanceof Error ? error.message : String(error) };
  print(JSON.stringify(window.__proverMeasurement));
}
