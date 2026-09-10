#!/usr/bin/env node
// Compares the public deployment with the local production build.
// Usage: bun run build && node scripts/verify-deployment.mjs [https://qtc.zezn.dev]
// Read-only: it downloads each built file from the site and checks the SHA-256
// and the security headers. It never imports a wallet or submits anything.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const origin = (process.argv[2] ?? "https://qtc.zezn.dev").replace(/\/$/, "");
const dist = join(import.meta.dirname, "..", "dist");
const REQUIRED_HEADERS = {
  "content-security-policy": /frame-ancestors 'none'/,
  "strict-transport-security": /max-age=\d+/,
  "x-content-type-options": /^nosniff$/i,
  "referrer-policy": /^no-referrer$/i,
};

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`✗ ${message}`);
};

for (const path of files(dist)) {
  const route = "/" + relative(dist, path).split("\\").join("/");
  // Hosting configuration files are consumed by the host and never served.
  if (/^\/_(headers|redirects)$/.test(route)) continue;
  const url = route === "/index.html" ? `${origin}/` : `${origin}${route}`;
  const response = await fetch(url, { cache: "no-store", redirect: "manual" });
  if (!response.ok) {
    fail(`${route}: HTTP ${response.status}`);
    continue;
  }
  const remote = sha256(new Uint8Array(await response.arrayBuffer()));
  const local = sha256(readFileSync(path));
  if (remote !== local) fail(`${route}: hash mismatch (site ${remote.slice(0, 12)}…, build ${local.slice(0, 12)}…)`);
  else console.log(`✓ ${route}`);
  if (route === "/index.html") {
    for (const [name, pattern] of Object.entries(REQUIRED_HEADERS)) {
      const value = response.headers.get(name);
      if (!value || !pattern.test(value)) fail(`missing or unexpected header ${name}: ${value ?? "(absent)"}`);
    }
  }
}

if (failures) {
  console.error(`${failures} problem(s) found. The site does not match this build.`);
  process.exit(1);
}
console.log("The deployment matches the local build and serves the expected headers.");
