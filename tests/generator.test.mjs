import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as lib from '@bitauth/libauth';
import { stripCustomSections } from '../packages/react-native-libauth/scripts/wasm.mjs';

test('normalization preserves WASM imports and exports', async () => {
  for (const name of ['Sha1', 'Sha256', 'Sha512', 'Ripemd160', 'Secp256k1']) {
    const original = lib[`getEmbedded${name}Binary`]();
    const normalized = stripCustomSections(new Uint8Array(original));
    const before = await WebAssembly.compile(original);
    const after = await WebAssembly.compile(normalized);
    assert.deepEqual(WebAssembly.Module.imports(after), WebAssembly.Module.imports(before));
    assert.deepEqual(WebAssembly.Module.exports(after), WebAssembly.Module.exports(before));
    assert.deepEqual(stripCustomSections(normalized), normalized);
  }
});

test('manifest fingerprints match generated binaries', async () => {
  const manifest = JSON.parse(await readFile(new URL('../packages/react-native-libauth/generated/manifest.json', import.meta.url)));
  assert.equal(manifest.modules.length, 5);
  for (const module of manifest.modules) {
    const bytes = await readFile(new URL(`../packages/react-native-libauth/wasm/${module.name}.wasm`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), module.sha256);
    assert.equal(bytes.length, module.size);
  }
});

test('malformed section lengths are rejected', () => {
  assert.throws(() => stripCustomSections(Uint8Array.from([0,97,115,109,1,0,0,0,0,128])), /Invalid/);
  assert.throws(() => stripCustomSections(Uint8Array.from([0,97,115,109,1,0,0,0,1,42])), /Truncated/);
});
