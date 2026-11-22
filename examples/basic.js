'use strict';

const express = require('express');
const { createRequestTracker } = require('..');

const app = express();

// Initialize tracker with Phase 3 configuration
const tracker = createRequestTracker({
  slowThreshold: 50, // Flag requests taking >= 50ms as slow
  logRequests: true,
  excludePaths: ['/health', '/metrics'],
  maxEndpoints: 500,
  maxSlowRequests: 100
});

// Event listeners
tracker.on('request', (data) => {
  // Safe event subscription
  // console.log('[Event: request]', data.method, data.endpoint, data.statusCode, data.durationMs + 'ms');
});

tracker.on('slowRequest', (data) => {
  console.log(`[Event: slowRequest] Detected slow request on ${data.endpoint}: ${data.durationMs}ms`);
});

// Attach tracking middleware early
app.use(tracker.middleware);

// Excluded endpoint (health check)
app.get('/health', (req, res) => {
  res.send('OK');
});

// Regular endpoint
app.get('/users', (req, res) => {
  res.json({ users: [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }] });
});

// Parameterized endpoint
app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id, name: `User ${req.params.id}` });
});

// Slow endpoint exceeding slowThreshold
app.get('/slow', (req, res) => {
  setTimeout(() => {
    res.json({ message: 'Delayed response' });
  }, 75);
});

// Error endpoint
app.get('/error', (req, res) => {
  res.status(500).json({ error: 'Server failure' });
});

// Endpoint to view metrics
app.get('/metrics', (req, res) => {
  res.json({
    global: tracker.getStats(),
    endpoints: tracker.getEndpointStats(),
    slowRequests: tracker.getSlowRequests()
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`ReqMetrics example app listening on http://localhost:${PORT}`);
    console.log(`Check http://localhost:${PORT}/metrics to inspect live stats.`);
  });
}

module.exports = app;
