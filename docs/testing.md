# Testing and release checks

Run from the repository root after installing dependencies. Keep the user's
assigned simulator/session and Metro port; do not use another task's device.

## Fast checks

```sh
npm ci
npm run setup:toolchain
npm run generate
npm test
npm run typecheck
npm run lint
npm run test:consumer
```

The Node suite covers crypto reference vectors, initialization, export
compatibility, WASM integrity, and WebAssembly adapter contracts. Hash references
come independently from Node crypto; signing and key references are fixed from
libauth 3.0.0; the same crypto binaries are also tested with 3.1.0-next.8. The adapter contract tests isolate JavaScript boundary behavior.

The consumer test packs the actual distributable, creates a separate temporary
app, installs the tarball without workspace links, applies patches, generates
native code, and runs its 12 reference checks for each supported libauth version. It checks that help/invalid flags
do not change dependencies, repeated generation is stable, and original WASM
files remain unchanged. Temporary fixtures are retained for diagnosis; a report
is written under `artifacts/consumer-test.json`.

**Node executes WASM, not native JSI.** Neither fast checks nor a successful build
replace the app's native verification.

## Build iOS without launching a device

After `pod install` in `example/ios`, use:

```sh
xcodebuild \
  -workspace example/ios/LibauthLab.xcworkspace \
  -scheme LibauthLab -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath artifacts/ios CODE_SIGNING_ALLOWED=NO
```

For an assigned simulator, use `-destination 'id=YOUR_SIMULATOR_UDID'` instead.
The app's debug configuration uses Metro 8097.

## Build Android without launching a device

Set JDK 17 and `ANDROID_HOME`, then:

```sh
cd example/android
./gradlew :app:assembleDebug \
  -PreactNativeDevServerPort=8097 \
  -PreactNativeArchitectures=arm64-v8a
```

Choose the architecture appropriate to your target if it is not arm64. The
example's settings.gradle/app paths account for workspace-hoisted node_modules.

## Verify native execution

Start `npm start` on 8097. Install and launch the built app on your selected
device. Agents must use Argent and its current device/flow skills for device
control; shell compiler commands remain appropriate for building.

Tap **Run native tests** and require **All checks passed** with **12/12**. The
shared checks cover four hashes, single-shot and streaming boundaries, public
keys, repeated ECDSA/BCH Schnorr signatures, tampered messages, invalid keys,
native secure randomness, CashAddress, and BIP32.

The iOS path is recorded with semantic targets:

```sh
argent e2e run libauth-native-suite --platform ios --device YOUR_SIMULATOR_UDID
```

Its `launch` step restarts the example; it does not erase accounts or simulator
data. The flow is iOS-specific. Do not label it an Android replay.

The app logs `LIBAUTH_NATIVE_QA` and exposes `globalThis.__LIBAUTH_QA__` for a
bounded debugger read. Save the report, relevant screenshots, and build logs
under ignored `artifacts/`. Do not commit secrets, local paths, Metro logs, or
derived data. Record platform/device/version, commit, and check outcome when
reporting verification. Device timings are diagnostic, not benchmarks.

## Before publishing a package or widening version support

- Verify a fresh install and isolated tarball consumer.
- Run Node tests and TypeScript.
- Build both native platforms affected by the change.
- Run the app's native suite on the platforms claimed as runtime-tested.
- Inspect `npm pack --dry-run --json --workspace packages/react-native-libauth`.
- Preserve upstream licenses and disclose platform gaps.

There is no automatic npm publish step. Repository pushes trigger the fast and
consumer checks; local native build/device evidence is reported separately.

## XO wallet regression checks

The root suite also tests the compact XO wallet, exact amount handling, network
isolation, source-transaction validation, token exclusion, fees, cancellation,
expiry, lost broadcasts and single-submission state. One check runs the actual
React Native Babel transform to catch private-field lowering differences. The
separate template consumes release tarballs and runs 12 deterministic wallet
scenarios both in Node and through native crypto on the simulator. See docs/xo.md
and the template testing guide for public-chain and replay limitations.

## Live Chipnet payment

On 2026-11-13, the separate wallet template consumed the public v0.2.0 release
tarballs (`react-native-libauth` 0.2.0 and `react-native-xo` 0.1.0) with Libauth
3.1.0-next.8 and XO primitives 0.0.5. The test ran on an iOS 26.4 simulator,
React Native 0.81.5, React 19.1, Hermes and the New Architecture.

A newly generated, dedicated Chipnet account received 1,017,000 satoshis from the
faucet. The receiving transaction was confirmed at height 332171:
`46b248df1603551d0c0f30feeba015e53119a1e9ef10d02a002d03b968c69066`.
The app displayed the funded balance, prepared and signed a 1,000-satoshi payment
to its own address, showed the 226-satoshi fee, and submitted it once through the
normal review/confirmation UI. No fixture account was funded.

The submitted transaction is
[`f9137bf69ac64636b99fd96668336981775975d31e0e1141ea8c750a53cf2da3`](https://chipnet.chaingraph.cash/tx/f9137bf69ac64636b99fd96668336981775975d31e0e1141ea8c750a53cf2da3).
An independent Electrum read returned its raw bytes; a double SHA-256 matched
the displayed transaction ID. Its two outputs returned 1,000 and 1,015,774 satoshis
to the wallet. An app restart preserved the receipt and displayed 0.01016774 BCH.
The outgoing transaction was in the mempool, **not yet confirmed**, at verification.
Only Chipnet test BCH was spent. No private key or recovery phrase was inspected.

See the [public verification record](chipnet-live-payment.json). This is a live
manual iOS test, not an automated full-flow pass or Android runtime proof. The
existing saved wallet flows still have the replay limitation documented in the
template. A long-idle Electrum connection initially required an app restart to
reconnect; reconnect/refresh controls can also overlap the bottom navigation when
content extends past the viewport. These remain follow-up issues.

## Upstream coverage boundary

The 40 project checks and 12 native scenarios are not a port of every upstream
Libauth/XO test. The source audit found AVA and Vitest suites, Node-only crypto
oracles/filesystem helpers, property tests, and larger VM corpora requiring
separate adaptation and accounting. That port and native trials of alternative
WASM runtimes remain unfinished. Do not describe them as passing or use the
current checks to claim universal Rust/C++ compatibility or a fastest backend.
