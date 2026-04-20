const tape = require('tape')
const coinSelect = require('../')
const coinSplit = require('../split')
const coinBreak = require('../break')
const utils = require('../utils')

const FEE_ASSET_HEX =
  '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d'
const FEE_ASSET = Buffer.from(FEE_ASSET_HEX, 'hex')
const ASSET_A_HEX = '11'.repeat(32)
const ASSET_A = Buffer.from(ASSET_A_HEX, 'hex')
const CHANGE_ADDRESS = 'ex1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9m4x3j'

function makeScript (fill) {
  return Buffer.from('0014' + String(fill || '11').repeat(20), 'hex')
}

function makeUtxo (params) {
  return {
    txId: params.txId,
    vout: params.vout,
    value: params.value,
    witnessUtxo: {
      asset: params.asset,
      script: params.script
    }
  }
}

tape('coinSelect: LBTC issuance with empty targets', function (t) {
  const utxos = [
    makeUtxo({
      txId: 'a',
      vout: 0,
      value: 1000,
      asset: FEE_ASSET,
      script: makeScript('11')
    })
  ]

  const actual = coinSelect(
    utxos,
    [],
    0,
    true,
    true,
    false,
    { changeAddress: CHANGE_ADDRESS }
  )

  t.equal(actual.fee, 0)
  t.equal(actual.inputs.length, 1)
  t.equal(actual.outputs.length, 1)
  t.equal(actual.outputs[0].value, 1000)
  t.end()
})

tape('coinSelect: multi-asset flow uses asset and fee UTXOs', function (t) {
  const utxos = [
    makeUtxo({
      txId: 'asset',
      vout: 0,
      value: 500,
      asset: ASSET_A,
      script: makeScript('22')
    }),
    makeUtxo({
      txId: 'fee',
      vout: 1,
      value: 500,
      asset: FEE_ASSET,
      script: makeScript('33')
    })
  ]

  const outputs = [{ value: 200, asset: ASSET_A }]
  const actual = coinSelect(
    utxos,
    outputs,
    0,
    true,
    false,
    false,
    { changeAddress: CHANGE_ADDRESS }
  )

  t.equal(actual.fee, 0)
  t.equal(actual.inputs.length, 2)
  t.equal(actual.outputs.length, 3)
  t.ok(actual.outputs.some(function (output) {
    return output.asset === ASSET_A_HEX && output.value === 200
  }))
  t.ok(actual.outputs.some(function (output) {
    return output.asset === ASSET_A_HEX && output.value === 300
  }))
  t.ok(actual.outputs.some(function (output) {
    return output.asset === undefined && output.value === 500
  }))
  t.end()
})

tape('coinSelect: fail fast for malformed multi-asset UTXO payload', function (t) {
  const malformedUtxos = [
    {
      txId: 'bad',
      vout: 0,
      value: 500,
      witnessUtxo: {
        script: makeScript('44')
      }
    },
    makeUtxo({
      txId: 'fee',
      vout: 1,
      value: 500,
      asset: FEE_ASSET,
      script: makeScript('55')
    })
  ]

  const outputs = [{ value: 200, asset: ASSET_A }]
  t.throws(function () {
    coinSelect(
      malformedUtxos,
      outputs,
      0.1,
      true,
      false,
      false,
      { changeAddress: CHANGE_ADDRESS }
    )
  }, /toString/)
  t.end()
})

tape('split: distributes value evenly with zero fee', function (t) {
  const actual = coinSplit([{ value: 1000 }], [{ address: 'a' }, { address: 'b' }], 0)
  t.equal(actual.fee, 0)
  t.equal(actual.inputs.length, 1)
  t.equal(actual.outputs.length, 2)
  t.equal(actual.outputs[0].value, 500)
  t.equal(actual.outputs[1].value, 500)
  t.ok(Buffer.isBuffer(actual.outputs[0].asset))
  t.ok(Buffer.isBuffer(actual.outputs[1].asset))
  t.end()
})

tape('split: preserves explicit output asset and defaults only missing assets', function (t) {
  const actual = coinSplit(
    [{ value: 1000 }],
    [{ address: 'a', asset: ASSET_A }, { address: 'b' }],
    0
  )

  t.equal(actual.fee, 0)
  t.equal(actual.outputs.length, 2)
  t.equal(actual.outputs[0].value, 500)
  t.equal(actual.outputs[1].value, 500)
  t.equal(actual.outputs[0].asset.toString('hex'), ASSET_A_HEX)
  t.equal(actual.outputs[1].asset.toString('hex'), FEE_ASSET_HEX)
  t.end()
})

tape('break: splits into denominations and preserves remainder as fee', function (t) {
  const actual = coinBreak([{ value: 1000 }], { value: 300 }, 0)
  t.equal(actual.inputs.length, 1)
  t.equal(actual.outputs.length, 3)
  t.equal(actual.outputs[0].value, 300)
  t.equal(actual.outputs[1].value, 300)
  t.equal(actual.outputs[2].value, 300)
  t.equal(actual.fee, 100)
  t.end()
})

tape('utils: uintOrNaN accepts decimal and rejects invalid numbers', function (t) {
  t.equal(utils.uintOrNaN(1.1), 1.1)
  t.equal(Number.isNaN(utils.uintOrNaN('1.1')), true)
  t.equal(Number.isNaN(utils.uintOrNaN(-1)), true)
  t.end()
})
