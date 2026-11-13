#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { stripCustomSections } from './wasm.mjs';

const root = process.cwd();
const library = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { setup: { type: 'boolean' }, 'js-only': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
if (values.help) {
  console.log('Usage: libauth-native [--setup | --js-only]\n\nRun from your React Native app root.\n  (no flag)  Apply compatibility patches and generate native C/JSI.\n  --setup    Install checksum-verified WABT 1.0.36 under .tools.\n  --js-only  Reapply dependency and JS patches without native generation.\n  --help     Show help without changing files.');
  process.exit(0);
}
if (values.setup && values['js-only']) throw new Error('Choose either --setup or --js-only.');
if (values.setup) {
  await import('./setup-toolchain.mjs');
  process.exit(0);
}
const require = createRequire(import.meta.url);
const appRequire = createRequire(join(root, 'package.json'));
const source = dirname(appRequire.resolve('@bitauth/libauth/package.json'));
const algorithms = ['sha1', 'sha256', 'sha512', 'ripemd160', 'secp256k1'];
const upstream = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
if (upstream.version !== '3.0.0') throw new Error('Review the generator before changing libauth versions. Expected 3.0.0.');
const defaultsPath = join(source, 'build/lib/crypto/default-crypto-instances.js');
const original = await readFile(defaultsPath, 'utf8');
if (!original.includes('await Promise.all([') && !original.startsWith('// Patched by react-native-libauth')) throw new Error('Upstream initialization changed; review the generator.');
const patched = spawnSync(process.execPath, [require.resolve('patch-package/index.js'), '--patch-dir', relative(root, join(library, 'patches'))], { cwd: root, stdio: 'inherit' });
if (patched.status !== 0) throw new Error('Could not apply the Polygen compatibility patch.');
// Metro can defer named imports with inlineRequires. A native entry ensures
// setup runs before upstream's module-level TextDecoder use, even then.
await writeFile(join(source, 'build/react-native.js'), "import 'react-native-libauth/setup';\nexport * from './index.js';\n");
await writeFile(join(source, 'package.json'), JSON.stringify({ ...upstream, 'react-native': './build/react-native.js' }, null, 2) + '\n');

// Use the exact binaries shipped by upstream, including its BCH Schnorr implementation.
await mkdir(join(library, 'wasm'), { recursive: true });
await mkdir(join(library, 'generated'), { recursive: true });
const binaries = await Promise.all(algorithms.map(async name => {
  const originalBytes = await readFile(join(source, 'build/lib/bin', name, `${name}.wasm`));
  const bytes = stripCustomSections(originalBytes);
  // Validate the binary locally before invoking the native code generator.
  await WebAssembly.compile(bytes);
  await writeFile(join(library, 'wasm', `${name}.wasm`), bytes);
  await writeFile(join(source, 'build/lib/bin', name, `${name}.base64.js`),
    `// Generated: executable sections unchanged; custom metadata removed for WABT.\nexport const ${name}Base64Bytes = '${bytes.toString('base64')}';\n`);
  return { name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), upstreamSha256: createHash('sha256').update(originalBytes).digest('hex') };
}));

// Hermes/Metro cannot evaluate upstream's top-level await. Keep stable exports,
// initialize explicitly, and fail visibly if crypto is used before initialization.
await writeFile(defaultsPath, `// Patched by react-native-libauth for libauth ${upstream.version}; see scripts/generate.mjs.\n` +
  algorithms.map(name => `import { instantiate${name === 'secp256k1' ? 'Secp256k1' : name === 'ripemd160' ? 'Ripemd160' : `Sha${name.slice(3)}`} } from './${name}.js';`).join('\n') + `
const state = { instances: {}, promise: undefined };
function deferred(name) {
  return new Proxy({}, { get(_target, property) {
    const instance = state.instances[name];
    if (!instance) throw new Error('Call and await initializeLibauth() before using libauth crypto.');
    return instance[property];
  }, ownKeys() {
    const instance = state.instances[name];
    if (!instance) throw new Error('Call and await initializeLibauth() before inspecting libauth crypto.');
    return Reflect.ownKeys(instance);
  }, getOwnPropertyDescriptor(_target, property) {
    const instance = state.instances[name];
    if (!instance || !(property in instance)) return undefined;
    return { configurable: true, enumerable: true, value: instance[property], writable: false };
  }});
}
${algorithms.map(name => `export const ${name} = deferred('${name}');`).join('\n')}
export function initializeNativeCrypto() {
  if (!state.promise) {
    state.promise = Promise.all([${algorithms.map(name => `instantiate${name === 'secp256k1' ? 'Secp256k1' : name === 'ripemd160' ? 'Ripemd160' : `Sha${name.slice(3)}`}()`).join(', ')}])
      .then(instances => { ${algorithms.map((name, i) => `state.instances.${name} = instances[${i}];`).join(' ')} })
      .catch(error => { state.promise = undefined; throw error; });
  }
  return state.promise;
}
`);

await writeFile(join(library, 'generated/manifest.json'), JSON.stringify({
  libauth: upstream.version,
  backend: 'wasm2c',
  modules: binaries,
}, null, 2) + '\n');

if (!values['js-only']) {
  const localWabt = join(root, '.tools/wabt-1.0.36/bin');
  const wabt = process.env.WABT_PATH || (existsSync(localWabt) ? localWabt : undefined);
  const environment = { ...process.env, PATH: wabt ? `${wabt}:${process.env.PATH}` : process.env.PATH };
  const version = spawnSync('wasm2c', ['--version'], { encoding: 'utf8', env: environment });
  if (version.status !== 0 || version.stdout.trim() !== '1.0.36') throw new Error('Polygen requires WABT 1.0.36. Run npm run setup:toolchain, or set WABT_PATH to its bin directory.');
  const result = spawnSync(process.execPath, [join(dirname(require.resolve('@callstack/polygen-cli/package.json')), 'dist/index.js'), 'generate', '--force'], {
    cwd: library, stdio: 'inherit', env: environment,
  });
  if (result.status !== 0) throw new Error(`Polygen failed (${result.status}).`);
  // Polygen 0.2.1 gives every generated module the same external globals, and
  // constructs an owning shared_ptr from static storage. Give each translation
  // unit internal linkage and prevent deletion of that static registry entry.
  for (const name of algorithms) {
    const path = join(library, 'native/host', name, 'static-module.cpp');
    const text = await readFile(path, 'utf8');
    const shared = 'std::shared_ptr<callstack::polygen::Module> moduleSharedInfo { &moduleInfo };';
    if (!text.includes(shared)) throw new Error('Polygen registry template changed; review native ownership patch.');
    await writeFile(path, text
      .replace('callstack::polygen::StaticLibraryModule moduleInfo', 'static callstack::polygen::StaticLibraryModule moduleInfo')
      .replace(shared, 'static std::shared_ptr<callstack::polygen::Module> moduleSharedInfo { &moduleInfo, [](callstack::polygen::Module*) {} };'));
    const bridgePath = join(library, 'native/host', name, 'jsi-exports-bridge.cpp');
    const bridge = await readFile(bridgePath, 'utf8');
    await writeFile(bridgePath, bridge.replace(/args\[(\d+)\]/g, 'wasmArgument(args, count, $1)'));
  }
  const generated = await readdir(join(library, 'native'), { recursive: true });
  for (const name of algorithms) {
    if (!generated.some(file => file.endsWith(`${name}.c`))) throw new Error(`Missing generated native C for ${name}.`);
  }
  console.log(`Native C and JSI generated using wasm2c ${version.stdout.trim()}.`);
}
console.log(`Prepared libauth ${upstream.version}: ${binaries.map(binary => `${binary.name} (${binary.size} bytes)`).join(', ')}.`);
