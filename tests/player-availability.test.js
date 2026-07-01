// tests/player-availability.test.js
// Regression tests for the IL / player availability filtering logic.
// isPlayerEligible lives in index.html as a browser global, so we simulate
// the exact same logic here using the same state structure.
'use strict';
var assert = require('assert');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); fail++; }
}

// ── Simulated state and helper (mirrors index.html exactly) ──────────────────
var state = { ilPlayerIds: new Set() };

function isPlayerEligible(player) {
  if (!player || !player.id) return false;
  return !state.ilPlayerIds.has(player.id);
}

// Reset IL set before each group of tests
function resetIL() { state.ilPlayerIds = new Set(); }
function addToIL(id) { state.ilPlayerIds.add(id); }

// ── isPlayerEligible: basic gate ──────────────────────────────────────────────
console.log('\nisPlayerEligible: basic gate');

test('active player with valid id is eligible', function () {
  resetIL();
  assert.strictEqual(isPlayerEligible({ id: 1001 }), true);
});

test('IL player is not eligible', function () {
  resetIL();
  addToIL(1002);
  assert.strictEqual(isPlayerEligible({ id: 1002 }), false);
});

test('player with no id is not eligible', function () {
  resetIL();
  assert.strictEqual(isPlayerEligible({ name: 'Unknown' }), false);
});

test('null player is not eligible', function () {
  resetIL();
  assert.strictEqual(isPlayerEligible(null), false);
});

test('undefined player is not eligible', function () {
  resetIL();
  assert.strictEqual(isPlayerEligible(undefined), false);
});

// ── IL exclusion: filtering a player list ─────────────────────────────────────
console.log('\nIL exclusion: filtering a player list');

test('IL player filtered out of player pool', function () {
  resetIL();
  addToIL(555);
  var players = [{ id: 100 }, { id: 555 }, { id: 200 }];
  var eligible = players.filter(isPlayerEligible);
  assert.strictEqual(eligible.length, 2);
  assert.ok(eligible.every(function (p) { return p.id !== 555; }), 'IL player must not be in result');
});

test('multiple IL players all filtered out', function () {
  resetIL();
  addToIL(10); addToIL(20); addToIL(30);
  var players = [{ id: 10 }, { id: 11 }, { id: 20 }, { id: 21 }, { id: 30 }];
  var eligible = players.filter(isPlayerEligible);
  assert.strictEqual(eligible.length, 2);
  assert.deepStrictEqual(eligible.map(function (p) { return p.id; }), [11, 21]);
});

test('confirmed starter remains eligible when not on IL', function () {
  resetIL();
  var starter = { id: 592450, name: 'Active Player', _projected: false };
  assert.strictEqual(isPlayerEligible(starter), true);
});

test('projected player remains eligible when not on IL', function () {
  resetIL();
  var projected = { id: 777, name: 'Projected Player', _projected: true };
  assert.strictEqual(isPlayerEligible(projected), true);
});

// ── IL exclusion: The Lab suggestions ────────────────────────────────────────
console.log('\nIL exclusion: The Lab suggestions (renderOverallTopPlays pattern)');

test('IL player excluded from overall hit score ranking', function () {
  resetIL();
  addToIL(888);
  var allPredictions = {
    gk1: { players: [
      { id: 100, hitScore: 90, hrScore: 20 },
      { id: 888, hitScore: 99, hrScore: 30 }, // IL — high scorer but excluded
      { id: 200, hitScore: 70, hrScore: 15 },
    ]},
  };
  var allPlayers = [];
  for (var pk in allPredictions) {
    var gd = allPredictions[pk];
    allPlayers.push.apply(allPlayers, (gd.players || []).filter(isPlayerEligible));
  }
  var hitPicks = allPlayers.slice().sort(function (a, b) { return b.hitScore - a.hitScore; }).slice(0, 3);
  assert.ok(hitPicks.every(function (p) { return p.id !== 888; }), 'IL player must not appear in hit picks');
  assert.strictEqual(hitPicks[0].id, 100, 'highest eligible hitter should be first pick');
});

// ── IL exclusion: Arsenal Hit Finder ─────────────────────────────────────────
console.log('\nIL exclusion: Arsenal Hit Finder (runArsenalScan pattern)');

test('IL player filtered from arsenal scan candidate list', function () {
  resetIL();
  addToIL(999);
  var gd = { players: [{ id: 500 }, { id: 999 }, { id: 600 }] };
  var candidates = (gd.players || []).filter(function (p) { return p.id && isPlayerEligible(p); });
  assert.strictEqual(candidates.length, 2);
  assert.ok(candidates.every(function (p) { return p.id !== 999; }));
});

// ── IL exclusion: Beat the Streak ────────────────────────────────────────────
console.log('\nIL exclusion: Beat the Streak (renderBeatTheStreak pattern)');

test('IL player skipped in BTS loop', function () {
  resetIL();
  addToIL(777);
  var players = [{ id: 100 }, { id: 777 }, { id: 200 }];
  var seen = [];
  for (var i = 0; i < players.length; i++) {
    if (!isPlayerEligible(players[i])) continue;
    seen.push(players[i].id);
  }
  assert.strictEqual(seen.length, 2);
  assert.ok(seen.indexOf(777) === -1, 'IL player must be skipped');
});

// ── IL exclusion: Team Win Predictor lineup ───────────────────────────────────
console.log('\nIL exclusion: Team Win Predictor lineup calculation');

test('IL player excluded from TWP away lineup', function () {
  resetIL();
  addToIL(555);
  var gd = { players: [
    { id: 100, isAway: true,  hitScore: 70 },
    { id: 555, isAway: true,  hitScore: 80 }, // IL — should be excluded
    { id: 200, isAway: false, hitScore: 65 },
  ]};
  var awayPlayers = (gd.players || []).filter(function (p) { return p.id && p.isAway && isPlayerEligible(p); });
  assert.strictEqual(awayPlayers.length, 1);
  assert.strictEqual(awayPlayers[0].id, 100);
});

test('IL player excluded from TWP home lineup', function () {
  resetIL();
  addToIL(300);
  var gd = { players: [
    { id: 100, isAway: true,  hitScore: 70 },
    { id: 200, isAway: false, hitScore: 65 },
    { id: 300, isAway: false, hitScore: 95 }, // IL — should be excluded
  ]};
  var homePlayers = (gd.players || []).filter(function (p) { return p.id && !p.isAway && isPlayerEligible(p); });
  assert.strictEqual(homePlayers.length, 1);
  assert.strictEqual(homePlayers[0].id, 200);
});

// ── IL exclusion: Game Simulator / H2H scan ──────────────────────────────────
console.log('\nIL exclusion: H2H scan and Game Simulator patterns');

test('IL player excluded from H2H scan flatMap entries', function () {
  resetIL();
  addToIL(444);
  var allGames = [{ players: [{ id: 111 }, { id: 444 }, { id: 222 }] }];
  var allEntries = allGames.reduce(function (acc, gd) {
    return acc.concat((gd.players || []).filter(function (p) { return p.id && isPlayerEligible(p); }).map(function (p) { return { player: p, gd: gd }; }));
  }, []);
  assert.strictEqual(allEntries.length, 2);
  assert.ok(allEntries.every(function (e) { return e.player.id !== 444; }));
});

test('IL player excluded from leaderboard scan entries', function () {
  resetIL();
  addToIL(333);
  var leaderIds = new Set([111, 333, 222]);
  var allGames = [{ players: [{ id: 111 }, { id: 333 }, { id: 222 }, { id: 999 }] }];
  var allEntries = allGames.reduce(function (acc, gd) {
    return acc.concat(
      (gd.players || [])
        .filter(function (p) { return p.id && leaderIds.has(p.id) && isPlayerEligible(p); })
        .map(function (p) { return { player: p, gd: gd }; })
    );
  }, []);
  assert.strictEqual(allEntries.length, 2);
  assert.ok(allEntries.every(function (e) { return e.player.id !== 333; }), 'IL leaderboard player excluded');
  assert.ok(allEntries.every(function (e) { return e.player.id !== 999; }), 'non-leaderboard player excluded');
});

// ── Edge cases ────────────────────────────────────────────────────────────────
console.log('\nIL exclusion: edge cases');

test('empty player list does not crash', function () {
  resetIL();
  var result = [].filter(isPlayerEligible);
  assert.deepStrictEqual(result, []);
});

test('player added then removed from IL becomes eligible again', function () {
  resetIL();
  addToIL(123);
  assert.strictEqual(isPlayerEligible({ id: 123 }), false, 'should be ineligible after add');
  state.ilPlayerIds.delete(123);
  assert.strictEqual(isPlayerEligible({ id: 123 }), true, 'should be eligible after remove');
});

test('missing status should not mean active if explicitly in IL set', function () {
  resetIL();
  addToIL(456);
  var playerNoStatus = { id: 456, name: 'Joe Player' }; // no status field
  assert.strictEqual(isPlayerEligible(playerNoStatus), false, 'IL set takes precedence over missing status');
});

console.log('\nResults:', pass, 'passed,', fail, 'failed');
if (fail > 0) process.exit(1);
