import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const local = resolve(root, '.tools/wabt-1.0.36/bin/wasm2c');
const wasm2c = process.env.WABT_PATH ? resolve(process.env.WABT_PATH, 'wasm2c') : existsSync(local) ? local : 'wasm2c';
const commands = [['Node', process.execPath, ['--version']], ['wasm2c (must be 1.0.36)', wasm2c, ['--version']], ['Xcode (iOS)', 'xcodebuild', ['-version']], ['CocoaPods (iOS)', 'pod', ['--version']], ['Java (Android; use JDK 17)', 'java', ['-version']]];
const results = commands.map(([name, command, args]) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  const ok = result.status === 0 && (command !== wasm2c || result.stdout.trim() === '1.0.36');
  console.log(`${ok ? 'OK' : 'MISSING / INCOMPATIBLE'} ${name}: ${(result.stdout || result.stderr || result.error?.message || '').split('\n')[0]}`);
  return { name, ok };
});
console.log(`${existsSync('packages/react-native-libauth/generated/manifest.json') ? 'OK' : 'MISSING'} generated libauth: run npm run generate`);
console.log('Metro port: 8097. Use a simulator/emulator you own. Expo Go cannot load this native package.');
if (!results[1].ok) process.exitCode = 1;
