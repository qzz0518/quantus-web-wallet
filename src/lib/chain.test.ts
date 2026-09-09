/// <reference types="bun" />
import { afterAll, describe, expect, test } from 'bun:test';
import { encodeAddress } from '@polkadot/util-crypto';
import { MAINNET, SubmissionError, createChainClient, explorerTransactionUrl, validateAddress } from './chain';
import type { TransferState } from './chain';

// Synthetic SS58 account used only by the local mock server.
const ADDRESS = encodeAddress(new Uint8Array(32).fill(1), 189);
const HASH = '0x' + '11'.repeat(32);
const servers: { stop(): unknown }[] = [];
afterAll(() => servers.forEach((server) => server.stop()));

function mockClient(handler: (body: { id: number; method: string; variables?: { address?: string; blocks?: string[]; limit?: number } }) => unknown) {
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(request) {
    const body = await request.json();
    return Response.json(handler(body));
  } });
  servers.push(server);
  return createChainClient({ ...MAINNET, rpcUrl: server.url.href, indexerUrl: server.url.href });
}

describe('Quantus chain boundaries', () => {
  test('rejects a valid address for another SS58 network and a damaged checksum', () => {
    expect(validateAddress('  ' + ADDRESS + '  ')).toBe(ADDRESS);
    expect(() => validateAddress(encodeAddress(new Uint8Array(32), 42))).toThrow();
    expect(() => validateAddress(ADDRESS.slice(0, -1) + '1')).toThrow();
    expect(() => validateAddress(HASH)).toThrow();
  });

  test('refuses to sign on an unexpected genesis or upgraded runtime', async () => {
    for (const kind of ['genesis', 'version']) {
      let submitted = false;
      const client = mockClient(({ id, method }) => {
        submitted ||= method === 'author_submitExtrinsic';
        const result = method === 'chain_getBlockHash'
          ? (kind === 'genesis' ? HASH : MAINNET.genesisHash)
          : { specVersion: kind === 'version' ? 153 : 152, transactionVersion: 6 };
        return { jsonrpc: '2.0', id, result };
      });
      await expect(client.submitTransfer('0x1234')).rejects.toThrow(kind === 'genesis' ? '网络不匹配' : '运行时已变更');
      expect(submitted).toBe(false);
    }
  });

  test('preserves amounts above Number.MAX_SAFE_INTEGER and reward rows without transaction hashes', async () => {
    const amount = '21000000000000000000';
    const client = mockClient(({ variables }) => {
      if (variables?.blocks) return { data: { rewards: [{ reward: amount, miner: { id: ADDRESS }, block: { hash: HASH } }] } };
      expect(variables?.address).toBe(ADDRESS);
      return { data: { transactions: [{ id: 'reward:123', detail_id: '123', type: 'IMMEDIATE', hash: null,
        block: { height: 123, hash: HASH }, timestamp: '2026-09-09T11:10:09Z', amount,
        fee: '0', status: 'SUCCESS', from: null, to: { id: ADDRESS } }] } };
    });
    const result = await client.readHistory(ADDRESS);
    expect(result[0].amount).toBe(amount);
    expect(result[0].hash).toBeNull();
    expect(result[0].from).toBeNull();
    expect(result[0].type).toBe('MINER_REWARD');
    expect(result[0].sourceType).toBe('IMMEDIATE');
    expect(explorerTransactionUrl(result[0])).toBe('https://explorer.quantus.com/transactions/123');
  });

  test('rejects lossy numeric indexer amounts instead of showing a rounded balance', async () => {
    const client = mockClient(({ variables }) => variables?.blocks ? { data: { rewards: [] } } : ({ data: { transactions: [{ id: '1', type: 'IMMEDIATE', hash: null,
      block: { height: 1, hash: HASH }, timestamp: '2026-09-09T11:10:09Z', amount: 21000000000000000000,
      fee: '0', status: 'SUCCESS', from: null, to: { id: ADDRESS } }] } }));
    await expect(client.readHistory(ADDRESS)).rejects.toThrow('无效的金额');
  });

  test('does not mislabel a hashless treasury or genesis credit as mined income', async () => {
    const client = mockClient(({ variables }) => variables?.blocks ? { data: { rewards: [] } } : {
      data: { transactions: [{ id: 'genesis:123', detail_id: '123', type: 'IMMEDIATE', hash: null,
        block: { height: 123, hash: HASH }, timestamp: '2026-09-09T11:10:09Z', amount: '1000000000000',
        fee: '0', status: 'SUCCESS', from: null, to: { id: ADDRESS } }] },
    });
    const result = await client.readHistory(ADDRESS);
    expect(result[0].type).toBe('NETWORK_REWARD');
    expect(result[0].sourceType).toBe('IMMEDIATE');
  });

  test('public Wormhole information never claims an unspent balance from absent indexer records', async () => {
    const client = mockClient(({ variables }) => {
      expect(variables?.limit).toBe(26);
      return { data: { deposits: [], stats: null } };
    });
    const info = await client.readWormholeInfo(ADDRESS);
    expect(info.unspentBalance).toBeNull();
    expect(info.indexedMiningRewards).toBeNull();
    expect(info.indexedMinedBlocks).toBeNull();
    expect(info.deposits).toEqual([]);
    expect(info.hasMore).toBe(false);
  });

  test('a confirmation timeout remains unknown and never becomes a success', async () => {
    const states: TransferState[] = [];
    const client = mockClient(() => { throw new Error('A zero timeout must not access the network'); });
    const result = await client.trackTransfer(HASH, 1, (state) => states.push(state), { timeoutMs: 0 });
    expect(result.status).toBe('unknown');
    expect(states.map((state) => state.status)).toEqual(['pending', 'unknown']);
  });

  test('invalid and overflowing transfer amounts are rejected before any network access', async () => {
    const client = mockClient(() => { throw new Error('Invalid amounts must not access the network'); });
    for (const amount of ['0', '-1', '1.5', '1e12', (1n << 128n).toString()]) {
      await expect(client.prepareTransfer(ADDRESS, ADDRESS, amount)).rejects.toThrow();
    }
  });

  test('distinguishes explicit RPC rejection from an uncertain submission and preserves the locally computed hash', async () => {
    for (const status of ['rejected', 'unknown'] as const) {
      const client = mockClient(({ id, method }) => {
        if (method === 'chain_getBlockHash') return { id, result: MAINNET.genesisHash };
        if (method === 'state_getRuntimeVersion') return { id, result: { specVersion: 152, transactionVersion: 6 } };
        return status === 'rejected' ? { id, error: { message: 'Invalid Transaction: Payment' } } : { id: id + 1, result: HASH };
      });
      try { await client.submitTransfer('0x1234'); throw new Error('Expected rejection'); }
      catch (error) {
        expect(error).toBeInstanceOf(SubmissionError);
        expect((error as SubmissionError).submissionStatus).toBe(status);
        expect((error as SubmissionError).transactionHash).toMatch(/^0x[\da-f]{64}$/);
      }
    }
  });
});
