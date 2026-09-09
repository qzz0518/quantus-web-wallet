/// <reference types="bun" />
import { beforeAll, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { account, verifySignature } from '../../vendor/quantus-wasm/browser/quantus_wasm.js';
import { bytesToHex, deriveAccountCore, hexToBytes, initializeWasm, signCallCore } from './core';
import { generateMnemonic, normalizeMnemonic, validateMnemonic } from './index';
import type { SignContext } from './types';

// Public, upstream test vector. Never use this phrase for funds.
const PHRASE = 'orchard answer curve patient visual flower maze noise retreat penalty cage small earth domain scan pitch bottom crunch theme club client swap slice raven';
const GENESIS = '0xfb5487c0be6ae4ade2d41d16e50465129861636c2b8d61fa94d7a19631626fba';

beforeAll(async () => {
  const wasm = await readFile(new URL('../../vendor/quantus-wasm/browser/quantus_wasm_bg.wasm', import.meta.url));
  await initializeWasm(new Uint8Array(wasm).buffer);
});

describe('official Quantus browser cryptography', () => {
  test('24-word generation uses valid independent BIP39 phrases', async () => {
    const first = await generateMnemonic();
    const second = await generateMnemonic();
    expect(first.split(' ')).toHaveLength(24);
    expect(validateMnemonic(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(validateMnemonic('abandon '.repeat(24))).toBe(false);
    expect(normalizeMnemonic('  ABANDON \n ability ')).toBe('abandon ability');
  });

  test('HD addresses preserve official wallet recovery vectors', async () => {
    expect((await deriveAccountCore(PHRASE, 0)).address).toBe('qzm5QCox8Dp5A3oSXZZYHD8YoYgPz7enykZb6RPUropdCyN5h');
    expect((await deriveAccountCore(PHRASE, 1)).address).toBe('qzmufPopkLKAwDmTzR5uXg8GMp5sUP48CqafJLUz3fPMSSGSh');
    expect((await deriveAccountCore('human snow truck virus now jaguar wall brisk shoe craft gravity diesel', 0)).address)
      .toBe('qznQKhufTDfU3szAzfgCny7wMhxUN3qjEqneiRUNgC7MjSDyG');
    await expect(deriveAccountCore(PHRASE, -1)).rejects.toThrow();
    await expect(deriveAccountCore(PHRASE, 2147483648)).rejects.toThrow();
    const material = await deriveAccountCore(PHRASE, 0);
    expect(material.publicKey.length).toBe(2 + 2592 * 2);
    expect(Object.keys(material).sort()).toEqual(['address', 'publicKey']);
  });

  test('seed address matches current runtime CrystalAlice', () => {
    const handle = account(new Uint8Array(32));
    try { expect(handle.address).toBe('qzk1Nxai3dZD9Cn5kwGcgL6mKxsfxwqdis7kDQJ52aJS2vSn7'); }
    finally { handle.free(); }
  });

  test('mainnet spec 152 / tx 6 v4 envelope verifies and rejects tampering', async () => {
    const context: SignContext = {
      nonce: 0, genesisHash: GENESIS, blockHash: GENESIS, blockNumber: 0,
      period: 0, specVersion: 152, transactionVersion: 6, tip: '0',
    };
    const call = '0x020000' + '11'.repeat(32) + '04';
    const signed = hexToBytes(await signCallCore(PHRASE, 0, call, context));
    expect(signed[0] & 3).toBe(1); // two-byte compact body length
    const body = signed.slice(2);
    expect((signed[0] | signed[1] << 8) >>> 2).toBe(body.length);
    expect(Array.from(body.slice(0, 2))).toEqual([0x84, 0]);
    expect(body[34]).toBe(0); // ML-DSA-87 variant, not ML-DSA-65
    const signature = body.slice(35, 35 + 4627);
    const publicKey = body.slice(35 + 4627, 35 + 4627 + 2592);
    const encodedExtraAndCall = body.slice(35 + 4627 + 2592);
    expect(bytesToHex(encodedExtraAndCall)).toBe('0x00000000' + call.slice(2));
    const payload = hexToBytes(call + '00000000' + '98000000' + '06000000' + GENESIS.slice(2) + GENESIS.slice(2) + '00');
    expect(verifySignature(publicKey, payload, signature)).toBe(true);
    payload[3] ^= 1;
    expect(verifySignature(publicKey, payload, signature)).toBe(false);
    const altered = signature.slice();
    altered[10] ^= 1;
    payload[3] ^= 1;
    expect(verifySignature(publicKey, payload, altered)).toBe(false);
  });
});
