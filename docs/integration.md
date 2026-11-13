# Integrate with an existing app

## 1. Check compatibility

Use React Native 0.81.x with the New Architecture and Hermes. This project tests
0.81.5 with React 19.1.0. Use libauth 3.0.0 or exactly 3.1.0-next.8 (required for XO), Polygen 0.2.1, and WABT 1.0.36.
The CLI rejects an unsupported libauth version. npm is the verified package
manager; pnpm's nested dependency layout and Yarn PnP have not been validated.

For Expo, use a native/custom development build and configure autolinking for
its native project. Expo Go cannot run the adapter. The included example uses the
React Native Community CLI, not Expo.

## 2. Obtain the adapter

Clone the public repository, then build the
package. Commands below run in the cloned repository:

```sh
npm ci
npm run setup:toolchain
npm run generate
mkdir -p artifacts
npm pack --workspace packages/react-native-libauth --pack-destination artifacts
```

Copy `artifacts/react-native-libauth-0.2.0.tgz` to a stable location for your app
and CI. Do not commit it here or rely on a temporary absolute path on another
developer's machine. A team can place the tarball in its own authorized artifact
store; this project has not published a registry release.

## 3. Install in your app

Run in the directory containing your app's `package.json`:

```sh
npm install /absolute/path/react-native-libauth-0.2.0.tgz \
  @bitauth/libauth@3.1.0-next.8 \
  @callstack/polygen@0.2.1 \
  react-native-get-random-values@1.11.0
```

Polygen and the random-values package are listed directly so React Native can
autolink their native modules. The adapter's other dependencies install normally.
Commit the consuming app's package manifest and lockfile.

## 4. Configure installation and native generation

Add these scripts to your app's existing scripts object:

```json
{
  "postinstall": "libauth-native --js-only",
  "libauth:toolchain": "libauth-native --setup",
  "libauth:generate": "libauth-native"
}
```

If `postinstall` already exists, append `&& libauth-native --js-only`; preserve
the existing command. If installation intentionally skips scripts, invoke the
JS-only command yourself before loading libauth.

Then run:

```sh
npm run libauth:toolchain
npm run libauth:generate
```

`--setup` downloads WABT 1.0.36 under your app's `.tools/` and verifies its release
checksum. macOS arm64/x64 uses release binaries. Linux x64 builds only wasm2c
from a checksum-pinned source archive, using CMake, a C++ compiler, and OpenSSL
development headers (`cmake g++ libssl-dev` on Ubuntu). This avoids the upstream
Ubuntu 20.04 binary's obsolete OpenSSL 1.1 dependency. Other hosts
must install WABT 1.0.36 and set `WABT_PATH` to its `bin` folder. The system WABT
may be a different version; the CLI prefers the project-local installation.

`--js-only` prepares JavaScript and applies the Polygen patch. It does **not**
generate or compile native code. The full command generates C/JSI files inside
the installed adapter package; Xcode/Gradle compile them as part of your app.

After every clean dependency install, run full generation before a native build.
Treat generated files inside `node_modules` as disposable. They are not a
replacement for your app's source control or CI build step.

## 5. Build the native app

For iOS, run `pod install` in your app's `ios` directory and use the resulting
workspace. For Android, build with the app's normal Gradle/React Native command.
The required native modules are `LibauthNative`, `ReactNativePolygen`, and the
random-values module.

The example's Xcode 27 workaround is in its Podfile: React Native 0.81's fmt
dependency needs a consumer setting honored by its header. If the same fmt
`consteval` error appears in your app, consult the scoped post-install block in
`example/ios/Podfile`. It is an example-app toolchain workaround, not an automatic
change the adapter makes to another app's Podfile.

The adapter itself does not force a Metro port. Port 8097 belongs only to the
included example; your app can retain its normal port and Metro configuration.
No special libauth Metro resolver is required.

## 6. Initialize before using crypto

```js
import { initializeLibauth } from 'react-native-libauth';
import { sha256, utf8ToBin, binToHex } from '@bitauth/libauth';

export async function hashText(text) {
  await initializeLibauth();
  return binToHex(sha256.hash(utf8ToBin(text)));
}
```

For a larger app, await initialization in your startup/loading gate before
rendering screens that use crypto. Concurrent calls share one promise, and a
failed initialization can be retried. Surface initialization failures to the user.
Do not perform crypto work at module scope before initialization and do not place
top-level `await` in Hermes application code.

Keep importing libauth functions and types from `@bitauth/libauth`. Its error
conventions still apply: some operations return an error string, which must be
checked before treating the result as bytes or a key.

The native entry loads UTF-8, native secure randomness, and the Polygen
WebAssembly adapter. Polygen replaces the global WebAssembly API with a registry
of the statically compiled modules. This is not a general WASM runtime; another
WASM-dependent package must be evaluated separately for compatibility.

## CI

Install the tarball from a location your CI can access, then run the consuming
app's steps in this order:

```sh
npm ci
npm run libauth:toolchain
npm run libauth:generate
# iOS: pod install, then your Xcode build
# Android: your normal Gradle build
```

No registry token or private GitHub credential belongs in the app, README, flow
files, or committed environment files. Use your CI's existing secret mechanism
for access to private source/artifacts.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `Call and await initializeLibauth()` | Await initialization before the crypto call. |
| Missing `TextDecoder` / top-level-await error | Reapply `libauth-native --js-only`; confirm the installed libauth package has its React Native entry. |
| `Polygen` native module missing | Install Polygen directly, verify autolinking, run pods on iOS, and rebuild. |
| Unknown module or checksum mismatch | Regenerate native sources, run pods when files changed, then rebuild. A JS refresh cannot update compiled C. |
| WABT version rejected | Run `libauth-native --setup` or set `WABT_PATH` for exactly 1.0.36. |
| Patch-package rejects a patch | Verify Polygen is exactly 0.2.1; inspect local dependency modifications. Do not delete or weaken the patch to hide the failure. |
| Metro claims an existing file is missing after reinstall | Verify it exists first. Restart your app's Metro; if its watcher is stale, repair only that project's watch. Do not clear machine-wide watchers or foreign sessions. |

## Removing the adapter

Remove its postinstall/build commands and native dependencies as appropriate for
your app, reinstall dependencies cleanly to restore original upstream files, then
run pods/rebuild. Removing only the adapter package leaves the installed libauth
files patched until dependencies are restored.
