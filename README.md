# ReqMetrics

Lightweight Express middleware for API request tracking, response-time monitoring, and endpoint analytics.

---

## Features

- **Accurate Timing**: Nanosecond monotonic response-time measurements via `process.hrtime.bigint()`.
- **Dynamic Route Grouping**: Automatically groups parameterized routes (e.g. `/users/1` and `/users/2` into `/users/:id`).
- **Slow Request Detection**: Flags and retains records for requests exceeding configurable thresholds.
- **Endpoint Analytics**: Per-endpoint request totals, success/failure counts, aborted requests, slow requests, and latency metrics.
- **Event-Driven**: Extends Node.js `EventEmitter` with safe event dispatching for `'request'` and `'slowRequest'`.
- **Zero Runtime Dependencies**: Built entirely with native Node.js core primitives.
- **Safe by Design**: Never logs request bodies, auth headers, or cookies. Guards against memory exhaustion via bounded collections.
- **Dual Module Support**: Full support for both CommonJS (`require`) and ES Modules (`import`).
- **TypeScript Support**: Complete TypeScript definitions (`.d.ts`) included out of the box.

---

## Requirements

- **Node.js**: `>=18.0.0`
- **Express**: Express `4.x` and Express `5.x`

---

## Installation

```bash
npm install reqmetrics
```

---

## Quick Start

### CommonJS

```javascript
const express = require("express");
const { createRequestTracker } = require("reqmetrics");

const app = express();
const tracker = createRequestTracker({
  slowThreshold: 1000,
  logRequests: true
});

// Attach middleware early
app.use(tracker.middleware);

app.get("/users/:id", (req, res) => {
  res.json({ id: req.params.id });
});

app.get("/metrics", (req, res) => {
  res.json({
    global: tracker.getStats(),
    endpoints: tracker.getEndpointStats()
  });
});

app.listen(3000);
```

### ES Modules (ESM)

```javascript
import express from "express";
import { createRequestTracker } from "reqmetrics";

const app = express();
const tracker = createRequestTracker({
  slowThreshold: 500,
  logRequests: true
});

app.use(tracker.middleware);

app.get("/products/:id", (req, res) => {
  res.json({ id: req.params.id });
});

app.listen(3000);
```

---

## Configuration Options

Pass configuration options to `createRequestTracker(options)`:

```javascript
const tracker = createRequestTracker({
  slowThreshold: 1000,
  logRequests: true,
  excludePaths: ["/health", "/metrics", /^\/static\//],
  maxEndpoints: 500,
  maxSlowRequests: 100,
  logger: console
});
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `slowThreshold` | `number` | `1000` | Latency threshold in milliseconds. Requests taking $\ge$ this value are flagged as slow. |
| `logRequests` | `boolean` | `false` | When `true`, logs completed and aborted requests to the logger. |
| `excludePaths` | `Array<string \| RegExp>` | `[]` | List of routes to ignore from tracking (supports exact, prefix, or regex matching). |
| `maxEndpoints` | `number` | `1000` | Maximum number of unique route paths stored. Excess endpoints are grouped into an overflow bucket. |
| `maxSlowRequests` | `number` | `100` | Maximum number of recent slow requests kept in the circular buffer. |
| `logger` | `object \| function` | `console` | Custom logger function or object with `.log()`, `.info()`, or `.warn()` methods. |

---

## Statistics API

### Global Metrics: `tracker.getStats()`

Returns aggregated totals across all processed requests:

```javascript
const stats = tracker.getStats();
```

**Example Output:**

```json
{
  "totalRequests": 105,
  "completedRequests": 104,
  "abortedRequests": 1,
  "successfulRequests": 98,
  "failedRequests": 6,
  "slowRequests": 3,
  "averageResponseTime": 14.85,
  "minResponseTime": 2.10,
  "maxResponseTime": 1250.40,
  "methods": {
    "GET": 85,
    "POST": 20
  },
  "statusCodes": {
    "200": 95,
    "201": 3,
    "404": 4,
    "500": 2
  }
}
```

### Endpoint Analytics: `tracker.getEndpointStats([endpoint])`

Returns metrics partitioned by route template. Dynamic segments (e.g. `:id`) are automatically grouped together, and query strings are never included.

```javascript
// Get all endpoints
const endpoints = tracker.getEndpointStats();

// Get a specific endpoint
const userStats = tracker.getEndpointStats("/users/:id");
```

**Example Output:**

```json
{
  "totalRequests": 45,
  "successfulRequests": 42,
  "failedRequests": 3,
  "abortedRequests": 0,
  "slowRequests": 1,
  "averageResponseTime": 18.20,
  "minResponseTime": 4.50,
  "maxResponseTime": 240.10
}
```

### Recent Slow Requests: `tracker.getSlowRequests()`

Returns an array of recent slow request records:

```javascript
const slowRequests = tracker.getSlowRequests();
```

**Example Output:**

```json
[
  {
    "method": "POST",
    "endpoint": "/checkout",
    "statusCode": 201,
    "durationMs": 1450.25,
    "thresholdMs": 1000,
    "timestamp": "2026-11-22T14:30:00.000Z"
  }
]
```

### Reset Statistics: `tracker.resetStats()`

Resets all accumulated metrics, endpoint analytics, and slow request history back to zero:

```javascript
tracker.resetStats();
```

#### Reset Semantics
ReqMetrics uses epoch-based isolation to handle concurrent in-flight requests during a reset:
- Statistics are reset to zero immediately.
- Requests started *after* `resetStats()` are counted normally.
- Requests that started *before* `resetStats()` are excluded from the new statistics, even if they complete afterward, ensuring pre-reset requests do not corrupt post-reset metrics or method distributions.
- Normal request lifecycle events (`'request'`) and optional logging for pre-reset requests may still occur upon response completion.

---

## Event Handling

`RequestTracker` extends Node.js `EventEmitter`. Listener exceptions are safely isolated so that faulty consumer code cannot crash your Express server.

### Listening to Requests

```javascript
tracker.on("request", (data) => {
  // data: { method, endpoint, statusCode, durationMs, completed, aborted, isSlow }
});
```

### Listening to Slow Requests

```javascript
tracker.on("slowRequest", (data) => {
  console.warn(`Slow request on ${data.endpoint} took ${data.durationMs}ms`);
});
```

---

## Privacy and Security

- **No Sensitive Data**: ReqMetrics only collects HTTP methods, normalized endpoints, status codes, and durations.
- **Zero Inspection**: Request bodies, cookies, authorization headers, and API keys are never read or stored.
- **Bounded In-Memory Structures**: Endpoint storage is capped at `maxEndpoints` (default 1,000) and slow requests at `maxSlowRequests` (default 100) to prevent memory exhaustion from route-scanning or denial-of-service attempts.

---

## Limitations

- **In-Memory Storage**: Metrics are stored locally in the Node.js process memory. In multi-process clustering or serverless environments, each worker maintains its own metric state.
- **Streaming Lifecycles**: Durations reflect total server response time up to socket completion.

---

## Contributing

Contributions, bug reports, and suggestions are welcome. Please open an issue or submit a pull request on GitHub at:

https://github.com/AdityaGupta-2006/reqmetrics

---

## License

MIT
