import { describe, expect, it } from "bun:test";
import { STORAGE_KEY } from "../src/lib/vault";
import { persistNewVault } from "../src/lib/vault-storage";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("first wallet storage", () => {
  it("preserves a wallet saved by another page while creation is awaiting encryption", async () => {
    const storage = memoryStorage();
    let finishEncryption!: () => void;
    const encryption = new Promise<void>((resolve) => {
      finishEncryption = resolve;
    });
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    const creation = (async () => {
      await encryption;
      persistNewVault("created-encrypted-data", undefined, storage);
    })();
    storage.setItem(STORAGE_KEY, "other-page-encrypted-data");
    finishEncryption();
    await expect(creation).rejects.toThrow("避免覆盖");
    expect(storage.getItem(STORAGE_KEY)).toBe("other-page-encrypted-data");
  });

  it("does not revoke a device binding when restoration discovers a new local wallet", async () => {
    const storage = memoryStorage();
    let bindingRevoked = false;
    const validatingBackup = Promise.resolve("validated-encrypted-backup");
    const restoration = (async () => {
      const encrypted = await validatingBackup;
      persistNewVault(
        encrypted,
        () => {
          bindingRevoked = true;
        },
        storage,
      );
    })();
    storage.setItem(STORAGE_KEY, "newly-created-wallet");
    await expect(restoration).rejects.toThrow("避免覆盖");
    expect(bindingRevoked).toBe(false);
    expect(storage.getItem(STORAGE_KEY)).toBe("newly-created-wallet");
  });

  it("keeps device-binding cleanup before a successful restored-vault write", () => {
    const storage = memoryStorage();
    storage.setItem("appearance", "dark");
    let bindingRevoked = false;
    persistNewVault(
      "validated-backup",
      () => {
        expect(storage.getItem(STORAGE_KEY)).toBeNull();
        bindingRevoked = true;
      },
      storage,
    );
    expect(bindingRevoked).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toBe("validated-backup");
    expect(storage.getItem("appearance")).toBe("dark");
  });

  it("does not silently replace an existing empty or damaged vault record", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "");
    expect(() => persistNewVault("replacement", undefined, storage)).toThrow(
      "避免覆盖",
    );
    expect(storage.getItem(STORAGE_KEY)).toBe("");
  });
});
