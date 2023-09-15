# bitcoinselect

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

This is a forked project of `coinselect`, which is an unspent transaction output (UTXO) selection module for bitcoin.

It supports precise calculation of fee for various type of input and output(`segwit`, `non-segwit`, `nested segwit`, `taproot`).

**WARNING:** Value units are in `satoshi`s, **not** Bitcoin.

## Install

```bash
npm install bitcoinselect
```

## Algorithms
Module | Algorithm | Re-orders UTXOs?
-|-|-
`require('bitcoinselect')` | Blackjack, with Accumulative fallback | By Descending Value
`require('bitcoinselect/accumulative')` | Accumulative - accumulates inputs until the target value (+fees) is reached, skipping detrimental inputs | -
`require('bitcoinselect/blackjack')` | Blackjack - accumulates inputs until the target value (+fees) is matched, does not accumulate inputs that go over the target value (within a threshold) | -
`require('bitcoinselect/break')` | Break - breaks the input values into equal denominations of `output` (as provided) | -
`require('bitcoinselect/split')` | Split - splits the input values evenly between all `outputs`, any provided `output` with `.value` remains unchanged | -


**Note:** Each algorithm will add a change output if the `input - output - fee` value difference is over a dust threshold.
This is calculated independently by `utils.finalize`, irrespective of the algorithm chosen, for the purposes of safety.

**Pro-tip:** if you want to send-all inputs to an output address, `bitcoinselect/split` with a partial output (`.address` defined, no `.value`) can be used to send-all, while leaving an appropriate amount for the `fee`. 

## Example

``` javascript
let coinSelect = require('bitcoinselect')
let feeRate = 55 // satoshis per byte
let utxos = [
  ...,
  {
    txId: '...',
    vout: 0,
    ...,
    value: 10000,
    // For use with PSBT:
    // will be passed on to inputs later
    // If not specified, every input will be assumed as p2pkh output for fee calculation
    nonWitnessUtxo: Buffer.from('...full raw hex of txId tx...', 'hex'),
    // OR
    // if your utxo is a segwit output(p2wpkh), you should use witnessUtxo
    // This will calculate segwit input fee precisely which is approximately 1/4 of p2pkh
    witnessUtxo: {
      script: Buffer.from('... scriptPubkey hex...', 'hex'),
      value: 10000 // 0.0001 BTC and is the exact same as the value above
    },
    // OR
    // if your utxo is a script output(p2sh), you should use redeemScript
    // This will calculate script bytes for precise fee calcuation
    redeemScript: Buffer.from('...'),
    // OR
    // if your utxo is a segwit script output(p2wsh), you should use witnessScript
    // This will calculate segwit script fee precisely which is approximately 1/4 of p2sh
    witnessScript: Buffer.from('...'),
    // OR if your utxo is a nested segwit output, you should use
    // both redeemScript and witnessUtxo (p2sh-p2wpkh)
    // both redeemScript and witnessScript (p2sh-p2wsh)
    // for precise fee calculation
    // OR
    // if your utxo is a taproot output(p2tr), you should set isTaproot true
    isTaproot: true
  }
]
let targets = [
  ...,
  {
    address: '1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm',
    value: 5000
  }
]

// ...
let { inputs, outputs, fee } = coinSelect(utxos, targets, feeRate)

// the accumulated fee is always returned for analysis
console.log(fee)

// .inputs and .outputs will be undefined if no solution was found
if (!inputs || !outputs) return

let psbt = new bitcoin.Psbt()

inputs.forEach(input =>
  psbt.addInput({
    hash: input.txId,
    index: input.vout,
    nonWitnessUtxo: input.nonWitnessUtxo,
    // OR (not both)
    witnessUtxo: input.witnessUtxo,
  })
)
outputs.forEach(output => {
  // watch out, outputs may have been added that you need to provide
  // an output address/script for
  if (!output.address) {
    output.address = wallet.getChangeAddress()
    wallet.nextChangeAddress()
  }

  psbt.addOutput({
    address: output.address,
    value: output.value,
  })
})
```


## License [MIT](LICENSE)
