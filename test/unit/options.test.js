'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { validateOptions, DEFAULT_OPTIONS } = require('../../src/config/options');

test('validateOptions: applies defaults when no options provided', () => {
  const options = validateOptions();
  assert.strictEqual(options.slowThreshold, 1000);
  assert.strictEqual(options.logRequests, false);
  assert.deepStrictEqual(options.excludePaths, []);
  assert.strictEqual(options.maxEndpoints, 1000);
  assert.strictEqual(options.maxSlowRequests, 100);
  assert.strictEqual(options.logger, console);
});

test('validateOptions: accepts valid custom options', () => {
  const customLogger = { log: () => {} };
  const options = validateOptions({
    slowThreshold: 500,
    logRequests: true,
    excludePaths: ['/health', /^\/metrics/],
    maxEndpoints: 200,
    maxSlowRequests: 50,
    logger: customLogger
  });

  assert.strictEqual(options.slowThreshold, 500);
  assert.strictEqual(options.logRequests, true);
  assert.strictEqual(options.excludePaths.length, 2);
  assert.strictEqual(options.maxEndpoints, 200);
  assert.strictEqual(options.maxSlowRequests, 50);
  assert.strictEqual(options.logger, customLogger);
});

test('validateOptions: throws on non-object inputs', () => {
  assert.throws(() => validateOptions(null), /must be a plain object/);
  assert.throws(() => validateOptions('invalid'), /must be a plain object/);
  assert.throws(() => validateOptions(123), /must be a plain object/);
  assert.throws(() => validateOptions([]), /must be a plain object/);
});

test('validateOptions: validates slowThreshold correctly', () => {
  // Rejects non-numeric values
  assert.throws(() => validateOptions({ slowThreshold: 'fast' }), /must be a finite positive number/);
  assert.throws(() => validateOptions({ slowThreshold: true }), /must be a finite positive number/);
  assert.throws(() => validateOptions({ slowThreshold: {} }), /must be a finite positive number/);

  // Rejects NaN, Infinity, -Infinity
  assert.throws(() => validateOptions({ slowThreshold: NaN }), /must be a finite positive number/);
  assert.throws(() => validateOptions({ slowThreshold: Infinity }), /must be a finite positive number/);
  assert.throws(() => validateOptions({ slowThreshold: -Infinity }), /must be a finite positive number/);

  // Rejects zero and negative numbers
  assert.throws(() => validateOptions({ slowThreshold: 0 }), /must be greater than 0/);
  assert.throws(() => validateOptions({ slowThreshold: -100 }), /must be greater than 0/);
  assert.throws(() => validateOptions({ slowThreshold: -0.01 }), /must be greater than 0/);

  // Accepts valid finite positive numbers
  assert.strictEqual(validateOptions({ slowThreshold: 1 }).slowThreshold, 1);
  assert.strictEqual(validateOptions({ slowThreshold: 0.5 }).slowThreshold, 0.5);
  assert.strictEqual(validateOptions({ slowThreshold: 2500 }).slowThreshold, 2500);
});

test('validateOptions: validates logRequests', () => {
  assert.throws(() => validateOptions({ logRequests: 'yes' }), /must be a boolean/);
  assert.throws(() => validateOptions({ logRequests: 1 }), /must be a boolean/);
});

test('validateOptions: validates excludePaths', () => {
  assert.throws(() => validateOptions({ excludePaths: '/health' }), /must be an array/);
  assert.throws(() => validateOptions({ excludePaths: [123] }), /must be a string or a RegExp/);
});

test('validateOptions: validates maxEndpoints & maxSlowRequests limits', () => {
  assert.throws(() => validateOptions({ maxEndpoints: 0 }), /must be a positive integer/);
  assert.throws(() => validateOptions({ maxEndpoints: -5 }), /must be a positive integer/);
  assert.throws(() => validateOptions({ maxEndpoints: 2.5 }), /must be a positive integer/);

  assert.throws(() => validateOptions({ maxSlowRequests: 0 }), /must be a positive integer/);
  assert.throws(() => validateOptions({ maxSlowRequests: '10' }), /must be a positive integer/);
});

test('validateOptions: validates custom logger variations and invalid loggers', () => {
  // Accepts function-based logger
  assert.doesNotThrow(() => validateOptions({ logger: () => {} }));

  // Accepts logger object with only log()
  assert.doesNotThrow(() => validateOptions({ logger: { log: () => {} } }));

  // Accepts logger object with only info()
  assert.doesNotThrow(() => validateOptions({ logger: { info: () => {} } }));

  // Accepts logger object with only warn()
  assert.doesNotThrow(() => validateOptions({ logger: { warn: () => {} } }));

  // Accepts full logger object (e.g. console)
  assert.doesNotThrow(() => validateOptions({ logger: console }));

  // Rejects null, undefined, non-objects, arrays, and empty objects
  assert.throws(() => validateOptions({ logger: null }), /must be a function or an object/);
  assert.throws(() => validateOptions({ logger: 'console' }), /must be a function or an object/);
  assert.throws(() => validateOptions({ logger: 123 }), /must be a function or an object/);
  assert.throws(() => validateOptions({ logger: [] }), /must be a function or an object/);
  assert.throws(() => validateOptions({ logger: {} }), /must be a function or an object/);

  // Rejects logger object missing log, info, and warn
  assert.throws(() => validateOptions({ logger: { error: () => {} } }), /must be a function or an object/);
});
