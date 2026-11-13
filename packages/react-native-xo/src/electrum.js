import { z } from 'zod';

const response = z.object({ id: z.number(), result: z.unknown().optional(), error: z.object({ message: z.string(), code: z.number().optional() }).nullable().optional() });

export class ElectrumRpcError extends Error {
  constructor(message) { super(message); this.name = 'ElectrumRpcError'; }
}

/** One connection per wallet. No automatic request or broadcast retries. */
export class ElectrumClient {
  #socket;
  #pending = new Map();
  #counter = 0;
  #ready;
  #closed = false;
  #timeout;

  constructor(endpoint, { WebSocketImpl = globalThis.WebSocket, timeout = 15000 } = {}) {
    const url = z.string().url().refine(value => value.startsWith('wss://'), 'Use an encrypted wss:// endpoint').parse(endpoint);
    if (!WebSocketImpl) throw new Error('WebSocket is unavailable.');
    this.#timeout = timeout;
    this.#socket = new WebSocketImpl(url);
    this.#ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('Electrum connection timed out.')); this.close(); }, timeout);
      this.#socket.onopen = () => { clearTimeout(timer); resolve(); };
      this.#socket.onerror = () => { clearTimeout(timer); reject(new Error('Electrum connection failed.')); this.#failPending(); };
      this.#socket.onclose = () => { clearTimeout(timer); reject(new Error('Electrum connection closed.')); this.#closed = true; this.#failPending(); };
    });
    // Requests await the original promise; attaching a handler prevents an
    // unhandled rejection if a newly created client is closed before first use.
    this.#ready.catch(() => {});
    this.#socket.onmessage = event => {
      try {
        const messages = String(event.data).trim().split('\n');
        for (const message of messages) {
          const parsed = response.safeParse(JSON.parse(message));
          if (!parsed.success) continue; // subscription notification
          const pending = this.#pending.get(parsed.data.id);
          if (!pending) continue;
          clearTimeout(pending.timer);
          this.#pending.delete(parsed.data.id);
          if (parsed.data.error) pending.reject(new ElectrumRpcError(parsed.data.error.message));
          else if ('result' in parsed.data) pending.resolve(parsed.data.result);
          else pending.reject(new Error('Malformed Electrum response.'));
        }
      } catch { this.#failPending('Malformed Electrum response.'); }
    };
  }

  #failPending(message = 'Electrum disconnected. The request outcome may be unknown.') {
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    this.#pending.clear();
  }

  async request(method, params = []) {
    await this.#ready;
    if (this.#closed) throw new Error('Electrum connection is closed.');
    const id = ++this.#counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); reject(new Error('Electrum request timed out. Check the transaction before sending again.')); }, this.#timeout);
      this.#pending.set(id, { resolve, reject, timer });
      try { this.#socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); }
      catch (error) { clearTimeout(timer); this.#pending.delete(id); reject(error); }
    });
  }

  close() { this.#closed = true; this.#failPending(); this.#socket.close(); }
}
