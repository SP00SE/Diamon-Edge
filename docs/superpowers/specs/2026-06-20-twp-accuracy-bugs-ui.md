# TWP Accuracy, Bugs & UI — Design Spec
Date: 2026-06-20  
File: `index.html` (single-file SPA, ~15,000 lines)

---

## Context

The Team Win Predictor (TWP) runs a 15-component scoring model per game and converts the
score differential into win probability via a sigmoid. An audit identified five areas requiring
attention, ordered by user priority: accuracy first, bugs second, UI/mobile last.

---

## Section 1 — Run-Differential Probability Blend

**Problem**: `_winProbability(scoreDiff)` uses only the composite-score gap. Projected run
totals are already computed by `_projRuns` but are never fed back into the probability.
When the model's score-gap says 63% but projected run differential says 51%, the output is
miscalibrated.

**Fix**: Add a second sigmoid path keyed on run differential, then blend:

```
runDiffProb   = 100 / (1 + exp(-0.35 × (homeProjRuns − awayProjRuns)))
scoreDiffProb = existing 100 / (1 + exp(-k × scoreDiff))
blendedProb   = round(0.70 × scoreDiffProb + 0.30 × runDiffProb)
```

- k = 0.35 on run differential → ~60% at a 1-run advantage (matches historical MLB win rates)
- 70/30 blend keeps existing model dominant; run path provides a sanity check
- `_winProbability` signature changes to accept `(scoreDiff, homeProjRuns, awayProjRuns)`
- Call site in `runTeamScan` passes both run projections already available in scope

---

## Section 2 — Bullpen Fatigue Proxy

**Problem**: Bullpen ERA/H9/HBF data is season-aggregate. A team that just won 6 in a row has
almost certainly run their closer and setup men in each of those close-game wins, but the model
treats their bullpen identically to a rested one.

**Fix**: New `_bullpenFatigueAdj(standings)` function:

```
streak length ≥ 7 W : −2 pts applied to bullpen component
streak length 5–6 W : −1 pt
all other cases      :  0 (includes losing streaks — bullpen may be rested)
```

- Applied only to bullpen component (starters rotate regardless of streak)
- Max adjustment −2; intentionally conservative because this is a proxy, not direct usage data
- Added to both away and home bullpen calculations in `runTeamScan`

---

## Section 3 — Critical Bug Fixes

### 3a — NaN Propagation
**Risk**: Any NaN component causes the entire `awayScore`/`homeScore` sum to be NaN, which
then propagates to win probability, projected runs display, and the sigmoid calibration.

**Fix**: Wrap every component with `(val ?? 0)` before summing; add a
`Number.isFinite(awayScore)` guard before using the result. Replace any NaN total with 50
(neutral) and lower confidence to Preliminary.

### 3b — Doubleheader Key Collision
**Risk**: `state.predictions` is keyed by `gamePk`. MLB sometimes uses the same `gamePk` for
both games of a doubleheader; game 2 silently overwrites game 1.

**Fix**: Key by `${gamePk}-${game.gameNumber ?? 1}`. Apply same change to `state.twpResultsByPk`
and any lookup by gamePk. (No change to the displayed label — `gamePk` stays as the canonical
identifier for API calls.)

### 3c — Wind Direction Range
**Bug**: Current check `windDir >= 135 && windDir <= 315` excludes the 315–360° arc
(north-northwest to north) which is also "blowing in." Compass bearings are circular.

**Fix**: `windDir < 135 || windDir > 315` for "blowing out toward center field" (south arc).
Invert for "blowing in."

### 3d — Trap Warning Stack
**Bug**: `_teamScanSummary` uses `if / else if` for trap detection — only one trap shown even
when multiple apply.

**Fix**: Collect all matching traps into an array, return up to 3. The card HTML already
renders `trapWarning` as a string; change to render an array with one chip per trap.

### 3e — Postmortem Null Crash
**Bug**: Postmortem computes `runMargin` from `actualAwayScore` / `actualHomeScore` without
guarding for null when game data is incomplete.

**Fix**: Guard `if (actualAwayScore == null || actualHomeScore == null) return earlyExitHtml`.

---

## Section 4 — Postgame Review Specificity

**Problem**: Postmortem text is sometimes generic ("pitching underperformed"). The actual
pitcher name, ERA entering the game, and the component that diverged most are available but
not consistently surfaced.

**Fix**: In the postmortem block, for each component that was predicted to be an edge and
wasn't, inject:

- Pitcher name + ERA entering game  
- Actual ER/IP from box score (already in `gd.awayPitcherGameLog` / `gd.homePitcherGameLog`)
- Which component diverged most (starter vs. bullpen vs. lineup)

Example output:
> "Model expected [Pitcher] to suppress runs (ERA 3.12), but he allowed 5 ER in 3.1 IP —
> an ERA-trap scenario was not flagged. Watch for high-K / high-ERA starters next time."

---

## Section 5 — Mobile CSS

**Problem**: TWP cards have no responsive breakpoints. On phones (< 600px):
- `.twp-body` 3-column flex compresses below readable width
- `.twp-matchup-note` has `padding-left: 70px` which pushes text off-screen
- `.twp-player-name` hard-coded `max-width: 100px` truncates in wrong places

**Fix**: Add `@media (max-width: 600px)` block:

```css
.twp-body          { flex-direction: column; }
.twp-team-col      { flex: unset; width: 100%; }
.twp-vs-col        { display: none; }          /* hide VS spacer on mobile */
.twp-edge-row      { gap: 4px; flex-wrap: wrap; }
.twp-matchup-note  { padding-left: 8px; }      /* remove 70px push */
.twp-player-name   { max-width: 160px; }
```

---

## What Is NOT Changed

- `_lineupScore` formula (already amplified 1.4× in last session)
- `_starterBonus` signal weights (K/9, WHIP, QS rate, command trend)
- BTS, Lab, Hit Score, HR Score, Arsenal Hit Finder, Daily Dominator
- Individual Lab Matchup Score formula
- Sigmoid slope calibration logic (only the inputs it receives change)
- Any payment, auth, or subscription code

---

## Verification Steps

1. Run `node tests/lab-scorer.test.js` — expect 119 passed, 0 failed
2. Open TWP on a day with a doubleheader — both games appear as separate cards
3. Open TWP with no games → no NaN displayed
4. Simulate a final game → postmortem renders with pitcher name and actual ER/IP
5. On mobile viewport (375px) → cards stack vertically, no horizontal overflow
