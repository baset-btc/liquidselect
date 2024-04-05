const varuint = require("varuint-bitcoin");
// baseline estimates, used to improve performance
var TX_EMPTY_SIZE = 4 + 1 + 4;
var TX_INPUT_BASE = 32 + 4 + 4;
const EXTRA_OUTPUT_BYTES = 46 + 22; // Covers witness cases and address
const EXTRA_ISSUANCE_BYTES = 66 + EXTRA_OUTPUT_BYTES;
var TX_OUTPUT_FEE = 9 + 1 + 33 + 1; // value + nonce + asset + scriptBytes
// issuanceRangeProof + inflationRangeProof + witness.length + signature.length + pubkey.length + 1 byte each to represent the length of signature and pubkey
var TX_INPUT_WITNESS = 1 + 1 + 1 + 72 + 33 + 1 + 1;
var WITNESS_SCALE_FACTOR = 4;

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
  return (
    TX_INPUT_BASE +
    scriptBytes(input.witnessUtxo?.script) +
    // (input.issuance
    //   ? TX_INPUT_ISSUANCE_BASE +
    //     1 + // For future purposes add input.issuance.assetAmount.length
    //     1 // For future purposes add input.issuance.tokenAmount.length
    //   : 0) +
    (_ALLOW_WITNESS
      ? TX_INPUT_WITNESS +
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
  return (
    9 + // value
    1 + // nonce
    1 + // 0a added to asset
    (output.asset ? output.asset.length : 0) +
    (output.script ? scriptBytes(output.script) : 23) +
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

function extraOutputBytes() {
  return EXTRA_OUTPUT_BYTES;
}

function extraIssuanceBytes() {
  return EXTRA_ISSUANCE_BYTES;
}

function noResultOutput() {
  return { fee: 0 };
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
};
