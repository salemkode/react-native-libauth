import assert from 'node:assert/strict';
import test from 'node:test';
import {
  binToHex, cashAddressToLockingBytecode, createVirtualMachineBCH, decodeTransaction,
  encodeTransaction, hashTransaction, hexToBin,
} from '@bitauth/libauth';
import { initializeNativeCrypto } from '@bitauth/libauth/build/lib/crypto/default-crypto-instances.js';
import { createWalletSession, formatBch, parseBch, validateRecipient } from '../packages/react-native-xo/src/core.js';
import headers from './xo-checkpoint-headers.json' with { type: 'json' };
await initializeNativeCrypto();

// Public BIP39 test vector. Never fund it on a live network.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
function fixture(network = 'chipnet', options = {}) {
  const state = { requests: [], outputs: [], transactions: new Map(), closed: false };
  const client = {
    async request(method, params) {
      state.requests.push({ method, params });
      if (method === 'server.version') return ['fixture', '1.4'];
      if (method === 'blockchain.block.header') return options.header || headers[network];
      if (method === 'blockchain.scripthash.listunspent') return options.list || state.outputs;
      if (method === 'blockchain.transaction.get') return state.transactions.get(params[0]);
      if (method === 'blockchain.transaction.broadcast') {
        if (options.broadcastError) throw new Error('connection lost after submission');
        const bytes = hexToBin(params[0]);
        const tx = decodeTransaction(bytes);
        const source = tx.inputs.map(input => decodeTransaction(hexToBin(state.transactions.get(binToHex(input.outpointTransactionHash)))).outputs[input.outpointIndex]);
        assert.equal(createVirtualMachineBCH().verify({ transaction: tx, sourceOutputs: source }), true);
        const hash = hashTransaction(bytes);
        state.transactions.set(hash, params[0]);
        state.outputs = [];
        return hash;
      }
      throw new Error(`Unexpected RPC ${method}`);
    },
    close() { state.closed = true; },
  };
  const wallet = createWalletSession({ mnemonic, network, client });
  function fund(value = 100000n, token) {
    const locking = cashAddressToLockingBytecode(wallet.address).bytecode;
    const tx = { version: 2, locktime: 0, inputs: [{ outpointTransactionHash: new Uint8Array(32).fill(7), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }], outputs: [{ lockingBytecode: locking, valueSatoshis: value, ...(token ? { token } : {}) }] };
    const bytes = encodeTransaction(tx); const hash = hashTransaction(bytes);
    state.transactions.set(hash, binToHex(bytes));
    state.outputs.push({ tx_hash: hash, tx_pos: 0, value: Number(value), height: 1 });
    return hash;
  }
  return { wallet, state, fund };
}

test('XO amounts retain exact precision and reject invalid values', () => {
  assert.equal(parseBch('0.00000001'), 1n);
  assert.equal(formatBch(2100000000000000n), '21000000.00000000');
  for (const amount of ['-1', '1e-8', '0.000000001', 'NaN', '21000001']) assert.throws(() => parseBch(amount));
});

test('network isolation, deterministic restoration, and strict CashAddress validation', () => {
  const chip = fixture(); const real = fixture('mainnet'); const restored = fixture();
  assert.equal(chip.wallet.address, restored.wallet.address);
  assert.notEqual(chip.wallet.address.split(':')[1], real.wallet.address.split(':')[1]);
  assert.equal(chip.wallet.path, "m/44'/1'/0'/0/0");
  assert.equal(real.wallet.path, "m/44'/145'/0'/0/0");
  assert.throws(() => validateRecipient(chip.wallet.address, 'mainnet'), /bitcoincash/);
  assert.throws(() => validateRecipient(real.wallet.address, 'chipnet'), /bchtest/);
  assert.throws(() => validateRecipient(chip.wallet.address.split(':')[1], 'chipnet'));
  assert.throws(() => { chip.wallet.network = 'mainnet'; });
  assert.throws(() => createWalletSession({ mnemonic: 'wrong phrase', client: {} }));
  [chip, real, restored].forEach(item => item.wallet.close());
});

test('receive, review, locally verify, and broadcast on both networks', async () => {
  for (const network of ['chipnet', 'mainnet']) {
    const { wallet, state, fund } = fixture(network);
    fund();
    assert.equal((await wallet.refresh()).balanceSatoshis, '100000');
    const review = await wallet.prepareSend({ address: wallet.address, amountBch: '0.0005' });
    assert.equal(review.amountBch, '0.00050000');
    assert.ok(BigInt(review.feeSatoshis) >= BigInt(review.byteLength));
    assert.equal(state.requests.some(item => item.method.endsWith('.broadcast')), false);
    assert.equal((await wallet.broadcast(review.id)).txid, review.txid);
    await assert.rejects(wallet.broadcast(review.id), /expired/);
    assert.equal(state.requests.filter(item => item.method.endsWith('.broadcast')).length, 1);
    assert.equal((await wallet.lookupTransaction(review.txid)).found, true);
    assert.equal((await wallet.refresh()).balanceSatoshis, '0');
    wallet.close(); assert.equal(state.closed, true);
  }
});

test('cancelled, expired, stale and unfunded payments never broadcast', async () => {
  const { wallet, state, fund } = fixture();
  await assert.rejects(wallet.prepareSend({ address: wallet.address, amountBch: '1' }), /Insufficient/);
  await assert.rejects(wallet.prepareSend({ address: wallet.address, amountBch: '0.00000001' }), /Minimum/);
  fund();
  const review = await wallet.prepareSend({ address: wallet.address, amountBch: '0.0005' });
  wallet.cancelSend(); await assert.rejects(wallet.broadcast(review.id), /expired/);
  const stale = await wallet.prepareSend({ address: wallet.address, amountBch: '0.0005' });
  state.outputs = []; await assert.rejects(wallet.broadcast(stale.id), /spent/);
  assert.equal(state.requests.some(item => item.method.endsWith('.broadcast')), false);
  wallet.close(); await assert.rejects(wallet.refresh(), /closed/);
});

test('wrong network server, dishonest amounts, duplicates, and wrong transaction hashes fail closed', async () => {
  const wrong = fixture('chipnet', { header: headers.mainnet });
  await assert.rejects(wrong.wallet.refresh(), /wrong network/); wrong.wallet.close();
  const dishonest = fixture(); dishonest.fund(); dishonest.state.outputs[0].value++;
  await assert.rejects(dishonest.wallet.refresh(), /does not match/); dishonest.wallet.close();
  const duplicates = fixture(); duplicates.fund(); duplicates.state.outputs.push(duplicates.state.outputs[0]);
  await assert.rejects(duplicates.wallet.refresh(), /duplicate/); duplicates.wallet.close();
  const badHash = fixture(); const hash = badHash.fund(); badHash.state.transactions.set(hash, '00000000');
  await assert.rejects(badHash.wallet.refresh(), /wrong hash/); badHash.wallet.close();
});

test('token-bearing outputs are excluded even when server omits token_data', async () => {
  const { wallet, fund } = fixture();
  fund(100000n, { category: new Uint8Array(32).fill(1), amount: 1n });
  assert.equal((await wallet.refresh()).balanceSatoshis, '0');
  await assert.rejects(wallet.prepareSend({ address: wallet.address, amountBch: '0.0005' }), /Insufficient/);
  wallet.close();
});

test('lost broadcast response consumes the draft and blocks another send', async () => {
  const { wallet, state, fund } = fixture('chipnet', { broadcastError: true }); fund();
  const review = await wallet.prepareSend({ address: wallet.address, amountBch: '0.0005' });
  await assert.rejects(wallet.broadcast(review.id), error => error.name === 'BroadcastUncertainError' && error.txid === review.txid);
  await assert.rejects(wallet.broadcast(review.id), /expired/);
  await assert.rejects(wallet.prepareSend({ address: wallet.address, amountBch: '0.0001' }), /pending/);
  assert.equal(state.requests.filter(item => item.method.endsWith('.broadcast')).length, 1);
  wallet.close();
});

test('multiple inputs sign correctly and dust change is included in the disclosed fee', async () => {
  const many = fixture(); many.fund(40000n); many.fund(50000n);
  const review = await many.wallet.prepareSend({address: many.wallet.address, amountBch: '0.0008'});
  await many.wallet.broadcast(review.id); many.wallet.close();
  const dust = fixture(); dust.fund();
  const payment = await dust.wallet.prepareSend({address: dust.wallet.address, amountBch: '0.000994'});
  assert.equal(payment.feeSatoshis, '600');
  await dust.wallet.broadcast(payment.id); dust.wallet.close();
});

test('expired review cannot broadcast', async context => {
  const {wallet, state, fund} = fixture(); fund();
  const draft = await wallet.prepareSend({address: wallet.address, amountBch: '0.0005'});
  context.mock.method(Date, 'now', () => draft.expiresAt + 1);
  await assert.rejects(wallet.broadcast(draft.id), /expired/);
  assert.equal(state.requests.some(item => item.method.endsWith('.broadcast')), false);
  wallet.close();
});

test('session identity is immutable while draft state remains mutable', async () => {
  const {wallet, fund} = fixture(); fund();
  for (const name of ['network', 'path', 'address']) assert.equal(Object.getOwnPropertyDescriptor(wallet, name).writable, false);
  assert.equal(Object.isFrozen(wallet), false, 'Do not freeze Babel-lowered private fields.');
  const first = await wallet.prepareSend({address: wallet.address, amountBch: '0.0002'});
  const second = await wallet.prepareSend({address: wallet.address, amountBch: '0.0003'});
  assert.notEqual(first.id, second.id);
  await assert.rejects(wallet.broadcast(first.id), /expired/);
  await wallet.broadcast(second.id); wallet.close();
});
