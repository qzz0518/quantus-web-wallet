import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { walletPwa } from "./vite/pwa";

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

function git(args: string[], fallback: string): string {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

/** `0.1.<commits>`: the number moves on its own with every commit. */
function releaseVersion(): string {
  const [major = "0", minor = "0"] = version.split(".");
  return `${major}.${minor}.${git(["rev-list", "--count", "HEAD"], "0")}`;
}
/** The commit a build came from, so a deployment can be told apart from the last. */
function commit(): string {
  return git(["rev-parse", "--short=8", "HEAD"], "unknown");
}
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    walletPwa(),
    ...(command === "serve"
      ? [
          {
            name: "local-hmr-csp",
            transformIndexHtml(html: string) {
              return html.replace(
                "script-src 'self' 'wasm-unsafe-eval';",
                "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline';",
              ).replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:* ws://localhost:*");
            },
          },
        ]
      : []),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(releaseVersion()),
    __APP_COMMIT__: JSON.stringify(commit()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  worker: { format: "es" },
  build: { target: "es2022" },
}));
