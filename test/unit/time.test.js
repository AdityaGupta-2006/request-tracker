'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { now, toMs } = require('../../src/utils/time');

test('time.now() returns monotonic BigInt timestamp', () => {
  const t1 = now();
  const t2 = now();

  assert.strictEqual(typeof t1, 'bigint');
  assert.strictEqual(typeof t2, 'bigint');
  assert.ok(t2 >= t1, 'Monotonic clock must not move backwards');
});

test('time.toMs() correctly calculates milliseconds', () => {
  const start = now();
  // Simulate 1 millisecond (1,000,000 ns)
  const end = start + 1_500_000n;
  const duration = toMs(start, end);

  assert.strictEqual(typeof duration, 'number');
  assert.strictEqual(duration, 1.5);
});
