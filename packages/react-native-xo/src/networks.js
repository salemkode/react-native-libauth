import { z } from 'zod';

export const networkName = z.enum(['chipnet', 'mainnet']);
export const NETWORKS = Object.freeze({
  chipnet: Object.freeze({
    label: 'Chipnet', prefix: 'bchtest', coinType: 1,
    endpoint: 'wss://chipnet.imaginary.cash:50004',
    checkpointHeight: 121957,
    checkpointHash: '0000000056087dee73fb66178ca70da89dfd0be098b1a63cf6fe93934cd04c78',
    explorer: 'https://chipnet.chaingraph.cash/tx/',
  }),
  mainnet: Object.freeze({
    label: 'Mainnet', prefix: 'bitcoincash', coinType: 145,
    endpoint: 'wss://electrum.imaginary.cash:50004',
    checkpointHeight: 478559,
    checkpointHash: '000000000000000000651ef99cb9fcbe0dadde1d424bd9f15ff20136191a5eec',
    explorer: 'https://blockchair.com/bitcoin-cash/transaction/',
  }),
});
