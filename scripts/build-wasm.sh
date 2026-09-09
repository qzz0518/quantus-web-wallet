#!/usr/bin/env bash
set -euo pipefail
wallet_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_root="$wallet_root/vendor/quantus-wasm"
wasm_bindgen_version="0.2.125"

# Rust itself is resolved by the caller's mise environment. CLI version must
# match Cargo.lock exactly; no opaque postprocessing of the .wasm is used.
rustup target add wasm32-unknown-unknown
if ! command -v wasm-bindgen >/dev/null 2>&1 || [[ "$(wasm-bindgen --version)" != "wasm-bindgen $wasm_bindgen_version" ]]; then
  cargo install wasm-bindgen-cli --version "$wasm_bindgen_version" --locked
fi
# Keep local build-machine paths out of the distributed binary.
export RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$HOME=/build"
cargo build --manifest-path "$source_root/Cargo.toml" --release --target wasm32-unknown-unknown --locked
wasm-bindgen --target web --out-dir "$source_root/browser" --out-name quantus_wasm \
  "$source_root/target/wasm32-unknown-unknown/release/quantus_wasm.wasm"
cp "$source_root/LICENSE" "$source_root/browser/LICENSE"
