'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { MetricsStore } = require('../../src/core/metricsStore');

test('MetricsStore: starts with zeroed initial state', () => {
  const store = new MetricsStore();
  const stats = store.getStats();

  assert.strictEqual(stats.totalRequests, 0);
  assert.strictEqual(stats.completedRequests, 0);
  assert.strictEqual(stats.abortedRequests, 0);
  assert.strictEqual(stats.successfulRequests, 0);
  assert.strictEqual(stats.failedRequests, 0);
  assert.strictEqual(stats.slowRequests, 0);
  assert.strictEqual(stats.averageResponseTime, 0);
  assert.strictEqual(stats.minResponseTime, 0);
  assert.strictEqual(stats.maxResponseTime, 0);
  assert.deepStrictEqual(stats.methods, {});
  assert.deepStrictEqual(stats.statusCodes, {});
  assert.deepStrictEqual(store.getEndpointStats(), {});
  assert.deepStrictEqual(store.getSlowRequests(), []);
});

test('MetricsStore: tracks requests, response times, and method/status distribution', () => {
  const store = new MetricsStore();

  store.recordRequestStart('GET');
  store.recordResponse({
    method: 'GET',
    endpoint: '/users',
    statusCode: 200,
    durationMs: 10,
    aborted: false
  });

  store.recordRequestStart('POST');
  store.recordResponse({
    method: 'POST',
    endpoint: '/users',
    statusCode: 201,
    durationMs: 30,
    aborted: false
  });

  store.recordRequestStart('GET');
  store.recordResponse({
    method: 'GET',
    endpoint: '/users/:id',
    statusCode: 404,
    durationMs: 20,
    aborted: false
  });

  const stats = store.getStats();
  assert.strictEqual(stats.totalRequests, 3);
  assert.strictEqual(stats.completedRequests, 3);
  assert.strictEqual(stats.abortedRequests, 0);
  assert.strictEqual(stats.successfulRequests, 2); // 200, 201
  assert.strictEqual(stats.failedRequests, 1);     // 404
  assert.strictEqual(stats.slowRequests, 0);
  assert.strictEqual(stats.minResponseTime, 10);
  assert.strictEqual(stats.maxResponseTime, 30);
  assert.strictEqual(stats.averageResponseTime, 20); // (10 + 30 + 20) / 3

  assert.deepStrictEqual(stats.methods, { GET: 2, POST: 1 });
  assert.deepStrictEqual(stats.statusCodes, { '200': 1, '201': 1, '404': 1 });

  // Endpoint stats
  const usersStats = store.getEndpointStats('/users');
  assert.ok(usersStats);
  assert.strictEqual(usersStats.totalRequests, 2);
  assert.strictEqual(usersStats.successfulRequests, 2);
  assert.strictEqual(usersStats.failedRequests, 0);
  assert.strictEqual(usersStats.slowRequests, 0);
  assert.strictEqual(usersStats.averageResponseTime, 20); // (10 + 30) / 2
});

test('MetricsStore: tracks slow requests and bounds recent slow history', () => {
  const store = new MetricsStore({
    slowThreshold: 50,
    maxSlowRequests: 2
  });

  // Fast request
  store.recordRequestStart('GET');
  store.recordResponse({ method: 'GET', endpoint: '/fast', statusCode: 200, durationMs: 20, aborted: false });

  // Slow request 1
  store.recordRequestStart('GET');
  store.recordResponse({ method: 'GET', endpoint: '/slow1', statusCode: 200, durationMs: 60, aborted: false });

  // Slow request 2
  store.recordRequestStart('POST');
  store.recordResponse({ method: 'POST', endpoint: '/slow2', statusCode: 201, durationMs: 80, aborted: false });

  // Slow request 3 (should evict slow1 because maxSlowRequests is 2)
  store.recordRequestStart('GET');
  store.recordResponse({ method: 'GET', endpoint: '/slow3', statusCode: 200, durationMs: 100, aborted: false });

  const stats = store.getStats();
  assert.strictEqual(stats.totalRequests, 4);
  assert.strictEqual(stats.slowRequests, 3);

  const slowList = store.getSlowRequests();
  assert.strictEqual(slowList.length, 2);
  assert.strictEqual(slowList[0].endpoint, '/slow2');
  assert.strictEqual(slowList[1].endpoint, '/slow3');

  const slowEndpointStat = store.getEndpointStats('/slow2');
  assert.strictEqual(slowEndpointStat.slowRequests, 1);
});

test('MetricsStore: tracks aborted requests separately', () => {
  const store = new MetricsStore();

  store.recordRequestStart('GET');
  store.recordResponse({
    method: 'GET',
    endpoint: '/stream',
    statusCode: 200,
    durationMs: 50,
    aborted: true
  });

  const stats = store.getStats();
  assert.strictEqual(stats.totalRequests, 1);
  assert.strictEqual(stats.completedRequests, 0);
  assert.strictEqual(stats.abortedRequests, 1);
  assert.strictEqual(stats.successfulRequests, 0);
  assert.strictEqual(stats.failedRequests, 0);
  assert.strictEqual(stats.averageResponseTime, 0);
  assert.strictEqual(stats.minResponseTime, 0);
  assert.strictEqual(stats.maxResponseTime, 0);

  const endpointStats = store.getEndpointStats('/stream');
  assert.strictEqual(endpointStats.totalRequests, 1);
  assert.strictEqual(endpointStats.abortedRequests, 1);
  assert.strictEqual(endpointStats.successfulRequests, 0);
});

test('MetricsStore: bounds tracked endpoints to maxTrackedEndpoints', () => {
  const store = new MetricsStore({ maxEndpoints: 2 });

  store.recordRequestStart('GET');
  store.recordResponse({ method: 'GET', endpoint: '/ep1', statusCode: 200, durationMs: 5, aborted: false });

  store.recordRequestStart('GET');
  store.recordResponse({ method: 'GET', endpoint: '/ep2', statusCode: 200, durationMs: 5, aborted: false });

  store.recordRequestStart('GET');
  store.recordResponse({ method: 'GET', endpoint: '/ep3', statusCode: 200, durationMs: 5, aborted: false });

  const allEndpoints = store.getEndpointStats();
  assert.ok('/ep1' in allEndpoints);
  assert.ok('/ep2' in allEndpoints);
  assert.ok(!('/ep3' in allEndpoints));
  assert.ok('__overflow__' in allEndpoints);
  assert.strictEqual(allEndpoints['__overflow__'].totalRequests, 1);
});

test('MetricsStore: handles in-flight request completion after reset() by ignoring pre-reset requests', () => {
  const store = new MetricsStore();

  // Requests started before reset
  const epoch1 = store.recordRequestStart('GET');
  const epoch2 = store.recordRequestStart('POST');

  // Stats reset in-flight
  store.reset();

  // Completed request completes after reset with old epoch
  store.recordResponse({ epoch: epoch1, method: 'GET', endpoint: '/delayed', statusCode: 200, durationMs: 50, aborted: false });

  // Aborted request completes after reset with old epoch
  store.recordResponse({ epoch: epoch2, method: 'POST', endpoint: '/aborted', statusCode: 0, durationMs: 25, aborted: true });

  const stats = store.getStats();
  assert.strictEqual(stats.completedRequests, 0);
  assert.strictEqual(stats.abortedRequests, 0);
  assert.strictEqual(stats.totalRequests, 0);
  assert.deepStrictEqual(stats.methods, {});
  assert.deepStrictEqual(stats.statusCodes, {});
});

test('MetricsStore: reset() clears all stats', () => {
  const store = new MetricsStore();
  store.recordRequestStart('GET');
  store.recordResponse({ method: 'GET', endpoint: '/test', statusCode: 200, durationMs: 10, aborted: false });

  store.reset();
  const stats = store.getStats();
  assert.strictEqual(stats.totalRequests, 0);
  assert.strictEqual(stats.completedRequests, 0);
  assert.deepStrictEqual(store.getEndpointStats(), {});
  assert.deepStrictEqual(store.getSlowRequests(), []);
});
