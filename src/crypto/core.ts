import init, { accountFromMnemonicScheme, signCallFromMnemonicScheme } from '../../vendor/quantus-wasm/browser/quantus_wasm.js';
import { SCHEMES, isWalletScheme } from './schemes';
import type { AccountPublic, SignContext, WalletScheme } from './types';

let initialization: Promise<unknown> | undefined;

/** The optional bytes are used by offline native/JS compatibility tests only. */
export function initializeWasm(bytes?: BufferSource): Promise<unknown> {
  return initialization ??= init(bytes ? { module_or_path: bytes } : undefined);
}

export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(hex)) throw new Error('无效的十六进制数据');
  return Uint8Array.from(hex.slice(2).match(/../g)!, (byte) => parseInt(byte, 16));
}

export function assertIndex(index: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index > 0x7fff_ffff) {
    throw new Error('钱包派生序号必须是 0 到 2147483647 的整数');
  }
}

function assertScheme(scheme: WalletScheme): void {
  if (!isWalletScheme(scheme)) throw new Error('不支持的账户签名方案');
}

export async function deriveAccountCore(scheme: WalletScheme, mnemonic: string, index: number): Promise<AccountPublic> {
  assertScheme(scheme);
  assertIndex(index);
  await initializeWasm();
  // Account is freed without reading its secretKey getter. Its Rust Drop wipes
  // the stored secret; the surrounding disposable worker also releases memory.
  const handle = accountFromMnemonicScheme(SCHEMES[scheme].wasmName, mnemonic, index, 0, SCHEMES[scheme].addressIndex);
  try {
    return { address: handle.address, publicKey: bytesToHex(handle.publicKey) };
  } finally {
    handle.free();
  }
}

export async function signCallCore(
  scheme: WalletScheme,
  mnemonic: string,
  index: number,
  callHex: string,
  context: SignContext,
): Promise<string> {
  assertScheme(scheme);
  assertIndex(index);
  const call = hexToBytes(callHex);
  if (call.length > 65536) throw new Error('交易数据过大');
  for (const field of ['nonce', 'blockNumber', 'period', 'specVersion', 'transactionVersion'] as const) {
    if (!Number.isSafeInteger(context[field]) || context[field] < 0) throw new Error('无效的交易上下文');
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(context.genesisHash) || !/^0x[0-9a-fA-F]{64}$/.test(context.blockHash)) {
    throw new Error('无效的链或区块哈希');
  }
  if (!/^\d+$/.test(context.tip) || BigInt(context.tip) > (1n << 128n) - 1n) throw new Error('无效的小费');
  await initializeWasm();
  return bytesToHex(signCallFromMnemonicScheme(
    SCHEMES[scheme].wasmName, mnemonic, call, context, index, 0, SCHEMES[scheme].addressIndex,
  ));
}
