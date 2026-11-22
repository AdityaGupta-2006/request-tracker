'use strict';

/**
 * Default configuration options.
 */
const DEFAULT_OPTIONS = {
  slowThreshold: 1000,
  logRequests: false,
  excludePaths: [],
  maxEndpoints: 1000,
  maxSlowRequests: 100,
  logger: console
};

/**
 * Validates and normalizes user-provided configuration.
 *
 * @param {object} [userOptions]
 * @returns {object} Normalized options
 * @throws {TypeError|RangeError} On invalid options
 */
function validateOptions(userOptions = {}) {
  if (userOptions === null || typeof userOptions !== 'object' || Array.isArray(userOptions)) {
    throw new TypeError('Options must be a plain object.');
  }

  const options = { ...DEFAULT_OPTIONS, ...userOptions };

  // 1. Validate slowThreshold (must be a finite positive number)
  if (typeof options.slowThreshold !== 'number' || !Number.isFinite(options.slowThreshold)) {
    throw new TypeError('Option "slowThreshold" must be a finite positive number.');
  }
  if (options.slowThreshold <= 0) {
    throw new RangeError('Option "slowThreshold" must be greater than 0.');
  }

  // 2. Validate logRequests
  if (typeof options.logRequests !== 'boolean') {
    throw new TypeError('Option "logRequests" must be a boolean.');
  }

  // 3. Validate excludePaths
  if (!Array.isArray(options.excludePaths)) {
    throw new TypeError('Option "excludePaths" must be an array of strings or RegExps.');
  }
  for (let i = 0; i < options.excludePaths.length; i++) {
    const item = options.excludePaths[i];
    if (typeof item !== 'string' && !(item instanceof RegExp)) {
      throw new TypeError(`Option "excludePaths[${i}]" must be a string or a RegExp.`);
    }
  }

  // 4. Validate maxEndpoints
  if (typeof options.maxEndpoints !== 'number' || !Number.isInteger(options.maxEndpoints) || options.maxEndpoints <= 0) {
    throw new RangeError('Option "maxEndpoints" must be a positive integer.');
  }

  // 5. Validate maxSlowRequests
  if (typeof options.maxSlowRequests !== 'number' || !Number.isInteger(options.maxSlowRequests) || options.maxSlowRequests <= 0) {
    throw new RangeError('Option "maxSlowRequests" must be a positive integer.');
  }

  // 6. Validate logger: function or object implementing at least one of log(), info(), warn()
  const isFunctionLogger = typeof options.logger === 'function';
  const isObjectLogger =
    options.logger !== null &&
    typeof options.logger === 'object' &&
    !Array.isArray(options.logger) &&
    (typeof options.logger.log === 'function' ||
      typeof options.logger.info === 'function' ||
      typeof options.logger.warn === 'function');

  if (!isFunctionLogger && !isObjectLogger) {
    throw new TypeError(
      'Option "logger" must be a function or an object implementing at least one of: log(), info(), warn().'
    );
  }

  return options;
}

module.exports = {
  DEFAULT_OPTIONS,
  validateOptions
};
