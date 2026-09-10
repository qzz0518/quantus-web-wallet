import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createSession,
  emptyVault,
  encryptVault,
  STORAGE_KEY,
} from "../src/lib/vault";
import {
  AUTO_UNLOCK_KEY,
  MANUAL_LOCK_KEY,
  autoUnlock,
  clearManualLock,
  disableAutoUnlock,
  enableAutoUnlock,
  hasAutoUnlock,
  manuallyLocked,
  markManualLock,
} from "../src/lib/auto-unlock";

const originals = new Map<string, PropertyDescriptor | undefined>();
const setGlobal = (name: string, value: unknown) => {
  if (!originals.has(name))
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
    writable: true,
  });
};
const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  };
};

/** Minimal in-memory IndexedDB: open/upgrade, one transaction, get/put/delete. */
type Row = { id: string; key: unknown };
const databases = new Map<
  string,
  { version: number; stores: Map<string, Map<string, Row>> }
>();
class FakeRequest<T> {
  result: T | undefined;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
  onblocked: (() => void) | null = null;
}
class FakeTransaction {
  error: Error | null = null;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private pending = 0;
  constructor(private stores: Map<string, Map<string, Row>>) {}
  objectStore(name: string) {
    const rows = this.stores.get(name);
    if (!rows) throw new Error("NotFoundError");
    const run = <T>(work: () => T) => {
      const request = new FakeRequest<T>();
      this.pending++;
      queueMicrotask(() => {
        try {
          request.result = work();
          request.onsuccess?.();
        } catch (e) {
          request.error = e as Error;
          request.onerror?.();
        }
        if (--this.pending === 0) queueMicrotask(() => this.oncomplete?.());
      });
      return request;
    };
    return {
      get: (id: string) => run(() => rows.get(id)),
      put: (row: Row) => run(() => (rows.set(row.id, row), row.id)),
      delete: (id: string) => run(() => void rows.delete(id)),
    };
  }
}
class FakeDatabase {
  objectStoreNames = { contains: (n: string) => this.stores.has(n) };
  constructor(private stores: Map<string, Map<string, Row>>) {}
  createObjectStore(name: string) {
    this.stores.set(name, new Map());
  }
  transaction(name: string) {
    return new FakeTransaction(this.stores);
  }
  close() {}
}
const fakeIndexedDB = {
  open(name: string, version = 1) {
    const request = new FakeRequest<FakeDatabase>();
    queueMicrotask(() => {
      let db = databases.get(name);
      const upgrade = !db || db.version < version;
      if (!db) {
        db = { version, stores: new Map() };
        databases.set(name, db);
      }
      request.result = new FakeDatabase(db.stores);
      if (upgrade) {
        db.version = version;
        request.onupgradeneeded?.();
      }
      request.onsuccess?.();
    });
    return request;
  },
};
const storedKeys = () => databases.get("quantus-wallet")?.stores.get("keys");

beforeEach(() => {
  databases.clear();
  setGlobal("localStorage", memoryStorage());
  setGlobal("sessionStorage", memoryStorage());
  setGlobal("location", { origin: "http://localhost:5189" });
  setGlobal("indexedDB", fakeIndexedDB);
});
afterEach(() => {
  for (const [name, value] of originals) {
    if (value) Object.defineProperty(globalThis, name, value);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});
async function vault(password = "123456") {
  const s = await createSession(password),
    d = emptyVault();
  d.wallets.push({
    id: "watch",
    name: "test-watch",
    address: "qztest",
    kind: "watch",
    index: 0,
    createdAt: 1,
  });
  const raw = await encryptVault(s, d);
  localStorage.setItem(STORAGE_KEY, raw);
  return { s, d, raw };
}

describe("password-free mode", () => {
  it("enables with the password, unlocks without it, and disables cleanly", async () => {
    const { s, d, raw } = await vault();
    expect(hasAutoUnlock()).toBe(false);
    expect(await autoUnlock()).toBeNull();
    await enableAutoUnlock("123456");
    expect(hasAutoUnlock()).toBe(true);
    const blob = localStorage.getItem(AUTO_UNLOCK_KEY)!;
    expect(blob).not.toContain("123456");
    expect(blob).not.toContain("test-watch");
    const stored = storedKeys()?.get("auto-unlock")?.key as CryptoKey;
    expect(stored).toBeInstanceOf(CryptoKey);
    expect(stored.extractable).toBe(false);
    const opened = await autoUnlock();
    expect(opened?.data).toEqual(d);
    expect(opened?.session.key.extractable).toBe(false);
    expect(opened?.session.salt).toBe(s.salt);
    // The wrapped key keeps working across ordinary encrypted vault updates.
    const updated = { ...d, pending: [] };
    localStorage.setItem(STORAGE_KEY, await encryptVault(s, updated));
    expect((await autoUnlock())?.data).toEqual(updated);
    await disableAutoUnlock();
    expect(hasAutoUnlock()).toBe(false);
    expect(localStorage.getItem(AUTO_UNLOCK_KEY)).toBeNull();
    expect(storedKeys()?.has("auto-unlock")).toBe(false);
    expect(await autoUnlock()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBe(raw);
  });
  it("rejects a wrong password and stores nothing", async () => {
    await vault();
    await expect(enableAutoUnlock("wrong1")).rejects.toThrow();
    expect(hasAutoUnlock()).toBe(false);
    expect(localStorage.getItem(AUTO_UNLOCK_KEY)).toBeNull();
    expect(storedKeys()?.has("auto-unlock") ?? false).toBe(false);
  });
  it("turns itself off when the vault salt no longer matches", async () => {
    const { d } = await vault();
    await enableAutoUnlock("123456");
    // A password change or a restored backup writes a vault with a new salt.
    const rotated = await createSession("654321");
    localStorage.setItem(STORAGE_KEY, await encryptVault(rotated, d));
    expect(hasAutoUnlock()).toBe(false);
    expect(localStorage.getItem(AUTO_UNLOCK_KEY)).toBeNull();
    expect(await autoUnlock()).toBeNull();
    expect(storedKeys()?.has("auto-unlock")).toBe(false);
    // Enabling again with the new password works.
    await enableAutoUnlock("654321");
    expect((await autoUnlock())?.data).toEqual(d);
  });
  it("treats a missing browser key as off and clears the blob", async () => {
    await vault();
    await enableAutoUnlock("123456");
    storedKeys()!.delete("auto-unlock");
    expect(hasAutoUnlock()).toBe(true);
    expect(await autoUnlock()).toBeNull();
    expect(hasAutoUnlock()).toBe(false);
    expect(localStorage.getItem(AUTO_UNLOCK_KEY)).toBeNull();
  });
  it("treats a damaged blob, a foreign origin or a missing vault as off", async () => {
    await vault();
    await enableAutoUnlock("123456");
    const b = JSON.parse(localStorage.getItem(AUTO_UNLOCK_KEY)!);
    b.wrappedKey =
      (b.wrappedKey[0] === "A" ? "B" : "A") + b.wrappedKey.slice(1);
    localStorage.setItem(AUTO_UNLOCK_KEY, JSON.stringify(b));
    expect(await autoUnlock()).toBeNull();
    expect(hasAutoUnlock()).toBe(false);
    await enableAutoUnlock("123456");
    setGlobal("location", { origin: "http://localhost:9999" });
    expect(hasAutoUnlock()).toBe(false);
    await enableAutoUnlock("123456");
    localStorage.removeItem(STORAGE_KEY);
    expect(hasAutoUnlock()).toBe(false);
    expect(await autoUnlock()).toBeNull();
    expect(localStorage.getItem(AUTO_UNLOCK_KEY)).toBeNull();
    expect(storedKeys()?.has("auto-unlock")).toBe(false);
  });
  it("remembers a manual lock for the page session only", () => {
    expect(manuallyLocked()).toBe(false);
    markManualLock();
    expect(sessionStorage.getItem(MANUAL_LOCK_KEY)).toBe("1");
    expect(manuallyLocked()).toBe(true);
    clearManualLock();
    expect(manuallyLocked()).toBe(false);
  });
});
