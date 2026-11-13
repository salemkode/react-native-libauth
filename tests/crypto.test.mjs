import assert from 'node:assert/strict';
import test from 'node:test';
import * as generated from '@bitauth/libauth';
import { initializeNativeCrypto } from '@bitauth/libauth/build/lib/crypto/default-crypto-instances.js';
import exportsBeforePatch from './upstream-exports.json' with { type: 'json' };
import { cryptoChecks } from '../shared/suite.js';

test('crypto fails clearly before initialization', () => {
  assert.throws(() => generated.sha256.hash(new Uint8Array()), /initializeLibauth/);
});

await initializeNativeCrypto();

test('initialization is idempotent and shares one promise', () => {
  assert.equal(initializeNativeCrypto(), initializeNativeCrypto());
});

for (const check of cryptoChecks(generated)) test(check.name, check.run);

test('generated API retains every upstream export', () => {
  assert.deepEqual(Object.keys(generated).filter(name => name !== 'initializeNativeCrypto').sort(), exportsBeforePatch);
});
