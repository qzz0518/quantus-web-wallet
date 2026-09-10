import { MAINNET, validateAddress } from "./chain";
import type { Wallet } from "./vault";

/**
 * Public facts about a recipient used to warn before sending. An encrypted
 * (Wormhole) address looks exactly like a regular one, so only signals are
 * available: mining rewards are paid to Wormhole addresses by default, and
 * such an address never signs anything itself.
 */
export type RecipientProfile = {
  /** No indexed account row yet: brand-new or mistyped address. */
  unknown: boolean;
  /** Received mining rewards and never sent or signed: almost certainly a Wormhole address. */
  minerDepositOnly: boolean;
  /** The user marked this watch-only address as a Wormhole address. */
  ownWormhole: boolean;
  minedBlocks: number;
};

type IndexedAccount = {
  is_deposit_only: boolean | null;
  minedBlocks_aggregate: { aggregate: { count: number } | null } | null;
  transfersFrom_aggregate: { aggregate: { count: number } | null } | null;
  extrinsics_aggregate: { aggregate: { count: number } | null } | null;
};

const QUERY = `query RecipientProfile($id: String!) {
  account: account_by_pk(id: $id) {
    is_deposit_only
    minedBlocks_aggregate { aggregate { count } }
    transfersFrom_aggregate { aggregate { count } }
    extrinsics_aggregate { aggregate { count } }
  }
}`;

const count = (value: { aggregate: { count: number } | null } | null | undefined) =>
  typeof value?.aggregate?.count === "number" ? value.aggregate.count : 0;

export async function readRecipientProfile(
  address: string,
  wallets: Pick<Wallet, "address" | "kind" | "watchKind">[],
  options: { indexerUrl?: string; signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<RecipientProfile> {
  const canonical = validateAddress(address);
  const ownWormhole = wallets.some(
    (wallet) => wallet.address === canonical && wallet.kind === "watch" && wallet.watchKind === "wormhole",
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  options.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const response = await (options.fetcher ?? fetch)(options.indexerUrl ?? MAINNET.indexerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { id: canonical } }),
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
    const result = (await response.json()) as { data?: { account: IndexedAccount | null }; errors?: unknown[] };
    if (result.errors?.length || !result.data) throw new Error("Indexer rejected the recipient query");
    const account = result.data.account;
    if (!account) return { unknown: true, minerDepositOnly: false, ownWormhole, minedBlocks: 0 };
    const minedBlocks = count(account.minedBlocks_aggregate);
    const sent = count(account.transfersFrom_aggregate) + count(account.extrinsics_aggregate);
    return { unknown: false, minerDepositOnly: minedBlocks > 0 && sent === 0, ownWormhole, minedBlocks };
  } finally {
    clearTimeout(timer);
  }
}
