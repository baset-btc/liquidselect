const utils = require("./utils");

const EXTRA_OUTPUT_BYTES = 46 + 34; // Covers witness cases and address
const threshold = utils.inputBytes({});
const noResultOutput = { fee: 0 };

// add inputs until we reach or surpass the target value (or deplete)
// worst-case: O(n)
module.exports = function liquidAssetsAccumulative(
  utxos,
  outputs,
  feeRate,
  isMainnet
) {
  if (!isFinite(utils.uintOrNaN(feeRate))) return noResultOutput;

  const feeAsset = isMainnet
    ? "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d"
    : "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
  let bytesAccum = utils.transactionBytes([], outputs);

  const inputs = [];
  let inAccum = {};
  let outAccum = {};

  let resOutputs = outputs.map((utxo) => ({
    ...utxo,
    asset: utxo.asset.toString("hex"),
  }));

  resOutputs.forEach((output) => {
    if (outAccum[output.asset]) {
      outAccum[output.asset] += output.value;
    } else {
      outAccum[output.asset] = output.value;
    }
  });

  const nonFeeAssetInputs = utxos.filter(
    (utxo) => utxo.witnessUtxo.asset !== feeAsset
  );
  const feeAssetInputs = utxos.filter(
    (utxo) => utxo.witnessUtxo.asset === feeAsset
  );

  if (
    Object.keys(outAccum).some(
      (valOutputAsset) =>
        valOutputAsset !== feeAsset &&
        nonFeeAssetInputs.findIndex(
          (valInput) =>
            valInput.value >= outAccum[valOutputAsset] &&
            valInput.asset === valOutputAsset
        ) === -1
    )
  ) {
    return noResultOutput;
  }

  for (let i = 0; i < nonFeeAssetInputs.length; i++) {
    const input = nonFeeAssetInputs[i];
    const inputBytes = utils.inputBytes(input);

    Object.keys(outAccum).forEach((asset) => {
      if (!inAccum[asset]) inAccum[asset] = 0;
      if (input.witnessUtxo.asset === asset) {
        const inputValue = utils.uintOrNaN(input.value);
        inAccum[asset] += inputValue;
      }
    });

    bytesAccum += inputBytes;
    inputs.push(input);
    // Verificar si se alcanzó la cantidad necesaria de valor de salida más el fee para todos los assets
    const allAssetsCovered = Object.keys(outAccum).every(
      (asset) => inAccum[asset] >= outAccum[asset]
    );
    if (allAssetsCovered) {
      continue;
    }
  }

  Object.keys(outAccum).forEach((asset) => {
    if (outAccum[asset] < inAccum[asset]) {
      const extraOutputBytes = utils.outputBytes({ asset });
      bytesAccum += extraOutputBytes;

      const remainderAfterExtraOutput = inAccum[asset] - outAccum[asset];
      resOutputs = resOutputs.concat({
        asset,
        value: Math.round(remainderAfterExtraOutput),
      });
    } else if (outAccum[asset] > inAccum[asset]) {
      return noResultOutput;
    }
  });

  for (let i = 0; i < feeAssetInputs.length; i++) {
    const input = feeAssetInputs[i];
    const inputBytes = utils.inputBytes(input);

    const inputValue = utils.uintOrNaN(input.value);
    if (!inAccum[feeAsset]) inAccum[feeAsset] = 0;
    if (input.witnessUtxo.asset === feeAsset) {
      inAccum[feeAsset] += inputValue;
    }

    // Si todos los assets están cubiertos, agregar la entrada y actualizar los valores acumulados
    bytesAccum += inputBytes;
    inputs.push(input);

    const basePotentialFee = feeRate * bytesAccum;
    shouldHadExtraOutput =
      inAccum[feeAsset] +
        inputValue -
        ((outAccum[feeAsset] || 0) + basePotentialFee) >
      threshold;
    const feeAssetCovered =
      inAccum[feeAsset] >=
      (outAccum[feeAsset] || 0) +
        feeRate *
          (bytesAccum + (shouldHadExtraOutput ? EXTRA_OUTPUT_BYTES : 0));

    if (feeAssetCovered) {
      if ((outAccum[feeAsset] || 0) < inAccum[feeAsset]) {
        const feeAfterExtraOutput = feeRate * (bytesAccum + EXTRA_OUTPUT_BYTES);
        const remainderAfterExtraOutput =
          inAccum[feeAsset] - ((outAccum[feeAsset] || 0) + feeAfterExtraOutput);
        if (remainderAfterExtraOutput > threshold) {
          bytesAccum += EXTRA_OUTPUT_BYTES;
          resOutputs = resOutputs.concat({
            value: Math.round(remainderAfterExtraOutput),
          });
          fee = Math.round(bytesAccum * feeRate); // TODO: Fix bug en el blackjack
        } else {
          fee = inAccum[feeAsset];
        }
      }

      if (!isFinite(fee)) return noResultOutput;

      return {
        inputs: inputs,
        outputs: resOutputs,
        fee: fee,
      };
    }
  }

  return noResultOutput;

  // for (let i = 0; i < utxos.length; i++) {
  //   var utxo = utxos[i];
  //   var utxoBytes = utils.inputBytes(utxo);
  //   var utxoFee = feeRate * utxoBytes;
  //   var utxoValue = utils.uintOrNaN(utxo.value);

  //   // skip detrimental input
  //   if (utxoFee > utxo.value) {
  //     if (i === utxos.length - 1)
  //       return { fee: feeRate * (bytesAccum + utxoBytes) };
  //     continue;
  //   }

  //   bytesAccum += utxoBytes;
  //   inAccum += utxoValue;
  //   inputs.push(utxo);

  //   var baseFee = feeRate * bytesAccum;
  //   var shouldHadExtraOutput = netAccum > 0 && netAccum + baseFee > threshold;
  //   var fee = baseFee + feeRate * (shouldHadExtraOutput ? BLANK_OUTPUT : 0);

  //   var fee = feeRate * bytesAccum;

  //   // go again?
  //   if (inAccum < outAccum + fee) continue;

  //   return utils.finalize(inputs, outputs, feeRate);
  // }

  // return { fee: Math.round(feeRate * bytesAccum) };
};
