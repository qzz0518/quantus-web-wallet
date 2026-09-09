/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { account, signCall } from '../../vendor/quantus-wasm/browser/quantus_wasm.js';
import { bytesToHex, hexToBytes, initializeWasm } from '../crypto/core';
import { MAINNET, createChainClient } from './chain';

/** Explicit opt-in, exclusively to the isolated local dev chain. No mainnet transaction is ever sent. */
test.skipIf(process.env.QUANTUS_DEV_TEST !== '1')('actual dev runtime accepts browser WASM and distinguishes finalized success from dispatch failure', async () => {
  const client = createChainClient({ ...MAINNET, rpcUrl: 'http://127.0.0.1:9945',
    genesisHash: '0x87d495dc86f8a28cdd83e4836750940a0a02b22b9b33b42e34fb00868649b28b' });
  const wasm = await readFile(new URL('../../vendor/quantus-wasm/browser/quantus_wasm_bg.wasm', import.meta.url));
  await initializeWasm(new Uint8Array(wasm).buffer);
  // Public upstream dev seed; these are intentionally worthless local test funds.
  const seed = new Uint8Array(32);
  const sender = account(seed);
  const recipient = account(crypto.getRandomValues(new Uint8Array(32)));
  try {
    const senderAddress = sender.address;
    const recipientAddress = recipient.address;
    expect(senderAddress).toBe('qzk1Nxai3dZD9Cn5kwGcgL6mKxsfxwqdis7kDQJ52aJS2vSn7');
    const initial = await client.readBalance(recipientAddress);
    const transfer = await client.prepareTransfer(senderAddress, recipientAddress, '1250000000000');
    const signed = bytesToHex(signCall(seed, hexToBytes(transfer.callHex), transfer.ctx));
    const fee = await client.estimateFee(signed);
    expect(BigInt(fee)).toBeGreaterThan(0n);
    const hash = await client.submitTransfer(signed);
    // Prepare an actual validly signed extrinsic whose call must fail in the runtime.
    // This tests System.ExtrinsicFailed handling independently of transaction pool validity.
    const badTransfer = await client.prepareTransfer(senderAddress, recipientAddress, '200000000000000000');
    expect(badTransfer.ctx.nonce).toBe(transfer.ctx.nonce + 1);
    const badSigned = bytesToHex(signCall(seed, hexToBytes(badTransfer.callHex), badTransfer.ctx));
    const badHash = await client.submitTransfer(badSigned);
    const successStates: string[] = [];
    const failedStates: string[] = [];
    const [success, failure] = await Promise.all([
      client.trackTransfer(hash, transfer.ctx.blockNumber, (state) => successStates.push(state.status), { timeoutMs: 240_000, pollIntervalMs: 1000 }),
      client.trackTransfer(badHash, badTransfer.ctx.blockNumber, (state) => failedStates.push(state.status), { timeoutMs: 240_000, pollIntervalMs: 1000 }),
    ]);
    expect(success.status).toBe('finalized');
    expect(successStates).toContain('included');
    expect(failure.status).toBe('failed');
    expect(failure.error).toContain('FundsUnavailable');
    expect(failedStates).not.toContain('finalized');
    const final = await client.readBalance(recipientAddress);
    expect(BigInt(final.free) - BigInt(initial.free)).toBe(1250000000000n);
    console.info(JSON.stringify({ chain: 'isolated-dev', runtime: 152, transactionVersion: 6,
      sender: senderAddress, recipient: recipientAddress, amount: '1250000000000', fee,
      success, failure, recipientBalance: final.free }));
  } finally {
    sender.free(); recipient.free(); seed.fill(0);
    await client.disconnect();
  }
}, 260_000);
