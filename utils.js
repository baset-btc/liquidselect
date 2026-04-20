const varuint = require("varuint-bitcoin");
// baseline estimates, used to improve performance
const TX_EMPTY_SIZE = 4 + 1 + 4;
const TX_INPUT_BASE = 32 + 4 + 4;
const EXTRA_OUTPUT_BYTES_BASELINE = 46 + 32;
const EXTRA_ISSUANCE_BYTES_PUBLIC = 66 + EXTRA_OUTPUT_BYTES_BASELINE;
const EXTRA_ISSUANCE_BYTES_CONFIDENTIAL = 1500; // Observed overhead for blinded issuance proofs
const TX_OUTPUT_FEE = 9 + 1 + 33 + 1; // value + nonce + asset + scriptBytes
// issuanceRangeProof + inflationRangeProof + witness.length + signature.length + pubkey.length + 1 byte each to represent the length of signature and pubkey
const TX_INPUT_WITNESS = 1 + 1 + 1 + 72 + 33 + 1 + 1;
const TX_INPUT_WITNESS_TAPROOT = 1 + 1 + 64;
const TX_INPUT_PUBKEYHASH = 107;
const WITNESS_SCALE_FACTOR = 4;

function normalizeAssetPayloadBytes(asset) {
  // Output serialization stores a 1-byte prefix + 32-byte asset id.
  // `outputBytes` already accounts for the prefix, so this returns only payload bytes.
  if (asset === undefined || asset === null) {
    return 32;
  }

  const isBufferType =
    typeof Buffer !== "undefined" && Buffer.isBuffer(asset);
  if (isBufferType || asset instanceof Uint8Array) {
    if (asset.length === 33) {
      return 32;
    }
    return asset.length;
  }

  if (typeof asset === "string") {
    const normalized = asset.startsWith("0a") && asset.length === 66
      ? asset.slice(2)
      : asset;

    if (/^[0-9a-f]+$/i.test(normalized) && normalized.length % 2 === 0) {
      return normalized.length / 2;
    }
  }

  return 32;
}

function encodingLength(i) {
  if (!i) return 1;
  return varuint.encodingLength(i);
}

function scriptBytes(script) {
  if (!script) return 1;
  const length = script.length;
  return encodingLength(length) + length;
}

function _inputBytes(input, _ALLOW_WITNESS = false) {
  const isTaproot = !!(
    input.isTaproot ||
    input.witnessUtxo?.scriptpubkey_type === "v1_p2tr" ||
    input.witnessUtxo?.scriptPubKeyType === "v1_p2tr"
  );

  const isWitness = !!(input.witnessUtxo || isTaproot);

  // scriptSig estimation (non-witness section):
  // 1. If it's P2SH (wrapped), use the redeemScript size.
  // 2. If it's Native Witness (Segwit/Taproot), it's 1 byte (empty).
  // 3. Other types (Legacy/Custom): use the provided script or fallback to 107 bytes.
  const scriptSigSize = input.redeemScript
    ? scriptBytes(input.redeemScript)
    : isWitness
      ? 1
      : (input.witnessUtxo?.script ? scriptBytes(input.witnessUtxo.script) : TX_INPUT_PUBKEYHASH);

  return (
    TX_INPUT_BASE +
    scriptSigSize +
    (_ALLOW_WITNESS && isWitness
      ? (isTaproot ? TX_INPUT_WITNESS_TAPROOT : TX_INPUT_WITNESS) +
      encodingLength(input.witnessUtxo?.peginWitness) +
      (input.witnessUtxo?.peginWitness
        ? input.witnessUtxo?.peginWitness?.reduce(function (a, x) {
          return a + scriptBytes(x);
        }, 0)
        : 0)
      : 0)
  );
}

function inputBytes(input) {
  return (
    (_inputBytes(input, false) * (WITNESS_SCALE_FACTOR - 1) +
      _inputBytes(input, true) +
      WITNESS_SCALE_FACTOR -
      1) /
    WITNESS_SCALE_FACTOR
  );
}

function outputBytes(output, _ALLOW_WITNESS = false) {
  const explicitTaprootFlag = !!(
    output?.isTaproot ||
    output?.scriptpubkey_type === "v1_p2tr" ||
    output?.scriptPubKeyType === "v1_p2tr"
  );
  const normalizedAddress = String(output.address || "").toLowerCase();
  const isTaprootOutput =
    explicitTaprootFlag ||
    normalizedAddress.startsWith("lq1p") ||
    normalizedAddress.startsWith("tlq1p") ||
    normalizedAddress.startsWith("ex1p") ||
    normalizedAddress.startsWith("tex1p");

  return (
    9 + // value
    1 + // nonce
    1 + // 0a added to asset
    normalizeAssetPayloadBytes(output.asset) +
    (output.script
      ? scriptBytes(output.script)
      : isTaprootOutput
        ? 35
        : 23) +
    (_ALLOW_WITNESS ? 2 : 0)
  );
}

function dustThreshold(feeRate) {
  /* ... classify the output for input estimate  */
  return inputBytes({}, true) * feeRate;
}

function __byteLength(inputs, outputs, _ALLOW_WITNESS = false) {
  return (
    TX_EMPTY_SIZE +
    encodingLength(inputs.length) +
    encodingLength(outputs.length) +
    inputs.reduce(function (a, x) {
      return a + _inputBytes(x, _ALLOW_WITNESS);
    }, 0) +
    outputs.reduce(function (a, x) {
      return a + outputBytes(x, _ALLOW_WITNESS);
    }, 0) +
    TX_OUTPUT_FEE
  );
}

function transactionBytes(inputs, outputs) {
  // Estimate fee without fee output
  const base = __byteLength(inputs, outputs, false);
  const total = __byteLength(inputs, outputs, true);
  const bytes = base * (WITNESS_SCALE_FACTOR - 1) + total;

  return Math.floor((bytes + WITNESS_SCALE_FACTOR - 1) / WITNESS_SCALE_FACTOR);
}

function uintOrNaN(v) {
  if (typeof v !== "number") return NaN;
  if (!isFinite(v)) return NaN;
  if (v < 0) return NaN;
  return v;
}

function sumForgiving(range) {
  return range.reduce(function (a, x) {
    return a + (isFinite(x.value) ? x.value : 0);
  }, 0);
}

function sumOrNaN(range) {
  return range.reduce(function (a, x) {
    return a + uintOrNaN(x.value);
  }, 0);
}

function extraOutputBytes(output = {}) {
  if (typeof output === "boolean") {
    output = { isTaproot: output };
  }

  const base = outputBytes(output, false);
  const total = outputBytes(output, true);
  const bytes = base * (WITNESS_SCALE_FACTOR - 1) + total;

  return Math.floor((bytes + WITNESS_SCALE_FACTOR - 1) / WITNESS_SCALE_FACTOR);
}

function extraIssuanceBytes(isConfidentialIssuance = false) {
  return isConfidentialIssuance
    ? EXTRA_ISSUANCE_BYTES_CONFIDENTIAL
    : EXTRA_ISSUANCE_BYTES_PUBLIC;
}

function noResultOutput() {
  return { fee: 0 };
}

function finalize(inputs, outputs, feeRate) {
  const bytesAccum = transactionBytes(inputs, outputs);
  const fee = sumOrNaN(inputs) - sumOrNaN(outputs);

  if (!isFinite(fee)) return { fee: Math.ceil(feeRate * bytesAccum) };

  return {
    inputs: inputs,
    outputs: outputs,
    fee: fee,
  };
}

module.exports = {
  dustThreshold: dustThreshold,
  inputBytes: inputBytes,
  outputBytes: outputBytes,
  sumOrNaN: sumOrNaN,
  sumForgiving: sumForgiving,
  transactionBytes: transactionBytes,
  uintOrNaN: uintOrNaN,
  extraOutputBytes: extraOutputBytes,
  extraIssuanceBytes: extraIssuanceBytes,
  noResultOutput: noResultOutput,
  finalize: finalize,
};
