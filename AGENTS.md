# Agent guide

## Scope

This is a small native compatibility adapter for the REAL @bitauth/libauth 3.0.0.
Keep normal computation imports and TypeScript types in @bitauth/libauth. Do not
reintroduce a copied libauth tree, vendored Polygen runtime, parallel crypto API,
or silent JavaScript fallback. The example app is optional development tooling.

Read README.md and docs/architecture.md. Exact supported versions are documented;
do not widen them merely because npm resolves a newer version.

## Entry points and commands

- Public helper/setup: packages/react-native-libauth/src and setup.js.
- CLI/generator: packages/react-native-libauth/scripts/generate.mjs.
- Native integration: the package's podspec, android directory, and RN config.
- Polygen changes: packages/react-native-libauth/patches/*.patch.
- App/reference suite: example, shared, tests.
- `npm ci` applies JS/dependency patches; `npm run generate` creates native code.
- `npm run setup:toolchain` installs checksum-verified WABT 1.0.36 locally.
- Validate with `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:consumer`.

Generated native/wasm/manifest directories and node_modules are not source. Edit
the owning script or versioned patch, then regenerate. Preserve original upstream
.wasm files. Never regenerate fixtures merely to turn a failed check green.

## Native verification

Read docs/testing.md and the applicable Argent skills. Use Argent MCP for all
simulator/emulator/device UI work. Build with xcodebuild/Gradle as appropriate.
Do not use agent-device, simctl, alternate UI controllers, or browser tooling to
drive devices. Keep T3 agent device access disabled.

Retain the task's assigned device, session, worktree, and Metro port. Check
ownership before selecting a target, never bypass a foreign claim, and inspect
before every tap. Prefer semantic saved flows; the iOS suite is under
.argent/e2e/libauth-native-suite.yaml. Keep discovery bounded, verify outcomes,
and never automatically repeat an ambiguous mutation.

The example uses Metro 8097 on both platforms. Reuse a compatible dev build for
JS-only edits; rebuild after native changes. On Android, use JDK 17. Scope any
Argent cleanup to owned device/debugger ids. Never stop another task's Metro or
clear global watcher/device state. Read errors before choosing recovery.

The app must report all 12 checks passing for native proof. Node's WASM tests and
adapter mocks do not prove C/JSI execution. Report Android runtime as unverified
until it is actually exercised. Keep local logs, screenshots, reports, and derived
data in ignored artifacts/. Keep session-specific memory out of commits.

## Git and external changes

Treat main/master as permanently protected. Never commit on them, push any ref
to them, merge a PR, enable auto-merge, or bypass hooks. Use a task branch and
explicit push destination, e.g. `git push origin HEAD:refs/heads/feat/my-change`.
The maintainer performs merges manually. Do not publish npm packages or change
the repository's private visibility without explicit user authorization.

Proceed through routine authorized edits, tests, builds, and owned-device work.
Ask only for essential missing information or mandatory confirmation. Preserve
these safeguards when setting up automatic approvals.
