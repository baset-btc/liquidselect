const utils = require("./utils");

// only add inputs if they don't bust the target value (aka, exact match)
// worstcase: O(n)
const threshold = utils.inputBytes({});

module.exports = function liquidLBtcBlackjack(
  utxos,
  outputs,
  feeRate,
  isIssuance = false
) {
  if (!isFinite(utils.uintOrNaN(feeRate))) return utils.noResultOutput();

  let bytesAccum = utils.transactionBytes([], outputs);
  let inAccum = 0;
  const inputs = [];
  const outAccum = utils.sumOrNaN(outputs);
  let isIssuanceIncluded = false;

  for (let i = 0; i < utxos.length; i++) {
    const input = utxos[i];
    const inputBytes = utils.inputBytes(input);
    const basePotentialFee = feeRate * (bytesAccum + inputBytes);
    const inputValue = utils.uintOrNaN(input.value);
    let shouldAddExtraOutput =
      inAccum + inputValue - (outAccum + basePotentialFee) > threshold;
    let fee =
      basePotentialFee +
      feeRate * (shouldAddExtraOutput ? utils.extraOutputBytes() : 0) +
      (isIssuance && !isIssuanceIncluded ? utils.extraIssuanceBytes() : 0);

    // would it waste value?
    if (inAccum + inputValue > outAccum + fee + threshold) continue;

    bytesAccum += inputBytes;
    inAccum += inputValue;
    inputs.push(input);

    // go again?
    if (inAccum < outAccum + fee) continue;

    if (isIssuance && !isIssuanceIncluded) {
      bytesAccum += utils.extraIssuanceBytes();
      isIssuanceIncluded = true;
    }

    // add extra output if needed
    if (shouldAddExtraOutput) {
      const feeAfterExtraOutput =
        feeRate * (bytesAccum + utils.extraOutputBytes());
      const remainderAfterExtraOutput =
        utils.sumOrNaN(inputs) -
        (utils.sumOrNaN(outputs) + feeAfterExtraOutput);
      outputs = outputs.concat({
        value: Math.round(remainderAfterExtraOutput),
      });
    }

    fee = utils.sumOrNaN(inputs) - utils.sumOrNaN(outputs);

    if (!isFinite(fee)) return utils.noResultOutput();

    return {
      inputs: inputs,
      outputs: outputs,
      fee: fee,
    };
  }

  return utils.noResultOutput();
};
