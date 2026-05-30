# Lab Player Analyzer Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single conflated Lab Matchup Score with a separate Hit Score (= new Lab Matchup Score) and an informational Home Run Score, fixing H2H penalty gap, Savant silent-zero, GHP over-weighting, and weather not being scored.

**Architecture:** Pure scoring functions in `lib/lab-scorer.js` receive a `MatchupContext` object built once from fetched data. `computeHitScore(ctx)` IS the Lab Matchup Score. `computeHRScore(ctx)` is informational only with zero influence on the main score. `index.html` calls both and renders a two-card panel.

**Tech Stack:** Vanilla JavaScript (ES5-compatible, no bundler), Node.js `assert` for tests, MLB Stats API, Baseball Savant.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/lab-scorer.js` | **Create** | All pure scoring functions — no DOM, no API calls, no global state |
| `tests/lab-scorer.test.js` | **Create** | Node.js test runner using `assert` |
| `index.html` ~L11597 | **Modify** | `computePitchMixMatchup` — add `hasData` flag |
| `index.html` ~L11650 | **Delete** | `computeLabMatchupScore` — retired |
| `index.html` ~L11860 | **Modify** | `fetchElitePlayerData` — return raw data shape, add HR/9 fetches |
| `index.html` ~L10180 | **Modify** | `openPlayerAnalyzer` — call new scorers, render two-card layout |
| `index.html` ~L9515 | **Modify** | `generateSmartMatchupSummary` — accept hitResult + hrResult |
| `index.html` ~L380 | **Modify** | CSS — hit card (blue-green), HR card (amber), lineup banner |

---

## Task 1: Test Infrastructure and `lib/lab-scorer.js` Skeleton

**Files:**
- Create: `lib/lab-scorer.js`
- Create: `tests/lab-scorer.test.js`

- [ ] **Step 1: Create `lib/lab-scorer.js`**

```javascript
// lib/lab-scorer.js
'use strict';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildScoreLabel(score) {
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Favorable';
  if (score >= 45) return 'Neutral';
  if (score >= 30) return 'Risky';
  return 'Avoid';
}

function confidenceLabel(c) {
  if (c >= 0.80) return 'High';
  if (c >= 0.60) return 'Medium';
  if (c >= 0.40) return 'Low';
  return 'Insufficient';
}

function formatBreakdownKey(key) {
  var labels = {
    pitcherContactProfile:    'Pitcher Contact',
    batterContactQuality:     'Batter Contact',
    recentForm:               'Recent Form',
    platoonBvpEdge:           'Platoon / BvP',
    hitContext:               'Park / Order / Weather',
    bullpenContactProfile:    'Bullpen Contact',
    batterPowerProfile:       'Power Profile',
    recentPowerForm:          'Recent Power',
    pitcherHRSusceptibility:  'Pitcher HR Rate',
    bvpPowerHistory:          'BvP HR History',
    hrContext:                'Park / Temp / Wind',
    bullpenHRSusceptibility:  'Bullpen HR Rate',
  };
  return labels[key] || key;
}

if (typeof module !== 'undefined') {
  module.exports = {
    clamp: clamp,
    buildScoreLabel: buildScoreLabel,
    confidenceLabel: confidenceLabel,
    formatBreakdownKey: formatBreakdownKey,
  };
}
```

- [ ] **Step 2: Create `tests/lab-scorer.test.js`**

```javascript
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
```

- [ ] **Step 3: Run — confirm pass**

```
node tests/lab-scorer.test.js
```

Expected: `Results: 8 passed, 0 failed`

- [ ] **Step 4: Add script tag to `index.html` before the main `<script>` block**

Search for the first `<script>` tag that contains `'use strict'` or `const state =`. Add immediately before it:

```html
<script src="lib/lab-scorer.js"></script>
```

- [ ] **Step 5: Open browser, confirm DevTools console shows no errors about `clamp` or `buildScoreLabel`**

- [ ] **Step 6: Commit**

```
git add lib/lab-scorer.js tests/lab-scorer.test.js index.html
git commit -m "feat: add lab-scorer.js skeleton and test infrastructure"
```

---

## Task 2: `buildMatchupContext` and DataFlags

**Files:**
- Modify: `lib/lab-scorer.js`
- Modify: `tests/lab-scorer.test.js`

- [ ] **Step 1: Write failing tests — add before the summary block in `tests/lab-scorer.test.js`**

```javascript
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
```

- [ ] **Step 2: Run — confirm 7 failures for `buildMatchupContext`**

```
node tests/lab-scorer.test.js
```

- [ ] **Step 3: Implement `buildMatchupContext` in `lib/lab-scorer.js` (add before the `module.exports` block)**

```javascript
function buildMatchupContext(raw) {
  var player  = raw.player  || {};
  var pitcher = raw.pitcher || {};
  var bullpen = raw.bullpen || {};
  var park    = raw.park    || { overall: 1.0, rhh: 1.0, lhh: 1.0 };
  var weather = raw.weather || {};

  var gameLog         = player.gameLog || [];
  var last14          = gameLog.slice(-14);
  var last7           = gameLog.slice(-7);
  var recentHR        = last14.reduce(function (s, g) { return s + (g.hr   || 0); }, 0);
  var hitGames7       = last7.filter(function (g) { return (g.hits || 0) > 0; }).length;
  var recentGameCount = last7.length;
  var last3           = gameLog.slice(-3);
  var last3Hitless    = last3.length === 3 && last3.every(function (g) { return (g.hits || 0) === 0; });

  var enrichedPlayer = Object.assign({}, player, {
    recentHR: recentHR, hitGames7: hitGames7,
    recentGameCount: recentGameCount, last3Hitless: last3Hitless,
  });

  var hitterAB = (player.seasonStats || {}).atBats || 0;
  var dataFlags = {
    savantMissing:        !raw.savantBatter || !raw.savantPitcher,
    pitcherHR9Estimated:  !((pitcher.seasonStats || {}).hr9 > 0),
    barrelMissing:        !((player.seasonStats  || {}).barrel > 0),
    lineupProjected:      raw.lineupStatus !== 'confirmed',
    smallBatterSample:    hitterAB < 50,
    noBvpHistory:         !raw.h2h || (raw.h2h.ab || 0) < 5,
  };

  return {
    player: enrichedPlayer, pitcher: pitcher, bullpen: bullpen,
    park: park, weather: weather,
    h2h:           raw.h2h           || null,
    savantBatter:  raw.savantBatter   || null,
    savantPitcher: raw.savantPitcher  || null,
    lineupStatus:  raw.lineupStatus   || 'unknown',
    battingOrder:  raw.battingOrder   != null ? raw.battingOrder : null,
    dataFlags:     dataFlags,
  };
}
```

Add `buildMatchupContext` to `module.exports`.

- [ ] **Step 4: Run — all pass**

```
node tests/lab-scorer.test.js
```

- [ ] **Step 5: Commit**

```
git add lib/lab-scorer.js tests/lab-scorer.test.js
git commit -m "feat: buildMatchupContext with dataFlags and game-log enrichment"
```

---

## Task 3: Phase 0 Bug Fix — Savant `hasData` Flag

**Files:**
- Modify: `index.html` ~L11597

- [ ] **Step 1: In `computePitchMixMatchup`, change the early-return when data is absent**

Find:
```javascript
if (!pitcherRows?.length || !batterRows?.length) return { score: 0, reasons: [] };
```

Replace with:
```javascript
if (!pitcherRows?.length || !batterRows?.length) return { score: 0, hasData: false, reasons: [] };
```

- [ ] **Step 2: Add `hasData: true` to the function's normal return**

Find the line near the end of `computePitchMixMatchup` that returns `{ score, reasons, highlights: displayHighlights }` and change it to:

```javascript
return { score, hasData: true, reasons, highlights: displayHighlights };
```

- [ ] **Step 3: Verify no callers break** — search `index.html` for every use of `computePitchMixMatchup`. Each caller reads `.score`. The new `.hasData` field is additive and breaks nothing.

- [ ] **Step 4: Commit**

```
git add index.html
git commit -m "fix: computePitchMixMatchup returns hasData flag, no longer silent-neutral on missing data"
```

---

## Task 4: PCP — Pitcher Contact Profile

**Files:**
- Modify: `lib/lab-scorer.js`
- Modify: `tests/lab-scorer.test.js`

- [ ] **Step 1: Write failing tests — add before the summary block**

```javascript
console.log('\ncomputePCP');
function mkCtx(ov) { return s.buildMatchupContext(mkRaw(ov)); }

test('elite K% (0.33) gives -6 from K component', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: { kpct: 0.33, babip: 0.300, whip: 1.10, ip: 60 } };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, -6); // K -6, BABIP 0 (.300=neutral), WHIP 0 (1.10=neutral)
  assert.strictEqual(r.hasData, true);
});
test('low K% (0.17) with good WHIP (1.50) gives +7', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: { kpct: 0.17, babip: 0.300, whip: 1.50, ip: 60 } };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, 7); // K +4, BABIP 0, WHIP +3
});
test('high BABIP (.335) and WHIP (1.50) give +5', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: { kpct: 0.22, babip: 0.335, whip: 1.50, ip: 60 } };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, 5); // K 0, BABIP +2, WHIP +3
});
test('low BABIP (.250) and WHIP (0.90) give -7', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: { kpct: 0.22, babip: 0.250, whip: 0.90, ip: 60 } };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, -7); // K 0, BABIP -4, WHIP -3
});
test('clamped to -10', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: { kpct: 0.35, babip: 0.250, whip: 0.85, ip: 60 } };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, -10); // K -6, BABIP -4, WHIP -3 = -13, clamped
});
test('empty pitcher stats returns hasData false', function () {
  var raw = mkRaw();
  raw.pitcher = { pitchHand: 'R', seasonStats: {} };
  var r = s.computePCP(s.buildMatchupContext(raw));
  assert.strictEqual(r.hasData, false);
  assert.strictEqual(r.value, 0);
});
```

- [ ] **Step 2: Run — confirm 6 failures**

```
node tests/lab-scorer.test.js
```

- [ ] **Step 3: Implement `computePCP`**

```javascript
function computePCP(ctx) {
  var stats = (ctx.pitcher && ctx.pitcher.seasonStats) || {};
  var kpct  = stats.kpct  || 0;
  var babip = stats.babip || 0;
  var whip  = stats.whip  || 0;
  var delta = 0, hasData = false;

  if (kpct > 0) {
    hasData = true;
    if      (kpct < 0.18) delta += 4;
    else if (kpct < 0.22) delta += 2;
    else if (kpct < 0.25) delta += 0;
    else if (kpct < 0.28) delta -= 2;
    else if (kpct < 0.32) delta -= 4;
    else                   delta -= 6;
  }
  if (babip > 0) {
    hasData = true;
    if      (babip >= 0.330) delta += 3;
    else if (babip >= 0.315) delta += 2;
    else if (babip >= 0.300) delta += 1;
    else if (babip >= 0.280) delta += 0;
    else if (babip >= 0.260) delta -= 2;
    else                      delta -= 4;
  }
  if (whip > 0) {
    hasData = true;
    if      (whip >= 1.45) delta += 3;
    else if (whip >= 1.30) delta += 1;
    else if (whip >= 1.10) delta += 0;
    else if (whip >= 0.95) delta -= 2;
    else                    delta -= 3;
  }
  return { value: clamp(delta, -10, 10), hasData: hasData };
}
```

Add `computePCP` to `module.exports`.

- [ ] **Step 4: Run — all pass**

- [ ] **Step 5: Commit**

```
git add lib/lab-scorer.js tests/lab-scorer.test.js
git commit -m "feat: computePCP — pitcher contact profile"
```

---

## Task 5: BCQ — Batter Contact Quality

**Files:**
- Modify: `lib/lab-scorer.js`
- Modify: `tests/lab-scorer.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
console.log('\ncomputeBCQ');

test('high AVG (.320) + OBP (.390) gives +7 (no Savant)', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player,
    { seasonStats: Object.assign({}, raw.player.seasonStats, { avg: 0.320, obp: 0.390 }) });
  var r = s.computeBCQ(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, 7); // AVG +4, OBP +3
});
test('low AVG (.210) + OBP (.280) gives -6', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player,
    { seasonStats: Object.assign({}, raw.player.seasonStats, { avg: 0.210, obp: 0.280 }) });
  var r = s.computeBCQ(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, -6); // AVG -4, OBP -2
});
test('low batter whiff% (15%) adds +3', function () {
  var raw = mkRaw({ savantBatter: [{ pitch_usage: '100', whiff_percent: '15' }],
                    savantPitcher: [{}] });
  var r = s.computeBCQ(s.buildMatchupContext(raw));
  assert.strictEqual(r.value, 3); // neutral AVG/OBP + whiff +3
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
```

- [ ] **Step 2: Run — confirm failures**

- [ ] **Step 3: Implement `computeBCQ`**

```javascript
function computeBCQ(ctx) {
  var stats = (ctx.player && ctx.player.seasonStats) || {};
  var avg = stats.avg || 0, obp = stats.obp || 0;
  var delta = 0, hasData = false;

  if (avg > 0) {
    hasData = true;
    if      (avg >= 0.310) delta += 4;
    else if (avg >= 0.290) delta += 2;
    else if (avg >= 0.260) delta += 0;
    else if (avg >= 0.230) delta -= 2;
    else                    delta -= 4;
  }
  if (obp > 0) {
    hasData = true;
    if      (obp >= 0.380) delta += 3;
    else if (obp >= 0.360) delta += 2;
    else if (obp >= 0.330) delta += 1;
    else if (obp >= 0.300) delta += 0;
    else                    delta -= 2;
  }
  var rows = ctx.savantBatter;
  if (rows && rows.length > 0) {
    var totalUsage = 0, weightedWhiff = 0;
    for (var i = 0; i < rows.length; i++) {
      var u = parseFloat(rows[i].pitch_usage) / 100 || 0;
      var w = parseFloat(rows[i].whiff_percent) / 100 || 0;
      if (u > 0) { totalUsage += u; weightedWhiff += w * u; }
    }
    if (totalUsage > 0) {
      hasData = true;
      var wp = weightedWhiff / totalUsage;
      if      (wp < 0.18)  delta += 3;
      else if (wp < 0.23)  delta += 1;
      else if (wp < 0.28)  delta += 0;
      else if (wp <= 0.33) delta -= 2;
      else                  delta -= 4;
    }
  }
  return { value: clamp(delta, -12, 12), hasData: hasData };
}
```

Add to `module.exports`. Run tests — all pass. Commit:

```
git add lib/lab-scorer.js tests/lab-scorer.test.js
git commit -m "feat: computeBCQ — batter contact quality (AVG, OBP, Savant whiff)"
```

---

## Task 6: RF — Recent Form

**Files:**
- Modify: `lib/lab-scorer.js`
- Modify: `tests/lab-scorer.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
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
  assert.ok(r.value > 0 && r.value < 10); // positive but not at ceiling
});
test('7-game hit streak adds +2', function () {
  var raw = mkRaw();
  raw.player = Object.assign({}, raw.player, { hitStreak: 7, last7Stats: { avg: 0.300 } });
  var r = s.computeRF(s.buildMatchupContext(raw));
  assert.ok(r.value >= 5); // L7 +3 + streak +2
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
```

- [ ] **Step 2: Run — confirm failures**

- [ ] **Step 3: Implement `computeRF`**

```javascript
function computeRF(ctx) {
  var player        = ctx.player || {};
  var l7avg         = (player.last7Stats || {}).avg || 0;
  var hitGames7     = player.hitGames7     != null ? player.hitGames7     : null;
  var recentGames   = player.recentGameCount != null ? player.recentGameCount : 7;
  var hitStreak     = player.hitStreak  || 0;
  var last3Hitless  = player.last3Hitless || false;
  var delta = 0, hasData = false;

  if (l7avg > 0) {
    hasData = true;
    if      (l7avg >= 0.350) delta += 5;
    else if (l7avg >= 0.300) delta += 3;
    else if (l7avg >= 0.250) delta += 1;
    else if (l7avg >= 0.200) delta -= 2;
    else                      delta -= 4;
  }
  if (hitGames7 !== null && recentGames > 0) {
    hasData = true;
    var actual = Math.min(recentGames, 7);
    var ghp    = hitGames7 / actual;
    var scale  = actual / 7;
    var ghpRaw = ghp >= 0.72 ? 3 : ghp >= 0.60 ? 2 : ghp >= 0.50 ? 1 : ghp >= 0.40 ? -2 : -4;
    delta += Math.round(ghpRaw * scale);
  }
  if      (hitStreak >= 7) delta += 2;
  else if (hitStreak >= 4) delta += 1;
  if (last3Hitless)        delta -= 1;

  return { value: clamp(delta, -10, 10), hasData: hasData };
}
```

Add to `module.exports`. Run — all pass. Commit:

```
git add lib/lab-scorer.js tests/lab-scorer.test.js
git commit -m "feat: computeRF — recent form with GHP denominator-scaling fix"
```

---

## Task 7: PBE — Platoon and BvP Edge (H2H Negative-Case Fix)

**Files:**
- Modify: `lib/lab-scorer.js`
- Modify: `tests/lab-scorer.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
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
```

- [ ] **Step 2: Run — confirm failures**

- [ ] **Step 3: Implement `computePBE`**

```javascript
function computePBE(ctx) {
  var player   = ctx.player  || {};
  var pitcher  = ctx.pitcher || {};
  var h2h      = ctx.h2h;
  var seasonAvg = (player.seasonStats || {}).avg || 0;
  var splitKey  = pitcher.pitchHand === 'L' ? 'vsLHP' : 'vsRHP';
  var split     = player[splitKey] || {};
  var splitAB   = split.atBats || 0;
  var splitAvg  = split.avg    || 0;
  var delta = 0, hasData = false;

  if (splitAB >= 20 && seasonAvg > 0) {
    hasData = true;
    var diff = splitAvg - seasonAvg;
    if (splitAB >= 40) {
      if      (diff >= 0.075)  delta += 6;
      else if (diff >= 0.050)  delta += 4;
      else if (diff >= 0.025)  delta += 2;
      else if (diff >= -0.024) delta += 0;
      else if (diff >= -0.050) delta -= 3;
      else if (diff >= -0.075) delta -= 5;
      else                      delta -= 7;
    } else {
      if      (diff >= 0.060)  delta += 3;
      else if (diff >= 0.030)  delta += 1;
      else if (diff >= -0.029) delta += 0;
      else if (diff >= -0.060) delta -= 2;
      else                      delta -= 4;
    }
  }
  if (h2h && h2h.ab >= 5) {
    hasData = true;
    var ab = h2h.ab, avg = h2h.avg || 0;
    if (ab >= 30) {
      if      (avg >= 0.350) delta += 5;
      else if (avg >= 0.300) delta += 2;
      else if (avg >= 0.200) delta += 0;
      else if (avg >= 0.150) delta -= 3;
      else                    delta -= 5;
    } else if (ab >= 15) {
      if      (avg >= 0.350) delta += 3;
      else if (avg >= 0.300) delta += 1;
      else if (avg >= 0.200) delta += 0;
      else if (avg >= 0.150) delta -= 2;
      else                    delta -= 3;
    } else {
      if      (avg >= 0.400) delta += 1;
      else if (avg <  0.150) delta -= 1;
    }
  }
  return { value: clamp(delta, -8, 8), hasData: hasData };
}
```

Add to `module.exports`. Run — all pass. Commit:

```
git add lib/lab-scorer.js tests/lab-scorer.test.js
git commit -m "feat: computePBE — platoon/BvP with H2H negative-case fix"
```

---

## Task 8: CTX_hit and BCP

**Files:**
- Modify: `lib/lab-scorer.js`
- Modify: `tests/lab-scorer.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
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
```

- [ ] **Step 2: Run — confirm failures**

- [ ] **Step 3: Implement `computeCTXHit` and `computeBCP`**

```javascript
function computeCTXHit(ctx) {
  var park = ctx.park || {}, weather = ctx.weather || {};
  var player = ctx.player || {}, order = ctx.battingOrder;
  var delta = 0, hasData = false, parkDelta = 0;

  if (park.overall > 0) {
    hasData = true;
    var pf = park.overall;
    parkDelta = pf >= 1.07 ? 2 : pf >= 1.03 ? 1 : pf >= 0.97 ? 0 : pf >= 0.93 ? -1 : -2;
  }
  var ps = player.parkStats || {};
  if ((ps.ab || 0) >= 10) {
    hasData = true;
    if      ((ps.avg || 0) >= 0.350) parkDelta = Math.min(parkDelta + 1,  3);
    else if ((ps.avg || 0) <  0.180) parkDelta = Math.max(parkDelta - 1, -3);
  }
  delta += clamp(parkDelta, -3, 3);

  if (order != null) {
    hasData = true;
    delta += order <= 3 ? 1 : order >= 7 ? -1 : 0;
  }
  if (weather.windDir && weather.windMph > 0) {
    hasData = true;
    if      (weather.windDir === 'out' && weather.windMph >= 12) delta += 1;
    else if (weather.windDir === 'in'  && weather.windMph >= 12) delta -= 1;
  }
  if (weather.tempF != null) {
    hasData = true;
    if (weather.tempF < 45) delta -= 1;
  }
  return { value: clamp(delta, -5, 5), hasData: hasData };
}

function computeBCP(ctx) {
  var b = ctx.bullpen || {};
  var hbf = b.hbf || 0, h9 = b.h9 || 0;
  var delta = 0, hasData = false;

  if (hbf > 0) {
    hasData = true;
    delta = hbf >= 0.270 ? 4 : hbf >= 0.250 ? 2 : hbf >= 0.230 ? 1 :
            hbf >= 0.210 ? 0 : hbf >= 0.190 ? -2 : -4;
  } else if (h9 > 0) {
    hasData = true;
    delta = h9 >= 9.5 ? 2 : h9 < 6.5 ? -2 : 0;
  }
  return { value: clamp(delta, -4, 4), hasData: hasData };
}
```

Add both to `module.exports`. Run — all pass. Commit:

```
git add lib/lab-scorer.js tests/lab-scorer.test.js
git commit -m "feat: computeCTXHit and computeBCP — context and bullpen hit components"
```

---

## Task 9: `computeHitScore` and `computeConfidence`

**Files:**
- Modify: `lib/lab-scorer.js`
- Modify: `tests/lab-scorer.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
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
```

- [ ] **Step 2: Run — confirm failures**

- [ ] **Step 3: Implement `computeConfidence`, `buildHitReasons`, `buildHitWarnings`, `computeHitScore`**

```javascript
function computeConfidence(ctx, withData, total) {
  var lw = { confirmed:1.0, projected:0.6, unknown:0.3 };
  var lineupWeight = lw[ctx.lineupStatus] || 0.3;
  var hAB = ((ctx.player  || {}).seasonStats || {}).atBats || 0;
  var pIP = ((ctx.pitcher || {}).seasonStats || {}).ip     || 0;
  var sw  = (hAB >= 150 && pIP >= 30) ? 1.0 :
            (hAB >= 100 || pIP >= 20) ? 0.8 :
            (hAB >= 50  || pIP >= 10) ? 0.6 : 0.4;
  var cw  = total > 0 ? withData / total : 0;
  return Math.round((lineupWeight * 0.25 + sw * 0.40 + cw * 0.35) * 100) / 100;
}

function buildHitReasons(comps, ctx) {
  var reasons = [], ps = ((ctx.pitcher||{}).seasonStats||{}), pl = ((ctx.player||{}).seasonStats||{});
  var l7 = ((ctx.player||{}).last7Stats||{}).avg || 0;
  if (comps.pcp.hasData && comps.pcp.value > 0) {
    if ((ps.kpct||0) < 0.22)
      reasons.push('Low-K pitcher (' + Math.round((ps.kpct||0)*100) + '%)');
    if ((ps.babip||0) >= 0.315)
      reasons.push('Pitcher BABIP .' + Math.round((ps.babip||0)*1000).toString().padStart(3,'0'));
    if ((ps.whip||0) >= 1.30)
      reasons.push('Pitcher WHIP ' + (ps.whip||0).toFixed(2));
  }
  if (comps.bcq.hasData && comps.bcq.value > 0) {
    if ((pl.avg||0) >= 0.290)
      reasons.push('.' + Math.round((pl.avg||0)*1000).toString().padStart(3,'0') + ' season AVG');
    if ((pl.obp||0) >= 0.360)
      reasons.push('.' + Math.round((pl.obp||0)*1000).toString().padStart(3,'0') + ' OBP');
  }
  if (comps.rf.hasData && comps.rf.value > 0) {
    if (l7 >= 0.300)
      reasons.push('.' + Math.round(l7*1000).toString().padStart(3,'0') + ' over last 7 games');
    if ((ctx.player||{}).hitStreak >= 4)
      reasons.push(ctx.player.hitStreak + '-game hit streak');
  }
  return reasons.slice(0, 4);
}

function buildHitWarnings(comps, ctx) {
  var warnings = [], ps = ((ctx.pitcher||{}).seasonStats||{});
  if (comps.pcp.hasData && comps.pcp.value < -3 && (ps.kpct||0) >= 0.28)
    warnings.push('High-K pitcher (' + Math.round((ps.kpct||0)*100) + '%)');
  if (comps.bcq.hasData && comps.bcq.value < -2)
    warnings.push('Below-average contact rate this season');
  if (comps.rf.hasData  && comps.rf.value  < -3)
    warnings.push('Cold at the plate recently');
  if ((ctx.dataFlags||{}).savantMissing)
    warnings.push('Pitch-mix data unavailable');
  return warnings.slice(0, 2);
}

function computeHitScore(ctx) {
  var pcp    = computePCP(ctx),    bcq = computeBCQ(ctx),
      rf     = computeRF(ctx),     pbe = computePBE(ctx),
      ctxHit = computeCTXHit(ctx), bcp = computeBCP(ctx);
  var comps  = [pcp,bcq,rf,pbe,ctxHit,bcp];
  var withData = comps.filter(function(c){ return c.hasData; }).length;
  var rawTotal = pcp.value+bcq.value+rf.value+pbe.value+ctxHit.value+bcp.value;
  var score    = clamp(50+rawTotal, 0, 100);
  var breakdown = {
    pitcherContactProfile: pcp.hasData    ? pcp.value    : null,
    batterContactQuality:  bcq.hasData    ? bcq.value    : null,
    recentForm:            rf.hasData     ? rf.value     : null,
    platoonBvpEdge:        pbe.hasData    ? pbe.value    : null,
    hitContext:            ctxHit.hasData ? ctxHit.value : null,
    bullpenContactProfile: bcp.hasData    ? bcp.value    : null,
  };
  var cm = { pcp:pcp, bcq:bcq, rf:rf, pbe:pbe, ctxHit:ctxHit, bcp:bcp };
  return {
    score: score, rawTotal: rawTotal, breakdown: breakdown,
    confidence: computeConfidence(ctx, withData, comps.length),
    label:      buildScoreLabel(score),
    reasons:    buildHitReasons(cm, ctx),
    warnings:   buildHitWarnings(cm, ctx),
  };
}
```

Add all four functions to `module.exports`. Run — all pass. Commit:

```
git add lib/lab-scorer.js tests/lab-scorer.test.js
git commit -m "feat: computeHitScore with confidence, reason builders, breakdown reconciliation"
```

---

## Task 10: Hit Score UI — Two-Card Layout, Lineup Banner, CSS

**Files:**
- Modify: `index.html` (CSS ~L380, `openPlayerAnalyzer` ~L10180, `fetchElitePlayerData` ~L11860)

- [ ] **Step 1: Add CSS — find the Lab CSS section (search `.lab-game-card`) and append**

```css
/* ── Lab Score Cards ─────────────────────────────────────────────── */
.lab-two-card-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
@media(max-width:600px){ .lab-two-card-row{ grid-template-columns:1fr; } }
.lab-score-card { border-radius:12px; border:1px solid rgba(148,163,184,.2);
                  padding:14px; background:rgba(15,23,42,.6); }
.lab-hit-card { border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.04); }
.lab-hr-card  { border-color:rgba(245,158,11,.3);  background:rgba(245,158,11,.04); }
.lab-card-title    { font-size:11px; font-family:monospace; letter-spacing:.06em;
                     text-transform:uppercase; color:var(--text-muted); }
.lab-card-subtitle { font-size:9px; font-family:monospace; color:var(--text-muted);
                     margin-left:6px; opacity:.7; }
.lab-score-num { font-family:monospace; font-size:2rem; font-weight:700; line-height:1; }
.lab-hit-card .lab-score-num { color:#34d399; }
.lab-hr-card  .lab-score-num { color:#f59e0b; }
.lab-score-lbl { font-size:11px; font-family:monospace; margin-top:2px; color:var(--text-secondary); }
.lab-reason-list { list-style:none; padding:0; margin:8px 0 0; }
.lab-reason-list li { font-size:11px; line-height:1.5; }
.lab-reason-pos  { color:#34d399; }
.lab-reason-warn { color:#f59e0b; }
.lab-breakdown-table { width:100%; border-collapse:collapse; font-size:10px;
                       font-family:monospace; margin-top:6px; }
.lab-breakdown-table td { padding:2px 4px; }
.lab-breakdown-table td:last-child { text-align:right; }
.lab-bd-pos  { color:#34d399; } .lab-bd-neg { color:#ef4444; }
.lab-bd-zero { color:var(--text-muted); } .lab-bd-na { color:var(--text-muted); font-style:italic; }
.lab-bd-total { border-top:1px solid rgba(148,163,184,.2); color:var(--text-secondary); }
.lab-data-flags { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
.lab-flag { font-size:9px; font-family:monospace; padding:2px 6px; border-radius:4px;
            background:rgba(245,158,11,.1); border:1px solid rgba(245,158,11,.3); color:#f59e0b; }
.lab-lineup-banner { border-radius:8px; padding:6px 10px; margin-bottom:10px;
                     font-size:11px; font-family:monospace; display:flex; align-items:center; gap:6px; }
.lab-lineup-confirmed { background:rgba(52,211,153,.08); border:1px solid rgba(52,211,153,.25); color:#34d399; }
.lab-lineup-projected { background:rgba(245,158,11,.08);  border:1px solid rgba(245,158,11,.25);  color:#f59e0b; }
.lab-lineup-unknown   { background:rgba(148,163,184,.08); border:1px solid rgba(148,163,184,.25); color:#94a3b8; }
.lab-conf-high  { color:#34d399; } .lab-conf-medium { color:#f59e0b; }
.lab-conf-low   { color:#ef4444; } .lab-conf-insufficient { color:#94a3b8; }
```

- [ ] **Step 2: Add rendering helpers immediately before `function openPlayerAnalyzer(`**

```javascript
function renderLabBreakdownTable(breakdown, rawTotal, score) {
  var rows = Object.keys(breakdown).map(function(k) {
    var v = breakdown[k];
    if (v === null) return '<tr><td>'+formatBreakdownKey(k)+'</td><td class="lab-bd-na">N/A</td></tr>';
    var cls = v > 0 ? 'lab-bd-pos' : v < 0 ? 'lab-bd-neg' : 'lab-bd-zero';
    return '<tr><td>'+formatBreakdownKey(k)+'</td><td class="'+cls+'">'+(v>0?'+':'')+v+'</td></tr>';
  }).join('');
  return '<table class="lab-breakdown-table">'+rows+
    '<tr class="lab-bd-total"><td>Raw total</td><td>'+(rawTotal>=0?'+':'')+rawTotal+'</td></tr>'+
    '<tr class="lab-bd-total"><td>Score (50 + raw)</td><td>'+score+'</td></tr></table>';
}
function renderLabDataFlags(dataFlags) {
  var defs = [['savantMissing','⚠ Savant data unavailable'],['pitcherHR9Estimated','⚠ Pitcher HR/9 estimated'],
              ['barrelMissing','⚠ Barrel% unavailable'],['smallBatterSample','⚠ Small batter sample'],
              ['noBvpHistory','⚠ No BvP history'],['lineupProjected','⚠ Projected lineup']];
  return '<div class="lab-data-flags">'+
    defs.filter(function(f){ return dataFlags[f[0]]; })
        .map(function(f){ return '<span class="lab-flag">'+f[1]+'</span>'; }).join('')+
    '</div>';
}
function renderLabScoreCard(result, ctx, isHR) {
  var cardCls = isHR ? 'lab-hr-card' : 'lab-hit-card';
  var title   = isHR ? 'Home Run Score <span class="lab-card-subtitle">info only</span>' : 'Lab Matchup Score';
  var confLbl = confidenceLabel(result.confidence);
  var confCls = 'lab-conf-' + confLbl.toLowerCase();
  var insuf   = result.confidence < 0.40;
  var scoreHtml = insuf
    ? '<p style="color:var(--text-muted);font-size:12px;font-family:monospace">Not enough data</p>'
    : '<div class="lab-score-num">'+result.score+'</div><div class="lab-score-lbl">'+result.label+'</div>';
  var reasonsHtml = insuf ? '' :
    '<ul class="lab-reason-list">'+
    result.reasons.map(function(r){ return '<li class="lab-reason-pos">✓ '+r+'</li>'; }).join('')+
    result.warnings.map(function(w){ return '<li class="lab-reason-warn">⚠ '+w+'</li>'; }).join('')+
    '</ul>';
  var bdHtml = insuf ? '' :
    '<details style="margin-top:8px"><summary style="font-size:10px;font-family:monospace;cursor:pointer;color:var(--text-muted)">Breakdown ▾</summary>'+
    renderLabBreakdownTable(result.breakdown, result.rawTotal, result.score)+'</details>';
  return '<div class="lab-score-card '+cardCls+'">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
      '<span class="lab-card-title">'+title+'</span>'+
      '<span class="'+confCls+'" style="font-size:9px;font-family:monospace">'+confLbl+'</span></div>'+
    scoreHtml+reasonsHtml+bdHtml+renderLabDataFlags(ctx.dataFlags)+'</div>';
}
function renderLabLineupBanner(lineupStatus) {
  var map = {
    confirmed:{ cls:'lab-lineup-confirmed', text:'✓ Confirmed Lineup' },
    projected:{ cls:'lab-lineup-projected', text:'⚠ Projected Lineup — scores are preliminary' },
    unknown:  { cls:'lab-lineup-unknown',   text:'? Lineup Status Unknown' },
  };
  var b = map[lineupStatus] || map.unknown;
  return '<div class="lab-lineup-banner '+b.cls+'">'+b.text+'</div>';
}
```

- [ ] **Step 3: Update `fetchElitePlayerData` to return raw data without calling `computeLabMatchupScore`**

Find the return statement in `fetchElitePlayerData`. Remove any call to `computeLabMatchupScore`. Change the return to:

```javascript
return {
  player:        player,   // must have player.gameLog populated
  pitcher:       pitcher,
  bullpen:       { era: bullpenEra, h9: bullpenH9, hbf: bullpenHBF, hr9: null },
  park:          pf,       // { overall, rhh, lhh }
  weather:       gd.weather || {},
  h2h:           h2h,
  savantBatter:  state.savantBatter  ? (state.savantBatter.get(String(player.id))   || null) : null,
  savantPitcher: state.savantPitcher ? (state.savantPitcher.get(String(pitcher.id)) || null) : null,
};
```

Also ensure `player.gameLog` is populated inside `fetchElitePlayerData`. Find where the game log is fetched and add `player.gameLog = rawGameLogArray;` before the return.

- [ ] **Step 4: Update `openPlayerAnalyzer` — replace the score computation and rendering section**

Find the block that calls `fetchElitePlayerData` and renders the panel. Replace the scoring and rendering portion with:

```javascript
const rawData = await fetchElitePlayerData(player, gd);
const lineupStatus = player.lineupConfirmed ? 'confirmed'
                   : (player.orderPos > 0   ? 'projected' : 'unknown');
const ctx       = buildMatchupContext(Object.assign({}, rawData,
                    { lineupStatus, battingOrder: player.orderPos || null }));
const hitResult = computeHitScore(ctx);
const hrResult  = { score:50, rawTotal:0, breakdown:{}, confidence:0.5,
                    label:'Neutral', reasons:[], warnings:[] }; // placeholder until Task 12

document.getElementById('playerAnalyzerPanel').innerHTML =
  renderLabLineupBanner(ctx.lineupStatus) +
  '<div class="lab-two-card-row">' +
    renderLabScoreCard(hitResult, ctx, false) +
    renderLabScoreCard(hrResult,  ctx, true)  +
  '</div>';
```

- [ ] **Step 5: Open browser, click a player in the Lab — verify two cards render with lineup banner**

- [ ] **Step 6: Commit**

```
git add index.html
git commit -m "feat: two-card analyzer panel with hit score, lineup banner, breakdown, data flags"
```

---

## Task 11: Fetch Pitcher HR/9 and Bullpen HR/9

**Files:**
- Modify: `index.html` ~L11860 (`fetchElitePlayerData`)

- [ ] **Step 1: Add `homeRunsPer9Inn` to pitcher stats extraction**

Inside `fetchElitePlayerData`, find the MLB Stats API call for the pitcher's season stats. The stats object (`splits[0].stat`) already has ERA, K%, etc. Add:

```javascript
pitcher.seasonStats.hr9 = parseFloat(splits[0]?.stat?.homeRunsPer9Inn) || 0;
```

- [ ] **Step 2: Add `homeRunsPer9Inn` to bullpen stats extraction**

Find the bullpen stats call. After extracting `bullpenEra`, `bullpenH9`, `bullpenHBF`, add:

```javascript
const bullpenHR9 = parseFloat(bullpenStats?.stat?.homeRunsPer9Inn) || 0;
```

Update the returned bullpen object to `{ era: bullpenEra, h9: bullpenH9, hbf: bullpenHBF, hr9: bullpenHR9 }`.

- [ ] **Step 3: Open DevTools → Network — confirm `homeRunsPer9Inn` appears in pitcher stats response**

- [ ] **Step 4: Commit**

```
git add index.html
git commit -m "feat: fetch pitcher HR/9 and bullpen HR/9 from MLB Stats API"
```

---

## Task 12: HR Score Components and `computeHRScore`

**Files:**
- Modify: `lib/lab-scorer.js`
- Modify: `tests/lab-scorer.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
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
  assert.strictEqual(s.computePHS(s.buildMatchupContext(raw)).value, 4); // K +2, BACON +2
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
```

- [ ] **Step 2: Run — confirm failures**

```
node tests/lab-scorer.test.js
```

- [ ] **Step 3: Implement all HR components and `computeHRScore`**

```javascript
function computeBPP(ctx) {
  var stats = (ctx.player&&ctx.player.seasonStats)||{};
  var slg=stats.slg||0, avg=stats.avg||0, bacon=stats.bacon||0, barrel=stats.barrel||0;
  var iso=slg-avg, delta=0, hasData=false;
  if (iso>0) { hasData=true;
    delta += iso>=0.260?8:iso>=0.220?5:iso>=0.180?2:iso>=0.140?0:iso>=0.100?-3:-6; }
  if (bacon>0) { hasData=true;
    delta += bacon>=0.330?4:bacon>=0.310?2:bacon>=0.290?0:bacon>=0.270?-1:-3; }
  if (barrel>0) { hasData=true;
    delta += barrel>=0.12?3:barrel>=0.08?1:barrel>=0.04?0:-2; }
  return { value:clamp(delta,-15,15), hasData:hasData };
}

function computeRPF(ctx) {
  var player=ctx.player||{}, gameLog=player.gameLog||[];
  var last14=gameLog.slice(-14);
  var recentHR=player.recentHR!=null?player.recentHR:last14.reduce(function(s,g){ return s+(g.hr||0); },0);
  var l10slg=((player.last10Stats||{}).slg)||0;
  var delta=0, hasData=false;
  if (last14.length>=7) { hasData=true;
    delta += recentHR>=4?6:recentHR>=2?3:recentHR>=1?1:-2; }
  if (l10slg>0) { hasData=true;
    if      (l10slg>=0.600) delta+=2;
    else if (l10slg< 0.300) delta-=2; }
  return { value:clamp(delta,-8,8), hasData:hasData };
}

function computePHS(ctx) {
  var stats=(ctx.pitcher&&ctx.pitcher.seasonStats)||{};
  var hr9=stats.hr9||0, kpct=stats.kpct||0, bacon=stats.bacon||0;
  var delta=0, hasData=false;
  if (hr9>0) { hasData=true;
    delta += hr9>=1.50?6:hr9>=1.20?3:hr9>=0.90?0:hr9>=0.60?-3:-6;
  } else {
    if (kpct>0)  { hasData=true; delta += kpct<0.18?2:kpct>=0.28?-2:0; }
    if (bacon>0) { hasData=true; delta += bacon>=0.310?2:bacon<0.270?-2:0; }
  }
  return { value:clamp(delta,-10,10), hasData:hasData };
}

function computeBvPH(ctx) {
  var h2h=ctx.h2h;
  if (!h2h||h2h.ab<15) return { value:0, hasData:false };
  var ab=h2h.ab, hr=h2h.hr||0, delta=0;
  if (ab>=30) {
    if      (hr/ab>=1/8)  delta=5;
    else if (hr/ab>=1/12) delta=3;
    else if (hr===0)      delta=-3;
  } else {
    if      (hr/ab>=1/10)       delta=3;
    else if (ab>=20&&hr===0)    delta=-2;
  }
  return { value:clamp(delta,-5,5), hasData:true };
}

function computeCTXHR(ctx) {
  var park=ctx.park||{}, weather=ctx.weather||{};
  var bats=(ctx.player||{}).bats||'R';
  var parkHR = bats==='L' ? (park.lhh||park.overall||0) : (park.rhh||park.overall||0);
  var delta=0, hasData=false;
  if (parkHR>0) { hasData=true;
    delta += parkHR>=1.15?4:parkHR>=1.07?2:parkHR>=0.93?0:parkHR>=0.85?-2:-4; }
  if (weather.tempF!=null) { hasData=true;
    delta += weather.tempF>=80?2:weather.tempF>=65?1:weather.tempF>=50?0:weather.tempF>=45?-1:-2; }
  if (weather.windDir&&weather.windMph>0) { hasData=true;
    if      (weather.windDir==='out'&&weather.windMph>=15) delta+=2;
    else if (weather.windDir==='out'&&weather.windMph>=8)  delta+=1;
    else if (weather.windDir==='in' &&weather.windMph>=15) delta-=2;
    else if (weather.windDir==='in' &&weather.windMph>=8)  delta-=1;
  }
  return { value:clamp(delta,-8,8), hasData:hasData };
}

function computeBHS(ctx) {
  var b=ctx.bullpen||{}, hr9=b.hr9||0, era=b.era||0;
  var delta=0, hasData=false;
  if (hr9>0) { hasData=true;
    delta += hr9>=1.40?3:hr9>=1.00?1:hr9>=0.70?0:-2;
  } else if (era>0) { hasData=true;
    delta += era>=5.00?2:era<=3.00?-1:0; }
  return { value:clamp(delta,-3,3), hasData:hasData };
}

function buildHRReasons(comps,ctx) {
  var reasons=[], stats=((ctx.player||{}).seasonStats||{});
  var iso=(stats.slg||0)-(stats.avg||0);
  if (comps.bpp.hasData&&comps.bpp.value>0) {
    if (iso>=0.200) reasons.push('ISO '+iso.toFixed(3).replace('0.','.' ));
    if ((stats.bacon||0)>=0.310) reasons.push('High hard-contact rate');
  }
  if (comps.rpf.hasData&&comps.rpf.value>0&&(ctx.player||{}).recentHR>=2)
    reasons.push((ctx.player.recentHR)+' HR in last 14 days');
  if (comps.ctxHR.hasData&&comps.ctxHR.value>0) {
    if ((ctx.weather||{}).windDir==='out'&&(ctx.weather.windMph||0)>=8)
      reasons.push('Wind out ('+ctx.weather.windMph+' mph)');
    if ((ctx.weather||{}).tempF>=75) reasons.push('Warm conditions ('+ctx.weather.tempF+'°F)');
  }
  if (comps.bvph.hasData&&comps.bvph.value>0) reasons.push('HR history vs this pitcher');
  return reasons.slice(0,4);
}

function buildHRWarnings(comps,ctx) {
  var warnings=[];
  if (comps.phs.hasData&&comps.phs.value<-3)  warnings.push('Pitcher suppresses HR');
  if (comps.ctxHR.hasData&&comps.ctxHR.value<-3) warnings.push('Conditions unfavorable for power');
  if (comps.bvph.hasData&&comps.bvph.value<-2) warnings.push('Weak history vs this pitcher');
  if ((ctx.dataFlags||{}).pitcherHR9Estimated) warnings.push('Pitcher HR/9 estimated');
  return warnings.slice(0,2);
}

function computeHRScore(ctx) {
  var bpp=computeBPP(ctx), rpf=computeRPF(ctx), phs=computePHS(ctx),
      bvph=computeBvPH(ctx), ctxHR=computeCTXHR(ctx), bhs=computeBHS(ctx);
  var comps=[bpp,rpf,phs,bvph,ctxHR,bhs];
  var withData=comps.filter(function(c){ return c.hasData; }).length;
  var rawTotal=bpp.value+rpf.value+phs.value+bvph.value+ctxHR.value+bhs.value;
  var score=clamp(50+rawTotal,0,100);
  var breakdown={
    batterPowerProfile:      bpp.hasData  ?bpp.value:null,
    recentPowerForm:         rpf.hasData  ?rpf.value:null,
    pitcherHRSusceptibility: phs.hasData  ?phs.value:null,
    bvpPowerHistory:         bvph.hasData ?bvph.value:null,
    hrContext:               ctxHR.hasData?ctxHR.value:null,
    bullpenHRSusceptibility: bhs.hasData  ?bhs.value:null,
  };
  var cm={bpp:bpp,rpf:rpf,phs:phs,bvph:bvph,ctxHR:ctxHR,bhs:bhs};
  return { score:score, rawTotal:rawTotal, breakdown:breakdown,
           confidence:computeConfidence(ctx,withData,comps.length),
           label:buildScoreLabel(score),
           reasons:buildHRReasons(cm,ctx), warnings:buildHRWarnings(cm,ctx) };
}
```

Add all new functions to `module.exports`. Run — all pass. Commit:

```
git add lib/lab-scorer.js tests/lab-scorer.test.js
git commit -m "feat: all HR score components and computeHRScore"
```

- [ ] **Step 4: Replace the HR placeholder in `openPlayerAnalyzer` with the real call**

Find the placeholder line added in Task 10:
```javascript
const hrResult  = { score:50, rawTotal:0, ... }; // placeholder until Task 12
```

Replace with:
```javascript
const hrResult  = computeHRScore(ctx);
```

Open browser and verify the HR card now shows a real number. Commit:

```
git add index.html
git commit -m "feat: wire computeHRScore into analyzer panel — HR card now live"
```

---

## Task 13: Retire `computeLabMatchupScore`, Update Summary

**Files:**
- Modify: `index.html` ~L11650, ~L9515

- [ ] **Step 1: Search for and delete `function computeLabMatchupScore(`**

Use `Ctrl+F` in your editor to find the function. Delete the entire function body. Verify 0 remaining references.

- [ ] **Step 2: Update `generateSmartMatchupSummary` signature and call site**

Change the function signature from:
```javascript
function generateSmartMatchupSummary(ctx) {
```
to:
```javascript
function generateSmartMatchupSummary(hitResult, hrResult, ctx) {
```

Inside the function, replace any reads of `ctx.score` or `score` (the old single score) with `hitResult.score`. Replace reads of `label` with `hitResult.label`. Replace reads of `reasons`/`warnings` arrays with `hitResult.reasons` and `hitResult.warnings`.

Update the call site in `openPlayerAnalyzer` to:
```javascript
const summary = generateSmartMatchupSummary(hitResult, hrResult, ctx);
```

- [ ] **Step 3: Verify browser — no errors, both cards show real scores, summary renders**

- [ ] **Step 4: Run all tests**

```
node tests/lab-scorer.test.js
```

Expected: all pass (no tests cover the retired function).

- [ ] **Step 5: Commit**

```
git add index.html
git commit -m "feat: retire computeLabMatchupScore — Lab Matchup Score is now computeHitScore"
```

---

## Task 14: Confidence Display Verification and Final Polish

**Files:**
- Modify: `tests/lab-scorer.test.js`

- [ ] **Step 1: Add final confidence display tests**

```javascript
console.log('\nconfidenceLabel');
test('>=0.80 => High',         function(){ assert.strictEqual(s.confidenceLabel(0.82),'High'); });
test('0.60-0.79 => Medium',    function(){ assert.strictEqual(s.confidenceLabel(0.70),'Medium'); });
test('0.40-0.59 => Low',       function(){ assert.strictEqual(s.confidenceLabel(0.50),'Low'); });
test('<0.40 => Insufficient',  function(){ assert.strictEqual(s.confidenceLabel(0.35),'Insufficient'); });
test('hrScore not influenced by hitScore', function(){
  var ctx1 = s.buildMatchupContext(mkRaw());
  var ctx2 = s.buildMatchupContext(mkRaw());
  // Hit score and HR score are independent — changing hr score doesn't affect lab score
  var hit1 = s.computeHitScore(ctx1).score;
  var hit2 = s.computeHitScore(ctx2).score;
  assert.strictEqual(hit1, hit2); // identity: Lab Matchup = Hit Score
});
```

- [ ] **Step 2: Run all tests — confirm 0 failures**

```
node tests/lab-scorer.test.js
```

- [ ] **Step 3: Browser smoke test — open 3 different players**

For each player verify:
- Lineup banner color matches actual status (green/yellow/gray)
- Hit Score card shows blue-green accent
- HR Score card shows amber accent with "info only" label
- Expanding Breakdown shows all rows; sum of non-null rows + 50 equals the score
- Data flag chips appear only when relevant (e.g., ⚠ No BvP history for a new player)
- A player with very low AB shows "Not enough data" if confidence < 0.40

- [ ] **Step 4: Final commit**

```
git add lib/lab-scorer.js tests/lab-scorer.test.js
git commit -m "feat: final confidence tests and polish — Lab Player Analyzer redesign complete"
```
