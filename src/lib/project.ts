export const PROJECT_NAME = "Quantus Web Wallet";

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT_AT__: string;

/** Build stamp, so anyone can check which version a browser is actually running. */
export const BUILD = {
  version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0",
  commit: typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "dev",
  builtAt: typeof __APP_BUILT_AT__ === "string" ? __APP_BUILT_AT__ : "",
};

/** `0.1.0 · 4b90647 · 2026-09-11 01:52` — short enough for a footer. */
export function buildLabel(locale = "zh-CN"): string {
  const stamp = BUILD.builtAt ? new Date(BUILD.builtAt) : null;
  const when =
    stamp && !Number.isNaN(stamp.getTime())
      ? stamp.toLocaleString(locale, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  return [BUILD.version, BUILD.commit, when].filter(Boolean).join(" · ");
}
export const GITHUB_URL = "https://github.com/qzz0518/quantus-web-wallet";
export const X_URL = "https://x.com/zerah_eth";
export const WEBSITE_URL = "https://qtc.zezn.dev";
