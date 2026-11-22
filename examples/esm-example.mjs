import express from 'express';
import { createRequestTracker } from '../src/index.mjs';

const app = express();

const tracker = createRequestTracker({
  slowThreshold: 200,
  logRequests: true
});

app.use(tracker.middleware);

app.get('/items', (req, res) => {
  res.json({ items: ['book', 'pen'] });
});

app.get('/items/:id', (req, res) => {
  res.json({ id: req.params.id });
});

app.get('/stats', (req, res) => {
  res.json({
    metrics: tracker.getStats(),
    endpoints: tracker.getEndpointStats()
  });
});

export default app;
