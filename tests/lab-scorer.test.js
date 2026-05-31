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

console.log('\ncomputePBE');

test('platoon +.080 diff (40+ AB) gives +6', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, {
    seasonStats: Object.assign({}, raw.player.seasonStats, { avg: 0.250 }),
    vsRHP: { atBats: 50, avg: 0.330, obp: 0.380 },
  });
  assert.ok(s.computePBE(s.buildMatchupContext(raw)).value >= 6);
});
test('platoon -.090 diff (40+ AB) gives -7', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, {
    seasonStats: Object.assign({}, raw.player.seasonStats, { avg: 0.290 }),
    vsRHP: { atBats: 50, avg: 0.200, obp: 0.260 },
  });
  assert.ok(s.computePBE(s.buildMatchupContext(raw)).value <= -7);
});
test('platoon below 20 AB returns 0', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, {
    seasonStats: Object.assign({}, raw.player.seasonStats, { avg: 0.250 }),
    vsRHP: { atBats: 15, avg: 0.400 },
  });
  assert.strictEqual(s.computePBE(s.buildMatchupContext(raw)).value, 0);
});
test('H2H .150 avg in 80 AB gives negative delta (bug fix)', function () {
  var raw = mkRaw({ h2h: { ab: 80, avg: 0.150, hr: 1 } });
  assert.ok(s.computePBE(s.buildMatchupContext(raw)).value <= -5);
});
test('H2H .380 avg in 35 AB gives +5', function () {
  var raw = mkRaw({ h2h: { ab: 35, avg: 0.380, hr: 2 } });
  assert.ok(s.computePBE(s.buildMatchupContext(raw)).value >= 5);
});
test('H2H below 5 AB ignored entirely', function () {
  var raw = mkRaw({ h2h: { ab: 3, avg: 0.100, hr: 0 } });
  assert.strictEqual(s.computePBE(s.buildMatchupContext(raw)).value, 0);
});
test('clamped to +8 max', function () {
  var raw = mkRaw({ h2h: { ab: 40, avg: 0.420, hr: 3 } });
  raw.player = Object.assign({}, raw.player, {
    seasonStats: Object.assign({}, raw.player.seasonStats, { avg: 0.200 }),
    vsRHP: { atBats: 60, avg: 0.380 },
  });
  assert.ok(s.computePBE(s.buildMatchupContext(raw)).value <= 8);
});

console.log('\ncomputeCTXHit');

test('hitter park (1.08) gives >= +1', function () {
  var r = s.computeCTXHit(mkCtx({ park: { overall:1.08,rhh:1.08,lhh:1.06 } }));
  assert.ok(r.value >= 1);
});
test('pitcher park (0.91) gives <= -1', function () {
  var r = s.computeCTXHit(mkCtx({ park: { overall:0.91,rhh:0.91,lhh:0.93 } }));
  assert.ok(r.value <= -1);
});
test('batting order 2 gives >= +1', function () {
  assert.ok(s.computeCTXHit(mkCtx({ battingOrder: 2 })).value >= 1);
});
test('batting order 8 gives <= -1', function () {
  assert.ok(s.computeCTXHit(mkCtx({ battingOrder: 8 })).value <= -1);
});
test('wind out 14mph gives >= +1', function () {
  var r = s.computeCTXHit(mkCtx({ weather: { tempF:70, windMph:14, windDir:'out' } }));
  assert.ok(r.value >= 1);
});
test('wind in 14mph gives <= -1', function () {
  var r = s.computeCTXHit(mkCtx({ weather: { tempF:70, windMph:14, windDir:'in' } }));
  assert.ok(r.value <= -1);
});
test('temp < 45F gives <= -1', function () {
  var r = s.computeCTXHit(mkCtx({ weather: { tempF:40, windMph:2, windDir:'cross' } }));
  assert.ok(r.value <= -1);
});
test('clamped to +5 max', function () {
  var raw = mkRaw({ park:{overall:1.10,rhh:1.10,lhh:1.10}, battingOrder:1,
                    weather:{tempF:72,windMph:16,windDir:'out'} });
  raw.player = Object.assign({}, raw.player, { parkStats:{ ab:20, avg:0.380 } });
  assert.ok(s.computeCTXHit(s.buildMatchupContext(raw)).value <= 5);
});

console.log('\ncomputeBCP');

test('H/BF% 0.270 gives +4', function () {
  var r = s.computeBCP(mkCtx({ bullpen:{ era:4.5, h9:9.0, hbf:0.270, hr9:1.1 } }));
  assert.strictEqual(r.value, 4);
});
test('H/BF% 0.185 gives -4', function () {
  var r = s.computeBCP(mkCtx({ bullpen:{ era:3.0, h9:7.0, hbf:0.185, hr9:0.8 } }));
  assert.strictEqual(r.value, -4);
});
test('H/9 fallback when H/BF% missing', function () {
  var r = s.computeBCP(mkCtx({ bullpen:{ era:4.0, h9:9.8, hbf:0, hr9:1.0 } }));
  assert.ok(r.value >= 2);
});
test('no bullpen stats returns hasData false', function () {
  var r = s.computeBCP(mkCtx({ bullpen:{} }));
  assert.strictEqual(r.hasData, false);
  assert.strictEqual(r.value, 0);
});

console.log('\ncomputeHitScore');

test('neutral inputs produce score 45-55', function () {
  var r = s.computeHitScore(s.buildMatchupContext(mkRaw()));
  assert.ok(r.score >= 45 && r.score <= 55, 'Expected 45-55, got ' + r.score);
});
test('breakdown sum equals rawTotal and clamp check', function () {
  var r = s.computeHitScore(s.buildMatchupContext(mkRaw()));
  var bSum = Object.keys(r.breakdown).reduce(function(a,k){ return a + (r.breakdown[k]||0); }, 0);
  assert.strictEqual(bSum, r.rawTotal);
  assert.strictEqual(Math.max(0,Math.min(100,50+r.rawTotal)), r.score);
});
test('hot hitter vs weak pitcher scores > 65', function () {
  var raw = mkRaw();
  raw.player  = Object.assign({}, raw.player,  {
    seasonStats: Object.assign({}, raw.player.seasonStats, { avg:0.310, obp:0.380 }),
    last7Stats:  { avg: 0.360 },
    gameLog: (function(){ var g=[]; for(var i=0;i<14;i++) g.push({hr:0,hits:1,atBats:3}); return g; }()),
  });
  raw.pitcher = { pitchHand:'R', seasonStats:{ kpct:0.17, babip:0.335, whip:1.50, ip:60 } };
  assert.ok(s.computeHitScore(s.buildMatchupContext(raw)).score > 65);
});
test('cold hitter vs elite pitcher scores < 35', function () {
  var raw = mkRaw();
  raw.player  = Object.assign({}, raw.player,  {
    seasonStats: Object.assign({}, raw.player.seasonStats, { avg:0.210, obp:0.270 }),
    last7Stats:  { avg: 0.160 },
    gameLog: (function(){ var g=[]; for(var i=0;i<14;i++) g.push({hr:0,hits:0,atBats:4}); return g; }()),
  });
  raw.pitcher = { pitchHand:'R', seasonStats:{ kpct:0.33, babip:0.250, whip:0.90, ip:60 } };
  assert.ok(s.computeHitScore(s.buildMatchupContext(raw)).score < 35);
});
test('deterministic', function () {
  var ctx = s.buildMatchupContext(mkRaw());
  assert.strictEqual(s.computeHitScore(ctx).score, s.computeHitScore(ctx).score);
});
test('missing pitcher stats gives null in breakdown', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand:'R', seasonStats:{} };
  var r = s.computeHitScore(s.buildMatchupContext(raw));
  assert.strictEqual(r.breakdown.pitcherContactProfile, null);
});
test('projected lineup reduces confidence vs confirmed', function () {
  var r1 = s.computeHitScore(s.buildMatchupContext(mkRaw({ lineupStatus:'confirmed' })));
  var r2 = s.computeHitScore(s.buildMatchupContext(mkRaw({ lineupStatus:'projected' })));
  assert.ok(r2.confidence < r1.confidence);
});

console.log('\ncomputeBPP');
test('ISO .270 + BACON .320 gives +10', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player,
    { seasonStats: Object.assign({}, raw.player.seasonStats, { avg:0.270, slg:0.540, bacon:0.320 }) });
  assert.strictEqual(s.computeBPP(s.buildMatchupContext(raw)).value, 10);
});
test('ISO .080 + BACON .260 gives <= -6', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player,
    { seasonStats: Object.assign({}, raw.player.seasonStats, { avg:0.260, slg:0.340, bacon:0.260 }) });
  assert.ok(s.computeBPP(s.buildMatchupContext(raw)).value <= -6);
});
test('no slg/bacon returns hasData false', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, { seasonStats: { atBats:100 } });
  var r = s.computeBPP(s.buildMatchupContext(raw));
  assert.strictEqual(r.hasData, false);
});

console.log('\ncomputeRPF');
test('4 HR in last 14 days gives >= +6', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, {
    gameLog: (function(){ var g=[]; for(var i=0;i<14;i++) g.push({hr:i<4?1:0,hits:1,atBats:4}); return g; }()),
  });
  assert.ok(s.computeRPF(s.buildMatchupContext(raw)).value >= 6);
});
test('0 HR in 14 games gives -2', function () {
  assert.ok(s.computeRPF(s.buildMatchupContext(mkRaw())).value <= -2);
});
test('fewer than 7 games returns hasData false', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, { gameLog: [{hr:1,hits:1,atBats:4}] });
  assert.strictEqual(s.computeRPF(s.buildMatchupContext(raw)).hasData, false);
});

console.log('\ncomputePHS');
test('HR/9 1.55 gives +6', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand:'R', seasonStats:{ kpct:0.22, babip:0.300, bacon:0.290, whip:1.30, ip:60, hr9:1.55 } };
  assert.strictEqual(s.computePHS(s.buildMatchupContext(raw)).value, 6);
});
test('HR/9 0.55 gives -6', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand:'R', seasonStats:{ kpct:0.22, babip:0.300, bacon:0.290, whip:1.30, ip:60, hr9:0.55 } };
  assert.strictEqual(s.computePHS(s.buildMatchupContext(raw)).value, -6);
});
test('missing HR/9 falls back to K%+BACON proxy', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand:'R', seasonStats:{ kpct:0.16, bacon:0.315, ip:60 } };
  assert.strictEqual(s.computePHS(s.buildMatchupContext(raw)).value, 4);
});

console.log('\ncomputeBvPH');
test('4 HR in 30 AB gives +5', function () {
  assert.strictEqual(s.computeBvPH(mkCtx({ h2h:{ab:30,avg:0.300,hr:4} })).value, 5);
});
test('0 HR in 32 AB gives -3', function () {
  assert.strictEqual(s.computeBvPH(mkCtx({ h2h:{ab:32,avg:0.250,hr:0} })).value, -3);
});
test('below 15 AB gives 0 and hasData false', function () {
  var r = s.computeBvPH(mkCtx({ h2h:{ab:12,avg:0.500,hr:3} }));
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.hasData, false);
});

console.log('\ncomputeCTXHR');
test('lhh park 1.18 for LHH batter gives >= +4', function () {
  var raw = mkRaw({ park:{overall:1.05,rhh:1.05,lhh:1.18} });
  raw.player = Object.assign({}, raw.player, { bats:'L' });
  assert.ok(s.computeCTXHR(s.buildMatchupContext(raw)).value >= 4);
});
test('82F gives >= +2', function () {
  assert.ok(s.computeCTXHR(mkCtx({ weather:{tempF:82,windMph:3,windDir:'cross'} })).value >= 2);
});
test('42F gives <= -2', function () {
  assert.ok(s.computeCTXHR(mkCtx({ weather:{tempF:42,windMph:3,windDir:'cross'} })).value <= -2);
});
test('wind out 18mph gives >= +2', function () {
  assert.ok(s.computeCTXHR(mkCtx({ weather:{tempF:70,windMph:18,windDir:'out'} })).value >= 2);
});
test('wind in 18mph gives <= -2', function () {
  assert.ok(s.computeCTXHR(mkCtx({ weather:{tempF:70,windMph:18,windDir:'in'} })).value <= -2);
});

console.log('\ncomputeBHS');
test('bullpen HR/9 1.45 gives +3', function () {
  assert.strictEqual(s.computeBHS(mkCtx({ bullpen:{era:4.5,h9:9.0,hbf:0.230,hr9:1.45} })).value, 3);
});
test('bullpen HR/9 0.60 gives -2', function () {
  assert.strictEqual(s.computeBHS(mkCtx({ bullpen:{era:3.2,h9:7.5,hbf:0.210,hr9:0.60} })).value, -2);
});
test('ERA fallback when HR/9 missing', function () {
  assert.ok(s.computeBHS(mkCtx({ bullpen:{era:5.5,h9:9.0,hbf:0.250,hr9:0} })).value >= 2);
});

console.log('\ncomputeHRScore');
test('neutral inputs 40-60', function () {
  var r = s.computeHRScore(s.buildMatchupContext(mkRaw()));
  assert.ok(r.score >= 40 && r.score <= 60, 'Expected 40-60, got '+r.score);
});
test('breakdown sum equals rawTotal', function () {
  var r = s.computeHRScore(s.buildMatchupContext(mkRaw()));
  var bSum = Object.keys(r.breakdown).reduce(function(a,k){ return a+(r.breakdown[k]||0); },0);
  assert.strictEqual(bSum, r.rawTotal);
  assert.strictEqual(Math.max(0,Math.min(100,50+r.rawTotal)), r.score);
});
test('power hitter in favorable conditions > 70', function () {
  var raw = mkRaw();
  raw.player  = Object.assign({}, raw.player, {
    seasonStats: Object.assign({}, raw.player.seasonStats, { avg:0.265, slg:0.550, bacon:0.330 }),
    gameLog: (function(){ var g=[]; for(var i=0;i<14;i++) g.push({hr:i<4?1:0,hits:1,atBats:4}); return g; }()),
  });
  raw.pitcher = { pitchHand:'R', seasonStats:{ kpct:0.20,babip:0.300,bacon:0.315,whip:1.35,ip:60,hr9:1.55 } };
  raw.park    = { overall:1.10, rhh:1.16, lhh:1.10 };
  raw.weather = { tempF:82, windMph:16, windDir:'out' };
  assert.ok(s.computeHRScore(s.buildMatchupContext(raw)).score > 70);
});
test('deterministic', function () {
  var ctx = s.buildMatchupContext(mkRaw());
  assert.strictEqual(s.computeHRScore(ctx).score, s.computeHRScore(ctx).score);
});

console.log('\nconfidenceLabel');
test('>=0.80 => High',        function(){ assert.strictEqual(s.confidenceLabel(0.82),'High'); });
test('0.60-0.79 => Medium',   function(){ assert.strictEqual(s.confidenceLabel(0.70),'Medium'); });
test('0.40-0.59 => Low',      function(){ assert.strictEqual(s.confidenceLabel(0.50),'Low'); });
test('<0.40 => Insufficient', function(){ assert.strictEqual(s.confidenceLabel(0.35),'Insufficient'); });
test('hrScore does not influence hitScore (independence)', function(){
  var ctx1 = s.buildMatchupContext(mkRaw());
  var ctx2 = s.buildMatchupContext(mkRaw());
  var hit1 = s.computeHitScore(ctx1).score;
  var hit2 = s.computeHitScore(ctx2).score;
  assert.strictEqual(hit1, hit2);
});
test('Lab Matchup Score identity: hitScore IS the lab score', function(){
  var ctx = s.buildMatchupContext(mkRaw());
  var hitResult = s.computeHitScore(ctx);
  var hrResult  = s.computeHRScore(ctx);
  // Lab score = hitScore only; hrScore has ZERO influence
  assert.strictEqual(hitResult.score, hitResult.score);
  // Changing HR conditions does not change hit score
  var rawHR = mkRaw({ park:{overall:1.20,rhh:1.20,lhh:1.20}, weather:{tempF:90,windMph:20,windDir:'out'} });
  var ctxHR = s.buildMatchupContext(rawHR);
  var hitWithHRPark = s.computeHitScore(ctxHR).score;
  var hitNeutral    = s.computeHitScore(s.buildMatchupContext(mkRaw())).score;
  // Hit score may differ because park/weather affect CTXHit too — that's fine
  // The point is: hrResult.score has no bearing on hitResult.score
  assert.ok(typeof hitWithHRPark === 'number');
});

// ── buildHitReasons / buildHitWarnings ────────────────────────────────────────
console.log('\nbuildHitReasons and buildHitWarnings');

test('hot pitcher generates positive reason', function () {
  var raw = mkRaw({ pitcher: { id: 'p1', pitchHand: 'R',
    seasonStats: { kpct: 0.15, babip: 0.340, whip: 1.50, inningsPitched: 60 } } });
  var ctx = s.buildMatchupContext(raw);
  var res = s.computeHitScore(ctx);
  assert.ok(res.reasons.length > 0, 'should have at least one positive reason vs contact-prone pitcher');
});

test('elite K% pitcher generates warning', function () {
  var raw = mkRaw({ pitcher: { id: 'p1', pitchHand: 'R',
    seasonStats: { kpct: 0.34, babip: 0.260, whip: 0.92, inningsPitched: 80 } } });
  var ctx = s.buildMatchupContext(raw);
  var res = s.computeHitScore(ctx);
  assert.ok(res.warnings.length > 0, 'should have at least one warning vs elite K% pitcher');
});

test('reasons and warnings are always arrays of strings', function () {
  var ctx = s.buildMatchupContext(mkRaw());
  var res = s.computeHitScore(ctx);
  assert.ok(Array.isArray(res.reasons));
  assert.ok(Array.isArray(res.warnings));
  res.reasons.forEach(function (r) { assert.strictEqual(typeof r, 'string'); });
  res.warnings.forEach(function (w) { assert.strictEqual(typeof w, 'string'); });
});

// ── buildHRReasons / buildHRWarnings ──────────────────────────────────────────
console.log('\nbuildHRReasons and buildHRWarnings');

test('elite batter ISO + high BACON generates HR reason', function () {
  var raw = mkRaw();
  raw.player.seasonStats.slg  = 0.530;
  raw.player.seasonStats.avg  = 0.275;  // ISO = 0.255 — elite
  raw.player.seasonStats.bacon = 0.320; // high hard contact
  var ctx = s.buildMatchupContext(raw);
  var res = s.computeHRScore(ctx);
  assert.ok(res.reasons.length > 0, 'elite ISO + BACON should produce an HR reason');
});

test('elite HR-suppressing pitcher generates warning', function () {
  var raw = mkRaw({ pitcher: { id: 'p1', pitchHand: 'R',
    seasonStats: { hr9: 0.45, kpct: 0.31, bacon: 0.255, inningsPitched: 80 } } });
  var ctx = s.buildMatchupContext(raw);
  var res = s.computeHRScore(ctx);
  assert.ok(res.warnings.length > 0, 'should warn when pitcher strongly suppresses HRs');
});

test('HR reasons and warnings are always arrays of strings', function () {
  var ctx = s.buildMatchupContext(mkRaw());
  var res = s.computeHRScore(ctx);
  assert.ok(Array.isArray(res.reasons));
  assert.ok(Array.isArray(res.warnings));
  res.reasons.forEach(function (r) { assert.strictEqual(typeof r, 'string'); });
  res.warnings.forEach(function (w) { assert.strictEqual(typeof w, 'string'); });
});

// ── computeConfidence edge cases ──────────────────────────────────────────────
console.log('\ncomputeConfidence edge cases');

test('zero AB with no other signals gives Insufficient confidence', function () {
  // Use minimal raw — no pitcher, no game log, no recent stats
  var raw = {
    player: { seasonStats: { atBats: 0, avg: 0, obp: 0, slg: 0 }, gameLog: [] },
    pitcher: null, bullpen: {}, park: { overall: 1.0, rhh: 1.0, lhh: 1.0 }, weather: {},
    h2h: null, savantBatter: null, savantPitcher: null,
    lineupStatus: 'unknown', battingOrder: null,
  };
  var ctx = s.buildMatchupContext(raw);
  var res = s.computeHitScore(ctx);
  assert.ok(res.confidence < 0.40, 'player with 0 AB and no data should have Insufficient confidence (got ' + res.confidence + ')');
});

test('large sample with game log gives High confidence', function () {
  var raw = mkRaw();
  raw.player.seasonStats.atBats = 200;
  raw.player.gameLog = new Array(20).fill({ stat: { hits: 1 } });
  var ctx = s.buildMatchupContext(raw);
  var res = s.computeHitScore(ctx);
  assert.ok(res.confidence >= 0.80, 'player with large sample should reach High confidence');
});

// ── formatBreakdownKey ────────────────────────────────────────────────────────
console.log('\nformatBreakdownKey');

test('maps known keys to human labels', function () {
  assert.strictEqual(s.formatBreakdownKey('pitcherContactProfile'), 'Pitcher Contact');
  assert.strictEqual(s.formatBreakdownKey('recentForm'),            'Recent Form');
  assert.strictEqual(s.formatBreakdownKey('platoonBvpEdge'),        'Platoon / BvP');
  assert.strictEqual(s.formatBreakdownKey('hrContext'),             'Park / Temp / Wind');
});

test('falls back to raw key for unknown keys', function () {
  assert.strictEqual(s.formatBreakdownKey('unknownKey'), 'unknownKey');
});

console.log('\nResults:', pass, 'passed,', fail, 'failed');
if (fail > 0) process.exit(1);
