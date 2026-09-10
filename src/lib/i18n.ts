import { useSyncExternalStore } from "react";
import { en } from "./i18n/en";

export type Language = "zh" | "en";
export const LANGUAGE_STORAGE_KEY = "quantus-wallet-language";
export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

const listeners = new Set<() => void>();

export function normalizeLanguage(value: unknown): Language | null {
  return value === "zh" || value === "en" ? value : null;
}

/** Stored preference first; otherwise the browser language. Non-browser runtimes stay Chinese. */
export function readLanguage(): Language {
  try {
    const stored = normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Storage restrictions must not break rendering.
  }
  if (typeof document === "undefined" || typeof navigator === "undefined") return "zh";
  const preferred = navigator.languages?.[0] ?? navigator.language ?? "";
  return preferred.toLowerCase().startsWith("zh") ? "zh" : "en";
}

let current: Language = readLanguage();

export function getLanguage(): Language {
  return current;
}

export function localeTag(): string {
  return current === "zh" ? "zh-CN" : "en-US";
}

export function applyLanguage() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = current === "zh" ? "zh-CN" : "en";
}

function notify() {
  applyLanguage();
  for (const listener of listeners) listener();
}

export function setLanguage(next: Language) {
  current = next;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    // Keep the choice for this page session when storage is unavailable.
  }
  notify();
}

/**
 * Chinese source text is the key. Missing English entries fall back to the
 * source, so an untranslated string is visible instead of blank.
 * Placeholders are `{0}`, `{1}`, … in both the source and the translation.
 */
export function t(text: string, ...args: Array<string | number>): string {
  const base = current === "en" ? (en[text] ?? text) : text;
  if (!args.length) return base;
  return base.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = args[Number(index)];
    return value === undefined ? match : String(value);
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

/** Components call this so they re-render when the language changes. */
export function useT() {
  useLanguage();
  return t;
}

if (typeof window !== "undefined") {
  applyLanguage();
  window.addEventListener("storage", (event) => {
    if (event.key !== LANGUAGE_STORAGE_KEY && event.key !== null) return;
    const next = readLanguage();
    if (next !== current) {
      current = next;
      notify();
    }
  });
}
