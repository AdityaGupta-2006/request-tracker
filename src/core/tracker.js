'use strict';

const EventEmitter = require('node:events');
const { validateOptions } = require('../config/options');
const { MetricsStore } = require('./metricsStore');
const { RequestLogger } = require('../logger/logger');
const { createTrackerMiddleware } = require('../middleware/trackerMiddleware');

/**
 * RequestTracker coordinates middleware execution, metrics aggregation,
 * event emission, and logging.
 */
class RequestTracker extends EventEmitter {
  /**
   * @param {object} [userOptions]
   */
  constructor(userOptions = {}) {
    super();

    this._options = validateOptions(userOptions);
    this._store = new MetricsStore(this._options);
    this._logger = new RequestLogger(this._options.logger);
    this.middleware = createTrackerMiddleware(this);

    // Bind public methods so they can be destructured safely
    this.getStats = this.getStats.bind(this);
    this.getEndpointStats = this.getEndpointStats.bind(this);
    this.getSlowRequests = this.getSlowRequests.bind(this);
    this.resetStats = this.resetStats.bind(this);
  }

  /**
   * Internal hook called when a request completes or aborts.
   *
   * @param {object} params
   * @param {number} [params.epoch]
   * @param {string} params.method
   * @param {string} params.endpoint
   * @param {number} params.statusCode
   * @param {number} params.durationMs
   * @param {boolean} params.aborted
   * @internal
   */
  _handleResponseCompleted({ epoch, method, endpoint, statusCode, durationMs, aborted }) {
    // 1. Record into metrics store
    const { isSlow } = this._store.recordResponse({
      epoch,
      method,
      endpoint,
      statusCode,
      durationMs,
      aborted
    });

    // 2. Log if logging is enabled
    if (this._options.logRequests) {
      this._logger.logRequest({
        method,
        endpoint,
        statusCode,
        durationMs,
        isSlow,
        thresholdMs: this._options.slowThreshold,
        aborted
      });
    }

    // 3. Emit 'request' event safely
    this._safeEmit('request', {
      method,
      endpoint,
      statusCode,
      durationMs,
      completed: !aborted,
      aborted,
      isSlow
    });

    // 4. Emit 'slowRequest' event safely if slow
    if (isSlow && !aborted) {
      this._safeEmit('slowRequest', {
        method,
        endpoint,
        statusCode,
        durationMs,
        thresholdMs: this._options.slowThreshold
      });
    }
  }

  /**
   * Safely invokes listeners so that faulty listeners cannot crash the host app.
   *
   * @param {string} event
   * @param {*} data
   * @private
   */
  _safeEmit(event, data) {
    try {
      const listeners = this.rawListeners(event);
      for (let i = 0; i < listeners.length; i++) {
        try {
          listeners[i].call(this, data);
        } catch (_) {
          // Faulty user listener threw: isolate and suppress so server doesn't crash
        }
      }
    } catch (_) {
      // Suppress any emitter failure
    }
  }

  /**
   * Returns global request metrics.
   * @returns {object}
   */
  getStats() {
    return this._store.getStats();
  }

  /**
   * Returns per-endpoint analytics.
   * @param {string} [endpoint]
   * @returns {object|null}
   */
  getEndpointStats(endpoint) {
    return this._store.getEndpointStats(endpoint);
  }

  /**
   * Returns recent slow requests bounded by maxSlowRequests.
   * @returns {Array<object>}
   */
  getSlowRequests() {
    return this._store.getSlowRequests();
  }

  /**
   * Resets all accumulated statistics and history.
   */
  resetStats() {
    this._store.reset();
  }
}

/**
 * Factory function to create a new RequestTracker instance.
 *
 * @param {object} [options]
 * @returns {RequestTracker}
 */
function createRequestTracker(options) {
  return new RequestTracker(options);
}

module.exports = {
  RequestTracker,
  createRequestTracker
};
