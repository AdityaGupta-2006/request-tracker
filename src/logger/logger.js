'use strict';

/**
 * Safe logger for request monitoring.
 * Logs strictly HTTP method, endpoint, status code, and duration.
 * Never accesses or logs request bodies, headers, auth tokens, or cookies.
 */
class RequestLogger {
  /**
   * @param {object|Function} loggerInstance - Console, custom logger object, or logging function.
   */
  constructor(loggerInstance) {
    this._logger = loggerInstance;
  }

  /**
   * Logs a request completion summary safely.
   *
   * @param {object} params
   * @param {string} params.method
   * @param {string} params.endpoint
   * @param {number} params.statusCode
   * @param {number} params.durationMs
   * @param {boolean} params.isSlow
   * @param {number} [params.thresholdMs]
   * @param {boolean} [params.aborted]
   */
  logRequest({ method, endpoint, statusCode, durationMs, isSlow, thresholdMs, aborted }) {
    try {
      if (aborted) {
        const msg = `[ReqMetrics] [ABORTED] ${method} ${endpoint} - ${durationMs}ms`;
        this._write(msg, 'warn');
        return;
      }

      if (isSlow) {
        const msg = `[ReqMetrics] [SLOW] ${method} ${endpoint} ${statusCode} - ${durationMs}ms (threshold: ${thresholdMs}ms)`;
        this._write(msg, 'warn');
        return;
      }

      const msg = `[ReqMetrics] ${method} ${endpoint} ${statusCode} - ${durationMs}ms`;
      this._write(msg, 'info');
    } catch (_) {
      // Faulty custom loggers must never crash the host application
    }
  }

  /**
   * Dispatches formatted message to appropriate logger method with safety fallback.
   * @private
   */
  _write(message, level) {
    try {
      if (typeof this._logger === 'function') {
        this._logger(message);
        return;
      }

      if (level === 'warn' && typeof this._logger.warn === 'function') {
        this._logger.warn(message);
        return;
      }

      if (typeof this._logger.info === 'function') {
        this._logger.info(message);
        return;
      }

      if (typeof this._logger.log === 'function') {
        this._logger.log(message);
        return;
      }

      if (typeof this._logger.warn === 'function') {
        this._logger.warn(message);
      }
    } catch (_) {
      // Suppress logging failures
    }
  }
}

module.exports = {
  RequestLogger
};
