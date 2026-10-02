import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

const publicFiles = [
  "theme.js",
  "fonts.css",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
];

export function renderServiceWorker(revision: string, paths: string[]) {
  if (!paths.includes("/")) throw new Error("The app shell is required");
  for (const path of paths) {
    const url = new URL(path, "https://wallet.invalid");
    if (
      !path.startsWith("/") ||
      url.origin !== "https://wallet.invalid" ||
      url.pathname !== path ||
      url.search ||
      url.hash
    )
      throw new Error("Precache paths must be exact same-origin asset paths");
  }
  return `/* Generated at build time. Only static release files are cached: this release and the one before it. */
const CACHE_PREFIX = "quantus-web-wallet-shell-v1-";
const CACHE_NAME = CACHE_PREFIX + ${JSON.stringify(revision)};
const PATHS = ${JSON.stringify([...new Set(paths)].sort())};
const ORIGIN = self.location.origin;
const SHELL_URL = new URL("/", ORIGIN).href;
const STATIC_URLS = new Set(PATHS.map(path => new URL(path, ORIGIN).href));

function contentTypeFor(path) {
  if (path === "/" || path === "/index.html") return ["text/html"];
  if (path.endsWith(".js")) return ["text/javascript", "application/javascript"];
  if (path.endsWith(".css")) return ["text/css"];
  if (path.endsWith(".wasm")) return ["application/wasm"];
  if (path.endsWith(".webmanifest")) return ["application/manifest+json", "application/json"];
  if (path.endsWith(".svg")) return ["image/svg+xml"];
  if (path.endsWith(".png")) return ["image/png"];
  if (path.endsWith(".woff2")) return ["font/woff2"];
  return [];
}

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  try {
    await Promise.all(PATHS.map(async path => {
      const url = new URL(path, ORIGIN).href;
      const response = await fetch(url, { cache: "reload", credentials: "omit" });
      const type = (response.headers.get("content-type") || "").split(";")[0].trim();
      if (
        response.status !== 200 ||
        response.type === "opaque" ||
        (response.url && new URL(response.url).origin !== ORIGIN) ||
        !contentTypeFor(path).includes(type)
      ) throw new Error("A static app resource could not be cached");
      // Static hosts may redirect index.html to /. Remove redirect metadata
      // before this response is later used for an offline navigation.
      const stored = response.redirected
        ? new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers })
        : response;
      await cache.put(url, stored);
    }));
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

// A release takes over as soon as it is cached, so the next page load runs it.
self.addEventListener("install", event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

// Keep the release that ran before this one: a page opened on it may still
// load its own code-split files. Older wallet caches go; other caches stay.
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(names => {
    const older = names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
    return Promise.all(older.slice(0, -1).map(name => caches.delete(name)));
  }));
});

const SHELL_TIMEOUT_MS = 4000;

// The shell comes from the network so a deploy shows on the next load; the
// cached copy of this release is the fallback when offline or slow.
async function shell(request) {
  const network = fetch(SHELL_URL, { cache: "no-store", credentials: "omit" })
    .then(response => {
      const type = (response.headers.get("content-type") || "").split(";")[0].trim();
      return response.status === 200 && type === "text/html" && !response.redirected ? response : null;
    })
    .catch(() => null);
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), SHELL_TIMEOUT_MS));
  const fresh = await Promise.race([network, timeout]);
  if (fresh) return fresh;
  const cached = await (await caches.open(CACHE_NAME)).match(SHELL_URL);
  return cached || fetch(request);
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== ORIGIN) return;
  // A navigation can contain a query, but the query is never used as a cache key.
  if (request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/index.html")) {
    event.respondWith(shell(request));
    return;
  }
  // No runtime writes: RPC, indexer, transaction and wallet data stay out.
  if (STATIC_URLS.has(url.href)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(url.href)) || fetch(request)));
    return;
  }
  // A code-split file of the previous release, asked for by a page still running it.
  const asset = url.pathname.startsWith("/assets/") ? url.pathname.slice("/assets/".length) : "";
  if (asset && !asset.includes("/") && !url.search && !url.hash) {
    event.respondWith(caches.match(url.href).then(cached => cached || fetch(request)));
  }
});
`;
}

export function walletPwa(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "quantus-wallet-pwa",
    apply: "build",
    configResolved(value) {
      config = value;
      if (config.base !== "/")
        throw new Error("Quantus Web Wallet currently requires deployment at the domain root");
    },
    async closeBundle() {
      const output = resolve(config.root, config.build.outDir);
      const assetFiles: string[] = [];
      async function collect(directory: string) {
        for (const item of await readdir(resolve(output, directory), { withFileTypes: true })) {
          const file = `${directory}/${item.name}`;
          if (item.isDirectory()) await collect(file);
          // The Wormhole prover (~4 MB wasm + worker chunk) is fetched on demand,
          // not precached with the shell.
          else if (/\.(js|css|wasm|svg|png|woff2)$/.test(file) && !/prover/i.test(item.name)) assetFiles.push(file);
        }
      }
      await collect(config.build.assetsDir);
      const files = ["index.html", ...publicFiles, ...assetFiles].sort();
      const paths = ["/", ...files.map(file => `/${file}`)];
      const hash = createHash("sha256");
      hash.update(renderServiceWorker("content-revision", paths));
      for (const file of files) {
        hash.update(file);
        hash.update(await readFile(resolve(output, file)));
      }
      const revision = hash.digest("hex").slice(0, 20);
      await writeFile(resolve(output, "sw.js"), renderServiceWorker(revision, paths));
    },
  };
}
