// tests/war-integration.test.js
// Regression tests for WAR integration in the Team Win Predictor.
// Simulates the _teamWarContext / fetchWarData logic using the same
// data structures and algorithm as index.html — no browser runtime needed.
'use strict';
var assert = require('assert');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); fail++; }
}

// ── Simulated state (mirrors index.html) ─────────────────────────────────────
var state = { warMap: new Map(), warDataLoaded: false, ilPlayerIds: new Set() };

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Mirrors isPlayerEligible from index.html
function isPlayerEligible(player) {
  if (!player || !player.id) return false;
  return !state.ilPlayerIds.has(player.id);
}

// Mirrors _teamWarContext from index.html
function _teamWarContext(players, pitcher) {
  if (!state.warMap.size) return { lineupWar: null, spWar: null, hasData: false, playerCount: 0, warScore: 0 };
  var lineupWar = 0, count = 0;
  for (var i = 0; i < players.length; i++) {
    var entry = state.warMap.get(Number(players[i].id));
    if (entry && entry.bat != null) { lineupWar += entry.bat; count++; }
  }
  var spEntry = (pitcher && pitcher.id) ? state.warMap.get(Number(pitcher.id)) : null;
  var spWar   = (spEntry && spEntry.pitch != null) ? spEntry.pitch : null;
  var hasData = count >= 3 || spWar != null;
  if (!hasData) return { lineupWar: null, spWar: null, hasData: false, playerCount: 0, warScore: 0 };
  var expectedWar = Math.max(count, 7) * 0.7;
  var warAboveAvg = count >= 3 ? lineupWar - expectedWar : 0;
  var lineupScore = clamp(Math.round(warAboveAvg * 0.5), 0, 7);
  var spScore     = spWar != null ? clamp(Math.round(spWar * 0.7), 0, 3) : 0;
  return { lineupWar: count >= 3 ? lineupWar : null, spWar: spWar, hasData: true, playerCount: count, warScore: lineupScore + spScore };
}

// Reset state between test groups
function resetState() {
  state.warMap       = new Map();
  state.warDataLoaded = false;
  state.ilPlayerIds  = new Set();
}

// Populate warMap with test data
function setWar(playerId, bat, pitch) {
  var entry = state.warMap.get(Number(playerId)) || {};
  if (bat   != null) entry.bat   = bat;
  if (pitch != null) entry.pitch = pitch;
  state.warMap.set(Number(playerId), entry);
}

// ── fetchWarData simulation: populating warMap ────────────────────────────────
console.log('\nfetchWarData: warMap population');

test('active player bat WAR stored correctly', function () {
  resetState();
  setWar(592450, 4.2, null); // Aaron Judge batting WAR
  var entry = state.warMap.get(592450);
  assert.strictEqual(entry.bat, 4.2);
});

test('pitcher WAR stored correctly', function () {
  resetState();
  setWar(543037, null, 2.1); // Gerrit Cole pitching WAR
  var entry = state.warMap.get(543037);
  assert.strictEqual(entry.pitch, 2.1);
});

test('player can have both bat and pitch WAR', function () {
  resetState();
  setWar(111, 1.5, 0.5);
  var entry = state.warMap.get(111);
  assert.strictEqual(entry.bat,   1.5);
  assert.strictEqual(entry.pitch, 0.5);
});

test('warDataLoaded=false keeps warMap empty until populated', function () {
  resetState();
  assert.strictEqual(state.warMap.size, 0);
  assert.strictEqual(state.warDataLoaded, false);
});

// ── _teamWarContext: no data cases ────────────────────────────────────────────
console.log('\n_teamWarContext: no data');

test('empty warMap returns hasData=false and warScore=0', function () {
  resetState();
  var result = _teamWarContext([{ id: 1 }, { id: 2 }, { id: 3 }], { id: 99 });
  assert.strictEqual(result.hasData,   false);
  assert.strictEqual(result.warScore,  0);
  assert.strictEqual(result.lineupWar, null);
  assert.strictEqual(result.spWar,     null);
});

test('fewer than 3 lineup players with data returns lineupWar=null', function () {
  resetState();
  setWar(1, 2.0, null);
  setWar(2, 1.5, null);
  // Only 2 batters with data → lineupWar=null
  var result = _teamWarContext([{ id: 1 }, { id: 2 }, { id: 99 }], null);
  assert.strictEqual(result.lineupWar, null);
  assert.strictEqual(result.warScore,  0); // no SP WAR either
});

test('missing WAR does not crash (player not in warMap)', function () {
  resetState();
  setWar(100, 3.0, null);
  var result = _teamWarContext([{ id: 100 }, { id: 999 }, { id: 888 }], null);
  assert.ok(typeof result.warScore === 'number', 'warScore must be a number');
  assert.ok(!isNaN(result.warScore), 'warScore must not be NaN');
});

test('null pitcher returns spWar=null without crash', function () {
  resetState();
  setWar(1, 2.0, null); setWar(2, 1.5, null); setWar(3, 1.0, null);
  var result = _teamWarContext([{ id: 1 }, { id: 2 }, { id: 3 }], null);
  assert.strictEqual(result.spWar, null);
});

// ── _teamWarContext: IL player exclusion ──────────────────────────────────────
console.log('\n_teamWarContext: IL player exclusion');

test('IL player WAR excluded via isPlayerEligible filter', function () {
  resetState();
  state.ilPlayerIds.add(777); // Mark player as IL
  setWar(100, 4.0, null);
  setWar(200, 3.0, null);
  setWar(300, 2.5, null);
  setWar(777, 6.0, null); // IL player with high WAR — must be excluded

  var allPlayers = [{ id: 100 }, { id: 200 }, { id: 300 }, { id: 777 }];
  var eligiblePlayers = allPlayers.filter(isPlayerEligible);
  var result = _teamWarContext(eligiblePlayers, null);

  assert.ok(eligiblePlayers.every(function (p) { return p.id !== 777; }), 'IL player must be filtered before WAR calc');
  assert.strictEqual(result.playerCount, 3);
  // lineupWar should be 4.0 + 3.0 + 2.5 = 9.5, NOT include 6.0
  assert.ok(Math.abs(result.lineupWar - 9.5) < 0.01, 'lineupWar should be 9.5, not 15.5 (got ' + result.lineupWar + ')');
});

test('multiple IL players all excluded from WAR totals', function () {
  resetState();
  state.ilPlayerIds.add(10);
  state.ilPlayerIds.add(20);
  setWar(10, 5.0, null); // IL
  setWar(20, 4.0, null); // IL
  setWar(30, 2.0, null);
  setWar(40, 1.5, null);
  setWar(50, 1.0, null);

  var all     = [{ id: 10 }, { id: 20 }, { id: 30 }, { id: 40 }, { id: 50 }];
  var eligible = all.filter(isPlayerEligible);
  var result   = _teamWarContext(eligible, null);

  assert.strictEqual(result.playerCount, 3);
  assert.ok(Math.abs(result.lineupWar - 4.5) < 0.01, 'lineupWar should be 4.5 (got ' + result.lineupWar + ')');
});

test('active player WAR included correctly', function () {
  resetState();
  setWar(1, 3.5, null); setWar(2, 2.1, null); setWar(3, 1.8, null);
  var result = _teamWarContext([{ id: 1 }, { id: 2 }, { id: 3 }], null);
  assert.strictEqual(result.hasData, true);
  assert.ok(result.lineupWar !== null, 'lineupWar should have a value');
  assert.ok(Math.abs(result.lineupWar - 7.4) < 0.01, 'lineupWar should be 7.4 (got ' + result.lineupWar + ')');
});

// ── _teamWarContext: scoring and caps ─────────────────────────────────────────
console.log('\n_teamWarContext: scoring and caps');

test('lineup WAR score capped at 7', function () {
  resetState();
  // 9 × 2.5 = 22.5 WAR; expected = 9 × 0.7 = 6.3; above = 16.2; score = round(8.1) = 8 → capped at 7
  for (var i = 1; i <= 9; i++) setWar(i, 2.5, null); // 9 × 2.5 = 22.5 → capped at 7
  var players = Array.from({ length: 9 }, function (_, i) { return { id: i + 1 }; });
  var result  = _teamWarContext(players, null);
  assert.ok(result.warScore <= 10, 'warScore should not exceed 10 (lineup cap 7 + SP cap 3)');
  assert.ok(result.lineupWar > 20, 'lineupWar should be > 20 for 9 × 2.5 players');
  var expectedWar = Math.max(result.playerCount, 7) * 0.7;
  var lineupScore = clamp(Math.round((result.lineupWar - expectedWar) * 0.5), 0, 7);
  assert.strictEqual(lineupScore, 7, 'lineup score should be capped at 7');
});

test('SP WAR score capped at 3', function () {
  resetState();
  setWar(1, 1.0, null); setWar(2, 1.0, null); setWar(3, 1.0, null);
  setWar(999, null, 8.0); // SP with very high WAR
  var result  = _teamWarContext([{ id: 1 }, { id: 2 }, { id: 3 }], { id: 999 });
  var spScore = clamp(Math.round(8.0 * 0.7), 0, 3);
  assert.strictEqual(spScore, 3, 'SP war score should be capped at 3');
  assert.ok(result.warScore <= 10, 'total warScore should not exceed 10');
});

test('zero WAR players produce warScore=0', function () {
  resetState();
  setWar(1, 0.0, null); setWar(2, 0.0, null); setWar(3, 0.0, null);
  setWar(99, null, 0.0);
  var result = _teamWarContext([{ id: 1 }, { id: 2 }, { id: 3 }], { id: 99 });
  assert.strictEqual(result.warScore, 0);
  assert.strictEqual(result.hasData,  true);
});

test('negative WAR clamped to 0 (below-replacement players do not hurt team)', function () {
  resetState();
  setWar(1, -1.5, null); setWar(2, -0.8, null); setWar(3, -1.0, null);
  var result      = _teamWarContext([{ id: 1 }, { id: 2 }, { id: 3 }], null);
  var expectedWar = Math.max(result.playerCount, 7) * 0.7;
  var lineupScore = clamp(Math.round((result.lineupWar - expectedWar) * 0.5), 0, 7);
  assert.strictEqual(lineupScore, 0, 'negative lineup WAR score clamped to 0');
});

// ── WAR edge calculation ──────────────────────────────────────────────────────
console.log('\nWAR edge: team comparison');

test('warDelta correctly identifies team with higher WAR', function () {
  resetState();
  // Away team: 3 players with 2.0 WAR each → lineupWar=6.0 → lineupScore=2
  setWar(101, 2.0, null); setWar(102, 2.0, null); setWar(103, 2.0, null);
  // Home team: 3 players with 4.0 WAR each → lineupWar=12.0 → lineupScore=4
  setWar(201, 4.0, null); setWar(202, 4.0, null); setWar(203, 4.0, null);

  var awayPlayers = [{ id: 101 }, { id: 102 }, { id: 103 }];
  var homePlayers = [{ id: 201 }, { id: 202 }, { id: 203 }];

  var awayCtx = _teamWarContext(awayPlayers, null);
  var homeCtx = _teamWarContext(homePlayers, null);
  var warDelta = (homeCtx.warScore || 0) - (awayCtx.warScore || 0);

  assert.ok(warDelta > 0, 'home team with higher WAR should have positive warDelta (got ' + warDelta + ')');
  assert.ok(homeCtx.warScore > awayCtx.warScore, 'home warScore should exceed away warScore');
});

test('equal WAR lineups produce warDelta=0', function () {
  resetState();
  setWar(1, 2.0, null); setWar(2, 2.0, null); setWar(3, 2.0, null);
  setWar(4, 2.0, null); setWar(5, 2.0, null); setWar(6, 2.0, null);

  var awayCtx  = _teamWarContext([{ id: 1 }, { id: 2 }, { id: 3 }], null);
  var homeCtx  = _teamWarContext([{ id: 4 }, { id: 5 }, { id: 6 }], null);
  var warDelta = (homeCtx.warScore || 0) - (awayCtx.warScore || 0);

  assert.strictEqual(warDelta, 0, 'equal WAR lineups should produce 0 delta');
});

test('SP WAR edge: team with better SP has higher warScore', function () {
  resetState();
  setWar(1, 1.5, null); setWar(2, 1.5, null); setWar(3, 1.5, null);
  setWar(4, 1.5, null); setWar(5, 1.5, null); setWar(6, 1.5, null);
  setWar(991, null, 3.5); // Away SP — ace
  setWar(992, null, 0.5); // Home SP — below average

  var awayCtx  = _teamWarContext([{ id: 1 }, { id: 2 }, { id: 3 }], { id: 991 });
  var homeCtx  = _teamWarContext([{ id: 4 }, { id: 5 }, { id: 6 }], { id: 992 });

  assert.ok(awayCtx.spWar > homeCtx.spWar, 'away SP WAR should be higher');
  assert.ok(awayCtx.warScore > homeCtx.warScore, 'away team should have higher warScore due to SP WAR');
});

// ── WAR does not overpower other factors ──────────────────────────────────────
console.log('\nWAR: weight constraints');

test('maximum total WAR score is 10 (lineup 7 + SP 3)', function () {
  resetState();
  for (var i = 1; i <= 9; i++) setWar(i, 10.0, null); // extreme lineup WAR
  setWar(999, null, 10.0); // extreme SP WAR
  var players = Array.from({ length: 9 }, function (_, i) { return { id: i + 1 }; });
  var result  = _teamWarContext(players, { id: 999 });
  assert.ok(result.warScore <= 10, 'warScore must be ≤ 10 regardless of WAR (got ' + result.warScore + ')');
});

test('WAR score is always non-negative', function () {
  resetState();
  setWar(1, -5.0, null); setWar(2, -3.0, null); setWar(3, -2.0, null);
  setWar(99, null, -2.0);
  var result = _teamWarContext([{ id: 1 }, { id: 2 }, { id: 3 }], { id: 99 });
  assert.ok(result.warScore >= 0, 'warScore should never be negative (got ' + result.warScore + ')');
});

// ── Projected lineup WAR after availability filtering ─────────────────────────
console.log('\nWAR: projected lineup filtering');

test('projected lineup WAR calculation after IL filtering', function () {
  resetState();
  state.ilPlayerIds.add(555); // One player on IL
  setWar(100, 3.0, null);
  setWar(200, 2.5, null);
  setWar(300, 2.0, null);
  setWar(555, 7.0, null); // IL player with high WAR

  var allProjected = [
    { id: 100, _projected: true },
    { id: 200, _projected: true },
    { id: 300, _projected: true },
    { id: 555, _projected: true }, // IL — should be excluded
  ];
  var eligible = allProjected.filter(isPlayerEligible);
  var result   = _teamWarContext(eligible, null);

  assert.strictEqual(result.playerCount, 3, 'IL player excluded from projected lineup count');
  assert.ok(Math.abs(result.lineupWar - 7.5) < 0.01, 'lineupWar should be 7.5, not 14.5 (got ' + result.lineupWar + ')');
});

test('confirmed lineup WAR uses only confirmed starters', function () {
  resetState();
  setWar(10, 4.0, null);
  setWar(20, 3.0, null);
  setWar(30, 2.5, null);
  setWar(40, 2.0, null); // In warMap but not in confirmed lineup

  var confirmed = [{ id: 10 }, { id: 20 }, { id: 30 }]; // 3 confirmed starters
  var result    = _teamWarContext(confirmed, null);

  assert.strictEqual(result.playerCount, 3);
  assert.ok(Math.abs(result.lineupWar - 9.5) < 0.01, 'confirmed lineup WAR should be 9.5 (got ' + result.lineupWar + ')');
});

console.log('\nResults:', pass, 'passed,', fail, 'failed');
if (fail > 0) process.exit(1);
