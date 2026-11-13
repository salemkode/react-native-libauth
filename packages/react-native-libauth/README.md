# react-native-libauth

A small build-time compatibility adapter for **@bitauth/libauth 3.0.0 or 3.1.0-next.8** on
React Native 0.81. Keep importing crypto functions and types from libauth.

```js
import { initializeLibauth } from 'react-native-libauth';
import { sha256, utf8ToBin } from '@bitauth/libauth';

export async function hashMessage(message) {
  await initializeLibauth();
  return sha256.hash(utf8ToBin(message));
}
```

From your app root, run `npx libauth-native --setup` once for WABT, then
`npx libauth-native` before building. Add `libauth-native --js-only` to your app's
postinstall alongside existing commands. On iOS, run pod install afterward.
Autolink @callstack/polygen 0.2.1 and react-native-get-random-values 1.11.0.

The command patches the installed dependencies and compiles libauth's existing
C/Rust-derived WASM into native C/JSI using wasm2c and Polygen. It does not copy
libauth or ship the test app. A patched native entry automatically loads setup
before the real library. The small Polygen compatibility patch is included.
Requires npm, Node 22+, the new architecture, and native platform build tools.
Use a local tarball or the public GitHub v0.2.0 release tarball; not published to the npm registry. Experimental.

See the [complete integration guide](https://github.com/salemkode/react-native-libauth/blob/HEAD/docs/integration.md)
for installation, startup, CI, and troubleshooting. Keep crypto calls inside
initialized app code; Hermes does not support top-level await.
