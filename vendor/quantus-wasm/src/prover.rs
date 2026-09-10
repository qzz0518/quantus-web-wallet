//! In-browser Wormhole exit prover (feature `wormhole-prover`).
//!
//! Turns up to [`NUM_LEAF_PROOFS`] deposits owned by the phrase's Wormhole
//! keys into one private-batch proof for `wormhole.verifyPrivateBatch`, using
//! the official circuit crates pinned by the Quantus mainnet runtime
//! (`qp-wormhole-circuit`, `-prover`, `-aggregator`, `-inputs`,
//! `qp-zk-circuits-common` 4.3.0 and `qp-plonky2` 1.5.5):
//!
//! 1. every input is re-derived from the phrase and checked against the
//!    chain-supplied leaf (recipient, transfer count, amount, leaf hash) and
//!    Merkle path, and the referenced block header is re-hashed;
//! 2. one leaf proof per deposit, padded with the official dummy leaf proof,
//!    is aggregated by the official private-batch circuit;
//! 3. the result is verified exactly like the pallet does — serialized
//!    verifier artifacts pinned to the bytes embedded in mainnet runtime 152,
//!    canonical-encoding round trip, public-input parsing, plonky2 verify —
//!    and its public inputs are compared with what the caller asked for.
//!
//! Secrets stay inside this module: the seed, the derived Wormhole pairs and
//! the circuit secret felts are zeroized by their owners; only proof bytes and
//! the decoded public inputs are returned.

extern crate alloc;
use alloc::string::String;
use alloc::vec::Vec;

use plonky2::field::types::PrimeField64;
use plonky2::iop::witness::PartialWitness;
use plonky2::plonk::circuit_data::{CircuitData, VerifierCircuitData, VerifierOnlyCircuitData};
use plonky2::plonk::proof::ProofWithPublicInputs;
use plonky2::util::serialization::DefaultGateSerializer;
use qp_poseidon_core::serialization::{bytes_to_u64s_compact, u64_to_felts, AMOUNT_QUANTIZATION_FACTOR};
use qp_poseidon_core::{hash_to_bytes, Goldilocks};
use qp_wormhole_aggregator::private_batch::prover::PrivateBatchProver;
use qp_wormhole_aggregator::{build_dummy_circuit_inputs, generate_dummy_proof};
use qp_wormhole_circuit::block_header::header::{HeaderInputs, DIGEST_LOGS_SIZE};
use qp_wormhole_circuit::circuit::circuit_logic::WormholeCircuit;
use qp_wormhole_circuit::inputs::{CircuitInputs, PrivateCircuitInputs};
use qp_wormhole_circuit::nullifier::Nullifier;
use qp_wormhole_circuit::unspendable_account::UnspendableAccount;
use qp_wormhole_inputs::{BytesDigest, PrivateBatchPublicInputs, PublicCircuitInputs};
use qp_wormhole_prover::{fill_witness, WormholeProver};
use qp_wormhole_verifier::{
    parse_private_batch_public_inputs, CircuitConfig as VerifierCircuitConfig,
    CommonCircuitData as VerifierCommonData, ProofWithPublicInputs as VerifierProof,
    VerifierCircuitData as OfficialVerifierData, VerifierOnlyCircuitData as OfficialVerifierOnly,
    WormholeVerifier, MIN_LEAF_SECURITY_BITS,
};
use qp_zk_circuits_common::circuit::{
    wormhole_leaf_circuit_config, wormhole_private_batch_circuit_config, C, D, F,
};
use qp_zk_circuits_common::utils::digest_to_bytes;
use qp_zk_circuits_common::zk_merkle::{ZkMerkleProof, MAX_DEPTH, SIBLINGS_PER_LEVEL};
use serde::{Deserialize, Serialize};
use sp_core::crypto::{AccountId32, Ss58Codec};
use wasm_bindgen::prelude::*;

use crate::wormhole::{nullifier_from_secret, pair_at, seed_from_mnemonic};

/// Leaf proofs per private batch (`QP_NUM_LEAF_PROOFS` default of
/// `pallets/wormhole/build.rs`; mainnet runtime 152 is built with it).
pub const NUM_LEAF_PROOFS: usize = 7;
/// Version of the official circuit crates this module is compiled against.
pub const CIRCUIT_VERSION: &str = "4.3.0";
/// `pallet_wormhole::SCALE_DOWN_FACTOR`: planck per circuit amount unit.
pub const QUANTUM_PLANCK: u128 = AMOUNT_QUANTIZATION_FACTOR;
/// `pallet_wormhole::MAX_PROOF_BYTES`.
pub const MAX_PROOF_BYTES: usize = 512 * 1024;
/// Private-batch public inputs: 8 header felts + 22 per leaf.
pub const PRIVATE_BATCH_PUBLIC_INPUTS: usize = 8 + NUM_LEAF_PROOFS * 22;
/// blake2-256 of the serialized private-batch verifier-only data. These
/// exact bytes are embedded in the mainnet runtime 152 wasm
/// (`private_batch_verifier.bin`, see PROVENANCE.md), so a proof that
/// verifies against them verifies on chain.
pub const PRIVATE_BATCH_VERIFIER_BLAKE2: &str =
    "2837095057dc397e73616f4c6490f05a9b42c90044097bd465d44516aef51fa9";
/// blake2-256 of the serialized private-batch common circuit data
/// (`private_batch_common.bin` in the same runtime).
pub const PRIVATE_BATCH_COMMON_BLAKE2: &str =
    "575bfae2b0a1ad5f273242d0d344c0b623d77f1df868a39ac7062d8e715dfd88";
/// Poseidon circuit digest of the private-batch circuit (hex of the 4 felts).
pub const PRIVATE_BATCH_CIRCUIT_DIGEST: &str =
    "e912c68ce58e801247829313c4a0f9e12d6c24f501e617252de459b67b624549";

const GOLDILOCKS_P: u64 = 0xFFFF_FFFF_0000_0001;
const BPS_DENOMINATOR: u64 = 10_000;
const LEAF_DATA_LEN: usize = 32 + 8 + 4 + 16;

/// One deposit to prove, as read from the chain by the caller.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitInput {
    /// Derivation branch (0 receive, 1 change) and index of the deposit address.
    pub branch: u32,
    pub index: u32,
    /// Per-recipient transfer counter recorded in the leaf (decimal).
    pub transfer_count: String,
    /// Position of the leaf in the zk tree (decimal).
    pub leaf_index: String,
    /// Deposit amount in planck (decimal).
    pub amount_planck: String,
    /// SCALE `ZkLeaf` from `zkTree_getMerkleProof` (`0x` hex, 60 bytes).
    pub leaf_data: String,
    /// Leaf hash reported by the node (`0x` hex).
    pub leaf_hash: String,
    /// Unsorted sibling hashes per level (3 per level, `0x` hex).
    pub siblings: Vec<[String; SIBLINGS_PER_LEVEL]>,
}

/// Header of the block the proof references, from `chain_getHeader`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitHeader {
    pub parent_hash: String,
    pub number: u32,
    pub state_root: String,
    pub extrinsics_root: String,
    pub zk_tree_root: String,
    /// SCALE-encoded digest logs, exactly `DIGEST_LOGS_SIZE` (110) bytes.
    pub digest: String,
    /// Canonical hash of this block as returned by `chain_getBlockHash`.
    pub block_hash: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitRequest {
    pub inputs: Vec<ExitInput>,
    pub header: ExitHeader,
    /// zk tree root reported with the Merkle proofs; must equal the header's.
    pub tree_root: String,
    /// SS58 (prefix 189) or `0x` hex account that receives the exit.
    pub exit_address: String,
    /// `Wormhole.VolumeFeeRateBps` read from the chain.
    pub volume_fee_bps: u32,
    /// `Vesting.PayoutQuantum` read from the chain (decimal planck).
    pub quantum_planck: String,
    #[serde(default)]
    pub passphrase: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExitOutput {
    pub account: String,
    pub amount_quanta: String,
    pub amount_planck: String,
}

/// Proof bytes plus the public inputs the chain will read from them.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExitProof {
    /// Always `"private-batch"`: submit with `wormhole.verifyPrivateBatch`.
    pub kind: String,
    pub proof_hex: String,
    pub proof_bytes: usize,
    pub asset_id: u32,
    pub volume_fee_bps: u32,
    pub block_number: u32,
    pub block_hash: String,
    /// Nullifiers published by the proof (real ones first, then padding).
    pub nullifiers: Vec<String>,
    /// Nullifiers of the supplied inputs, in input order.
    pub input_nullifiers: Vec<String>,
    pub exits: Vec<ExitOutput>,
    pub input_quanta: String,
    pub output_quanta: String,
    pub num_leaf_proofs: usize,
    pub circuit_version: String,
    pub circuit_digest: String,
    /// Canonical u64 values of every public input felt.
    pub public_inputs: Vec<String>,
}

fn parse_hex(field: &str, value: &str) -> Result<Vec<u8>, String> {
    let s = value.trim();
    let s = s.strip_prefix("0x").unwrap_or(s);
    hex::decode(s).map_err(|_| alloc::format!("{field}: invalid hex"))
}

fn parse_h256(field: &str, value: &str) -> Result<[u8; 32], String> {
    parse_hex(field, value)?
        .try_into()
        .map_err(|_| alloc::format!("{field}: expected 32 bytes"))
}

fn parse_u64(field: &str, value: &str) -> Result<u64, String> {
    value.trim().parse::<u64>().map_err(|_| alloc::format!("{field}: invalid u64 decimal"))
}

fn parse_u128(field: &str, value: &str) -> Result<u128, String> {
    value.trim().parse::<u128>().map_err(|_| alloc::format!("{field}: invalid u128 decimal"))
}

fn hex32(bytes: &[u8; 32]) -> String {
    alloc::format!("0x{}", hex::encode(bytes))
}

/// Reduce each 8-byte little-endian limb mod the Goldilocks prime, exactly
/// like the lossy header/leaf encodings on chain (`bytes_to_digest_lossy`,
/// `canonicalize_account_bytes`). Canonical inputs are unchanged.
pub fn canonicalize_limbs(bytes: [u8; 32]) -> [u8; 32] {
    let mut out = bytes;
    for limb in out.chunks_exact_mut(8) {
        let value = u64::from_le_bytes(limb.try_into().expect("8-byte limb"));
        if value >= GOLDILOCKS_P {
            limb.copy_from_slice(&(value - GOLDILOCKS_P).to_le_bytes());
        }
    }
    out
}

fn digest(field: &str, bytes: [u8; 32]) -> Result<BytesDigest, String> {
    BytesDigest::try_from(bytes).map_err(|e| alloc::format!("{field}: {e}"))
}

/// Leaf hash of `pallet_zk_tree::tree::hash_leaf`: 4 compact felts of the
/// recipient, 2 felts of the transfer count, 1 felt asset id, 1 felt
/// quantized amount, Poseidon2 without padding.
pub fn leaf_hash(to: &[u8; 32], transfer_count: u64, asset_id: u32, amount_quanta: u32) -> [u8; 32] {
    let mut felts: Vec<Goldilocks> = Vec::with_capacity(8);
    felts.extend(bytes_to_u64s_compact(to).into_iter().map(Goldilocks::from_u64));
    felts.extend(u64_to_felts(transfer_count));
    felts.extend(bytes_to_u64s_compact(&(asset_id as u64).to_le_bytes()).into_iter().map(Goldilocks::from_u64));
    felts.extend(bytes_to_u64s_compact(&(amount_quanta as u64).to_le_bytes()).into_iter().map(Goldilocks::from_u64));
    hash_to_bytes(&felts)
}

/// Decoded SCALE `ZkLeaf<AccountId32, u32, u128>`.
pub struct LeafData {
    pub to: [u8; 32],
    pub transfer_count: u64,
    pub asset_id: u32,
    pub amount: u128,
}

pub fn decode_leaf(bytes: &[u8]) -> Result<LeafData, String> {
    if bytes.len() != LEAF_DATA_LEN {
        return Err(alloc::format!("leafData: expected {LEAF_DATA_LEN} bytes, got {}", bytes.len()));
    }
    Ok(LeafData {
        to: bytes[..32].try_into().expect("32 bytes"),
        transfer_count: u64::from_le_bytes(bytes[32..40].try_into().expect("8 bytes")),
        asset_id: u32::from_le_bytes(bytes[40..44].try_into().expect("4 bytes")),
        amount: u128::from_le_bytes(bytes[44..60].try_into().expect("16 bytes")),
    })
}

/// Block hash of the Quantus header (`qp-header` `Header::hash`), recomputed
/// with the circuit's own header gadget inputs.
pub fn header_inputs(header: &ExitHeader) -> Result<HeaderInputs, String> {
    let digest_bytes = parse_hex("header.digest", &header.digest)?;
    let digest_arr: [u8; DIGEST_LOGS_SIZE] = digest_bytes
        .try_into()
        .map_err(|_| alloc::format!("header.digest: expected exactly {DIGEST_LOGS_SIZE} bytes"))?;
    HeaderInputs::new(
        digest("header.parentHash", canonicalize_limbs(parse_h256("header.parentHash", &header.parent_hash)?))?,
        header.number,
        digest("header.stateRoot", canonicalize_limbs(parse_h256("header.stateRoot", &header.state_root)?))?,
        digest("header.extrinsicsRoot", canonicalize_limbs(parse_h256("header.extrinsicsRoot", &header.extrinsics_root)?))?,
        digest("header.zkTreeRoot", canonicalize_limbs(parse_h256("header.zkTreeRoot", &header.zk_tree_root)?))?,
        &digest_arr,
    )
    .map_err(|e| alloc::format!("header: {e}"))
}

pub fn parse_account(field: &str, value: &str) -> Result<[u8; 32], String> {
    let s = value.trim();
    if s.starts_with("0x") {
        return parse_h256(field, s);
    }
    AccountId32::from_ss58check_with_version(s)
        .map(|(account, _)| *account.as_ref())
        .map_err(|_| alloc::format!("{field}: invalid SS58 address"))
}

/// Output quanta the segment fee relation allows for `input` quanta:
/// `out · 10000 ≤ input · (10000 − bps)` (private-batch circuit).
pub fn max_output_quanta(input_quanta: u64, volume_fee_bps: u32) -> Result<u64, String> {
    if volume_fee_bps as u64 >= BPS_DENOMINATOR {
        return Err(String::from("volumeFeeBps must be below 10000"));
    }
    let complement = BPS_DENOMINATOR - volume_fee_bps as u64;
    input_quanta
        .checked_mul(complement)
        .map(|v| v / BPS_DENOMINATOR)
        .ok_or_else(|| String::from("amount overflow"))
}

/// Per-leaf output amounts: each leaf keeps its own rounded share and the
/// remainder of the segment optimum goes to the largest deposit.
fn distribute_outputs(inputs: &[u32], volume_fee_bps: u32) -> Result<(u64, Vec<u32>), String> {
    let total_in: u64 = inputs.iter().map(|&q| q as u64).sum();
    let total_out = max_output_quanta(total_in, volume_fee_bps)?;
    if total_out == 0 {
        return Err(String::from("deposits are too small: nothing is left after the volume fee"));
    }
    let mut outs: Vec<u64> = inputs
        .iter()
        .map(|&q| max_output_quanta(q as u64, volume_fee_bps))
        .collect::<Result<_, _>>()?;
    let assigned: u64 = outs.iter().sum();
    let largest = inputs
        .iter()
        .enumerate()
        .max_by_key(|(_, q)| **q)
        .map(|(i, _)| i)
        .ok_or_else(|| String::from("no inputs"))?;
    outs[largest] += total_out - assigned;
    let outs = outs
        .into_iter()
        .map(|o| u32::try_from(o).map_err(|_| String::from("output exceeds u32 quanta")))
        .collect::<Result<Vec<u32>, _>>()?;
    Ok((total_out, outs))
}

struct PreparedInput {
    circuit: CircuitInputs,
    nullifier: [u8; 32],
    amount_quanta: u32,
}

fn prepare_inputs(
    mnemonic: &str,
    passphrase: Option<&str>,
    request: &ExitRequest,
    header: &HeaderInputs,
    block_hash: BytesDigest,
    exit_account: BytesDigest,
) -> Result<Vec<PreparedInput>, String> {
    let n = request.inputs.len();
    if n == 0 || n > NUM_LEAF_PROOFS {
        return Err(alloc::format!("between 1 and {NUM_LEAF_PROOFS} inputs are required"));
    }
    let tree_root = parse_h256("treeRoot", &request.tree_root)?;
    let zk_tree_root = digest_to_bytes(header.zk_tree_root);
    if *zk_tree_root != tree_root {
        return Err(String::from("treeRoot does not match header.zkTreeRoot"));
    }
    let seed = seed_from_mnemonic(mnemonic, passphrase)?;
    let mut prepared = Vec::with_capacity(n);
    let mut seen_leaves = alloc::collections::BTreeSet::new();
    for (position, input) in request.inputs.iter().enumerate() {
        let label = alloc::format!("inputs[{position}]");
        let pair = pair_at(&seed, input.branch, input.index)?;
        let address = *pair.address();
        let secret_bytes = *pair.secret().as_bytes();
        let secret = digest(&alloc::format!("{label}.secret"), secret_bytes)?;
        // The circuit binds the leaf recipient to H(H("wormhole" || secret)).
        let unspendable = UnspendableAccount::from_secret(secret);
        if *digest_to_bytes(unspendable.account_id) != address {
            return Err(alloc::format!("{label}: derived address does not match the circuit account"));
        }
        let leaf = decode_leaf(&parse_hex(&alloc::format!("{label}.leafData"), &input.leaf_data)?)?;
        if leaf.to != address && leaf.to != canonicalize_limbs(address) {
            return Err(alloc::format!("{label}: leaf recipient is not the derived address"));
        }
        let transfer_count = parse_u64(&alloc::format!("{label}.transferCount"), &input.transfer_count)?;
        if leaf.transfer_count != transfer_count {
            return Err(alloc::format!("{label}: leaf transfer count mismatch"));
        }
        if leaf.asset_id != 0 {
            return Err(alloc::format!("{label}: only native deposits (asset 0) can exit"));
        }
        let amount = parse_u128(&alloc::format!("{label}.amountPlanck"), &input.amount_planck)?;
        if leaf.amount != amount {
            return Err(alloc::format!("{label}: leaf amount mismatch"));
        }
        let amount_quanta = u32::try_from(amount / QUANTUM_PLANCK)
            .map_err(|_| alloc::format!("{label}: amount exceeds the circuit range"))?;
        if amount_quanta == 0 {
            return Err(alloc::format!("{label}: deposit is below one quantum"));
        }
        let expected_leaf_hash = leaf_hash(&leaf.to, transfer_count, 0, amount_quanta);
        let reported_leaf_hash = parse_h256(&alloc::format!("{label}.leafHash"), &input.leaf_hash)?;
        if expected_leaf_hash != reported_leaf_hash {
            return Err(alloc::format!("{label}: leaf hash does not match the leaf data"));
        }
        if !seen_leaves.insert(reported_leaf_hash) {
            return Err(alloc::format!("{label}: duplicate deposit"));
        }
        let leaf_index = parse_u64(&alloc::format!("{label}.leafIndex"), &input.leaf_index)?;
        if input.siblings.len() > MAX_DEPTH {
            return Err(alloc::format!("{label}: Merkle proof deeper than {MAX_DEPTH}"));
        }
        let mut siblings = Vec::with_capacity(input.siblings.len());
        for (level, level_siblings) in input.siblings.iter().enumerate() {
            let mut arr = [[0u8; 32]; SIBLINGS_PER_LEVEL];
            for (slot, value) in level_siblings.iter().enumerate() {
                arr[slot] = parse_h256(&alloc::format!("{label}.siblings[{level}][{slot}]"), value)?;
            }
            siblings.push(arr);
        }
        let merkle = ZkMerkleProof::from_unsorted(leaf_index, siblings, reported_leaf_hash, tree_root)
            .map_err(|e| alloc::format!("{label}: {e}"))?;
        if !merkle.verify() {
            return Err(alloc::format!("{label}: Merkle proof does not reach the zk tree root"));
        }
        let nullifier = Nullifier::from_preimage(secret, transfer_count);
        let nullifier_bytes = *digest_to_bytes(nullifier.hash);
        // Two independent implementations of the nullifier must agree.
        if nullifier_from_secret(&secret_bytes, transfer_count)? != nullifier_bytes {
            return Err(alloc::format!("{label}: nullifier implementations disagree"));
        }
        let circuit = CircuitInputs {
            public: PublicCircuitInputs {
                asset_id: 0,
                output_amount_1: 0,
                output_amount_2: 0,
                volume_fee_bps: request.volume_fee_bps,
                nullifier: digest_to_bytes(nullifier.hash),
                exit_account_1: exit_account,
                exit_account_2: BytesDigest::default(),
                block_hash,
                block_number: request.header.number,
                input_amount: amount_quanta,
            },
            private: PrivateCircuitInputs {
                secret: secret.into(),
                transfer_count,
                unspendable_account: digest(&alloc::format!("{label}.address"), address)?,
                parent_hash: digest_to_bytes(header.parent_hash),
                state_root: digest_to_bytes(header.state_root),
                extrinsics_root: digest_to_bytes(header.extrinsics_root),
                digest: parse_hex("header.digest", &request.header.digest)?
                    .try_into()
                    .map_err(|_| String::from("header.digest: invalid length"))?,
                zk_tree_root: tree_root,
                zk_merkle_siblings: merkle.siblings.clone(),
                zk_merkle_positions: merkle.positions.clone(),
            },
        };
        prepared.push(PreparedInput { circuit, nullifier: nullifier_bytes, amount_quanta });
    }
    Ok(prepared)
}

fn leaf_circuit() -> Result<(CircuitData<F, C, D>, qp_wormhole_circuit::circuit::circuit_logic::CircuitTargets), String> {
    let circuit = WormholeCircuit::new(wormhole_leaf_circuit_config()).map_err(|e| alloc::format!("leaf circuit: {e}"))?;
    let targets = circuit.targets();
    Ok((circuit.build_circuit(), targets))
}

/// The pallet's `ensure_batch_verifier_profile` for the private batch.
fn ensure_private_batch_profile(common: &VerifierCommonData<F, D>) -> Result<(), String> {
    let expected = VerifierCircuitConfig {
        num_wires: 135,
        num_routed_wires: 60,
        ..VerifierCircuitConfig::standard_recursion_zk_config()
    };
    if common.config != expected {
        return Err(String::from("circuit config does not match the canonical batch circuit config"));
    }
    if common.config.security_bits < MIN_LEAF_SECURITY_BITS {
        return Err(String::from("circuit config is below the minimum security-bits floor"));
    }
    if common.num_public_inputs != PRIVATE_BATCH_PUBLIC_INPUTS {
        return Err(String::from("public-input count does not match the compiled batch dimensions"));
    }
    Ok(())
}

/// Serialized verifier artifacts of the rebuilt private-batch circuit,
/// checked against the bytes embedded in mainnet runtime 152.
struct PinnedArtifacts {
    verifier_only: Vec<u8>,
    common: Vec<u8>,
    circuit_digest: [u8; 32],
}

fn pinned_artifacts(verifier_only: &VerifierOnlyCircuitData<C, D>, common: &plonky2::plonk::circuit_data::CommonCircuitData<F, D>) -> Result<PinnedArtifacts, String> {
    let verifier_bytes = verifier_only.to_bytes().map_err(|e| alloc::format!("verifier serialization: {e}"))?;
    let common_bytes = common.to_bytes(&DefaultGateSerializer).map_err(|e| alloc::format!("common serialization: {e}"))?;
    let circuit_digest = *digest_to_bytes(verifier_only.circuit_digest.elements);
    if hex::encode(sp_core::hashing::blake2_256(&verifier_bytes)) != PRIVATE_BATCH_VERIFIER_BLAKE2
        || hex::encode(sp_core::hashing::blake2_256(&common_bytes)) != PRIVATE_BATCH_COMMON_BLAKE2
        || hex::encode(circuit_digest) != PRIVATE_BATCH_CIRCUIT_DIGEST
    {
        return Err(String::from("rebuilt private-batch circuit differs from the verifier pinned to mainnet runtime 152"));
    }
    Ok(PinnedArtifacts { verifier_only: verifier_bytes, common: common_bytes, circuit_digest })
}

/// Verify `proof_bytes` the way `pallet_wormhole::verify_private_batch` does
/// and return the parsed public inputs.
fn verify_like_pallet(artifacts: &PinnedArtifacts, proof_bytes: &[u8]) -> Result<PrivateBatchPublicInputs, String> {
    if proof_bytes.len() > MAX_PROOF_BYTES {
        return Err(String::from("proof exceeds MAX_PROOF_BYTES"));
    }
    let verifier_only = OfficialVerifierOnly::from_bytes(artifacts.verifier_only.clone())
        .map_err(|e| alloc::format!("verifier-only deserialization: {e}"))?;
    let common = VerifierCommonData::from_bytes(
        artifacts.common.clone(),
        &qp_plonky2_verifier::util::serialization::DefaultGateSerializer,
    )
    .map_err(|e| alloc::format!("common deserialization: {e}"))?;
    ensure_private_batch_profile(&common)?;
    let verifier = WormholeVerifier { circuit_data: OfficialVerifierData { verifier_only, common } };
    let proof = VerifierProof::from_bytes(proof_bytes.to_vec(), &verifier.circuit_data.common)
        .map_err(|e| alloc::format!("proof deserialization: {e}"))?;
    if proof.to_bytes().as_slice() != proof_bytes {
        return Err(String::from("proof encoding is not canonical"));
    }
    let inputs = parse_private_batch_public_inputs(&proof).map_err(|e| alloc::format!("public inputs: {e}"))?;
    verifier.verify(proof).map_err(|e| alloc::format!("official verifier rejected the proof: {e}"))?;
    Ok(inputs)
}

/// Build, aggregate and verify the exit proof. `progress(stage, done, total)`
/// is called between the expensive steps.
pub fn prove_exit(
    mnemonic: &str,
    request: &ExitRequest,
    progress: &mut dyn FnMut(&str, u32, u32),
) -> Result<ExitProof, String> {
    if parse_u128("quantumPlanck", &request.quantum_planck)? != QUANTUM_PLANCK {
        return Err(String::from("quantumPlanck does not match the circuit amount unit"));
    }
    if request.volume_fee_bps as u64 >= BPS_DENOMINATOR {
        return Err(String::from("volumeFeeBps must be below 10000"));
    }
    let header = header_inputs(&request.header)?;
    let block_hash = header.block_hash();
    let claimed_block_hash = parse_h256("header.blockHash", &request.header.block_hash)?;
    if *block_hash != claimed_block_hash {
        return Err(String::from("header does not hash to blockHash"));
    }
    let exit_bytes = parse_account("exitAddress", &request.exit_address)?;
    if exit_bytes == [0u8; 32] {
        return Err(String::from("exitAddress must not be the zero account"));
    }
    let exit_account = digest("exitAddress", exit_bytes)?;

    let mut inputs = prepare_inputs(mnemonic, request.passphrase.as_deref(), request, &header, block_hash, exit_account)?;
    let quanta: Vec<u32> = inputs.iter().map(|i| i.amount_quanta).collect();
    let (total_out, outs) = distribute_outputs(&quanta, request.volume_fee_bps)?;
    for (input, out) in inputs.iter_mut().zip(outs.iter()) {
        input.circuit.public.output_amount_1 = *out;
    }
    let total_in: u64 = quanta.iter().map(|&q| q as u64).sum();
    let n = inputs.len() as u32;

    let (leaf_data, leaf_targets) = leaf_circuit()?;
    let leaf_verifier = leaf_data.verifier_data();
    let mut leaf_proofs = Vec::with_capacity(inputs.len());
    for (i, input) in inputs.iter().enumerate() {
        progress("leaf", i as u32, n);
        let prover = WormholeProver::new(wormhole_leaf_circuit_config()).map_err(|e| alloc::format!("leaf prover: {e}"))?;
        let proof = prover
            .commit(&input.circuit)
            .and_then(|p| p.prove())
            .map_err(|e| alloc::format!("leaf proof {i}: {e}"))?;
        leaf_verifier.verify(proof.clone()).map_err(|e| alloc::format!("leaf proof {i} rejected: {e}"))?;
        leaf_proofs.push(proof);
    }
    progress("leaf", n, n);

    // Official dummy leaf used to pad the batch, proved with the same circuit.
    let dummy_inputs = build_dummy_circuit_inputs().map_err(|e| alloc::format!("dummy inputs: {e}"))?;
    let mut dummy_witness = PartialWitness::new();
    fill_witness(&mut dummy_witness, &dummy_inputs, &leaf_targets).map_err(|e| alloc::format!("dummy witness: {e}"))?;
    let dummy_bytes = generate_dummy_proof(&leaf_data, &leaf_targets).map_err(|e| alloc::format!("dummy proof: {e}"))?;
    drop(dummy_witness);
    let dummy = ProofWithPublicInputs::<F, C, D>::from_bytes(dummy_bytes, &leaf_verifier.common)
        .map_err(|e| alloc::format!("dummy proof: {e}"))?;
    drop(leaf_data);

    progress("circuit", 0, 1);
    let prover = PrivateBatchProver::new(
        wormhole_private_batch_circuit_config(),
        leaf_verifier.common.clone(),
        &leaf_verifier.verifier_only,
        NUM_LEAF_PROOFS,
        dummy,
    )
    .map_err(|e| alloc::format!("private batch circuit: {e}"))?;
    let verifier_only = VerifierOnlyCircuitData::<C, D> {
        constants_sigmas_cap: prover.circuit_data.prover_only.constants_sigmas_commitment.merkle_tree.cap.clone(),
        circuit_digest: prover.circuit_data.prover_only.circuit_digest,
    };
    let artifacts = pinned_artifacts(&verifier_only, &prover.circuit_data.common)?;
    progress("circuit", 1, 1);

    progress("prove", 0, 1);
    let proof = prover.aggregate(leaf_proofs).map_err(|e| alloc::format!("private batch proof: {e}"))?;
    progress("prove", 1, 1);

    progress("verify", 0, 1);
    // First with the prover's own verifier data, then exactly like the pallet.
    let own_verifier = VerifierCircuitData { verifier_only, common: proof_common(&proof, &artifacts)? };
    own_verifier.verify(proof.clone()).map_err(|e| alloc::format!("local verifier rejected the proof: {e}"))?;
    let proof_bytes = proof.to_bytes();
    let parsed = verify_like_pallet(&artifacts, &proof_bytes)?;
    progress("verify", 1, 1);

    // The chain will act on the parsed public inputs; they must say what we asked.
    if parsed.asset_id != 0 || parsed.volume_fee_bps != request.volume_fee_bps {
        return Err(String::from("proof public inputs carry the wrong asset or fee"));
    }
    if *parsed.block_data.block_hash != *block_hash || parsed.block_data.block_number != request.header.number {
        return Err(String::from("proof public inputs reference the wrong block"));
    }
    if parsed.nullifiers.len() != NUM_LEAF_PROOFS || parsed.account_data.len() != NUM_LEAF_PROOFS * 2 {
        return Err(String::from("proof public inputs have an unexpected shape"));
    }
    let published: alloc::collections::BTreeSet<[u8; 32]> = parsed.nullifiers.iter().map(|n| **n).collect();
    for input in &inputs {
        if !published.contains(&input.nullifier) {
            return Err(String::from("proof does not publish every input nullifier"));
        }
    }
    let mut exits = Vec::new();
    for slot in &parsed.account_data {
        if slot.summed_output_amount == 0 && *slot.exit_account == [0u8; 32] {
            continue;
        }
        exits.push((slot.summed_output_amount, *slot.exit_account));
    }
    if exits.len() != 1 || exits[0].0 as u64 != total_out || exits[0].1 != exit_bytes {
        return Err(String::from("proof public inputs do not pay the requested exit"));
    }
    let mut input_nullifiers = Vec::with_capacity(inputs.len());
    let mut nullifiers = Vec::with_capacity(NUM_LEAF_PROOFS);
    for input in &inputs {
        input_nullifiers.push(hex32(&input.nullifier));
    }
    for nullifier in &parsed.nullifiers {
        if published.contains(&**nullifier) && inputs.iter().any(|i| i.nullifier == **nullifier) {
            nullifiers.push(hex32(nullifier));
        }
    }
    for nullifier in &parsed.nullifiers {
        if !inputs.iter().any(|i| i.nullifier == **nullifier) {
            nullifiers.push(hex32(nullifier));
        }
    }
    Ok(ExitProof {
        kind: String::from("private-batch"),
        proof_hex: alloc::format!("0x{}", hex::encode(&proof_bytes)),
        proof_bytes: proof_bytes.len(),
        asset_id: 0,
        volume_fee_bps: request.volume_fee_bps,
        block_number: request.header.number,
        block_hash: hex32(&block_hash),
        nullifiers,
        input_nullifiers,
        exits: alloc::vec![ExitOutput {
            account: hex32(&exit_bytes),
            amount_quanta: total_out.to_string(),
            amount_planck: (total_out as u128 * QUANTUM_PLANCK).to_string(),
        }],
        input_quanta: total_in.to_string(),
        output_quanta: total_out.to_string(),
        num_leaf_proofs: NUM_LEAF_PROOFS,
        circuit_version: String::from(CIRCUIT_VERSION),
        circuit_digest: hex::encode(artifacts.circuit_digest),
        public_inputs: proof.public_inputs.iter().map(|f| f.to_canonical_u64().to_string()).collect(),
    })
}

fn proof_common(
    proof: &ProofWithPublicInputs<F, C, D>,
    artifacts: &PinnedArtifacts,
) -> Result<plonky2::plonk::circuit_data::CommonCircuitData<F, D>, String> {
    let common = plonky2::plonk::circuit_data::CommonCircuitData::<F, D>::from_bytes(artifacts.common.clone(), &DefaultGateSerializer)
        .map_err(|e| alloc::format!("common deserialization: {e}"))?;
    if proof.public_inputs.len() != common.num_public_inputs {
        return Err(String::from("proof public-input count mismatch"));
    }
    Ok(common)
}

/// JSON-friendly description of the compiled prover.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProverInfo {
    pub kind: &'static str,
    pub circuit_version: &'static str,
    pub num_leaf_proofs: usize,
    pub quantum_planck: String,
    pub max_proof_bytes: usize,
    pub circuit_digest: &'static str,
    pub verifier_blake2: &'static str,
    pub common_blake2: &'static str,
}

pub fn prover_info() -> ProverInfo {
    ProverInfo {
        kind: "private-batch",
        circuit_version: CIRCUIT_VERSION,
        num_leaf_proofs: NUM_LEAF_PROOFS,
        quantum_planck: QUANTUM_PLANCK.to_string(),
        max_proof_bytes: MAX_PROOF_BYTES,
        circuit_digest: PRIVATE_BATCH_CIRCUIT_DIGEST,
        verifier_blake2: PRIVATE_BATCH_VERIFIER_BLAKE2,
        common_blake2: PRIVATE_BATCH_COMMON_BLAKE2,
    }
}

/// Describe the compiled prover (batch kind, sizes, pinned artifact hashes).
#[wasm_bindgen(js_name = wormholeProverInfo)]
pub fn wormhole_prover_info_js() -> Result<JsValue, JsError> {
    serde_wasm_bindgen::to_value(&prover_info()).map_err(|e| JsError::new(&e.to_string()))
}

/// Prove an exit of the given deposits to `exitAddress`. `onProgress` receives
/// `(stage, done, total)`. Returns the proof and its decoded public inputs;
/// the phrase and derived secrets never leave the module.
#[wasm_bindgen(js_name = wormholeProveExit)]
pub fn wormhole_prove_exit_js(
    mnemonic: &str,
    request: JsValue,
    on_progress: Option<js_sys::Function>,
) -> Result<JsValue, JsError> {
    let request: ExitRequest = serde_wasm_bindgen::from_value(request)
        .map_err(|e| JsError::new(&alloc::format!("invalid request: {e}")))?;
    let mut progress = |stage: &str, done: u32, total: u32| {
        if let Some(callback) = &on_progress {
            let _ = callback.call3(&JsValue::NULL, &JsValue::from_str(stage), &JsValue::from(done), &JsValue::from(total));
        }
    };
    let proof = prove_exit(mnemonic, &request, &mut progress).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&proof).map_err(|e| JsError::new(&e.to_string()))
}

/// Synthetic request for `count` deposits to the phrase's receive addresses
/// in a self-made zk tree and header. Used only to measure the prover in a
/// browser and by tests; nothing about it exists on any chain.
pub fn synthetic_request(mnemonic: &str, count: usize, exit_address: &str) -> Result<serde_json::Value, String> {
    if count == 0 || count > NUM_LEAF_PROOFS {
        return Err(alloc::format!("count must be between 1 and {NUM_LEAF_PROOFS}"));
    }
    let seed = seed_from_mnemonic(mnemonic, None)?;
    let mut leaves = Vec::new();
    let mut metas = Vec::new();
    for i in 0..count {
        let pair = pair_at(&seed, 0, i as u32)?;
        let to = *pair.address();
        let amount: u128 = (1_000 + 250 * i as u128) * QUANTUM_PLANCK;
        let quanta = (amount / QUANTUM_PLANCK) as u32;
        leaves.push(leaf_hash(&to, 0, 0, quanta));
        metas.push((to, amount));
    }
    let zero = [0u8; 32];
    let mut level1 = Vec::new();
    for group in 0..4 {
        let mut kids = [zero; 4];
        for (slot, kid) in kids.iter_mut().enumerate() {
            let idx = group * 4 + slot;
            if idx < leaves.len() {
                *kid = leaves[idx];
            }
        }
        level1.push(qp_zk_circuits_common::zk_merkle::hash_node(&kids).map_err(String::from)?);
    }
    let root = qp_zk_circuits_common::zk_merkle::hash_node(&[level1[0], level1[1], level1[2], level1[3]]).map_err(String::from)?;
    let mut digest_bytes = [0u8; DIGEST_LOGS_SIZE];
    digest_bytes[0] = 8;
    let header = ExitHeader {
        parent_hash: hex32(&[1u8; 32]),
        number: 4242,
        state_root: hex32(&[3u8; 32]),
        extrinsics_root: hex32(&[4u8; 32]),
        zk_tree_root: hex32(&root),
        digest: alloc::format!("0x{}", hex::encode(digest_bytes)),
        block_hash: hex32(&[0u8; 32]),
    };
    let inputs_hash = header_inputs(&header)?.block_hash();
    let mut inputs = Vec::new();
    for (idx, (to, amount)) in metas.iter().enumerate() {
        let group = idx / 4;
        let mut l0 = [String::new(), String::new(), String::new()];
        let mut k = 0;
        for slot in 0..4 {
            let j = group * 4 + slot;
            if j == idx {
                continue;
            }
            l0[k] = hex32(if j < leaves.len() { &leaves[j] } else { &zero });
            k += 1;
        }
        let mut l1 = [String::new(), String::new(), String::new()];
        let mut k = 0;
        for g in 0..4 {
            if g == group {
                continue;
            }
            l1[k] = hex32(&level1[g]);
            k += 1;
        }
        let mut leaf_data = Vec::with_capacity(LEAF_DATA_LEN);
        leaf_data.extend_from_slice(to);
        leaf_data.extend_from_slice(&0u64.to_le_bytes());
        leaf_data.extend_from_slice(&0u32.to_le_bytes());
        leaf_data.extend_from_slice(&amount.to_le_bytes());
        inputs.push(serde_json::json!({
            "branch": 0, "index": idx, "transferCount": "0", "leafIndex": idx.to_string(),
            "amountPlanck": amount.to_string(),
            "leafData": alloc::format!("0x{}", hex::encode(&leaf_data)),
            "leafHash": hex32(&leaves[idx]),
            "siblings": [l0, l1],
        }));
    }
    Ok(serde_json::json!({
        "inputs": inputs,
        "header": {
            "parentHash": header.parent_hash, "number": header.number, "stateRoot": header.state_root,
            "extrinsicsRoot": header.extrinsics_root, "zkTreeRoot": header.zk_tree_root,
            "digest": header.digest, "blockHash": hex32(&inputs_hash),
        },
        "treeRoot": hex32(&root),
        "exitAddress": exit_address,
        "volumeFeeBps": 4,
        "quantumPlanck": QUANTUM_PLANCK.to_string(),
    }))
}

/// Synthetic request builder for browser measurements and tests (see
/// [`synthetic_request`]); returns the request as a JSON string.
#[wasm_bindgen(js_name = wormholeSyntheticExitRequest)]
pub fn wormhole_synthetic_exit_request_js(mnemonic: &str, count: u32, exit_address: &str) -> Result<String, JsError> {
    let value = synthetic_request(mnemonic, count as usize, exit_address).map_err(|e| JsError::new(&e))?;
    serde_json::to_string(&value).map_err(|e| JsError::new(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Public upstream test phrase; never fund it.
    const PHRASE: &str = "orchard answer curve patient visual flower maze noise retreat penalty cage small earth domain scan pitch bottom crunch theme club client swap slice raven";
    const EXIT: &str = "0x0202020202020202020202020202020202020202020202020202020202020202";

    fn request(count: usize) -> ExitRequest {
        let json = synthetic_request(PHRASE, count, EXIT).unwrap();
        serde_json::from_value(json).unwrap()
    }

    /// `pallet_wormhole::volume_fee_for_exit` on the minted amount.
    fn pallet_fee_quanta(minted_quanta: u64, bps: u64) -> u64 {
        let denominator = 10_000 - bps;
        (minted_quanta * bps).div_ceil(denominator)
    }

    #[test]
    fn leaf_hash_matches_pallet_golden_vector() {
        // `pallet_zk_tree::tests::hash_leaf_golden_vector`.
        let expected: [u8; 32] = [
            195, 94, 210, 27, 96, 177, 127, 68, 16, 231, 47, 227, 104, 21, 175, 254, 219, 85, 224, 111, 64,
            162, 32, 119, 226, 89, 143, 126, 203, 254, 51, 93,
        ];
        assert_eq!(leaf_hash(&[0x11u8; 32], 7, 5, 1234), expected);
    }

    #[test]
    fn header_hash_matches_qp_header_vector() {
        // `qp_header::tests::poseidon_header_hash_is_stable`.
        let mut digest = Vec::new();
        digest.push(8u8);
        digest.push(6u8);
        digest.extend_from_slice(b"pow_");
        digest.push(128u8);
        digest.extend_from_slice(&[
            233, 182, 183, 107, 158, 1, 115, 19, 219, 126, 253, 86, 30, 208, 176, 70, 21, 45, 180, 229, 9, 62, 91, 4,
            6, 53, 245, 52, 48, 38, 123, 225,
        ]);
        digest.push(5u8);
        digest.extend_from_slice(b"pow_");
        digest.extend_from_slice(&[1u8, 1u8]);
        digest.extend_from_slice(&[0u8; 61]);
        digest.extend_from_slice(&[30u8, 77u8, 142u8]);
        assert_eq!(digest.len(), DIGEST_LOGS_SIZE);
        let header = ExitHeader {
            parent_hash: String::from("0x839b2d2ac0bf4aa71b18ad1ba5e2880b4ef06452cefacd255cfd76f6ad2c7966"),
            number: 4,
            state_root: String::from("0x1688817041c572d6c971681465f401f06d0fdcfaed61d28c06d42dc2d07816d5"),
            extrinsics_root: String::from("0x7c6cace2e91b6314e05410b91224c11f5dd4a4a2dbf0e39081fddbe4ac9ad252"),
            zk_tree_root: hex32(&[0u8; 32]),
            digest: alloc::format!("0x{}", hex::encode(&digest)),
            block_hash: String::new(),
        };
        let hash = header_inputs(&header).unwrap().block_hash();
        assert_eq!(hex::encode(*hash), "b7dbfd398bcef7d1c91821eb105c52e87dab78e822779bfd0dc7ab132d659a55");
    }

    #[test]
    fn canonicalization_reduces_limbs_like_the_chain() {
        let mut bytes = [0u8; 32];
        bytes[0..8].copy_from_slice(&u64::MAX.to_le_bytes());
        let out = canonicalize_limbs(bytes);
        assert_eq!(u64::from_le_bytes(out[0..8].try_into().unwrap()), u64::MAX - GOLDILOCKS_P);
        assert_eq!(canonicalize_limbs([0x11u8; 32]), [0x11u8; 32]);
    }

    #[test]
    fn output_distribution_follows_segment_fee_relation() {
        for (inputs, bps) in [(vec![100u32], 4u32), (vec![1, 1], 4), (vec![2501], 4), (vec![7, 300, 1234, 5, 999, 1, 2], 4), (vec![1000], 9000)] {
            let total_in: u64 = inputs.iter().map(|&q| q as u64).sum();
            let (total_out, outs) = distribute_outputs(&inputs, bps).unwrap();
            assert_eq!(outs.iter().map(|&o| o as u64).sum::<u64>(), total_out);
            assert!(total_out * 10_000 <= total_in * (10_000 - bps as u64));
            assert!((total_out + 1) * 10_000 > total_in * (10_000 - bps as u64), "optimal");
            // The pallet's settled fee never exceeds what the circuit locks.
            assert!(pallet_fee_quanta(total_out, bps as u64) <= total_in - total_out);
        }
        assert!(distribute_outputs(&[1], 4).is_err(), "one quantum cannot cover the fee");
        assert!(max_output_quanta(1, 10_000).is_err());
    }

    #[test]
    fn decode_leaf_reads_scale_layout() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&[9u8; 32]);
        bytes.extend_from_slice(&42u64.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&(12_340_000_000_000u128).to_le_bytes());
        let leaf = decode_leaf(&bytes).unwrap();
        assert_eq!((leaf.to, leaf.transfer_count, leaf.asset_id, leaf.amount), ([9u8; 32], 42, 0, 12_340_000_000_000));
        assert!(decode_leaf(&bytes[..59]).is_err());
    }

    #[test]
    fn request_validation_fails_closed() {
        let mut bad = request(1);
        bad.quantum_planck = String::from("1000000000");
        assert!(prove_exit(PHRASE, &bad, &mut |_, _, _| {}).unwrap_err().contains("quantumPlanck"));
        let mut bad = request(1);
        bad.header.block_hash = hex32(&[7u8; 32]);
        assert!(prove_exit(PHRASE, &bad, &mut |_, _, _| {}).unwrap_err().contains("blockHash"));
        let mut bad = request(1);
        bad.inputs[0].amount_planck = String::from("1");
        assert!(prove_exit(PHRASE, &bad, &mut |_, _, _| {}).unwrap_err().contains("amount"));
        let mut bad = request(1);
        bad.inputs[0].transfer_count = String::from("1");
        assert!(prove_exit(PHRASE, &bad, &mut |_, _, _| {}).unwrap_err().contains("transfer count"));
        let mut bad = request(1);
        bad.inputs[0].index = 5;
        assert!(prove_exit(PHRASE, &bad, &mut |_, _, _| {}).unwrap_err().contains("recipient"));
        let mut bad = request(1);
        bad.inputs[0].siblings[0][1] = hex32(&[5u8; 32]);
        assert!(prove_exit(PHRASE, &bad, &mut |_, _, _| {}).unwrap_err().contains("Merkle"));
        let mut bad = request(1);
        bad.exit_address = hex32(&[0u8; 32]);
        assert!(prove_exit(PHRASE, &bad, &mut |_, _, _| {}).unwrap_err().contains("exitAddress"));
        let mut bad = request(1);
        bad.exit_address = hex32(&[0xffu8; 32]);
        assert!(prove_exit(PHRASE, &bad, &mut |_, _, _| {}).unwrap_err().contains("exitAddress"));
        let wrong_phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
        assert!(prove_exit(wrong_phrase, &request(1), &mut |_, _, _| {}).unwrap_err().contains("recipient"));
    }

    /// Full pipeline on a synthetic tree: proves, verifies like the pallet and
    /// exposes exactly the requested exit and nullifiers. Slow (tens of seconds).
    #[test]
    fn proves_and_verifies_two_input_exit() {
        let req = request(2);
        let mut stages = Vec::new();
        let proof = prove_exit(PHRASE, &req, &mut |stage, done, total| stages.push((String::from(stage), done, total))).unwrap();
        assert_eq!(proof.kind, "private-batch");
        assert!(proof.proof_bytes <= MAX_PROOF_BYTES);
        assert_eq!(proof.nullifiers.len(), NUM_LEAF_PROOFS);
        assert_eq!(proof.input_nullifiers.len(), 2);
        assert_eq!(proof.block_number, 4242);
        assert_eq!(proof.block_hash, req.header.block_hash);
        assert_eq!(proof.circuit_digest, PRIVATE_BATCH_CIRCUIT_DIGEST);
        assert_eq!(proof.public_inputs.len(), PRIVATE_BATCH_PUBLIC_INPUTS);
        let total_in = 1_000 + 1_250;
        let total_out = max_output_quanta(total_in, 4).unwrap();
        assert_eq!(proof.input_quanta, total_in.to_string());
        assert_eq!(proof.output_quanta, total_out.to_string());
        assert_eq!(proof.exits, alloc::vec![ExitOutput {
            account: String::from(EXIT),
            amount_quanta: total_out.to_string(),
            amount_planck: (total_out as u128 * QUANTUM_PLANCK).to_string(),
        }]);
        for (branch, index) in [(0u32, 0u32), (0, 1)] {
            let expected = hex32(&crate::wormhole::wormhole_nullifier(PHRASE, None, branch, index, 0).unwrap());
            assert!(proof.input_nullifiers.contains(&expected));
            assert!(proof.nullifiers.contains(&expected));
        }
        assert!(stages.iter().any(|(s, _, _)| s == "prove"));
        assert!(stages.iter().any(|(s, _, _)| s == "verify"));
        // The proof bytes must survive the pallet-style byte checks unchanged.
        let bytes = parse_hex("proof", &proof.proof_hex).unwrap();
        assert_eq!(bytes.len(), proof.proof_bytes);
    }

    /// The proof fixture generated by the official CLI (`quantus wormhole
    /// multi round`, `pallets/wormhole/test-data/private_batch.hex` at the
    /// pinned chain commit) verifies against the rebuilt circuit, proving the
    /// rebuilt verifier equals the one the runtime tests use.
    #[test]
    fn official_fixture_verifies_against_pinned_artifacts() {
        let hex_text = include_str!("../test-data/private_batch.hex");
        let bytes = hex::decode(hex_text.trim()).unwrap();
        let (leaf_data, _) = leaf_circuit().unwrap();
        let leaf_verifier = leaf_data.verifier_data();
        let circuit = qp_wormhole_aggregator::private_batch::circuit::circuit_logic::PrivateBatchCircuit::new(
            wormhole_private_batch_circuit_config(),
            &leaf_verifier.common,
            &leaf_verifier.verifier_only,
            NUM_LEAF_PROOFS,
        )
        .unwrap();
        let verifier = circuit.build_verifier();
        let artifacts = pinned_artifacts(&verifier.verifier_only, &verifier.common).unwrap();
        let parsed = verify_like_pallet(&artifacts, &bytes).unwrap();
        assert_eq!(parsed.volume_fee_bps, 4);
        assert_eq!(parsed.block_data.block_number, 1);
        assert_eq!(parsed.nullifiers.len(), NUM_LEAF_PROOFS);
        assert!(verify_like_pallet(&artifacts, &bytes[..bytes.len() - 1]).is_err());
        let mut tampered = bytes.clone();
        tampered[100] ^= 1;
        assert!(verify_like_pallet(&artifacts, &tampered).is_err());
    }
}
