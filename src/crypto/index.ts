import { generateMnemonic as bip39Generate, validateMnemonic as bip39Validate } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import type { AccountPublic, CryptoRequest, CryptoResponse, SignContext } from './types';

export type { AccountPublic, SignContext } from './types';

export const WALLET_SCHEME = 'ML-DSA-87' as const;
export const DERIVATION_PATH = "m/44'/189189'/<index>'/0'/0'";

export function normalizeMnemonic(phrase: string): string {
  return phrase.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
}

/** 256 bits from Web Crypto, encoded as a 24-word English BIP39 phrase. */
export async function generateMnemonic(): Promise<string> {
  return bip39Generate(wordlist, 256);
}

export function validateMnemonic(phrase: string): boolean {
  try { return bip39Validate(normalizeMnemonic(phrase), wordlist); } catch { return false; }
}

function checkedMnemonic(phrase: string): string {
  const normalized = normalizeMnemonic(phrase);
  if (!validateMnemonic(normalized)) throw new Error('助记词无效，请检查单词、顺序和数量');
  return normalized;
}

function inWorker<T extends AccountPublic | string>(request: CryptoRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('钱包加密操作超时，请重试'));
    }, 45_000);
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onmessage = (event: MessageEvent<CryptoResponse>) => {
      finish();
      if (event.data.ok) resolve(event.data.result as T);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
      reject(new Error('无法加载本地签名组件，请刷新页面重试'));
    };
    worker.postMessage(request);
    request.mnemonic = '';
  });
}

export async function deriveAccount(mnemonic: string, index: number): Promise<AccountPublic> {
  return inWorker({ method: 'derive', mnemonic: checkedMnemonic(mnemonic), index });
}

export async function signCall(
  mnemonic: string,
  index: number,
  callHex: string,
  context: SignContext,
): Promise<string> {
  return inWorker({ method: 'sign', mnemonic: checkedMnemonic(mnemonic), index, callHex, context });
}
