# react-native-xo

A small **BCH send/receive wallet core** built with real `@xo-cash/primitives`
and `@bitauth/libauth`. Native crypto comes from the separate
`react-native-libauth` adapter. The [wallet template](https://github.com/salemkode/xo-react-native-wallet)
is a consuming app, not a required framework.

This package uses XO's modular **primitives layer**, not `@xo-cash/engine`.
It does not implement XO invitations, contract templates, CashConnect, or tokens.
The engine's Node/browser storage dependencies are not made React Native compatible
by installing this package.

## Install in another React Native app

The packages are distributed as public GitHub release tarballs, not npm registry
releases. Use React Native 0.81.5, React 19.1, New Architecture, and Hermes:

```sh
npm install \
  https://github.com/salemkode/react-native-libauth/releases/download/v0.2.0/react-native-libauth-0.2.0.tgz \
  https://github.com/salemkode/react-native-libauth/releases/download/v0.2.0/react-native-xo-0.1.0.tgz \
  @bitauth/libauth@3.1.0-next.8 @callstack/polygen@0.2.1 \
  react-native-get-random-values@1.11.0
npx libauth-native --setup
npx libauth-native
# iOS: cd ios && pod install
```

Append `libauth-native --js-only` to your existing `postinstall`. Generate native
sources after reinstalling dependencies, then rebuild your app. Expo Go cannot
load native crypto; use a custom development build or a bare app.

```js
import {createWallet} from 'react-native-xo';

export async function openWallet(mnemonicFromSecureStorage) {
  const wallet = await createWallet({
    mnemonic: mnemonicFromSecureStorage,
    network: 'chipnet', // safe default; 'mainnet' uses real BCH
  });
  console.log(wallet.address); // public; never log the mnemonic
  const balance = await wallet.refresh();
  return {wallet, balance};
}
```

For sending, call `wallet.prepareSend({address, amountBch: '0.0001'})`, display
its address, amount, fee, total, and network, then call `wallet.broadcast(review.id)`
only after the user confirms. `cancelSend()` invalidates the review. A review
expires after two minutes. `close()` destroys the session key and closes its socket.

**Persist the review's network and txid before broadcasting.** A timeout may mean
the transaction was accepted. Never automatically retry. Restore that pending
record on app launch and call `lookupTransaction(txid)` before allowing another
payment. The template demonstrates this policy with AsyncStorage; keep the seed
in Keychain/Keystore, never AsyncStorage.

## Behavior and limits

- Chipnet and Mainnet use separate BIP44 paths: `m/44'/1'/0'/0/0` and
  `m/44'/145'/0'/0/0`. One stable receive/change address per network. BIP39 English
  recovery phrases; no additional BIP39 passphrase. This is **not XO Engine's
  invitation derivation scheme** and does not restore an XO Engine account.
- Strict prefixed CashAddress recipients, standard P2PKH/P2SH20, minimum 546 sats.
- Integer amounts validated by XO `Satoshis`; never floating-point BCH arithmetic.
- Real XO `PrivateKey` and `TransactionHash` validation; native BCH Schnorr signing.
- Verifies a known BCH/Chipnet fork block to detect wrong-network endpoints.
  Fetches and hashes source transactions, checks amounts/scripts, and validates
  every signed transaction in libauth's VM before submission.
- Fixed conservative 1 sat/byte fee estimate, disclosed dust remainder, up to 100
  inputs / 200 listed outputs. Token-bearing and coinbase outputs are excluded.
- Uses encrypted Electrum WebSockets. Server availability and reported unspent
  status are trusted; this package is **not a complete SPV client**.
- Successful submissions remain blocked in-session until refresh observes their
  inputs spent. Unknown submissions require application-level reconciliation.
- No automatic broadcast retries, token sends, address discovery, or full wallet
  history. No independent security audit; begin on Chipnet.

Advanced: `react-native-xo/core` exposes `createWalletSession` for initialized
runtimes and injected Electrum transports. `react-native-xo/electrum` exposes the
WebSocket RPC client. Neither entry installs native crypto automatically.
