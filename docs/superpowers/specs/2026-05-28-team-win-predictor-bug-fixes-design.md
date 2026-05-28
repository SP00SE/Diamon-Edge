# Team Win Predictor — Bug Fix Design Spec

**Date:** 2026-05-28
**Scope:** Tier 1 correctness fixes only. Model architecture improvements (double-counting, sigmoid recalibration, Savant wiring) are deferred to a separate Tier 2 spec.
**File:** `C:\Users\Arish\OneDrive\Desktop\Projects\Baseball\index.html`
**Approach:** Surgical patches — minimal diff, no function restructuring.

---

## Background

The debugging-toolkit and comprehensive-review agents identified 7 correctness bugs in the Team Win Predictor. This spec covers all 7. They fall into two groups:

- **Logic/data bugs:** Grade A unreachable (Bug 1), O/U ignores pitching (Bug 7), latent tie-case postmortem (Bug 5)
- **Display/correctness bugs:** Tie auto-graded Correct (Bug 2), two unlabeled winner strips (Bug 3), postmortem drops team context (Bug 4), hardcoded 50% for ties (Bug 6)

---

## Bug 1 — Grade A Unreachable

### Problem
`_predictionGrade` awards max 9 pts (lineups x2, starter ERAs x2, weather x1). Grade A requires >= 8. Dome stadiums and weather API failures cap the best possible grade at B even with full lineup and pitcher data. Grade A has likely never been awarded.

### Fix
Add 2 pts for bullpen ERA availability. New max = 11 pts.

**New point table:**

| Input | Points |
|---|---|
| Away lineup confirmed | +3 |
| Home lineup confirmed | +3 |
| Away starter ERA > 0 | +1 |
| Home starter ERA > 0 | +1 |
| Away bullpen ERA > 0 | +1 (new) |
| Home bullpen ERA > 0 | +1 (new) |
| Weather available | +1 |
| **Max** | **11** |

**New grade thresholds:**

| Grade | Threshold | Typical scenario |
|---|---|---|
| A | >= 9 | Both lineups + both starters + both bullpens |
| B | >= 7 | Both lineups + both starters (dome, one bullpen missing) |
| C | >= 4 | One lineup confirmed, or projected lineups with starter data |
| D | < 4 | Early-day, no lineup, no pitcher announced |

**Signature change:** `_predictionGrade` gains two new params:
```javascript
function _predictionGrade(awayPosted, homePosted, awayPitcher, homePitcher, hasWeather, awayBullpenEra, homeBullpenEra)
```

**Call site** in `runTeamScan` passes `gd.awayBullpenEra` and `gd.homeBullpenEra` — both already on the game data object.

---

## Bug 2 — Tie Prediction Auto-Graded Correct

### Problem
```javascript
const predCorrect = winner === actualWinner || winner === 'tie';
```
The `|| winner === 'tie'` clause marks any cop-out 50/50 prediction as a successful call regardless of how decisive the actual result was. Win rate is artificially inflated.

### Fix
```javascript
// Before
const predCorrect = winner === actualWinner || winner === 'tie';

// After
const predCorrect = winner !== 'tie' && winner === actualWinner;
```

When `winner === 'tie'`, show a neutral **"—"** badge instead of Correct or Missed, since the model declined to call it.

**New badge CSS class:** `.twp-result-neutral` (gray, same shape as correct/wrong badges).

---

## Bug 3 — Two Unlabeled Winner Strips on Final Games

### Problem
After a game goes final, the card shows:
1. A trophy strip for the **predicted** winner (no label)
2. A result strip for the **actual** score (no label)

If the prediction was wrong, users see a trophy for Team A directly above "Team B won — Missed" with no explanation of which is which.

### Fix
Add a dim `PREDICTION` prefix label to the winner strip:

```html
<div class="twp-winner-strip">
  <span class="twp-pred-label">Prediction</span>
  <!-- existing winner name + confidence -->
</div>
```

**New CSS class:** `.twp-pred-label` — uppercase, 9px, muted color, letter-spacing, displayed inline before the winner name. Applied unconditionally (not just on final games) since it adds useful context pre-game too.

---

## Bug 4 — Postmortem Score Drops Team Context

### Problem
The postmortem inline score recomputes without team labels and always puts the higher number first:
```javascript
actualAwayScore > actualHomeScore ? actualAwayScore + '-' + actualHomeScore : actualHomeScore + '-' + actualAwayScore
```

### Fix
Reuse the already-correct `scoreLine` variable (built earlier as `${awayAbbr} ${actualAwayScore} - ${actualHomeScore} ${homeAbbr}`):

```javascript
// Before
`...but ${actualName} took it ${actualAwayScore > actualHomeScore ? ...}.`

// After
`...but ${actualName} won (${scoreLine}).`
```

---

## Bug 5 — Latent Tie-Case Postmortem

### Problem
When `winner === 'tie'`, both `predComps` and `actualComps` resolve to `homeComponents`. All deltas become zero. Currently masked by Bug 2 (tie always = Correct so postmortem never runs), but exposed once Bug 2 is fixed.

### Fix
```javascript
const predComps  = winner === 'away' ? awayComponents : winner === 'home' ? homeComponents : null;
const actualComps = actualWinner === 'away' ? awayComponents : homeComponents;
if (!predComps) {
  // Tie prediction: no claimed driver — skip postmortem, show only result strip
  return `<div class="twp-result-strip">...</div>`;
}
```

Tie predictions show the result strip with the neutral badge but no postmortem text.

---

## Bug 6 — Hardcoded "50% confidence" for Ties

### Problem
```javascript
`<span class="twp-winner-tie">Toss-Up</span><span class="twp-winner-conf">50% confidence</span>`
```
Hardcoded string silently disagrees if `_winProbability` ever drifts from exactly 50.

### Fix
```javascript
`<span class="twp-winner-tie">Toss-Up</span><span class="twp-winner-conf">${homeWinProb}% confidence</span>`
```

---

## Bug 7 — O/U Projected Total Ignores Pitching and Park Factor

### Problem
`_projRuns(lineupComposite)` uses batting quality only. A team facing an elite ace projects the same runs as facing a 6.00 ERA opener. Park factor is also ignored.

### Fix
Extend `_projRuns` signature:

```javascript
function _projRuns(lineupComposite, oppSpBonus = 0, oppBullpenBonus = 0, pfVal = 1.0) {
  const batting     = 4.5 + ((lineupComposite - 50) / 30) * 2.0;
  const suppression = (oppSpBonus + oppBullpenBonus) / 33; // ~1 run max swing
  return Math.max(1.0, (batting - suppression) * pfVal);
}
```

**Suppression divisor rationale:** combined max SP+bullpen bonus ~35 pts / divisor 33 = ~1.0 run max swing — realistic without swamping batting signal.

**Updated call sites** — compute as local variables before `results.push`, then reference in the push:
```javascript
// Compute before results.push (can't reference sibling keys in same object literal)
const awayProjRuns = _projRuns(awayLineup, homeStarter, homeBullpen, pf?.overall ?? 1.0);
const homeProjRuns = _projRuns(homeLineup, awayStarter, awayBullpen, pf?.overall ?? 1.0);

// Inside results.push({...}):
awayProjRuns,
homeProjRuns,
predTotal: awayProjRuns + homeProjRuns,
```

**Effect on O/U range:**

| Scenario | Before | After |
|---|---|---|
| Elite SP (bonus +18) + good pen (+8) vs avg lineup | 4.5 R | ~3.7 R |
| Terrible SP (bonus -10) + bad pen (-8) vs avg lineup | 4.5 R | ~5.0 R |
| Hitter park (pf 1.12), avg matchup | 4.5 R | ~5.0 R |
| Neutral park, avg pitching, avg lineup | 4.5 R | 4.5 R |

---

## Implementation Order

Fix in this order to avoid masked bugs surfacing mid-edit:

1. **Bug 5** — fix `predComps`/`actualComps` assignment (latent, must be correct before Bug 2 fix)
2. **Bug 2** — fix `predCorrect` logic + add neutral badge CSS + neutral badge HTML
3. **Bug 6** — derive tie confidence from computed value
4. **Bug 3** — add `PREDICTION` label to winner strip + CSS
5. **Bug 4** — reuse `scoreLine` in postmortem
6. **Bug 1** — extend `_predictionGrade` signature + thresholds + update call site
7. **Bug 7** — extend `_projRuns` signature + update call sites

---

## CSS Additions

```css
.twp-pred-label {
  font-size: 9px; text-transform: uppercase; letter-spacing: .6px;
  color: var(--text-muted); font-weight: 700; margin-right: 6px;
}
.twp-result-neutral {
  background: #94a3b822; color: #94a3b8; border: 1px solid #94a3b844;
}
```

---

## Out of Scope (Tier 2 Model Rebuild)

- Pitcher double-counting (hitScore + `_starterBonus` / `_bullpenBonus`)
- Sigmoid recalibration (`_winProbability` slope 0.08)
- Savant pitch-mix data wired into team scan
- Recent form using OPS/SLG instead of AVG-only
- Starter recency weighting (last N starts ERA)
- Platoon/handedness team-level modeling
- Missing-data transparency (TBD starter flags)
