export type ByteLike = Uint8Array | string;

export interface WitnessUtxo {
  script?: ByteLike;
  value?: number;
  asset?: ByteLike;
  scriptpubkey_type?: string;
  scriptPubKeyType?: string;
  peginWitness?: ByteLike[];
  hex?: string;
  valuecommitment?: ByteLike;
  assetcommitment?: ByteLike;
  noncecommitment?: ByteLike;
}

export interface UTXO {
  txId?: string | Uint8Array;
  txid?: string | Uint8Array;
  vout: number;
  value: number;
  address?: string;
  asset?: ByteLike;
  nonWitnessUtxo?: Uint8Array;
  witnessUtxo?: WitnessUtxo;
  redeemScript?: Uint8Array;
  witnessScript?: Uint8Array;
  isTaproot?: boolean;
}

export interface Target {
  address?: string;
  script?: ByteLike;
  value?: number;
  asset?: ByteLike;
}

export interface SelectedUTXO {
  inputs?: UTXO[];
  outputs?: Target[];
  fee: number;
}

export interface CoinSelectOptions {
  changeAddress?: string;
  feeAsset?: string;
}

export default function coinSelect(
  utxos: UTXO[],
  outputs: Target[],
  feeRate: number,
  isMainnet?: boolean,
  isIssuance?: boolean,
  isConfidentialIssuance?: boolean,
  options?: CoinSelectOptions
): SelectedUTXO;
