//! BIP39 mnemonic -> Quantus HD account/signing, via `qp-rusty-crystals-hdwallet`.
//!
//! Uses the Quantus derivation path `m/44'/189189'/<account>'/<change>'/<addressIndex>'`
//! so accounts match the official wallets. The official CLI and wallet keep the
//! two parameter sets apart by the last path component: ML-DSA-87 accounts live
//! at `…/0'` and ML-DSA-65 accounts (the current default) at `…/1'`, so one
//! mnemonic never yields the same entropy for both schemes.
//!
//! All account/signing logic delegates to the seed-path core in [`crate::ext`];
//! only the keypair source differs.

extern crate alloc;
use alloc::string::String;
use alloc::vec::Vec;

use qp_rusty_crystals_hdwallet::{ml_dsa_65, ml_dsa_87, mnemonic_to_seed};
use wasm_bindgen::prelude::*;

use crate::ext::{self, Keypair, Scheme};
use crate::Account;

/// Last hardened path component the official CLI/wallet use by default for a
/// scheme (`…/<account>'/0'/<this>'`).
pub const fn canonical_address_index(scheme: Scheme) -> u32 {
    match scheme {
        Scheme::MlDsa65 => 1,
        Scheme::MlDsa87 => 0,
    }
}

/// Exposed for the JS bridge so its scheme table can be checked against this crate.
#[wasm_bindgen(js_name = canonicalAddressIndex)]
pub fn canonical_address_index_js(scheme: &str) -> Result<u32, JsError> {
    Ok(canonical_address_index(crate::parse_scheme(scheme)?))
}

fn quantus_path(account: u32, change: u32, address_index: u32) -> String {
    alloc::format!("m/44'/189189'/{account}'/{change}'/{address_index}'")
}

/// HD keypair for a scheme. Returns a plain error string so native tests can
/// exercise it; the wasm entry points convert it to `JsError`.
pub(crate) fn keypair_from_mnemonic(
    scheme: Scheme,
    mnemonic: &str,
    passphrase: Option<&str>,
    account: u32,
    change: u32,
    address_index: u32,
) -> Result<Keypair, String> {
    let path = quantus_path(account, change, address_index);
    let failed = |e: qp_rusty_crystals_hdwallet::HDLatticeError| {
        alloc::format!("mnemonic derivation failed: {e}")
    };
    match scheme {
        Scheme::MlDsa65 => ml_dsa_65::derive_key_from_mnemonic(mnemonic, passphrase, &path)
            .map(Keypair::MlDsa65)
            .map_err(failed),
        Scheme::MlDsa87 => ml_dsa_87::derive_key_from_mnemonic(mnemonic, passphrase, &path)
            .map(Keypair::MlDsa87)
            .map_err(failed),
    }
}

fn js_keypair_from_mnemonic(
    scheme: &str,
    mnemonic: &str,
    passphrase: Option<&str>,
    account: u32,
    change: u32,
    address_index: u32,
) -> Result<Keypair, JsError> {
    let scheme = crate::parse_scheme(scheme)?;
    keypair_from_mnemonic(scheme, mnemonic, passphrase, account, change, address_index)
        .map_err(|e| JsError::new(&e))
}

/// Derive a Quantus account from a mnemonic at the given HD indices for the
/// named scheme (`"ml-dsa-65"` or `"ml-dsa-87"`).
#[wasm_bindgen(js_name = accountFromMnemonicScheme)]
pub fn account_from_mnemonic_scheme(
    scheme: &str,
    mnemonic: &str,
    account: u32,
    change: u32,
    address_index: u32,
    passphrase: Option<String>,
) -> Result<Account, JsError> {
    let keypair =
        js_keypair_from_mnemonic(scheme, mnemonic, passphrase.as_deref(), account, change, address_index)?;
    Ok(crate::account_from_keys(ext::derive_account_from_keypair(&keypair)))
}

/// Sign a transfer from a mnemonic at the given HD indices for the named scheme.
#[wasm_bindgen(js_name = signTransferFromMnemonicScheme)]
pub fn sign_transfer_from_mnemonic_scheme(
    scheme: &str,
    mnemonic: &str,
    params: JsValue,
    account: u32,
    change: u32,
    address_index: u32,
    passphrase: Option<String>,
) -> Result<Vec<u8>, JsError> {
    let keypair =
        js_keypair_from_mnemonic(scheme, mnemonic, passphrase.as_deref(), account, change, address_index)?;
    let params = crate::build_transfer_params(params)?;
    ext::sign_transfer_with_keypair(&keypair, &params).map_err(crate::to_js_error)
}

/// Sign an already-encoded `RuntimeCall` from a mnemonic at the given HD indices
/// for the named scheme.
#[wasm_bindgen(js_name = signCallFromMnemonicScheme)]
pub fn sign_call_from_mnemonic_scheme(
    scheme: &str,
    mnemonic: &str,
    call: &[u8],
    context: JsValue,
    account: u32,
    change: u32,
    address_index: u32,
    passphrase: Option<String>,
) -> Result<Vec<u8>, JsError> {
    let keypair =
        js_keypair_from_mnemonic(scheme, mnemonic, passphrase.as_deref(), account, change, address_index)?;
    let ctx = crate::build_sign_context_from_value(context)?;
    ext::sign_call_with_keypair(&keypair, call, &ctx).map_err(crate::to_js_error)
}

/// Derive an ML-DSA-87 Quantus account from a mnemonic at the given HD indices.
#[wasm_bindgen(js_name = accountFromMnemonic)]
pub fn account_from_mnemonic(
    mnemonic: &str,
    account: u32,
    change: u32,
    address_index: u32,
    passphrase: Option<String>,
) -> Result<Account, JsError> {
    account_from_mnemonic_scheme(Scheme::MlDsa87.name(), mnemonic, account, change, address_index, passphrase)
}

/// Sign a transfer with ML-DSA-87 from a mnemonic at the given HD indices.
#[wasm_bindgen(js_name = signTransferFromMnemonic)]
pub fn sign_transfer_from_mnemonic(
    mnemonic: &str,
    params: JsValue,
    account: u32,
    change: u32,
    address_index: u32,
    passphrase: Option<String>,
) -> Result<Vec<u8>, JsError> {
    sign_transfer_from_mnemonic_scheme(
        Scheme::MlDsa87.name(),
        mnemonic,
        params,
        account,
        change,
        address_index,
        passphrase,
    )
}

/// Sign an already-encoded `RuntimeCall` with ML-DSA-87 from a mnemonic at the
/// given HD indices.
#[wasm_bindgen(js_name = signCallFromMnemonic)]
pub fn sign_call_from_mnemonic(
    mnemonic: &str,
    call: &[u8],
    context: JsValue,
    account: u32,
    change: u32,
    address_index: u32,
    passphrase: Option<String>,
) -> Result<Vec<u8>, JsError> {
    sign_call_from_mnemonic_scheme(
        Scheme::MlDsa87.name(),
        mnemonic,
        call,
        context,
        account,
        change,
        address_index,
        passphrase,
    )
}

/// BIP39 mnemonic -> 64-byte seed (bridge to the seed-based API).
#[wasm_bindgen(js_name = mnemonicToSeed)]
pub fn mnemonic_to_seed_js(mnemonic: String, passphrase: Option<String>) -> Result<Vec<u8>, JsError> {
    let mut seed = qp_rusty_crystals_hdwallet::SensitiveBytes64::zeroed();
    mnemonic_to_seed(mnemonic, passphrase.as_deref(), &mut seed)
        .map_err(|e| JsError::new(&alloc::format!("mnemonic_to_seed failed: {e}")))?;
    Ok(seed.as_bytes().to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sp_core::hashing::blake2_256;

    // Public upstream test phrase used by the JS bridge tests. Never fund it.
    const PHRASE: &str = "orchard answer curve patient visual flower maze noise retreat penalty cage small earth domain scan pitch bottom crunch theme club client swap slice raven";

    fn derive(scheme: Scheme, mnemonic: &str, account: u32, change: u32, address_index: u32) -> ext::AccountKeys {
        let keypair = keypair_from_mnemonic(scheme, mnemonic, None, account, change, address_index).unwrap();
        ext::derive_account_from_keypair(&keypair)
    }

    #[test]
    fn paths_follow_the_official_cli_defaults() {
        assert_eq!(quantus_path(0, 0, 0), "m/44'/189189'/0'/0'/0'");
        assert_eq!(quantus_path(3, 0, 1), "m/44'/189189'/3'/0'/1'");
        assert_eq!(canonical_address_index(Scheme::MlDsa87), 0);
        assert_eq!(canonical_address_index(Scheme::MlDsa65), 1);
    }

    #[test]
    fn ml_dsa_87_addresses_keep_the_upstream_vectors() {
        assert_eq!(
            derive(Scheme::MlDsa87, PHRASE, 0, 0, 0).address,
            "qzm5QCox8Dp5A3oSXZZYHD8YoYgPz7enykZb6RPUropdCyN5h"
        );
        assert_eq!(
            derive(Scheme::MlDsa87, PHRASE, 1, 0, 0).address,
            "qzmufPopkLKAwDmTzR5uXg8GMp5sUP48CqafJLUz3fPMSSGSh"
        );
    }

    /// The official `qp-rusty-crystals-hdwallet 4.1.1` crate vendors ML-DSA-65
    /// golden keypairs in `src/test_vectors_65.rs` (private to that crate). The
    /// public-key halves are pinned here by their leading 32 bytes (rho) and
    /// blake2-256 digest, so this wrapper is checked against the official
    /// vectors rather than against itself.
    #[test]
    fn ml_dsa_65_matches_official_hdwallet_golden_vectors() {
        let vectors: [(&str, (u32, u32, u32), &str, &str); 3] = [
            (
                "rocket primary way job input cactus submit menu zoo burger rent impose",
                (0, 0, 0),
                "46d51510251c9a7d6d54cb321551912d955689e461d0d1ea315dda6eb06b2299",
                "48339e7f6b33b659d79ff175c17d4ecf9f9fbaf5d1fbf59ad6f6cba3cccaf760",
            ),
            (
                "legal winner thank year wave sausage worth useful legal winner thank yellow",
                (1, 0, 0),
                "96c7ff12899bf41397010714bb3e92afc5aa24e8553df70a08b930111d3330b1",
                "2f83ef7aada58aceb34b69f0155896b319daf3346f02715db6cf78d071c2ddd8",
            ),
            (
                "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
                (0, 1, 0),
                "e0463cc8ffdb3f89395d1145238c95571b8ae0b2303586acf4f194d0f6a67f7a",
                "a4f4c0828d701311b0c7adc186c5d9cb64b93b957edd076cd5b49b733d20bf48",
            ),
        ];
        for (mnemonic, (account, change, index), rho, digest) in vectors {
            let keys = derive(Scheme::MlDsa65, mnemonic, account, change, index);
            assert_eq!(keys.scheme, Scheme::MlDsa65);
            assert_eq!(hex::encode(&keys.public_key[..32]), rho, "{mnemonic}");
            assert_eq!(hex::encode(blake2_256(&keys.public_key)), digest, "{mnemonic}");
        }
    }

    /// `qp-dilithium-crypto` derives its ML-DSA-65 pair from a phrase at
    /// `m/44'/189189'/0'/0'/0'`; the public key and Poseidon account must agree.
    #[test]
    fn ml_dsa_65_matches_qp_dilithium_crypto_from_phrase() {
        use sp_core::Pair;
        let (pair, _seed) = qp_dilithium_crypto::Dilithium65Pair::from_phrase(PHRASE, None).unwrap();
        let ours = derive(Scheme::MlDsa65, PHRASE, 0, 0, 0);
        assert_eq!(&ours.public_key[..], AsRef::<[u8]>::as_ref(&pair.public()));
        let canonical: sp_core::crypto::AccountId32 =
            sp_runtime::traits::IdentifyAccount::into_account(pair.public());
        assert_eq!(ours.account_id, AsRef::<[u8]>::as_ref(&canonical));

        let (pair87, _) = qp_dilithium_crypto::Dilithium87Pair::from_phrase(PHRASE, None).unwrap();
        let ours87 = derive(Scheme::MlDsa87, PHRASE, 0, 0, 0);
        assert_eq!(&ours87.public_key[..], AsRef::<[u8]>::as_ref(&pair87.public()));
    }

    /// Canonical default accounts (account index 0) for both schemes. Frozen so
    /// the JS bridge vectors and this crate cannot drift apart.
    #[test]
    fn canonical_accounts_for_the_bridge_vectors() {
        let index_65 = canonical_address_index(Scheme::MlDsa65);
        let index_87 = canonical_address_index(Scheme::MlDsa87);
        let a65 = derive(Scheme::MlDsa65, PHRASE, 0, 0, index_65);
        let a87 = derive(Scheme::MlDsa87, PHRASE, 0, 0, index_87);
        assert_eq!(a87.address, "qzm5QCox8Dp5A3oSXZZYHD8YoYgPz7enykZb6RPUropdCyN5h");
        assert_eq!(a65.address, "qzoyC4eRTrexYoutXABVsf61QJZxJim3iWvayRQwEjXWgA4mw");
        assert_ne!(a65.address, a87.address);
        // ML-DSA-65 at the ML-DSA-87 path component is a different account again.
        assert_ne!(derive(Scheme::MlDsa65, PHRASE, 0, 0, 0).address, a65.address);
        assert_eq!(a65.public_key.len(), 1952);
        assert_eq!(a87.public_key.len(), 2592);
    }

    #[test]
    fn invalid_inputs_are_rejected() {
        assert!(keypair_from_mnemonic(Scheme::MlDsa65, "not a mnemonic", None, 0, 0, 1).is_err());
        assert!(keypair_from_mnemonic(Scheme::MlDsa87, "not a mnemonic", None, 0, 0, 0).is_err());
        assert!(Scheme::parse("ml-dsa-44").is_none());
    }
}
