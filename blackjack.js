var utils = require("./utils");

// only add inputs if they don't bust the target value (aka, exact match)
// worst-case: O(n)
module.exports = function blackjack(utxos, outputs, feeRate) {
  if (!isFinite(utils.uintOrNaN(feeRate))) return {};

  var bytesAccum = utils.transactionBytes([], outputs);

  var inAccum = 0;
  var inputs = [];
  var outAccum = utils.sumOrNaN(outputs); // Needs to filter by asset
  // Necesito filtrar utxos y outputs por asset
  // Hacer un for de este algoritmo para cada asset
  // A su vez, el fee solo se calcula para lbtc, una vez se tienen todos los inputs y outputs
  // Internamente, se calcula como inputs y outputs vacios, pero deben concordar todos los valores de los assets
  var threshold = utils.dustThreshold({}, feeRate);

  for (var i = 0; i < utxos.length; ++i) {
    var input = utxos[i];
    var inputBytes = utils.inputBytes(input);
    var fee = feeRate * (bytesAccum + inputBytes);
    var inputValue = utils.uintOrNaN(input.value);

    // would it waste value?
    if (inAccum + inputValue > outAccum + fee + threshold) continue;

    bytesAccum += inputBytes;
    inAccum += inputValue;
    inputs.push(input);

    // go again?
    if (inAccum < outAccum + fee) continue;

    return utils.finalize(inputs, outputs, feeRate);
  }

  return { fee: Math.round(feeRate * bytesAccum) };
};
