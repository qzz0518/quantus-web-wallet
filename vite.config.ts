import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { walletPwa } from "./vite/pwa";
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
  worker: { format: "es" },
  build: { target: "es2022" },
}));
