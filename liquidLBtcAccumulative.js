var utils = require("./utils");

// add inputs until we reach or surpass the target value (or deplete)
// worst-case: O(n)
const EXTRA_OUTPUT_BYTES = 46 + 34; // Covers witness cases and address
const EXTRA_ISSUANCE_BYTES = 66 + EXTRA_OUTPUT_BYTES;
const threshold = utils.inputBytes({});
const noResultOutput = { fee: 0 };

module.exports = function liquidLBtcAccumulative(
  utxos,
  outputs,
  feeRate,
  isIssuance = false
) {
  if (!isFinite(utils.uintOrNaN(feeRate))) return noResultOutput;
  let bytesAccum = utils.transactionBytes([], outputs);

  let inAccum = 0;
  const inputs = [];
  let outAccum = utils.sumOrNaN(outputs);

  let isIssuanceIncluded = false;

  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i];
    const utxoBytes = utils.inputBytes(utxo);
    const utxoFee = feeRate * utxoBytes;
    const utxoValue = utils.uintOrNaN(utxo.value);

    // skip detrimental input
    if (utxoFee > utxo.value) {
      if (i === utxos.length - 1) return noResultOutput;
      continue;
    }

    bytesAccum += utxoBytes;
    inAccum += utxoValue;
    inputs.push(utxo);

    const baseFee = feeRate * bytesAccum;
    let shouldAddExtraOutput =
      inAccum + utxoValue - (outAccum + baseFee) > threshold;
    var fee =
      baseFee +
      feeRate * (shouldAddExtraOutput ? EXTRA_OUTPUT_BYTES : 0) +
      (isIssuance && !isIssuanceIncluded ? EXTRA_ISSUANCE_BYTES : 0);

    // go again?
    if (inAccum < outAccum + fee) continue;

    if (isIssuance && !isIssuanceIncluded) {
      bytesAccum += EXTRA_ISSUANCE_BYTES;
      isIssuanceIncluded = true;
    }

    // add extra output if needed
    if (shouldAddExtraOutput) {
      bytesAccum += EXTRA_OUTPUT_BYTES;
      const feeAfterExtraOutput = feeRate * bytesAccum;
      const remainderAfterExtraOutput =
        utils.sumOrNaN(inputs) -
        (utils.sumOrNaN(outputs) + feeAfterExtraOutput);
      outputs = outputs.concat({
        value: Math.floor(remainderAfterExtraOutput),
      });
    }

    fee = utils.sumOrNaN(inputs) - utils.sumOrNaN(outputs);

    if (!isFinite(fee)) return noResultOutput;

    return {
      inputs: inputs,
      outputs: outputs,
      fee: fee,
    };
  }

  return noResultOutput;
};
