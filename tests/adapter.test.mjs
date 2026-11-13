import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const runtime = dirname(require.resolve('@callstack/polygen/package.json'));

// Isolate the JS WebAssembly adapter contract; native crypto is verified in-app.
async function loadAdapter(filename, dependencies) {
  const source = await readFile(join(runtime, 'dist/api', `${filename}.js`), 'utf8');
  const exports = {};
  runInNewContext(source, {
    exports, ArrayBuffer, Uint8Array, DataView,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

class Module {
  constructor(buffer) { this.buffer = buffer; this.metadata = { imports: [] }; }
}
class Instance {
  constructor(module, imports) { this.module = module; this.imports = imports; }
}

const wasm = await loadAdapter('WebAssembly', { './Module': { Module }, './Instance': { Instance } });

test('adapter instantiate(bytes) returns the module and instance', async () => {
  const bytes = new Uint8Array([0, 97, 115, 109]);
  const result = await wasm.instantiate(bytes);
  assert.ok(result.module instanceof Module);
  assert.ok(result.instance instanceof Instance);
  assert.equal(result.instance.module, result.module);
});

test('adapter instantiate(Module) returns just the instance', async () => {
  const module = new Module(new ArrayBuffer(0));
  const result = await wasm.instantiate(module);
  assert.ok(result instanceof Instance);
  assert.equal(result.module, module);
});

test('adapter compile honors typed array offsets', async () => {
  const bytes = new Uint8Array([99, 0, 97, 115, 109, 99]);
  const result = await wasm.compile(bytes.subarray(1, 5));
  assert.deepEqual(new Uint8Array(result.buffer), new Uint8Array([0, 97, 115, 109]));
});

test('adapter instantiateStreaming resolves its instance', async () => {
  const result = await wasm.instantiateStreaming({ arrayBuffer: async () => new ArrayBuffer(0) });
  assert.ok(result.instance instanceof Instance);
  assert.equal(result.instance.module, result.module);
});

test('libauth imports allow numeric zero globals and function tables', async () => {
  class Global { constructor(descriptor, value) { this.descriptor = descriptor; this.value = value; } }
  class Memory {}
  class Table {}
  class LinkError extends Error {}
  const { Instance: NativeInstance } = await loadAdapter('Instance', {
    '../NativePolygen': { __esModule: true, default: { createModuleInstance(holder) { holder.exports = {}; } } },
    './Global': { Global }, './Memory': { Memory }, './Module': { Module }, './Table': { Table }, './errors': { LinkError },
  });
  const module = new Module(new ArrayBuffer(0));
  module.metadata.imports = [
    { module: 'env', name: 'tableBase', kind: 'global' },
    { module: 'env', name: 'table', kind: 'table' },
  ];
  const imports = { env: { tableBase: 0, table: new Table() } };
  assert.ok(new NativeInstance(module, imports));
  assert.ok(imports.env.tableBase instanceof Global);
  assert.equal(imports.env.tableBase.value, 0);
  assert.throws(() => new NativeInstance(module, { env: { tableBase: 0 } }), /not provided/);
});
