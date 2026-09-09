import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { normalizeThemePreference, resolveTheme } from "../src/lib/theme";

const startupScript = readFileSync(new URL("../public/theme.js", import.meta.url), "utf8");
function firstPaint(saved: string | null, systemDark: boolean, blockedStorage = false) {
  const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
  let chromeColor = "";
  runInNewContext(startupScript, {
    localStorage: {
      getItem: () => {
        if (blockedStorage) throw new Error("Storage disabled");
        return saved;
      },
    },
    window: { matchMedia: () => ({ matches: systemDark }) },
    document: {
      documentElement: root,
      querySelector: () => ({ setAttribute: (_: string, value: string) => { chromeColor = value; } }),
    },
  });
  return { ...root, chromeColor };
}

describe("wallet appearance", () => {
  it("follows the OS unless the user chooses an explicit appearance", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("ignores an invalid stored value instead of exposing it to the page", () => {
    expect(normalizeThemePreference(null)).toBe("system");
    expect(normalizeThemePreference("invalid")).toBe("system");
    expect(normalizeThemePreference("light")).toBe("light");
    expect(firstPaint("invalid", true).dataset.theme).toBe("dark");
  });

  it("sets the dark canvas and native controls before the app loads", () => {
    const state = firstPaint(null, true);
    expect(state.dataset.theme).toBe("dark");
    expect(state.style.colorScheme).toBe("dark");
    expect(state.style.backgroundColor).toBe("#101412");
    expect(state.chromeColor).toBe("#101412");
  });

  it("preserves the explicit choice across refreshes in either OS appearance", () => {
    for (const systemDark of [true, false]) {
      expect(firstPaint("dark", systemDark).dataset.theme).toBe("dark");
      expect(firstPaint("light", systemDark).dataset.theme).toBe("light");
    }
  });

  it("still applies the system appearance when browser storage is unavailable", () => {
    expect(firstPaint(null, true, true).dataset.theme).toBe("dark");
    expect(firstPaint(null, false, true).dataset.theme).toBe("light");
  });
});
