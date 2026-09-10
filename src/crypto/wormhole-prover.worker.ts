import type { WormholeProverMessage, WormholeProverRequestMessage } from "../lib/wormhole/prover";

// One proof per Worker. The prover artifact (~4 MB) is loaded here, never in
// the main bundle; the phrase arrives once, is handed to WASM and cleared. No
// network request is made while proving.
self.onmessage = async (event: MessageEvent<WormholeProverRequestMessage>) => {
  const message = event.data;
  const post = (reply: WormholeProverMessage) => self.postMessage(reply);
  try {
    const prover = await import("../../vendor/quantus-wasm/browser-prover/quantus_prover.js");
    const instance = await prover.default();
    const result = prover.wormholeProveExit(message.mnemonic, message.request, (stage: string, done: number, total: number) => {
      post({ type: "progress", stage: stage as "leaf" | "circuit" | "prove" | "verify", done, total });
    });
    // Linear memory only grows, so its final size is the proving peak.
    post({ type: "done", result, memoryBytes: instance.memory.buffer.byteLength });
  } catch (error) {
    // Prover errors name fields and amounts, never the phrase or derived secrets.
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    message.mnemonic = "";
    self.close();
  }
};
