// tests/cache-throttle.test.js
// Regression test for the global request throttle in lib/data/cache.js.
// Bug: when two in-flight requests complete in the same tick with one item
// queued, both completion handlers schedule a drain; the second drain calls
// _requestQueue.shift()() on an empty queue → undefined() TypeError thrown
// inside a timer callback (uncaught, appears as console noise at runtime).
'use strict';
var assert = require('assert');

var pass = 0, fail = 0;
var queue = [];
function test(name, fn) { queue.push([name, fn]); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Capture exceptions thrown from timer callbacks — with a listener attached,
// Node does not crash the process, letting us assert on what leaked.
var uncaught = [];
process.on('uncaughtException', function (e) { uncaught.push(e); });

var _throttledFetch = require('../lib/data/cache.js')._throttledFetch;

// ── Simultaneous completions with a single queued request ────────────────────
console.log('\n_throttledFetch: queue drain race');

test('two same-tick completions with one queued item: no uncaught TypeError, queued request still runs', async function () {
  uncaught.length = 0;
  var resolvers = [];
  global.fetch = function () {
    return new Promise(function (res) { resolvers.push(function () { res({ ok: true }); }); });
  };

  var pA = _throttledFetch('u1'); // slot 1
  var pB = _throttledFetch('u2'); // slot 2
  var pC = _throttledFetch('u3'); // queued (MAX_CONCURRENT_REQUESTS = 2)
  await sleep(120); // let any gap timers start A/B
  assert.strictEqual(resolvers.length, 2, 'A and B should be in flight, C queued');

  // Resolve A and B in the same tick → both .finally handlers observe
  // _requestQueue.length === 1 and both schedule a 100ms drain.
  resolvers[0]();
  resolvers[1]();
  await sleep(200); // both drain timers fire in this window

  assert.strictEqual(resolvers.length, 3, 'queued request C should have started exactly once');
  resolvers[2]();
  await Promise.all([pA, pB, pC]);

  var raceErrors = uncaught.filter(function (e) { return /is not a function/.test(e.message || ''); });
  assert.strictEqual(raceErrors.length, 0,
    'drain race leaked uncaught TypeError(s): ' + raceErrors.map(function (e) { return e.message; }).join('; '));
});

// ── Sanity: burst larger than the queue keeps draining ──────────────────────
test('five requests through two slots all complete, none lost', async function () {
  uncaught.length = 0;
  var resolvers = [];
  global.fetch = function () {
    return new Promise(function (res) { resolvers.push(function () { res({ ok: true }); }); });
  };
  var all = ['a', 'b', 'c', 'd', 'e'].map(function (u) { return _throttledFetch(u); });
  for (var guard = 0; guard < 60 && resolvers.length < 5; guard++) {
    while (resolvers.length && resolvers[0]) { var r = resolvers.shift(); r(); }
    await sleep(120);
  }
  await Promise.all(all);
  assert.strictEqual(uncaught.length, 0, 'no exceptions during burst drain');
});

// ── Runner (async tests, sequential) ─────────────────────────────────────────
(async function run() {
  for (var i = 0; i < queue.length; i++) {
    var name = queue[i][0], fn = queue[i][1];
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.error('  ✗', name, '\n   ', e.message); fail++; }
  }
  console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
