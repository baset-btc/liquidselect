const utils = require("./utils");

const EXTRA_OUTPUT_BYTES = 44 + 34;
const noResultOutput = { fee: 0 };
const threshold = utils.inputBytes({});

// only add inputs if they don't bust the target value (aka, exact match)
// worst-case: O(n)
module.exports = function liquidAssetsBlackjack(
  utxos,
  outputs,
  feeRate,
  isMainnet = true
) {
  if (!isFinite(utils.uintOrNaN(feeRate))) return noResultOutput;

  const feeAsset = isMainnet
    ? "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d"
    : "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
  let bytesAccum = utils.transactionBytes([], outputs);
  const inputs = [];
  let inAccum = {};
  let outAccum = {};

  const resOutputs = outputs.map((utxo) => ({
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

  // Primera pasada para validar los assets non lbtc. Si esta no tiene exito, se devuelve fee 0
  for (let i = 0; i < nonFeeAssetInputs.length; i++) {
    const input = nonFeeAssetInputs[i];
    const inputBytes = utils.inputBytes(input);

    let assetsCovered = true;
    Object.keys(outAccum).forEach((asset) => {
      if (!inAccum[asset]) inAccum[asset] = 0;
      if (input.witnessUtxo.asset === asset) {
        const inputValue = utils.uintOrNaN(input.value);
        if (inAccum[asset] + inputValue <= outAccum[asset]) {
          inAccum[asset] += inputValue;
        } else {
          assetsCovered = false;
        }
      }
    });

    if (assetsCovered) {
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
  }

  // Si algun mont in > out -> Se debe agregar output extra para ese asset
  // Si todos los assets están cubiertos, agregar la entrada y actualizar los valores acumulados
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

    let assetsCovered = true;
    if (!inAccum[feeAsset]) inAccum[feeAsset] = 0;
    if (input.witnessUtxo.asset === feeAsset) {
      const basePotentialFee = feeRate * (bytesAccum + inputBytes);
      const inputValue = utils.uintOrNaN(input.value);
      let shouldAddExtraOutput =
        inAccum[feeAsset] +
          inputValue -
          (outAccum[feeAsset] + basePotentialFee) >
        threshold;
      let fee =
        basePotentialFee +
        feeRate * (shouldAddExtraOutput ? EXTRA_OUTPUT_BYTES : 0);
      if (
        inAccum[feeAsset] + inputValue <=
        outAccum[feeAsset] + fee + threshold
      ) {
        inAccum[feeAsset] += inputValue;
      } else {
        assetsCovered = false;
      }
    }

    // Si todos los assets están cubiertos, agregar la entrada y actualizar los valores acumulados
    if (assetsCovered) {
      bytesAccum += inputBytes;
      inputs.push(input);
      // Verificar si se alcanzó la cantidad necesaria de valor de salida más el fee para todos los assets
      shouldAddExtraOutput =
        inAccum[feeAsset] +
          inputValue -
          (outAccum[feeAsset] + basePotentialFee) >
        threshold;
      const allAssetsCovered =
        inAccum[feeAsset] >=
        outAccum[feeAsset] +
          feeRate *
            (bytesAccum + (shouldAddExtraOutput ? EXTRA_OUTPUT_BYTES : 0));

      if (allAssetsCovered) {
        if (outAccum[asset] < inAccum[asset]) {
          bytesAccum += EXTRA_OUTPUT_BYTES;
          const feeAfterExtraOutput = feeRate * bytesAccum;
          const remainderAfterExtraOutput =
            inAccum[feeAsset] - (outAccum[feeAsset] + feeAfterExtraOutput);
          resOutputs = resOutputs.concat({
            value: Math.round(remainderAfterExtraOutput),
          });
        }

        fee = Math.round(bytesAccum * feeRate);

        if (!isFinite(fee)) return noResultOutput;

        return {
          inputs: inputs,
          outputs: resOutputs,
          fee: fee,
        };
      }
    }
  }

  return noResultOutput;
};
