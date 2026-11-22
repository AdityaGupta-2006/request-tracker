'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { normalizeRoute, sanitizePath } = require('../../src/core/routeNormalizer');

test('routeNormalizer: handles empty or root requests', () => {
  assert.strictEqual(normalizeRoute(null), '/');
  assert.strictEqual(normalizeRoute({}), '/');
  assert.strictEqual(normalizeRoute({ path: '/' }), '/');
});

test('routeNormalizer: prioritizes req.route.path when available', () => {
  const req = {
    baseUrl: '/api/v1',
    route: { path: '/users/:id' },
    originalUrl: '/api/v1/users/42?active=true'
  };

  assert.strictEqual(normalizeRoute(req), '/api/v1/users/:id');
});

test('routeNormalizer: handles baseUrl without route.path cleanly', () => {
  const req = {
    baseUrl: '',
    route: { path: '/health' }
  };

  assert.strictEqual(normalizeRoute(req), '/health');
});

test('routeNormalizer: cleans trailing slashes from matched routes', () => {
  const req = {
    baseUrl: '/api',
    route: { path: '/users/' }
  };

  assert.strictEqual(normalizeRoute(req), '/api/users');
});

test('routeNormalizer: fallback masks dynamic segments (UUID, ObjectId, Numeric)', () => {
  // Numeric ID
  assert.strictEqual(sanitizePath('/users/123'), '/users/:id');
  assert.strictEqual(sanitizePath('/users/123/posts/456'), '/users/:id/posts/:id');

  // UUID
  assert.strictEqual(
    sanitizePath('/orders/550e8400-e29b-41d4-a716-446655440000'),
    '/orders/:id'
  );

  // MongoDB ObjectId (24 hex characters)
  assert.strictEqual(
    sanitizePath('/items/507f1f77bcf86cd799439011'),
    '/items/:id'
  );
});

test('routeNormalizer: never includes query strings or hash fragments', () => {
  assert.strictEqual(
    sanitizePath('/search?q=nodejs&page=2#results'),
    '/search'
  );

  const req = {
    baseUrl: '',
    path: '/users/99',
    url: '/users/99?include=profile'
  };

  assert.strictEqual(normalizeRoute(req), '/users/:id');
});
