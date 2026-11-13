# Contributing

Keep the adapter small: use the installed `@bitauth/libauth` API and established
build tools. The example is an optional test bench. Do not introduce a libauth
fork, copy its distribution, vendor a runtime tree, or silently substitute crypto.

Read [integration](docs/integration.md), [architecture](docs/architecture.md), and
[testing](docs/testing.md) before changing the native boundary.

## Development

```sh
npm ci
npm run setup:toolchain
npm run generate
npm test
npm run typecheck
npm run lint
npm run test:consumer
```

Generated code is disposable. Edit the generator or compatibility patch, then
regenerate; do not rely on a manual change inside node_modules/native output.
Use `libauth-native --help` for CLI modes.

For a change, create a task branch. Never commit on or push to main/master. Open
a pull request with the problem, resulting behavior, validation, and limitations.
Merges are performed manually by the maintainer; agents must not merge or enable
auto-merge.

Keep reference-vector updates separate and explain their source. Never regenerate
expected signatures just to hide a regression. Preserve the distinction between
Node WASM checks and native JSI execution in every test report.

## Private repository access

Only invited collaborators can clone or view this repository. Authenticate with
GitHub through your normal credential manager. Never commit access tokens or
change visibility to make installation easier. The package is not published to
npm; use the documented tarball workflow.
