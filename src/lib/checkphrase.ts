import wordlist from "../../vendor/human-checkphrase/wordlist.json";

/**
 * The check phrase of an address: five words anyone can read aloud. Two
 * addresses that differ by a single character produce unrelated phrases, so
 * reading the words back is a practical way to catch a swapped or poisoned
 * address that looks right at a glance.
 *
 * The algorithm is the official one (Quantus-Network/qp-human-checkphrase,
 * MIT; see vendor/PROVENANCE.md): PBKDF2-HMAC-SHA256 over the address string
 * with a fixed salt and 40,000 iterations, 7 bytes out, read as one big-endian
 * integer, shifted right by the 1 bit that does not fit into five 11-bit
 * indices, then looked up in the 2,048-word list.
 */
export const CHECK_PHRASE_SALT = "human-readable-checksum";
export const CHECK_PHRASE_ITERATIONS = 40_000;
export const CHECK_PHRASE_WORDS = 5;
/** 55 bits of indices rounded up to whole bytes. */
const KEY_BYTES = Math.ceil((CHECK_PHRASE_WORDS * 11) / 8);

export const CHECK_PHRASE_WORDLIST: readonly string[] = wordlist;

/** Cheap enough to keep, expensive enough to want to: PBKDF2 costs ~15 ms. */
const CACHE_LIMIT = 200;
const cache = new Map<string, string[]>();

export async function checkPhrase(address: string): Promise<string[]> {
  const cached = cache.get(address);
  if (cached) return cached;
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(address),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(CHECK_PHRASE_SALT),
      iterations: CHECK_PHRASE_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    KEY_BYTES * 8,
  );
  const words = wordsFromKey(new Uint8Array(bits));
  // A first writer wins; the oldest entry leaves so the map cannot grow.
  if (!cache.has(address)) {
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(address, words);
  }
  return words;
}

/** Exported for the vectors: the lookup itself, without the key derivation. */
export function wordsFromKey(key: Uint8Array): string[] {
  let value = 0n;
  for (let i = 0; i < KEY_BYTES; i++) value = (value << 8n) | BigInt(key[i] ?? 0);
  value >>= BigInt((8 * KEY_BYTES) % 11);
  const words: string[] = [];
  for (let i = 0; i < CHECK_PHRASE_WORDS; i++) {
    const index = Number((value >> BigInt((CHECK_PHRASE_WORDS - 1 - i) * 11)) & 0x7ffn);
    words.push(wordlist[index]);
  }
  return words;
}

/** `until business amazing silk satoshi` → `Until-Business-Amazing-Silk-Satoshi`. */
export function formatCheckPhrase(words: readonly string[]): string {
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
}

/**
 * The phrase of an address already derived in this page, if any. Lets a view
 * that reopens on the same address show the words immediately instead of
 * flashing a placeholder for the 40,000 PBKDF2 rounds.
 */
export function cachedCheckPhrase(address: string): string[] | undefined {
  return cache.get(address);
}
