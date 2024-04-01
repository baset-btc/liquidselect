const utils = require("./utils");

// only add inputs if they don't bust the target value (aka, exact match)
// worstcase: O(n)

const EXTRA_OUTPUT_BYTES = 44 + 34;
const threshold = utils.inputBytes({});
const noResultOutput = { fee: 0 };

module.exports = function liquidLBtcBlackjack(utxos, outputs, feeRate) {
  if (!isFinite(utils.uintOrNaN(feeRate))) return noResultOutput;

  let bytesAccum = utils.transactionBytes([], outputs);
  let inAccum = 0;
  const inputs = [];
  const outAccum = utils.sumOrNaN(outputs);

  for (let i = 0; i < utxos.length; i++) {
    const input = utxos[i];
    const inputBytes = utils.inputBytes(input);
    const basePotentialFee = feeRate * (bytesAccum + inputBytes);
    const inputValue = utils.uintOrNaN(input.value);
    let shouldHadExtraOutput =
      inAccum + inputValue - (outAccum + basePotentialFee) > threshold;
    let fee =
      basePotentialFee +
      feeRate * (shouldHadExtraOutput ? EXTRA_OUTPUT_BYTES : 0);

    // would it waste value?
    if (inAccum + inputValue > outAccum + fee + threshold) continue;

    bytesAccum += inputBytes;
    inAccum += inputValue;
    inputs.push(input);

    // go again?
    if (inAccum < outAccum + fee) continue;

    // add extra output if needed
    if (shouldHadExtraOutput) {
      const feeAfterExtraOutput = feeRate * (bytesAccum + EXTRA_OUTPUT_BYTES);
      const remainderAfterExtraOutput =
        utils.sumOrNaN(inputs) -
        (utils.sumOrNaN(outputs) + feeAfterExtraOutput);
      outputs = outputs.concat({
        value: Math.round(remainderAfterExtraOutput),
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
