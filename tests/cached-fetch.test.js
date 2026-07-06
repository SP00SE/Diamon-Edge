// tests/cached-fetch.test.js
// Regression tests for cachedFetch in lib/data/cache.js:
// concurrent cache-misses for the same URL must share one network fetch,
// and a resolved fetch must serve later calls from the RAM cache.
'use strict';
var assert = require('assert');

var pass = 0, fail = 0;
var queue = [];
function test(name, fn) { queue.push([name, fn]); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// cachedFetch touches localStorage (consent check) — stub for Node.
global.localStorage = { getItem: function () { return null; } };

var cachedFetch = require('../lib/data/cache.js').cachedFetch;

console.log('\ncachedFetch: in-flight dedup');

test('two concurrent calls for the same URL hit the network once', async function () {
  var fetchCalls = 0;
  var release;
  global.fetch = function () {
    fetchCalls++;
    return new Promise(function (res) {
      release = function () { res({ ok: true, json: function () { return Promise.resolve({ v: 42 }); } }); };
    });
  };

  var p1 = cachedFetch('https://example.test/dedup');
  var p2 = cachedFetch('https://example.test/dedup');
  await sleep(150); // let the throttle start the first request
  assert.strictEqual(fetchCalls, 1, 'second concurrent call should join the in-flight fetch');
  release();

  var r = await Promise.all([p1, p2]);
  assert.deepStrictEqual(r[0], { v: 42 });
  assert.strictEqual(r[0], r[1], 'both callers get the same resolved data');
});

test('later call is served from RAM cache, no second network hit', async function () {
  var fetchCalls = 0;
  global.fetch = function () {
    fetchCalls++;
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ v: 7 }); } });
  };
  var a = await cachedFetch('https://example.test/ram');
  var b = await cachedFetch('https://example.test/ram');
  assert.deepStrictEqual(a, { v: 7 });
  assert.strictEqual(b, a);
  assert.strictEqual(fetchCalls, 1, 'second call should be a RAM cache hit');
});

test('failed fetch clears the in-flight slot so a retry can succeed', async function () {
  var attempt = 0;
  global.fetch = function () {
    attempt++;
    if (attempt === 1) return Promise.resolve({ ok: false, status: 404 }); // 4xx = thrown without internal retry
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: 1 }); } });
  };
  var err = null;
  try { await cachedFetch('https://example.test/fail'); } catch (e) { err = e; }
  assert.ok(err, 'first call should reject on HTTP 404');
  var ok = await cachedFetch('https://example.test/fail');
  assert.deepStrictEqual(ok, { ok: 1 }, 'second call should start a fresh fetch, not reuse the rejected one');
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
