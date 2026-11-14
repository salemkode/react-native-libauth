import * as lib from '@bitauth/libauth';
import {initializeNativeCrypto} from '@bitauth/libauth/build/lib/crypto/default-crypto-instances.js';
import {benchmarkCrypto} from '../shared/performance.js';
await initializeNativeCrypto();
console.log(JSON.stringify({runtime: `Node ${process.version} / V8 WASM (not a browser)`, ...await benchmarkCrypto(lib)}, null, 2));
