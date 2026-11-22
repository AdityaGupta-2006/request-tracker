import { EventEmitter } from 'node:events';

/**
 * Configuration options for ReqMetrics request tracker.
 */
export interface ReqMetricsOptions {
  /**
   * Latency threshold in milliseconds above which a request is marked as slow.
   * @default 1000
   */
  slowThreshold?: number;

  /**
   * Whether to log each completed request to the console or custom logger.
   * @default false
   */
  logRequests?: boolean;

  /**
   * Array of route paths or RegExps to exclude from metric tracking.
   * Supports exact string match, prefix match, and RegExp patterns.
   * @default []
   * @example ['/health', '/metrics', /^\/static\//]
   */
  excludePaths?: Array<string | RegExp>;

  /**
   * Maximum number of unique endpoint paths tracked in memory before overflow.
   * Guards against high-cardinality memory leaks.
   * @default 1000
   */
  maxEndpoints?: number;

  /**
   * Maximum number of recent slow requests to retain in the ring buffer.
   * @default 100
   */
  maxSlowRequests?: number;

  /**
   * Custom logger function or logger object with .log(), .info(), and .warn() methods.
   * @default console
   */
  logger?:
    | {
        log?: (...args: any[]) => void;
        info?: (...args: any[]) => void;
        warn?: (...args: any[]) => void;
        error?: (...args: any[]) => void;
      }
    | ((message: string) => void);
}

/**
 * Convenient alias for ReqMetricsOptions.
 */
export type RequestTrackerOptions = ReqMetricsOptions;

/**
 * Global API metrics snapshot.
 */
export interface GlobalStats {
  totalRequests: number;
  completedRequests: number;
  abortedRequests: number;
  successfulRequests: number;
  failedRequests: number;
  slowRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  methods: Record<string, number>;
  statusCodes: Record<string, number>;
}

export type GlobalMetrics = GlobalStats;

/**
 * Statistics for an individual normalized endpoint.
 */
export interface EndpointStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  abortedRequests: number;
  slowRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
}

export type EndpointMetrics = EndpointStats;

/**
 * Map of normalized endpoint paths to their respective statistics.
 */
export type EndpointStatsMap = Record<string, EndpointStats>;

/**
 * Detailed record for an individual slow request.
 */
export interface SlowRequestRecord {
  method: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
  thresholdMs: number;
  timestamp: string;
}

/**
 * Event payload emitted on the 'request' event.
 */
export interface RequestEventData {
  method: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
  completed: boolean;
  aborted: boolean;
  isSlow: boolean;
}

/**
 * Event payload emitted on the 'slowRequest' event.
 */
export interface SlowRequestEventData {
  method: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
  thresholdMs: number;
}

/**
 * Standard Express middleware function signature.
 */
export type ExpressMiddleware = (
  req: any,
  res: any,
  next: (err?: any) => void
) => void;

/**
 * RequestTracker class coordinating middleware, metrics storage, and events.
 */
export class RequestTracker extends EventEmitter {
  constructor(options?: ReqMetricsOptions);

  /**
   * Express middleware function to attach to the Express application.
   * @example
   * app.use(tracker.middleware);
   */
  middleware: ExpressMiddleware;

  /**
   * Returns a snapshot of global request metrics.
   */
  getStats(): GlobalStats;

  /**
   * Returns per-endpoint statistics.
   * If an endpoint is provided, returns stats for that endpoint or null.
   * If omitted, returns a map of all tracked endpoints.
   */
  getEndpointStats(): EndpointStatsMap;
  getEndpointStats(endpoint: string): EndpointStats | null;

  /**
   * Returns recent slow requests bounded by maxSlowRequests.
   */
  getSlowRequests(): SlowRequestRecord[];

  /**
   * Resets all tracked statistics and history to zero.
   */
  resetStats(): void;

  // Strongly typed EventEmitter overloads
  on(event: 'request', listener: (data: RequestEventData) => void): this;
  on(event: 'slowRequest', listener: (data: SlowRequestEventData) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once(event: 'request', listener: (data: RequestEventData) => void): this;
  once(event: 'slowRequest', listener: (data: SlowRequestEventData) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;

  emit(event: 'request', data: RequestEventData): boolean;
  emit(event: 'slowRequest', data: SlowRequestEventData): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;
}

/**
 * Factory function to create and configure a new RequestTracker instance.
 *
 * @param options - Optional configuration options.
 * @returns A new RequestTracker instance.
 *
 * @example
 * ```javascript
 * const { createRequestTracker } = require('reqmetrics');
 * const tracker = createRequestTracker({ slowThreshold: 1000 });
 * app.use(tracker.middleware);
 * ```
 */
export function createRequestTracker(options?: ReqMetricsOptions): RequestTracker;

export default createRequestTracker;
