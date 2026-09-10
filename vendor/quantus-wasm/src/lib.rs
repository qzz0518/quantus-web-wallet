//! WASM bindings for Quantus account derivation and ML-DSA-65 / ML-DSA-87
//! extrinsic signing.
//!
//! Exposes to JavaScript/TypeScript:
//! - [`account`]: 32-byte seed -> ML-DSA-87 keypair, Poseidon `AccountId32`, SS58 address.
//! - [`signTransfer`] / [`signCall`]: 32-byte seed + params -> signed v4 extrinsic bytes.
//! - the `mnemonic` feature adds HD derivation and signing for both schemes.

extern crate alloc;
use alloc::string::String;
use alloc::vec::Vec;

use serde::Deserialize;
use sp_core::crypto::AccountId32;
use wasm_bindgen::prelude::*;

mod ext;

#[cfg(feature = "mnemonic")]
mod mnemonic;

/// Account material derived from a seed. Byte fields surface as `Uint8Array`.
#[wasm_bindgen]
pub struct Account {
    scheme: ext::Scheme,
    public_key: Vec<u8>,
    secret_key: Vec<u8>,
    account_id: Vec<u8>,
    address: String,
}

impl Drop for Account {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.secret_key.zeroize();
    }
}

#[wasm_bindgen]
impl Account {
    /// `"ml-dsa-65"` or `"ml-dsa-87"`.
    #[wasm_bindgen(getter)]
    pub fn scheme(&self) -> String {
        String::from(self.scheme.name())
    }

    /// ML-DSA public key (1952 bytes for ML-DSA-65, 2592 bytes for ML-DSA-87).
    #[wasm_bindgen(getter, js_name = publicKey)]
    pub fn public_key(&self) -> Vec<u8> {
        self.public_key.clone()
    }

    /// ML-DSA secret key (4032 bytes for ML-DSA-65, 4896 bytes for ML-DSA-87).
    #[wasm_bindgen(getter, js_name = secretKey)]
    pub fn secret_key(&self) -> Vec<u8> {
        self.secret_key.clone()
    }

    /// 32-byte Poseidon `AccountId32`.
    #[wasm_bindgen(getter, js_name = accountId)]
    pub fn account_id(&self) -> Vec<u8> {
        self.account_id.clone()
    }

    /// SS58 address encoded with the Quantus prefix (189).
    #[wasm_bindgen(getter)]
    pub fn address(&self) -> String {
        self.address.clone()
    }
}

/// Derive an ML-DSA-87 Quantus account from a 32-byte seed.
#[wasm_bindgen]
pub fn account(seed: &[u8]) -> Result<Account, JsError> {
    let keys = ext::derive_account(seed).map_err(to_js_error)?;
    Ok(account_from_keys(keys))
}

pub(crate) fn account_from_keys(keys: ext::AccountKeys) -> Account {
    Account {
        scheme: keys.scheme,
        public_key: keys.public_key,
        secret_key: keys.secret_key,
        account_id: keys.account_id.to_vec(),
        address: keys.address,
    }
}

pub(crate) fn parse_scheme(name: &str) -> Result<ext::Scheme, JsError> {
    ext::Scheme::parse(name).ok_or_else(|| JsError::new("scheme must be ml-dsa-65 or ml-dsa-87"))
}

/// Chain signing context as received from JS (camelCase fields).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsSignContext {
    nonce: u64,
    /// Tip in plancks as a decimal string (u128); defaults to "0".
    #[serde(default)]
    tip: Option<String>,
    /// Mortal era period in blocks; `0`/omitted means immortal.
    #[serde(default)]
    period: u64,
    /// Reference block number the mortal era is anchored to.
    #[serde(default)]
    block_number: u64,
    /// `0x`-hex genesis block hash.
    genesis_hash: String,
    /// `0x`-hex reference block hash (required for mortal eras).
    #[serde(default)]
    block_hash: Option<String>,
    spec_version: u32,
    transaction_version: u32,
}

/// Transfer parameters: call-specific fields plus the shared signing context.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsTransferParams {
    /// SS58 (prefix 189) or `0x`-hex 32-byte recipient `AccountId32`.
    recipient: String,
    /// Amount in plancks as a decimal string (u128).
    amount: String,
    /// Optional asset id; when present an `assets.transfer` is built.
    #[serde(default)]
    asset_id: Option<u32>,
    #[serde(flatten)]
    ctx: JsSignContext,
}

/// Sign a balances/assets transfer with the ML-DSA-87 seed account, returning
/// the SCALE-encoded v4 extrinsic.
#[wasm_bindgen(js_name = signTransfer)]
pub fn sign_transfer(seed: &[u8], params: JsValue) -> Result<Vec<u8>, JsError> {
    let params = build_transfer_params(params)?;
    ext::sign_transfer(seed, &params).map_err(to_js_error)
}

/// Sign an already-encoded `RuntimeCall` (e.g. polkadot.js `tx.method.toU8a()`)
/// with the ML-DSA-87 seed account, returning the SCALE-encoded v4 extrinsic.
#[wasm_bindgen(js_name = signCall)]
pub fn sign_call(seed: &[u8], call: &[u8], context: JsValue) -> Result<Vec<u8>, JsError> {
    let ctx = build_sign_context_from_value(context)?;
    ext::sign_call(seed, call, &ctx).map_err(to_js_error)
}

/// Verify a raw ML-DSA-87 signature using the mainnet extrinsic domain.
/// Used to check browser signing against native runtime compatibility tests.
#[wasm_bindgen(js_name = verifySignature)]
pub fn verify_signature(public_key: &[u8], message: &[u8], signature: &[u8]) -> bool {
    ext::verify_signature(ext::Scheme::MlDsa87, public_key, message, signature)
}

/// Verify a raw signature of the named scheme using the mainnet extrinsic domain.
#[wasm_bindgen(js_name = verifySignatureScheme)]
pub fn verify_signature_scheme(
    scheme: &str,
    public_key: &[u8],
    message: &[u8],
    signature: &[u8],
) -> Result<bool, JsError> {
    Ok(ext::verify_signature(parse_scheme(scheme)?, public_key, message, signature))
}

/// Variant index the runtime's `DilithiumSignatureScheme` / `DilithiumSigner`
/// enums use for the named scheme (`0` = ML-DSA-87, `1` = ML-DSA-65).
#[wasm_bindgen(js_name = signatureVariant)]
pub fn signature_variant(scheme: &str) -> Result<u8, JsError> {
    Ok(parse_scheme(scheme)?.signature_variant())
}

pub(crate) fn build_transfer_params(params: JsValue) -> Result<ext::TransferParams, JsError> {
    let p: JsTransferParams = serde_wasm_bindgen::from_value(params)
        .map_err(|e| JsError::new(&alloc::format!("invalid params: {e}")))?;

    Ok(ext::TransferParams {
        recipient: parse_account_id(&p.recipient)?,
        amount: parse_u128(&p.amount, "amount")?,
        asset_id: p.asset_id,
        ctx: build_sign_context(&p.ctx)?,
    })
}

pub(crate) fn build_sign_context_from_value(context: JsValue) -> Result<ext::SignContext, JsError> {
    let c: JsSignContext = serde_wasm_bindgen::from_value(context)
        .map_err(|e| JsError::new(&alloc::format!("invalid params: {e}")))?;
    build_sign_context(&c)
}

fn build_sign_context(c: &JsSignContext) -> Result<ext::SignContext, JsError> {
    Ok(ext::SignContext {
        nonce: c.nonce,
        tip: match c.tip {
            Some(ref s) => parse_u128(s, "tip")?,
            None => 0,
        },
        period: c.period,
        block_number: c.block_number,
        genesis_hash: parse_h256(&c.genesis_hash, "genesisHash")?,
        block_hash: match c.block_hash {
            Some(ref s) => parse_h256(s, "blockHash")?,
            None => [0u8; 32],
        },
        spec_version: c.spec_version,
        transaction_version: c.transaction_version,
    })
}

pub(crate) fn to_js_error(e: ext::Error) -> JsError {
    JsError::new(e.message())
}

fn parse_account_id(s: &str) -> Result<AccountId32, JsError> {
    let s = s.trim();
    if let Some(hexstr) = s.strip_prefix("0x") {
        let bytes = hex::decode(hexstr).map_err(|_| JsError::new("recipient: invalid hex"))?;
        let arr: [u8; 32] = bytes
            .try_into()
            .map_err(|_| JsError::new("recipient: expected 32 bytes"))?;
        Ok(AccountId32::new(arr))
    } else {
        use sp_core::crypto::Ss58Codec;
        AccountId32::from_ss58check_with_version(s)
            .map(|(account, _version)| account)
            .map_err(|_| JsError::new("recipient: invalid SS58 address"))
    }
}

fn parse_h256(s: &str, field: &str) -> Result<[u8; 32], JsError> {
    let s = s.trim();
    let hexstr = s.strip_prefix("0x").unwrap_or(s);
    let bytes =
        hex::decode(hexstr).map_err(|_| JsError::new(&alloc::format!("{field}: invalid hex")))?;
    bytes
        .try_into()
        .map_err(|_| JsError::new(&alloc::format!("{field}: expected 32 bytes")))
}

fn parse_u128(s: &str, field: &str) -> Result<u128, JsError> {
    s.trim()
        .parse::<u128>()
        .map_err(|_| JsError::new(&alloc::format!("{field}: invalid u128 decimal string")))
}
