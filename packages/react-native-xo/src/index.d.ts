import type {WalletOptions, WalletSession} from './core.js';
export {NETWORKS, formatBch, parseBch, validateRecipient, BroadcastUncertainError} from './core.js';
export type {Network, WalletOptions, WalletSession, PaymentReview, ElectrumTransport} from './core.js';
export declare function createWallet(options: WalletOptions): Promise<WalletSession>;
