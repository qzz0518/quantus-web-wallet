import { describe, expect, it } from "bun:test";
import {
  CHECK_PHRASE_ITERATIONS,
  CHECK_PHRASE_SALT,
  CHECK_PHRASE_WORDLIST,
  CHECK_PHRASE_WORDS,
  checkPhrase,
  formatCheckPhrase,
} from "../src/lib/checkphrase";
import vectors from "./fixtures/checkphrase-vectors.json";

describe("check phrase word list", () => {
  it("has exactly 2048 unique lowercase words", () => {
    expect(CHECK_PHRASE_WORDLIST.length).toBe(2048);
    expect(new Set(CHECK_PHRASE_WORDLIST).size).toBe(2048);
    expect(CHECK_PHRASE_WORDLIST.filter((word) => !/^[a-z]+$/.test(word))).toEqual([]);
  });

  it("keeps the constants the official vectors were generated with", () => {
    expect(vectors.constants.salt).toBe(CHECK_PHRASE_SALT);
    expect(vectors.constants.iterations).toBe(CHECK_PHRASE_ITERATIONS);
    expect(vectors.constants.checksumLength).toBe(CHECK_PHRASE_WORDS);
  });
});

describe("check phrase", () => {
  it("matches every official test vector", async () => {
    expect(vectors.cases.length).toBeGreaterThan(20);
    for (const { address, description, expected } of vectors.cases) {
      expect([description, await checkPhrase(address)]).toEqual([description, expected]);
    }
  }, 60_000);

  it("gives a completely different phrase to a one-character change", async () => {
    const original = await checkPhrase("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
    const poisoned = await checkPhrase("1A1zP1eP5QGefi2DMPTfTL5SLmv7DixfNa");
    expect(original).toEqual(["ahead", "aware", "sea", "blockbuster", "hedgehog"]);
    expect(poisoned).toEqual(["initial", "flair", "jovial", "broom", "supreme"]);
    expect(original.filter((word) => poisoned.includes(word))).toEqual([]);
  }, 20_000);

  it("returns the same array for a repeated address without deriving again", async () => {
    const address = "qzk7h3xH4Fmv2RqKpN8sT5jW9cY6gB1dL3mX0vQwEaUoZrJtS";
    const first = await checkPhrase(address);
    const started = Date.now();
    expect(await checkPhrase(address)).toBe(first);
    expect(Date.now() - started).toBeLessThan(50);
  }, 20_000);

  it("formats the words the way they are read out", () => {
    expect(formatCheckPhrase(["until", "business", "amazing", "silk", "satoshi"])).toBe(
      "Until-Business-Amazing-Silk-Satoshi",
    );
  });
});
