const utils = require("./utils");

// split utxos between each output, ignores outputs with .value defined
module.exports = function split(utxos, baseOutputs, feeRate, isMainnet = true) {
  if (!isFinite(utils.uintOrNaN(feeRate))) return {};

  const feeAsset = isMainnet
    ? "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d"
    : "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";

  let outputs = baseOutputs.map((x) => ({
    ...x,
    asset: Buffer.from(feeAsset, "hex"),
  }));

  const bytesAccum = utils.transactionBytes(utxos, outputs);
  const fee = feeRate * bytesAccum;

  if (outputs.length === 0) return { fee: fee };

  const inAccum = utils.sumOrNaN(utxos);
  const outAccum = utils.sumForgiving(outputs);
  const remaining = inAccum - outAccum - fee;

  if (!isFinite(remaining) || remaining < 0) return { fee: fee };

  const unspecified = outputs.reduce((a, x) => {
    return a + !isFinite(x.value);
  }, 0);

  if (remaining === 0 && unspecified === 0)
    return utils.finalize(utxos, outputs, feeRate);

  const splitOutputsCount = outputs.reduce((a, x) => {
    if (x.value !== undefined) return a;
    return a + 1;
  }, 0);

  const splitValue = Math.floor(remaining / splitOutputsCount);

  // assign splitValue to outputs not user defined
  outputs = outputs.map(function (x) {
    if (x.value !== undefined) return x;

    // not user defined, but still copy over any non-value fields
    var y = {};
    for (var k in x) y[k] = x[k];
    y.value = splitValue;
    return y;
  });

  return utils.finalize(utxos, outputs, feeRate);
};
