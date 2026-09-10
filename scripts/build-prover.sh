#!/usr/bin/env bash
set -euo pipefail
# Builds the Wormhole exit prover as its own wasm-bindgen artifact in
# vendor/quantus-wasm/browser-prover/. It is loaded lazily by the wallet and is
# never part of the main signing artifact (scripts/build-wasm.sh).
wallet_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_root="$wallet_root/vendor/quantus-wasm"
wasm_bindgen_version="0.2.125"

rustup target add wasm32-unknown-unknown
if ! command -v wasm-bindgen >/dev/null 2>&1 || [[ "$(wasm-bindgen --version)" != "wasm-bindgen $wasm_bindgen_version" ]]; then
  cargo install wasm-bindgen-cli --version "$wasm_bindgen_version" --locked
fi
# 4 GiB linear memory (the private-batch prover peaks around 1.6 GB natively),
# an 8 MiB shadow stack for the recursive circuit builder, single-threaded.
export RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$HOME=/build -C link-arg=--max-memory=4294967296 -C link-arg=-zstack-size=8388608"
cargo build --manifest-path "$source_root/Cargo.toml" --profile prover --features wormhole-prover \
  --target wasm32-unknown-unknown --locked
wasm-bindgen --target web --out-dir "$source_root/browser-prover" --out-name quantus_prover \
  "$source_root/target/wasm32-unknown-unknown/prover/quantus_wasm.wasm"
cp "$source_root/LICENSE" "$source_root/browser-prover/LICENSE"
ls -l "$source_root/browser-prover/quantus_prover_bg.wasm"
