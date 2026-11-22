'use strict';

// UUID pattern (v1 to v5)
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

// MongoDB 24-character hex ObjectId
const MONGO_OBJECTID_REGEX = /\b[0-9a-f]{24}\b/gi;

// Numeric path segment e.g. /123/ or /123 at the end of path
const NUMERIC_SEGMENT_REGEX = /\/\d+(?=\/|$)/g;

/**
 * Normalizes a raw URL path to mask dynamic parameter segments.
 * Query strings are never included.
 *
 * @param {string} rawPath
 * @returns {string}
 */
function sanitizePath(rawPath) {
  if (!rawPath || rawPath === '/') {
    return '/';
  }

  // Strip any query string or hash fragment defensively
  let cleanPath = rawPath.split(/[?#]/)[0];

  // Collapse multiple consecutive slashes
  cleanPath = cleanPath.replace(/\/+/g, '/');

  // Replace UUIDs with :id
  cleanPath = cleanPath.replace(UUID_REGEX, ':id');

  // Replace MongoDB ObjectIDs with :id
  cleanPath = cleanPath.replace(MONGO_OBJECTID_REGEX, ':id');

  // Replace numeric segments with :id
  cleanPath = cleanPath.replace(NUMERIC_SEGMENT_REGEX, '/:id');

  // Ensure path starts with /
  if (!cleanPath.startsWith('/')) {
    cleanPath = '/' + cleanPath;
  }

  // Remove trailing slash if path is longer than 1 character
  if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
    cleanPath = cleanPath.slice(0, -1);
  }

  return cleanPath;
}

/**
 * Extracts and normalizes the endpoint route from an Express request.
 *
 * If Express matched a route (req.route), uses baseUrl + req.route.path.
 * Otherwise, falls back to path sanitization (masking IDs).
 *
 * @param {object} req - Express request object
 * @returns {string} Normalized endpoint path
 */
function normalizeRoute(req) {
  if (!req) {
    return '/';
  }

  const baseUrl = req.baseUrl || '';

  // If Express matched a route definition, prioritize req.route.path
  if (req.route && req.route.path) {
    let routePath = req.route.path;
    if (Array.isArray(routePath)) {
      const match = routePath.find((p) => p === req.path);
      routePath = match || routePath.join('|');
    } else if (typeof routePath !== 'string') {
      routePath = String(routePath);
    }
    const combined = (baseUrl + routePath).replace(/\/+/g, '/');
    if (combined.length > 1 && combined.endsWith('/')) {
      return combined.slice(0, -1);
    }
    return combined || '/';
  }

  // Fallback: extract path from req.path or req.url, without query string
  const rawPath = baseUrl + (req.path || (req.url ? req.url.split(/[?#]/)[0] : '/'));
  return sanitizePath(rawPath);
}

module.exports = {
  normalizeRoute,
  sanitizePath
};
