'use strict';

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { createRequestTracker } = require('../..');

test('QA: tracks all standard HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)', async () => {
  const app = express();
  const tracker = createRequestTracker();

  app.use(tracker.middleware);

  app.get('/resource', (req, res) => res.status(200).send('get'));
  app.post('/resource', (req, res) => res.status(201).send('post'));
  app.put('/resource', (req, res) => res.status(200).send('put'));
  app.delete('/resource', (req, res) => res.status(204).send());
  app.patch('/resource', (req, res) => res.status(200).send('patch'));
  app.head('/resource', (req, res) => res.status(200).end());
  app.options('/resource', (req, res) => res.status(204).end());

  await request(app).get('/resource').expect(200);
  await request(app).post('/resource').expect(201);
  await request(app).put('/resource').expect(200);
  await request(app).delete('/resource').expect(204);
  await request(app).patch('/resource').expect(200);
  await request(app).head('/resource').expect(200);
  await request(app).options('/resource').expect(204);

  const stats = tracker.getStats();
  assert.strictEqual(stats.totalRequests, 7);
  assert.strictEqual(stats.completedRequests, 7);
  assert.strictEqual(stats.successfulRequests, 7);
  assert.strictEqual(stats.failedRequests, 0);

  assert.strictEqual(stats.methods.GET, 1);
  assert.strictEqual(stats.methods.POST, 1);
  assert.strictEqual(stats.methods.PUT, 1);
  assert.strictEqual(stats.methods.DELETE, 1);
  assert.strictEqual(stats.methods.PATCH, 1);
  assert.strictEqual(stats.methods.HEAD, 1);
  assert.strictEqual(stats.methods.OPTIONS, 1);
});

test('QA: accurately categorizes 2xx, 3xx, 4xx, and 5xx status codes', async () => {
  const app = express();
  const tracker = createRequestTracker();

  app.use(tracker.middleware);

  app.get('/s200', (req, res) => res.status(200).send('ok'));
  app.get('/s204', (req, res) => res.status(204).end());
  app.get('/s304', (req, res) => res.status(304).end());
  app.get('/c400', (req, res) => res.status(400).send('bad request'));
  app.get('/c401', (req, res) => res.status(401).send('unauthorized'));
  app.get('/c403', (req, res) => res.status(403).send('forbidden'));
  app.get('/c404', (req, res) => res.status(404).send('not found'));
  app.get('/c429', (req, res) => res.status(429).send('too many requests'));
  app.get('/e500', (req, res) => res.status(500).send('server error'));
  app.get('/e502', (req, res) => res.status(502).send('bad gateway'));
  app.get('/e503', (req, res) => res.status(503).send('service unavailable'));

  await request(app).get('/s200').expect(200);
  await request(app).get('/s204').expect(204);
  await request(app).get('/s304').expect(304);
  await request(app).get('/c400').expect(400);
  await request(app).get('/c401').expect(401);
  await request(app).get('/c403').expect(403);
  await request(app).get('/c404').expect(404);
  await request(app).get('/c429').expect(429);
  await request(app).get('/e500').expect(500);
  await request(app).get('/e502').expect(502);
  await request(app).get('/e503').expect(503);

  const stats = tracker.getStats();
  assert.strictEqual(stats.totalRequests, 11);
  assert.strictEqual(stats.completedRequests, 11);
  assert.strictEqual(stats.successfulRequests, 3); // 200, 204, 304
  assert.strictEqual(stats.failedRequests, 8);     // 400, 401, 403, 404, 429, 500, 502, 503

  assert.strictEqual(stats.statusCodes['200'], 1);
  assert.strictEqual(stats.statusCodes['204'], 1);
  assert.strictEqual(stats.statusCodes['304'], 1);
  assert.strictEqual(stats.statusCodes['400'], 1);
  assert.strictEqual(stats.statusCodes['401'], 1);
  assert.strictEqual(stats.statusCodes['403'], 1);
  assert.strictEqual(stats.statusCodes['404'], 1);
  assert.strictEqual(stats.statusCodes['429'], 1);
  assert.strictEqual(stats.statusCodes['500'], 1);
  assert.strictEqual(stats.statusCodes['502'], 1);
  assert.strictEqual(stats.statusCodes['503'], 1);
});

test('QA Regression: excludePaths with root "/" matches only "/" and does not exclude other routes', async () => {
  const app = express();
  const tracker = createRequestTracker({
    excludePaths: ['/']
  });

  app.use(tracker.middleware);

  app.get('/', (req, res) => res.send('home'));
  app.get('/users', (req, res) => res.send('users'));
  app.get('/users/:id', (req, res) => res.send('user'));

  await request(app).get('/').expect(200);
  await request(app).get('/users').expect(200);
  await request(app).get('/users/123').expect(200);

  const stats = tracker.getStats();
  // '/' was excluded, but /users and /users/123 should NOT have been excluded
  assert.strictEqual(stats.totalRequests, 2);
  assert.strictEqual(stats.completedRequests, 2);

  const endpoints = tracker.getEndpointStats();
  assert.ok(!('/' in endpoints));
  assert.ok('/users' in endpoints);
  assert.ok('/users/:id' in endpoints);
});

test('QA Regression: excludePaths with global /g RegExp matches consistently across multiple requests', async () => {
  const app = express();
  // A global regex retains state via lastIndex if not handled
  const statefulRegex = /\/skip/g;
  const tracker = createRequestTracker({
    excludePaths: [statefulRegex]
  });

  app.use(tracker.middleware);

  app.get('/skip/1', (req, res) => res.send('skip1'));
  app.get('/skip/2', (req, res) => res.send('skip2'));
  app.get('/skip/3', (req, res) => res.send('skip3'));
  app.get('/keep', (req, res) => res.send('keep'));

  await request(app).get('/skip/1').expect(200);
  await request(app).get('/skip/2').expect(200);
  await request(app).get('/skip/3').expect(200);
  await request(app).get('/keep').expect(200);

  const stats = tracker.getStats();
  // All three /skip routes should be consistently excluded
  assert.strictEqual(stats.totalRequests, 1);
  assert.strictEqual(stats.completedRequests, 1);

  const endpoints = tracker.getEndpointStats();
  assert.ok('/keep' in endpoints);
  assert.strictEqual(Object.keys(endpoints).length, 1);
});

test('QA: route defined as array of paths in Express is correctly resolved', async () => {
  const app = express();
  const tracker = createRequestTracker();

  app.use(tracker.middleware);

  app.get(['/routeA', '/routeB'], (req, res) => {
    res.send('ok');
  });

  await request(app).get('/routeA').expect(200);
  await request(app).get('/routeB').expect(200);

  const endpoints = tracker.getEndpointStats();
  assert.ok('/routeA' in endpoints);
  assert.ok('/routeB' in endpoints);
});

test('QA: Privacy & Security — sensitive headers, body, cookies, and tokens are never logged or stored', async () => {
  const loggedMessages = [];
  const captureLogger = {
    log: (msg) => loggedMessages.push(msg),
    info: (msg) => loggedMessages.push(msg),
    warn: (msg) => loggedMessages.push(msg)
  };

  const app = express();
  app.use(express.json());

  const tracker = createRequestTracker({
    logRequests: true,
    logger: captureLogger
  });

  app.use(tracker.middleware);

  app.post('/api/login', (req, res) => {
    res.json({ token: 'jwt-secret-xyz' });
  });

  await request(app)
    .post('/api/login?apiKey=SECRET_KEY_12345')
    .set('Authorization', 'Bearer super-secret-token')
    .set('Cookie', 'session=session-cookie-secret')
    .send({ username: 'alice', password: 'SuperSecretPassword!' })
    .expect(200);

  assert.strictEqual(loggedMessages.length, 1);
  const log = loggedMessages[0];

  // Verify log contains only method, endpoint, status, duration
  assert.ok(log.includes('POST'));
  assert.ok(log.includes('/api/login'));
  assert.ok(log.includes('200'));

  // Ensure NO sensitive data appears in logs
  assert.ok(!log.includes('SECRET_KEY_12345'));
  assert.ok(!log.includes('super-secret-token'));
  assert.ok(!log.includes('session-cookie-secret'));
  assert.ok(!log.includes('SuperSecretPassword!'));
  assert.ok(!log.includes('jwt-secret-xyz'));
  assert.ok(!log.includes('apiKey'));

  // Ensure endpoint stats do not have query string
  const endpointStats = tracker.getEndpointStats('/api/login');
  assert.ok(endpointStats);
  assert.strictEqual(endpointStats.totalRequests, 1);

  const allEndpoints = tracker.getEndpointStats();
  for (const key of Object.keys(allEndpoints)) {
    assert.ok(!key.includes('apiKey'), 'Endpoint key must never contain query parameters');
    assert.ok(!key.includes('SECRET_KEY'), 'Endpoint key must never contain query parameter values');
  }
});
