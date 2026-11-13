# XO integration

The separate [wallet template](https://github.com/salemkode/xo-react-native-wallet)
is a real consumer of this repository's two packages:

- `react-native-libauth@0.2.0`: a small build adapter for upstream libauth.
- `react-native-xo@0.1.0`: a focused wallet core using XO primitives and libauth.

Use either package outside the template. Normal crypto APIs remain imported from
`@bitauth/libauth`; normal primitives remain from `@xo-cash/primitives`.

## Why the primitives layer

XO is modular. Its current engine also imports `fs`, `path`, `better-sqlite3`,
IndexedDBShim and an Electrum application singleton. That is a different mobile
porting project from a small send/receive wallet. The upstream SQLite storage
implementation is marked incomplete. Its process-global Electrum state also
needs lifecycle work for switching networks.

This release therefore uses actual XO `PrivateKey`, `Satoshis` and
`TransactionHash` values. It adds BIP44 account derivation, prefixed CashAddress
validation, transaction construction with native Schnorr signatures, and a small
WebSocket Electrum transport. It does **not** claim support for XO Engine,
invitations, templates, or XO Engine account recovery. Its fixed BIP44 paths are
documented in the package README.

## Native compatibility

XO primitives 0.0.5 requires libauth `^3.1.0-next.8`. We pin exactly that version
and test it; we do not override XO down to libauth 3.0.0. The five original crypto
WASM binaries are byte-identical between these versions. The build generator
retains exact-version checks and source integrity guarantees. Both versions have
fresh-tarball installation tests.

## Transaction policy

Chipnet is the default; Mainnet is explicit. Network choice selects a distinct
BIP44 coin type, CashAddress prefix, trusted fork block, and encrypted endpoint.
Switching creates a new session and closes the old socket/key. Source transactions
are hashed and checked against the unspent list before signing. The libauth VM
verifies the signed transaction locally. This checks signing and input values;
it does not replace SPV validation of the chain or the server's unspent status.

Amounts remain integer satoshis through XO validation. Tokens and coinbase outputs
are excluded. Reviews expire, inputs are checked again immediately before
submission, and a review can only be submitted once. No broadcast is automatically
retried. The host must persist pending txids before submission and reconcile an
unknown result after process restart; the template provides that policy.

## Reproducing checks

Run root `npm test`, `npm run test:consumer`, `npm run typecheck`, and `npm run lint`.
The standalone template also tests the installed tarballs and has a native-only
development check screen that signs and VM-verifies both network fixtures using
the compiled crypto. These deterministic fixtures never broadcast to a live chain.
Public-network checks and Android runtime limits are reported separately in the
template's testing guide.

Hermes has a smaller BigInt capacity than Node. Libauth 3.1's unused exported
`bigIntRange` eagerly creates an 80,001-bit number. The adapter makes its two
properties lazy getters so importing the real library works. On capable runtimes
the exact upstream values are preserved. Explicitly reading these oversized limits
on Hermes still raises RangeError; the adapter does not truncate them or claim
support for arbitrary 10,000-byte Script arithmetic. This wallet uses standard
P2PKH signatures and small transaction values, not oversized Script integers.
