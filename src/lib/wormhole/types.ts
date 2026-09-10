/**
 * Shared shapes for the encrypted-account (Wormhole) recovery tool.
 *
 * Scanning (`scan.ts`) turns a seed phrase into a snapshot of deposits and
 * their spent state; withdrawal (`exit.ts`) turns a selection of unspent
 * deposits into a proof and an on-chain exit. Amounts are planck as decimal
 * strings (12 decimals) so they survive JSON and never lose precision.
 */

/** 0 = receiving branch, 1 = change branch of `m/44'/189189189'/0'/<branch>'/<index>'`. */
export type WormholeBranch = 0 | 1;

export interface WormholeAddress {
  branch: WormholeBranch;
  index: number;
  address: string;
}

/** One indexed transfer into a derived Wormhole address. */
export interface WormholeDeposit extends WormholeAddress {
  /** Indexer transfer id, unique per deposit. */
  id: string;
  amountPlanck: string;
  blockHeight: number;
  blockHash: string;
  /** Position of the deposit leaf in the zk tree (u64, decimal). */
  leafIndex: string;
  /** Per-address transfer counter at deposit time (u64, decimal). */
  transferCount: string;
  /** Canonical recipient hash recorded with the leaf (0x hex). */
  toHash: string;
  /** Nullifier derived from the address secret and transferCount (0x hex). */
  nullifier: string;
  /** True when the nullifier is already in `Wormhole.UsedNullifiers`. */
  spent: boolean;
}

export interface WormholeBranchScan {
  branch: WormholeBranch;
  /** Addresses derived and checked on this branch. */
  scanned: number;
  /** Indices that received at least one deposit. */
  used: number[];
}

/** Everything known about an encrypted account at one finalized block. */
export interface WormholeSnapshot {
  blockHeight: number;
  blockHash: string;
  indexedHeight: number;
  deposits: WormholeDeposit[];
  unspentPlanck: string;
  spentPlanck: string;
  branches: [WormholeBranchScan, WormholeBranchScan];
  /** Set when the user supplied the address shown in the official wallet. */
  expectedAddressFound?: boolean;
  createdAt: number;
}

export interface WormholeScanProgress {
  stage: "network" | "addresses" | "deposits" | "nullifiers";
  branch?: WormholeBranch;
  scanned?: number;
  deposits?: number;
}

/** Chain rules read at withdrawal time; never assumed. */
export interface WormholeRules {
  specVersion: number;
  transactionVersion: number;
  genesisHash: string;
  /** `Wormhole.VolumeFeeRateBps` (4 = 0.04%). */
  volumeFeeBps: number;
  /** Fraction of the fee minted back to the proof's aggregator account, in parts per million. */
  aggregatorRatePpm: number;
  /** Amount granularity in planck (`Vesting.PayoutQuantum`, 0.01 QTC on mainnet). */
  quantumPlanck: string;
  /** `System.BlockHashCount`: how long a proof's block reference stays valid. */
  blockHashCount: number;
  existentialDepositPlanck: string;
  /** `Wormhole.VolumeFeesBurnRate` in parts per million (the rest of the fee goes to the block author). */
  burnRatePpm?: number;
  /** Proof the browser can build: a private batch; the aggregator rebate only exists for public batches. */
  batchKind?: "private-batch";
  /** RPC endpoint the rules were read from. */
  rpcUrl?: string;
}

/** Preview for a set of selected unspent deposits before proving. */
export interface WormholeExitSummary {
  deposits: WormholeDeposit[];
  inputPlanck: string;
  /** Sum after rounding every input down to the quantum. */
  quantizedPlanck: string;
  /** Remainder lost to quantization. */
  dustPlanck: string;
  /** Volume fee charged on the quantized amount. */
  feePlanck: string;
  /** Part of the fee expected back when the exit account is also the aggregator. */
  rebatePlanck: string;
  /** Amount credited to the exit account. */
  netPlanck: string;
  /** Fee the pallet settles on the minted amount (`ceil(net · bps / (10000 − bps))`), split between burn and block author. */
  settledFeePlanck?: string;
}

export type WormholeExitPhase =
  | "preparing"
  | "proving"
  | "submitting"
  | "submitted"
  | "included"
  | "finalized"
  | "failed"
  | "unknown"
  | "expired";

export interface WormholeExitProgress {
  stage: "rules" | "merkle" | "circuit" | "prove" | "verify" | "submit" | "track";
  /** 0–100 when known. */
  percent?: number;
  message?: string;
}

/** Public record of one withdrawal attempt; safe to persist (no secrets). */
export interface WormholeExitReceipt {
  version: 1;
  hash: string;
  /** Broadcast bytes kept until the outcome is known so a retry never rebuilds a different proof. */
  bytes?: string;
  exitAddress: string;
  nullifiers: string[];
  depositIds: string[];
  inputPlanck: string;
  feePlanck: string;
  netPlanck: string;
  proofBlock: number;
  proofBlockHash: string;
  expiresAt: number;
  phase: WormholeExitPhase;
  includedHeight?: number;
  includedHash?: string;
  finalizedHeight?: number;
  /** Nullifiers the chain rejected as already spent. */
  deniedNullifiers?: string[];
  message: string;
  createdAt: number;
  endpoint: string;
  /** Times the identical bytes were re-broadcast after the pool dropped them (5-block longevity). */
  resubmits?: number;
  /** Serialized proof size in bytes (`Wormhole.MAX_PROOF_BYTES` is 512 KiB). */
  proofBytes?: number;
}
