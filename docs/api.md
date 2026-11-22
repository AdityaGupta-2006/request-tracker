# ReqMetrics API Reference

`reqmetrics` is a lightweight Express middleware package for request tracking, latency measurement, and endpoint analytics.

---

## Installation

```bash
npm install reqmetrics
```

---

## Factory: `createRequestTracker(options)`

Initializes and returns a new `RequestTracker` instance.

```javascript
const { createRequestTracker } = require("reqmetrics");

const tracker = createRequestTracker({
  slowThreshold: 1000,
  logRequests: false
});
```

### Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `slowThreshold` | `number` | `1000` | Latency threshold in milliseconds. Requests taking $\ge$ this value are flagged as slow. |
| `logRequests` | `boolean` | `false` | When `true`, logs completed and aborted requests to the logger. |
| `excludePaths` | `Array<string \| RegExp>` | `[]` | List of routes to ignore. Supports exact match, prefix match, and RegExp patterns. |
| `maxEndpoints` | `number` | `1000` | Maximum number of unique route paths tracked. Prevents memory leaks from dynamic route attacks. |
| `maxSlowRequests` | `number` | `100` | Maximum number of recent slow request records retained in the circular buffer. |
| `logger` | `object \| function` | `console` | Custom logging destination. Must be a function or an object with `.log()`, `.info()`, or `.warn()`. |

---

## Instance Methods

### `tracker.middleware`

Express middleware function `(req, res, next)`.

Mount this early in your middleware chain to capture full request lifecycles.

```javascript
app.use(tracker.middleware);
```

### `tracker.getStats()`

Returns a snapshot of global request metrics.

```javascript
const stats = tracker.getStats();
```

**Returns:**

```json
{
  "totalRequests": 120,
  "completedRequests": 118,
  "abortedRequests": 2,
  "successfulRequests": 110,
  "failedRequests": 8,
  "slowRequests": 5,
  "averageResponseTime": 14.85,
  "minResponseTime": 2.10,
  "maxResponseTime": 1250.40,
  "methods": {
    "GET": 95,
    "POST": 25
  },
  "statusCodes": {
    "200": 105,
    "201": 5,
    "404": 6,
    "500": 2
  }
}
```

### `tracker.getEndpointStats([endpoint])`

Returns per-endpoint analytics.

- When `endpoint` is provided: returns statistics for that specific endpoint, or `null` if not found.
- When `endpoint` is omitted: returns a map of all tracked endpoints.

```javascript
const allEndpoints = tracker.getEndpointStats();
const userEndpoint = tracker.getEndpointStats("/users/:id");
```

**Returns:**

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

### `tracker.getSlowRequests()`

Returns an array of recent slow requests up to `maxSlowRequests`.

```javascript
const slowRequests = tracker.getSlowRequests();
```

**Returns:**

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

### `tracker.resetStats()`

Resets all tracked metrics, endpoint counters, and slow request history back to zero.

```javascript
tracker.resetStats();
```

#### Reset Semantics
ReqMetrics uses epoch-based isolation for in-flight requests:
- Statistics are reset immediately.
- Requests started *after* `resetStats()` are counted normally in the new statistics epoch.
- Requests that started *before* `resetStats()` are excluded from the new statistics, even if they complete afterward.
- Their normal request lifecycle events (`'request'`) and optional logging may still occur upon response completion.

---

## Events

The `RequestTracker` instance extends Node.js `EventEmitter`.

### Event: `'request'`

Fires upon request completion or client abort.

```javascript
tracker.on("request", (data) => {
  console.log(data);
});
```

**Payload:**

```typescript
interface RequestEventData {
  method: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
  completed: boolean;
  aborted: boolean;
  isSlow: boolean;
}
```

### Event: `'slowRequest'`

Fires when a completed request exceeds `slowThreshold`.

```javascript
tracker.on("slowRequest", (data) => {
  console.warn(`Slow request detected on ${data.endpoint}: ${data.durationMs}ms`);
});
```

**Payload:**

```typescript
interface SlowRequestEventData {
  method: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
  thresholdMs: number;
}
```
