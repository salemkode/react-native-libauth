// Compile-time consumer check against the generated upstream declarations.
import { sha256, secp256k1, encodeCashAddress, ripemd160 } from '@bitauth/libauth';
import { initializeLibauth } from 'react-native-libauth';

export async function checkPublicApi(message: Uint8Array, privateKey: Uint8Array) {
  await initializeLibauth();
  const hash = sha256.hash(message);
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  if (typeof publicKey === 'string') return { status: 'error' as const, message: publicKey };
  return {
    status: 'ready' as const,
    signature: secp256k1.signMessageHashSchnorr(privateKey, hash),
    address: encodeCashAddress({ type: 'p2pkh', payload: ripemd160.hash(sha256.hash(publicKey)) }),
  };
}
