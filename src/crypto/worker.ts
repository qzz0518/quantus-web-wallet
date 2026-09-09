import { deriveAccountCore, signCallCore } from './core';
import type { CryptoRequest, CryptoResponse } from './types';

// This worker processes one operation. No wallet material remains in a shared
// long-lived WASM instance. Signing makes no network requests.
self.onmessage = async (event: MessageEvent<CryptoRequest>) => {
  const request = event.data;
  let response: CryptoResponse;
  try {
    const result = request.method === 'derive'
      ? await deriveAccountCore(request.mnemonic, request.index)
      : await signCallCore(request.mnemonic, request.index, request.callHex, request.context);
    response = { ok: true, result };
  } catch {
    // Do not forward vendor error text; it could include a secret input.
    response = { ok: false, error: '钱包加密操作失败，请检查助记词和交易信息' };
  } finally {
    request.mnemonic = '';
  }
  self.postMessage(response);
  self.close();
};
