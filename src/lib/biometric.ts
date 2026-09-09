import {
  biometricKeyMaterial,
  unlockVaultWithKey,
  vaultSalt,
  STORAGE_KEY,
} from "./vault";
export const BIOMETRIC_KEY = "quantus.biometric.v1";
export type DeviceSupport = {
  available: boolean;
  reason?: string;
  needsLocalhost?: boolean;
};
type Binding = {
  version: 1;
  origin: string;
  vaultSalt: string;
  credentialId: string;
  prfSalt: string;
  iv: string;
  wrappedKey: string;
};
type Extensions = {
  prf?: { enabled?: boolean; results?: { first: ArrayBuffer } };
};
const enc = new TextEncoder();
const b64 = (b: Uint8Array) =>
  btoa(Array.from(b, (c) => String.fromCharCode(c)).join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const unb64 = (s: string) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
const fresh = () => crypto.getRandomValues(new Uint8Array(32));
const extra = (salt: Uint8Array): AuthenticationExtensionsClientInputs =>
  ({ prf: { eval: { first: salt } } }) as AuthenticationExtensionsClientInputs;
const output = (c: PublicKeyCredential) =>
  c.getClientExtensionResults() as Extensions;
export async function deviceSupport(): Promise<DeviceSupport> {
  if (typeof window === "undefined" || !window.isSecureContext)
    return {
      available: false,
      reason: "请在 HTTPS 或本机 localhost 中使用设备解锁",
    };
  if (location.hostname === "127.0.0.1" || location.hostname === "[::1]")
    return {
      available: false,
      needsLocalhost: true,
      reason:
        "通行密钥需要使用 localhost 地址。请先导出加密备份，再在 localhost 恢复钱包。",
    };
  if (!window.PublicKeyCredential || !navigator.credentials)
    return {
      available: false,
      reason: "当前浏览器不支持系统通行密钥，请使用密码解锁",
    };
  try {
    if (
      !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    )
      return {
        available: false,
        reason:
          "未检测到可用的系统验证器。请在系统设置中启用指纹、面容或设备锁屏。",
      };
    const pk = PublicKeyCredential as typeof PublicKeyCredential & {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    };
    if (pk.getClientCapabilities) {
      const caps = await pk.getClientCapabilities();
      if (caps["extension:prf"] === false)
        return {
          available: false,
          reason: "当前浏览器不支持通行密钥加密扩展，请使用支持 PRF 的浏览器",
        };
    }
    return { available: true };
  } catch {
    return {
      available: false,
      reason: "暂时无法检测设备验证能力，仍可使用密码解锁",
    };
  }
}
export function disableBiometric() {
  localStorage.removeItem(BIOMETRIC_KEY);
}
function bindingFor(raw: string): Binding | null {
  const stored = localStorage.getItem(BIOMETRIC_KEY);
  if (!stored) return null;
  try {
    const b = JSON.parse(stored) as Binding;
    if (
      b.version !== 1 ||
      b.origin !== location.origin ||
      b.vaultSalt !== vaultSalt(raw) ||
      typeof b.credentialId !== "string" ||
      !b.credentialId ||
      b.credentialId.length > 2048 ||
      typeof b.prfSalt !== "string" ||
      unb64(b.prfSalt).length !== 32 ||
      typeof b.iv !== "string" ||
      unb64(b.iv).length !== 12 ||
      typeof b.wrappedKey !== "string" ||
      unb64(b.wrappedKey).length !== 48
    )
      throw new Error("Invalid binding");
    return b;
  } catch {
    disableBiometric();
    return null;
  }
}
export function hasBiometric(raw = localStorage.getItem(STORAGE_KEY) || "") {
  return !!bindingFor(raw);
}
function assertCurrent(raw: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("操作已取消", "AbortError");
  if (localStorage.getItem(STORAGE_KEY) !== raw)
    throw new Error("钱包数据已变化，请重试");
}
async function wrappingKey(
  prf: ArrayBuffer,
  b: Pick<Binding, "origin" | "vaultSalt">,
): Promise<CryptoKey> {
  const bytes = new Uint8Array(prf);
  if (bytes.length !== 32) throw new Error("设备未提供有效的加密结果");
  try {
    const material = await crypto.subtle.importKey(
      "raw",
      bytes,
      "HKDF",
      false,
      ["deriveKey"],
    );
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: enc.encode(b.vaultSalt),
        info: enc.encode("quantus-device-unlock:v1:" + b.origin),
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    bytes.fill(0);
  }
}
const aad = (
  b: Pick<Binding, "origin" | "vaultSalt" | "credentialId" | "prfSalt">,
) =>
  enc.encode(
    JSON.stringify([
      "quantus-device-unlock:v1",
      b.origin,
      b.vaultSalt,
      b.credentialId,
      b.prfSalt,
    ]),
  );
async function authenticate(
  id: Uint8Array,
  prfSalt: Uint8Array,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const challenge = fresh();
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        {
          type: "public-key",
          id: id as Uint8Array<ArrayBuffer>,
          transports: ["internal"],
        },
      ],
      userVerification: "required",
      timeout: 60000,
      extensions: extra(prfSalt),
    },
    signal,
  })) as PublicKeyCredential | null;
  if (
    !credential ||
    credential.type !== "public-key" ||
    b64(new Uint8Array(credential.rawId)) !== b64(id)
  )
    throw new Error("设备凭证不匹配");
  const response = credential.response as AuthenticatorAssertionResponse;
  const client = JSON.parse(new TextDecoder().decode(response.clientDataJSON));
  if (
    client.type !== "webauthn.get" ||
    client.origin !== location.origin ||
    client.challenge !== b64(challenge) ||
    client.crossOrigin === true
  )
    throw new Error("设备验证上下文不匹配");
  const auth = new Uint8Array(response.authenticatorData),
    rp = new Uint8Array(
      await crypto.subtle.digest("SHA-256", enc.encode(location.hostname)),
    );
  if (
    auth.length < 37 ||
    (auth[32] & 5) !== 5 ||
    !rp.every((v, i) => v === auth[i])
  )
    throw new Error("系统未完成用户验证");
  const prf = output(credential).prf?.results?.first;
  if (!prf) throw new Error("此设备凭证不支持加密解锁（PRF），请继续使用密码");
  return prf;
}
export async function enrollBiometric(
  password: string,
  signal?: AbortSignal,
): Promise<void> {
  const support = await deviceSupport();
  if (!support.available) throw new Error(support.reason);
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("请先创建钱包空间");
  const material = await biometricKeyMaterial(password, raw);
  try {
    assertCurrent(raw, signal);
    const salt = fresh();
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: fresh(),
        rp: { name: "Quantus Web Wallet" },
        user: {
          id: fresh(),
          name: `wallet-${location.port || "https"}`,
          displayName: "Quantus 本地钱包解锁",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required",
        },
        attestation: "none",
        timeout: 60000,
        extensions: extra(salt),
      },
      signal,
    })) as PublicKeyCredential | null;
    if (!credential || credential.type !== "public-key")
      throw new Error("未创建通行密钥");
    if (output(credential).prf?.enabled === false)
      throw new Error("此设备凭证不支持加密解锁（PRF），请继续使用密码");
    const prf = await authenticate(
      new Uint8Array(credential.rawId),
      salt,
      signal,
    );
    const binding: Binding = {
      version: 1,
      origin: location.origin,
      vaultSalt: material.salt,
      credentialId: b64(new Uint8Array(credential.rawId)),
      prfSalt: b64(salt),
      iv: b64(crypto.getRandomValues(new Uint8Array(12))),
      wrappedKey: "",
    };
    const key = await wrappingKey(prf, binding);
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
    assertCurrent(raw, signal);
    localStorage.setItem(BIOMETRIC_KEY, JSON.stringify(binding));
  } finally {
    material.bytes.fill(0);
  }
}
export async function unlockBiometric(signal?: AbortSignal) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("请先恢复钱包");
  const binding = bindingFor(raw);
  if (!binding) throw new Error("请先使用密码解锁，再开启生物识别");
  let material: Uint8Array | undefined;
  try {
    const key = await wrappingKey(
      await authenticate(
        unb64(binding.credentialId),
        unb64(binding.prfSalt),
        signal,
      ),
      binding,
    );
    assertCurrent(raw, signal);
    // Disabling this binding in another tab must immediately revoke this attempt.
    if (localStorage.getItem(BIOMETRIC_KEY) !== JSON.stringify(binding))
      throw new Error("设备解锁设置已变化，请使用密码");
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
    assertCurrent(raw, signal);
    return unlocked;
  } catch (e) {
    if (
      !(
        e instanceof DOMException &&
        ["NotAllowedError", "AbortError"].includes(e.name)
      ) &&
      !signal?.aborted
    )
      disableBiometric();
    throw e;
  } finally {
    material?.fill(0);
  }
}
export function deviceError(error: unknown): string {
  if (
    error instanceof DOMException &&
    ["NotAllowedError", "AbortError"].includes(error.name)
  )
    return "验证已取消或超时，仍可使用密码解锁";
  return error instanceof Error ? error.message : "设备验证未完成，请使用密码";
}
