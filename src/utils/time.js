'use strict';

/**
 * Returns the current high-resolution monotonic time in nanoseconds as BigInt.
 * @returns {bigint}
 */
function now() {
  return process.hrtime.bigint();
}

/**
 * Calculates elapsed time in milliseconds between start and end nanoseconds.
 * @param {bigint} startNs
 * @param {bigint} [endNs]
 * @returns {number} Duration in milliseconds rounded to 2 decimal places.
 */
function toMs(startNs, endNs) {
  const end = endNs || process.hrtime.bigint();
  const diffNs = end - startNs;
  const diffMs = Number(diffNs) / 1e6;
  return Math.round(diffMs * 100) / 100;
}

module.exports = {
  now,
  toMs
};
