/// <reference types="bun" />
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import type { EventRecord } from "@polkadot/types/interfaces";
import { hexToU8a, u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import { account, signCall, wormholeAddresses, wormholeNullifier } from "../../../vendor/quantus-wasm/browser/quantus_wasm.js";
import { generateMnemonic } from "../../crypto";
import { bytesToHex, deriveAccountCore, hexToBytes, initializeWasm } from "../../crypto/core";
import { MAINNET, createChainClient } from "../chain";
import {
  disconnectWormholeExitClients,
  encodeWormholeExitExtrinsic,
  listWormholeExitReceipts,
  readWormholeRules,
  summarizeWormholeExit,
  trackWormholeExit,
  withdrawWormhole,
  type WormholeExitEndpoint,
} from "./exit";
import type { WormholeProver } from "./prover";
import type { WormholeDeposit, WormholeExitProgress } from "./types";

/**
 * End-to-end withdrawal on the isolated local dev chain (`QUANTUS_DEV_TEST=1`):
 * fund two Wormhole addresses of a fresh phrase from the dev account, read the
 * deposits back from the chain (no indexer locally), prove a two-input exit
 * with the real prover artifact, submit `wormhole.verifyPrivateBatch`, and
 * confirm balance, events and nullifier state. Nothing touches mainnet.
 */
const DEV: WormholeExitEndpoint = {
  rpcUrl: "http://127.0.0.1:9945",
  genesisHash: "0x87d495dc86f8a28cdd83e4836750940a0a02b22b9b33b42e34fb00868649b28b",
  specVersion: 152,
  transactionVersion: 6,
};
const QUANTUM = 10_000_000_000n;
// Odd planck amounts so quantization is exercised: 1234 and 750 quanta.
const FUNDING = [12_345_678_901_234n, 7_500_000_000_000n];

const memory = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
  removeItem: (key: string) => { memory.delete(key); },
  clear: () => memory.clear(),
  key: () => null,
  get length() { return memory.size; },
};

test.skipIf(process.env.QUANTUS_DEV_TEST !== "1")("proves and settles a two-deposit Wormhole exit on the dev chain", async () => {
  const client = createChainClient({ ...MAINNET, rpcUrl: DEV.rpcUrl, genesisHash: DEV.genesisHash });
  await initializeWasm(new Uint8Array(await readFile(new URL("../../../vendor/quantus-wasm/browser/quantus_wasm_bg.wasm", import.meta.url))).buffer);
  const proverModule = await import("../../../vendor/quantus-wasm/browser-prover/quantus_prover.js");
  await proverModule.default({ module_or_path: new Uint8Array(await readFile(new URL("../../../vendor/quantus-wasm/browser-prover/quantus_prover_bg.wasm", import.meta.url))).buffer });
  const info = proverModule.wormholeProverInfo() as { kind: string; circuitDigest: string };
  expect(info.kind).toBe("private-batch");
  const prover: WormholeProver = async (mnemonic, request, onProgress) =>
    proverModule.wormholeProveExit(mnemonic, request, onProgress ? (stage: string, done: number, total: number) => onProgress(stage as "leaf", done, total) : undefined);

  // Public upstream dev seed; these are intentionally worthless local test funds.
  const seed = new Uint8Array(32);
  const funder = account(seed);
  const phrase = await generateMnemonic();
  try {
    const addresses = wormholeAddresses(phrase, 0, 0, FUNDING.length);
    expect(addresses).toHaveLength(FUNDING.length);
    const { ApiPromise, HttpProvider } = await import("@polkadot/api");
    const api = await ApiPromise.create({ provider: new HttpProvider(DEV.rpcUrl), noInitWarn: true, types: { U512: "[u8;64]" } });
    const deposits: WormholeDeposit[] = [];
    try {
      // Fund each Wormhole address with a plain transfer; the runtime records a zk-tree leaf for it.
      for (const [index, amount] of FUNDING.entries()) {
        const transfer = await client.prepareTransfer(funder.address, addresses[index], amount.toString());
        const signed = bytesToHex(signCall(seed, hexToBytes(transfer.callHex), transfer.ctx));
        const hash = await client.submitTransfer(signed);
        const state = await client.trackTransfer(hash, transfer.ctx.blockNumber, () => {}, { timeoutMs: 240_000, pollIntervalMs: 1000 });
        expect(state.status).toBe("finalized");
        const at = await api.at(state.blockHash!);
        const events = await at.query.system.events() as unknown as EventRecord[];
        const recipient = u8aToHex(decodeAddress(addresses[index], false, MAINNET.ss58Prefix));
        const recorded = events.find(({ event }) => event.section === "wormhole" && event.method === "NativeTransferred" &&
          u8aToHex(event.data[1].toU8a()) === recipient);
        expect(recorded).toBeDefined();
        const [, , recordedAmount, transferCount, leafIndex] = recorded!.event.data.map((d) => d.toString());
        expect(BigInt(recordedAmount)).toBe(amount);
        deposits.push({
          id: `${state.block}-${leafIndex}`, branch: 0, index, address: addresses[index], amountPlanck: amount.toString(),
          blockHeight: state.block!, blockHash: state.blockHash!, leafIndex, transferCount, toHash: recipient,
          nullifier: bytesToHex(wormholeNullifier(phrase, 0, index, BigInt(transferCount))), spent: false,
        });
      }

      const rules = await readWormholeRules(DEV);
      expect(rules).toMatchObject({ specVersion: 152, transactionVersion: 6, volumeFeeBps: 4, quantumPlanck: QUANTUM.toString(),
        blockHashCount: 4096, existentialDepositPlanck: "1000000000", burnRatePpm: 500_000, aggregatorRatePpm: 500_000, batchKind: "private-batch" });
      const summary = summarizeWormholeExit(deposits, rules);
      expect(summary.quantizedPlanck).toBe((1984n * QUANTUM).toString());
      expect(summary.netPlanck).toBe((1983n * QUANTUM).toString());
      expect(summary.feePlanck).toBe(QUANTUM.toString());

      const exit = await deriveAccountCore("mldsa65", phrase, 0);
      const before = await client.readBalance(exit.address);
      expect(before.free).toBe("0");
      const progress: WormholeExitProgress[] = [];
      const started = Date.now();
      const receipt = await withdrawWormhole({
        mnemonic: phrase, deposits, exitAddress: exit.address, endpoint: DEV, prover,
        onProgress: (update) => progress.push(update), track: { pollIntervalMs: 1000, timeoutMs: 300_000 },
      });
      const seconds = (Date.now() - started) / 1000;
      expect(receipt.phase).toBe("finalized");
      expect(receipt.nullifiers).toEqual(deposits.map((d) => d.nullifier.toLowerCase()));
      expect(receipt.netPlanck).toBe(summary.netPlanck);
      expect(receipt.includedHeight).toBeGreaterThan(receipt.proofBlock);
      expect(receipt.expiresAt).toBe(receipt.proofBlock + 4096);
      expect(receipt.bytes).toBeUndefined();
      expect(progress.map((p) => p.stage)).toEqual(expect.arrayContaining(["rules", "merkle", "circuit", "prove", "verify", "submit", "track"]));

      const after = await client.readBalance(exit.address);
      expect(BigInt(after.free)).toBe(1983n * QUANTUM);
      const at = await api.at(receipt.includedHash!);
      const events = (await at.query.system.events() as unknown as EventRecord[]).filter(({ event }) => event.section === "wormhole");
      const verified = events.find(({ event }) => event.method === "ProofVerified");
      expect(verified).toBeDefined();
      const published = (verified!.event.data[1].toJSON() as string[]).map((n) => n.toLowerCase());
      for (const deposit of deposits) expect(published).toContain(deposit.nullifier.toLowerCase());
      expect(BigInt(verified!.event.data[0].toString())).toBe(1983n * QUANTUM);
      expect(events.some(({ event }) => event.method === "SegmentsDenied" || event.method === "ExitMintFailed")).toBe(false);
      for (const deposit of deposits) {
        const used = await api.query.wormhole.usedNullifiers(deposit.nullifier);
        expect(used.toString()).toBe("true");
      }
      const stored = listWormholeExitReceipts();
      expect(stored[0]?.hash).toBe(receipt.hash);
      expect(stored[0]?.phase).toBe("finalized");
      expect(await trackWormholeExit(receipt, () => {}, undefined, { endpoint: DEV })).toEqual(receipt);

      // The same deposits cannot be withdrawn twice: rejected before any proving.
      await expect(withdrawWormhole({ mnemonic: phrase, deposits, exitAddress: exit.address, endpoint: DEV, prover }))
        .rejects.toThrow();
      // A junk proof never reaches the pool: the pre-check refuses it locally.
      const junk = encodeWormholeExitExtrinsic(api, `0x${"00".repeat(64)}`);
      const validity = await api.rpc.state.call("TaggedTransactionQueue_validate_transaction",
        u8aToHex(new Uint8Array([2, ...hexToU8a(junk.txHex), ...hexToU8a(receipt.includedHash!)])));
      expect(validity.toHex().startsWith("0x0100")).toBe(true);

      console.info(JSON.stringify({ chain: "isolated-dev", runtime: 152, deposits: deposits.map((d) => ({ address: d.address, amount: d.amountPlanck, leafIndex: d.leafIndex })),
        exitAddress: exit.address, net: receipt.netPlanck, hash: receipt.hash, proofBlock: receipt.proofBlock, includedHeight: receipt.includedHeight,
        finalizedHeight: receipt.finalizedHeight, proofBytes: receipt.proofBytes, circuitDigest: info.circuitDigest, seconds }));
    } finally {
      await api.disconnect();
    }
  } finally {
    funder.free();
    seed.fill(0);
    await disconnectWormholeExitClients();
    await client.disconnect();
  }
}, 900_000);
