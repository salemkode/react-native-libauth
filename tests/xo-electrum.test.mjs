import test from 'node:test';
import assert from 'node:assert/strict';
import {ElectrumClient} from '../packages/react-native-xo/src/electrum.js';

function transportFixture(options = {}) {
  const state = {sockets: [], sent: []};
  class Socket {
    constructor() { state.sockets.push(this); queueMicrotask(() => this.onopen?.()); }
    send(raw) {
      const request = JSON.parse(raw); state.sent.push(request);
      if (options.silent) return;
      queueMicrotask(() => this.onmessage({data: JSON.stringify(options.error ? {id: request.id, error: {code: 1, message: 'rejected'}} : {id: request.id, result: request.params[0]})}));
    }
    close() { this.onclose?.(); }
  }
  return {state, client: new ElectrumClient('wss://example.invalid', {WebSocketImpl: Socket, timeout: 30})};
}
test('Electrum correlates concurrent requests and preserves exact params', async () => {
  const {client, state} = transportFixture();
  assert.deepEqual(await Promise.all([client.request('first', [1]), client.request('second', [2])]), [1, 2]);
  assert.deepEqual(state.sent.map(item => item.method), ['first', 'second']); client.close();
});
test('Electrum surfaces rejection and never retries a broadcast', async () => {
  const {client, state} = transportFixture({error: true});
  await assert.rejects(client.request('blockchain.transaction.broadcast', ['00']), error => error.name === 'ElectrumRpcError');
  assert.equal(state.sent.length, 1); client.close();
});
test('Electrum timeout and closed connection reject outstanding operations', async () => {
  const {client, state} = transportFixture({silent: true});
  await assert.rejects(client.request('broadcast', ['00']), /timed out/);
  const request = client.request('pending');
  await new Promise(resolve => setImmediate(resolve)); client.close();
  await assert.rejects(request, /disconnected/);
  await assert.rejects(client.request('after close'), /closed/);
  assert.equal(state.sent.length, 2);
});
test('Electrum refuses unencrypted endpoints', () => { assert.throws(() => new ElectrumClient('ws://example.invalid'), /encrypted/); });
