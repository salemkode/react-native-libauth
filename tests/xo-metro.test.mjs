import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {transformAsync} from '@babel/core';
import {initializeNativeCrypto} from '@bitauth/libauth/build/lib/crypto/default-crypto-instances.js';
import {cashAddressToLockingBytecode, encodeTransaction, hashTransaction, binToHex} from '@bitauth/libauth';
import headers from './xo-checkpoint-headers.json' with {type:'json'};
await initializeNativeCrypto();

test('real Metro Babel private-field transform preserves draft and operation state', async () => {
  const source = new URL('../packages/react-native-xo/src/core.js', import.meta.url);
  const output = new URL('../packages/react-native-xo/src/.metro-test.mjs', import.meta.url);
  const compiled = await transformAsync(await readFile(source, 'utf8'), {filename: source.pathname, babelrc: false, configFile: false, presets: [['@react-native/babel-preset', {disableImportExportTransform: true, enableBabelRuntime: false}]]});
  await writeFile(output, compiled.code);
  try {
    const {createWalletSession} = await import(output.href);
    const data = {raw: '', hash: '', broadcasts: 0};
    const wallet = createWalletSession({mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', client: {
      async request(method) {
        if (method === 'server.version') return ['fixture', '1.4'];
        if (method === 'blockchain.block.header') return headers.chipnet;
        if (method === 'blockchain.scripthash.listunspent') return [{tx_hash: data.hash,tx_pos: 0,value: 100000,height: 1}];
        if (method === 'blockchain.transaction.get') return data.raw;
        if (method === 'blockchain.transaction.broadcast') {data.broadcasts++; throw new Error('transport lost');}
        throw new Error('Unexpected RPC');
      }, close() {},
    }});
    const bytes = encodeTransaction({version: 2,locktime: 0,inputs:[{outpointTransactionHash:new Uint8Array(32).fill(7),outpointIndex:0,sequenceNumber:0xffffffff,unlockingBytecode:new Uint8Array()}],outputs:[{lockingBytecode:cashAddressToLockingBytecode(wallet.address).bytecode,valueSatoshis:100000n}]});
    data.raw=binToHex(bytes);data.hash=hashTransaction(bytes);
    const review = await wallet.prepareSend({address:wallet.address,amountBch:'0.0005'});
    await assert.rejects(wallet.broadcast(review.id), error=>error.name==='BroadcastUncertainError');
    assert.equal(data.broadcasts,1);
    await assert.rejects(wallet.broadcast(review.id),/expired/);
    await assert.rejects(wallet.prepareSend({address:wallet.address,amountBch:'0.0001'}),/pending/);
    wallet.close();
  } finally {await unlink(output);}
});
