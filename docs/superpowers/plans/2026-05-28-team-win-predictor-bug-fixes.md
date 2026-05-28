# Team Win Predictor Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 7 correctness bugs in the Team Win Predictor — grade calibration, O/U accuracy, winner-label clarity, tie-prediction handling, and postmortem correctness.

**Architecture:** Single surgical file — all changes are in `index.html`. No new files. No function restructuring. Tasks are ordered so that latent bugs (masked by other bugs) are fixed before the masking bug is removed.

**Tech Stack:** Vanilla JS, single HTML file SPA. No test framework — verification is browser-based via DevTools console and visual inspection.

---

## File Map

| File | Lines touched | What changes |
|---|---|---|
| `index.html` | 609 | CSS: add `.twp-pred-label`, `.twp-result-neutral` |
| `index.html` | 12349-12351 | `_projRuns` signature — add pitching + park params |
| `index.html` | 12456-12464 | `_predictionGrade` — add bullpen params + new thresholds |
| `index.html` | 12502 | Grade call site — pass bullpen ERA values |
| `index.html` | 12532-12534 | `results.push` — update `_projRuns` call sites |
| `index.html` | 12699-12703 | Winner strip — add `Prediction` label; derive tie confidence |
| `index.html` | 12705-12734 | Result strip IIFE — fix `predCorrect`, `predComps`, postmortem score |

---

## Task 1: CSS — New Badge and Label Classes

**Files:**
- Modify: `index.html:609`

- [ ] **Step 1: Add two CSS classes after `.twp-postmortem`**

Find this exact text at line 609:

```
.twp-postmortem { padding:7px 14px 9px; font-size:11px; color:#94a3b8; line-height:1.5; border-top:1px solid #1e293b; background:#0f172a; }
.lab-compare-table
```

Replace with:

```
.twp-postmortem { padding:7px 14px 9px; font-size:11px; color:#94a3b8; line-height:1.5; border-top:1px solid #1e293b; background:#0f172a; }
.twp-pred-label { font-size:9px; text-transform:uppercase; letter-spacing:.6px; color:var(--text-muted); font-weight:700; margin-right:6px; }
.twp-result-neutral { background:#94a3b822; color:#94a3b8; border:1px solid #94a3b844; }
.lab-compare-table
```

- [ ] **Step 2: Verify CSS parsed — open browser DevTools console**

```javascript
// Should log an empty NodeList (class not yet in DOM), not throw
document.querySelectorAll('.twp-pred-label').length; // 0 — OK
document.querySelectorAll('.twp-result-neutral').length; // 0 — OK
```

No console errors = classes parsed cleanly.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "style: add twp-pred-label and twp-result-neutral CSS classes"
```

---

## Task 2: Result Strip IIFE — Fix Bugs 5, 2, and 4

**Files:**
- Modify: `index.html:12705-12734`

Bug 5 (latent tie-case `predComps`) must be fixed before Bug 2 (`predCorrect`), because Bug 2's fix exposes Bug 5. All three bugs live in the same IIFE — fix together.

- [ ] **Step 1: Replace the entire result strip IIFE**

Find this exact block (lines 12705-12734):

```javascript
    ${isFinal && actualWinner ? (() => {
      const predCorrect   = winner === actualWinner || winner === 'tie';
      const actualName    = actualWinner === 'away' ? escHtml(awayAbbr||'Away') : escHtml(homeAbbr||'Home');
      const scoreLine     = `${escHtml(awayAbbr||'Away')} ${actualAwayScore} – ${actualHomeScore} ${escHtml(homeAbbr||'Home')}`;
      const resultBadge   = predCorrect
        ? `<span class="twp-result-badge twp-result-correct">&#10003; Correct</span>`
        : `<span class="twp-result-badge twp-result-wrong">&#10007; Missed</span>`;

      let postmortem = '';
      if (!predCorrect) {
        const predComps    = winner === 'away' ? awayComponents : homeComponents;
        const actualComps  = winner === 'away' ? homeComponents : awayComponents;
        const predAbbr     = winner === 'away' ? escHtml(awayAbbr||'Away') : escHtml(homeAbbr||'Home');
        const diffs = [
          { name: 'offense',  delta: (predComps.lineup + (predComps.form||0)) - (actualComps.lineup + (actualComps.form||0)) },
          { name: 'starting pitcher', delta: (predComps.starter||0) - (actualComps.starter||0) },
          { name: 'bullpen',  delta: (predComps.bullpen||0) - (actualComps.bullpen||0) },
        ].filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta);
        const driver = diffs.length >= 2
          ? `${diffs[0].name} and ${diffs[1].name}`
          : diffs.length === 1 ? diffs[0].name : 'overall model metrics';
        const predProb = winner === 'away' ? awayWinProb : homeWinProb;
        postmortem = `<div class="twp-postmortem">Model favored ${predAbbr} (${predProb}%) on ${driver}, but ${actualName} took it ${actualAwayScore > actualHomeScore ? actualAwayScore + '–' + actualHomeScore : actualHomeScore + '–' + actualAwayScore}. Pre-game lineup and pitcher projections drove the edge — outcome may reflect bullpen usage, in-game adjustments, or untracked factors.</div>`;
      }

      return `<div class="twp-result-strip">
        <span class="twp-result-score">${scoreLine}</span>
        ${resultBadge}
      </div>${postmortem}`;
    })() : ''}
```

Replace with:

```javascript
    ${isFinal && actualWinner ? (() => {
      // Bug 2: tie is a no-call, not a correct prediction
      const predTie     = winner === 'tie';
      const predCorrect = !predTie && winner === actualWinner;
      const actualName  = actualWinner === 'away' ? escHtml(awayAbbr||'Away') : escHtml(homeAbbr||'Home');
      const scoreLine   = `${escHtml(awayAbbr||'Away')} ${actualAwayScore} – ${actualHomeScore} ${escHtml(homeAbbr||'Home')}`;
      const resultBadge = predTie
        ? `<span class="twp-result-badge twp-result-neutral">— No Call</span>`
        : predCorrect
          ? `<span class="twp-result-badge twp-result-correct">&#10003; Correct</span>`
          : `<span class="twp-result-badge twp-result-wrong">&#10007; Missed</span>`;

      // Bug 5: explicit three-way — when winner==='tie', predComps is null, no postmortem
      const predComps   = winner === 'away' ? awayComponents : winner === 'home' ? homeComponents : null;
      const actualComps = actualWinner === 'away' ? awayComponents : homeComponents;

      let postmortem = '';
      if (!predCorrect && !predTie && predComps) {
        const predAbbr = winner === 'away' ? escHtml(awayAbbr||'Away') : escHtml(homeAbbr||'Home');
        const diffs = [
          { name: 'offense',  delta: (predComps.lineup + (predComps.form||0)) - (actualComps.lineup + (actualComps.form||0)) },
          { name: 'starting pitcher', delta: (predComps.starter||0) - (actualComps.starter||0) },
          { name: 'bullpen',  delta: (predComps.bullpen||0) - (actualComps.bullpen||0) },
        ].filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta);
        const driver = diffs.length >= 2
          ? `${diffs[0].name} and ${diffs[1].name}`
          : diffs.length === 1 ? diffs[0].name : 'overall model metrics';
        const predProb = winner === 'away' ? awayWinProb : homeWinProb;
        // Bug 4: reuse scoreLine — keeps team-labeled context instead of recomputing without labels
        postmortem = `<div class="twp-postmortem">Model favored ${predAbbr} (${predProb}%) on ${driver}, but ${actualName} won (${scoreLine}). Pre-game lineup and pitcher projections drove the edge — outcome may reflect bullpen usage, in-game adjustments, or untracked factors.</div>`;
      }

      return `<div class="twp-result-strip">
        <span class="twp-result-score">${scoreLine}</span>
        ${resultBadge}
      </div>${postmortem}`;
    })() : ''}
```

- [ ] **Step 2: Verify in browser**

Run Team Win Predictor scan. For any completed (Final) game check:

1. **Correct prediction:** green "✓ Correct" badge, no postmortem text.
2. **Missed prediction:** red "✗ Missed" badge + postmortem. Score in postmortem reads e.g. "NYY 4 – 7 BOS" (team-labeled, not just "7–4").
3. **Tie prediction (if any):** gray "— No Call" badge, no postmortem.

Check DevTools console — zero JS errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix: predCorrect logic, tie postmortem guard, postmortem score context (bugs 2,4,5)"
```

---

## Task 3: Winner Strip — Fix Bugs 3 and 6

**Files:**
- Modify: `index.html:12699-12703`

- [ ] **Step 1: Replace the winner strip HTML**

Find this exact block at line 12699:

```javascript
    <div class="twp-winner-strip">
      ${winner !== 'tie'
        ? `<span class="twp-winner-name">&#127942; ${escHtml(winnerName)}</span><span class="twp-winner-conf">${winnerProb}% confidence</span>`
        : `<span class="twp-winner-tie">&#9878; Toss-Up</span><span class="twp-winner-conf">50% confidence</span>`}
    </div>
```

Replace with:

```javascript
    <div class="twp-winner-strip">
      ${winner !== 'tie'
        ? `<span class="twp-pred-label">Prediction</span><span class="twp-winner-name">&#127942; ${escHtml(winnerName)}</span><span class="twp-winner-conf">${winnerProb}% confidence</span>`
        : `<span class="twp-pred-label">Prediction</span><span class="twp-winner-tie">&#9878; Toss-Up</span><span class="twp-winner-conf">${homeWinProb}% confidence</span>`}
    </div>
```

Changes:
- **Bug 3:** `<span class="twp-pred-label">Prediction</span>` added to both branches — labels the strip unconditionally so it never reads as the actual outcome.
- **Bug 6:** `50% confidence` replaced with `${homeWinProb}% confidence` — derives from the sigmoid, not hardcoded.

- [ ] **Step 2: Verify in browser**

Run Team Win Predictor scan. Check any card:

1. Winner strip reads: `PREDICTION  🏆 Boston Red Sox  68% confidence`
2. Tie case reads: `PREDICTION  ⚖ Toss-Up  50% confidence`
3. On a final-game card where prediction was wrong: the "PREDICTION" label makes it unambiguous the trophy strip is pre-game, not the result.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix: label winner strip as Prediction; derive tie confidence from computed value (bugs 3,6)"
```

---

## Task 4: Grade Function — Fix Bug 1

**Files:**
- Modify: `index.html:12456-12464` (`_predictionGrade`)
- Modify: `index.html:12502` (call site)

- [ ] **Step 1: Replace `_predictionGrade`**

Find the exact function at line 12456:

```javascript
function _predictionGrade(awayPosted, homePosted, awayPitcher, homePitcher, hasWeather) {
  let pts = 0;
  if (awayPosted) pts += 3;
  if (homePosted) pts += 3;
  if (awayPitcher?.seasonStats?.era > 0) pts += 1;
  if (homePitcher?.seasonStats?.era > 0) pts += 1;
  if (hasWeather) pts += 1;
  return pts >= 8 ? 'A' : pts >= 6 ? 'B' : pts >= 3 ? 'C' : 'D';
}
```

Replace with:

```javascript
function _predictionGrade(awayPosted, homePosted, awayPitcher, homePitcher, hasWeather, awayBullpenEra, homeBullpenEra) {
  let pts = 0;
  if (awayPosted) pts += 3;
  if (homePosted) pts += 3;
  if (awayPitcher?.seasonStats?.era > 0) pts += 1;
  if (homePitcher?.seasonStats?.era > 0) pts += 1;
  if (awayBullpenEra > 0) pts += 1;
  if (homeBullpenEra > 0) pts += 1;
  if (hasWeather) pts += 1;
  return pts >= 9 ? 'A' : pts >= 7 ? 'B' : pts >= 4 ? 'C' : 'D';
}
```

New thresholds: A >= 9 (both lineups + both starters + both bullpens = exactly 9, no weather needed), B >= 7, C >= 4, D < 4.

- [ ] **Step 2: Update the call site at line 12502**

Find:

```javascript
    const grade       = _predictionGrade(awayPosted, homePosted, gd.awayPitcher, gd.homePitcher, !!weather);
```

Replace with:

```javascript
    const grade       = _predictionGrade(awayPosted, homePosted, gd.awayPitcher, gd.homePitcher, !!weather, gd.awayBullpenEra, gd.homeBullpenEra);
```

- [ ] **Step 3: Verify in browser**

Run Team Win Predictor. Open DevTools console:

```javascript
// Log all grade badges currently rendered
[...document.querySelectorAll('.twp-grade')].map(el => el.textContent);
// Expected: fully-covered games now show "Grade: A" instead of capping at "Grade: B"
```

A game with both confirmed lineups, both starters with ERA data, and both bullpen ERAs fetched should now show "Grade: A".

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix: grade A now reachable — add bullpen inputs, thresholds A>=9/B>=7/C>=4 (bug 1)"
```

---

## Task 5: Projected Runs — Fix Bug 7

**Files:**
- Modify: `index.html:12349-12351` (`_projRuns`)
- Modify: `index.html:12532-12534` (call sites in `runTeamScan`)

- [ ] **Step 1: Replace `_projRuns`**

Find the exact function at line 12349:

```javascript
function _projRuns(composite) {
  return Math.max(1.5, 4.5 + ((composite - 50) / 30) * 2.5);
}
```

Replace with:

```javascript
function _projRuns(lineupComposite, oppSpBonus = 0, oppBullpenBonus = 0, pfVal = 1.0) {
  const batting     = 4.5 + ((lineupComposite - 50) / 30) * 2.0;
  const suppression = (oppSpBonus + oppBullpenBonus) / 33;
  return Math.max(1.0, (batting - suppression) * pfVal);
}
```

The batting coefficient drops from 2.5 to 2.0 to make room for the pitching signal. The suppression divisor 33 produces ~1 run max swing from elite pitching, which is realistic without swamping the batting baseline.

- [ ] **Step 2: Update call sites in `runTeamScan`**

Find lines 12532-12534 (inside `results.push`):

```javascript
      awayProjRuns: _projRuns(awayLineup),
      homeProjRuns: _projRuns(homeLineup),
      predTotal: _projRuns(awayLineup) + _projRuns(homeLineup),
```

Replace with:

```javascript
      awayProjRuns: _projRuns(awayLineup, homeStarter, homeBullpen, pf?.overall ?? 1.0),
      homeProjRuns: _projRuns(homeLineup, awayStarter, awayBullpen, pf?.overall ?? 1.0),
      predTotal: _projRuns(awayLineup, homeStarter, homeBullpen, pf?.overall ?? 1.0) + _projRuns(homeLineup, awayStarter, awayBullpen, pf?.overall ?? 1.0),
```

`awayStarter`, `homeStarter`, `awayBullpen`, `homeBullpen` are all already computed above this line in `runTeamScan` via `_starterBonus` and `_bullpenBonus`. `pf?.overall` is already set as `const pf = gd.parkFactor || getParkFactor(gd.venueName)`.

- [ ] **Step 3: Verify formula in DevTools console**

Open browser, run:

```javascript
// Sanity checks — call directly in console after page loads
_projRuns(50, 0, 0, 1.0);   // avg lineup, avg pitching, neutral park → 4.5
_projRuns(50, 18, 8, 1.0);  // avg lineup, elite SP+pen → ~3.2 (suppressed)
_projRuns(50, 0, 0, 1.12);  // avg everything, Coors-level park → ~5.04
_projRuns(70, 0, 0, 1.0);   // strong lineup, avg pitching → ~5.83
```

- [ ] **Step 4: Visual check**

Run Team Win Predictor scan. On a card with a known elite starting pitcher:
- Away team's `~X.X R proj` should be meaningfully below 4.5 (not equal to 4.5 as before).
- The O/U total should increase for a Coors Field game vs a Petco Park game for otherwise comparable lineups.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "fix: O/U projected runs now accounts for opposing SP, bullpen, and park factor (bug 7)"
```

---

## Task 6: Final Regression Check and Push

- [ ] **Step 1: Full visual regression — run Team Win Predictor scan**

Open `index.html` in browser. Run scan. Verify all 7 fixes:

| Check | Expected |
|---|---|
| Grade badge — fully-covered game | "Grade: A" (not "Grade: B") |
| Winner strip on any card | Starts with dim "PREDICTION" label |
| Tie-prediction confidence | Reads computed value (50%), not hardcoded |
| Final game — correct prediction | Green "✓ Correct", no postmortem |
| Final game — missed prediction | Red "✗ Missed" + postmortem with "NYY 4 – 7 BOS" (labeled) |
| Final game — tie prediction | Gray "— No Call", no postmortem |
| Proj runs vs elite starter | Away team proj R visibly below 4.5 |
| O/U for Coors Field game | Higher total than neutral-park equivalent |

Zero JS errors in DevTools console.

- [ ] **Step 2: Push to GitHub Pages**

```bash
git push origin main
```

- [ ] **Step 3: Hard-refresh live site and confirm**

Navigate to the GitHub Pages URL. Ctrl+Shift+R. Run Team Win Predictor scan. Confirm all badges, labels, and projected numbers reflect the fixes.
