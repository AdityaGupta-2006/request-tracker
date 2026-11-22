'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createRequestTracker } = require('../../src');

test('EventEmitter: emits "request" and "slowRequest" events', () => {
  const tracker = createRequestTracker({ slowThreshold: 100 });
  const requestEvents = [];
  const slowEvents = [];

  tracker.on('request', (data) => requestEvents.push(data));
  tracker.on('slowRequest', (data) => slowEvents.push(data));

  // Simulate fast request
  tracker._handleResponseCompleted({
    method: 'GET',
    endpoint: '/fast',
    statusCode: 200,
    durationMs: 20,
    aborted: false
  });

  assert.strictEqual(requestEvents.length, 1);
  assert.strictEqual(requestEvents[0].endpoint, '/fast');
  assert.strictEqual(requestEvents[0].isSlow, false);
  assert.strictEqual(slowEvents.length, 0);

  // Simulate slow request
  tracker._handleResponseCompleted({
    method: 'POST',
    endpoint: '/heavy',
    statusCode: 201,
    durationMs: 150,
    aborted: false
  });

  assert.strictEqual(requestEvents.length, 2);
  assert.strictEqual(requestEvents[1].endpoint, '/heavy');
  assert.strictEqual(requestEvents[1].isSlow, true);

  assert.strictEqual(slowEvents.length, 1);
  assert.strictEqual(slowEvents[0].endpoint, '/heavy');
  assert.strictEqual(slowEvents[0].durationMs, 150);
  assert.strictEqual(slowEvents[0].thresholdMs, 100);
});

test('EventEmitter: faulty listener exception does not crash or block other listeners', () => {
  const tracker = createRequestTracker();
  let listener2Fired = false;

  tracker.on('request', () => {
    throw new Error('Exploding user event listener');
  });

  tracker.on('request', () => {
    listener2Fired = true;
  });

  assert.doesNotThrow(() => {
    tracker._handleResponseCompleted({
      method: 'GET',
      endpoint: '/test',
      statusCode: 200,
      durationMs: 10,
      aborted: false
    });
  });

  assert.strictEqual(listener2Fired, true, 'Second listener should execute even if first threw');
});
