import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { renderServiceWorker } from "../vite/pwa";

const origin = "https://qtc.zezn.dev";
const paths = ["/", "/index.html", "/assets/app.js", "/assets/app.css", "/assets/crypto.wasm"];
const prefix = "quantus-web-wallet-shell-v1-";
type Store = Map<string, Map<string, Response>>;
type FetchRequest = { url: string; method: string; mode: string };

function worker(revision: string, store: Store = new Map()) {
  const events = new Map<string, (event: Record<string, unknown>) => void>();
  const requests: string[] = [];
  let offline = false;
  let invalidAsset = "";
  let skipWaiting = 0;
  let claim = 0;
  const caches = {
    async open(name: string) {
      if (!store.has(name)) store.set(name, new Map());
      const entries = store.get(name)!;
      return {
        async match(url: string) { return entries.get(url)?.clone(); },
        async put(url: string, response: Response) { entries.set(url, response.clone()); },
      };
    },
    async keys() { return [...store.keys()]; },
    async delete(name: string) { return store.delete(name); },
  };
  const fetch = async (input: string | FetchRequest) => {
    const url = typeof input === "string" ? input : input.url;
    requests.push(url);
    if (offline) throw new TypeError("Network unavailable");
    const pathname = new URL(url).pathname;
    const type = pathname === invalidAsset ? "text/html"
      : pathname.endsWith(".js") ? "text/javascript"
      : pathname.endsWith(".css") ? "text/css"
      : pathname.endsWith(".wasm") ? "application/wasm"
      : "text/html";
    const response = new Response(`${revision}:${pathname}`, {
      headers: { "content-type": type },
    });
    Object.defineProperties(response, {
      url: { value: pathname === "/index.html" ? `${origin}/` : url },
      redirected: { value: pathname === "/index.html" },
    });
    return response;
  };
  runInNewContext(renderServiceWorker(revision, paths), {
    URL,
    Response,
    fetch,
    caches,
    self: {
      location: { origin },
      addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => events.set(name, handler),
      skipWaiting: () => { skipWaiting++; },
      clients: { claim: () => { claim++; } },
    },
  });
  return {
    store,
    requests,
    setOffline: () => { offline = true; },
    failAsset: (path: string) => { invalidAsset = path; },
    takeovers: () => ({ skipWaiting, claim }),
    async lifecycle(name: "install" | "activate") {
      let completion: Promise<unknown> | undefined;
      events.get(name)!({ waitUntil: (promise: Promise<unknown>) => { completion = promise; } });
      await completion;
    },
    route(url: string, method = "GET", mode = "cors") {
      let response: Promise<Response> | undefined;
      events.get("fetch")!({
        request: { url, method, mode },
        respondWith: (promise: Promise<Response>) => { response = promise; },
      });
      return response;
    },
  };
}

describe("PWA app shell", () => {
  it("reopens the shell and its code offline without redirect metadata", async () => {
    const w = worker("offline");
    await w.lifecycle("install");
    await w.lifecycle("activate");
    w.setOffline();
    for (const url of [`${origin}/`, `${origin}/index.html`, `${origin}/?source=homescreen`]) {
      const response = await w.route(url, "GET", "navigate");
      expect(await response!.text()).toBe("offline:/");
      expect(response!.redirected).toBe(false);
    }
    for (const path of paths.filter(path => path.startsWith("/assets/"))) {
      const response = await w.route(`${origin}${path}`);
      expect(await response!.text()).toBe(`offline:${path}`);
    }
    const entries = w.store.get(`${prefix}offline`)!;
    expect(entries.get(`${origin}/index.html`)!.redirected).toBe(false);
    expect([...entries.keys()].some(key => key.includes("?"))).toBe(false);
    expect(w.requests.length).toBe(paths.length);
  });

  it("never intercepts RPC, indexer, transactions, wallet data or unlisted URLs", async () => {
    const w = worker("private");
    await w.lifecycle("install");
    const cached = [...w.store.get(`${prefix}private`)!.keys()];
    for (const [url, method, mode] of [
      ["https://rpc1-mainnet.quantus.com/", "POST", "cors"],
      ["https://rpc1-mainnet.quantus.com/", "GET", "cors"],
      ["https://subsquid-mainnet-app-1.quantus.com/v1/graphql", "GET", "cors"],
      [`${origin}/`, "POST", "cors"],
      [`${origin}/assets/app.js`, "POST", "cors"],
      [`${origin}/assets/app.js?account=private`, "GET", "cors"],
      [`${origin}/api/balance`, "GET", "cors"],
      [`${origin}/vault.json`, "GET", "cors"],
      [`${origin}/tests/fixtures/transfer.html`, "GET", "navigate"],
      [`${origin}/_headers`, "GET", "cors"],
    ]) expect(w.route(url, method, mode)).toBeUndefined();
    expect([...w.store.get(`${prefix}private`)!.keys()]).toEqual(cached);
    expect(w.requests.length).toBe(paths.length);
  });

  it("stages an update without taking over or removing the running version", async () => {
    const store: Store = new Map([["another-app-cache", new Map()]]);
    const current = worker("current", store);
    await current.lifecycle("install");
    await current.lifecycle("activate");
    const update = worker("next", store);
    await update.lifecycle("install");
    expect(update.takeovers()).toEqual({ skipWaiting: 0, claim: 0 });
    expect(store.has(`${prefix}current`)).toBe(true);
    expect(await (await current.route(`${origin}/`, "GET", "navigate"))!.text()).toBe("current:/");
    // Activation is dispatched only after the browser releases the old clients.
    await update.lifecycle("activate");
    expect(store.has(`${prefix}current`)).toBe(false);
    expect(store.has("another-app-cache")).toBe(true);
    expect(update.takeovers()).toEqual({ skipWaiting: 0, claim: 0 });
    expect(await (await update.route(`${origin}/`, "GET", "navigate"))!.text()).toBe("next:/");
  });

  it("rejects an incomplete release while retaining the usable previous cache", async () => {
    const current = worker("usable");
    await current.lifecycle("install");
    const update = worker("broken", current.store);
    // A static host returning its HTML fallback for a missing WASM is not success.
    update.failAsset("/assets/crypto.wasm");
    await expect(update.lifecycle("install")).rejects.toThrow("static app resource");
    expect(current.store.has(`${prefix}usable`)).toBe(true);
    expect(current.store.has(`${prefix}broken`)).toBe(false);
    current.setOffline();
    expect(await (await current.route(`${origin}/`, "GET", "navigate"))!.text()).toBe("usable:/");
  });

  it("requires exact local build paths instead of broad or external cache rules", () => {
    for (const path of ["https://example.com/file.js", "//example.com/file.js", "/file.js?q=private", "/file.js#private", "/assets/../wallet.json"]) {
      expect(() => renderServiceWorker("invalid", ["/", path])).toThrow();
    }
  });

  it("ships standalone metadata and correctly sized PNG application icons", () => {
    const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
    expect(manifest.name).toBe("Quantus Web Wallet");
    expect(manifest.lang).toBe("zh-CN");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable")).toBe(true);
    for (const icon of [...manifest.icons, { src: "/icons/apple-touch-icon.png", sizes: "180x180" }]) {
      const bytes = readFileSync(new URL(`../public${icon.src}`, import.meta.url));
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  });
});
