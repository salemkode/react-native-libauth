// Identical workload in Node WASM and the development-only Hermes benchmark.
// Public test keys only; no wallet access, network calls or broadcasts.
export async function benchmarkCrypto(lib) {
  const key = new Uint8Array(32);
  key[31] = 1;
  const message = new Uint8Array(32).fill(7);
  const small = new Uint8Array(1024).fill(42);
  const large = new Uint8Array(65536).fill(42);
  const publicKey = lib.secp256k1.derivePublicKeyCompressed(key);
  const signature = lib.secp256k1.signMessageHashSchnorr(key, message);
  const cases = [
    ['sha256-1KiB', 100, () => lib.sha256.hash(small)],
    ['sha256-64KiB', 20, () => lib.sha256.hash(large)],
    ['public-key', 30, () => lib.secp256k1.derivePublicKeyCompressed(key)],
    [
      'schnorr-sign',
      30,
      () => lib.secp256k1.signMessageHashSchnorr(key, message),
    ],
    [
      'schnorr-verify',
      30,
      () => {
        if (
          !lib.secp256k1.verifySignatureSchnorr(signature, publicKey, message)
        )
          throw Error('Signature verification failed');
      },
    ],
    [
      'bip39-seed',
      1,
      () =>
        lib.deriveSeedFromBip39Mnemonic(
          'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        ),
    ],
  ];
  const results = [];
  for (const [name, iterations, run] of cases) {
    for (let i = 0; i < 3; i++) run();
    const samples = [];
    for (let sample = 0; sample < 9; sample++) {
      await new Promise(resolve => setTimeout(resolve, 0));
      const start = globalThis.performance.now();
      for (let i = 0; i < iterations; i++) run();
      samples.push((globalThis.performance.now() - start) / iterations);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    results.push({
      name,
      iterations,
      samplesMs: samples,
      medianMs: sorted[4],
      maxMs: sorted[8],
    });
  }
  return { samples: 9, warmup: 3, results };
}
