import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.LIBAUTH_VERSION) {
  for (const version of ['3.0.0', '3.1.0-next.8']) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: root, env: { ...process.env, LIBAUTH_VERSION: version }, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
  process.exit(0);
}
const libauthVersion = process.env.LIBAUTH_VERSION;
const directory = await mkdtemp(join(tmpdir(), 'libauth-consumer-test-'));
await mkdir(join(root, 'artifacts'), { recursive: true });
const environment = { ...process.env, WABT_PATH: process.env.WABT_PATH || join(root, '.tools/wabt-1.0.36/bin') };

function run(command, args, cwd = directory) {
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed in ${cwd}:\n${result.stdout}\n${result.stderr}\n${result.error || ''}`);
  return result.stdout;
}

const [packed] = JSON.parse(run('npm', ['pack', '--workspace', 'packages/react-native-libauth', '--pack-destination', directory, '--json'], root));
assert.ok(packed.files.some(file => file.path === 'setup.js'));
assert.ok(packed.files.some(file => file.path === 'scripts/generate.mjs'));
assert.equal(packed.files.some(file => /^(example|generated\/libauth|node_modules)\//.test(file.path)), false);
await writeFile(join(directory, 'package.json'), JSON.stringify({
  name: 'libauth-native-consumer-test', version: '1.0.0', private: true,
  dependencies: {
    react: '19.1.0', 'react-native': '0.81.5', '@bitauth/libauth': libauthVersion,
    '@callstack/polygen': '0.2.1', 'react-native-get-random-values': '1.11.0',
    'react-native-libauth': `file:${join(directory, packed.filename)}`,
  },
}, null, 2));
console.log('Installing the packed adapter into an isolated consumer app…');
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
const cli = join(directory, 'node_modules/react-native-libauth/scripts/generate.mjs');
const upstream = join(directory, 'node_modules/@bitauth/libauth');
const algorithms = ['sha1', 'sha256', 'sha512', 'ripemd160', 'secp256k1'];
const rawHashes = await Promise.all(algorithms.map(async name => createHash('sha256').update(await readFile(join(upstream, 'build/lib/bin', name, `${name}.wasm`))).digest('hex')));
const files = ['package.json', 'build/react-native.js', 'build/lib/crypto/default-crypto-instances.js', ...algorithms.map(name => `build/lib/bin/${name}/${name}.base64.js`)];
if (libauthVersion === '3.1.0-next.8') files.push('build/lib/vm/instruction-sets/bch/2025/bch-2025-consensus.js');
const beforeHelp = await readFile(join(upstream, 'package.json'), 'utf8');
assert.match(run(process.execPath, [cli, '--help']), /Usage:/);
assert.equal(await readFile(join(upstream, 'package.json'), 'utf8'), beforeHelp);
const unknown = spawnSync(process.execPath, [cli, '--not-a-real-option'], { cwd: directory, encoding: 'utf8' });
assert.notEqual(unknown.status, 0);
assert.equal(await readFile(join(upstream, 'package.json'), 'utf8'), beforeHelp);
run(process.execPath, [cli, '--js-only']);
const first = await Promise.all(files.map(file => readFile(join(upstream, file), 'utf8')));
run(process.execPath, [cli]);
const second = await Promise.all(files.map(file => readFile(join(upstream, file), 'utf8')));
assert.deepEqual(second, first, 'Repeated generation must preserve the installed libauth patch.');
const native = await readdir(join(directory, 'node_modules/react-native-libauth/native'), { recursive: true });
for (const name of algorithms) assert.ok(native.some(file => file.endsWith(`${name}.c`)));
const afterHashes = await Promise.all(algorithms.map(async name => createHash('sha256').update(await readFile(join(upstream, 'build/lib/bin', name, `${name}.wasm`))).digest('hex')));
assert.deepEqual(afterHashes, rawHashes, 'The original upstream WASM must remain unchanged.');
assert.match(await readFile(join(upstream, 'build/react-native.js'), 'utf8'), /react-native-libauth\/setup/);
const suite = pathToFileURL(join(root, 'shared/suite.js')).href;
run(process.execPath, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import * as lib from '@bitauth/libauth';
  import { initializeNativeCrypto } from '@bitauth/libauth/build/lib/crypto/default-crypto-instances.js';
  import { runChecks } from ${JSON.stringify(suite)};
  await initializeNativeCrypto();
  const results = runChecks(lib);
  assert.equal(results.length, 12);
  assert.deepEqual(results.filter(result => result.status !== 'passed'), []);
`]);
await writeFile(join(root, `artifacts/consumer-test-${libauthVersion}.json`), JSON.stringify({ directory, libauthVersion, packedBytes: packed.size, status: 'passed', checks: ['tarball contents', 'fresh consumer install', 'non-mutating help and invalid flags', 'repeatable generation', 'five generated native modules', 'upstream WASM unchanged', '12 consumer crypto checks'] }, null, 2) + '\n');
console.log('Consumer package test passed: fresh install, repeatable generation, unchanged upstream WASM, and all 12 crypto checks.');
