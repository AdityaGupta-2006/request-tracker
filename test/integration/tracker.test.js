'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const request = require('supertest');
const { createRequestTracker } = require('../..');

function createTestApp() {
  const app = express();
  const tracker = createRequestTracker();

  app.use(tracker.middleware);

  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });

  app.post('/items', (req, res) => {
    res.status(201).json({ id: 'item-1' });
  });

  app.get('/users/:id', (req, res) => {
    res.json({ id: req.params.id });
  });

  app.get('/fail-500', (req, res) => {
    res.status(500).send('Server Error');
  });

  app.get('/delayed', (req, res) => {
    setTimeout(() => {
      if (!res.writableEnded) {
        res.status(200).send('Delayed');
      }
    }, 100);
  });

  return { app, tracker };
}

test('Integration: tracks successful and failed requests accurately', async () => {
  const { app, tracker } = createTestApp();

  await request(app).get('/health').expect(200);
  await request(app).post('/items').expect(201);
  await request(app).get('/not-found').expect(404);
  await request(app).get('/fail-500').expect(500);

  const stats = tracker.getStats();

  assert.strictEqual(stats.totalRequests, 4);
  assert.strictEqual(stats.completedRequests, 4);
  assert.strictEqual(stats.abortedRequests, 0);
  assert.strictEqual(stats.successfulRequests, 2); // 200, 201
  assert.strictEqual(stats.failedRequests, 2);     // 404, 500

  assert.strictEqual(stats.methods.GET, 3);
  assert.strictEqual(stats.methods.POST, 1);

  assert.strictEqual(stats.statusCodes['200'], 1);
  assert.strictEqual(stats.statusCodes['201'], 1);
  assert.strictEqual(stats.statusCodes['404'], 1);
  assert.strictEqual(stats.statusCodes['500'], 1);

  assert.ok(stats.averageResponseTime >= 0);
  assert.ok(stats.minResponseTime >= 0);
  assert.ok(stats.maxResponseTime >= stats.minResponseTime);
});

test('Integration: groups dynamic routes and ignores query strings', async () => {
  const { app, tracker } = createTestApp();

  await request(app).get('/users/1').expect(200);
  await request(app).get('/users/2').expect(200);
  await request(app).get('/users/3?filter=active&sort=desc').expect(200);

  const stats = tracker.getStats();
  assert.strictEqual(stats.totalRequests, 3);
  assert.strictEqual(stats.successfulRequests, 3);

  const endpointStats = tracker.getEndpointStats('/users/:id');
  assert.ok(endpointStats, 'Dynamic route should be grouped under /users/:id');
  assert.strictEqual(endpointStats.totalRequests, 3);
  assert.strictEqual(endpointStats.successfulRequests, 3);
  assert.strictEqual(endpointStats.failedRequests, 0);

  // Verify query string is not recorded as a separate endpoint
  const allEndpoints = tracker.getEndpointStats();
  assert.strictEqual(Object.keys(allEndpoints).length, 1);
  assert.ok('/users/:id' in allEndpoints);
});

test('Integration: resetStats() clears all accumulated metrics', async () => {
  const { app, tracker } = createTestApp();

  await request(app).get('/health').expect(200);
  assert.strictEqual(tracker.getStats().totalRequests, 1);

  tracker.resetStats();

  const resetStats = tracker.getStats();
  assert.strictEqual(resetStats.totalRequests, 0);
  assert.strictEqual(resetStats.completedRequests, 0);
  assert.deepStrictEqual(tracker.getEndpointStats(), {});
});

test('Integration: handles client abortion without double counting or crashing', async () => {
  const { app, tracker } = createTestApp();
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  await new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/delayed`, () => {
      reject(new Error('Response should not have completed'));
    });

    req.on('error', () => {
      // Expected error on socket destroy
    });

    // Abort connection before server responds (delayed is 100ms)
    setTimeout(() => {
      req.destroy();
      // Allow server event loop to fire 'close' on res
      setTimeout(resolve, 50);
    }, 20);
  });

  server.close();

  const stats = tracker.getStats();
  assert.strictEqual(stats.totalRequests, 1);
  assert.strictEqual(stats.abortedRequests, 1);
  assert.strictEqual(stats.completedRequests, 0);
  assert.strictEqual(stats.successfulRequests, 0);
});
