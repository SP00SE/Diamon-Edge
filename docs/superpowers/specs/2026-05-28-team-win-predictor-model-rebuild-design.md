# Team Win Predictor — Tier 2 Model Rebuild Design Spec

**Date:** 2026-05-28
**Scope:** Tier 2 model accuracy improvements. Tier 1 correctness bugs are already fixed (see `2026-05-28-team-win-predictor-bug-fixes-design.md`).
**File:** `C:\Users\Arish\OneDrive\Desktop\Projects\Baseball\index.html`
**Approach:** Strip double-counting first, then calibrate sigmoid, then wire Savant, then improve form and recency signals.

---

## Background

The comprehensive-review agent identified 5 structural model issues that cause the Team Win Predictor to systematically over-report win probabilities and misattribute prediction confidence. All 5 are fixed in this spec.

---

## Issue 1 — Strip Pitcher Factors from `hitScore` Globally

### Problem
`computeHitScore` calls `_hitMatchupScore` (WHIP, K%, contact, BABIP, BACON, handedness — up to +/-26 per player) and `_hitBullpenScore` (+/-4). These same pitcher quality signals are then added again at the team level via `_starterBonus` and `_bullpenBonus` in `runTeamScan`. The same pitcher moves the score margin twice.

### Fix
Remove the `_hitMatchupScore` and `_hitBullpenScore` calls from `computeHitScore`. `hitScore` becomes a pure batter quality metric: season stats, recent form, park factor, lineup position — no opposing pitcher adjustment.

**Scope:** Global. Individual daily picks (Best Bets, top hit picks) will now rank batters by inherent quality, independent of today's matchup. Lab analysis is unaffected — `computeLabMatchupScore` has its own separate pitcher matchup pipeline.

**What stays:** `_hitMatchupScore` and `_hitBullpenScore` functions remain in the codebase — still referenced by `computeLabMatchupScore`. Only their call inside `computeHitScore` is removed.

**`hrScore` check:** Before editing, verify whether `_hrPitchTypeMatchupScore` feeds into `hrScore` or `hitScore`. If `hrScore`, leave it untouched. If `hitScore`, remove that call too.

---

## Issue 2 — Sigmoid Recalibration via Back-Test

### Problem
Slope `0.08` against the existing score scale produces chronic 80-92% win probabilities. After the double-count strip the scale contracts, but the fundamental miscalibration remains. MLB single-game favorites realistically top out at 60-65% implied probability.

### Fix

**New state field:** `state.sigmoidSlope` — defaults to `0.023` (theoretical fallback), updated once per session via back-test.

**Theoretical fallback derivation:** After strip, a 20-point score edge should yield ~61% win probability (realistic strong favorite). Solving `0.61 = 1/(1+exp(-k*20))` gives `k ~= 0.023`.

**Back-test function** — runs at end of `handleTeamScan` when >= 5 final games are present in results:

```javascript
function _calibrateSigmoidSlope(finalResults) {
  if (finalResults.length < 5) return 0.023;
  let lo = 0.005, hi = 0.5;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    let grad = 0;
    for (const r of finalResults) {
      const diff = r.homeScore - r.awayScore;
      const p = 1 / (1 + Math.exp(-mid * diff));
      const y = r.actualWinner === 'home' ? 1 : r.actualWinner === 'away' ? 0 : 0.5;
      grad += diff * (p - y);
    }
    if (grad > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
```

**`_winProbability` change:**

```javascript
function _winProbability(scoreDiff) {
  const k = state.sigmoidSlope ?? 0.023;
  return Math.round(100 / (1 + Math.exp(-k * scoreDiff)));
}
```

**Trigger:** At the end of `handleTeamScan`, filter results to `isFinal && actualWinner`, pass to `_calibrateSigmoidSlope`, store result in `state.sigmoidSlope`. Silent — no UI change.

**State initialization:** Add `state.sigmoidSlope = null;` near existing state fields.

---

## Issue 3 — Savant-Based `_starterBonus` with Debut Penalty

### Problem
`_starterBonus` uses a 6-bracket ERA lookup — season-cumulative, coarse, and blind to pitch mix. Rookie/debut pitchers return 0 (neutral), masking a real risk signal for the team deploying them.

### Fix

**Priority ladder inside `_starterBonus`:**

1. **Savant data present** — Savant pitch-mix scoring (primary)
2. **No Savant, ERA > 0** — ERA bracket + K/9 + durability (existing fallback, optionally blended with recency from Issue 5)
3. **No Savant, ERA = 0 or null, pitcher named** — debut penalty: `−8`
4. **Pitcher null/TBD** — `0` (unchanged)

**Savant scoring:**

```javascript
const savantRows = state.savantPitcher?.get(String(pitcher.id)) ?? [];
const pitches = savantRows.filter(r => parseFloat(r.pitch_usage) >= 10);
if (pitches.length) {
  const weightedWhiff = pitches.reduce((s, r) =>
    s + (parseFloat(r.pitch_usage)/100) * (parseFloat(r.whiff_percent)/100), 0);
  const weightedWOBA = pitches.reduce((s, r) =>
    s + (parseFloat(r.pitch_usage)/100) * (parseFloat(r.woba) || 0), 0);

  const whiffPts =
    weightedWhiff >= 0.30 ? 12 : weightedWhiff >= 0.25 ? 6 :
    weightedWhiff >= 0.20 ? 2  : weightedWhiff >= 0.15 ? 0 : -8;

  const wobaPts =
    weightedWOBA <= 0.250 ? 8  : weightedWOBA <= 0.290 ? 3 :
    weightedWOBA <= 0.330 ? 0  : weightedWOBA <= 0.370 ? -4 : -10;

  return Math.max(-15, Math.min(20, whiffPts + wobaPts));
}
```

**Debut penalty check** (after Savant block, before ERA bracket):
```javascript
const hasEra = parseFloat(s?.era) > 0;
if (!hasEra && pitcher) return -8;
```

**Output range:** -15 to +20 — unchanged from current function.

**Async wiring:** `handleTeamScan` calls `await ensureSavantData(new Date().getFullYear())` before `runTeamScan`. `runTeamScan` stays synchronous.

---

## Issue 4 — OPS-Based Recent Form

### Problem
`_teamRecentForm` computes `last7Avg - seasonAvg` per player. Walks and extra-base hits are invisible. A player on a power surge with a modest AVG reads as cold.

### Fix
Replace AVG delta with OPS delta. Data access in order of preference:
1. `last7Stats.ops` and `seasonStats.ops` — use directly if present
2. Compute from components (SLG + OBP if available)
3. Fall back to `avg` delta if neither is present

**Helper function:**
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
  const slg = (h + d + 2*t + 3*hr) / ab;
  return obp != null ? obp + slg : null;
}
```

**New thresholds:**

| OPS delta (last7 - season) | Score |
|---|---|
| >= +0.180 | +8 |
| >= +0.100 | +5 |
| >= +0.040 | +2 |
| within +/-0.039 | 0 |
| <= -0.040 | -2 |
| <= -0.100 | -5 |
| <= -0.180 | -8 |

Output range stays +/-8 — no change to `runTeamScan` score formula.

---

## Issue 5 — Starter Recency via Pitcher Game Log

### Problem
`_starterBonus` uses season ERA — a pitcher rough in April and dominant in May scores middling exactly when he is most dangerous.

### Fix

**Data wiring:** `fetchStreaks` already fetches pitcher game logs. Store them on `gd` during `processGame`:
```javascript
gd.awayPitcherGameLog = awayPitcherLog;
gd.homePitcherGameLog = homePitcherLog;
```

**Blended ERA function:**
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

**Integration** — applies only in the ERA fallback path (Savant path is unaffected):
- >= 2 recent starts in log: `_recentEra(gameLog, seasonEra)` fed into ERA bracket
- < 2 starts or no log: raw `seasonEra` (current behavior)

**`_starterBonus` signature change:**
```javascript
function _starterBonus(pitcher, gameLog = null)
```

**Call sites in `runTeamScan`:**
```javascript
const awayStarter = _starterBonus(gd.awayPitcher, gd.awayPitcherGameLog);
const homeStarter = _starterBonus(gd.homePitcher, gd.homePitcherGameLog);
```

---

## Implementation Order

1. **Issue 1** — Strip `_hitMatchupScore` / `_hitBullpenScore` from `computeHitScore`
2. **Issue 3** — Savant scoring + debut penalty in `_starterBonus`; `ensureSavantData` in `handleTeamScan`
3. **Issue 5** — Wire game log into `gd`; add `_recentEra`; update `_starterBonus` signature and call sites
4. **Issue 4** — Replace AVG with OPS in `_teamRecentForm`; add `_playerOps` helper
5. **Issue 2** — Add `state.sigmoidSlope`; implement `_calibrateSigmoidSlope`; update `_winProbability`; trigger in `handleTeamScan`

After each task: run code-simplifier on modified sections only, preserve behavior exactly.

---

## Out of Scope

- Platoon/handedness team-level modeling
- Bullpen rest/usage tracking
- Umpire tendencies
- Travel/rest-day fatigue
- Defense and baserunning metrics
