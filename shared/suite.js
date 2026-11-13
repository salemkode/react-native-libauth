import fixtures from './fixtures.js';

function equal(actual, expected) {
  if (actual !== expected) throw new Error(`Expected ${expected}, received ${actual}`);
}

/** The same checks run in Node (WASM) and on the phone (native C via JSI). */
export function cryptoChecks(lib) {
  const privateKey = lib.hexToBin(fixtures.privateKey);
  const messageHash = lib.hexToBin(fixtures.messageHash);
  const publicKey = lib.hexToBin(fixtures.publicKey);
  const signatures = [
    ['ECDSA compact', 'signMessageHashCompact', 'verifySignatureCompact', fixtures.compact],
    ['ECDSA DER', 'signMessageHashDER', 'verifySignatureDER', fixtures.der],
    ['BCH Schnorr', 'signMessageHashSchnorr', 'verifySignatureSchnorr', fixtures.schnorr],
  ];
  return [
    ...['sha1', 'sha256', 'sha512', 'ripemd160'].map(algorithm => ({
      name: `${algorithm.toUpperCase()} · ${fixtures.hashes.length} vectors`,
      run() {
        fixtures.hashes.forEach(vector => {
          const bytes = Uint8Array.from({ length: vector.length }, (_, i) => i % 251);
          equal(lib.binToHex(lib[algorithm].hash(bytes)), vector[algorithm]);
          const split = Math.floor(bytes.length / 2);
          const first = lib[algorithm].update(lib[algorithm].init(), bytes.subarray(0, split));
          equal(lib.binToHex(lib[algorithm].final(lib[algorithm].update(first, bytes.subarray(split)))), vector[algorithm]);
        });
      },
    })),
    {
      name: 'secp256k1 · public key derivation',
      run() { equal(lib.binToHex(lib.secp256k1.derivePublicKeyCompressed(privateKey)), fixtures.publicKey); },
    },
    ...signatures.map(([name, sign, verify, expected]) => ({
      name: `${name} · sign & verify`,
      run() {
        const signature = lib.secp256k1[sign](privateKey, messageHash);
        if (typeof signature === 'string') throw new Error(signature);
        equal(lib.binToHex(signature), expected);
        // Repeated calls also catch missing optional WASM-argument handling.
        equal(lib.binToHex(lib.secp256k1[sign](privateKey, messageHash)), expected);
        equal(lib.binToHex(lib.secp256k1[sign](privateKey, messageHash)), expected);
        equal(lib.secp256k1[verify](signature, publicKey, messageHash), true);
        const tamperedHash = messageHash.slice();
        tamperedHash[0] ^= 1;
        equal(lib.secp256k1[verify](signature, publicKey, tamperedHash), false);
      },
    })),
    {
      name: 'secp256k1 · invalid private keys',
      run() {
        equal(lib.secp256k1.validatePrivateKey(new Uint8Array(32)), false);
        equal(lib.secp256k1.validatePrivateKey(new Uint8Array(32).fill(255)), false);
        equal(lib.secp256k1.validatePrivateKey(privateKey), true);
      },
    },
    {
      name: 'CashAddress · encode & decode',
      run() {
        const payload = lib.ripemd160.hash(lib.sha256.hash(publicKey));
        const { address } = lib.encodeCashAddress({ payload, type: 'p2pkh' });
        equal(address, fixtures.address);
        const decoded = lib.decodeCashAddress(address);
        if (typeof decoded === 'string') throw new Error(decoded);
        equal(lib.binToHex(decoded.payload), lib.binToHex(payload));
      },
    },
    {
      name: 'Secure random · private key generation',
      run() {
        const first = lib.generatePrivateKey();
        const second = lib.generatePrivateKey();
        equal(first.length, 32);
        equal(lib.secp256k1.validatePrivateKey(first), true);
        equal(lib.secp256k1.validatePrivateKey(second), true);
        equal(lib.binToHex(first) === lib.binToHex(second), false);
      },
    },
    {
      name: 'BIP32 · hardened child derivation',
      run() {
        const master = lib.deriveHdPrivateNodeFromSeed(lib.hexToBin(fixtures.seed));
        const child = lib.deriveHdPath(master, "m/0'/1/2'");
        if (typeof child === 'string') throw new Error(child);
        equal(lib.binToHex(child.privateKey), fixtures.childPrivateKey);
        equal(lib.binToHex(child.chainCode), fixtures.childChainCode);
      },
    },
  ];
}

export function runChecks(lib) {
  return cryptoChecks(lib).map(check => {
    const start = Date.now();
    try {
      check.run();
      return { name: check.name, status: 'passed', duration: Date.now() - start, detail: 'Matches reference vectors' };
    } catch (error) {
      return { name: check.name, status: 'failed', duration: Date.now() - start, detail: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined };
    }
  });
}
