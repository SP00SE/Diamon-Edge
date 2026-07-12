// tests/twp-tracker.test.js
// Regression tests for lib/twp-tracker.js — prediction snapshots, grading
// rules, and last-10-days accuracy stats.
'use strict';
var assert = require('assert');
var T = require('../lib/twp-tracker.js');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); fail++; }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function scanResult(over) {
  return Object.assign({
    gamePk: 777001, gameDate: '2026-07-09T23:10:00Z',
    awayAbbr: 'NYY', homeAbbr: 'BOS', awayTeamId: 147, homeTeamId: 111,
    winner: 'away', awayWinProb: 61, homeWinProb: 39,
    confidence: 'High', winEdge: 'Slight Edge',
    awayProjRuns: 4.8, homeProjRuns: 4.1, predTotal: 8.9,
    awayPosted: true, homePosted: true,
    awayPitcherName: 'G. Cole', homePitcherName: 'B. Bello',
  }, over || {});
}
function rawGame(over) {
  return Object.assign({
    gamePk: 777001, officialDate: '2026-07-09', gameDate: '2026-07-09T23:10:00Z',
    status: { abstractGameState: 'Preview', detailedState: 'Scheduled' },
  }, over || {});
}
function snap(log, rOver, gOver) {
  var e = T.makeSnapshot(scanResult(rOver), rawGame(gOver), { predictedAt: '2026-07-09T15:00:00Z', appVersion: 'test' });
  if (e) T.addSnapshot(log, e);
  return e;
}
var FINAL_AWAY = { abstractState: 'Final', detailedState: 'Final', awayScore: 6, homeScore: 4 };
var FINAL_HOME = { abstractState: 'Final', detailedState: 'Final', awayScore: 2, homeScore: 5 };

// ── Snapshot rules ─────────────────────────────────────────────────────────
console.log('\nsnapshot rules');

test('pre-game prediction snapshots with full mapping', function () {
  var log = T.emptyLog();
  var e = snap(log);
  assert.ok(e, 'snapshot created');
  assert.strictEqual(e.status, 'pending');
  assert.strictEqual(e.predWinnerAbbr, 'NYY');
  assert.strictEqual(e.officialDate, '2026-07-09');
});

test('no snapshot once the game is live or final', function () {
  var log = T.emptyLog();
  assert.strictEqual(snap(log, null, { status: { abstractGameState: 'Live', detailedState: 'In Progress' } }), null);
  assert.strictEqual(snap(log, null, { status: { abstractGameState: 'Final', detailedState: 'Final' } }), null);
  assert.strictEqual(Object.keys(log.games).length, 0);
});

test('invalid team/game mapping is never snapshotted', function () {
  var log = T.emptyLog();
  assert.strictEqual(snap(log, { awayTeamId: null }), null);
  assert.strictEqual(snap(log, { gamePk: 0 }), null);
  assert.strictEqual(snap(log, { winner: undefined }), null);
});

test('original snapshot is not overwritten by a second scan', function () {
  var log = T.emptyLog();
  snap(log);
  var again = T.makeSnapshot(scanResult({ winner: 'home', homeWinProb: 70, awayWinProb: 30 }), rawGame(), {});
  assert.strictEqual(T.addSnapshot(log, again), false, 'second add refused');
  assert.strictEqual(log.games['777001'].predWinner, 'away', 'first prediction preserved');
});

test('duplicate games are not counted twice (keyed by gamePk)', function () {
  var log = T.emptyLog();
  snap(log); snap(log); snap(log);
  assert.strictEqual(Object.keys(log.games).length, 1);
});

test('doubleheaders tracked separately by unique gamePk', function () {
  var log = T.emptyLog();
  snap(log, { gamePk: 777001 }, { gamePk: 777001 });
  snap(log, { gamePk: 777002, winner: 'home' }, { gamePk: 777002 });
  T.gradeGame(log, 777001, FINAL_AWAY);
  T.gradeGame(log, 777002, FINAL_AWAY);
  assert.strictEqual(log.games['777001'].status, 'win');
  assert.strictEqual(log.games['777002'].status, 'loss');
});

// ── Grading rules ──────────────────────────────────────────────────────────
console.log('\ngrading rules');

test('correct predicted winner grades WIN', function () {
  var log = T.emptyLog();
  snap(log);
  assert.strictEqual(T.gradeGame(log, 777001, FINAL_AWAY, '2026-07-10T03:00:00Z'), 'win');
  var e = log.games['777001'];
  assert.strictEqual(e.actualWinner, 'away');
  assert.strictEqual(e.actualAway, 6);
  assert.strictEqual(e.gradedAt, '2026-07-10T03:00:00Z');
});

test('incorrect predicted winner grades LOSS', function () {
  var log = T.emptyLog();
  snap(log);
  assert.strictEqual(T.gradeGame(log, 777001, FINAL_HOME), 'loss');
});

test('tie prediction grades NO CALL, not win or loss', function () {
  var log = T.emptyLog();
  snap(log, { winner: 'tie' });
  assert.strictEqual(T.gradeGame(log, 777001, FINAL_AWAY), 'nocall');
});

test('pending game is not graded', function () {
  var log = T.emptyLog();
  snap(log);
  assert.strictEqual(T.gradeGame(log, 777001, { abstractState: 'Live', detailedState: 'In Progress', awayScore: 3, homeScore: 1 }), null);
  assert.strictEqual(log.games['777001'].status, 'pending');
});

test('postponed game is marked postponed, never a loss', function () {
  var log = T.emptyLog();
  snap(log);
  assert.strictEqual(T.gradeGame(log, 777001, { abstractState: 'Preview', detailedState: 'Postponed', awayScore: null, homeScore: null }), 'postponed');
  var s = T.computeStats(log, '2026-07-10', 10);
  assert.strictEqual(s.losses, 0);
  assert.strictEqual(s.postponed, 1);
});

test('suspended unfinished game is not graded, but grades when finally Final', function () {
  var log = T.emptyLog();
  snap(log);
  assert.strictEqual(T.gradeGame(log, 777001, { abstractState: 'Live', detailedState: 'Suspended: Rain', awayScore: 2, homeScore: 2 }), 'suspended');
  assert.strictEqual(T.computeStats(log, '2026-07-10', 10).graded, 0);
  assert.strictEqual(T.gradeGame(log, 777001, FINAL_AWAY), 'win');
});

test('final with missing or equal scores is never graded', function () {
  var log = T.emptyLog();
  snap(log);
  assert.strictEqual(T.gradeGame(log, 777001, { abstractState: 'Final', detailedState: 'Final', awayScore: null, homeScore: 4 }), null);
  assert.strictEqual(T.gradeGame(log, 777001, { abstractState: 'Final', detailedState: 'Final', awayScore: 4, homeScore: 4 }), null);
  assert.strictEqual(log.games['777001'].status, 'pending');
});

test('graded result is immutable — regrade attempts are refused', function () {
  var log = T.emptyLog();
  snap(log);
  T.gradeGame(log, 777001, FINAL_AWAY);
  assert.strictEqual(T.gradeGame(log, 777001, FINAL_HOME), null);
  assert.strictEqual(log.games['777001'].status, 'win');
  assert.strictEqual(log.games['777001'].actualWinner, 'away');
});

test('sim results attach only pre-game while pending', function () {
  var log = T.emptyLog();
  snap(log);
  assert.strictEqual(T.attachSim(log, 777001, { awayWins: 58, homeWins: 42, simWinner: 'away' }, 'Preview'), true);
  assert.strictEqual(log.games['777001'].simAwayPct, 58);
  assert.strictEqual(T.attachSim(log, 777001, { awayWins: 90, homeWins: 10, simWinner: 'away' }, 'Live'), false);
  assert.strictEqual(log.games['777001'].simAwayPct, 58, 'live sim result did not overwrite');
});

// ── 10-day window + stats ──────────────────────────────────────────────────
console.log('\nlast-10-days stats');

test('window is the previous 10 days, excluding today', function () {
  var w = T.windowDates('2026-07-10', 10);
  assert.strictEqual(w.length, 10);
  assert.strictEqual(w[0], '2026-07-09');
  assert.strictEqual(w[9], '2026-06-30');
  assert.strictEqual(w.indexOf('2026-07-10'), -1);
});

test('window crosses month boundaries correctly', function () {
  var w = T.windowDates('2026-07-03', 10);
  assert.strictEqual(w[2], '2026-06-30');
  assert.strictEqual(w[9], '2026-06-23');
});

test('accuracy counts only graded wins/losses; pending and today excluded', function () {
  var log = T.emptyLog();
  var mk = function (pk, date, winner, grade) {
    snap(log, { gamePk: pk, winner: winner || 'away' }, { gamePk: pk, officialDate: date });
    if (grade) T.gradeGame(log, pk, grade);
  };
  mk(1, '2026-07-09', 'away', FINAL_AWAY);          // win
  mk(2, '2026-07-09', 'away', FINAL_HOME);          // loss
  mk(3, '2026-07-08', 'away', FINAL_AWAY);          // win
  mk(4, '2026-07-08', 'away', null);                // pending — excluded
  mk(5, '2026-07-08', 'tie',  FINAL_AWAY);          // nocall — excluded
  mk(6, '2026-07-10', 'away', FINAL_AWAY);          // TODAY — excluded from window
  var s = T.computeStats(log, '2026-07-10', 10);
  assert.strictEqual(s.graded, 3);
  assert.strictEqual(s.wins, 2);
  assert.strictEqual(s.losses, 1);
  assert.strictEqual(s.pct, 66.7);
  assert.strictEqual(s.pending, 1);
  assert.strictEqual(s.nocalls, 1);
});

test('daily rows are newest-first with per-day accuracy', function () {
  var log = T.emptyLog();
  snap(log, { gamePk: 1 }, { gamePk: 1, officialDate: '2026-07-09' });
  T.gradeGame(log, 1, FINAL_AWAY);
  snap(log, { gamePk: 2 }, { gamePk: 2, officialDate: '2026-07-07' });
  T.gradeGame(log, 2, FINAL_HOME);
  var s = T.computeStats(log, '2026-07-10', 10);
  assert.strictEqual(s.daily.length, 2);
  assert.strictEqual(s.daily[0].date, '2026-07-09');
  assert.strictEqual(s.daily[0].pct, 100);
  assert.strictEqual(s.daily[1].date, '2026-07-07');
  assert.strictEqual(s.daily[1].pct, 0);
  assert.strictEqual(s.daysWithData, 2);
});

test('current winning streak walks back from most recent graded game', function () {
  var log = T.emptyLog();
  var mk = function (pk, iso, grade) {
    snap(log, { gamePk: pk, gameDate: iso }, { gamePk: pk, officialDate: iso.slice(0, 10), gameDate: iso });
    T.gradeGame(log, pk, grade);
  };
  mk(1, '2026-07-07T20:00:00Z', FINAL_HOME); // loss (oldest)
  mk(2, '2026-07-08T20:00:00Z', FINAL_AWAY); // win
  mk(3, '2026-07-09T18:00:00Z', FINAL_AWAY); // win
  mk(4, '2026-07-09T23:00:00Z', FINAL_AWAY); // win (newest)
  var s = T.computeStats(log, '2026-07-10', 10);
  assert.strictEqual(s.streak, 3);
});

test('best and worst day computed among graded days', function () {
  var log = T.emptyLog();
  var mk = function (pk, date, grade) {
    snap(log, { gamePk: pk }, { gamePk: pk, officialDate: date });
    T.gradeGame(log, pk, grade);
  };
  mk(1, '2026-07-09', FINAL_AWAY); mk(2, '2026-07-09', FINAL_AWAY);   // 100% day
  mk(3, '2026-07-08', FINAL_HOME); mk(4, '2026-07-08', FINAL_AWAY);   // 50% day
  var s = T.computeStats(log, '2026-07-10', 10);
  assert.strictEqual(s.bestDay.date, '2026-07-09');
  assert.strictEqual(s.worstDay.date, '2026-07-08');
});

test('confidence / edge / lineup breakdowns bucket graded games only', function () {
  var log = T.emptyLog();
  snap(log, { gamePk: 1, confidence: 'High', winEdge: 'Strong Edge' }, { gamePk: 1, officialDate: '2026-07-09' });
  T.gradeGame(log, 1, FINAL_AWAY);
  snap(log, { gamePk: 2, confidence: 'Low', winEdge: 'Toss-Up', awayPosted: false }, { gamePk: 2, officialDate: '2026-07-09' });
  T.gradeGame(log, 2, FINAL_HOME);
  snap(log, { gamePk: 3, confidence: 'High' }, { gamePk: 3, officialDate: '2026-07-09' }); // pending — not bucketed
  var s = T.computeStats(log, '2026-07-10', 10);
  assert.strictEqual(s.byConfidence['High'].wins, 1);
  assert.strictEqual(s.byConfidence['Low'].losses, 1);
  assert.strictEqual(s.byEdge['Strong Edge'].pct, 100);
  assert.strictEqual(s.byLineup['Confirmed lineups'].wins, 1);
  assert.strictEqual(s.byLineup['Projected lineups'].losses, 1);
});

test('simulator agree/disagree splits', function () {
  var log = T.emptyLog();
  snap(log, { gamePk: 1 }, { gamePk: 1, officialDate: '2026-07-09' });
  T.attachSim(log, 1, { awayWins: 60, homeWins: 40, simWinner: 'away' }, 'Preview'); // agrees with model (away)
  T.gradeGame(log, 1, FINAL_AWAY);  // model win + sim favorite win
  snap(log, { gamePk: 2 }, { gamePk: 2, officialDate: '2026-07-09' });
  T.attachSim(log, 2, { awayWins: 35, homeWins: 65, simWinner: 'home' }, 'Preview'); // disagrees with model
  T.gradeGame(log, 2, FINAL_HOME);  // model loss, sim favorite win
  var s = T.computeStats(log, '2026-07-10', 10);
  assert.strictEqual(s.bySim.favorite.wins, 2);
  assert.strictEqual(s.bySim.agree.wins, 1);
  assert.strictEqual(s.bySim.disagree.losses, 1);
});

test('empty log produces empty-but-valid stats', function () {
  var s = T.computeStats(T.emptyLog(), '2026-07-10', 10);
  assert.strictEqual(s.graded, 0);
  assert.strictEqual(s.pct, null);
  assert.strictEqual(s.daily.length, 0);
  assert.strictEqual(s.streak, 0);
  assert.strictEqual(s.bestDay, null);
});

// ── All-time (season-to-date) record ───────────────────────────────────────
console.log('\ncomputeAllTime');

test('all-time record spans the whole log, ignoring the 10-day window', function () {
  var log = T.emptyLog();
  var mk = function (pk, date, final) {
    snap(log, { gamePk: pk }, { gamePk: pk, officialDate: date });
    if (final) T.gradeGame(log, pk, final);
  };
  mk(1, '2026-05-01', FINAL_AWAY);  // win, far outside any 10-day window
  mk(2, '2026-06-15', FINAL_HOME);  // loss
  mk(3, '2026-07-09', FINAL_AWAY);  // win
  mk(4, '2026-07-10', null);        // pending — not counted
  var a = T.computeAllTime(log);
  assert.strictEqual(a.wins, 2);
  assert.strictEqual(a.losses, 1);
  assert.strictEqual(a.graded, 3);
  assert.strictEqual(Math.round(a.pct), 67);
  assert.strictEqual(a.since, '2026-05-01');
  // sanity: the 10-day window sees only the recent win
  var s = T.computeStats(log, '2026-07-10', 10);
  assert.strictEqual(s.graded, 1);
});

test('empty log yields null pct and since', function () {
  var a = T.computeAllTime(T.emptyLog());
  assert.strictEqual(a.graded, 0);
  assert.strictEqual(a.pct, null);
  assert.strictEqual(a.since, null);
});

// ── Pre-game snapshot refresh ──────────────────────────────────────────────
console.log('\nrefreshSnapshot');

test('pending snapshot refreshes with new pick, keeps predictedAt and sims', function () {
  var log = T.emptyLog();
  snap(log, { winner: 'away', awayPitcherName: null }, { }); // morning: TBD pitcher
  T.attachSim(log, 777001, { awayWins: 60, homeWins: 40, simWinner: 'away' }, 'Preview');
  var orig = log.games['777001'];
  assert.strictEqual(orig.awayPitcher, null);

  var evening = T.makeSnapshot(
    scanResult({ winner: 'home', awayWinProb: 42, homeWinProb: 58, awayPitcherName: 'G. Cole' }),
    rawGame({}), { predictedAt: '2026-07-10T22:00:00Z' });
  assert.strictEqual(T.refreshSnapshot(log, evening, '2026-07-10T22:00:00Z'), true);
  var e = log.games['777001'];
  assert.strictEqual(e.predWinner, 'home', 'pick updated');
  assert.strictEqual(e.awayPitcher, 'G. Cole', 'pitcher updated');
  assert.strictEqual(e.predictedAt, orig.predictedAt, 'original predictedAt preserved');
  assert.strictEqual(e.simAwayPct, 60, 'sim results carried over');
  assert.strictEqual(e.updateCount, 1);
  assert.strictEqual(e.updatedAt, '2026-07-10T22:00:00Z');
});

test('refresh is a no-op when nothing material changed', function () {
  var log = T.emptyLog();
  snap(log);
  var same = T.makeSnapshot(scanResult({}), rawGame({}), { predictedAt: 'later' });
  assert.strictEqual(T.refreshSnapshot(log, same, 'later'), false);
  assert.strictEqual(log.games['777001'].updateCount, undefined);
});

test('graded and non-pending entries never refresh', function () {
  var log = T.emptyLog();
  snap(log);
  T.gradeGame(log, 777001, FINAL_AWAY); // win — immutable now
  var upd = T.makeSnapshot(scanResult({ winner: 'home' }), rawGame({}), {});
  assert.strictEqual(T.refreshSnapshot(log, upd, 'x'), false);
  assert.strictEqual(log.games['777001'].predWinner, 'away');
});

test('makeSnapshot still refuses non-Preview, so no refresh after first pitch', function () {
  var live = T.makeSnapshot(scanResult({ winner: 'home' }), rawGame({ status: { abstractGameState: 'Live' } }), {});
  assert.strictEqual(live, null);
});

// ── Miss memory (lessons) ──────────────────────────────────────────────────
console.log('\nmiss memory');

test('classifyMiss identifies ERA Trap, Bullpen Collapse, and winner-side misses', function () {
  var base = { lineup: 50, form: 0, starter: 0, bullpen: 0, arsenal: 0, platoon: 0 };
  assert.strictEqual(T.classifyMiss(Object.assign({}, base, { starter: 9 }), base), 'ERA Trap');
  assert.strictEqual(T.classifyMiss(Object.assign({}, base, { bullpen: 7 }), base), 'Bullpen Collapse');
  assert.strictEqual(T.classifyMiss(Object.assign({}, base, { lineup: 56 }), Object.assign({}, base, { starter: 5 })), 'Pitcher Dominance');
  assert.strictEqual(T.classifyMiss(base, Object.assign({}, base, { starter: 4 })), 'SP Outperformance');
  assert.strictEqual(T.classifyMiss(base, Object.assign({}, base, { lineup: 55 })), 'Lineup Underrated');
  assert.strictEqual(T.classifyMiss(base, base, { bothProjected: true }), 'Lineup Uncertainty');
  assert.strictEqual(T.classifyMiss(base, base), 'Marginal Miss');
  assert.strictEqual(T.classifyMiss(null, base), 'Unclassified');
});

test('setMissCategory is write-once and losses-only', function () {
  var log = T.emptyLog();
  snap(log);
  assert.strictEqual(T.setMissCategory(log, 777001, 'ERA Trap'), false, 'pending entry refused');
  T.gradeGame(log, 777001, FINAL_HOME); // loss
  assert.strictEqual(T.setMissCategory(log, 777001, 'ERA Trap'), true);
  assert.strictEqual(T.setMissCategory(log, 777001, 'Bullpen Collapse'), false, 'second write refused');
  assert.strictEqual(log.games['777001'].missCategory, 'ERA Trap');
  var log2 = T.emptyLog();
  snap(log2);
  T.gradeGame(log2, 777001, FINAL_AWAY); // win
  assert.strictEqual(T.setMissCategory(log2, 777001, 'ERA Trap'), false, 'wins never get a miss category');
});

test('missPatterns counts recent loss categories, including today', function () {
  var log = T.emptyLog();
  var mk = function (pk, date, cat) {
    snap(log, { gamePk: pk }, { gamePk: pk, officialDate: date });
    T.gradeGame(log, pk, FINAL_HOME); // loss
    if (cat) T.setMissCategory(log, pk, cat);
  };
  mk(1, '2026-07-10', 'ERA Trap');        // today
  mk(2, '2026-07-09', 'ERA Trap');
  mk(3, '2026-07-08', 'Bullpen Collapse');
  mk(4, '2026-06-25', 'ERA Trap');        // outside window — excluded
  mk(5, '2026-07-07', null);              // no category — excluded
  var pats = T.missPatterns(log, '2026-07-10', 10);
  assert.strictEqual(pats[0].category, 'ERA Trap');
  assert.strictEqual(pats[0].count, 2);
  assert.strictEqual(pats[1].category, 'Bullpen Collapse');
  assert.strictEqual(pats[1].count, 1);
});

test('normalizeLog recovers from corrupt storage', function () {
  assert.strictEqual(T.normalizeLog(null).version, T.SCHEMA_VERSION);
  assert.strictEqual(Object.keys(T.normalizeLog({ junk: 1 }).games).length, 0);
  var ok = T.normalizeLog({ version: 1, games: { '5': { gamePk: 5 } } });
  assert.strictEqual(ok.games['5'].gamePk, 5);
});

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
