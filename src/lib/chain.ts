import { ApiPromise, HttpProvider } from '@polkadot/api';
import { hexToU8a } from '@polkadot/util';
import { blake2AsHex, decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import type { EventRecord } from '@polkadot/types/interfaces';
import { t } from './i18n';

export const MAINNET = Object.freeze({
  rpcUrl: 'https://rpc1-mainnet.quantus.com',
  indexerUrl: 'https://subsquid-mainnet-app-1.quantus.com/v1/graphql',
  explorerUrl: 'https://explorer.quantus.com',
  genesisHash: '0xfb5487c0be6ae4ade2d41d16e50465129861636c2b8d61fa94d7a19631626fba',
  specVersion: 152,
  transactionVersion: 6,
  ss58Prefix: 189,
  decimals: 12,
  symbol: 'QTC',
});

export interface Balance {
  free: string;
  reserved: string;
  frozen: string;
  spendable: string;
  block: number;
}

export interface NetworkState {
  block: number;
  finalized: number;
  specVersion: number;
  transactionVersion: number;
  peers: number;
}

export interface Transaction {
  id: string;
  detailId?: string;
  type: string;
  /** Original indexer type, retained when a hashless row is classified as a reward. */
  sourceType?: string;
  hash: string | null;
  block: number;
  blockHash: string;
  timestamp: string;
  amount: string;
  fee: string;
  status: string;
  from: string | null;
  to: string | null;
}

export interface WormholeDeposit {
  id: string;
  amount: string;
  block: number;
  blockHash: string;
  timestamp: string;
  from: string | null;
  leafIndex: string | null;
  transferCount: string | null;
}

export interface WormholeInfo {
  /** Spending requires secret-derived nullifiers; a public address cannot reveal this. */
  unspentBalance: null;
  deposits: WormholeDeposit[];
  receivedInPage: string;
  hasMore: boolean;
  indexedMinedBlocks: number | null;
  indexedMiningRewards: string | null;
}

export interface SigningContext {
  nonce: number;
  genesisHash: string;
  blockHash: string;
  blockNumber: number;
  period: number;
  specVersion: number;
  transactionVersion: number;
  tip: string;
}

export interface PreparedTransfer {
  callHex: string;
  ctx: SigningContext;
  existentialDeposit: string;
}

/** A transfer the chain holds and executes later, until the sender cancels it. */
export interface ScheduledTransfer {
  txId: string;
  from: string;
  to: string;
  amount: string;
  /** Block the chain will execute it in, when a source knows it. */
  executeAt: number | null;
  /** Block it was submitted in. */
  submittedAt: number | null;
  timestamp: string | null;
}

export interface ScheduledTransfers {
  block: number;
  transfers: ScheduledTransfer[];
}

/** What the chain assigned to a scheduled transfer at the moment it accepted it. */
export interface ScheduledReceipt {
  txId: string;
  executeAt: number;
}

export type TransferStatus = 'pending' | 'included' | 'finalized' | 'failed' | 'retracted' | 'unknown' | 'expired';

export interface TransferState {
  status: TransferStatus;
  hash: string;
  block?: number;
  blockHash?: string;
  error?: string;
}

export interface TrackOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Must match the period used when signing. */
  period?: number;
}

export class SubmissionError extends Error {
  constructor(message: string, public readonly transactionHash: string, public readonly submissionStatus: 'rejected' | 'unknown') {
    super(message);
    this.name = 'SubmissionError';
  }
}

class RpcRejection extends Error {}

interface ChainConfig {
  rpcUrl: string;
  indexerUrl: string;
  genesisHash: string;
  specVersion: number;
  transactionVersion: number;
}

interface RpcHeader { number: string }
interface RuntimeVersion { specVersion: number; transactionVersion: number }
interface RawBlock { block: { extrinsics: string[] } }
interface AccountData {
  data: { free: { toString(): string }; reserved: { toString(): string }; frozen: { toString(): string } };
}

const HEX_32 = /^0x[\da-f]{64}$/i;
const U128_MAX = (1n << 128n) - 1n;
const HISTORY_PAGE_SIZE = 25;
const REVERSIBLE_PALLET = 'ReversibleTransfers';
/** `MinDelayPeriodBlocks` in the mainnet runtime; a shorter delay is rejected. */
export const MIN_DELAY_BLOCKS = 2;
/** A year of blocks: beyond this the wallet refuses rather than scheduling a transfer nobody will see through. */
export const MAX_DELAY_BLOCKS = 2_600_000;

type Decorated = Awaited<ReturnType<ApiPromise['at']>>;
type CallArguments = { callIndex: Uint8Array; args: Record<string, unknown> };

/**
 * The two-byte call index of `pallet.call` in the given metadata. Indices are
 * looked up by name every time: a runtime that renumbers its pallets must not
 * be handed a call built for the old numbering.
 */
export function findCall(at: Pick<Decorated, 'registry'>, palletName: string, callName: string, unsupported: string): Uint8Array {
  const pallet = at.registry.metadata.pallets.find((entry) => entry.name.toString() === palletName);
  const calls = pallet?.calls.isSome ? pallet.calls.unwrap() : undefined;
  const variant = calls && at.registry.lookup.getSiType(calls.type).def.asVariant.variants
    .find((entry) => entry.name.toString() === callName);
  if (!pallet || !variant) throw new Error(unsupported);
  return new Uint8Array([pallet.index.toNumber(), variant.index.toNumber()]);
}

export function validateAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed || trimmed.startsWith('0x')) throw new Error(t('请输入 Quantus 地址（SS58 前缀 189）。'));
  try {
    const publicKey = decodeAddress(trimmed, false, MAINNET.ss58Prefix);
    if (publicKey.length !== 32) throw new Error('Invalid account length');
    const canonical = encodeAddress(publicKey, MAINNET.ss58Prefix);
    if (canonical !== trimmed) throw new Error('Noncanonical address');
    return canonical;
  } catch {
    throw new Error(t('地址格式或校验码无效，请使用 Quantus 地址（SS58 前缀 189）。'));
  }
}

function integerAmount(value: unknown): string {
  // Hasura returns numeric balances as strings. Never coerce an unsafe JSON number.
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(t('服务返回了无效的金额。'));
  return BigInt(value).toString();
}

function safeInteger(value: unknown, invalid: string): number {
  const number = typeof value === 'string' && /^(0x[\da-f]+|\d+)$/i.test(value) ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) throw new Error(invalid);
  return number;
}

function hash32(value: unknown): string {
  if (typeof value !== 'string' || !HEX_32.test(value)) throw new Error(t('服务返回了无效的区块或交易哈希。'));
  return value.toLowerCase();
}

function signedTransaction(value: string): string {
  if (!/^0x(?:[\da-f]{2})+$/i.test(value) || value.length > 100_000) throw new Error(t('签名交易格式无效。'));
  return value;
}

function aborted(): DOMException { return new DOMException(t('已停止查询交易状态。'), 'AbortError'); }

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    const onAbort = () => { clearTimeout(timer); reject(aborted()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** API endpoints are configured by the application, never taken from wallet backups or URL parameters. */
export function createChainClient(config: ChainConfig = MAINNET) {
  let apiPromise: Promise<ApiPromise> | undefined;
  let requestId = 0;

  async function request<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(20_000);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(t('网络服务暂不可用（HTTP {0}）。', response.status));
    return await response.json() as T;
  }

  async function rpc<T>(method: string, params: unknown[] = [], signal?: AbortSignal): Promise<T> {
    const id = ++requestId;
    const reply = await request<{ id: number; result?: T; error?: { message?: string } }>(config.rpcUrl, {
      jsonrpc: '2.0', id, method, params,
    }, signal);
    if (reply.id !== id) throw new Error(t('RPC 响应编号不匹配。'));
    if (reply.error) throw new RpcRejection(reply.error.message || t('节点拒绝了请求。'));
    if (!Object.prototype.hasOwnProperty.call(reply, 'result')) throw new Error(t('RPC 响应不完整。'));
    return reply.result as T;
  }

  function getApi(): Promise<ApiPromise> {
    apiPromise ??= ApiPromise.create({
      provider: new HttpProvider(config.rpcUrl),
      noInitWarn: true,
      throwOnConnect: true,
      // Difficulty is only displayed as opaque bytes; do not let its 512-bit type
      // prevent decoding the unrelated System account and event structures.
      types: { U512: '[u8;64]' },
    }).then(async (api) => {
      if (api.genesisHash.toHex().toLowerCase() !== config.genesisHash.toLowerCase()) {
        await api.disconnect();
        throw new Error(t('RPC 网络不匹配，已停止读取和签名。'));
      }
      return api;
    }).catch((error: unknown) => { apiPromise = undefined; throw error; });
    return apiPromise;
  }

  async function assertNetwork(forSigning = false): Promise<RuntimeVersion> {
    const [genesis, version] = await Promise.all([
      rpc<string>('chain_getBlockHash', [0]), rpc<RuntimeVersion>('state_getRuntimeVersion'),
    ]);
    if (hash32(genesis) !== config.genesisHash.toLowerCase()) throw new Error(t('RPC 网络不匹配，已停止操作。'));
    const specVersion = safeInteger(version.specVersion, t('运行时版本 无效。'));
    const transactionVersion = safeInteger(version.transactionVersion, t('交易版本 无效。'));
    if (forSigning && (specVersion !== config.specVersion || transactionVersion !== config.transactionVersion)) {
      throw new Error(t('主网运行时已变更（{0}/{1}），请更新钱包后转账。', specVersion, transactionVersion));
    }
    return { specVersion, transactionVersion };
  }

  async function readNetwork(): Promise<NetworkState> {
    const [version, head, finalizedHash, health] = await Promise.all([
      assertNetwork(), rpc<RpcHeader>('chain_getHeader'), rpc<string>('chain_getFinalizedHead'),
      rpc<{ peers: number }>('system_health'),
    ]);
    const finalized = await rpc<RpcHeader>('chain_getHeader', [hash32(finalizedHash)]);
    return { block: safeInteger(head.number, t('区块高度 无效。')), finalized: safeInteger(finalized.number, t('最终确认高度 无效。')),
      ...version, peers: safeInteger(health.peers, t('连接节点数 无效。')) };
  }

  async function readBalance(address: string): Promise<Balance> {
    const canonical = validateAddress(address);
    const api = await getApi();
    const headHash = hash32(await rpc<string>('chain_getBlockHash'));
    const [head, info] = await Promise.all([
      rpc<RpcHeader>('chain_getHeader', [headHash]), api.query.system.account.at(headHash, canonical),
    ]);
    const { data } = info as unknown as AccountData;
    const free = integerAmount(data.free.toString());
    const reserved = integerAmount(data.reserved.toString());
    const frozen = integerAmount(data.frozen.toString());
    const spendable = BigInt(free) > BigInt(frozen) ? BigInt(free) - BigInt(frozen) : 0n;
    return { free, reserved, frozen, spendable: spendable.toString(), block: safeInteger(head.number, t('区块高度 无效。')) };
  }

  async function readHistory(address: string, offset = 0): Promise<Transaction[]> {
    const canonical = validateAddress(address);
    safeInteger(offset, t('分页位置 无效。'));
    type IndexedTransaction = {
      id: string; detail_id: string; type: string; hash: string | null; block: { height: number; hash: string };
      timestamp: string; amount: string; fee: string | null; status: string;
      from: { id: string } | null; to: { id: string } | null;
    };
    const result = await request<{ data?: { transactions: IndexedTransaction[] }; errors?: { message: string }[] }>(config.indexerUrl, {
      query: `query WalletHistory($address: String!, $offset: Int!, $limit: Int!) {
        transactions: unified_transaction(
          limit: $limit, offset: $offset, order_by: [{timestamp: desc}, {id: desc}],
          where: {_or: [{from: {id: {_eq: $address}}}, {to: {id: {_eq: $address}}}]}
        ) { id detail_id type hash block { height hash } timestamp amount fee status from { id } to { id } }
      }`,
      variables: { address: canonical, offset, limit: HISTORY_PAGE_SIZE },
    });
    if (result.errors?.length || !Array.isArray(result.data?.transactions)) throw new Error(t('交易索引暂不可用，请稍后重试或打开区块浏览器。'));
    const rows = result.data.transactions;
    // Upstream excludes hashless IMMEDIATE rows as miner/treasury rewards.
    // Match the dedicated MinerRewarded index to avoid mislabelling genesis or
    // treasury credits as mining. At most one reward exists per requested block.
    const candidateBlocks = [...new Set(rows.filter((row) => row.type === 'IMMEDIATE' && row.hash === null).map((row) => row.block.hash))];
    type IndexedReward = { reward: string; miner: { id: string }; block: { hash: string } };
    let rewards: IndexedReward[] = [];
    if (candidateBlocks.length) {
      const rewardReply = await request<{ data?: { rewards: IndexedReward[] }; errors?: unknown[] }>(config.indexerUrl, {
        query: `query WalletRewardTypes($blocks: [String!]!, $limit: Int!) {
          rewards: miner_reward(limit: $limit, where: {block: {hash: {_in: $blocks}}}) {
            reward miner { id } block { hash }
          }
        }`, variables: { blocks: candidateBlocks, limit: HISTORY_PAGE_SIZE },
      });
      if (rewardReply.errors?.length || !Array.isArray(rewardReply.data?.rewards)) throw new Error(t('奖励索引暂不可用，请稍后重试。'));
      rewards = rewardReply.data.rewards;
    }
    return rows.map((row) => {
      if (typeof row.id !== 'string' || typeof row.type !== 'string' || typeof row.status !== 'string' ||
          !Number.isFinite(Date.parse(row.timestamp))) throw new Error(t('交易索引返回了无效的数据。'));
      const hashlessReward = row.type === 'IMMEDIATE' && row.hash === null;
      const mined = hashlessReward && rewards.some((reward) => reward.block.hash === row.block.hash &&
        reward.miner.id === row.to?.id && integerAmount(reward.reward) === integerAmount(row.amount));
      return {
        id: row.id, detailId: row.detail_id, sourceType: row.type,
        type: mined ? 'MINER_REWARD' : hashlessReward ? 'NETWORK_REWARD' : row.type,
        hash: row.hash ? hash32(row.hash) : null,
        block: safeInteger(row.block.height, t('交易高度 无效。')), blockHash: hash32(row.block.hash),
        timestamp: row.timestamp, amount: integerAmount(row.amount), fee: row.fee === null ? '0' : integerAmount(row.fee),
        status: row.status, from: row.from?.id ?? null, to: row.to?.id ?? null,
      };
    });
  }

  /** Public deposits and indexed mining totals only; never an unspent/private balance. */
  async function readWormholeInfo(address: string): Promise<WormholeInfo> {
    const canonical = validateAddress(address);
    type IndexedDeposit = {
      id: string; amount: string; timestamp: string; block: { height: number; hash: string };
      from: { id: string } | null; leaf_index: string | number | null; transfer_count: string | number | null;
    };
    const result = await request<{ data?: {
      deposits: IndexedDeposit[];
      stats: { total_mined_blocks: number; total_rewards: string } | null;
    }; errors?: unknown[] }>(config.indexerUrl, {
      query: `query WalletPublicWormholeInfo($address: String!, $limit: Int!) {
        deposits: transfer(limit: $limit, order_by: [{block: {height: desc}}, {id: desc}],
          where: {to: {id: {_eq: $address}}}) {
          id amount timestamp leaf_index transfer_count block {height hash} from {id}
        }
        stats: account_stats_by_pk(id: $address) {total_mined_blocks total_rewards}
      }`, variables: { address: canonical, limit: HISTORY_PAGE_SIZE + 1 },
    });
    if (result.errors?.length || !Array.isArray(result.data?.deposits)) throw new Error(t('Wormhole 公开入账索引暂不可用。'));
    const rows = result.data.deposits;
    const counter = (value: string | number | null): string | null => value === null ? null :
      typeof value === 'number' ? safeInteger(value, t('入账索引 无效。')).toString() : integerAmount(value);
    const deposits = rows.slice(0, HISTORY_PAGE_SIZE).map((row): WormholeDeposit => {
      if (typeof row.id !== 'string' || !Number.isFinite(Date.parse(row.timestamp))) throw new Error(t('Wormhole 入账索引数据无效。'));
      return { id: row.id, amount: integerAmount(row.amount), timestamp: row.timestamp,
        block: safeInteger(row.block.height, t('入账高度 无效。')), blockHash: hash32(row.block.hash), from: row.from?.id ?? null,
        leafIndex: counter(row.leaf_index), transferCount: counter(row.transfer_count) };
    });
    return { unspentBalance: null, deposits,
      receivedInPage: deposits.reduce((total, deposit) => total + BigInt(deposit.amount), 0n).toString(),
      hasMore: rows.length > HISTORY_PAGE_SIZE,
      indexedMinedBlocks: result.data.stats ? safeInteger(result.data.stats.total_mined_blocks, t('已索引挖矿区块数 无效。')) : null,
      indexedMiningRewards: result.data.stats ? integerAmount(result.data.stats.total_rewards) : null,
    };
  }

  /**
   * Signing context plus one call built from the checkpoint's own metadata.
   * `build` receives that metadata so pallet and call indices are always the
   * ones the runtime at the checkpoint uses; nothing here is written down.
   */
  async function prepareCall(address: string, build: (at: Decorated) => CallArguments): Promise<PreparedTransfer> {
    const from = validateAddress(address);
    const [api, version, nonce, blockHash] = await Promise.all([
      getApi(), assertNetwork(true), rpc<number | string>('system_accountNextIndex', [from]), rpc<string>('chain_getBlockHash'),
    ]);
    const checkpoint = hash32(blockHash);
    const head = await rpc<RpcHeader>('chain_getHeader', [checkpoint]);
    // The checkpoint runtime determines the metadata and encoded call. Refuse a
    // runtime upgrade race instead of pairing old call indices with a new context.
    const [at, checkpointVersion] = await Promise.all([api.at(checkpoint), rpc<RuntimeVersion>('state_getRuntimeVersion', [checkpoint])]);
    if (checkpointVersion.specVersion !== version.specVersion ||
        checkpointVersion.transactionVersion !== version.transactionVersion) throw new Error(t('网络正在升级，请稍后重新准备交易。'));
    // Build only the Call: Polkadot.js ExtrinsicV4 cannot represent Quantus’s
    // 7,219-byte signature field. The official WASM creates the signed envelope.
    const call = at.registry.createType('Call', build(at));
    const existentialDeposit = integerAmount(at.consts.balances.existentialDeposit.toString());
    return { callHex: call.toHex(), existentialDeposit, ctx: {
      nonce: safeInteger(nonce, t('账户序号 无效。')), genesisHash: config.genesisHash, blockHash: checkpoint,
      blockNumber: safeInteger(head.number, t('区块高度 无效。')), period: 64,
      ...version, tip: '0',
    } };
  }

  function transferAmount(amount: string): bigint {
    const planck = BigInt(integerAmount(amount));
    if (planck <= 0n || planck > U128_MAX) throw new Error(t('转账金额必须大于 0 且在有效范围内。'));
    return planck;
  }

  async function prepareTransfer(address: string, to: string, amount: string): Promise<PreparedTransfer> {
    const recipient = validateAddress(to);
    const planck = transferAmount(amount);
    return prepareCall(address, (at) => ({
      callIndex: findCall(at, 'Balances', 'transfer_keep_alive', t('当前网络不支持所需的保留账户转账。')),
      args: { dest: recipient, value: planck.toString() },
    }));
  }

  /**
   * A transfer the chain executes only after `delayBlocks` blocks. Until then
   * the amount is held on the sender's account and the sender can cancel it.
   */
  async function prepareScheduledTransfer(address: string, to: string, amount: string, delayBlocks: number): Promise<PreparedTransfer> {
    const recipient = validateAddress(to);
    const planck = transferAmount(amount);
    const delay = safeInteger(delayBlocks, t('延迟区块数 无效。'));
    if (delay < MIN_DELAY_BLOCKS || delay > MAX_DELAY_BLOCKS) throw new Error(t('延迟区块数必须在 {0} 和 {1} 之间。', MIN_DELAY_BLOCKS, MAX_DELAY_BLOCKS));
    return prepareCall(address, (at) => ({
      callIndex: findCall(at, REVERSIBLE_PALLET, 'schedule_transfer_with_delay', t('当前网络不支持延时转账。')),
      // The delay is an enum in the runtime; its variant name comes from the
      // metadata type, and only the block-number form is used here.
      args: { dest: recipient, amount: planck.toString(), delay: { BlockNumber: delay } },
    }));
  }

  /** Takes back a scheduled transfer that has not executed yet; the chain charges no fee for it. */
  async function prepareCancelScheduled(address: string, txId: string): Promise<PreparedTransfer> {
    const id = hash32(txId);
    return prepareCall(address, (at) => ({
      callIndex: findCall(at, REVERSIBLE_PALLET, 'cancel', t('当前网络不支持撤回延时转账。')),
      args: { tx_id: id },
    }));
  }

  /**
   * The scheduled transfers this account can still cancel. The chain is the
   * truth about which ones exist; the indexer only adds when each was
   * submitted and when it is due, which the storage item does not carry.
   */
  async function readScheduledTransfers(address: string): Promise<ScheduledTransfers> {
    const canonical = validateAddress(address);
    const api = await getApi();
    const headHash = hash32(await rpc<string>('chain_getBlockHash'));
    const [head, at] = await Promise.all([rpc<RpcHeader>('chain_getHeader', [headHash]), api.at(headHash)]);
    const block = safeInteger(head.number, t('区块高度 无效。'));
    const ids = (await at.query.reversibleTransfers.pendingTransfersBySender(canonical)).toJSON() as unknown;
    const txIds = (Array.isArray(ids) ? ids : []).map((id) => hash32(id as string));
    if (!txIds.length) return { block, transfers: [] };
    const details = await at.query.reversibleTransfers.pendingTransfers.multi(txIds);
    const schedule = await readScheduleTimes(txIds);
    const transfers = txIds.flatMap((txId, position): ScheduledTransfer[] => {
      const detail = details[position].toJSON() as { from?: string; to?: string; amount?: string | number } | null;
      if (!detail?.to || detail.amount === undefined) return [];
      const timing = schedule.get(txId);
      return [{
        txId,
        from: encodeAddress(decodeAddress(detail.from ?? canonical), MAINNET.ss58Prefix),
        to: encodeAddress(decodeAddress(detail.to), MAINNET.ss58Prefix),
        amount: BigInt(detail.amount).toString(),
        executeAt: timing?.executeAt ?? null,
        submittedAt: timing?.submittedAt ?? null,
        timestamp: timing?.timestamp ?? null,
      }];
    });
    return { block, transfers };
  }

  /** Submission and due block per transaction id, as far as the indexer knows them. */
  async function readScheduleTimes(txIds: string[]): Promise<Map<string, { executeAt: number | null; submittedAt: number | null; timestamp: string | null }>> {
    type Row = { tx_id: string; scheduled_at: number | string | null; timestamp: string | null; block: { height: number } | null };
    const result = await request<{ data?: { rows: Row[] }; errors?: unknown[] }>(config.indexerUrl, {
      query: `query ScheduledReversibleTransfers($ids: [String!]!, $limit: Int!) {
        rows: scheduled_reversible_transfer(limit: $limit, where: {tx_id: {_in: $ids}}) {
          tx_id scheduled_at timestamp block { height }
        }
      }`, variables: { ids: txIds, limit: txIds.length },
    }).catch(() => ({ data: undefined, errors: [1] }));
    const map = new Map<string, { executeAt: number | null; submittedAt: number | null; timestamp: string | null }>();
    if (result.errors?.length || !Array.isArray(result.data?.rows)) return map;
    for (const row of result.data.rows) {
      if (typeof row.tx_id !== 'string' || !HEX_32.test(row.tx_id)) continue;
      const submittedAt = typeof row.block?.height === 'number' && Number.isSafeInteger(row.block.height) ? row.block.height : null;
      const due = typeof row.scheduled_at === 'string' || typeof row.scheduled_at === 'number' ? Number(row.scheduled_at) : NaN;
      map.set(row.tx_id.toLowerCase(), {
        // A due block at or before submission would be a misread field, not a transfer.
        executeAt: Number.isSafeInteger(due) && (submittedAt === null || due > submittedAt) ? due : null,
        submittedAt,
        timestamp: typeof row.timestamp === 'string' && Number.isFinite(Date.parse(row.timestamp)) ? row.timestamp : null,
      });
    }
    return map;
  }

  /**
   * The transaction id and due block the chain assigned to a scheduled
   * transfer, read from the events of the block that included it. This is the
   * only place both are known immediately; the storage item carries neither.
   */
  async function readScheduledReceipt(transactionHash: string, blockHash: string): Promise<ScheduledReceipt | null> {
    const wanted = hash32(transactionHash);
    const at = hash32(blockHash);
    const api = await getApi();
    const block = await rpc<RawBlock>('chain_getBlock', [at]);
    const extrinsicIndex = block.block.extrinsics.findIndex((bytes) => blake2AsHex(hexToU8a(bytes)) === wanted);
    if (extrinsicIndex < 0) return null;
    const decorated = await api.at(at);
    const events = await decorated.query.system.events() as unknown as EventRecord[];
    const scheduled = events.find(({ phase, event }) => phase.isApplyExtrinsic &&
      phase.asApplyExtrinsic.toNumber() === extrinsicIndex &&
      event.section === 'reversibleTransfers' && event.method === 'TransactionScheduled');
    if (!scheduled) return null;
    const data = scheduled.event.data.toJSON() as unknown[];
    const names = scheduled.event.meta.fields.map((field) => field.name.toString());
    const value = (name: string) => data[names.indexOf(name)];
    const txId = value('tx_id');
    const executeAt = value('execute_at') as { blockNumber?: number } | number | null;
    const height = typeof executeAt === 'number' ? executeAt : executeAt?.blockNumber;
    if (typeof txId !== 'string' || !HEX_32.test(txId) || !Number.isSafeInteger(height)) return null;
    return { txId: txId.toLowerCase(), executeAt: height as number };
  }

  async function estimateFee(signedHex: string): Promise<string> {
    await assertNetwork(true);
    const info = await rpc<{ partialFee: string }>('payment_queryInfo', [signedTransaction(signedHex)]);
    return integerAmount(info.partialFee);
  }

  async function submitTransfer(signedHex: string): Promise<string> {
    await assertNetwork(true);
    const expectedHash = blake2AsHex(hexToU8a(signedTransaction(signedHex)));
    let returnedHash: string;
    try {
      returnedHash = hash32(await rpc<string>('author_submitExtrinsic', [signedHex]));
    } catch (error) {
      // Transport failures may happen after the node accepted the transaction.
      // The caller can track this known local hash; do not advise blindly resending.
      const message = error instanceof Error ? error.message : t('提交交易时连接中断。');
      // A duplicate submission response proves neither rejection of the original
      // transaction nor its final outcome. Resume tracking the same local hash.
      const alreadyKnown = /already\s+(?:imported|known|in\s+the\s+pool)/i.test(message);
      throw new SubmissionError(message, expectedHash,
        error instanceof RpcRejection && !alreadyKnown ? 'rejected' : 'unknown');
    }
    if (returnedHash !== expectedHash) throw new SubmissionError(t('节点返回的交易哈希与本地签名不匹配，请查询状态后再操作。'), expectedHash, 'unknown');
    return returnedHash;
  }

  async function trackTransfer(hash: string, startBlock: number, onState: (state: TransferState) => void,
    options: TrackOptions = {}): Promise<TransferState> {
    const transactionHash = hash32(hash);
    safeInteger(startBlock, t('起始高度 无效。'));
    const { signal, timeoutMs = 10 * 60_000, pollIntervalMs = 4_000, period = 64 } = options;
    const deadline = Date.now() + Math.max(0, timeoutMs);
    const endBlock = startBlock + period;
    let finalizedScanned = startBlock - 1;
    let scannedThrough: { block: number; blockHash: string } | undefined;
    let inclusion: { block: number; blockHash: string; error?: string } | undefined;
    const cache = new Map<number, { blockHash: string; outcome?: { error?: string } }>();
    let lastState = '';
    const emit = (state: Omit<TransferState, 'hash'>): TransferState => {
      const next = { ...state, hash: transactionHash };
      const key = JSON.stringify(next);
      if (key !== lastState) { onState(next); lastState = key; }
      return next;
    };
    emit({ status: 'pending' });
    let lastError: string | undefined;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw aborted();
      try {
        const api = await getApi();
        const [header, finalizedHash] = await Promise.all([
          rpc<RpcHeader>('chain_getHeader', [], signal), rpc<string>('chain_getFinalizedHead', [], signal),
        ]);
        const finalizedHeader = await rpc<RpcHeader>('chain_getHeader', [hash32(finalizedHash)], signal);
        const height = safeInteger(header.number, t('区块高度 无效。'));
        const finalizedHeight = safeInteger(finalizedHeader.number, t('最终确认高度 无效。'));
        if (inclusion) {
          const canonical = await rpc<string>('chain_getBlockHash', [inclusion.block], signal);
          if (canonical !== inclusion.blockHash) { emit({ status: 'retracted', ...inclusion }); inclusion = undefined; scannedThrough = undefined; }
          else {
            if (inclusion.block <= finalizedHeight) return emit({ status: inclusion.error ? 'failed' : 'finalized', ...inclusion });
            emit({ status: 'included', ...inclusion });
            lastError = undefined;
            await pause(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())), signal);
            continue;
          }
        }
        let nextBlock = Math.max(startBlock, finalizedScanned + 1);
        // If the highest inspected block is still canonical, every ancestor is
        // unchanged as well. Only inspect new blocks; rewind after a reorg.
        if (scannedThrough && await rpc<string>('chain_getBlockHash', [scannedThrough.block], signal) === scannedThrough.blockHash) {
          nextBlock = scannedThrough.block + 1;
          finalizedScanned = Math.max(finalizedScanned, Math.min(finalizedHeight, scannedThrough.block));
        }
        for (let number = nextBlock; number <= Math.min(height, endBlock); number++) {
          if (signal?.aborted) throw aborted();
          const blockHash = hash32(await rpc<string>('chain_getBlockHash', [number], signal));
          let entry = cache.get(number);
          if (entry?.blockHash !== blockHash) {
            const block = await rpc<RawBlock>('chain_getBlock', [blockHash], signal);
            const extrinsicIndex = block.block.extrinsics.findIndex((bytes) => blake2AsHex(hexToU8a(bytes)) === transactionHash);
            entry = { blockHash };
            if (extrinsicIndex >= 0) {
              const at = await api.at(blockHash);
              const events = await at.query.system.events() as unknown as EventRecord[];
              const result = events.find(({ phase, event }) => phase.isApplyExtrinsic &&
                phase.asApplyExtrinsic.toNumber() === extrinsicIndex && event.section === 'system' &&
                (event.method === 'ExtrinsicSuccess' || event.method === 'ExtrinsicFailed'));
              if (!result) throw new Error(t('已找到交易，但尚未确认执行结果。'));
              entry.outcome = {};
              if (result.event.method === 'ExtrinsicFailed') {
                const dispatch = result.event.data[0] as unknown as { isModule: boolean; asModule: Parameters<typeof at.registry.findMetaError>[0]; toString(): string };
                if (dispatch.isModule) {
                  const error = at.registry.findMetaError(dispatch.asModule);
                  entry.outcome.error = `${error.section}.${error.name}: ${error.docs.join(' ')}`;
                } else entry.outcome.error = dispatch.toString();
              }
            }
            cache.set(number, entry);
          }
          scannedThrough = { block: number, blockHash };
          if (entry.outcome) {
            inclusion = { block: number, blockHash, ...entry.outcome };
            if (number <= finalizedHeight) return emit({ status: inclusion.error ? 'failed' : 'finalized', ...inclusion });
            emit({ status: 'included', ...inclusion });
            break;
          }
          if (number <= finalizedHeight) { finalizedScanned = number; cache.delete(number); }
        }
        if (!inclusion && finalizedHeight >= endBlock) return emit({ status: 'expired', error: t('交易有效期内未在最终确认的主链中找到此交易，请重新查询余额和序号后再准备。') });
        lastError = undefined;
      } catch (error) {
        if (signal?.aborted) throw aborted();
        lastError = error instanceof Error ? error.message : t('交易状态查询中断。');
        emit({ status: 'unknown', ...(inclusion ?? {}), error: t('{0} 正在重试，请勿重复转账。', lastError) });
      }
      await pause(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())), signal);
    }
    return emit({ status: 'unknown', ...(inclusion ?? {}), error: lastError || t('等待确认超时，请通过交易哈希查询最终状态，勿重复转账。') });
  }

  async function disconnect(): Promise<void> {
    const api = apiPromise;
    apiPromise = undefined;
    if (api) await (await api).disconnect();
  }

  return { readNetwork, readBalance, readHistory, readWormholeInfo, prepareTransfer, prepareScheduledTransfer,
    prepareCancelScheduled, readScheduledTransfers, readScheduledReceipt, estimateFee, submitTransfer, trackTransfer, disconnect };
}

const mainnetClient = createChainClient();
export const { readNetwork, readBalance, readHistory, readWormholeInfo, prepareTransfer, prepareScheduledTransfer,
  prepareCancelScheduled, readScheduledTransfers, readScheduledReceipt, estimateFee, submitTransfer, trackTransfer } = mainnetClient;

export function explorerAccountUrl(address: string): string {
  return `${MAINNET.explorerUrl}/accounts/${encodeURIComponent(validateAddress(address))}`;
}

export function explorerTransactionUrl(transaction: Pick<Transaction, 'hash' | 'blockHash'> & Partial<Pick<Transaction, 'type' | 'sourceType' | 'detailId'>>): string {
  const paths: Record<string, string> = {
    WORMHOLE: 'transactions/wormhole', SCHEDULED_REVERSIBLE: 'transactions/scheduled-reversible',
    EXECUTED_REVERSIBLE: 'transactions/executed-reversible', CANCELLED_REVERSIBLE: 'transactions/cancelled-reversible',
  };
  const type = transaction.sourceType ?? transaction.type;
  if (transaction.detailId && type && paths[type]) {
    return `${MAINNET.explorerUrl}/${paths[type]}/${encodeURIComponent(transaction.detailId)}`;
  }
  if (transaction.hash) return `${MAINNET.explorerUrl}/transactions/${hash32(transaction.hash)}`;
  if (transaction.detailId) return `${MAINNET.explorerUrl}/transactions/${encodeURIComponent(transaction.detailId)}`;
  return `${MAINNET.explorerUrl}/blocks/${hash32(transaction.blockHash)}`;
}
