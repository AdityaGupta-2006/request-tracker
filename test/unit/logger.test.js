'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { RequestLogger } = require('../../src/logger/logger');

test('RequestLogger: formats normal requests correctly', () => {
  const logged = [];
  const logger = new RequestLogger({
    info: (msg) => logged.push({ level: 'info', msg }),
    warn: (msg) => logged.push({ level: 'warn', msg })
  });

  logger.logRequest({
    method: 'GET',
    endpoint: '/users/:id',
    statusCode: 200,
    durationMs: 12.34,
    isSlow: false
  });

  assert.strictEqual(logged.length, 1);
  assert.strictEqual(logged[0].level, 'info');
  assert.strictEqual(logged[0].msg, '[ReqMetrics] GET /users/:id 200 - 12.34ms');
});

test('RequestLogger: warns on slow requests with threshold info', () => {
  const logged = [];
  const logger = new RequestLogger({
    info: (msg) => logged.push({ level: 'info', msg }),
    warn: (msg) => logged.push({ level: 'warn', msg })
  });

  logger.logRequest({
    method: 'POST',
    endpoint: '/checkout',
    statusCode: 201,
    durationMs: 1450.5,
    isSlow: true,
    thresholdMs: 1000
  });

  assert.strictEqual(logged.length, 1);
  assert.strictEqual(logged[0].level, 'warn');
  assert.strictEqual(logged[0].msg, '[ReqMetrics] [SLOW] POST /checkout 201 - 1450.5ms (threshold: 1000ms)');
});

test('RequestLogger: supports function as custom logger', () => {
  const messages = [];
  const fnLogger = (msg) => messages.push(msg);
  const logger = new RequestLogger(fnLogger);

  logger.logRequest({
    method: 'GET',
    endpoint: '/status',
    statusCode: 200,
    durationMs: 5.5,
    isSlow: false
  });

  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0], '[ReqMetrics] GET /status 200 - 5.5ms');
});

test('RequestLogger: supports logger object implementing only log()', () => {
  const logs = [];
  const logger = new RequestLogger({ log: (msg) => logs.push(msg) });

  logger.logRequest({
    method: 'GET',
    endpoint: '/only-log',
    statusCode: 200,
    durationMs: 10,
    isSlow: false
  });

  assert.strictEqual(logs.length, 1);
  assert.ok(logs[0].includes('GET /only-log'));
});

test('RequestLogger: supports logger object implementing only info()', () => {
  const infos = [];
  const logger = new RequestLogger({ info: (msg) => infos.push(msg) });

  logger.logRequest({
    method: 'GET',
    endpoint: '/only-info',
    statusCode: 200,
    durationMs: 10,
    isSlow: false
  });

  assert.strictEqual(infos.length, 1);
  assert.ok(infos[0].includes('GET /only-info'));
});

test('RequestLogger: supports logger object implementing only warn()', () => {
  const warns = [];
  const logger = new RequestLogger({ warn: (msg) => warns.push(msg) });

  logger.logRequest({
    method: 'POST',
    endpoint: '/only-warn',
    statusCode: 201,
    durationMs: 25,
    isSlow: true,
    thresholdMs: 20
  });

  assert.strictEqual(warns.length, 1);
  assert.ok(warns[0].includes('[SLOW] POST /only-warn'));
});

test('RequestLogger: gracefully swallows logger exceptions without throwing', () => {
  const throwingLogger = {
    log: () => { throw new Error('Logger disk full'); },
    warn: () => { throw new Error('Logger disk full'); },
    info: () => { throw new Error('Logger disk full'); }
  };
  const logger = new RequestLogger(throwingLogger);

  assert.doesNotThrow(() => {
    logger.logRequest({
      method: 'GET',
      endpoint: '/test',
      statusCode: 200,
      durationMs: 10,
      isSlow: true,
      thresholdMs: 5
    });
  });
});
