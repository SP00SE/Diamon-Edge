// tests/lab-scorer.test.js
'use strict';
var assert = require('assert');
var s = require('../lib/lab-scorer.js');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); fail++; }
}

console.log('\nclamp');
test('below min returns min', function () { assert.strictEqual(s.clamp(-5, 0, 10), 0); });
test('above max returns max', function () { assert.strictEqual(s.clamp(15, 0, 10), 10); });
test('within range returns value', function () { assert.strictEqual(s.clamp(7, 0, 10), 7); });

console.log('\nbuildScoreLabel');
test('75+ => Strong',      function () { assert.strictEqual(s.buildScoreLabel(75), 'Strong'); });
test('60-74 => Favorable', function () { assert.strictEqual(s.buildScoreLabel(65), 'Favorable'); });
test('45-59 => Neutral',   function () { assert.strictEqual(s.buildScoreLabel(50), 'Neutral'); });
test('30-44 => Risky',     function () { assert.strictEqual(s.buildScoreLabel(38), 'Risky'); });
test('<30 => Avoid',       function () { assert.strictEqual(s.buildScoreLabel(20), 'Avoid'); });

console.log('\nResults:', pass, 'passed,', fail, 'failed');
if (fail > 0) process.exit(1);
