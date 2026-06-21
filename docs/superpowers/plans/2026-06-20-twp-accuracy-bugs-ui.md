# TWP Accuracy, Bugs & Mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Team Win Predictor accuracy, fix multi-trap bug, and add mobile-responsive layout.

**Architecture:** All changes are in `index.html` (single-file SPA). No new files created except test additions. Changes are additive — no existing component is removed. Each task is independently testable.

**Tech Stack:** Vanilla JS, no build system, no npm. Tests run via `node tests/lab-scorer.test.js`. TWP functions live inline in `index.html`; they are not exported to `lib/`.

## Global Constraints

- Do NOT modify: BTS, Lab, Hit Score, HR Score, Lab Matchup Score, Arsenal Hit Finder, Daily Dominator, payment code
- Do NOT add npm dependencies
- Do NOT deploy
- Run `node tests/lab-scorer.test.js` after every task — must remain 119 passed, 0 failed
- No placeholders: every code block must be complete and runnable
- Each task ends with a git commit

---

### Task 1: Lineup Score Amplification

**Files:**
- Modify: `index.html` lines 13441–13451 (`_lineupScore` function)

**Context:** The function currently returns a plain weighted average of hitScores (range ~45–75). A great lineup (avg 70) vs average (avg 55) produces only a 15-pt gap in the total score, barely moving win probability. Stretching the output 1.4× from the 50 baseline widens that gap to ~21 pts.

**Interfaces:**
- Consumes: `results` array `[{ player: { orderPos }, score: number }]`
- Produces: `number` in range ~22–78 (was ~45–75)

- [ ] **Step 1: Find the current function**

  Search for `function _lineupScore` — it's at line ~13441. Confirm the current body:
  ```javascript
  function _lineupScore(results) {
    if (!results.length) return 50;
    let wSum = 0, wTotal = 0;
    results.forEach(r => {
      const pos = Math.max(0, Math.min(8, (r.player.orderPos || 5) - 1));
      const w = LINEUP_WEIGHTS[pos];
      wSum += r.score * w;
      wTotal += w;
    });
    return wTotal > 0 ? wSum / wTotal : 50;
  }
  ```

- [ ] **Step 2: Replace with amplified version**

  Replace the `return` line only — everything else stays the same:
  ```javascript
  function _lineupScore(results) {
    if (!results.length) return 50;
    let wSum = 0, wTotal = 0;
    results.forEach(r => {
      const pos = Math.max(0, Math.min(8, (r.player.orderPos || 5) - 1));
      const w = LINEUP_WEIGHTS[pos];
      wSum += r.score * w;
      wTotal += w;
    });
    if (wTotal === 0) return 50;
    const rawAvg = wSum / wTotal;
    return 50 + (rawAvg - 50) * 1.4;
  }
  ```

- [ ] **Step 3: Verify tests still pass**

  Run: `node tests/lab-scorer.test.js`
  Expected: `Results: 119 passed, 0 failed`

  (`_lineupScore` is not exported to `lib/lab-scorer.js`, so no test file changes needed.)

- [ ] **Step 4: Commit**

  ```bash
  git add index.html
  git commit -m "feat(twp): amplify lineup score 1.4x to widen elite vs weak lineup gap"
  ```

---

### Task 2: Dynamic Recent ERA Weighting

**Files:**
- Modify: `index.html` lines 13527–13535 (`_recentEra` function)

**Context:** The function currently blends `0.4 × recentEra + 0.6 × seasonEra` regardless of whether a pitcher is hot or cold. If a pitcher's last 2 starts both had ERA ≥ 6.00, the model still gives 60% weight to their full-season ERA. Raising the recent weight to 65% in that case makes the model more reactive to a struggling starter.

**Interfaces:**
- Consumes: `gameLog` array (objects with `inningsPitched`, `earnedRuns`), `seasonEra: number`
- Produces: `number` (blended ERA)

- [ ] **Step 1: Find the current function**

  Search for `function _recentEra` — it's at line ~13527. Confirm current body ends with:
  ```javascript
  const recentEra = ip > 0 ? (er / ip) * 9 : seasonEra;
  return 0.4 * recentEra + 0.6 * seasonEra;
  ```

- [ ] **Step 2: Replace the return line with conditional weighting**

  Replace only the last two lines (`const recentEra …` through `return …`):
  ```javascript
  function _recentEra(gameLog, seasonEra) {
    const starts = (gameLog || [])
      .filter(g => parseFloat(g.inningsPitched) > 0)
      .slice(-3);
    if (starts.length < 2) return seasonEra;
    const er = starts.reduce((s, g) => s + (parseFloat(g.earnedRuns)     || 0), 0);
    const ip = starts.reduce((s, g) => s + (parseFloat(g.inningsPitched) || 0), 0);
    const recentEra = ip > 0 ? (er / ip) * 9 : seasonEra;
    // Use last-2-start ERAs to detect hot/cold trend
    const last2 = starts.slice(-2);
    const l2ERAs = last2.map(g => {
      const lip = parseFloat(g.inningsPitched) || 0;
      const ler = parseFloat(g.earnedRuns) || 0;
      return lip > 0 ? (ler / lip) * 9 : null;
    }).filter(e => e != null);
    const bothHigh = l2ERAs.length === 2 && l2ERAs[0] >= 6.00 && l2ERAs[1] >= 6.00;
    const bothLow  = l2ERAs.length === 2 && l2ERAs[0] <= 2.50 && l2ERAs[1] <= 2.50;
    const recentWeight = bothHigh ? 0.65 : bothLow ? 0.55 : 0.40;
    return recentWeight * recentEra + (1 - recentWeight) * seasonEra;
  }
  ```

- [ ] **Step 3: Verify tests still pass**

  Run: `node tests/lab-scorer.test.js`
  Expected: `Results: 119 passed, 0 failed`

- [ ] **Step 4: Commit**

  ```bash
  git add index.html
  git commit -m "feat(twp): dynamic recent ERA weighting — 65% recent when last 2 starts both ≥6.00 ERA"
  ```

---

### Task 3: Run-Differential Probability Blend

**Files:**
- Modify: `index.html` lines 14061–14064 (`_winProbability` function)
- Modify: `index.html` lines 14277–14296 (move `_projRuns` before `_winProbability` call; update call)

**Context:** Projected run totals are computed by `_projRuns` but never fed into win probability. When the composite-score gap says 63% but run differential says 51%, the output is miscalibrated. Blending 70% score / 30% run-differential corrects this.

The `_projRuns` computation currently happens at lines ~14295–14296, AFTER the `_winProbability` call at line ~14281. The lines must be reordered.

**Interfaces:**
- `_winProbability(scoreDiff, homeProjRuns?, awayProjRuns?)` → `number` 1–99
- `_homeProjRuns` and `_awayProjRuns` are already computed by existing `_projRuns` calls — just move them earlier

- [ ] **Step 1: Update `_winProbability` signature**

  Find `function _winProbability(scoreDiff)` at line ~14061. Replace the entire function:
  ```javascript
  function _winProbability(scoreDiff, homeProjRuns, awayProjRuns) {
    const k = state.sigmoidSlope ?? 0.023;
    const scoreProb = 100 / (1 + Math.exp(-k * scoreDiff));
    if (homeProjRuns == null || awayProjRuns == null || !Number.isFinite(homeProjRuns) || !Number.isFinite(awayProjRuns)) {
      return Math.round(scoreProb);
    }
    const runDiff = homeProjRuns - awayProjRuns;
    const runProb = 100 / (1 + Math.exp(-0.35 * runDiff));
    return Math.round(0.70 * scoreProb + 0.30 * runProb);
  }
  ```

- [ ] **Step 2: Move `_projRuns` calls before the `_winProbability` call**

  In `runTeamScan`, find the block that currently reads (around line 14277):
  ```javascript
    const hasArsenal   = awayArsenalEdge !== 0 || homeArsenalEdge !== 0;
    const margin       = Math.abs(awayScore - homeScore);
    const winner       = awayScore > homeScore ? 'away' : awayScore < homeScore ? 'home' : 'tie';
    const homeWinProb  = _winProbability(homeScore - awayScore);
    const awayWinProb  = 100 - homeWinProb;
    const confidence   = _predictionConfidence(...);
    const winEdge      = _winEdgeLabel(awayWinProb, homeWinProb);

    const _rawGame    = ...;
    const _isFinal    = ...;
    const _actAway    = ...;
    const _actHome    = ...;
    const _actWinner  = ...;

    const _projTemp     = weather?.temp ?? 70;
    const _projIsDome   = pf?.isDome ?? false;
    const _awayProjRuns = _projRuns(awayLineup + awayBBMatchup + awayKMatchup + awayParkPower, homeStarter, homeBullpen, pf?.overall ?? 1.0, _projTemp, _projIsDome);
    const _homeProjRuns = _projRuns(homeLineup + homeBBMatchup + homeKMatchup + homeParkPower, awayStarter, awayBullpen, pf?.overall ?? 1.0, _projTemp, _projIsDome);
  ```

  Replace it with (projRuns moved BEFORE winProb, and winProb updated to receive them):
  ```javascript
    const hasArsenal   = awayArsenalEdge !== 0 || homeArsenalEdge !== 0;
    const margin       = Math.abs(awayScore - homeScore);
    const winner       = awayScore > homeScore ? 'away' : awayScore < homeScore ? 'home' : 'tie';

    const _projTemp     = weather?.temp ?? 70;
    const _projIsDome   = pf?.isDome ?? false;
    const _awayProjRuns = _projRuns(awayLineup + awayBBMatchup + awayKMatchup + awayParkPower, homeStarter, homeBullpen, pf?.overall ?? 1.0, _projTemp, _projIsDome);
    const _homeProjRuns = _projRuns(homeLineup + homeBBMatchup + homeKMatchup + homeParkPower, awayStarter, awayBullpen, pf?.overall ?? 1.0, _projTemp, _projIsDome);

    const homeWinProb  = _winProbability(homeScore - awayScore, _homeProjRuns, _awayProjRuns);
    const awayWinProb  = 100 - homeWinProb;
    const confidence   = _predictionConfidence(awayPosted, homePosted, gd.awayPitcher, gd.homePitcher, !!(weather && !pf?.isDome), gd.awayBullpenEra, gd.homeBullpenEra, hasArsenal);
    const winEdge      = _winEdgeLabel(awayWinProb, homeWinProb);

    const _rawGame    = (state.games || []).find(g => g.gamePk === gd.gamePk);
    const _isFinal    = _rawGame?.status?.abstractGameState === 'Final';
    const _actAway    = _isFinal ? (_rawGame?.teams?.away?.score ?? null) : null;
    const _actHome    = _isFinal ? (_rawGame?.teams?.home?.score ?? null) : null;
    const _actWinner  = (_actAway != null && _actHome != null)
      ? (_actAway > _actHome ? 'away' : _actAway < _actHome ? 'home' : 'tie') : null;
  ```

- [ ] **Step 3: Verify tests still pass**

  Run: `node tests/lab-scorer.test.js`
  Expected: `Results: 119 passed, 0 failed`

- [ ] **Step 4: Commit**

  ```bash
  git add index.html
  git commit -m "feat(twp): blend run-differential into win probability (70% score / 30% runs)"
  ```

---

### Task 4: Bullpen Fatigue Proxy

**Files:**
- Modify: `index.html` — add `_bullpenFatigueAdj` function after `_streakAdj`
- Modify: `index.html` — apply in `runTeamScan` (lines ~14239 and ~14266)

**Context:** Bullpen ERA is season-aggregate. A team on a 5+ game winning streak has likely used their closer and setup men repeatedly in close-game wins. This applies a small (-1 to -2 pt) penalty to the bullpen component to reflect fatigue risk.

**Interfaces:**
- `_bullpenFatigueAdj(standings)` → `number` (−2, −1, or 0)
- Called once per team; result subtracted from their bullpen score

- [ ] **Step 1: Add `_bullpenFatigueAdj` after `_streakAdj`**

  Find `function _streakAdj(standings)` — it ends with `return isWin ? (n >= 6 ? 2 : 1) : (n >= 6 ? -2 : -1);`. Add the new function immediately after its closing `}`:
  ```javascript
  function _bullpenFatigueAdj(standings) {
    const code = standings?.streak || '';
    if (!code || code.length < 2) return 0;
    if (code.charAt(0) !== 'W') return 0;
    const n = parseInt(code.slice(1)) || 0;
    return n >= 7 ? -2 : n >= 5 ? -1 : 0;
  }
  ```

- [ ] **Step 2: Apply in `runTeamScan` for both teams**

  Find the lines computing `awayBullpen` and `homeBullpen` in `runTeamScan` (around lines 14239 and 14266):
  ```javascript
    const awayBullpen  = _bullpenBonus(gd.awayBullpenEra, gd.awayBullpenH9, gd.awayBullpenHBF, gd.awayBullpenHR9);
  ```
  Replace with:
  ```javascript
    const awayBullpen  = _bullpenBonus(gd.awayBullpenEra, gd.awayBullpenH9, gd.awayBullpenHBF, gd.awayBullpenHR9) + _bullpenFatigueAdj(awayStandings);
  ```

  And similarly:
  ```javascript
    const homeBullpen  = _bullpenBonus(gd.homeBullpenEra, gd.homeBullpenH9, gd.homeBullpenHBF, gd.homeBullpenHR9);
  ```
  Replace with:
  ```javascript
    const homeBullpen  = _bullpenBonus(gd.homeBullpenEra, gd.homeBullpenH9, gd.homeBullpenHBF, gd.homeBullpenHR9) + _bullpenFatigueAdj(homeStandings);
  ```

  **IMPORTANT:** `awayStandings` and `homeStandings` are computed BEFORE `awayBullpen`/`homeBullpen` in the current code (line 14251–14252), so they are in scope. Confirm this by checking that `const awayStandings = ...` and `const homeStandings = ...` appear before the bullpen lines in the file.

- [ ] **Step 3: Verify tests still pass**

  Run: `node tests/lab-scorer.test.js`
  Expected: `Results: 119 passed, 0 failed`

- [ ] **Step 4: Commit**

  ```bash
  git add index.html
  git commit -m "feat(twp): bullpen fatigue proxy — subtract 1-2 pts from bullpen after 5+ W streak"
  ```

---

### Task 5: Multi-Trap Warning Array

**Files:**
- Modify: `index.html` — `_teamScanSummary` function (~line 13592)
- Modify: `index.html` — `_teamScanCardHTML` renderer (~line 14358 and 14652)

**Context:** The 8 trap conditions use `if / else if`, so only the FIRST matching trap is shown. A pitcher on short rest AND both lineups projected will show only one warning. This changes the chain to push all matches into an array (up to 3 shown).

**Interfaces:**
- `_teamScanSummary` previously returned `{ summaryText, mainReason, mainRisk, trapWarning: string }`
- Now returns `{ summaryText, mainReason, mainRisk, trapWarnings: string[] }` (array, length 0–8)
- `results.push(...)` in `runTeamScan` stores `trapWarnings` (array) not `trapWarning` (string)
- Card HTML renders all items in the array

- [ ] **Step 1: Convert `if/else if` chain to `if` + `push`**

  In `_teamScanSummary`, find the block starting with:
  ```javascript
  let trapWarning = '';
  ```
  Replace the entire trap detection block (lines ~13592–13627) with:
  ```javascript
  const traps = [];
  const winnerStSc = winner === 'away' ? homeStarterSc : awayStarterSc;
  const winnerBpSc = winner === 'away' ? homeBullpenSc : awayBullpenSc;
  const loserStSc  = winner === 'away' ? awayStarterSc : homeStarterSc;
  const loserBpSc  = winner === 'away' ? awayBullpenSc : homeBullpenSc;

  if (winner !== 'tie') {
    if (winnerStSc <= 42 && loserK9 >= 9.5 && loserEra >= 4.00)
      traps.push('High ERA but strikeout upside — starter may limit clean offense despite ERA.');
    if (loserStSc >= 65 && loserBpSc <= 40)
      traps.push('Early opportunity against a hittable starter, but elite bullpen may shut down later innings.');
    if (winnerStSc <= 38 && winnerBpSc >= 62)
      traps.push(`${winnerAbbr}'s starter edge may not hold — their bullpen is below average if the game gets long.`);
    if ((pf?.overall ?? 1.0) >= 1.08 && awayScore < 52 && homeScore < 52)
      traps.push('Hitter-friendly park, but neither lineup is showing strong offensive signals.');
    if (winArsenal <= -3)
      traps.push(`${winnerAbbr}'s lineup is strong overall, but the starter's arsenal attacks their weaker pitch-type profiles.`);
    if (winArsenal >= 0 && (winner === 'away' ? awayArsenalEdge : homeArsenalEdge) < 2 && pf?.isHitter)
      traps.push('Hit volume may be solid but run ceiling could be limited without extra-base damage in this park.');
    if (!awayPosted && !homePosted)
      traps.push('Both lineups are projected. Prediction is preliminary — confidence will improve once official lineups are posted.');
    else if (!awayPosted || !homePosted)
      traps.push('One lineup is still projected. Monitor for late scratches before committing.');
    if (winRest <= -5)
      traps.push(`${winnerAbbr}'s starter is on short rest — fatigue could reduce effectiveness and limit pitch count.`);
  }
  ```

- [ ] **Step 2: Update the return statement**

  Find the return at line ~13654:
  ```javascript
  return { summaryText: parts.join(' '), mainReason, mainRisk, trapWarning };
  ```
  Replace with:
  ```javascript
  return { summaryText: parts.join(' '), mainReason, mainRisk, trapWarnings: traps };
  ```

- [ ] **Step 3: Update `runTeamScan` result push**

  Find the `results.push({...})` block at ~line 14355–14358. Change:
  ```javascript
        trapWarning:  _summary.trapWarning,
  ```
  to:
  ```javascript
        trapWarnings: _summary.trapWarnings,
  ```

- [ ] **Step 4: Update card destructure and rendering**

  In `_teamScanCardHTML`, find the destructure block at ~line 14381:
  ```javascript
    awayStandings, homeStandings, homeAdv, hasArsenal,
    awayPitcherName, homePitcherName, awayPitcherEra, homePitcherEra,
    isFinal, actualAwayScore, actualHomeScore, actualWinner,
    awayEraTrap, homeEraTrap,
  } = r;
  ```
  Ensure `trapWarnings` (not `trapWarning`) appears in the destructure. The full destructure block starts at `const { gamePk, ...` — add `trapWarnings` to it if not present.

  Then find:
  ```javascript
    ${trapWarning ? `<div class="twp-trap-warning">&#9888; ${escHtml(trapWarning)}</div>` : ''}
  ```
  Replace with:
  ```javascript
    ${(trapWarnings || []).slice(0, 3).map(w => `<div class="twp-trap-warning">&#9888; ${escHtml(w)}</div>`).join('')}
  ```

- [ ] **Step 5: Verify tests still pass**

  Run: `node tests/lab-scorer.test.js`
  Expected: `Results: 119 passed, 0 failed`

- [ ] **Step 6: Commit**

  ```bash
  git add index.html
  git commit -m "fix(twp): show all matching trap warnings (was if/else if — only showed first)"
  ```

---

### Task 6: Mobile CSS

**Files:**
- Modify: `index.html` — add `@media (max-width: 600px)` block after existing `.twp-body` styles (~line 588)

**Context:** TWP cards have no responsive breakpoints. On phones (< 600px), the 3-column `.twp-body` flex compresses to unreadable width, `.twp-matchup-note` has 70px left-padding pushing text off-screen, and `.twp-player-name` truncates at 100px.

- [ ] **Step 1: Find the end of the `.twp-body` CSS block**

  Locate `.twp-body { display:flex; align-items:stretch; }` at ~line 588. Find the next media query or major CSS group after the TWP styles (search for `@media` or `.lab-` to find where TWP styles end).

- [ ] **Step 2: Add the responsive block**

  After the last `.twp-*` style rule (and before the next unrelated CSS section), insert:
  ```css
  @media (max-width: 600px) {
    .twp-body { flex-direction: column; }
    .twp-team { width: 100%; flex: unset; padding: 10px 12px 8px; flex-direction: row; justify-content: space-between; align-items: center; gap: 8px; }
    .twp-center { display: none; }
    .twp-edge-row { gap: 4px; flex-wrap: wrap; }
    .twp-matchup-note { padding-left: 8px !important; }
    .twp-player-name { max-width: 160px; }
    .twp-winner-strip { flex-direction: column; align-items: flex-start; gap: 4px; padding: 8px 12px; }
    .twp-edge-label { min-width: 52px; font-size: 9px; }
    .twp-header { flex-wrap: wrap; gap: 4px; }
  }
  ```

- [ ] **Step 3: Verify tests still pass**

  Run: `node tests/lab-scorer.test.js`
  Expected: `Results: 119 passed, 0 failed`

- [ ] **Step 4: Commit**

  ```bash
  git add index.html
  git commit -m "fix(twp): add responsive mobile CSS for TWP cards — stack columns on <600px"
  ```

---

### Task 7: Version Bump + Push

**Files:**
- Modify: `index.html` — `APP_VERSION` constant (~line 3894)

**Context:** All accuracy changes in Tasks 1–6 affect the score scale. The cached `twpSigmoidSlope` in localStorage is now stale. Bumping `APP_VERSION` triggers the existing cache-bust block which clears `twpSigmoidSlope` (already added to the clear list in the previous session's commit).

- [ ] **Step 1: Bump version**

  Find:
  ```javascript
  const APP_VERSION = '2026.06.20.1';
  ```
  Replace with:
  ```javascript
  const APP_VERSION = '2026.06.20.2';
  ```

- [ ] **Step 2: Verify tests still pass**

  Run: `node tests/lab-scorer.test.js`
  Expected: `Results: 119 passed, 0 failed`

- [ ] **Step 3: Commit and push**

  ```bash
  git add index.html
  git commit -m "chore: bump APP_VERSION to 2026.06.20.2 — clears stale sigmoid slope cache"
  git push origin main
  ```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Lineup amplification → Task 1
- [x] Dynamic recent ERA weighting → Task 2
- [x] Run-differential probability blend → Task 3
- [x] Bullpen fatigue proxy → Task 4
- [x] Multi-trap warnings → Task 5
- [x] Mobile CSS → Task 6
- [x] Cache bust → Task 7
- [x] Toss-up zone UI → already in code from prior session; not re-added
- [x] Postmortem null guard → already guarded by `isFinal && actualWinner` outer conditional

**Placeholder scan:** No TBD, no "implement later", all code blocks complete.

**Type consistency:** `_bullpenFatigueAdj` returns `number`. `trapWarnings` is `string[]` throughout (summary → push → card render). `_winProbability` new signature `(scoreDiff, homeProjRuns?, awayProjRuns?)` matches call site in Task 3 Step 2.

**Ordering:** Task 3 Step 2 depends on Task 3 Step 1 (`_winProbability` signature). Task 4 Step 2 depends on Task 4 Step 1 (`_bullpenFatigueAdj` must exist). All other tasks are independent.
