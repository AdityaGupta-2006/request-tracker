'use strict';

/**
 * In-memory, bounded metrics store for global and per-endpoint HTTP analytics.
 * Supports epoch-based statistics isolation across resets to handle concurrent in-flight requests.
 */
class MetricsStore {
  /**
   * @param {object} [options]
   * @param {number} [options.maxEndpoints=1000] - Hard cap on unique endpoint keys.
   * @param {number} [options.maxTrackedEndpoints=1000] - Alias for maxEndpoints.
   * @param {number} [options.maxSlowRequests=100] - Cap on stored slow request details.
   * @param {number} [options.slowThreshold=1000] - Latency threshold in ms for slow requests.
   */
  constructor(options = {}) {
    this.maxTrackedEndpoints = options.maxEndpoints || options.maxTrackedEndpoints || 1000;
    this.maxSlowRequests = options.maxSlowRequests || 100;
    this.slowThreshold = options.slowThreshold || 1000;
    this.epoch = 0;
    this.reset();
  }

  /**
   * Resets all tracked metrics to zero and advances the metrics epoch.
   */
  reset() {
    this.epoch++;
    this.totalRequests = 0;
    this.completedRequests = 0;
    this.abortedRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.slowRequests = 0;

    this.minResponseTime = null;
    this.maxResponseTime = null;
    this.totalResponseTime = 0;

    // HTTP method distribution: { GET: 10, POST: 2, ... }
    this.methods = Object.create(null);

    // HTTP status-code distribution: { "200": 8, "404": 2, ... }
    this.statusCodes = Object.create(null);

    // Map of normalizedEndpoint -> endpointStats
    this.endpoints = new Map();

    // Bounded ring-buffer of recent slow requests
    this.recentSlowRequests = [];
  }

  /**
   * Records the start of an incoming request in the current epoch.
   * @param {string} method
   * @returns {number} The current epoch ID
   */
  recordRequestStart(method) {
    this.totalRequests++;
    const normalizedMethod = (method || 'UNKNOWN').toUpperCase();
    this.methods[normalizedMethod] = (this.methods[normalizedMethod] || 0) + 1;
    return this.epoch;
  }

  /**
   * Records request completion or client abortion.
   * Discards requests from older epochs (started before the last reset) to prevent metric corruption.
   *
   * @param {object} params
   * @param {number} [params.epoch] - Epoch ID when the request started
   * @param {string} params.method - HTTP method
   * @param {string} params.endpoint - Normalized endpoint path
   * @param {number} params.statusCode - HTTP response status code
   * @param {number} params.durationMs - Elapsed time in milliseconds
   * @param {boolean} params.aborted - Whether the request was aborted prematurely
   * @returns {{ isSlow: boolean, ignored: boolean }}
   */
  recordResponse({ epoch, method, endpoint, statusCode, durationMs, aborted }) {
    // If request started before a reset occurred, ignore it to prevent corrupting new statistics
    if (typeof epoch === 'number' && epoch !== this.epoch) {
      return { isSlow: false, ignored: true };
    }

    const normalizedMethod = (method || 'UNKNOWN').toUpperCase();

    if (aborted) {
      this.abortedRequests++;
      this._recordEndpoint({ endpoint, aborted: true });
      return { isSlow: false, ignored: false };
    }

    this.completedRequests++;

    // Track status code distribution
    const codeKey = String(statusCode);
    this.statusCodes[codeKey] = (this.statusCodes[codeKey] || 0) + 1;

    // Track success vs failed status (200-399: success, 400-599: fail)
    if (statusCode >= 200 && statusCode < 400) {
      this.successfulRequests++;
    } else if (statusCode >= 400 && statusCode < 600) {
      this.failedRequests++;
    }

    // Response time calculations
    this.totalResponseTime += durationMs;
    if (this.minResponseTime === null || durationMs < this.minResponseTime) {
      this.minResponseTime = durationMs;
    }
    if (this.maxResponseTime === null || durationMs > this.maxResponseTime) {
      this.maxResponseTime = durationMs;
    }

    // Slow request classification
    const isSlow = durationMs >= this.slowThreshold;
    if (isSlow) {
      this.slowRequests++;
      if (this.recentSlowRequests.length >= this.maxSlowRequests) {
        this.recentSlowRequests.shift();
      }
      this.recentSlowRequests.push({
        method: normalizedMethod,
        endpoint: endpoint || '/',
        statusCode,
        durationMs,
        thresholdMs: this.slowThreshold,
        timestamp: new Date().toISOString()
      });
    }

    // Record per-endpoint statistics
    this._recordEndpoint({
      endpoint,
      statusCode,
      durationMs,
      aborted: false,
      isSlow
    });

    return { isSlow, ignored: false };
  }

  /**
   * Updates per-endpoint statistics.
   * @private
   */
  _recordEndpoint({ endpoint, statusCode, durationMs, aborted, isSlow = false }) {
    let key = endpoint || '/';

    // Bounded map protection against high cardinality attacks
    if (!this.endpoints.has(key)) {
      if (this.endpoints.size >= this.maxTrackedEndpoints) {
        key = '__overflow__';
      }
      if (!this.endpoints.has(key)) {
        this.endpoints.set(key, {
          totalRequests: 0,
          completedRequests: 0,
          abortedRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          slowRequests: 0,
          minResponseTime: null,
          maxResponseTime: null,
          totalResponseTime: 0
        });
      }
    }

    const stat = this.endpoints.get(key);
    stat.totalRequests++;

    if (aborted) {
      stat.abortedRequests++;
      return;
    }

    stat.completedRequests++;

    if (isSlow) {
      stat.slowRequests++;
    }

    if (statusCode >= 200 && statusCode < 400) {
      stat.successfulRequests++;
    } else if (statusCode >= 400 && statusCode < 600) {
      stat.failedRequests++;
    }

    stat.totalResponseTime += durationMs;
    if (stat.minResponseTime === null || durationMs < stat.minResponseTime) {
      stat.minResponseTime = durationMs;
    }
    if (stat.maxResponseTime === null || durationMs > stat.maxResponseTime) {
      stat.maxResponseTime = durationMs;
    }
  }

  /**
   * Returns a snapshot of global request metrics.
   * @returns {object}
   */
  getStats() {
    const avg = this.completedRequests > 0
      ? Math.round((this.totalResponseTime / this.completedRequests) * 100) / 100
      : 0;

    return {
      totalRequests: this.totalRequests,
      completedRequests: this.completedRequests,
      abortedRequests: this.abortedRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      slowRequests: this.slowRequests,
      averageResponseTime: avg,
      minResponseTime: this.minResponseTime !== null ? this.minResponseTime : 0,
      maxResponseTime: this.maxResponseTime !== null ? this.maxResponseTime : 0,
      methods: { ...this.methods },
      statusCodes: { ...this.statusCodes }
    };
  }

  /**
   * Returns per-endpoint analytics.
   *
   * @param {string} [endpoint] - Optional specific endpoint path
   * @returns {object|null} Map of endpoints or stats for a single endpoint
   */
  getEndpointStats(endpoint) {
    if (endpoint) {
      const stat = this.endpoints.get(endpoint);
      if (!stat) {
        return null;
      }
      return this._formatEndpointStat(stat);
    }

    const result = {};
    for (const [key, stat] of this.endpoints.entries()) {
      result[key] = this._formatEndpointStat(stat);
    }
    return result;
  }

  /**
   * Returns recent slow requests bounded by maxSlowRequests.
   * @returns {Array<object>}
   */
  getSlowRequests() {
    return this.recentSlowRequests.map((req) => ({ ...req }));
  }

  /**
   * Formats raw endpoint statistics for public consumption.
   * @private
   */
  _formatEndpointStat(stat) {
    const avg = stat.completedRequests > 0
      ? Math.round((stat.totalResponseTime / stat.completedRequests) * 100) / 100
      : 0;

    return {
      totalRequests: stat.totalRequests,
      successfulRequests: stat.successfulRequests,
      failedRequests: stat.failedRequests,
      abortedRequests: stat.abortedRequests,
      slowRequests: stat.slowRequests,
      averageResponseTime: avg,
      minResponseTime: stat.minResponseTime !== null ? stat.minResponseTime : 0,
      maxResponseTime: stat.maxResponseTime !== null ? stat.maxResponseTime : 0
    };
  }
}

module.exports = {
  MetricsStore
};
