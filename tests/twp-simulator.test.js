// tests/twp-simulator.test.js
'use strict';
var assert = require('assert');
var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); fail++; }
}

// Minimal dependencies (same formulas as index.html — keep in sync)
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function _winProbability(scoreDiff, homeProjRuns, awayProjRuns) {
  var k = 0.023;
  var scoreProb = 100 / (1 + Math.exp(-k * scoreDiff));
  if (homeProjRuns == null || awayProjRuns == null || !isFinite(homeProjRuns) || !isFinite(awayProjRuns)) return Math.round(scoreProb);
  var runDiff = homeProjRuns - awayProjRuns;
  var runProb = 100 / (1 + Math.exp(-0.35 * runDiff));
  return Math.round(0.70 * scoreProb + 0.30 * runProb);
}

// _simulate100 — ES5 translation of the implementation in index.html
function _simulate100(r) {
  var N = 100;
  function gauss(sigma) {
    return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * sigma * Math.sqrt(3);
  }
  var ac = r.awayComponents || {};
  var hc = r.homeComponents || {};
  var awayWins = 0, homeWins = 0, totalAwayRuns = 0, totalHomeRuns = 0;
  for (var i = 0; i < N; i++) {
    var simAwayScore =
      (ac.lineup    != null ? ac.lineup    : 50) + gauss(5) +
      (ac.form      || 0)                        +
      (ac.starter   || 0) + gauss(8)             +
      (ac.bullpen   || 0) + gauss(6)             +
      (ac.context   || 0) + gauss(1)             +
      (ac.arsenal   || 0) + gauss(3)             +
      (ac.platoon   || 0) + gauss(2)             +
      (ac.kMatchup  || 0) + (ac.bbMatchup || 0) + gauss(2) +
      (ac.rest      || 0)                        +
      (ac.parkPower || 0) + gauss(1);
    var simHomeScore =
      (hc.lineup    != null ? hc.lineup    : 50) + gauss(5) +
      (hc.form      || 0)                        +
      (hc.starter   || 0) + gauss(8)             +
      (hc.bullpen   || 0) + gauss(6)             +
      (hc.context   || 0) + gauss(1)             +
      (hc.arsenal   || 0) + gauss(3)             +
      (hc.platoon   || 0) + gauss(2)             +
      (hc.kMatchup  || 0) + (hc.bbMatchup || 0) + gauss(2) +
      (hc.rest      || 0)                        +
      (hc.parkPower || 0) + gauss(1);
    var simAwayRuns = (r.awayProjRuns != null ? r.awayProjRuns : 4.2) * (0.80 + Math.random() * 0.40);
    var simHomeRuns = (r.homeProjRuns != null ? r.homeProjRuns : 4.2) * (0.80 + Math.random() * 0.40);
    var simWinProb  = _winProbability(simHomeScore - simAwayScore, simHomeRuns, simAwayRuns);
    if (Math.random() * 100 < simWinProb) { homeWins++; } else { awayWins++; }
    totalAwayRuns += simAwayRuns;
    totalHomeRuns += simHomeRuns;
  }
  var avgAwayRuns = totalAwayRuns / N;
  var avgHomeRuns = totalHomeRuns / N;
  var avgTotal    = avgAwayRuns + avgHomeRuns;
  var simWinner   = awayWins > homeWins ? 'away' : homeWins > awayWins ? 'home' : 'tie';
  var maxWins     = Math.max(awayWins, homeWins);
  var simEdge     = maxWins >= 70 ? 'Strong Edge' : maxWins >= 62 ? 'Moderate Edge' : maxWins >= 55 ? 'Slight Edge' : 'Toss-Up';
  var winC = simWinner === 'away' ? ac : hc;
  var losC = simWinner === 'away' ? hc : ac;
  var keyDrivers = [
    { label: 'Lineup & Form',    delta: ((winC.lineup != null ? winC.lineup : 50) + (winC.form||0)) - ((losC.lineup != null ? losC.lineup : 50) + (losC.form||0)) },
    { label: 'Starting Pitcher', delta: (winC.starter||0)  - (losC.starter||0)  },
    { label: 'Bullpen',          delta: (winC.bullpen||0)  - (losC.bullpen||0)  },
    { label: 'Arsenal Matchup',  delta: (winC.arsenal||0)  - (losC.arsenal||0)  },
    { label: 'Platoon Edge',     delta: (winC.platoon||0)  - (losC.platoon||0)  },
    { label: 'K/BB Matchup',     delta: ((winC.kMatchup||0)+(winC.bbMatchup||0)) - ((losC.kMatchup||0)+(losC.bbMatchup||0)) },
    { label: 'Park Power',       delta: (winC.parkPower||0) - (losC.parkPower||0) },
  ].filter(function(d){ return d.delta > 1; }).sort(function(a,b){ return b.delta-a.delta; }).slice(0,3);
  return { awayWins:awayWins, homeWins:homeWins, avgAwayRuns:avgAwayRuns, avgHomeRuns:avgHomeRuns, avgTotal:avgTotal, simWinner:simWinner, simEdge:simEdge, keyDrivers:keyDrivers };
}

function mkResult(overrides) {
  var base = {
    gamePk: 1, awayAbbr: 'NYY', homeAbbr: 'BOS',
    awayComponents: { lineup:52, form:2, starter:55, rest:0, bullpen:55, context:3, arsenal:0, platoon:0, kMatchup:0, bbMatchup:0, parkPower:0 },
    homeComponents: { lineup:50, form:0, starter:52, rest:0, bullpen:53, context:6, arsenal:0, platoon:0, kMatchup:0, bbMatchup:0, parkPower:0 },
    awayProjRuns: 4.2, homeProjRuns: 4.1,
  };
  var out = {};
  Object.keys(base).forEach(function(k){ out[k] = base[k]; });
  Object.keys(overrides||{}).forEach(function(k){ out[k] = overrides[k]; });
  return out;
}

console.log('\n_simulate100 — structural invariants');
test('awayWins + homeWins === 100', function() {
  var sim = _simulate100(mkResult());
  assert.strictEqual(sim.awayWins + sim.homeWins, 100);
});
test('avgTotal = avgAwayRuns + avgHomeRuns', function() {
  var sim = _simulate100(mkResult());
  assert.ok(Math.abs(sim.avgTotal - (sim.avgAwayRuns + sim.avgHomeRuns)) < 0.001, 'avgTotal mismatch');
});
test('avgTotal is reasonable (3–25 runs)', function() {
  var sim = _simulate100(mkResult());
  assert.ok(sim.avgTotal >= 3 && sim.avgTotal <= 25, 'avgTotal=' + sim.avgTotal);
});
test('simEdge is a valid label', function() {
  var valid = ['Strong Edge', 'Moderate Edge', 'Slight Edge', 'Toss-Up'];
  var sim = _simulate100(mkResult());
  assert.ok(valid.indexOf(sim.simEdge) !== -1, 'invalid: ' + sim.simEdge);
});
test('simWinner consistent with win counts', function() {
  var sim = _simulate100(mkResult());
  var exp = sim.awayWins > sim.homeWins ? 'away' : sim.homeWins > sim.awayWins ? 'home' : 'tie';
  assert.strictEqual(sim.simWinner, exp);
});
test('keyDrivers is array of ≤3 objects with label+delta', function() {
  var sim = _simulate100(mkResult());
  assert.ok(Array.isArray(sim.keyDrivers) && sim.keyDrivers.length <= 3, 'length: ' + sim.keyDrivers.length);
  sim.keyDrivers.forEach(function(d) {
    assert.strictEqual(typeof d.label, 'string');
    assert.strictEqual(typeof d.delta, 'number');
  });
});
test('dominant away team wins in ≥8/10 runs', function() {
  var r = mkResult({
    awayComponents: { lineup:68, form:8, starter:75, rest:3, bullpen:72, context:0, arsenal:7, platoon:5, kMatchup:4, bbMatchup:3, parkPower:2 },
    homeComponents: { lineup:44, form:-2, starter:42, rest:0, bullpen:44, context:3, arsenal:-3, platoon:-2, kMatchup:-2, bbMatchup:-1, parkPower:0 },
    awayProjRuns:5.5, homeProjRuns:3.0,
  });
  var won = 0;
  for (var i = 0; i < 10; i++) { if (_simulate100(r).simWinner === 'away') won++; }
  assert.ok(won >= 8, 'dominant away won ' + won + '/10');
});
test('even matchup: combined 1000-trial away% between 35–65', function() {
  var r = mkResult({
    awayComponents: { lineup:50, form:0, starter:53, rest:0, bullpen:53, context:3, arsenal:0, platoon:0, kMatchup:0, bbMatchup:0, parkPower:0 },
    homeComponents: { lineup:50, form:0, starter:53, rest:0, bullpen:53, context:3, arsenal:0, platoon:0, kMatchup:0, bbMatchup:0, parkPower:0 },
    awayProjRuns:4.2, homeProjRuns:4.2,
  });
  var total = 0;
  for (var i = 0; i < 10; i++) { total += _simulate100(r).awayWins; }
  var pct = total / 10;
  assert.ok(pct >= 35 && pct <= 65, 'even away% out of range: ' + pct);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
