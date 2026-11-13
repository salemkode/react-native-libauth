import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const targets = { 'darwin-arm64': 'macos-14', 'darwin-x64': 'macos-12', 'linux-x64': 'source' };
const target = targets[`${process.platform}-${process.arch}`];
if (!target) throw new Error('Install WABT 1.0.36 manually and set WABT_PATH to its bin directory.');
// The upstream Ubuntu 20.04 binary requires libcrypto.so.1.1, unavailable on
// current Ubuntu. Build only wasm2c from pinned source against the host OpenSSL.
const fromSource = target === 'source';
const filename = `wabt-1.0.36-${target}.tar.gz`;
const url = fromSource
  ? 'https://github.com/WebAssembly/wabt/archive/refs/tags/1.0.36.tar.gz'
  : `https://github.com/WebAssembly/wabt/releases/download/1.0.36/${filename}`;
const download = await fetch(url);
if (!download.ok) throw new Error(`WABT download failed: ${download.status}`);
const bytes = Buffer.from(await download.arrayBuffer());
const expected = fromSource
  ? 'e07ceeecfc682c12157ff2738b8a4633d7d19da18c1ecf16daae700397ecce2c'
  : await (async () => {
      const checksum = await fetch(`${url}.sha256`);
      if (!checksum.ok) throw new Error(`WABT checksum download failed: ${checksum.status}`);
      return (await checksum.text()).trim().split(/\s+/)[0];
    })();
const actual = createHash('sha256').update(bytes).digest('hex');
if (actual !== expected) throw new Error('WABT archive checksum does not match release checksum.');
await mkdir(resolve(root, '.tools'), { recursive: true });
const archive = resolve(root, '.tools', filename);
await writeFile(archive, bytes);
const result = spawnSync('tar', ['-xzf', archive, '-C', resolve(root, '.tools')], { stdio: 'inherit' });
if (result.status !== 0) throw new Error('Could not extract WABT.');
if (fromSource) {
  const source = resolve(root, '.tools/wabt-1.0.36');
  const build = resolve(root, '.tools/wabt-build-1.0.36');
  console.log('Building wasm2c 1.0.36 from verified source (requires CMake, C++, and OpenSSL development headers)…');
  const configure = spawnSync('cmake', ['-S', source, '-B', build, '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_TESTS=OFF', '-DBUILD_LIBWASM=OFF'], { stdio: 'inherit' });
  if (configure.status !== 0) throw new Error('WABT configuration failed. On Ubuntu, install cmake, g++, and libssl-dev.');
  const compile = spawnSync('cmake', ['--build', build, '--target', 'wasm2c', '--parallel', '2'], { stdio: 'inherit' });
  if (compile.status !== 0) throw new Error('Building wasm2c failed. Check the compiler output above.');
  await mkdir(resolve(source, 'bin'), { recursive: true });
  await copyFile(resolve(build, 'wasm2c'), resolve(source, 'bin/wasm2c'));
  await chmod(resolve(source, 'bin/wasm2c'), 0o755);
}
const version = spawnSync(resolve(root, '.tools/wabt-1.0.36/bin/wasm2c'), ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || version.stdout.trim() !== '1.0.36') {
  const detail = [version.error?.message, version.stderr, version.stdout].filter(Boolean).join('\n').trim();
  throw new Error(`WABT verification failed (expected wasm2c 1.0.36): ${detail || `exit ${version.status}`}`);
}
console.log('Installed project-local WABT 1.0.36. npm run generate will use it automatically.');
