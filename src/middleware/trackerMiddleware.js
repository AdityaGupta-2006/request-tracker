'use strict';

const { now, toMs } = require('../utils/time');
const { RECORDED_SYMBOL } = require('../utils/symbols');
const { normalizeRoute } = require('../core/routeNormalizer');

/**
 * Matches a string pattern against a request path.
 * - If pattern is '/', matches only the exact root path '/'.
 * - Otherwise matches exact path or prefix followed by '/'.
 *
 * @param {string} pattern
 * @param {string} path
 * @returns {boolean}
 */
function matchStringPath(pattern, path) {
  if (pattern === '/') {
    return path === '/';
  }
  const cleanPattern = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
  return path === cleanPattern || path.startsWith(cleanPattern + '/');
}

/**
 * Checks if a path matches any excluded path rule (exact, prefix, or RegExp).
 *
 * @param {string} path
 * @param {Array<string|RegExp>} excludePaths
 * @returns {boolean}
 */
function isPathExcluded(path, excludePaths) {
  if (!excludePaths || excludePaths.length === 0) {
    return false;
  }

  for (let i = 0; i < excludePaths.length; i++) {
    const pattern = excludePaths[i];
    if (typeof pattern === 'string') {
      if (matchStringPath(pattern, path)) {
        return true;
      }
    } else if (pattern instanceof RegExp) {
      // Reset stateful regex index to prevent alternating matches with /g flag
      pattern.lastIndex = 0;
      if (pattern.test(path)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Creates the Express tracking middleware.
 *
 * @param {import('../core/tracker').RequestTracker} tracker
 * @returns {Function} Express middleware (req, res, next)
 */
function createTrackerMiddleware(tracker) {
  const excludePaths = tracker._options.excludePaths;

  return function reqmetricsMiddleware(req, res, next) {
    // Determine raw path to evaluate path exclusion early
    const rawPath = (req.baseUrl || '') + (req.path || (req.url ? req.url.split(/[?#]/)[0] : '/'));

    if (isPathExcluded(rawPath, excludePaths)) {
      return next();
    }

    // Record start time using high-resolution monotonic timer
    const startNs = now();

    // Increment total requests and track method distribution, obtaining request epoch
    const epoch = tracker._store.recordRequestStart(req.method);

    let recorded = false;

    /**
     * Finalizes tracking for the request.
     * Guarded to guarantee strictly once execution.
     *
     * @param {boolean} aborted
     */
    function recordCompletion(aborted) {
      if (recorded || res[RECORDED_SYMBOL]) {
        return;
      }
      recorded = true;
      res[RECORDED_SYMBOL] = true;

      const durationMs = toMs(startNs);
      const endpoint = normalizeRoute(req);
      const statusCode = res.statusCode || 200;

      tracker._handleResponseCompleted({
        epoch,
        method: req.method,
        endpoint,
        statusCode,
        durationMs,
        aborted
      });
    }

    // Normal completion
    res.once('finish', () => {
      recordCompletion(false);
    });

    // Premature client disconnection / abort
    res.once('close', () => {
      if (!res.writableEnded) {
        recordCompletion(true);
      }
    });

    next();
  };
}

module.exports = {
  createTrackerMiddleware,
  isPathExcluded,
  matchStringPath
};
