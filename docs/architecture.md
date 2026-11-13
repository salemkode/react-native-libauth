# Architecture and maintenance boundaries

The public computation API is libauth's. The adapter exposes initialization and a
build command, rather than reimplementing libauth or maintaining a parallel API.

## Build inputs and outputs

Both libauth 3.0.0 and 3.1.0-next.8 are supported exactly. Their original five
WASM binaries have identical SHA-256 hashes; the initialization template is also
unchanged. Each version passes a separate isolated consumer check.

Inputs are the original five `.wasm` files shipped inside `@bitauth/libauth@3.1.0-next.8`:
SHA-1, SHA-256, SHA-512, RIPEMD-160, and secp256k1. Those came from upstream Rust
and C. WABT's wasm2c converts them to C; Polygen generates the JSI glue and registry.

Custom sections contain metadata, not executable code. The script strips them
because the older Rust linking metadata is rejected by WABT. Standard sections,
including code/data/imports/exports, are retained. The manifest records original
and normalized SHA-256 fingerprints. The original `.wasm` files are never written.

Generated adapter directories are `wasm/`, `native/`, and `generated/`. They are
ignored by Git and recreated by generation. The package's source and patch are
small; generated C and the native dependency still have real build/binary costs.

## Files changed in installed libauth

| File | Purpose |
| --- | --- |
| `package.json` | Select `build/react-native.js` for React Native. |
| `build/react-native.js` | Load adapter setup, then re-export the actual index. |
| `build/lib/crypto/default-crypto-instances.js` | Stable deferred crypto exports and explicit initialization, without top-level await. |
| Five `build/lib/bin/<name>/<name>.base64.js` files | Match the normalized modules compiled into the native registry. |

The native entry is necessary because Metro's `inlineRequires` can delay a named
initialization import. Setup must run before libauth creates its module-level
UTF-8 decoder. Merely ordering named imports in the app is insufficient.

Node ignores the `react-native` entry field, but the shared crypto default file
is still patched. Node code using this installed copy must explicitly initialize
it; the workspace tests and fixture generator do that. Do not describe the patch
as having no effect on Node initialization.

## Polygen compatibility patch

The versioned patch targets the real Polygen 0.2.1 npm package. It fixes Android
CMake/Gradle registration, portable C++ headers and initialization, Metro export
conditions, byte-instantiation result shape, typed-array byte ranges, streaming
instantiation, numeric i32 global imports, and imported tables.

The generated-code post-processing also gives registry globals internal linkage
and prevents an owning shared pointer from deleting static storage. Exported
functions use a bounds-checked argument accessor. JSI supplies only the arguments
actually passed; libauth omits optional signing arguments. Missing WASM arguments
must become undefined/zero, not reads beyond that array.

These fixes are part of the compatibility contract. Never remove checks or use a
JavaScript crypto fallback to make native verification appear green.

## Upgrade policy

Upgrade one upstream component at a time. Review the patch, raw binary hashes,
WASM imports/exports, declarations, and generated output. Run the clean-install,
isolated-consumer, Node, type, build, and device checks in `testing.md`. Repeated
ECDSA and BCH Schnorr calls are important regressions. BCH Schnorr is not BIP340.

Reference vectors are committed test data. `npm run fixtures` intentionally
changes that oracle; do not run it merely to make a failing implementation pass.
