// var accumulative = require("./accumulative");
const liquidLBtcBlackjack = require("./liquidLBtcBlackjack");
const liquidAssetsBlackjack = require("./liquidAssetsBlackjack");
const liquidLBtcAccumulative = require("./liquidLBtcAccumulative");
const liquidAssetsAccumulative = require("./liquidAssetsAccumulative");
var utils = require("./utils");

// Library limitations
// - Only P2WPKH (segwit)
// - Only non confidential
// - Not prepared to send multiple assets
// - Not prepared to create multiple assets
// order by descending value, minus the inputs approximate fee
function utxoScore(x, feeRate) {
  return x.value - feeRate * utils.inputBytes(x);
}

function coinSelect(utxos, outputs, feeRate, isMainnet = true) {
  utxos = utxos.concat().sort(function (a, b) {
    return utxoScore(b, feeRate) - utxoScore(a, feeRate);
  });

  const feeAsset = isMainnet
    ? "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d"
    : "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";

  const uniqueOutputAssets = outputs.reduce((acc, output) => {
    const assetString = output.asset.toString("hex");
    return acc[assetString] ? acc : { ...acc, [assetString]: true };
  }, {});

  const hasIssuance = utxos.some((utxo) => utxo.issuance);
  // No tengo que tener outputs con el asset diferente//
  // Puedo tenerla solo si tengo un issuance
  let base;
  if (
    !hasIssuance &&
    (Object.keys(uniqueOutputAssets).length >= 2 ||
      (Object.keys(uniqueOutputAssets).length === 1 &&
        !Object.keys(uniqueOutputAssets).includes(feeAsset)))
  ) {
    base = liquidAssetsBlackjack(utxos, outputs, feeRate, isMainnet);
  } else {
    base = liquidLBtcBlackjack(utxos, outputs, feeRate, isMainnet);
  }
  if (base.inputs) return base;

  return (!hasIssuance && Object.keys(uniqueOutputAssets).length >= 2) ||
    (Object.keys(uniqueOutputAssets).length === 1 &&
      !Object.keys(uniqueOutputAssets).includes(feeAsset))
    ? liquidAssetsAccumulative(utxos, outputs, feeRate, isMainnet)
    : liquidLBtcAccumulative(utxos, outputs, feeRate, isMainnet);
}

module.exports = coinSelect;
