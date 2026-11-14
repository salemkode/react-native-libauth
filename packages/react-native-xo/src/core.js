import {
  binToHex, binsAreEqual, cashAddressToLockingBytecode, createVirtualMachineBCH,
  decodeBip39Mnemonic, decodeCashAddress, decodeTransaction, deriveHdPath,
  deriveHdPrivateNodeFromSeed, deriveSeedFromBip39Mnemonic, encodeTransaction,
  generateTransaction, hashTransaction, hexToBin, lockingBytecodeToCashAddress,
  privateKeyToP2pkhLockingBytecode, sha256, walletTemplateP2pkhNonHd,
  walletTemplateToCompilerBCH,
} from '@bitauth/libauth';
import { PrivateKey, Satoshis, TransactionHash } from '@xo-cash/primitives';
import { z } from 'zod';
import { ElectrumClient } from './electrum.js';
import { NETWORKS, networkName } from './networks.js';
export { NETWORKS } from './networks.js';

const hex = z.string().regex(/^(?:[a-fA-F0-9]{2})+$/);
const unspentList = z.array(z.object({
  tx_hash: z.string().length(64).regex(/^[a-fA-F0-9]+$/),
  tx_pos: z.number().int().min(0).max(0xffffffff),
  value: z.number().int().safe().nonnegative().max(2100000000000000),
  height: z.number().int(), token_data: z.unknown().optional(),
})).max(200);

export function parseBch(value) { return Satoshis.fromBchString(z.string().trim().parse(value)).toBigInt(); }
export function formatBch(value) { return new Satoshis(value).toBchString(); }

export function validateRecipient(address, network) {
  const config = NETWORKS[networkName.parse(network)];
  const value = z.string().trim().min(1).parse(address);
  const decoded = decodeCashAddress(value);
  if (typeof decoded === 'string') throw new Error('Enter a complete CashAddress, including its network prefix.');
  if (decoded.prefix !== config.prefix) throw new Error(`Use a ${config.prefix}: address for ${config.label}.`);
  if (!['p2pkh', 'p2sh'].includes(decoded.type) || decoded.payload.length !== 20) throw new Error('This BCH-only wallet supports standard P2PKH and P2SH20 recipients.');
  const result = cashAddressToLockingBytecode(value);
  if (typeof result === 'string') throw new Error('Invalid CashAddress.');
  return { address: value.toLowerCase(), bytecode: result.bytecode };
}

/** A failed broadcast may already be on the network: inspect txid, never retry automatically. */
export class BroadcastUncertainError extends Error {
  constructor(txid, cause) {
    super(`Broadcast outcome needs checking. Look up transaction ${txid} before sending again.`, { cause });
    this.name = 'BroadcastUncertainError'; this.txid = txid;
  }
}

export function createWalletSession({ mnemonic, network = 'chipnet', client, endpoint } = {}) {
  const selected = networkName.parse(network);
  const phrase = z.string().trim().transform(value => value.normalize('NFKD').split(/\s+/).join(' ')).parse(mnemonic);
  const entropy = decodeBip39Mnemonic(phrase);
  if (typeof entropy === 'string') throw new Error('The recovery phrase is invalid. Check its words and checksum.');
  entropy.fill(0);
  const seed = deriveSeedFromBip39Mnemonic(phrase);
  const master = deriveHdPrivateNodeFromSeed(seed);
  const path = `m/44'/${NETWORKS[selected].coinType}'/0'/0/0`;
  const node = deriveHdPath(master, path);
  const key = new PrivateKey(node.privateKey);
  seed.fill(0); master.privateKey.fill(0); node.privateKey.fill(0);
  return new WalletSession(key, selected, path, client || new ElectrumClient(endpoint || NETWORKS[selected].endpoint));
}

class WalletSession {
  #key;
  #client;
  #verified;
  #closed = false;
  #busy = false;
  #draft;
  #sequence = 0;
  #locking;
  #scriptHash;
  #blockedTxid;
  #submittedInputs = [];

  constructor(key, network, path, client) {
    this.#key = key; this.#client = client;
    this.network = network; this.path = path;
    const bytes = key.toBytes();
    this.#locking = privateKeyToP2pkhLockingBytecode({ privateKey: bytes }); bytes.fill(0);
    const address = lockingBytecodeToCashAddress({ bytecode: this.#locking, prefix: NETWORKS[network].prefix });
    if (typeof address === 'string') throw new Error(address);
    this.address = address.address;
    this.#scriptHash = binToHex(sha256.hash(this.#locking).reverse());
    // Network, derivation path, and address cannot be retargeted after construction.
    // Metro lowers private fields to ordinary hidden properties. Freezing the
    // instance would freeze its draft/operation state too; protect only identity.
    Object.defineProperties(this, {
      network: { writable: false, configurable: false },
      path: { writable: false, configurable: false },
      address: { writable: false, configurable: false },
    });
  }

  #assertOpen() { if (this.#closed) throw new Error('Wallet session is closed.'); }

  async #verifyNetwork() {
    this.#assertOpen();
    if (!this.#verified) this.#verified = (async () => {
      await this.#client.request('server.version', ['react-native-xo', '1.4']);
      const config = NETWORKS[this.network];
      const header = hex.length(160).parse(await this.#client.request('blockchain.block.header', [config.checkpointHeight]));
      if (hashTransaction(hexToBin(header)) !== config.checkpointHash) throw new Error('Electrum server is on the wrong network.');
    })();
    await this.#verified;
    this.#assertOpen();
  }

  async #utxos() {
    await this.#verifyNetwork();
    const list = unspentList.parse(await this.#client.request('blockchain.scripthash.listunspent', [this.#scriptHash, 'include_tokens']));
    const seen = new Set();
    const verified = [];
    for (const item of list) {
      const id = `${item.tx_hash.toLowerCase()}:${item.tx_pos}`;
      if (seen.has(id)) throw new Error('Electrum returned duplicate outputs.');
      seen.add(id);
      if (item.token_data || item.height < 0) continue;
      const raw = hex.parse(await this.#client.request('blockchain.transaction.get', [item.tx_hash, false]));
      const bytes = hexToBin(raw);
      if (hashTransaction(bytes) !== item.tx_hash.toLowerCase()) throw new Error('Electrum returned a transaction with the wrong hash.');
      const transaction = decodeTransaction(bytes);
      if (typeof transaction === 'string') throw new Error('Electrum returned an invalid transaction.');
      const output = transaction.outputs[item.tx_pos];
      if (!output || output.valueSatoshis !== BigInt(item.value) || !binsAreEqual(output.lockingBytecode, this.#locking)) throw new Error('Electrum output does not match the wallet or amount.');
      // CashTokens are never spent by this BCH-only wallet, even if the server
      // omits token_data. Coinbase maturity is intentionally unsupported.
      if (output.token || transaction.inputs.some(input => input.outpointTransactionHash.every(byte => byte === 0))) continue;
      verified.push({ txid: new TransactionHash(item.tx_hash).toHex(), index: item.tx_pos, valueSatoshis: new Satoshis(item.value).toBigInt(), output });
    }
    this.#assertOpen();
    return verified.sort((a, b) => a.txid.localeCompare(b.txid) || a.index - b.index);
  }

  async refresh() {
    const utxos = await this.#utxos();
    if (this.#blockedTxid && this.#submittedInputs.every(input => !utxos.some(utxo => input.txid === utxo.txid && input.index === utxo.index))) {
      this.#blockedTxid = undefined;
      this.#submittedInputs = [];
    }
    const total = utxos.reduce((sum, utxo) => sum + utxo.valueSatoshis, 0n);
    return Object.freeze({ address: this.address, network: this.network, balanceSatoshis: total.toString(), balanceBch: formatBch(total), outputCount: utxos.length });
  }

  async prepareSend({ address, amountBch }) {
    this.#assertOpen();
    if (this.#busy || this.#blockedTxid) throw new Error('Resolve the pending transaction before preparing another payment.');
    this.#busy = true;
    this.#draft = undefined;
    try {
      const recipient = validateRecipient(address, this.network);
      const amount = parseBch(amountBch);
      if (amount < 546n) throw new Error('Minimum payment is 0.00000546 BCH (546 satoshis).');
      const available = await this.#utxos();
      const selected = [];
      const totals = { value: 0n, fee: 0n };
      for (const utxo of available) {
        selected.push(utxo); totals.value += utxo.valueSatoshis;
        // 1 sat/byte, conservative 148-byte inputs and two standard outputs.
        totals.fee = BigInt(10 + selected.length * 148 + 8 + 1 + recipient.bytecode.length + 34);
        if (totals.value >= amount + totals.fee) break;
        if (selected.length >= 100) throw new Error('Consolidate outputs before sending: maximum 100 inputs.');
      }
      if (totals.value < amount + totals.fee) throw new Error('Insufficient BCH for this amount and its network fee.');
      const change = totals.value - amount - totals.fee;
      const outputs = [{ lockingBytecode: recipient.bytecode, valueSatoshis: amount }, ...(change >= 546n ? [{ lockingBytecode: this.#locking, valueSatoshis: change }] : [])];
      const keyBytes = this.#key.toBytes();
      const generated = generateTransaction({
        version: 2, locktime: 0,
        inputs: selected.map(utxo => ({
          outpointTransactionHash: hexToBin(utxo.txid), outpointIndex: utxo.index, sequenceNumber: 0xffffffff,
          unlockingBytecode: { compiler: walletTemplateToCompilerBCH(walletTemplateP2pkhNonHd), script: 'unlock', valueSatoshis: utxo.valueSatoshis, data: { keys: { privateKeys: { key: keyBytes } } } },
        })), outputs,
      });
      keyBytes.fill(0);
      if (!generated.success) throw new Error('Transaction signing failed.');
      const verification = createVirtualMachineBCH().verify({ transaction: generated.transaction, sourceOutputs: selected.map(utxo => utxo.output) });
      if (verification !== true) throw new Error(`Signed transaction validation failed: ${verification}`);
      const bytes = encodeTransaction(generated.transaction);
      const fee = totals.value - outputs.reduce((sum, output) => sum + output.valueSatoshis, 0n);
      if (fee < BigInt(bytes.length) || fee > totals.fee + 545n) throw new Error('Unexpected transaction fee.');
      const review = Object.freeze({
        id: String(++this.#sequence), network: this.network, address: recipient.address,
        amountBch: formatBch(amount), feeBch: formatBch(fee), feeSatoshis: fee.toString(),
        totalBch: formatBch(amount + fee), txid: hashTransaction(bytes), byteLength: bytes.length,
        expiresAt: Date.now() + 120000,
      });
      this.#draft = { review, hex: binToHex(bytes), selected };
      return review;
    } finally { this.#busy = false; }
  }

  cancelSend() { this.#draft = undefined; }

  async broadcast(id) {
    this.#assertOpen();
    const draft = this.#draft;
    if (!draft || draft.review.id !== id || draft.review.expiresAt < Date.now()) throw new Error('Payment review expired. Prepare it again.');
    if (this.#busy) throw new Error('A wallet operation is already running.');
    this.#busy = true;
    try {
      const current = await this.#utxos();
      if (this.#draft !== draft) throw new Error('Payment was cancelled.');
      if (draft.review.expiresAt < Date.now()) throw new Error('Payment review expired. Prepare it again.');
      if (!draft.selected.every(input => current.some(utxo => utxo.txid === input.txid && utxo.index === input.index))) throw new Error('An input was spent. Prepare the payment again.');
      this.#draft = undefined; // consume before submitting; double taps cannot resend
      this.#blockedTxid = draft.review.txid;
      this.#submittedInputs = draft.selected;
      try {
        const txid = new TransactionHash(await this.#client.request('blockchain.transaction.broadcast', [draft.hex])).toHex();
        if (txid !== draft.review.txid) throw new Error('Electrum returned an unexpected transaction hash.');
        return { txid, network: this.network };
      } catch (cause) { throw new BroadcastUncertainError(draft.review.txid, cause); }
    } finally { this.#busy = false; }
  }

  async lookupTransaction(txid) {
    await this.#verifyNetwork();
    const hash = new TransactionHash(txid).toHex();
    const raw = hex.parse(await this.#client.request('blockchain.transaction.get', [hash, false]));
    if (hashTransaction(hexToBin(raw)) !== hash) throw new Error('Transaction lookup returned the wrong hash.');
    return { txid: hash, found: true };
  }

  close() { this.#closed = true; this.#draft = undefined; this.#key.destroy(); this.#client.close(); }
}
