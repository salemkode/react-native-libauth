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
libauth 3.0.0. The adapter contract tests isolate JavaScript boundary behavior.

The consumer test packs the actual distributable, creates a separate temporary
app, installs the tarball without workspace links, applies patches, generates
native code, and runs its 12 reference checks. It checks that help/invalid flags
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
