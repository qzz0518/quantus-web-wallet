import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createSession,
  emptyVault,
  encryptVault,
  unlockVault,
  STORAGE_KEY,
} from "../src/lib/vault";
import {
  BIOMETRIC_KEY,
  enrollBiometric,
  unlockBiometric,
  hasBiometric,
  disableBiometric,
  deviceSupport,
} from "../src/lib/biometric";
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
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
let prfSupported = true,
  verified = true,
  cancel = false,
  credentialCalls = 0;
const credentialId = new Uint8Array([1, 3, 5, 7]),
  secret = crypto.getRandomValues(new Uint8Array(32));
beforeEach(() => {
  const values = new Map<string, string>();
  setGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  setGlobal("location", {
    origin: "http://localhost:5189",
    hostname: "localhost",
    port: "5189",
  });
  class PK {
    static async isUserVerifyingPlatformAuthenticatorAvailable() {
      return true;
    }
    static async getClientCapabilities() {
      return { "extension:prf": true };
    }
  }
  setGlobal("PublicKeyCredential", PK);
  setGlobal("window", { isSecureContext: true, PublicKeyCredential: PK });
  setGlobal("navigator", {
    credentials: {
      create: async () => {
        credentialCalls++;
        return {
          type: "public-key",
          rawId: credentialId.buffer,
          getClientExtensionResults: () => ({ prf: { enabled: prfSupported } }),
        };
      },
      get: async ({ publicKey }: any) => {
        credentialCalls++;
        if (cancel) throw new DOMException("cancelled", "NotAllowedError");
        const auth = new Uint8Array(37);
        auth.set(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              encoder.encode(location.hostname),
            ),
          ),
        );
        auth[32] = verified ? 5 : 1;
        const material = await crypto.subtle.importKey(
          "raw",
          secret,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const result = await crypto.subtle.sign(
          "HMAC",
          material,
          publicKey.extensions.prf.eval.first,
        );
        return {
          type: "public-key",
          rawId: credentialId.buffer,
          response: {
            authenticatorData: auth.buffer,
            clientDataJSON: encoder.encode(
              JSON.stringify({
                type: "webauthn.get",
                origin: location.origin,
                challenge: encode(publicKey.challenge),
              }),
            ).buffer,
          },
          getClientExtensionResults: () => ({
            prf: prfSupported ? { results: { first: result } } : {},
          }),
        };
      },
    },
  });
  prfSupported = true;
  verified = true;
  cancel = false;
  credentialCalls = 0;
});
afterEach(() => {
  for (const [name, value] of originals) {
    if (value) Object.defineProperty(globalThis, name, value);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});
async function vault() {
  const s = await createSession("123456"),
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
describe("WebAuthn PRF key wrapping", () => {
  it("accepts six characters and rejects five without changing old vault compatibility", async () => {
    await expect(createSession("12345")).rejects.toThrow("6");
    const { raw, d } = await vault();
    expect((await unlockVault("123456", raw)).data).toEqual(d);
    const old = await createSession("long-old-password");
    expect(
      (await unlockVault("long-old-password", await encryptVault(old, d))).data,
    ).toEqual(d);
  });
  it("unwraps a nonextractable vault key after verified PRF; stores neither password nor vault plaintext", async () => {
    const { s, d } = await vault();
    await enrollBiometric("123456");
    const binding = localStorage.getItem(BIOMETRIC_KEY)!;
    expect(binding).not.toContain("123456");
    expect(binding).not.toContain("test-watch");
    expect(hasBiometric()).toBe(true);
    const opened = await unlockBiometric();
    expect(opened.data).toEqual(d);
    expect(opened.session.key.extractable).toBe(false);
    // Binding remains valid across ordinary encrypted vault updates.
    const updated = { ...d, pending: [] };
    localStorage.setItem(STORAGE_KEY, await encryptVault(s, updated));
    expect((await unlockBiometric()).data).toEqual(updated);
  });
  it("wrong password never invokes a platform prompt and unsupported PRF never installs a binding", async () => {
    await vault();
    await expect(enrollBiometric("wrong")).rejects.toThrow();
    expect(credentialCalls).toBe(0);
    prfSupported = false;
    await expect(enrollBiometric("123456")).rejects.toThrow("PRF");
    expect(hasBiometric()).toBe(false);
  });
  it("cancellation preserves binding, tampering revokes it and password fallback still works", async () => {
    const { raw } = await vault();
    await enrollBiometric("123456");
    cancel = true;
    await expect(unlockBiometric()).rejects.toThrow();
    expect(hasBiometric()).toBe(true);
    cancel = false;
    const b = JSON.parse(localStorage.getItem(BIOMETRIC_KEY)!);
    b.wrappedKey =
      (b.wrappedKey[0] === "A" ? "B" : "A") + b.wrappedKey.slice(1);
    localStorage.setItem(BIOMETRIC_KEY, JSON.stringify(b));
    await expect(unlockBiometric()).rejects.toThrow();
    expect(hasBiometric()).toBe(false);
    await expect(unlockVault("123456", raw)).resolves.toBeDefined();
  });
  it("requires verified user, and invalidates bindings after password rotation or origin change", async () => {
    const { d } = await vault();
    await enrollBiometric("123456");
    verified = false;
    await expect(unlockBiometric()).rejects.toThrow("用户验证");
    expect(hasBiometric()).toBe(false);
    verified = true;
    await enrollBiometric("123456");
    const binding = localStorage.getItem(BIOMETRIC_KEY)!;
    const newSession = await createSession("654321");
    localStorage.setItem(STORAGE_KEY, await encryptVault(newSession, d));
    expect(hasBiometric()).toBe(false);
    localStorage.setItem(BIOMETRIC_KEY, binding);
    setGlobal("location", {
      origin: "http://localhost:9999",
      hostname: "localhost",
      port: "9999",
    });
    expect(hasBiometric()).toBe(false);
  });
  it("offers password fallback on IP origins and disabling does not affect the encrypted vault", async () => {
    const { raw } = await vault();
    await enrollBiometric("123456");
    disableBiometric();
    expect(hasBiometric()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    setGlobal("location", {
      origin: "http://127.0.0.1:5189",
      hostname: "127.0.0.1",
    });
    expect((await deviceSupport()).needsLocalhost).toBe(true);
  });
});
