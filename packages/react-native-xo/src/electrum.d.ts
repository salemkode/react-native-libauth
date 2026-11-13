import type {ElectrumTransport} from './core.js';
export declare class ElectrumRpcError extends Error {}
export declare class ElectrumClient implements ElectrumTransport {
  constructor(endpoint: string, options?: {timeout?: number; WebSocketImpl?: typeof WebSocket});
  request(method: string, params?: unknown[]): Promise<unknown>;
  close(): void;
}
