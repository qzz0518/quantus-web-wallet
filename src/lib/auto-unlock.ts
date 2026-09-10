import {
  biometricKeyMaterial,
  unlockVaultWithKey,
  vaultSalt,
  STORAGE_KEY,
} from "./vault";
import { t } from "./i18n";

/**
 * Password-free mode for a trusted, private computer.
 *
 * The vault key material is wrapped with a random, non-extractable AES-GCM
 * key that lives in IndexedDB; the wrapped blob lives in localStorage. Both
 * halves are needed to open the wallet, neither contains the password, and the
 * encrypted vault itself is untouched. Anyone who can open this browser
 * profile can open the wallet, which is the trade-off the user opts into.
 */
export const AUTO_UNLOCK_KEY = "quantus.autounlock.v1";
/** Set by a manual lock so this page keeps asking for the password. */
export const MANUAL_LOCK_KEY = "quantus.autounlock.locked";
const DB_NAME = "quantus-wallet";
const DB_STORE = "keys";
const KEY_ID = "auto-unlock";
type Binding = {
  version: 1;
  origin: string;
  vaultSalt: string;
  iv: string;
  wrappedKey: string;
};
const enc = new TextEncoder();
const b64 = (b: Uint8Array) =>
  btoa(Array.from(b, (c) => String.fromCharCode(c)).join(""));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const aad = (b: Pick<Binding, "origin" | "vaultSalt">) =>
  enc.encode(JSON.stringify(["quantus-auto-unlock:v1", b.origin, b.vaultSalt]));

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(new Error(t("当前浏览器不支持免密模式")));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE))
        db.createObjectStore(DB_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error(t("无法访问浏览器密钥存储")));
    request.onblocked = () => reject(new Error(t("无法访问浏览器密钥存储")));
  });
}
async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode);
    const request = action(tx.objectStore(DB_STORE));
    const fail = () => {
      db.close();
      reject(tx.error ?? new Error(t("无法访问浏览器密钥存储")));
    };
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = fail;
    tx.onabort = fail;
  });
}
const readKey = () =>
  withStore<{ id: string; key: CryptoKey } | undefined>("readonly", (s) =>
    s.get(KEY_ID),
  ).then((row) => (row?.key instanceof CryptoKey ? row.key : null));
const writeKey = (key: CryptoKey) =>
  withStore("readwrite", (s) => s.put({ id: KEY_ID, key }));
const deleteKey = () =>
  withStore("readwrite", (s) => s.delete(KEY_ID)).catch(() => {});

/** Pending key removals, so callers can wait for a cleanup started elsewhere. */
let cleanup = Promise.resolve();
/** Turns the mode off and clears both halves; safe to call when already off. */
export function disableAutoUnlock(): Promise<void> {
  localStorage.removeItem(AUTO_UNLOCK_KEY);
  cleanup = cleanup.then(deleteKey);
  return cleanup;
}
function bindingFor(raw: string): Binding | null {
  const stored = localStorage.getItem(AUTO_UNLOCK_KEY);
  if (!stored) return null;
  try {
    const b = JSON.parse(stored) as Binding;
    if (
      b.version !== 1 ||
      b.origin !== location.origin ||
      b.vaultSalt !== vaultSalt(raw) ||
      typeof b.iv !== "string" ||
      unb64(b.iv).length !== 12 ||
      typeof b.wrappedKey !== "string" ||
      unb64(b.wrappedKey).length !== 48
    )
      throw new Error("Invalid binding");
    return b;
  } catch {
    void disableAutoUnlock();
    return null;
  }
}
/** Sync view of the mode: the stored blob exists and matches the current vault. */
export function hasAutoUnlock(
  raw = localStorage.getItem(STORAGE_KEY) || "",
): boolean {
  return !!raw && !!bindingFor(raw);
}
function assertCurrent(raw: string) {
  if (localStorage.getItem(STORAGE_KEY) !== raw)
    throw new Error(t("钱包数据已变化，请重试"));
}
/** Verifies the password, then wraps the vault key material for this browser. */
export async function enableAutoUnlock(password: string): Promise<void> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error(t("请先创建钱包空间"));
  const material = await biometricKeyMaterial(password, raw);
  try {
    assertCurrent(raw);
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const binding: Binding = {
      version: 1,
      origin: location.origin,
      vaultSalt: material.salt,
      iv: b64(crypto.getRandomValues(new Uint8Array(12))),
      wrappedKey: "",
    };
    binding.wrappedKey = b64(
      new Uint8Array(
        await crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv: unb64(binding.iv),
            additionalData: aad(binding),
          },
          key,
          material.bytes,
        ),
      ),
    );
    await writeKey(key);
    assertCurrent(raw);
    localStorage.setItem(AUTO_UNLOCK_KEY, JSON.stringify(binding));
  } finally {
    material.bytes.fill(0);
  }
}
/**
 * Opens the vault without a prompt. Resolves null when the mode is off or no
 * longer valid (missing half, salt mismatch, damaged blob); the leftovers are
 * cleared so the wallet falls back to the password cleanly.
 */
export async function autoUnlock() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    if (localStorage.getItem(AUTO_UNLOCK_KEY)) await disableAutoUnlock();
    return null;
  }
  const binding = bindingFor(raw);
  if (!binding) {
    await cleanup;
    return null;
  }
  let material: Uint8Array | undefined;
  try {
    const key = await readKey();
    if (!key) throw new Error("missing key");
    material = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: unb64(binding.iv),
          additionalData: aad(binding),
        },
        key,
        unb64(binding.wrappedKey),
      ),
    );
    const vaultKey = await crypto.subtle.importKey(
      "raw",
      material as Uint8Array<ArrayBuffer>,
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
    const unlocked = await unlockVaultWithKey(vaultKey, binding.vaultSalt, raw);
    assertCurrent(raw);
    return unlocked;
  } catch {
    await disableAutoUnlock();
    return null;
  } finally {
    material?.fill(0);
  }
}
/** A manual lock keeps this page locked until it is loaded again. */
export function markManualLock() {
  try {
    sessionStorage.setItem(MANUAL_LOCK_KEY, "1");
  } catch {
    // Without session storage the next lock simply asks for the password.
  }
}
export function clearManualLock() {
  try {
    sessionStorage.removeItem(MANUAL_LOCK_KEY);
  } catch {
    // Nothing to clear.
  }
}
export function manuallyLocked(): boolean {
  try {
    return sessionStorage.getItem(MANUAL_LOCK_KEY) === "1";
  } catch {
    return false;
  }
}
