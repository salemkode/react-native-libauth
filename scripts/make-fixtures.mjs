import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import * as lib from '@bitauth/libauth';
import { initializeNativeCrypto } from '@bitauth/libauth/build/lib/crypto/default-crypto-instances.js';

await initializeNativeCrypto();

const privateKey = lib.hexToBin('00'.repeat(31) + '01');
const messageHash = lib.sha256.hash(lib.utf8ToBin('libauth native parity'));
const publicKey = lib.secp256k1.derivePublicKeyCompressed(privateKey);
const seed = '000102030405060708090a0b0c0d0e0f';
const child = lib.deriveHdPath(lib.deriveHdPrivateNodeFromSeed(lib.hexToBin(seed)), "m/0'/1/2'");
const fixtures = {
  reference: '@bitauth/libauth 3.0.0; hash vectors independently computed using Node crypto',
  privateKey: lib.binToHex(privateKey),
  messageHash: lib.binToHex(messageHash),
  publicKey: lib.binToHex(publicKey),
  compact: lib.binToHex(lib.secp256k1.signMessageHashCompact(privateKey, messageHash)),
  der: lib.binToHex(lib.secp256k1.signMessageHashDER(privateKey, messageHash)),
  schnorr: lib.binToHex(lib.secp256k1.signMessageHashSchnorr(privateKey, messageHash)),
  address: lib.encodeCashAddress({ type: 'p2pkh', payload: lib.ripemd160.hash(lib.sha256.hash(publicKey)) }).address,
  seed,
  childPrivateKey: lib.binToHex(child.privateKey),
  childChainCode: lib.binToHex(child.chainCode),
  hashes: [0, 3, 55, 56, 63, 64, 65, 127, 128, 129, 4096, 100000].map(length => ({
    length,
    ...Object.fromEntries(['sha1', 'sha256', 'sha512', 'ripemd160'].map(name => [name, createHash(name).update(Uint8Array.from({ length }, (_, i) => i % 251)).digest('hex')])),
  })),
};
await writeFile(new URL('../shared/fixtures.js', import.meta.url), `// Frozen reference vectors. Regenerate deliberately with npm run fixtures.\nexport default ${JSON.stringify(fixtures, null, 2)};\n`);
console.log('Saved reference vectors.');
