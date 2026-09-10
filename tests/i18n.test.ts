import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { en } from "../src/lib/i18n/en";

const ROOT = join(import.meta.dir, "..", "src");
const CJK = /[一-鿿]/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every `t("…")` literal in the source tree. */
function keys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sources(ROOT)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\bt\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) {
      const key = match[2].replace(/\\(["'`])/g, "$1").replace(/\\n/g, "\n");
      if (!CJK.test(key)) continue;
      found.set(key, [...(found.get(key) ?? []), file.slice(ROOT.length + 1)]);
    }
  }
  return found;
}

describe("English dictionary", () => {
  const used = keys();
  test("covers every Chinese string passed to t()", () => {
    const missing = [...used.keys()].filter((key) => !(key in en));
    expect(missing).toEqual([]);
  });
  test("keeps the same placeholders as the source", () => {
    const wrong = [...used.keys()].filter((key) => {
      const value = en[key];
      if (!value) return false;
      const source = [...key.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort();
      const target = [...value.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort();
      return source.join() !== target.join();
    });
    expect(wrong).toEqual([]);
  });
  test("has no Chinese or empty English values", () => {
    const bad = Object.entries(en).filter(([, value]) => !value.trim() || CJK.test(value));
    expect(bad).toEqual([]);
  });
  test("contains at least the strings the wallet uses", () => {
    expect(used.size).toBeGreaterThan(100);
  });
});
