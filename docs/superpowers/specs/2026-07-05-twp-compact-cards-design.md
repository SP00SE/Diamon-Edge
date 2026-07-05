# TWP Compact Verdict Cards — Design

**Date:** 2026-07-05
**Status:** Approved by user
**Problem:** The Team Win Predictor results screen ("🏟️ Team Win Predictor · Sorted by Game Time") renders every data point for every game expanded on load — 8 edge-bar rows plus interleaved pitcher/bullpen/park/arsenal/platoon/WAR notes, record chips, trap warnings, and postmortems — times ~15 games. The user is overwhelmed. Goal: a compact "verdict card" per game with all detail behind a single inline expand.

## Decisions (confirmed with user)

1. **Verdict-only compact card** — not "verdict + edge chips", not "keep all and reorganize".
2. **Stays visible on the compact card:** lineup status badges (Confirmed/Projected), a compact risk flag chip, projected score + O/U.
3. **Moves into Details:** everything else, including the final-game result strip and postmortem.
4. **Details opens as an inline expand** — same pattern as the existing Player Breakdown toggle. No new screen, no modal, no content restructuring inside Details.

## Compact card layout (top to bottom)

| # | Element | Change from today |
|---|---------|-------------------|
| 1 | Header: game badge, date, confidence badge | Unchanged, plus a small `FINAL` tag when `isFinal` (probabilities must not read as a live pick) |
| 2 | Teams row: logo, name, win %, Confirmed/Projected badge | Record chips, streak chip, HOT/COLD badge, per-team "~x.x R proj" move into Details |
| 3 | Center: VS, projected score, O/U | Unchanged |
| 4 | 5px split bar + % labels | Unchanged |
| 5 | Winner strip: Prediction · 🏆 winner · win edge · key-factor chip · % | Unchanged, plus a `⚠ N risks` chip when `trapWarnings.length > 0` or an ERA trap applies (N = trap warnings + ERA trap if present) |
| 6 | Reasoning line (`mainReason \|\| summaryText`, with risk suffix) | Unchanged |
| 7 | Action row: `▼ Details` · `⚙ Run 100× Simulator` | `Details` button is new; Player Breakdown button moves inside Details |

## Details content (inline expand, hidden by default)

In current DOM order, markup unchanged except for being wrapped in a collapsible container:

1. Team context strip: record chips, streak chips, form badges (relocated from teams row; small flex row, away | home).
2. Edge Breakdown — all 8 rows (Offense, Starter, Bullpen, Situation, Arsenal, Platoon, SP Rest, WAR Edge) with every existing sub-label and matchup note.
3. Trap warnings + ERA trap warning (full text).
4. Final games: result strip (score + Correct/Missed/No Call), correct-note, postmortem.
5. Player Breakdown toggle + columns — existing `toggleTeamPredExpand` behavior, unchanged, nested at the bottom of Details.

## Implementation notes

- **Files:** `index.html` only. Card markup in `_teamScanCardHTML` (~lines 15699–16243); CSS in the `twp-*` block (~lines 598–717).
- New container `<div class="twp-details" id="twp_det_${gamePk}" style="display:none">` wrapping the Details content; new toggle button in the action row handled by a new sibling function `toggleTwpDetails(gamePk)` modeled on `toggleTeamPredExpand` (not reused — that function hardcodes the "Player Breakdown" button label).
- New CSS: `.twp-risk-chip`, `.twp-final-tag`, `.twp-team-ctx` (relocated chips row) — follow existing chip styles (9px, bordered, translucent background).
- `_teamScanCardHTML` is also rendered by the single-game quick view (`gap-twp-wrap`, ~line 5694). It gets the same collapsed-by-default behavior — acceptable and consistent. Element IDs are already keyed by `gamePk`; the new details ID follows the same convention.
- **Unchanged:** all scoring, `runTeamScan`, accuracy banner, timestamp bar, sort order, simulator, `toggleTeamPredExpand`, every data point (nothing deleted — only collapsed).
- **No `APP_VERSION` bump** — no localStorage schema or scoring shape change.

## Verification

- `node tests/lab-scorer.test.js` still passes (scoring untouched; guard against accidental edits).
- Visual: load the app, run Team Win Predictor, confirm (a) cards render compact, (b) Details expands/collapses with all previous content present, (c) risk chip count matches warnings inside Details, (d) final games show `FINAL` tag and their result strip inside Details, (e) single-game quick view still renders.
