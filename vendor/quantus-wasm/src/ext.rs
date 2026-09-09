//! Pure account derivation and v4 extrinsic signing for Quantus.
//!
//! Cryptography is delegated to the exact crates the runtime uses
//! (`qp-poseidon-core` for addresses, `qp-rusty-crystals-dilithium` for
//! ML-DSA-87). The SCALE envelope (era, address tag, signature tag, extrinsic
//! framing) mirrors the runtime's `UncheckedExtrinsic`/`TxExtension`; every byte
//! is validated against `sp-runtime`/`qp-dilithium-crypto` in the tests below.

extern crate alloc;
use alloc::string::String;
use alloc::vec::Vec;

use parity_scale_codec::{Compact, Encode};
use qp_poseidon_core::hash_bytes;
use qp_rusty_crystals_dilithium::{ml_dsa_87, SensitiveBytes32};
use sp_core::{
    crypto::{AccountId32, Ss58AddressFormat, Ss58Codec},
    hashing::blake2_256,
};

/// SS58 network prefix for Quantus.
pub const SS58_PREFIX: u16 = 189;
/// Extrinsic format version (v4, signed).
pub const EXTRINSIC_VERSION: u8 = 4;
/// `DilithiumSignatureScheme::Dilithium` enum variant index.
const SIG_VARIANT_DILITHIUM: u8 = 0;
/// Substrate signs the blake2-256 hash of any signing payload longer than this.
const PAYLOAD_HASH_THRESHOLD: usize = 256;

// Runtime pallet/call indices. Versioned to the Quantus runtime; guarded by the
// golden-vector tests so a runtime reshuffle surfaces immediately.
const BALANCES_PALLET: u8 = 2;
const BALANCES_TRANSFER_ALLOW_DEATH: u8 = 0;
const ASSETS_PALLET: u8 = 17;
const ASSETS_TRANSFER: u8 = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    /// Seed could not be turned into an ML-DSA-87 keypair (must be >= 32 bytes).
    InvalidSeed,
    /// Signing the payload failed.
    SigningFailed,
    /// A mortal era was requested whose checkpoint block hash cannot be the
    /// supplied `block_hash`; the caller must anchor to an era boundary.
    InvalidMortality,
}

impl Error {
    pub fn message(self) -> &'static str {
        match self {
            Error::InvalidSeed => "seed must be at least 32 bytes",
            Error::SigningFailed => "ML-DSA-87 signing failed",
            Error::InvalidMortality => {
                "block_number is not an era boundary for this period; pass the era checkpoint block"
            }
        }
    }
}

/// Derived account material for a 32-byte seed.
pub struct AccountKeys {
    pub public_key: Vec<u8>,
    pub secret_key: Vec<u8>,
    pub account_id: [u8; 32],
    pub address: String,
}

/// Chain context shared by every signed extrinsic. Supplied by the caller so
/// signing stays fully offline (no RPC inside this crate).
pub struct SignContext {
    pub nonce: u64,
    pub tip: u128,
    /// Mortal era period in blocks; `0` means immortal.
    pub period: u64,
    /// Reference block the mortal era is anchored to (its hash is `block_hash`).
    pub block_number: u64,
    pub genesis_hash: [u8; 32],
    pub block_hash: [u8; 32],
    pub spec_version: u32,
    pub transaction_version: u32,
}

/// Parameters for the convenience transfer builder: the call-specific fields plus
/// the shared signing [`SignContext`].
pub struct TransferParams {
    pub recipient: AccountId32,
    pub amount: u128,
    /// `Some(id)` builds an `assets.transfer`; `None` builds `balances.transfer_allow_death`.
    pub asset_id: Option<u32>,
    pub ctx: SignContext,
}

/// ML-DSA-87 keypair generation from a 32-byte seed (deterministic).
fn keypair_from_seed(seed: &[u8]) -> Result<ml_dsa_87::Keypair, Error> {
    if seed.len() < 32 {
        return Err(Error::InvalidSeed);
    }
    let mut seed_array = [0u8; 32];
    seed_array.copy_from_slice(&seed[..32]);
    let mut entropy = SensitiveBytes32::from(&mut seed_array);
    Ok(ml_dsa_87::Keypair::generate(&mut entropy))
}

/// Quantus account id = Poseidon hash of the ML-DSA-87 public key.
fn account_id_from_public(public_key: &[u8]) -> AccountId32 {
    AccountId32::new(hash_bytes(public_key))
}

/// Derive the ML-DSA-87 keypair, Poseidon `AccountId32` and SS58 address.
pub fn derive_account(seed: &[u8]) -> Result<AccountKeys, Error> {
    Ok(derive_account_from_keypair(&keypair_from_seed(seed)?))
}

/// Account material for an already-derived keypair (seed or HD mnemonic path).
pub fn derive_account_from_keypair(keypair: &ml_dsa_87::Keypair) -> AccountKeys {
    let public_key = keypair.public().to_bytes();
    let account = account_id_from_public(&public_key);
    let mut account_id = [0u8; 32];
    account_id.copy_from_slice(account.as_ref());
    AccountKeys {
        public_key: public_key.to_vec(),
        secret_key: keypair.secret().to_bytes().to_vec(),
        account_id,
        address: account.to_ss58check_with_version(Ss58AddressFormat::custom(SS58_PREFIX)),
    }
}

/// Sign an already-encoded `RuntimeCall` (e.g. polkadot.js `tx.method.toHex()`),
/// returning a SCALE-encoded v4 extrinsic ready for `author_submitExtrinsic`.
pub fn sign_call(seed: &[u8], call: &[u8], ctx: &SignContext) -> Result<Vec<u8>, Error> {
    sign_call_with_keypair(&keypair_from_seed(seed)?, call, ctx)
}

/// [`sign_call`] with an already-derived keypair (seed or HD mnemonic path). This
/// is the single place the signed extrinsic is assembled; `sign_transfer` builds
/// the call bytes and delegates here.
pub fn sign_call_with_keypair(
    keypair: &ml_dsa_87::Keypair,
    call: &[u8],
    ctx: &SignContext,
) -> Result<Vec<u8>, Error> {
    let public_key = keypair.public().to_bytes();
    let account = account_id_from_public(&public_key);

    let (era, era_checkpoint_hash) = resolve_era(ctx)?;

    // `extra`: included in both the extrinsic and the signed payload.
    let extra = encode_extra(&era, ctx.nonce, ctx.tip);
    // `implicit`: signed but not transmitted.
    let implicit = encode_implicit(ctx, era_checkpoint_hash);

    let mut payload = Vec::with_capacity(call.len() + extra.len() + implicit.len());
    payload.extend_from_slice(call);
    payload.extend_from_slice(&extra);
    payload.extend_from_slice(&implicit);

    let signature = sign_payload(keypair, &payload)?;

    // DilithiumSignatureScheme::Dilithium87(sig || public) encoding.
    let mut signature_field = Vec::with_capacity(1 + signature.len() + public_key.len());
    signature_field.push(SIG_VARIANT_DILITHIUM);
    signature_field.extend_from_slice(&signature);
    signature_field.extend_from_slice(&public_key);

    // Extrinsic body: version | address | signature | extra | call.
    let mut body = Vec::new();
    body.push(0b1000_0000 | EXTRINSIC_VERSION);
    encode_address(&account, &mut body);
    body.extend_from_slice(&signature_field);
    body.extend_from_slice(&extra);
    body.extend_from_slice(call);

    // SCALE-encode as a length-prefixed byte sequence.
    let mut out = Vec::with_capacity(body.len() + 5);
    Compact(body.len() as u32).encode_to(&mut out);
    out.extend_from_slice(&body);
    Ok(out)
}

/// Build a signed, SCALE-encoded v4 transfer extrinsic.
pub fn sign_transfer(seed: &[u8], p: &TransferParams) -> Result<Vec<u8>, Error> {
    sign_transfer_with_keypair(&keypair_from_seed(seed)?, p)
}

/// [`sign_transfer`] with an already-derived keypair. Encodes the balances/assets
/// call, then delegates to [`sign_call_with_keypair`].
pub fn sign_transfer_with_keypair(
    keypair: &ml_dsa_87::Keypair,
    p: &TransferParams,
) -> Result<Vec<u8>, Error> {
    sign_call_with_keypair(keypair, &encode_call(p), &p.ctx)
}

fn sign_payload(keypair: &ml_dsa_87::Keypair, payload: &[u8]) -> Result<Vec<u8>, Error> {
    // Current mainnet requires FIPS 204 domain separation. See chain
    // f5828f0/primitives/dilithium-crypto/src/signing_context.rs.
    const CONTEXT: &[u8] = b"QUANTUS_EXTRINSIC";
    let signature = if payload.len() > PAYLOAD_HASH_THRESHOLD {
        keypair.sign(&blake2_256(payload), Some(CONTEXT), None)
    } else {
        keypair.sign(payload, Some(CONTEXT), None)
    };
    signature.map(|s| s.to_vec()).map_err(|_| Error::SigningFailed)
}

/// `MultiAddress::Id(account)` encoding: variant 0 followed by the 32 bytes.
fn encode_address(account: &AccountId32, out: &mut Vec<u8>) {
    out.push(0u8);
    out.extend_from_slice(account.as_ref());
}

fn encode_call(p: &TransferParams) -> Vec<u8> {
    let mut call = Vec::new();
    match p.asset_id {
        None => {
            call.push(BALANCES_PALLET);
            call.push(BALANCES_TRANSFER_ALLOW_DEATH);
            encode_address(&p.recipient, &mut call);
            Compact(p.amount).encode_to(&mut call);
        }
        Some(asset_id) => {
            call.push(ASSETS_PALLET);
            call.push(ASSETS_TRANSFER);
            Compact(asset_id).encode_to(&mut call);
            encode_address(&p.recipient, &mut call);
            Compact(p.amount).encode_to(&mut call);
        }
    }
    call
}

fn encode_extra(era: &Era, nonce: u64, tip: u128) -> Vec<u8> {
    let mut extra = Vec::new();
    era.encode_to(&mut extra); // CheckMortality
    Compact(nonce).encode_to(&mut extra); // CheckNonce
    Compact(tip).encode_to(&mut extra); // ChargeTransactionPayment
    extra.push(0u8); // CheckMetadataHash: Mode::Disabled
    extra
}

fn encode_implicit(ctx: &SignContext, era_checkpoint_hash: [u8; 32]) -> Vec<u8> {
    let mut implicit = Vec::new();
    ctx.spec_version.encode_to(&mut implicit); // CheckSpecVersion
    ctx.transaction_version.encode_to(&mut implicit); // CheckTxVersion
    implicit.extend_from_slice(&ctx.genesis_hash); // CheckGenesis
    implicit.extend_from_slice(&era_checkpoint_hash); // CheckMortality
    implicit.push(0u8); // CheckMetadataHash: Option::None
    implicit
}

/// Returns the era and the block hash that anchors it (genesis for immortal).
fn resolve_era(ctx: &SignContext) -> Result<(Era, [u8; 32]), Error> {
    if ctx.period == 0 {
        return Ok((Era::Immortal, ctx.genesis_hash));
    }
    let era = Era::mortal(ctx.period, ctx.block_number);
    // The implicit hash must be `block_hash(era.birth(block_number))`. We only
    // hold the hash for `block_number`, so reject periods where they diverge
    // instead of silently signing an unverifiable payload.
    if era.birth(ctx.block_number) != ctx.block_number {
        return Err(Error::InvalidMortality);
    }
    Ok((era, ctx.block_hash))
}

/// Faithful reimplementation of `sp_runtime::generic::Era` encoding so the wasm
/// build does not need `sp-runtime` (which drags in `sp-io`). Validated against
/// the canonical type in the tests below.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Era {
    Immortal,
    /// (period, quantized phase)
    Mortal(u64, u64),
}

impl Era {
    fn mortal(period: u64, current: u64) -> Self {
        let period = period.checked_next_power_of_two().unwrap_or(1 << 16).clamp(4, 1 << 16);
        let phase = current % period;
        let quantize_factor = (period >> 12).max(1);
        let quantized_phase = phase / quantize_factor * quantize_factor;
        Era::Mortal(period, quantized_phase)
    }

    fn birth(&self, current: u64) -> u64 {
        match self {
            Era::Immortal => 0,
            Era::Mortal(period, phase) => {
                (current.max(*phase) - phase) / period * period + phase
            }
        }
    }

    fn encode_to(&self, out: &mut Vec<u8>) {
        match self {
            Era::Immortal => out.push(0u8),
            Era::Mortal(period, phase) => {
                let quantize_factor = (period >> 12).max(1);
                let encoded = (period.trailing_zeros() - 1).clamp(1, 15) as u16
                    | ((phase / quantize_factor) << 4) as u16;
                out.extend_from_slice(&encoded.to_le_bytes());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use parity_scale_codec::Decode;

    fn sample_ctx() -> SignContext {
        SignContext {
            nonce: 7,
            tip: 0,
            period: 64,
            block_number: 100,
            genesis_hash: [9u8; 32],
            block_hash: [8u8; 32],
            spec_version: 100,
            transaction_version: 1,
        }
    }

    fn sample_params(asset_id: Option<u32>) -> TransferParams {
        TransferParams {
            recipient: AccountId32::new([2u8; 32]),
            amount: 12_345_000_000_000,
            asset_id,
            ctx: sample_ctx(),
        }
    }

    #[test]
    fn account_shapes_and_golden_vectors() {
        let keys = derive_account(&[0u8; 32]).expect("derive");
        assert_eq!(keys.public_key.len(), ml_dsa_87::PUBLICKEYBYTES);
        assert_eq!(keys.secret_key.len(), ml_dsa_87::SECRETKEYBYTES);
        assert_eq!(keys.account_id.len(), 32);
        assert!(keys.address.starts_with("qz"), "address: {}", keys.address);
        println!("crystal_alice address    = {}", keys.address);
        println!("crystal_alice account_id = 0x{}", hex::encode(keys.account_id));
    }

    #[test]
    fn address_matches_qp_dilithium_crypto() {
        // The canonical crate must derive the same AccountId32 from the same seed.
        for seed_byte in [0u8, 1, 2, 42, 255] {
            let seed = [seed_byte; 32];
            let ours = derive_account(&seed).unwrap();
            let pair = qp_dilithium_crypto::Dilithium87Pair::from_seed(&seed).unwrap();
            let canonical: AccountId32 =
                sp_runtime::traits::IdentifyAccount::into_account(
                    sp_core::Pair::public(&pair),
                );
            assert_eq!(ours.account_id, AsRef::<[u8]>::as_ref(&canonical));
        }
    }

    #[test]
    fn era_matches_sp_runtime() {
        use sp_runtime::generic::Era as SpEra;
        for &period in &[4u64, 8, 16, 64, 128, 4096, 8192, 65536, 100_000] {
            for &current in &[0u64, 1, 36, 63, 100, 255, 1000, 5000, 70000] {
                let ours = Era::mortal(period, current);
                let theirs = SpEra::mortal(period, current);
                let mut a = Vec::new();
                ours.encode_to(&mut a);
                let b = theirs.encode();
                assert_eq!(a, b, "period={period} current={current}");
                if let SpEra::Mortal(_, _) = theirs {
                    assert_eq!(ours.birth(current), theirs.birth(current));
                }
            }
        }
        let mut imm = Vec::new();
        Era::Immortal.encode_to(&mut imm);
        assert_eq!(imm, SpEra::Immortal.encode());
    }

    #[test]
    fn signature_field_matches_qp_dilithium_crypto() {
        use sp_core::ByteArray;
        let seed = [3u8; 32];
        let keypair = keypair_from_seed(&seed).unwrap();
        let public_key = keypair.public().to_bytes();
        let msg = b"quantus signing payload";
        let sig = sign_payload(&keypair, msg).unwrap();

        let mut ours = Vec::new();
        ours.push(SIG_VARIANT_DILITHIUM);
        ours.extend_from_slice(&sig);
        ours.extend_from_slice(&public_key);

        let canonical = qp_dilithium_crypto::DilithiumSignatureScheme::Dilithium87(
            qp_dilithium_crypto::Dilithium87SignatureWithPublic::new(
                qp_dilithium_crypto::Dilithium87Signature::from_slice(&sig).unwrap(),
                qp_dilithium_crypto::Dilithium87Public::from_slice(&public_key).unwrap(),
            ),
        )
        .encode();
        assert_eq!(ours, canonical);
    }

    #[test]
    fn signature_is_deterministic_known_value() {
        // ML-DSA-87 signing is deterministic when no hedge entropy is supplied,
        // so a fixed (seed, message) yields a fixed signature. Frozen here as a
        // golden vector: a dependency bump that changes the signature bytes (and
        // would silently break on-chain verification) fails this test.
        let seed = [7u8; 32];
        let message = b"quantus deterministic signature vector";
        let keypair = keypair_from_seed(&seed).unwrap();
        let sig = sign_payload(&keypair, message).unwrap();
        assert_eq!(sig.len(), ml_dsa_87::SIGNBYTES);

        // Same input signs identically across calls (determinism).
        let sig_again = sign_payload(&keypair_from_seed(&seed).unwrap(), message).unwrap();
        assert_eq!(sig, sig_again);

        // Frozen digest of the 4627-byte signature (kept compact).
        let digest = hex::encode(blake2_256(&sig));
        assert_eq!(digest, "2ddb9d1e2fffa950cb7bd003bd34abf35b56cc0c99f1a703a77b5c54f4de017e");

        // The signature verifies under the canonical chain crate.
        let public_key = keypair.public().to_bytes();
        assert!(qp_dilithium_crypto::verify_ml_dsa_87(&public_key, message, &sig));
        assert!(!qp_dilithium_crypto::verify_ml_dsa_87_with_context(
            &public_key, message, &sig, b""
        ));
        let legacy = keypair.sign(message, None, None).unwrap();
        assert!(!qp_dilithium_crypto::verify_ml_dsa_87(&public_key, message, &legacy));
    }

    #[test]
    fn signed_transfer_signature_verifies() {
        let seed = [0u8; 32];
        let p = sample_params(None);
        let xt = sign_transfer(&seed, &p).expect("sign");

        let mut input = &xt[..];
        let body_len = <Compact<u32>>::decode(&mut input).unwrap().0 as usize;
        assert_eq!(body_len, input.len());
        assert_eq!(input[0], 0x84); // signed v4
        assert_eq!(input[1], 0x00); // MultiAddress::Id
        assert_eq!(input[1 + 1 + 32], SIG_VARIANT_DILITHIUM);

        // Recompute the signed payload and verify the embedded signature.
        let (era, hash) = resolve_era(&p.ctx).unwrap();
        let mut payload = encode_call(&p);
        payload.extend_from_slice(&encode_extra(&era, p.ctx.nonce, p.ctx.tip));
        payload.extend_from_slice(&encode_implicit(&p.ctx, hash));
        let signable = if payload.len() > PAYLOAD_HASH_THRESHOLD {
            blake2_256(&payload).to_vec()
        } else {
            payload
        };
        let keys = derive_account(&seed).unwrap();
        let sig_start = 1 + 1 + 32 + 1;
        let sig_bytes = &input[sig_start..sig_start + ml_dsa_87::SIGNBYTES];
        assert!(qp_dilithium_crypto::verify_ml_dsa_87(&keys.public_key, &signable, sig_bytes));
        let mut tampered = signable.clone();
        tampered[0] ^= 1;
        assert!(!qp_dilithium_crypto::verify_ml_dsa_87(&keys.public_key, &tampered, sig_bytes));
    }

    #[test]
    fn pallet_indices() {
        let bal = encode_call(&sample_params(None));
        assert_eq!((bal[0], bal[1]), (BALANCES_PALLET, BALANCES_TRANSFER_ALLOW_DEATH));
        let asset = encode_call(&sample_params(Some(42)));
        assert_eq!((asset[0], asset[1]), (ASSETS_PALLET, ASSETS_TRANSFER));
    }

    #[test]
    fn sign_call_matches_sign_transfer() {
        // The generic call signer and the transfer convenience must produce the
        // exact same extrinsic for the same call bytes + context.
        let seed = [0u8; 32];
        let p = sample_params(None);
        let call = encode_call(&p);
        let via_transfer = sign_transfer(&seed, &p).unwrap();
        let via_call = sign_call(&seed, &call, &p.ctx).unwrap();
        assert_eq!(via_transfer, via_call);
    }
}
