'use strict';

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { createRequestTracker } = require('../..');

test('Integration (Phase 3): detects slow requests and populates slow history', async () => {
  const app = express();
  const tracker = createRequestTracker({
    slowThreshold: 50,
    maxSlowRequests: 5
  });

  app.use(tracker.middleware);

  app.get('/fast', (req, res) => {
    res.send('fast');
  });

  app.get('/slow', (req, res) => {
    setTimeout(() => {
      res.send('slow');
    }, 70);
  });

  await request(app).get('/fast').expect(200);
  await request(app).get('/slow').expect(200);

  const stats = tracker.getStats();
  assert.strictEqual(stats.totalRequests, 2);
  assert.strictEqual(stats.slowRequests, 1);

  const slowList = tracker.getSlowRequests();
  assert.strictEqual(slowList.length, 1);
  assert.strictEqual(slowList[0].endpoint, '/slow');
  assert.strictEqual(slowList[0].method, 'GET');
  assert.strictEqual(slowList[0].statusCode, 200);
  assert.ok(slowList[0].durationMs >= 50);
});

test('Integration (Phase 3): completely excludes configured paths', async () => {
  const app = express();
  const tracker = createRequestTracker({
    excludePaths: ['/health', /^\/metrics/]
  });

  app.use(tracker.middleware);

  app.get('/health', (req, res) => res.send('OK'));
  app.get('/metrics/system', (req, res) => res.send('system'));
  app.get('/api/data', (req, res) => res.send('data'));

  await request(app).get('/health').expect(200);
  await request(app).get('/metrics/system').expect(200);
  await request(app).get('/api/data').expect(200);

  const stats = tracker.getStats();
  // Only /api/data should be tracked
  assert.strictEqual(stats.totalRequests, 1);
  assert.strictEqual(stats.completedRequests, 1);

  const endpoints = tracker.getEndpointStats();
  assert.ok(!('/health' in endpoints));
  assert.ok(!('/metrics/system' in endpoints));
  assert.ok('/api/data' in endpoints);
});

test('Integration (Phase 3): captures 500 status codes from Express error-handling middleware', async () => {
  const app = express();
  const tracker = createRequestTracker();

  app.use(tracker.middleware);

  app.get('/crash', (req, res, next) => {
    next(new Error('Simulated route crash'));
  });

  // Express error-handling middleware (4 arguments)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(500).json({ error: err.message });
  });

  await request(app).get('/crash').expect(500);

  const stats = tracker.getStats();
  assert.strictEqual(stats.totalRequests, 1);
  assert.strictEqual(stats.completedRequests, 1);
  assert.strictEqual(stats.failedRequests, 1);
  assert.strictEqual(stats.statusCodes['500'], 1);

  const endpointStats = tracker.getEndpointStats('/crash');
  assert.strictEqual(endpointStats.failedRequests, 1);
});

test('Integration (Phase 3): faulty event listener does not crash HTTP request', async () => {
  const app = express();
  const tracker = createRequestTracker();

  tracker.on('request', () => {
    throw new Error('Listener catastrophe');
  });

  tracker.on('slowRequest', () => {
    throw new Error('Slow listener catastrophe');
  });

  app.use(tracker.middleware);

  app.get('/test', (req, res) => res.send('success'));

  const res = await request(app).get('/test').expect(200);
  assert.strictEqual(res.text, 'success');
});

test('Integration (Phase 3): faulty custom logger does not crash HTTP request', async () => {
  const app = express();
  const throwingLogger = {
    log: () => { throw new Error('Logger failure'); },
    warn: () => { throw new Error('Logger failure'); },
    info: () => { throw new Error('Logger failure'); }
  };

  const tracker = createRequestTracker({
    logRequests: true,
    logger: throwingLogger
  });

  app.use(tracker.middleware);

  app.get('/log-test', (req, res) => res.send('log ok'));

  const res = await request(app).get('/log-test').expect(200);
  assert.strictEqual(res.text, 'log ok');
});

test('Integration (Phase 3): resetStats() while requests are in flight does not crash or corrupt stats', async () => {
  const app = express();
  const tracker = createRequestTracker();

  app.use(tracker.middleware);

  let routeEnteredResolve;
  const routeEntered = new Promise((r) => { routeEnteredResolve = r; });

  app.get('/in-flight', (req, res) => {
    routeEnteredResolve();
    setTimeout(() => {
      res.send('done');
    }, 40);
  });

  const server = app.listen(0);
  const port = server.address().port;

  const fetchPromise = fetch(`http://127.0.0.1:${port}/in-flight`);
  await routeEntered;

  tracker.resetStats();

  await fetchPromise;
  server.close();

  const stats = tracker.getStats();
  // Pre-reset in-flight request completion must not corrupt the new statistics
  assert.strictEqual(stats.completedRequests, 0);
  assert.strictEqual(stats.totalRequests, 0);
  assert.deepStrictEqual(stats.methods, {});
});
