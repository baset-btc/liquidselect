const utils = require("./utils");

const threshold = utils.inputBytes({});

// only add inputs if they don't bust the target value (aka, exact match)
// worst-case: O(n)
module.exports = function liquidAssetsBlackjack(
  utxos,
  outputs,
  feeRate,
  isMainnet = true,
  options = {}
) {
  if (!isFinite(utils.uintOrNaN(feeRate))) return utils.noResultOutput();
  const changeOutputTemplate = {
    address: options?.changeAddress,
    asset: options?.feeAsset,
  };
  const extraOutputVBytes = utils.extraOutputBytes(changeOutputTemplate);

  const feeAsset = isMainnet
    ? "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d"
    : "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
  let bytesAccum = utils.transactionBytes([], outputs);
  const inputs = [];
  const inAccum = {};
  const outAccum = {};

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
    (utxo) => utxo.witnessUtxo.asset.toString("hex") !== feeAsset
  );
  const feeAssetInputs = utxos.filter(
    (utxo) => utxo.witnessUtxo.asset.toString("hex") === feeAsset
  );

  // Primera pasada para validar los assets non lbtc. Si esta no tiene exito, se devuelve fee 0
  for (let i = 0; i < nonFeeAssetInputs.length; i++) {
    const input = nonFeeAssetInputs[i];
    const inputBytes = utils.inputBytes(input);
    const inputValue = utils.uintOrNaN(input.value);

    let assetsCovered = false;
    Object.keys(outAccum).forEach((asset) => {
      if (!inAccum[asset]) inAccum[asset] = 0;
      if (input.witnessUtxo.asset.toString("hex") === asset) {
        
        if (inAccum[asset] + inputValue <= outAccum[asset]) {
          inAccum[asset] += inputValue;
          assetsCovered = true;
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
  for (const asset of Object.keys(outAccum)) {
    if (outAccum[asset] < inAccum[asset]) {
      const extraOutputBytes = utils.outputBytes({ asset: Buffer.from(asset, 'hex') });
      bytesAccum += extraOutputBytes;

      const remainderAfterExtraOutput = inAccum[asset] - outAccum[asset];
      resOutputs = resOutputs.concat({
        asset,
        value: Math.floor(remainderAfterExtraOutput),
      });
    } else if (outAccum[asset] > inAccum[asset]) {
      return utils.noResultOutput();
    }
  }

  for (let i = 0; i < feeAssetInputs.length; i++) {
    const input = feeAssetInputs[i];
    const inputBytes = utils.inputBytes(input);
    const inputValue = utils.uintOrNaN(input.value);
    const basePotentialFee = feeRate * (bytesAccum + inputBytes);
    let shouldAddExtraOutput =
        inAccum[feeAsset] +
          inputValue -
          (outAccum[feeAsset] + basePotentialFee) >
        threshold;
    let fee =
        basePotentialFee +
        feeRate * (shouldAddExtraOutput ? extraOutputVBytes : 0);

    let assetsCovered = false;
    if (!inAccum[feeAsset]) inAccum[feeAsset] = 0;
    if (input.witnessUtxo.asset.toString("hex") === feeAsset) {
      if (
        inAccum[feeAsset] + inputValue <=
        outAccum[feeAsset] + fee + threshold
      ) {
        inAccum[feeAsset] += inputValue;
        assetsCovered = true;
      }
    }

    // Si todos los assets están cubiertos, agregar la entrada y actualizar los valores acumulados
    if (assetsCovered) {
      bytesAccum += inputBytes;
      inputs.push(input);
      // Verificar si se alcanzó la cantidad necesaria de valor de salida más el fee para todos los assets
      shouldAddExtraOutput =
        inAccum[feeAsset] + ((input.witnessUtxo.asset.toString("hex") === feeAsset &&inAccum[feeAsset] + inputValue <=
          outAccum[feeAsset] + fee + threshold) ? 0 : inputValue) -
          (outAccum[feeAsset] + basePotentialFee) >
        threshold;
      const allAssetsCovered =
        inAccum[feeAsset] >=
        outAccum[feeAsset] +
          feeRate *
            (bytesAccum +
              (shouldAddExtraOutput ? extraOutputVBytes : 0));

      if (allAssetsCovered) {
        if (outAccum[feeAsset] < inAccum[feeAsset]) {
          const feeAfterExtraOutput = feeRate * (bytesAccum + extraOutputVBytes);
          const remainderAfterExtraOutput =
            inAccum[feeAsset] - (outAccum[feeAsset] + feeAfterExtraOutput);
          if (remainderAfterExtraOutput > threshold) {
            bytesAccum += extraOutputVBytes;
            resOutputs = resOutputs.concat({
              value: Math.floor(remainderAfterExtraOutput),
            });
            fee = Math.ceil(bytesAccum * feeRate);
          } else {
            fee = inAccum[feeAsset] - outAccum[feeAsset];
          }
        } else {
          fee = Math.ceil(bytesAccum * feeRate);
        }

        if (!isFinite(fee)) return utils.noResultOutput();

        return {
          inputs: inputs,
          outputs: resOutputs,
          fee: fee,
        };
      }
    }
  }

  return utils.noResultOutput();
};
