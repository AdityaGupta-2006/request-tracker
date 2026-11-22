'use strict';

const test = require('node:test');
const assert = require('node:assert');
const express5 = require('express5');
const request = require('supertest');
const { createRequestTracker } = require('../..');

test('Express 5 Compatibility: tracks requests, status codes, and methods', async () => {
  const app = express5();
  const tracker = createRequestTracker({
    slowThreshold: 50
  });

  app.use(tracker.middleware);

  app.get('/api/v1/ping', (req, res) => {
    res.status(200).send('pong');
  });

  app.post('/api/v1/items', (req, res) => {
    res.status(201).json({ created: true });
  });

  app.get('/api/v1/users/:id', (req, res) => {
    res.json({ id: req.params.id });
  });

  app.get('/api/v1/error', (req, res, next) => {
    next(new Error('Express 5 route error'));
  });

  // Express 5 error handling
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(500).json({ error: err.message });
  });

  // Execute requests
  await request(app).get('/api/v1/ping').expect(200);
  await request(app).post('/api/v1/items').expect(201);
  await request(app).get('/api/v1/users/42?active=true').expect(200);
  await request(app).get('/api/v1/users/99').expect(200);
  await request(app).get('/api/v1/not-found').expect(404);
  await request(app).get('/api/v1/error').expect(500);

  const stats = tracker.getStats();
  assert.strictEqual(stats.totalRequests, 6);
  assert.strictEqual(stats.completedRequests, 6);
  assert.strictEqual(stats.abortedRequests, 0);
  assert.strictEqual(stats.successfulRequests, 4); // 200, 201, 200, 200
  assert.strictEqual(stats.failedRequests, 2);     // 404, 500

  assert.strictEqual(stats.methods.GET, 5);
  assert.strictEqual(stats.methods.POST, 1);

  assert.strictEqual(stats.statusCodes['200'], 3);
  assert.strictEqual(stats.statusCodes['201'], 1);
  assert.strictEqual(stats.statusCodes['404'], 1);
  assert.strictEqual(stats.statusCodes['500'], 1);

  // Endpoint grouping verification in Express 5
  const userEndpointStats = tracker.getEndpointStats('/api/v1/users/:id');
  assert.ok(userEndpointStats, 'Express 5 should group dynamic routes under /api/v1/users/:id');
  assert.strictEqual(userEndpointStats.totalRequests, 2);
  assert.strictEqual(userEndpointStats.successfulRequests, 2);
});
