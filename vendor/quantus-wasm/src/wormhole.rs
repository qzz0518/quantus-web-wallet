//! Wormhole (private account) helpers for balance scanning.
//!
//! Wormhole receiving keys are derived with `qp-rusty-crystals-hdwallet` at
//! `m/44'/189189189'/0'/<branch>'/<index>'` (branch 0 = receive, 1 = change).
//! Each derived pair holds a 32-byte secret and the Poseidon-derived deposit
//! address `H(H("wormhole" || secret))`. A deposit to that address is spent by
//! publishing the nullifier `H(H("~nullif~" || secret || transfer_count))`, so
//! a scanner that knows the secret can tell spent and unspent deposits apart.
//!
//! Only SS58 addresses and nullifiers leave this module; secrets stay inside
//! the self-zeroizing wormhole pair. The nullifier construction mirrors the
//! official `qp-wormhole-circuit` (`nullifier.rs`) using `qp-poseidon-core`,
//! and is pinned to vectors produced by that crate in the tests below.

extern crate alloc;
use alloc::string::String;
use alloc::vec::Vec;

use qp_poseidon_core::{
    hash_twice,
    serialization::{bytes_to_digest, string_to_felts, u64_to_felts},
    Goldilocks,
};
use qp_rusty_crystals_hdwallet::{
    generate_wormhole_from_seed, mnemonic_to_seed, SensitiveBytes64, WormholePair,
};
use sp_core::crypto::{AccountId32, Ss58AddressFormat, Ss58Codec};
use wasm_bindgen::prelude::*;

use crate::ext::SS58_PREFIX;

/// Salt of the wormhole nullifier preimage (`qp-wormhole-circuit` `NULLIFIER_SALT`).
pub const NULLIFIER_SALT: &str = "~nullif~";
/// Receiving branch of the wormhole derivation path.
pub const BRANCH_RECEIVE: u32 = 0;
/// Change branch of the wormhole derivation path.
pub const BRANCH_CHANGE: u32 = 1;
/// Upper bound on addresses derived in one call (each costs one HMAC tree walk).
pub const MAX_SCAN_COUNT: u32 = 4096;
const HARDENED_LIMIT: u32 = 0x8000_0000;

fn wormhole_path(branch: u32, index: u32) -> String {
    alloc::format!("m/44'/189189189'/0'/{branch}'/{index}'")
}

fn check_branch(branch: u32) -> Result<(), String> {
    if branch == BRANCH_RECEIVE || branch == BRANCH_CHANGE {
        Ok(())
    } else {
        Err(String::from("wormhole branch must be 0 (receive) or 1 (change)"))
    }
}

fn seed_from_mnemonic(mnemonic: &str, passphrase: Option<&str>) -> Result<SensitiveBytes64, String> {
    let mut seed = SensitiveBytes64::zeroed();
    mnemonic_to_seed(String::from(mnemonic), passphrase, &mut seed)
        .map_err(|e| alloc::format!("mnemonic_to_seed failed: {e}"))?;
    Ok(seed)
}

fn pair_at(seed: &SensitiveBytes64, branch: u32, index: u32) -> Result<WormholePair, String> {
    check_branch(branch)?;
    if index >= HARDENED_LIMIT {
        return Err(String::from("wormhole index must be below 2^31"));
    }
    generate_wormhole_from_seed(seed, &wormhole_path(branch, index))
        .map_err(|e| alloc::format!("wormhole derivation failed: {e}"))
}

fn ss58(address: &[u8; 32]) -> String {
    AccountId32::new(*address).to_ss58check_with_version(Ss58AddressFormat::custom(SS58_PREFIX))
}

/// SS58 wormhole addresses for `index` in `start..start + count` on `branch`.
pub fn wormhole_addresses(
    mnemonic: &str,
    passphrase: Option<&str>,
    branch: u32,
    start: u32,
    count: u32,
) -> Result<Vec<String>, String> {
    check_branch(branch)?;
    if count > MAX_SCAN_COUNT {
        return Err(alloc::format!("count must be at most {MAX_SCAN_COUNT}"));
    }
    let end = start
        .checked_add(count)
        .filter(|end| *end <= HARDENED_LIMIT)
        .ok_or_else(|| String::from("wormhole index range exceeds 2^31"))?;
    let seed = seed_from_mnemonic(mnemonic, passphrase)?;
    let mut addresses = Vec::with_capacity(count as usize);
    for index in start..end {
        addresses.push(ss58(pair_at(&seed, branch, index)?.address()));
    }
    Ok(addresses)
}

/// Nullifier of the deposit with `transfer_count` to the wormhole account
/// owning `secret`: `H(H("~nullif~" felts || secret digest || u64 felts))`.
pub fn nullifier_from_secret(secret: &[u8; 32], transfer_count: u64) -> Result<[u8; 32], String> {
    let salt = string_to_felts(NULLIFIER_SALT);
    let secret_felts = bytes_to_digest(secret).map_err(String::from)?;
    let count_felts = u64_to_felts(transfer_count);
    // Exact capacity: growing after the secret felts are written would free a
    // block still holding them.
    let mut preimage: Vec<Goldilocks> =
        Vec::with_capacity(salt.len() + secret_felts.len() + count_felts.len());
    preimage.extend_from_slice(&salt);
    preimage.extend_from_slice(&secret_felts);
    preimage.extend_from_slice(&count_felts);
    let nullifier = hash_twice(&preimage);
    wipe(&mut preimage);
    let mut secret_felts = secret_felts;
    wipe(&mut secret_felts);
    Ok(nullifier)
}

/// Overwrite felts holding secret material. `Goldilocks` has no `Zeroize`
/// impl, so use volatile stores plus a fence, as the hdwallet crate does.
fn wipe(felts: &mut [Goldilocks]) {
    for felt in felts.iter_mut() {
        // SAFETY: exclusive, aligned reference; writing a `Copy` value is sound.
        unsafe { core::ptr::write_volatile(felt, Goldilocks::ZERO) };
    }
    core::sync::atomic::compiler_fence(core::sync::atomic::Ordering::SeqCst);
}

/// Nullifier for the wormhole account at (`branch`, `index`) and `transfer_count`.
pub fn wormhole_nullifier(
    mnemonic: &str,
    passphrase: Option<&str>,
    branch: u32,
    index: u32,
    transfer_count: u64,
) -> Result<[u8; 32], String> {
    let seed = seed_from_mnemonic(mnemonic, passphrase)?;
    let pair = pair_at(&seed, branch, index)?;
    nullifier_from_secret(pair.secret().as_bytes(), transfer_count)
}

/// SS58 wormhole receiving (`branch = 0`) or change (`branch = 1`) addresses
/// for indices `start..start + count`. Secrets are not returned.
#[wasm_bindgen(js_name = wormholeAddresses)]
pub fn wormhole_addresses_js(
    mnemonic: &str,
    branch: u32,
    start: u32,
    count: u32,
    passphrase: Option<String>,
) -> Result<Vec<String>, JsError> {
    wormhole_addresses(mnemonic, passphrase.as_deref(), branch, start, count)
        .map_err(|e| JsError::new(&e))
}

/// 32-byte nullifier for the deposit with `transfer_count` to the wormhole
/// account at (`branch`, `index`). Secrets are not returned.
#[wasm_bindgen(js_name = wormholeNullifier)]
pub fn wormhole_nullifier_js(
    mnemonic: &str,
    branch: u32,
    index: u32,
    transfer_count: u64,
    passphrase: Option<String>,
) -> Result<Vec<u8>, JsError> {
    wormhole_nullifier(mnemonic, passphrase.as_deref(), branch, index, transfer_count)
        .map(|n| n.to_vec())
        .map_err(|e| JsError::new(&e))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Public upstream test phrase; never fund it.
    const PHRASE: &str = "orchard answer curve patient visual flower maze noise retreat penalty cage small earth domain scan pitch bottom crunch theme club client swap slice raven";

    #[test]
    fn paths_and_bounds() {
        assert_eq!(wormhole_path(0, 0), "m/44'/189189189'/0'/0'/0'");
        assert_eq!(wormhole_path(1, 5), "m/44'/189189189'/0'/1'/5'");
        assert!(wormhole_addresses(PHRASE, None, 2, 0, 1).is_err());
        assert!(wormhole_addresses(PHRASE, None, 0, 0, MAX_SCAN_COUNT + 1).is_err());
        assert!(wormhole_addresses(PHRASE, None, 0, HARDENED_LIMIT - 1, 2).is_err());
        assert!(wormhole_nullifier(PHRASE, None, 0, HARDENED_LIMIT, 0).is_err());
        assert!(wormhole_addresses("not a mnemonic", None, 0, 0, 1).is_err());
        assert_eq!(wormhole_addresses(PHRASE, None, 0, 3, 0).unwrap(), Vec::<String>::new());
    }

    #[test]
    fn addresses_match_direct_hdwallet_derivation() {
        let seed = seed_from_mnemonic(PHRASE, None).unwrap();
        let ours = wormhole_addresses(PHRASE, None, BRANCH_CHANGE, 1, 2).unwrap();
        for (offset, address) in ours.iter().enumerate() {
            let pair = generate_wormhole_from_seed(&seed, &alloc::format!("m/44'/189189189'/0'/1'/{}'", 1 + offset)).unwrap();
            assert_eq!(address, &ss58(pair.address()));
            assert!(address.starts_with("qz"));
        }
        // Receive and change branches are distinct accounts.
        assert_ne!(
            wormhole_addresses(PHRASE, None, BRANCH_RECEIVE, 0, 1).unwrap(),
            wormhole_addresses(PHRASE, None, BRANCH_CHANGE, 0, 1).unwrap()
        );
    }

    /// Address bytes produced by `qp-rusty-crystals-hdwallet 4.1.1`
    /// (`generate_wormhole_from_seed`) and confirmed equal to
    /// `qp-wormhole-circuit 4.3.0` `UnspendableAccount::from_secret` for the
    /// same secret (see PROVENANCE.md).
    #[test]
    fn addresses_match_official_vectors() {
        let vectors: [(u32, u32, &str); 4] = [
            (0, 0, "dfcfd6e59c75d208e84f54a887537bcf7b04265790ec79960bf49de123404d0e"),
            (0, 1, "24a982ac06d7d8c2365a50de4a05df3e1ab31e378b9c8a3c4585335aa191c2d6"),
            (1, 0, "f4f12e13396b6fd54642f556bccf738b22a5140c44966e1750eb30cf5efcd507"),
            (1, 2, "d5ff0b2c9d6cf5270bc39ce64a9192b61804ebb3d16c6185537700ca000f8885"),
        ];
        let seed = seed_from_mnemonic(PHRASE, None).unwrap();
        for (branch, index, expected) in vectors {
            let pair = pair_at(&seed, branch, index).unwrap();
            assert_eq!(hex::encode(pair.address()), expected, "branch {branch} index {index}");
            let listed = wormhole_addresses(PHRASE, None, branch, index, 1).unwrap();
            assert_eq!(listed, alloc::vec![ss58(pair.address())]);
        }
    }

    /// Nullifiers produced by `qp-wormhole-circuit 4.3.0`
    /// `Nullifier::from_preimage(secret, transfer_count)`.
    #[test]
    fn nullifiers_match_official_circuit_vectors() {
        let fixed: [([u8; 32], u64, &str); 3] = [
            ([7u8; 32], 42, "c0d66ca3cab4195223db24c2a99cba342645cc28643650b6b8a5e1ad0ff5a113"),
            ([0u8; 32], 0, "278c74acce3d5d72538853878b47ff8832985eaa3b3e10f993a7412dc3c0c65f"),
            ([0xabu8; 32], 424_242, "5d9ff8a8e31f7dfe909de89751fa332e95c8b5d9ce7cfcffb892ab58ff638c78"),
        ];
        for (secret, count, expected) in fixed {
            assert_eq!(hex::encode(nullifier_from_secret(&secret, count).unwrap()), expected);
        }
        // Derived secrets of the test phrase.
        let derived: [(u32, u32, u64, &str); 4] = [
            (0, 0, 0, "2cbb73e7f9fad1070f8e729eb8e2b55d05d844dfea6622e12a7884eec1fe5bdc"),
            (0, 0, 1, "1fbb362bdac58e0ccc763f7bd97c6a6e231186d8aa531b9ad33f9ce89a6b287e"),
            (0, 0, u64::MAX, "045b756536aaad9a9174df74e2c7e32b0bc3b66ccfc00b8f63d175d725bcb307"),
            (1, 2, 424_242, "bfcd88744ff455e13effce2e580374c2deb5fc648f9a77d4a64be21351bd4c63"),
        ];
        for (branch, index, count, expected) in derived {
            assert_eq!(
                hex::encode(wormhole_nullifier(PHRASE, None, branch, index, count).unwrap()),
                expected,
                "branch {branch} index {index} count {count}"
            );
        }
        // Distinct counts and secrets give distinct nullifiers.
        assert_ne!(
            nullifier_from_secret(&[7u8; 32], 42).unwrap(),
            nullifier_from_secret(&[7u8; 32], 43).unwrap()
        );
        assert_ne!(
            nullifier_from_secret(&[7u8; 32], 42).unwrap(),
            nullifier_from_secret(&[8u8; 32], 42).unwrap()
        );
        // A non-canonical limb (>= Goldilocks modulus) is rejected like the circuit does.
        assert!(nullifier_from_secret(&[0xffu8; 32], 0).is_err());
    }
}
