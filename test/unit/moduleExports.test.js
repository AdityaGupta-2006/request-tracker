'use strict';

const test = require('node:test');
const assert = require('node:assert');

test('Module system: verifies CommonJS require export', () => {
  const cjs = require('../..');
  assert.strictEqual(typeof cjs.createRequestTracker, 'function');
  assert.strictEqual(typeof cjs.RequestTracker, 'function');

  const tracker = cjs.createRequestTracker();
  assert.strictEqual(typeof tracker.middleware, 'function');
  assert.strictEqual(typeof tracker.getStats, 'function');
});

test('Module system: verifies ES module named and default imports consistency', async () => {
  const esm = await import('../../src/index.mjs');

  // Verify named exports
  assert.strictEqual(typeof esm.createRequestTracker, 'function');
  assert.strictEqual(typeof esm.RequestTracker, 'function');

  // Verify default export is the factory function matching index.d.ts
  assert.strictEqual(typeof esm.default, 'function');
  assert.strictEqual(esm.default, esm.createRequestTracker);

  // Verify tracker created via default export
  const trackerFromDefault = esm.default();
  assert.strictEqual(typeof trackerFromDefault.middleware, 'function');
  assert.strictEqual(typeof trackerFromDefault.getStats, 'function');

  // Verify tracker created via named export
  const trackerFromNamed = esm.createRequestTracker();
  assert.strictEqual(typeof trackerFromNamed.middleware, 'function');
  assert.strictEqual(typeof trackerFromNamed.getStats, 'function');
});
