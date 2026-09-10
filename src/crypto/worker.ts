import { computeWormholeNullifiersCore, deriveAccountCore, deriveWormholeAddressesCore, signCallCore } from './core';
import type { CryptoRequest, CryptoResponse, CryptoResult } from './types';

function run(request: CryptoRequest): Promise<CryptoResult> {
  switch (request.method) {
    case 'derive': return deriveAccountCore(request.scheme, request.mnemonic, request.index);
    case 'sign': return signCallCore(request.scheme, request.mnemonic, request.index, request.callHex, request.context);
    case 'wormholeAddresses': return deriveWormholeAddressesCore(request.mnemonic, request.branch, request.start, request.count);
    case 'wormholeNullifiers': return computeWormholeNullifiersCore(request.mnemonic, request.inputs);
  }
}

// This worker processes one operation. No wallet material remains in a shared
// long-lived WASM instance. Signing makes no network requests.
self.onmessage = async (event: MessageEvent<CryptoRequest>) => {
  const request = event.data;
  let response: CryptoResponse;
  try {
    response = { ok: true, result: await run(request) };
  } catch {
    // Do not forward vendor error text; it could include a secret input.
    response = { ok: false, error: '钱包加密操作失败，请检查助记词和交易信息' };
  } finally {
    request.mnemonic = '';
  }
  self.postMessage(response);
  self.close();
};
