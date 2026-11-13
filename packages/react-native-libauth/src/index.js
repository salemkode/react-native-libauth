import '../setup.js';

// The build script adds explicit initialization to the installed upstream file.
export { initializeNativeCrypto as initializeLibauth } from '@bitauth/libauth/build/lib/crypto/default-crypto-instances.js';
