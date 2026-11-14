# Performance measurements

On 2026-11-14, the same public test inputs ran in an iOS 26.4 simulator with
React Native 0.81.5/Hermes and in Node 26.5/V8 WebAssembly on the same Mac.
The generated iOS crypto pod inherited `-O0` in Debug. Setting optimization to
`-O2` **only for LibauthNative** substantially improved these measurements.
The application's Debug settings and cryptographic parameters are unchanged.
Optimized native stepping can be less precise; the rest of the app stays debuggable.

| Operation | Original iOS Debug, ms | Optimized iOS Debug, ms | Node V8 WASM, ms |
| --- | ---: | ---: | ---: |
| SHA-256, 1 KiB | 0.090 | 0.013 | 0.008 |
| SHA-256, 64 KiB | 4.699 | 0.415 | 0.371 |
| Public key derivation | 0.425 | 0.031 | 0.021 |
| BCH Schnorr sign | 0.998 | 0.215 | 0.051 |
| BCH Schnorr verify | 0.951 | 0.199 | 0.051 |
| BIP39 seed derivation | 112.588 | 59.505 | 10.045 |

These are medians of nine batch averages per operation after three warmup calls.
They exclude cold initialization, network round trips and rendering. Batches use
identical iteration counts and inputs across runtimes. Timings were collected
without profilers attached. Raw samples are in [performance-results.json](performance-results.json).
A repeat run measured 0.411 ms for 64 KiB hashing, 0.210 ms for signing and
59.267 ms for seed derivation. The 1 KiB hash varied to 0.037 ms; avoid
claiming stable parity for that small workload. Repeat samples are also retained.
The optimized build passed all 12 native wallet correctness scenarios.

This is **not a browser comparison or a production-phone speed guarantee**.
Node's V8 WASM is a useful reference, but actual Chrome/Safari, physical devices,
Release builds, first launch and larger transaction workloads still need testing.
Hashing is close to this WASM reference; signing remains roughly four times slower
and BIP39 roughly six times slower. Do not claim complete web-speed parity.
Do not reduce key-derivation rounds, weaken validation, cache recovery phrases,
or replace native crypto with a silent fallback to improve a benchmark.

The initial React/native profiling session captured no React commits and no
reported Instruments hotspots. The combined report was unavailable because
there were no commits. That session supplies **no UI frame-time or navigation
performance proof**; use the timed workloads above for the reported improvement.

## Reproduce

After dependency setup and generation, run `node scripts/benchmark.mjs` for the
Node WASM reference. `shared/performance.js` contains the test-only workload.
The template keeps a byte-identical copy in `tests/performance-workload.js`.
Its development build exposes `globalThis.__XO_BENCHMARK__()` through the debugger;
it uses public test keys and neither reads the account nor broadcasts transactions.
The hook is excluded from Release builds by `__DEV__`.

Use an owned simulator and the assigned Metro port. Run the benchmark with
Argent's debugger evaluation tool, save its resolved result, then run
`globalThis.__XO_NATIVE_CHECK__()` for the offline native correctness scenarios.
Build a separate benchmark bundle identifier when preserving an installed wallet.
Rebuild native consumers after upgrading the adapter; a Metro refresh cannot
change C compiler flags. Test actual browsers and physical release builds before
claiming platform-wide parity. Network latency must be measured separately.
