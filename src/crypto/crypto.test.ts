/// <reference types="bun" />
import { beforeAll, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { u8aToHex } from '@polkadot/util';
import { blake2AsHex, decodeAddress } from '@polkadot/util-crypto';
import {
  account, accountFromMnemonic, accountFromMnemonicScheme, canonicalAddressIndex, signatureVariant,
  verifySignature, verifySignatureScheme,
} from '../../vendor/quantus-wasm/browser/quantus_wasm.js';
import { bytesToHex, deriveAccountCore, hexToBytes, initializeWasm, signCallCore } from './core';
import { DEFAULT_SCHEME, SCHEMES, WALLET_SCHEMES, derivationPath, generateMnemonic, normalizeMnemonic, validateMnemonic } from './index';
import type { SignContext, WalletScheme } from './types';

// Public, upstream test vector. Never use this phrase for funds.
const PHRASE = 'orchard answer curve patient visual flower maze noise retreat penalty cage small earth domain scan pitch bottom crunch theme club client swap slice raven';
const GENESIS = '0xfb5487c0be6ae4ade2d41d16e50465129861636c2b8d61fa94d7a19631626fba';
const SIZES: Record<WalletScheme, { variant: number; signature: number; publicKey: number }> = {
  mldsa87: { variant: 0, signature: 4627, publicKey: 2592 },
  mldsa65: { variant: 1, signature: 3309, publicKey: 1952 },
};

beforeAll(async () => {
  const wasm = await readFile(new URL('../../vendor/quantus-wasm/browser/quantus_wasm_bg.wasm', import.meta.url));
  await initializeWasm(new Uint8Array(wasm).buffer);
});

/** Checks the v4 envelope of a signed immortal call and verifies its signature under the scheme. */
function checkEnvelope(scheme: WalletScheme, signedHex: string, call: string, expectedAddressHex: string) {
  const { variant, signature: signatureLength, publicKey: publicKeyLength } = SIZES[scheme];
  const signed = hexToBytes(signedHex);
  expect(signed[0] & 3).toBe(1); // two-byte compact body length
  const body = signed.slice(2);
  expect((signed[0] | signed[1] << 8) >>> 2).toBe(body.length);
  expect(Array.from(body.slice(0, 2))).toEqual([0x84, 0]);
  expect(bytesToHex(body.slice(2, 34))).toBe(expectedAddressHex);
  expect(body[34]).toBe(variant);
  const signature = body.slice(35, 35 + signatureLength);
  const publicKey = body.slice(35 + signatureLength, 35 + signatureLength + publicKeyLength);
  const encodedExtraAndCall = body.slice(35 + signatureLength + publicKeyLength);
  expect(bytesToHex(encodedExtraAndCall)).toBe('0x00000000' + call.slice(2));
  const payload = hexToBytes(call + '00000000' + '98000000' + '06000000' + GENESIS.slice(2) + GENESIS.slice(2) + '00');
  expect(verifySignatureScheme(SCHEMES[scheme].wasmName, publicKey, payload, signature)).toBe(true);
  const other = scheme === 'mldsa87' ? 'mldsa65' : 'mldsa87';
  expect(verifySignatureScheme(SCHEMES[other].wasmName, publicKey, payload, signature)).toBe(false);
  payload[3] ^= 1;
  expect(verifySignatureScheme(SCHEMES[scheme].wasmName, publicKey, payload, signature)).toBe(false);
  const altered = signature.slice();
  altered[10] ^= 1;
  payload[3] ^= 1;
  expect(verifySignatureScheme(SCHEMES[scheme].wasmName, publicKey, payload, altered)).toBe(false);
  return { signature, publicKey };
}

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

  test('scheme table matches the WASM module and the official CLI defaults', () => {
    expect(DEFAULT_SCHEME).toBe('mldsa65');
    expect(WALLET_SCHEMES).toEqual(['mldsa65', 'mldsa87']);
    for (const scheme of WALLET_SCHEMES) {
      expect(canonicalAddressIndex(SCHEMES[scheme].wasmName)).toBe(SCHEMES[scheme].addressIndex);
      expect(signatureVariant(SCHEMES[scheme].wasmName)).toBe(SIZES[scheme].variant);
    }
    expect(derivationPath('mldsa65', 0)).toBe("m/44'/189189'/0'/0'/1'");
    expect(derivationPath('mldsa87', 3)).toBe("m/44'/189189'/3'/0'/0'");
    expect(() => canonicalAddressIndex('ml-dsa-44')).toThrow();
  });

  test('ML-DSA-87 HD addresses preserve official wallet recovery vectors', async () => {
    expect((await deriveAccountCore('mldsa87', PHRASE, 0)).address).toBe('qzm5QCox8Dp5A3oSXZZYHD8YoYgPz7enykZb6RPUropdCyN5h');
    expect((await deriveAccountCore('mldsa87', PHRASE, 1)).address).toBe('qzmufPopkLKAwDmTzR5uXg8GMp5sUP48CqafJLUz3fPMSSGSh');
    expect((await deriveAccountCore('mldsa87', 'human snow truck virus now jaguar wall brisk shoe craft gravity diesel', 0)).address)
      .toBe('qznQKhufTDfU3szAzfgCny7wMhxUN3qjEqneiRUNgC7MjSDyG');
    await expect(deriveAccountCore('mldsa87', PHRASE, -1)).rejects.toThrow();
    await expect(deriveAccountCore('mldsa87', PHRASE, 2147483648)).rejects.toThrow();
    await expect(deriveAccountCore('mldsa44' as WalletScheme, PHRASE, 0)).rejects.toThrow();
    const material = await deriveAccountCore('mldsa87', PHRASE, 0);
    expect(material.publicKey.length).toBe(2 + 2592 * 2);
    expect(Object.keys(material).sort()).toEqual(['address', 'publicKey']);
    // The legacy ML-DSA-87 entry point is unchanged.
    const legacy = accountFromMnemonic(PHRASE, 0, 0, 0);
    try {
      expect(legacy.scheme).toBe('ml-dsa-87');
      expect(legacy.address).toBe(material.address);
      expect(bytesToHex(legacy.publicKey)).toBe(material.publicKey);
    } finally { legacy.free(); }
  });

  test('ML-DSA-65 HD addresses use the official default path and differ from ML-DSA-87', async () => {
    // Frozen together with the native test `canonical_accounts_for_the_bridge_vectors`.
    const account65 = await deriveAccountCore('mldsa65', PHRASE, 0);
    expect(account65.address).toBe('qzoyC4eRTrexYoutXABVsf61QJZxJim3iWvayRQwEjXWgA4mw');
    expect(account65.publicKey.length).toBe(2 + 1952 * 2);
    expect(account65.address).not.toBe((await deriveAccountCore('mldsa87', PHRASE, 0)).address);
    // Explicit path components: the bridge derives account 0 at .../0'/1'.
    const explicit = accountFromMnemonicScheme('ml-dsa-65', PHRASE, 0, 0, 1);
    try {
      expect(explicit.scheme).toBe('ml-dsa-65');
      expect(explicit.address).toBe(account65.address);
      expect(bytesToHex(explicit.publicKey)).toBe(account65.publicKey);
    } finally { explicit.free(); }
    const otherPath = accountFromMnemonicScheme('ml-dsa-65', PHRASE, 0, 0, 0);
    try { expect(otherPath.address).not.toBe(account65.address); } finally { otherPath.free(); }
  });

  test('ML-DSA-65 keys match the official hdwallet crate golden vectors', () => {
    // qp-rusty-crystals-hdwallet 4.1.1 src/test_vectors_65.rs, public-key halves
    // identified by their first 32 bytes and blake2-256 digest.
    const vectors: [string, [number, number, number], string, `0x${string}`][] = [
      ['rocket primary way job input cactus submit menu zoo burger rent impose', [0, 0, 0],
        '46d51510251c9a7d6d54cb321551912d955689e461d0d1ea315dda6eb06b2299',
        '0x48339e7f6b33b659d79ff175c17d4ecf9f9fbaf5d1fbf59ad6f6cba3cccaf760'],
      ['legal winner thank year wave sausage worth useful legal winner thank yellow', [1, 0, 0],
        '96c7ff12899bf41397010714bb3e92afc5aa24e8553df70a08b930111d3330b1',
        '0x2f83ef7aada58aceb34b69f0155896b319daf3346f02715db6cf78d071c2ddd8'],
      ['abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', [0, 1, 0],
        'e0463cc8ffdb3f89395d1145238c95571b8ae0b2303586acf4f194d0f6a67f7a',
        '0xa4f4c0828d701311b0c7adc186c5d9cb64b93b957edd076cd5b49b733d20bf48'],
    ];
    for (const [mnemonic, [index, change, address], rho, digest] of vectors) {
      const handle = accountFromMnemonicScheme('ml-dsa-65', mnemonic, index, change, address);
      try {
        expect(handle.publicKey.length).toBe(1952);
        expect(bytesToHex(handle.publicKey.slice(0, 32))).toBe('0x' + rho);
        expect(blake2AsHex(handle.publicKey)).toBe(digest);
      } finally { handle.free(); }
    }
  });

  test('seed address matches current runtime CrystalAlice', () => {
    const handle = account(new Uint8Array(32));
    try {
      expect(handle.address).toBe('qzk1Nxai3dZD9Cn5kwGcgL6mKxsfxwqdis7kDQJ52aJS2vSn7');
      expect(handle.scheme).toBe('ml-dsa-87');
    } finally { handle.free(); }
  });

  test('mainnet spec 152 / tx 6 v4 envelope verifies and rejects tampering', async () => {
    const context: SignContext = {
      nonce: 0, genesisHash: GENESIS, blockHash: GENESIS, blockNumber: 0,
      period: 0, specVersion: 152, transactionVersion: 6, tip: '0',
    };
    const call = '0x020000' + '11'.repeat(32) + '04';
    const signed = await signCallCore('mldsa87', PHRASE, 0, call, context);
    const address = u8aToHex(decodeAddress('qzm5QCox8Dp5A3oSXZZYHD8YoYgPz7enykZb6RPUropdCyN5h', false, 189));
    const { signature, publicKey } = checkEnvelope('mldsa87', signed, call, address);
    // The ML-DSA-87 verifier entry point is unchanged.
    const payload = hexToBytes(call + '00000000' + '98000000' + '06000000' + GENESIS.slice(2) + GENESIS.slice(2) + '00');
    expect(verifySignature(publicKey, payload, signature)).toBe(true);
    payload[3] ^= 1;
    expect(verifySignature(publicKey, payload, signature)).toBe(false);
  });

  test('ML-DSA-65 v4 envelope uses signature variant 1 and verifies', async () => {
    const context: SignContext = {
      nonce: 0, genesisHash: GENESIS, blockHash: GENESIS, blockNumber: 0,
      period: 0, specVersion: 152, transactionVersion: 6, tip: '0',
    };
    const call = '0x020300' + '22'.repeat(32) + '04';
    const signed = await signCallCore('mldsa65', PHRASE, 0, call, context);
    const address = u8aToHex(decodeAddress('qzoyC4eRTrexYoutXABVsf61QJZxJim3iWvayRQwEjXWgA4mw', false, 189));
    checkEnvelope('mldsa65', signed, call, address);
    // Deterministic: signing the same payload twice yields identical bytes.
    expect(await signCallCore('mldsa65', PHRASE, 0, call, context)).toBe(signed);
    expect(hexToBytes(signed).length).toBe(hexToBytes(await signCallCore('mldsa87', PHRASE, 0, call, context)).length - (4627 + 2592 - 3309 - 1952));
  });
});
