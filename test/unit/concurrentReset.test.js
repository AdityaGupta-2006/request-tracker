'use strict';

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { MetricsStore } = require('../../src/core/metricsStore');
const { createRequestTracker } = require('../..');

test('Concurrent Reset: 1. Old GET request, reset, new POST request, old GET completes', () => {
  const store = new MetricsStore();

  // 1. Start an old GET request
  const oldGetEpoch = store.recordRequestStart('GET');

  // 2. Call resetStats()
  store.reset();

  // 3. Start a new POST request
  const newPostEpoch = store.recordRequestStart('POST');

  // 4. Complete the old GET request
  const oldGetResult = store.recordResponse({
    epoch: oldGetEpoch,
    method: 'GET',
    endpoint: '/users',
    statusCode: 200,
    durationMs: 40,
    aborted: false
  });

  assert.strictEqual(oldGetResult.ignored, true);

  // Check state before new POST completes: only the new POST request is tracked
  const midStats = store.getStats();
  assert.strictEqual(midStats.totalRequests, 1);
  assert.strictEqual(midStats.completedRequests, 0);
  assert.deepStrictEqual(midStats.methods, { POST: 1 });
  assert.deepStrictEqual(midStats.statusCodes, {});

  // 5. Complete the new POST request
  const newPostResult = store.recordResponse({
    epoch: newPostEpoch,
    method: 'POST',
    endpoint: '/users',
    statusCode: 201,
    durationMs: 15,
    aborted: false
  });

  assert.strictEqual(newPostResult.ignored, false);

  // Final stats must only reflect the new POST request
  const finalStats = store.getStats();
  assert.strictEqual(finalStats.totalRequests, 1);
  assert.strictEqual(finalStats.completedRequests, 1);
  assert.strictEqual(finalStats.successfulRequests, 1);
  assert.strictEqual(finalStats.failedRequests, 0);
  assert.deepStrictEqual(finalStats.methods, { POST: 1 });
  assert.deepStrictEqual(finalStats.statusCodes, { '201': 1 });
  assert.strictEqual(finalStats.averageResponseTime, 15);

  const endpointStats = store.getEndpointStats('/users');
  assert.strictEqual(endpointStats.totalRequests, 1);
  assert.strictEqual(endpointStats.successfulRequests, 1);
});

test('Concurrent Reset: 2. Multiple old requests completing in different orders', () => {
  const store = new MetricsStore();

  const epochA = store.recordRequestStart('GET');
  const epochB = store.recordRequestStart('POST');
  const epochC = store.recordRequestStart('DELETE');

  store.reset();

  const newEpoch = store.recordRequestStart('PUT');

  // Complete old requests out of order
  store.recordResponse({ epoch: epochC, method: 'DELETE', endpoint: '/c', statusCode: 204, durationMs: 10, aborted: false });
  store.recordResponse({ epoch: epochA, method: 'GET', endpoint: '/a', statusCode: 200, durationMs: 20, aborted: false });
  store.recordResponse({ epoch: epochB, method: 'POST', endpoint: '/b', statusCode: 201, durationMs: 30, aborted: false });

  // Complete new request
  store.recordResponse({ epoch: newEpoch, method: 'PUT', endpoint: '/d', statusCode: 200, durationMs: 5, aborted: false });

  const stats = store.getStats();
  assert.strictEqual(stats.totalRequests, 1);
  assert.strictEqual(stats.completedRequests, 1);
  assert.deepStrictEqual(stats.methods, { PUT: 1 });
  assert.deepStrictEqual(stats.statusCodes, { '200': 1 });

  const endpoints = store.getEndpointStats();
  assert.ok('/d' in endpoints);
  assert.ok(!('/a' in endpoints));
  assert.ok(!('/b' in endpoints));
  assert.ok(!('/c' in endpoints));
});

test('Concurrent Reset: 3. Old requests completing after several new requests have started', () => {
  const store = new MetricsStore();

  const oldEpoch = store.recordRequestStart('GET');

  store.reset();

  // Several new requests start
  const new1 = store.recordRequestStart('POST');
  const new2 = store.recordRequestStart('GET');
  const new3 = store.recordRequestStart('PATCH');

  // Old request completes
  store.recordResponse({ epoch: oldEpoch, method: 'GET', endpoint: '/old', statusCode: 200, durationMs: 100, aborted: false });

  // New requests complete
  store.recordResponse({ epoch: new1, method: 'POST', endpoint: '/new1', statusCode: 201, durationMs: 10, aborted: false });
  store.recordResponse({ epoch: new2, method: 'GET', endpoint: '/new2', statusCode: 200, durationMs: 15, aborted: false });
  store.recordResponse({ epoch: new3, method: 'PATCH', endpoint: '/new3', statusCode: 200, durationMs: 20, aborted: false });

  const stats = store.getStats();
  assert.strictEqual(stats.totalRequests, 3);
  assert.strictEqual(stats.completedRequests, 3);
  assert.deepStrictEqual(stats.methods, { POST: 1, GET: 1, PATCH: 1 });
  assert.deepStrictEqual(stats.statusCodes, { '200': 2, '201': 1 });
  assert.strictEqual(stats.averageResponseTime, 15); // (10 + 15 + 20) / 3
});

test('Concurrent Reset: 4. Old requests being aborted after reset', () => {
  const store = new MetricsStore();

  const oldEpoch = store.recordRequestStart('GET');

  store.reset();

  const newEpoch = store.recordRequestStart('POST');

  // Old request aborts
  store.recordResponse({ epoch: oldEpoch, method: 'GET', endpoint: '/old-aborted', statusCode: 0, durationMs: 50, aborted: true });

  const midStats = store.getStats();
  assert.strictEqual(midStats.abortedRequests, 0, 'Old abort must not increment abortedRequests in new epoch');
  assert.strictEqual(midStats.totalRequests, 1);
  assert.deepStrictEqual(midStats.methods, { POST: 1 });

  // New request aborts
  store.recordResponse({ epoch: newEpoch, method: 'POST', endpoint: '/new-aborted', statusCode: 0, durationMs: 20, aborted: true });

  const finalStats = store.getStats();
  assert.strictEqual(finalStats.totalRequests, 1);
  assert.strictEqual(finalStats.abortedRequests, 1);
  assert.strictEqual(finalStats.completedRequests, 0);
  assert.deepStrictEqual(finalStats.methods, { POST: 1 });
});

test('Concurrent Reset: 5. Reset with no in-flight requests', () => {
  const store = new MetricsStore();

  store.reset();

  const stats = store.getStats();
  assert.strictEqual(stats.totalRequests, 0);
  assert.strictEqual(stats.completedRequests, 0);
  assert.strictEqual(stats.abortedRequests, 0);
  assert.deepStrictEqual(stats.methods, {});
  assert.deepStrictEqual(stats.statusCodes, {});
  assert.deepStrictEqual(store.getEndpointStats(), {});

  // Subsequent request works normally
  const ep = store.recordRequestStart('GET');
  store.recordResponse({ epoch: ep, method: 'GET', endpoint: '/normal', statusCode: 200, durationMs: 12, aborted: false });

  const postStats = store.getStats();
  assert.strictEqual(postStats.totalRequests, 1);
  assert.strictEqual(postStats.completedRequests, 1);
  assert.deepStrictEqual(postStats.methods, { GET: 1 });
});

test('Concurrent Reset: 6. Repeated resets with concurrent requests', () => {
  const store = new MetricsStore();

  // Epoch 1
  const ep1 = store.recordRequestStart('GET');
  store.reset(); // Advances to Epoch 2

  // Epoch 2
  const ep2 = store.recordRequestStart('POST');
  store.reset(); // Advances to Epoch 3

  // Epoch 3
  const ep3 = store.recordRequestStart('DELETE');

  // Old requests complete
  store.recordResponse({ epoch: ep1, method: 'GET', endpoint: '/e1', statusCode: 200, durationMs: 10, aborted: false });
  store.recordResponse({ epoch: ep2, method: 'POST', endpoint: '/e2', statusCode: 201, durationMs: 20, aborted: false });

  // Epoch 3 request completes
  store.recordResponse({ epoch: ep3, method: 'DELETE', endpoint: '/e3', statusCode: 204, durationMs: 5, aborted: false });

  const stats = store.getStats();
  assert.strictEqual(stats.totalRequests, 1);
  assert.strictEqual(stats.completedRequests, 1);
  assert.deepStrictEqual(stats.methods, { DELETE: 1 });
  assert.deepStrictEqual(stats.statusCodes, { '204': 1 });
});

test('Concurrent Reset Integration: Express handles old GET, reset, new POST correctly', async () => {
  const app = express();
  const tracker = createRequestTracker();

  app.use(tracker.middleware);

  let oldGetEnteredResolve;
  const oldGetEntered = new Promise((r) => { oldGetEnteredResolve = r; });

  // Slow endpoint that takes 80ms
  app.get('/old-get', (req, res) => {
    oldGetEnteredResolve();
    setTimeout(() => {
      res.send('old get done');
    }, 80);
  });

  // Fast endpoint
  app.post('/new-post', (req, res) => {
    res.status(201).send('new post done');
  });

  const server = app.listen(0);
  const port = server.address().port;

  // 1. Trigger old GET request over network
  const oldGetPromise = fetch(`http://127.0.0.1:${port}/old-get`);
  await oldGetEntered;

  // 2. Call resetStats() while old GET is in flight
  tracker.resetStats();

  // 3. Trigger new POST request (starts and completes after reset, before old GET finishes)
  const postRes = await fetch(`http://127.0.0.1:${port}/new-post`, { method: 'POST' });
  assert.strictEqual(postRes.status, 201);

  // 4. Wait for old GET to complete
  const getRes = await oldGetPromise;
  assert.strictEqual(getRes.status, 200);

  server.close();

  // 5. Verify stats: only the POST request must be recorded!
  const stats = tracker.getStats();
  assert.strictEqual(stats.totalRequests, 1, 'Total requests must be 1');
  assert.strictEqual(stats.completedRequests, 1, 'Completed requests must be 1');
  assert.strictEqual(stats.successfulRequests, 1, 'Successful requests must be 1');
  assert.strictEqual(stats.failedRequests, 0);
  assert.deepStrictEqual(stats.methods, { POST: 1 }, 'Method distribution must only contain POST');
  assert.deepStrictEqual(stats.statusCodes, { '201': 1 }, 'Status codes must only contain 201');

  const endpoints = tracker.getEndpointStats();
  assert.ok('/new-post' in endpoints, 'New endpoint must be in endpoint stats');
  assert.ok(!('/old-get' in endpoints), 'Old endpoint must NOT be in endpoint stats');
});
