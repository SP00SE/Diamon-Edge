# Team Win Predictor Model Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 structural model accuracy issues in the Team Win Predictor: eliminate pitcher double-counting from hitScore, recalibrate the win-probability sigmoid via back-test, replace the ERA bracket with Savant pitch-mix scoring (with debut penalty), upgrade recent form from AVG to OPS, and blend last-3-starts ERA for starter recency.

**Architecture:** All changes are in `index.html` (single-file SPA). No new files. Implementation order: strip double-count first (foundation), then Savant wiring, then pitcher game log recency, then OPS form, then sigmoid calibration. After each task: run code-simplifier on modified lines only, preserve behavior exactly.

**Tech Stack:** Vanilla JS, single HTML file. No test framework — verification is browser-based via DevTools console and visual inspection after each task.

---

## File Map

| File | Lines | What changes |
|---|---|---|
| `index.html` | 3649 | State: add `sigmoidSlope: null` |
| `index.html` | 3948-3969 | `computeHitScore`: remove `_hitMatchupScore` + `_hitBullpenScore` calls |
| `index.html` | ~4631 | New `fetchPitcherGameLog` function (before `fetchStreaks`) |
| `index.html` | ~12349 | New `_recentEra` helper (before `_projRuns`) |
| `index.html` | ~12386-12403 | `_starterBonus`: Savant primary + debut penalty + ERA fallback; add `gameLog` param |
| `index.html` | ~12417 | New `_playerOps` helper + updated `_teamRecentForm` |
| `index.html` | ~12452 | New `_calibrateSigmoidSlope` + updated `_winProbability` |
| `index.html` | ~12185 | `handleTeamScan`: `ensureSavantData` call + calibration trigger |
| `index.html` | ~12492 | `runTeamScan`: update `_starterBonus` call sites to pass `gameLog` |
| `index.html` | processGame | Fetch + store `awayPitcherGameLog` / `homePitcherGameLog` |

---

## Task 1: Strip Pitcher Factors from `computeHitScore`

**Files:**
- Modify: `index.html:3649` (state)
- Modify: `index.html:3948-3969` (`computeHitScore`)

`_hitMatchupScore` and `_hitBullpenScore` are called inside `computeHitScore` AND their signals are re-added at the team level via `_starterBonus`/`_bullpenBonus`. This removes them from `computeHitScore` so `hitScore` becomes a pure batter-quality metric. Both functions stay in the codebase — they are still used by `computeLabMatchupScore`.

- [ ] **Step 1: Add `sigmoidSlope` to state**

Find at line 3648:
```javascript
  savantLoading: false,
  savantYear:    null,
};
```

Replace with:
```javascript
  savantLoading: false,
  savantYear:    null,
  sigmoidSlope:  null,
};
```

- [ ] **Step 2: Replace `computeHitScore` body**

Find this exact block (lines 3948-3969):
```javascript
function computeHitScore(batter, pitcher, orderPos, weather, parkFactor, bullpenEra = 0, bullpenH9 = 0) {
  const factors      = [];
  const skill        = _hitSkillScore(batter, factors);
  const form         = _hitRecentFormScore(batter, factors);
  const opp          = _hitOpportunityScore(batter, orderPos, factors);
  const matchup      = _hitMatchupScore(batter, pitcher, factors);
  const bullpen      = _hitBullpenScore(bullpenEra, factors, bullpenH9);
  const weatherScore = _hitWeatherScore(weather, factors);

  // Park factor — capped ±4
  let parkScore = 0;
  const pfOverall = parkFactor?.overall || 1.0;
  if      (pfOverall >= 1.10) { parkScore =  4; factors.push({ label: `Hitter's park ${pfOverall.toFixed(2)}×`,        type:'pos', pts:  4 }); }
  else if (pfOverall >= 1.05) { parkScore =  3; factors.push({ label: `Hitter-friendly park ${pfOverall.toFixed(2)}×`, type:'pos', pts:  3 }); }
  else if (pfOverall >= 1.02) { parkScore =  2; factors.push({ label: `Slight hitter edge ${pfOverall.toFixed(2)}×`,   type:'pos', pts:  2 }); }
  else if (pfOverall <= 0.88) { parkScore = -4; factors.push({ label: `Strong pitcher's park ${pfOverall.toFixed(2)}×`,type:'neg', pts: -4 }); }
  else if (pfOverall <= 0.93) { parkScore = -3; factors.push({ label: `Pitcher-friendly park ${pfOverall.toFixed(2)}×`,type:'neg', pts: -3 }); }
  else if (pfOverall <= 0.97) { parkScore = -2; factors.push({ label: `Slight pitcher edge ${pfOverall.toFixed(2)}×`,  type:'neg', pts: -2 }); }

  const raw = 50 + skill + form + opp + matchup + bullpen + weatherScore + parkScore;
  return { score: clamp(Math.round(raw), 15, 95), factors };
}
```

Replace with:
```javascript
function computeHitScore(batter, pitcher, orderPos, weather, parkFactor, bullpenEra = 0, bullpenH9 = 0) {
  const factors      = [];
  const skill        = _hitSkillScore(batter, factors);
  const form         = _hitRecentFormScore(batter, factors);
  const opp          = _hitOpportunityScore(batter, orderPos, factors);
  const weatherScore = _hitWeatherScore(weather, factors);

  // Park factor — capped ±4
  let parkScore = 0;
  const pfOverall = parkFactor?.overall || 1.0;
  if      (pfOverall >= 1.10) { parkScore =  4; factors.push({ label: `Hitter's park ${pfOverall.toFixed(2)}×`,        type:'pos', pts:  4 }); }
  else if (pfOverall >= 1.05) { parkScore =  3; factors.push({ label: `Hitter-friendly park ${pfOverall.toFixed(2)}×`, type:'pos', pts:  3 }); }
  else if (pfOverall >= 1.02) { parkScore =  2; factors.push({ label: `Slight hitter edge ${pfOverall.toFixed(2)}×`,   type:'pos', pts:  2 }); }
  else if (pfOverall <= 0.88) { parkScore = -4; factors.push({ label: `Strong pitcher's park ${pfOverall.toFixed(2)}×`,type:'neg', pts: -4 }); }
  else if (pfOverall <= 0.93) { parkScore = -3; factors.push({ label: `Pitcher-friendly park ${pfOverall.toFixed(2)}×`,type:'neg', pts: -3 }); }
  else if (pfOverall <= 0.97) { parkScore = -2; factors.push({ label: `Slight pitcher edge ${pfOverall.toFixed(2)}×`,  type:'neg', pts: -2 }); }

  const raw = 50 + skill + form + opp + weatherScore + parkScore;
  return { score: clamp(Math.round(raw), 15, 95), factors };
}
```

Removed: `matchup` and `bullpen` declarations and their contribution to `raw`. Params `pitcher`, `bullpenEra`, `bullpenH9` are kept to avoid touching the call site — code-simplifier cleans them up after verification.

- [ ] **Step 3: Verify in browser**

Open `index.html`. Open DevTools console. Run:
```javascript
// computeHitScore must return a valid object, no errors
typeof computeHitScore; // 'function'
// _hitMatchupScore and _hitBullpenScore must still exist (used by Lab)
typeof _hitMatchupScore;  // 'function'
typeof _hitBullpenScore;  // 'function'
// state.sigmoidSlope must be null on fresh load
state.sigmoidSlope; // null
```

Zero JS errors.

- [ ] **Step 4: Run code-simplifier**

Run code-simplifier on `computeHitScore` (lines 3948-3969) only. Remove unused params `pitcher`, `bullpenEra`, `bullpenH9` from the signature and its call site at line ~4571 if they are now fully unused. Preserve all existing behavior.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "fix: strip pitcher factors from hitScore — pure batter quality metric (tier2 issue 1)"
```

---

## Task 2: Savant-Based `_starterBonus` with Debut Penalty

**Files:**
- Modify: `index.html:~12386-12403` (`_starterBonus`)
- Modify: `index.html:~12185` (`handleTeamScan`)

Replaces the 6-bracket ERA lookup with Savant pitch-mix quality scoring. ERA bracket remains as fallback. Debut/no-data named pitchers get -8 instead of 0.

- [ ] **Step 1: Replace `_starterBonus`**

Find this exact function:
```javascript
function _starterBonus(pitcher) {
  const s = pitcher?.seasonStats;
  if (!s) return 0;
  const era = s.era != null ? parseFloat(s.era) : null;
  if (era == null) return 0;
  let eraScore;
  if      (era <= 2.50) eraScore = 15;
  else if (era <= 3.25) eraScore = 10;
  else if (era <= 3.75) eraScore =  5;
  else if (era <= 4.50) eraScore =  0;
  else if (era <= 5.25) eraScore = -5;
  else                  eraScore = -10;
  const ip = parseFloat(s.inningsPitched) || 0;
  const k9 = ip > 0 ? (parseFloat(s.strikeOuts) || 0) / ip * 9 : 0;
  const k9Score  = k9 >= 11 ? 5 : k9 >= 9.5 ? 3 : k9 >= 8 ? 1 : k9 >= 6.5 ? 0 : k9 >= 5 ? -2 : ip > 0 ? -5 : 0;
  const durScore = ip >= 50 ? 3 : ip >= 35 ? 1 : ip >= 18 ? 0 : ip > 0 ? -2 : 0;
  return Math.max(-15, Math.min(20, eraScore + k9Score + durScore));
}
```

Replace with:
```javascript
function _starterBonus(pitcher, gameLog = null) {
  if (!pitcher) return 0;
  const s = pitcher?.seasonStats;

  // 1. Savant pitch-mix scoring (primary)
  const savantRows = state.savantPitcher?.get(String(pitcher.id)) ?? [];
  const pitches    = savantRows.filter(r => parseFloat(r.pitch_usage) >= 10);
  if (pitches.length) {
    const weightedWhiff = pitches.reduce((acc, r) =>
      acc + (parseFloat(r.pitch_usage) / 100) * (parseFloat(r.whiff_percent) / 100), 0);
    const weightedWOBA  = pitches.reduce((acc, r) =>
      acc + (parseFloat(r.pitch_usage) / 100) * (parseFloat(r.woba) || 0), 0);
    const whiffPts =
      weightedWhiff >= 0.30 ? 12 : weightedWhiff >= 0.25 ? 6 :
      weightedWhiff >= 0.20 ? 2  : weightedWhiff >= 0.15 ? 0 : -8;
    const wobaPts =
      weightedWOBA <= 0.250 ? 8  : weightedWOBA <= 0.290 ? 3 :
      weightedWOBA <= 0.330 ? 0  : weightedWOBA <= 0.370 ? -4 : -10;
    return Math.max(-15, Math.min(20, whiffPts + wobaPts));
  }

  // 2. Debut / no MLB data penalty
  const era = s?.era != null ? parseFloat(s.era) : null;
  if (!era || era <= 0) return -8;

  // 3. ERA bracket fallback (recency blending wired in Task 3)
  let eraScore;
  if      (era <= 2.50) eraScore = 15;
  else if (era <= 3.25) eraScore = 10;
  else if (era <= 3.75) eraScore =  5;
  else if (era <= 4.50) eraScore =  0;
  else if (era <= 5.25) eraScore = -5;
  else                  eraScore = -10;
  const ip = parseFloat(s.inningsPitched) || 0;
  const k9 = ip > 0 ? (parseFloat(s.strikeOuts) || 0) / ip * 9 : 0;
  const k9Score  = k9 >= 11 ? 5 : k9 >= 9.5 ? 3 : k9 >= 8 ? 1 : k9 >= 6.5 ? 0 : k9 >= 5 ? -2 : ip > 0 ? -5 : 0;
  const durScore = ip >= 50 ? 3 : ip >= 35 ? 1 : ip >= 18 ? 0 : ip > 0 ? -2 : 0;
  return Math.max(-15, Math.min(20, eraScore + k9Score + durScore));
}
```

- [ ] **Step 2: Add `ensureSavantData` to `handleTeamScan`**

Find inside `handleTeamScan`'s try block:
```javascript
  try {
    _scanShowLoading(
      '🏟️ Team Win Predictor',
```

Replace with:
```javascript
  try {
    await ensureSavantData(new Date().getFullYear());
    _scanShowLoading(
      '🏟️ Team Win Predictor',
```

- [ ] **Step 3: Verify in browser**

Open DevTools → Network tab. Run Team Win Predictor scan. Confirm two requests to `baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats` fire (status 200, ~250KB each). Run scan again — confirm NO new Savant requests (cache hit). Check console — zero errors.

- [ ] **Step 4: Run code-simplifier**

Run code-simplifier on the modified `_starterBonus` only. Preserve all behavior exactly.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "fix: Savant pitch-mix _starterBonus with debut penalty, ERA fallback (tier2 issue 3)"
```

---

## Task 3: Pitcher Game Log — Recency Blending

**Files:**
- Modify: `index.html` — new `fetchPitcherGameLog` (before `fetchStreaks` at ~line 4631)
- Modify: `index.html` — new `_recentEra` helper (before `_projRuns` at ~line 12349)
- Modify: `index.html` — `_starterBonus` ERA fallback path
- Modify: `index.html` — `processGame` (store logs on `gd`)
- Modify: `index.html` — `runTeamScan` `_starterBonus` call sites

`fetchStreaks` uses `group=hitting` — batter-only. Pitcher game logs need a new function with `group=pitching`.

- [ ] **Step 1: Add `fetchPitcherGameLog`**

Find `async function fetchStreaks(playerId) {` at line ~4631. Insert immediately BEFORE it:

```javascript
async function fetchPitcherGameLog(pitcherId) {
  const season = new Date().getFullYear();
  const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=gameLog&season=${season}&group=pitching&gameType=R`;
  try {
    const data = await cachedFetch(url);
    const statsArr = data?.stats || [];
    let splits = [];
    for (const s of statsArr) {
      if (Array.isArray(s.splits) && s.splits.length > 0) { splits = s.splits; break; }
    }
    return splits
      .filter(g => g.date !== state.date)
      .map(g => ({
        date:           g.date,
        inningsPitched: g.stat?.inningsPitched || '0',
        earnedRuns:     g.stat?.earnedRuns     || 0,
      }));
  } catch { return []; }
}

```

- [ ] **Step 2: Add `_recentEra` helper**

Find `function _projRuns(lineupComposite` at line ~12349. Insert immediately BEFORE it:

```javascript
function _recentEra(gameLog, seasonEra) {
  const starts = (gameLog || [])
    .filter(g => parseFloat(g.inningsPitched) > 0)
    .slice(-3);
  if (starts.length < 2) return seasonEra;
  const er = starts.reduce((s, g) => s + (parseFloat(g.earnedRuns)     || 0), 0);
  const ip = starts.reduce((s, g) => s + (parseFloat(g.inningsPitched) || 0), 0);
  const recentEra = ip > 0 ? (er / ip) * 9 : seasonEra;
  return 0.4 * recentEra + 0.6 * seasonEra;
}

```

- [ ] **Step 3: Update ERA fallback in `_starterBonus` to use `_recentEra`**

In `_starterBonus`, find the ERA bracket comment and first comparison:
```javascript
  // 3. ERA bracket fallback (recency blending wired in Task 3)
  let eraScore;
  if      (era <= 2.50) eraScore = 15;
  else if (era <= 3.25) eraScore = 10;
  else if (era <= 3.75) eraScore =  5;
  else if (era <= 4.50) eraScore =  0;
  else if (era <= 5.25) eraScore = -5;
  else                  eraScore = -10;
```

Replace with:
```javascript
  // 3. ERA bracket fallback with last-3-starts recency blend
  const blendedEra = _recentEra(gameLog, era);
  let eraScore;
  if      (blendedEra <= 2.50) eraScore = 15;
  else if (blendedEra <= 3.25) eraScore = 10;
  else if (blendedEra <= 3.75) eraScore =  5;
  else if (blendedEra <= 4.50) eraScore =  0;
  else if (blendedEra <= 5.25) eraScore = -5;
  else                         eraScore = -10;
```

- [ ] **Step 4: Store pitcher game logs in `processGame`**

Grep for where `awayPitcher` is stored on `gd` in `processGame`:
```bash
grep -n "gd\.awayPitcher\s*=" index.html | head -5
```

After the line that stores `gd.homePitcher = ...`, add:
```javascript
    gd.awayPitcherGameLog = gd.awayPitcher?.id ? await fetchPitcherGameLog(gd.awayPitcher.id) : [];
    gd.homePitcherGameLog = gd.homePitcher?.id ? await fetchPitcherGameLog(gd.homePitcher.id) : [];
```

`processGame` must already be `async` — verify with grep before editing.

- [ ] **Step 5: Update `runTeamScan` `_starterBonus` call sites**

In `runTeamScan`, find:
```javascript
    const awayStarter  = _starterBonus(gd.awayPitcher);
    const homeStarter  = _starterBonus(gd.homePitcher);
```

Replace with:
```javascript
    const awayStarter  = _starterBonus(gd.awayPitcher, gd.awayPitcherGameLog);
    const homeStarter  = _starterBonus(gd.homePitcher, gd.homePitcherGameLog);
```

- [ ] **Step 6: Verify in browser**

Open DevTools → Network. Run scan. Confirm requests to `statsapi.mlb.com/.../stats?stats=gameLog&...group=pitching` appear for announced starters. Console:
```javascript
// _recentEra formula check: 2 starts, 3 ER in 11 IP, season ERA 4.00
// recentEra = (3/11)*9 = 2.45, blended = 0.4*2.45 + 0.6*4.00 = 0.98 + 2.40 = 3.38
_recentEra([{inningsPitched:'6',earnedRuns:0},{inningsPitched:'5',earnedRuns:3}], 4.00);
// Expected: ~3.38

// No-op when < 2 starts
_recentEra([{inningsPitched:'5',earnedRuns:2}], 4.00); // Expected: 4.00 (passthrough)
_recentEra([], 4.00);                                   // Expected: 4.00 (passthrough)
```

Zero console errors.

- [ ] **Step 7: Run code-simplifier**

Run code-simplifier on `_recentEra` and the modified sections of `_starterBonus` only. Preserve all behavior exactly.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "fix: pitcher game log recency blending in _starterBonus ERA fallback (tier2 issue 5)"
```

---

## Task 4: OPS-Based Recent Form

**Files:**
- Modify: `index.html:~12417` (insert `_playerOps` before `_teamRecentForm`)
- Modify: `index.html:~12417-12428` (`_teamRecentForm` body)

`last7Stats.ops` is already computed by `aggGames` (line 4678) — the upgrade is a direct field read with component fallback.

- [ ] **Step 1: Insert `_playerOps` helper before `_teamRecentForm`**

Find the exact start of `_teamRecentForm`:
```javascript
function _teamRecentForm(players) {
  if (!players.length) return 0;
  let delta = 0, count = 0;
```

Insert immediately BEFORE it:
```javascript
function _playerOps(stats) {
  if (!stats) return null;
  if (stats.ops != null) return parseFloat(stats.ops) || null;
  const ab  = parseFloat(stats.atBats)   || 0;
  const h   = parseFloat(stats.hits)     || 0;
  const d   = parseFloat(stats.doubles)  || 0;
  const t   = parseFloat(stats.triples)  || 0;
  const hr  = parseFloat(stats.homeRuns) || 0;
  const obp = parseFloat(stats.obp)      || null;
  if (ab === 0) return null;
  const slg = (h + d + 2 * t + 3 * hr) / ab;
  return obp != null ? obp + slg : null;
}

```

- [ ] **Step 2: Replace `_teamRecentForm` body**

Find the exact function (lines ~12417-12428):
```javascript
function _teamRecentForm(players) {
  if (!players.length) return 0;
  let delta = 0, count = 0;
  for (const p of players) {
    const l7  = p.last7Stats?.avg  || 0;
    const sea = p.seasonStats?.avg || 0;
    if (l7 > 0 && sea > 0) { delta += (l7 - sea); count++; }
  }
  if (!count) return 0;
  const avg = delta / count;
  return avg >= 0.060 ? 8 : avg >= 0.035 ? 5 : avg >= 0.015 ? 2 : avg >= -0.015 ? 0 : avg >= -0.035 ? -2 : avg >= -0.060 ? -5 : -8;
```

Replace with:
```javascript
function _teamRecentForm(players) {
  if (!players.length) return 0;
  let delta = 0, count = 0;
  for (const p of players) {
    const l7ops  = _playerOps(p.last7Stats);
    const seaOps = _playerOps(p.seasonStats);
    if (l7ops != null && seaOps != null && seaOps > 0) { delta += (l7ops - seaOps); count++; }
  }
  if (!count) return 0;
  const avg = delta / count;
  return avg >= 0.180 ? 8 : avg >= 0.100 ? 5 : avg >= 0.040 ? 2 : avg >= -0.040 ? 0 : avg >= -0.100 ? -2 : avg >= -0.180 ? -5 : -8;
```

- [ ] **Step 3: Verify in browser**

Open DevTools console. Run:
```javascript
_playerOps({ ops: '0.850' });           // Expected: 0.85
_playerOps({ ops: null, atBats: '20', hits: '5', doubles: '2', triples: '0', homeRuns: '1', obp: '0.310' });
// SLG = (5+2+0+3)/20 = 0.5, OPS = 0.310+0.5 = 0.81  Expected: ~0.81
_playerOps(null);                       // Expected: null
_playerOps({ atBats: '0' });           // Expected: null
```

Zero console errors.

- [ ] **Step 4: Run code-simplifier**

Run code-simplifier on `_playerOps` and `_teamRecentForm` only. Preserve all behavior exactly.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "fix: OPS-based team recent form replaces AVG-only delta (tier2 issue 4)"
```

---

## Task 5: Sigmoid Back-Test Calibration

**Files:**
- Modify: `index.html:~12452` (`_winProbability` — replace with calibrated version + new `_calibrateSigmoidSlope`)
- Modify: `index.html:~12185` (`handleTeamScan` — add calibration trigger)

`state.sigmoidSlope` was added in Task 1 Step 1.

- [ ] **Step 1: Replace `_winProbability` and insert `_calibrateSigmoidSlope`**

Find the exact function:
```javascript
function _winProbability(scoreDiff) {
  return Math.round(100 / (1 + Math.exp(-0.08 * scoreDiff)));
}
```

Replace with:
```javascript
function _calibrateSigmoidSlope(finalResults) {
  if (finalResults.length < 5) return 0.023;
  let lo = 0.005, hi = 0.5;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    let grad = 0;
    for (const r of finalResults) {
      const diff = r.homeScore - r.awayScore;
      const p    = 1 / (1 + Math.exp(-mid * diff));
      const y    = r.actualWinner === 'home' ? 1 : r.actualWinner === 'away' ? 0 : 0.5;
      grad += diff * (p - y);
    }
    if (grad > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

function _winProbability(scoreDiff) {
  const k = state.sigmoidSlope ?? 0.023;
  return Math.round(100 / (1 + Math.exp(-k * scoreDiff)));
}
```

- [ ] **Step 2: Add calibration trigger in `handleTeamScan`**

In `handleTeamScan`, find the `_labShow('labScreenTeamScan');` call that appears inside the try block after cards are rendered. It appears after `cards.innerHTML = ...`. Find this exact context:

```javascript
    }
    _labShow('labScreenTeamScan');
  } catch(e) {
    _scanRestoreLoading();
```

Replace with:
```javascript
    }
    const _finalForCalib = results.filter(r => r.isFinal && r.actualWinner);
    state.sigmoidSlope = _calibrateSigmoidSlope(_finalForCalib);
    _labShow('labScreenTeamScan');
  } catch(e) {
    _scanRestoreLoading();
```

- [ ] **Step 3: Verify in browser**

Run Team Win Predictor scan. Open DevTools console:
```javascript
// Slope should be set after scan
state.sigmoidSlope;
// If >= 5 final games: a number (e.g. 0.015-0.05), NOT null
// If < 5 final games: null (fallback 0.023 used in _winProbability)

// Verify fallback
_calibrateSigmoidSlope([]); // Expected: 0.023

// Win probabilities should be realistic (52-70% for typical edges)
_winProbability(20); // With slope ~0.023: ~62% (vs old 83%)
_winProbability(0);  // Expected: 50%
_winProbability(50); // With slope ~0.023: ~76% max (vs old 98%)
```

Check that Team Win Predictor cards now show win probabilities in the 52-70% range for most games.

- [ ] **Step 4: Run code-simplifier**

Run code-simplifier on `_calibrateSigmoidSlope` and `_winProbability` only. Preserve all behavior exactly.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "fix: sigmoid back-test calibration replaces hardcoded 0.08 slope (tier2 issue 2)"
```

---

## Task 6: Final Regression Check and Push

- [ ] **Step 1: Full visual regression**

Open `index.html` in browser. Run Team Win Predictor scan. Verify:

| Check | Expected |
|---|---|
| Win probabilities on typical games | 52-70% range (not 80-92%) |
| Named debut starter | That team's score noticeably lower; card edge bars reflect it |
| Known Savant-tracked ace | StarterBonus higher than ERA alone (Savant whiff/wOBA drives it) |
| Recent-form hot team | Positive form boost reflected in edge bar |
| Network: Savant requests | 2 on first scan, 0 on repeat |
| Network: pitcher game log requests | 1 per announced starter per game |

Zero JS errors in DevTools console.

- [ ] **Step 2: Push to GitHub Pages**

```bash
git push origin main
```

- [ ] **Step 3: Confirm live site**

Navigate to GitHub Pages URL. Ctrl+Shift+R. Run scan. Confirm win probabilities are realistic (52-70% typical range).
