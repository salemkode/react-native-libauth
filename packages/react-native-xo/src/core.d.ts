export type Network = 'chipnet' | 'mainnet';
export interface ElectrumTransport {
  request(method: string, params?: unknown[]): Promise<unknown>;
  close(): void;
}
export interface WalletOptions {
  mnemonic: string;
  network?: Network;
  endpoint?: string;
  client?: ElectrumTransport;
}
export interface PaymentReview {
  readonly id: string;
  readonly network: Network;
  readonly address: string;
  readonly amountBch: string;
  readonly feeBch: string;
  readonly feeSatoshis: string;
  readonly totalBch: string;
  readonly txid: string;
  readonly byteLength: number;
  readonly expiresAt: number;
}
export interface WalletSession {
  readonly network: Network;
  readonly path: string;
  readonly address: string;
  refresh(): Promise<Readonly<{address: string; network: Network; balanceSatoshis: string; balanceBch: string; outputCount: number}>>;
  prepareSend(payment: {address: string; amountBch: string}): Promise<PaymentReview>;
  cancelSend(): void;
  broadcast(id: string): Promise<{txid: string; network: Network}>;
  lookupTransaction(txid: string): Promise<{txid: string; found: boolean}>;
  close(): void;
}
export declare const NETWORKS: Readonly<Record<Network, Readonly<{label: string; prefix: string; coinType: number; endpoint: string; checkpointHeight: number; checkpointHash: string; explorer: string}>>>;
export declare function createWalletSession(options: WalletOptions): WalletSession;
export declare function formatBch(satoshis: bigint | number | string): string;
export declare function parseBch(amountBch: string): bigint;
export declare function validateRecipient(address: string, network: Network): {address: string; bytecode: Uint8Array};
export declare class BroadcastUncertainError extends Error { readonly txid: string; }
