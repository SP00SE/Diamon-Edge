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

// ── buildMatchupContext ──────────────────────────────────────────────────────
console.log('\nbuildMatchupContext');

function mkRaw(overrides) {
  var base = {
    player: {
      seasonStats: { avg: 0.265, obp: 0.330, slg: 0.420, babip: 0.295,
                     bacon: 0.290, atBats: 150, strikeOuts: 30, plateAppearances: 170 },
      vsRHP: { atBats: 100, avg: 0.265, obp: 0.330, slg: 0.420 },
      vsLHP: { atBats: 50,  avg: 0.265, obp: 0.330, slg: 0.420 },
      last7Stats: { avg: 0.265, slg: 0.420 },
      gameLog: (function () {
        var g = [];
        for (var i = 0; i < 14; i++) g.push({ hr: 0, hits: 1, atBats: 4 });
        return g;
      }()),
      hitStreak: 0, parkStats: {}, bats: 'R',
    },
    pitcher: {
      pitchHand: 'R',
      seasonStats: { era: 4.00, kpct: 0.22, babip: 0.300, bacon: 0.290,
                     bbpct: 0.09, whip: 1.30, hr9: 1.10, ip: 60 },
    },
    bullpen:  { era: 4.00, h9: 8.5, hbf: 0.230, hr9: 1.10 },
    park:     { overall: 1.00, rhh: 1.00, lhh: 1.00 },
    weather:  { tempF: 68, windMph: 5, windDir: 'cross' },
    h2h: null, savantBatter: null, savantPitcher: null,
    lineupStatus: 'confirmed', battingOrder: 4,
  };
  var result = {};
  Object.keys(base).forEach(function (k) { result[k] = base[k]; });
  Object.keys(overrides || {}).forEach(function (k) { result[k] = overrides[k]; });
  return result;
}

test('lineupStatus preserved', function () {
  var ctx = s.buildMatchupContext(mkRaw({ lineupStatus: 'projected' }));
  assert.strictEqual(ctx.lineupStatus, 'projected');
});
test('dataFlags.savantMissing true when savantBatter null', function () {
  assert.strictEqual(s.buildMatchupContext(mkRaw()).dataFlags.savantMissing, true);
});
test('dataFlags.savantMissing false when both arrays present', function () {
  var ctx = s.buildMatchupContext(mkRaw({ savantBatter: [{}], savantPitcher: [{}] }));
  assert.strictEqual(ctx.dataFlags.savantMissing, false);
});
test('dataFlags.smallBatterSample true when atBats < 50', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player,
    { seasonStats: Object.assign({}, raw.player.seasonStats, { atBats: 30 }) });
  assert.strictEqual(s.buildMatchupContext(raw).dataFlags.smallBatterSample, true);
});
test('enriches recentHR from last 14 game log entries', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, {
    gameLog: (function () {
      var g = [];
      for (var i = 0; i < 14; i++) g.push({ hr: i < 3 ? 1 : 0, hits: 1, atBats: 4 });
      return g;
    }()),
  });
  assert.strictEqual(s.buildMatchupContext(raw).player.recentHR, 3);
});
test('enriches hitGames7 from last 7 entries', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, {
    gameLog: (function () {
      var g = [];
      for (var i = 0; i < 14; i++) g.push({ hr: 0, hits: i < 7 ? 1 : 0, atBats: 4 });
      return g;
    }()),
  });
  // Last 7 entries have hits=0
  assert.strictEqual(s.buildMatchupContext(raw).player.hitGames7, 0);
});
test('park falls back to neutral when null', function () {
  assert.strictEqual(s.buildMatchupContext(mkRaw({ park: null })).park.overall, 1.0);
});

console.log('\ncomputePCP');
function mkCtx(ov) { return s.buildMatchupContext(mkRaw(ov)); }

test('elite K% (0.33) gives -6 from K component', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: { kpct: 0.33, babip: 0.300, whip: 1.10, ip: 60 } };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, -6);
  assert.strictEqual(r.hasData, true);
});
test('low K% (0.17) with good WHIP (1.50) gives +7', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: { kpct: 0.17, babip: 0.300, whip: 1.50, ip: 60 } };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, 7);
});
test('high BABIP (.335) and WHIP (1.50) give +5', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: { kpct: 0.22, babip: 0.335, whip: 1.50, ip: 60 } };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, 5);
});
test('low BABIP (.250) and WHIP (0.90) give -7', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: { kpct: 0.22, babip: 0.250, whip: 0.90, ip: 60 } };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, -7);
});
test('clamped to -10', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: { kpct: 0.35, babip: 0.250, whip: 0.85, ip: 60 } };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, -10);
});
test('empty pitcher stats returns hasData false', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: {} };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.hasData, false);
  assert.strictEqual(r.value, 0);
});

console.log('\ncomputeBCQ');

test('high AVG (.320) + OBP (.390) gives +7 (no Savant)', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player,
    { seasonStats: Object.assign({}, raw.player.seasonStats, { avg: 0.320, obp: 0.390 }) });
  var r = s.computeBCQ(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, 7);
});
test('low AVG (.210) + OBP (.280) gives -6', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player,
    { seasonStats: Object.assign({}, raw.player.seasonStats, { avg: 0.210, obp: 0.280 }) });
  var r = s.computeBCQ(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, -6);
});
test('low batter whiff% (15%) adds +3', function () {
  var raw = mkRaw({ savantBatter: [{ pitch_usage: '100', whiff_percent: '15' }],
                    savantPitcher: [{}] });
  var r = s.computeBCQ(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, 3);
});
test('high batter whiff% (37%) adds -4', function () {
  var raw = mkRaw({ savantBatter: [{ pitch_usage: '100', whiff_percent: '37' }],
                    savantPitcher: [{}] });
  var r = s.computeBCQ(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, -4);
});
test('no stats returns hasData false', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, { seasonStats: {} });
  var r = s.computeBCQ(s.buildMatchupContext(raw));
  assert.strictEqual(r.hasData, false);
  assert.strictEqual(r.value, 0);
});
test('clamped to +12 max', function () {
  var raw = mkRaw({ savantBatter: [{ pitch_usage: '100', whiff_percent: '12' }],
                    savantPitcher: [{}] });
  raw.player = Object.assign({}, raw.player,
    { seasonStats: Object.assign({}, raw.player.seasonStats, { avg: 0.350, obp: 0.420 }) });
  var r = s.computeBCQ(s.buildMatchupContext(raw));
  assert.ok(r.value <= 12);
});

console.log('\ncomputeRF');

test('hot L7 (.360) scores >= +5', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, { last7Stats: { avg: 0.360 } });
  var r = s.computeRF(s.buildMatchupContext(raw));
  assert.ok(r.value >= 5);
  assert.strictEqual(r.hasData, true);
});
test('cold L7 (.160) and hitless log scores <= -4', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, {
    last7Stats: { avg: 0.160 },
    gameLog: (function () { var g = []; for (var i = 0; i < 14; i++) g.push({ hr: 0, hits: 0, atBats: 4 }); return g; }()),
  });
  var r = s.computeRF(s.buildMatchupContext(raw));
  assert.ok(r.value <= -4);
});
test('GHP scaled with only 4 recent games', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, {
    gameLog: [{ hr:0,hits:1,atBats:3 },{ hr:0,hits:1,atBats:3 },
              { hr:0,hits:1,atBats:3 },{ hr:0,hits:1,atBats:3 }],
    last7Stats: { avg: 0.333 },
  });
  var r = s.computeRF(s.buildMatchupContext(raw));
  assert.ok(r.value > 0 && r.value < 10);
});
test('7-game hit streak adds +2', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, { hitStreak: 7, last7Stats: { avg: 0.300 } });
  var r = s.computeRF(s.buildMatchupContext(raw));
  assert.ok(r.value >= 5);
});
test('last 3 hitless reduces vs same without hitless', function () {
  var makeLog = function (lastHitless) {
    var g = [];
    for (var i = 0; i < 11; i++) g.push({ hr:0,hits:1,atBats:4 });
    for (var j = 0; j < 3; j++) g.push({ hr:0,hits:lastHitless?0:1,atBats:4 });
    return g;
  };
  var rawHitless = mkRaw();
  rawHitless.player = Object.assign({}, rawHitless.player, { gameLog: makeLog(true),  last7Stats:{avg:0.265},hitStreak:0 });
  var rawNormal  = mkRaw();
  rawNormal.player  = Object.assign({}, rawNormal.player,  { gameLog: makeLog(false), last7Stats:{avg:0.265},hitStreak:0 });
  var rHitless = s.computeRF(s.buildMatchupContext(rawHitless));
  var rNormal  = s.computeRF(s.buildMatchupContext(rawNormal));
  assert.ok(rHitless.value < rNormal.value);
});

console.log('\nResults:', pass, 'passed,', fail, 'failed');
if (fail > 0) process.exit(1);
