import { t } from "./i18n";
import { isWalletScheme } from "../crypto/schemes";
import type { WalletScheme } from "../crypto/types";

export const STORAGE_KEY = "quantus.wallet.v1";
const ITERATIONS = 600_000;
export type Wallet = {
  id: string;
  name: string;
  address: string;
  /** Signing accounts carry their ML-DSA scheme; older vaults only contain `mldsa87`. */
  kind: WalletScheme | "watch";
  watchKind?: "standard" | "wormhole";
  index: number;
  mnemonic?: string;
  createdAt: number;
};
export type Pending = {
  hash: string;
  address: string;
  to: string;
  amount: string;
  fee: string;
  startBlock: number;
  createdAt: number;
  status: "pending" | "included" | "finalized" | "failed" | "unknown";
  error?: string;
  /** Absent in vaults written before delayed transfers existed: those are immediate. */
  kind?: "immediate" | "scheduled";
  /** Delayed transfers only: the chosen delay, and what the chain answered. */
  delay?: number;
  txId?: string;
  executeAt?: number;
};
export type VaultData = { version: 1; wallets: Wallet[]; pending: Pending[] };
export type Envelope = {
  format: "quantus-vault";
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};
export type VaultSession = { key: CryptoKey; salt: string };
const encode = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join(""));
const decode = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const aad = new TextEncoder().encode("quantus-wallet:v1");
function parseEnvelope(value: string): Envelope {
  if (value.length > 5_000_000) throw new Error(t("备份文件过大"));
  const e = JSON.parse(value);
  if (
    e.format !== "quantus-vault" ||
    e.version !== 1 ||
    e.kdf !== "PBKDF2-SHA256" ||
    e.iterations !== ITERATIONS ||
    typeof e.salt !== "string" ||
    typeof e.iv !== "string" ||
    typeof e.ciphertext !== "string" ||
    decode(e.salt).length !== 16 ||
    decode(e.iv).length !== 12
  )
    throw new Error(t("无法识别此钱包备份"));
  return e;
}
/** An optional non-negative whole number, or nothing at all. */
const optionalCount = (value: unknown) =>
  value === undefined || (Number.isSafeInteger(value) && (value as number) >= 0);

export function validateData(value: unknown): VaultData {
  const d = value as VaultData;
  if (
    d?.version !== 1 ||
    !Array.isArray(d.wallets) ||
    d.wallets.length > 100 ||
    !Array.isArray(d.pending) ||
    d.pending.length > 500
  )
    throw new Error(t("钱包数据格式无效"));
  const ids = new Set<string>(),
    addresses = new Set<string>();
  for (const w of d.wallets) {
    if (
      !w ||
      typeof w.id !== "string" ||
      ids.has(w.id) ||
      typeof w.name !== "string" ||
      w.name.length > 60 ||
      typeof w.address !== "string" ||
      addresses.has(w.address) ||
      !(w.kind === "watch" || isWalletScheme(w.kind)) ||
      !Number.isInteger(w.index) ||
      w.index < 0 ||
      w.index > 2 ** 31 - 1 ||
      !Number.isFinite(w.createdAt)
    )
      throw new Error(t("钱包数据格式无效"));
    if (
      w.kind !== "watch" &&
      (typeof w.mnemonic !== "string" || w.mnemonic.length > 1000)
    )
      throw new Error(t("钱包密钥数据无效"));
    if (
      w.watchKind !== undefined &&
      !["standard", "wormhole"].includes(w.watchKind)
    )
      throw new Error(t("观察账户类型无效"));
    if (w.kind === "watch" && w.mnemonic !== undefined)
      throw new Error(t("观察钱包不能包含密钥"));
    ids.add(w.id);
    addresses.add(w.address);
  }
  for (const p of d.pending)
    if (
      !p ||
      !/^0x[0-9a-f]{64}$/i.test(p.hash) ||
      typeof p.address !== "string" ||
      typeof p.to !== "string" ||
      typeof p.amount !== "string" ||
      !/^\d+$/.test(p.amount) ||
      typeof p.fee !== "string" ||
      !/^\d+$/.test(p.fee) ||
      !Number.isSafeInteger(p.startBlock) ||
      p.startBlock < 0 ||
      !Number.isFinite(p.createdAt) ||
      !["pending", "included", "finalized", "failed", "unknown"].includes(
        p.status,
      ) ||
      (p.kind !== undefined && !["immediate", "scheduled"].includes(p.kind)) ||
      !optionalCount(p.delay) ||
      !optionalCount(p.executeAt) ||
      (p.txId !== undefined && !/^0x[0-9a-f]{64}$/i.test(p.txId))
    )
      throw new Error(t("交易数据格式无效"));
  return d;
}
async function derive(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as Uint8Array<ArrayBuffer>,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function createSession(password: string): Promise<VaultSession> {
  if (password.length < 6) throw new Error(t("解锁密码至少需要 6 个字符"));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { key: await derive(password, salt), salt: encode(salt) };
}
export async function encryptVault(
  session: VaultSession,
  data: VaultData,
): Promise<string> {
  validateData(data);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  try {
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      session.key,
      plaintext,
    );
    return JSON.stringify({
      format: "quantus-vault",
      version: 1,
      kdf: "PBKDF2-SHA256",
      iterations: ITERATIONS,
      salt: session.salt,
      iv: encode(iv),
      ciphertext: encode(new Uint8Array(encrypted)),
    } satisfies Envelope);
  } finally {
    plaintext.fill(0);
  }
}
export async function unlockVault(
  password: string,
  raw: string,
): Promise<{ session: VaultSession; data: VaultData }> {
  let bytes: Uint8Array | undefined;
  try {
    const e = parseEnvelope(raw),
      key = await derive(password, decode(e.salt));
    bytes = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decode(e.iv), additionalData: aad },
        key,
        decode(e.ciphertext),
      ),
    );
    return {
      session: { key, salt: e.salt },
      data: validateData(JSON.parse(new TextDecoder().decode(bytes))),
    };
  } catch {
    throw new Error(t("密码不正确，或钱包备份已经损坏"));
  } finally {
    bytes?.fill(0);
  }
}
export const emptyVault = (): VaultData => ({
  version: 1,
  wallets: [],
  pending: [],
});

/** Optional device unlock wraps raw key material, never persists the password. */
export async function biometricKeyMaterial(
  password: string,
  raw: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; salt: string }> {
  const { session } = await unlockVault(password, raw);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: decode(session.salt),
        iterations: ITERATIONS,
        hash: "SHA-256",
      },
      material,
      256,
    ),
  );
  return { bytes, salt: session.salt };
}
export async function unlockVaultWithKey(
  key: CryptoKey,
  salt: string,
  raw: string,
): Promise<{ session: VaultSession; data: VaultData }> {
  const envelope = parseEnvelope(raw);
  if (envelope.salt !== salt)
    throw new Error(t("钱包密码已更新，请重新开启生物识别"));
  const bytes = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(envelope.iv), additionalData: aad },
      key,
      decode(envelope.ciphertext),
    ),
  );
  try {
    return {
      session: { key, salt },
      data: validateData(JSON.parse(new TextDecoder().decode(bytes))),
    };
  } finally {
    bytes.fill(0);
  }
}
export function vaultSalt(raw: string): string {
  return parseEnvelope(raw).salt;
}
