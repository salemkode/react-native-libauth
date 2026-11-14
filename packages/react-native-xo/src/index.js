import { initializeLibauth } from 'react-native-libauth';
import { createWalletSession } from './core.js';
export { NETWORKS, formatBch, parseBch, validateRecipient, BroadcastUncertainError } from './core.js';

/** Await native crypto before any XO key or signing operation. */
export async function createWallet(options) {
  await initializeLibauth();
  return createWalletSession(options);
}
