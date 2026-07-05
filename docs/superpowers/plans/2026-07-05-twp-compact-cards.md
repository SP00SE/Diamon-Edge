# TWP Compact Verdict Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse each Team Win Predictor game card to a compact "verdict card" (teams, win %, prediction, one-line reason) with all detail behind a single inline `Details` expand.

**Architecture:** UI-only restructuring of `_teamScanCardHTML` in `index.html` — no scoring changes. The heavy sections (edge breakdown, records, warnings, postmortem, player breakdown) are wrapped in a hidden `.twp-details` container toggled by a new `toggleTwpDetails(gamePk)` function, following the existing `toggleTeamPredExpand` pattern. Spec: `docs/superpowers/specs/2026-07-05-twp-compact-cards-design.md`.

**Tech Stack:** Vanilla JS single-file SPA (`index.html`), no build step, no dependencies. Tests: `node tests/lab-scorer.test.js` (Node built-in `node:test`).

## Global Constraints

- Single-file SPA: all changes in `index.html`. Do not add dependencies, files, or a build step.
- Scoring is untouchable: no edits to `lib/lab-scorer.js`, `runTeamScan`, or any `*Components` math. Nothing is deleted from the card — only relocated/collapsed.
- Do not rename/remove `toggleTeamPredExpand`, `runGameSimulator`, `openLabFor`, `openPlayerModal`, `labSelectPlayer`, `toggleStreakGameLog`. Preserve `onclick` attributes of the 🔬 Lab button exactly.
- No `APP_VERSION` bump (no localStorage schema or scoring-shape change).
- Before every commit: `node tests/lab-scorer.test.js` must print `0 failed`, and the inline-script syntax check (Task 1, Step 2) must print OK.
- Commit format `type(scope): description` with trailer `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`. Push immediately after each commit (GitHub Pages is live).
- Line numbers below are as of commit `c847df8`; treat them as hints, anchor edits on the exact code shown.

---

### Task 1: CSS + `toggleTwpDetails` scaffolding

**Files:**
- Modify: `index.html` (CSS block ~line 658; JS after `toggleTeamPredExpand` ~line 16252)

**Interfaces:**
- Produces: CSS classes `.twp-final-tag`, `.twp-risk-chip`, `.twp-team-ctx`, `.twp-team-ctx-col`; global function `toggleTwpDetails(gamePk)` that toggles `#twp_det_<gamePk>` visibility and flips the arrow on `#twp_detbtn_<gamePk>`. Task 2 emits markup using exactly these ids/classes.

- [ ] **Step 1: Create the inline-script syntax checker** (used before every commit in this plan)

Write to `<scratchpad>/twp_syntax_check.js` (scratchpad dir from your session; any temp dir works — do not commit this file):

```js
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
let i = 0, fail = false;
for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (m[1] && /src\s*=/.test(m[1])) continue;
  i++;
  try { new Function(m[2]); } catch (e) { fail = true; console.error(`script block ${i}: ${e.message}`); }
}
console.log(fail ? 'SYNTAX FAIL' : `OK — ${i} inline script block(s) parse`);
process.exitCode = fail ? 1 : 0;
```

- [ ] **Step 2: Baseline the checker before any edit**

Run from the project root: `node <scratchpad>/twp_syntax_check.js`
Expected: `OK — N inline script block(s) parse` (N ≥ 1). If it fails on the untouched file, the checker regex needs adjusting — fix the checker, not `index.html`.

- [ ] **Step 3: Add the four CSS rules**

In `index.html`, find the line:

```css
.twp-expand-btn { flex:1; width:100%; background:none; border:none; padding:8px; color:#a78bfa; font-size:11px; cursor:pointer; font-weight:600; text-align:center; }
```

Insert immediately after it:

```css
.twp-final-tag { font-size:9px; font-weight:800; padding:2px 6px; border-radius:3px; background:#94a3b81a; color:#94a3b8; border:1px solid #94a3b844; letter-spacing:.5px; text-transform:uppercase; }
.twp-risk-chip { font-size:9px; font-weight:700; padding:2px 6px; border-radius:3px; background:#f59e0b18; color:#f59e0b; border:1px solid #f59e0b44; white-space:nowrap; }
.twp-team-ctx { display:flex; gap:12px; padding:10px 14px 4px; border-top:1px solid var(--border); }
.twp-team-ctx-col { flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:2px; }
```

(`.twp-details` needs no CSS rule — it is a structural container toggled via inline `display`; its children carry their own `border-top`, which is why `.twp-team-ctx` gets one.)

- [ ] **Step 4: Add `toggleTwpDetails`**

Find the existing function:

```js
function toggleTeamPredExpand(bkId, btnId) {
  const bk  = document.getElementById(bkId);
  const btn = document.getElementById(btnId);
  if (!bk || !btn) return;
  const open = bk.style.display !== 'none';
  bk.style.display  = open ? 'none' : 'flex';
  btn.innerHTML     = open ? '&#9660; Player Breakdown' : '&#9650; Player Breakdown';
}
```

Insert immediately after it:

```js
function toggleTwpDetails(gamePk) {
  const det = document.getElementById(`twp_det_${gamePk}`);
  const btn = document.getElementById(`twp_detbtn_${gamePk}`);
  if (!det || !btn) return;
  const open = det.style.display !== 'none';
  det.style.display = open ? 'none' : 'block';
  btn.innerHTML     = open ? '&#9660; Details' : '&#9650; Hide Details';
}
```

- [ ] **Step 5: Verify**

Run: `node <scratchpad>/twp_syntax_check.js` → expected `OK`.
Run: `node tests/lab-scorer.test.js` → expected `0 failed`.

- [ ] **Step 6: Commit and push**

```bash
git add index.html
git commit -m "feat(twp): add compact-card styles and details toggle scaffolding

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push
```

---

### Task 2: Restructure `_teamScanCardHTML` into compact card + Details container

**Files:**
- Modify: `index.html` — `_teamScanCardHTML` (~lines 15699–16243)

**Interfaces:**
- Consumes: `toggleTwpDetails(gamePk)` and CSS classes from Task 1; existing helpers already in scope inside `_teamScanCardHTML`: `_recPct`, `escHtml`, `awayFormBadge`/`homeFormBadge`, `awayBadge`/`homeBadge`, `_keyEdge`, `bkId`, `btnId`.
- Produces: per-card DOM ids `twp_det_${gamePk}` (details container) and `twp_detbtn_${gamePk}` (details button). All previously rendered content still present in the DOM.

- [ ] **Step 1: Hoist new consts**

Find (near the end of the helper definitions, before `return`):

```js
  const bkId  = `tp_bk_${gamePk}`;
  const btnId = `tp_btn_${gamePk}`;
```

Insert immediately after:

```js
  const detId    = `twp_det_${gamePk}`;
  const detBtnId = `twp_detbtn_${gamePk}`;

  // Risk chip — trap warnings (+ ERA trap when it applies to the predicted side)
  const _eraTrapName = winner === 'away' ? (awayEraTrap && awayPitcherName) : (homeEraTrap && homePitcherName);
  const _riskCount   = (trapWarnings || []).slice(0, 3).length + (_eraTrapName ? 1 : 0);
  const riskChip     = _riskCount > 0 ? `<span class="twp-risk-chip">&#9888; ${_riskCount} risk${_riskCount > 1 ? 's' : ''}</span>` : '';

  // Team context (records / streak / form / proj runs) — shown inside Details
  const _teamCtxCol = (abbr, standings, isAwaySide, projRuns, formBadge) => {
    const rec = standings ? `<div class="twp-team-record">${isAwaySide
      ? `<span class="twp-rec-chip twp-rec-road-chip">Road ${standings.awayWins}-${standings.awayLosses}${_recPct(standings.awayWins, standings.awayLosses)}</span>`
      : `<span class="twp-rec-chip twp-rec-home-chip">Home ${standings.homeWins}-${standings.homeLosses}${_recPct(standings.homeWins, standings.homeLosses)}</span>`
    }<span class="twp-rec-chip twp-rec-ovr-chip">${standings.wins}-${standings.losses}</span>${standings.streak ? `<span class="twp-streak-chip ${standings.streak.startsWith('W') ? 'twp-streak-w' : 'twp-streak-l'}">${escHtml(standings.streak)}</span>` : ''}</div>` : '';
    const pr = projRuns != null ? `<div class="twp-proj-runs">~${projRuns.toFixed(1)} R proj</div>` : '';
    return `<div class="twp-team-ctx-col"><div class="twp-breakdown-col-hdr">${escHtml(abbr||'')}</div>${rec}${formBadge}${pr}</div>`;
  };
  const teamCtxHtml = (awayStandings || homeStandings || awayFormBadge || homeFormBadge || awayProjRuns != null || homeProjRuns != null)
    ? `<div class="twp-team-ctx">${_teamCtxCol(awayAbbr, awayStandings, true, awayProjRuns, awayFormBadge)}${_teamCtxCol(homeAbbr, homeStandings, false, homeProjRuns, homeFormBadge)}</div>`
    : '';
```

- [ ] **Step 2: FINAL tag in header**

Find:

```js
        ${dateLbl ? `<span class="twp-game-date">${escHtml(dateLbl)}</span>` : ''}
```

Replace with:

```js
        ${dateLbl ? `<span class="twp-game-date">${escHtml(dateLbl)}</span>` : ''}
        ${isFinal ? `<span class="twp-final-tag">Final</span>` : ''}
```

- [ ] **Step 3: Slim the away team column**

In the away `twp-team` div, delete the proj-runs, record, and form-badge lines so:

```js
        ${awayBadge}
        ${awayProjRuns != null ? `<div class="twp-proj-runs">~${awayProjRuns.toFixed(1)} R proj</div>` : ''}
        ${awayStandings ? `<div class="twp-team-record"><span class="twp-rec-chip twp-rec-road-chip">Road ${awayStandings.awayWins}-${awayStandings.awayLosses}${_recPct(awayStandings.awayWins, awayStandings.awayLosses)}</span><span class="twp-rec-chip twp-rec-ovr-chip">${awayStandings.wins}-${awayStandings.losses}</span>${awayStandings.streak ? `<span class="twp-streak-chip ${awayStandings.streak.startsWith('W') ? 'twp-streak-w' : 'twp-streak-l'}">${escHtml(awayStandings.streak)}</span>` : ''}</div>` : ''}
        ${awayFormBadge}
```

becomes:

```js
        ${awayBadge}
```

- [ ] **Step 4: Slim the home team column**

Same deletion on the home side:

```js
        ${homeBadge}
        ${homeProjRuns != null ? `<div class="twp-proj-runs">~${homeProjRuns.toFixed(1)} R proj</div>` : ''}
        ${homeStandings ? `<div class="twp-team-record"><span class="twp-rec-chip twp-rec-home-chip">Home ${homeStandings.homeWins}-${homeStandings.homeLosses}${_recPct(homeStandings.homeWins, homeStandings.homeLosses)}</span><span class="twp-rec-chip twp-rec-ovr-chip">${homeStandings.wins}-${homeStandings.losses}</span>${homeStandings.streak ? `<span class="twp-streak-chip ${homeStandings.streak.startsWith('W') ? 'twp-streak-w' : 'twp-streak-l'}">${escHtml(homeStandings.streak)}</span>` : ''}</div>` : ''}
        ${homeFormBadge}
```

becomes:

```js
        ${homeBadge}
```

- [ ] **Step 5: Risk chip in winner strip**

Find:

```js
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        ${_keyEdge ? `<span class="twp-key-factor">${escHtml(_keyEdge.label)}</span>` : ''}
```

Replace with:

```js
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        ${riskChip}
        ${_keyEdge ? `<span class="twp-key-factor">${escHtml(_keyEdge.label)}</span>` : ''}
```

- [ ] **Step 6: Simplify the ERA-trap IIFE to use the hoisted const**

Find:

```js
    ${(() => {
      const eraTrapName = winner === 'away' ? (awayEraTrap && awayPitcherName) : (homeEraTrap && homePitcherName);
      const eraTrapEra  = winner === 'away' ? awayPitcherEra : homePitcherEra;
      if (!eraTrapName) return '';
```

Replace those inner lines with:

```js
    ${(() => {
      if (!_eraTrapName) return '';
      const eraTrapEra = winner === 'away' ? awayPitcherEra : homePitcherEra;
```

…and in the same IIFE change `${escHtml(eraTrapName)}` to `${escHtml(_eraTrapName)}`.

- [ ] **Step 7: Reorder the template — move detail blocks into the Details container**

This is a pure move of three existing blocks; do not retype their contents. The three blocks, with exact boundaries (all inside the `return` template):

- **Block A (edge breakdown):** from the line `    <div class="twp-edges">` down to its closing `    </div>` — the one immediately before the line starting `    <div class="twp-winner-strip"`.
- **Block B (warnings):** the two consecutive template chunks starting `    ${(trapWarnings || []).slice(0, 3).map(` and the ERA-trap IIFE ending `    })()}`.
- **Block C (final result):** the chunk starting `    ${isFinal && actualWinner ? (() => {` and ending `    })() : ''}`.

The template's tail — currently:

```js
    <div class="twp-action-row">
      <div class="twp-sim-wrap" id="twp-sim-wrap-${gamePk}">
        <button class="twp-sim-btn" onclick="runGameSimulator(${gamePk})">&#9881; Run 100&times; Simulator</button>
      </div>
      <button class="twp-expand-btn" id="${btnId}" onclick="toggleTeamPredExpand('${bkId}','${btnId}')">&#9660; Player Breakdown</button>
    </div>
    <div id="twp-sim-panel-${gamePk}" style="display:none"></div>
    <div class="twp-breakdown" id="${bkId}" style="display:none">
      <div class="twp-breakdown-col">
        <div class="twp-breakdown-col-hdr">${escHtml(awayAbbr||'Away')}</div>
        ${_rows(awayPlayers)}
      </div>
      <div class="twp-breakdown-col">
        <div class="twp-breakdown-col-hdr">${escHtml(homeAbbr||'Home')}</div>
        ${_rows(homePlayers)}
      </div>
    </div>

  </div>`;
```

becomes (Blocks A/B/C pasted unmodified where marked):

```js
    <div class="twp-action-row">
      <div class="twp-sim-wrap" id="twp-sim-wrap-${gamePk}">
        <button class="twp-sim-btn" onclick="runGameSimulator(${gamePk})">&#9881; Run 100&times; Simulator</button>
      </div>
      <button class="twp-expand-btn" id="${detBtnId}" onclick="toggleTwpDetails(${gamePk})">&#9660; Details</button>
    </div>
    <div id="twp-sim-panel-${gamePk}" style="display:none"></div>

    <div class="twp-details" id="${detId}" style="display:none">
      ${teamCtxHtml}
      ⟨Block A — the twp-edges div, exactly as cut⟩
      ⟨Block B — trap warnings + ERA-trap IIFE, exactly as cut⟩
      ⟨Block C — the isFinal result/postmortem chunk, exactly as cut⟩
      <button class="twp-expand-btn" id="${btnId}" onclick="toggleTeamPredExpand('${bkId}','${btnId}')">&#9660; Player Breakdown</button>
      <div class="twp-breakdown" id="${bkId}" style="display:none">
        <div class="twp-breakdown-col">
          <div class="twp-breakdown-col-hdr">${escHtml(awayAbbr||'Away')}</div>
          ${_rows(awayPlayers)}
        </div>
        <div class="twp-breakdown-col">
          <div class="twp-breakdown-col-hdr">${escHtml(homeAbbr||'Home')}</div>
          ${_rows(homePlayers)}
        </div>
      </div>
    </div>

  </div>`;
```

Resulting visible-card order (verify by reading the template top-to-bottom): header → body (teams/center) → split bar + labels → winner strip → reasoning banner → action row → sim panel → details container. Winner strip and reasoning banner do NOT move — only Blocks A/B/C, which previously sat between the split labels and the action row.

- [ ] **Step 8: Verify syntax + tests**

Run: `node <scratchpad>/twp_syntax_check.js` → expected `OK`.
Run: `node tests/lab-scorer.test.js` → expected `0 failed`.
Grep guard — each must return exactly the expected count in `index.html`:
- `twp_det_` → exactly 2 matches (the toggle function and the `detId` const; the template emits the id via `${detId}`, which does not literal-match)
- `toggleTwpDetails` → 2 matches (definition + onclick)
- `toggleTeamPredExpand` → 2 matches (definition + onclick, unchanged)

- [ ] **Step 9: Commit and push**

```bash
git add index.html
git commit -m "feat(twp): compact verdict cards — collapse detail behind Details expand

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push
```

---

### Task 3: End-to-end visual verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: the deployed/local app with Tasks 1–2 applied.

- [ ] **Step 1: Serve locally**

Run from project root: `python -m http.server 8000` (the app fetches MLB/FanGraphs APIs directly; both are CORS-open, so localhost works).

- [ ] **Step 2: Manual checklist** (browser → `http://localhost:8000` → Lab → 🏟️ Team Win Predictor)

1. Cards render compact: header (+ `Final` tag only on finished games), teams with win % + Confirmed/Projected badge only, projected score + O/U in center, split bar, winner strip, one reasoning line, `▼ Details` / `⚙ Run 100× Simulator` row.
2. `▼ Details` expands in place showing, in order: team records/streak/form/proj-runs strip → full Edge Breakdown with all notes → trap warnings (full text) → for final games the score strip + Correct/Missed + postmortem → `▼ Player Breakdown` which still toggles the two player columns. Collapse works and flips the arrow.
3. `⚠ N risks` chip appears on the winner strip only for games that show N warning lines inside Details (count trap warnings + ERA trap line).
4. `⚙ Run 100× Simulator` still renders its panel on the compact card (details collapsed).
5. Single-game quick view (Prediction panel from the main schedule) renders the same compact card without console errors.
6. No horizontal scrolling at 375px width (DevTools mobile viewport).

- [ ] **Step 3: Report**

If any check fails, stop and fix before claiming completion (superpowers:verification-before-completion). Nothing further to commit if all pass — Task 2's push already deployed.
