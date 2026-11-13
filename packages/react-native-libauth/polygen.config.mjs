import { localModule, polygenConfig } from '@callstack/polygen-config';

export default polygenConfig({
  output: { directory: 'native' },
  modules: ['sha1', 'sha256', 'sha512', 'ripemd160', 'secp256k1'].map(name =>
    localModule(`wasm/${name}.wasm`),
  ),
});
