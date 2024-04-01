var utils = require("./utils");

// add inputs until we reach or surpass the target value (or deplete)
// worst-case: O(n)
const EXTRA_OUTPUT_BYTES = 46 + 34; // Covers witness cases and address
const threshold = utils.inputBytes({});
const noResultOutput = { fee: 0 };

module.exports = function liquidLBtcAccumulative(utxos, outputs, feeRate) {
  if (!isFinite(utils.uintOrNaN(feeRate))) return noResultOutput;
  console.log("da0", outputs);
  let bytesAccum = utils.transactionBytes([], outputs);

  let inAccum = 0;
  const inputs = [];
  let outAccum = utils.sumOrNaN(outputs);
  console.log("byteAccum1", bytesAccum);

  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i];
    const utxoBytes = utils.inputBytes(utxo);
    const utxoFee = feeRate * utxoBytes;
    const utxoValue = utils.uintOrNaN(utxo.value);

    console.log("da2", utxo, utxoBytes, utxoFee, utxoValue);

    // skip detrimental input
    if (utxoFee > utxo.value) {
      if (i === utxos.length - 1) return noResultOutput;
      continue;
    }

    bytesAccum += utxoBytes;
    console.log("byteAccum2", bytesAccum);
    inAccum += utxoValue;
    inputs.push(utxo);

    const baseFee = feeRate * bytesAccum;
    let shouldHadExtraOutput =
      inAccum + utxoValue - (outAccum + baseFee) > threshold;
    var fee =
      baseFee + feeRate * (shouldHadExtraOutput ? EXTRA_OUTPUT_BYTES : 0);

    // go again?
    if (inAccum < outAccum + fee) continue;

    // add extra output if needed
    if (shouldHadExtraOutput) {
      console.log("bytesAccum3", bytesAccum);
      bytesAccum += EXTRA_OUTPUT_BYTES;
      console.log("bytesAccum4", bytesAccum);
      const feeAfterExtraOutput = feeRate * bytesAccum;
      const remainderAfterExtraOutput =
        utils.sumOrNaN(inputs) -
        (utils.sumOrNaN(outputs) + feeAfterExtraOutput);
      console.log("var0", feeAfterExtraOutput, remainderAfterExtraOutput);
      outputs = outputs.concat({
        value: Math.floor(remainderAfterExtraOutput),
      });
    }

    console.log("var", bytesAccum, EXTRA_OUTPUT_BYTES, inputs, outputs);

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
