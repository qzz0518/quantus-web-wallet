import { generateMnemonic as bip39Generate, validateMnemonic as bip39Validate } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { t } from '../lib/i18n';
import type {
  AccountPublic, CryptoRequest, CryptoResponse, CryptoResult, SignContext, WalletScheme, WormholeBranch, WormholeNullifierInput,
} from './types';

export type { AccountPublic, SignContext, WalletScheme, WormholeBranch, WormholeNullifierInput } from './types';
export { DEFAULT_SCHEME, SCHEMES, WALLET_SCHEMES, derivationPath, isWalletScheme, schemeLabel } from './schemes';

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
  if (!validateMnemonic(normalized)) throw new Error(t('助记词无效，请检查单词、顺序和数量'));
  return normalized;
}

function inWorker<T extends CryptoResult>(request: CryptoRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error(t('钱包加密操作超时，请重试')));
    }, 45_000);
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onmessage = (event: MessageEvent<CryptoResponse>) => {
      finish();
      if (event.data.ok) resolve(event.data.result as T);
      // Worker messages are Chinese source strings; translate them by dictionary lookup.
      else reject(new Error(t(event.data.error)));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
      reject(new Error(t('无法加载本地签名组件，请刷新页面重试')));
    };
    worker.postMessage(request);
    request.mnemonic = '';
  });
}

/** `index` is the hardened account component; the scheme fixes the last path component. */
export async function deriveAccount(scheme: WalletScheme, mnemonic: string, index: number): Promise<AccountPublic> {
  return inWorker({ method: 'derive', scheme, mnemonic: checkedMnemonic(mnemonic), index });
}

export async function signCall(
  scheme: WalletScheme,
  mnemonic: string,
  index: number,
  callHex: string,
  context: SignContext,
): Promise<string> {
  return inWorker({ method: 'sign', scheme, mnemonic: checkedMnemonic(mnemonic), index, callHex, context });
}

/**
 * Wormhole (encrypted account) addresses `start..start + count` on `branch`
 * (0 = receiving, 1 = change). Derived inside the disposable worker; only
 * public SS58 strings return.
 */
export async function deriveWormholeAddresses(
  mnemonic: string,
  branch: WormholeBranch,
  start: number,
  count: number,
): Promise<string[]> {
  return inWorker({ method: 'wormholeAddresses', mnemonic: checkedMnemonic(mnemonic), branch, start, count });
}

/** Nullifiers (0x hex) of the given deposits, in input order; secrets stay in the worker. */
export async function computeWormholeNullifiers(
  mnemonic: string,
  inputs: WormholeNullifierInput[],
): Promise<string[]> {
  if (!inputs.length) return [];
  return inWorker({ method: 'wormholeNullifiers', mnemonic: checkedMnemonic(mnemonic), inputs });
}
