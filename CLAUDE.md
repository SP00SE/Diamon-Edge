# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## 5. Baseball Project — Specific Rules

### Architecture
- **Single-file SPA.** All logic lives in `index.html`. There is no bundler, no build step, no npm. Do not add dependencies.
- **Scoring library.** `lib/lab-scorer.js` is a CommonJS module (also browser-compatible). `tests/lab-scorer.test.js` uses Node's built-in `node:test`. Run tests with `node tests/lab-scorer.test.js`.
- **Data source.** Real data comes from `statsapi.mlb.com` (MLB Stats API — no auth, CORS-enabled) and `baseballsavant.mlb.com` (pitch arsenal CSVs). Never introduce mock data without being asked.

### Before every edit to `index.html`
Present four facts:
1. The file(s) and exact lines affected.
2. Why no existing utility covers this (avoid reinventing `clamp`, `escHtml`, `fetchSchedule`, etc.).
3. What data fields are read/written.
4. The user's instruction verbatim.

### Scoring rules
- `computeHitScore` and `computeHRScore` live in `lib/lab-scorer.js`. Do not duplicate their logic in `index.html`.
- `computeLabMatchupScore` was deleted — do not recreate it. All scoring flows through `LabScorer.computeHitScore(ctx)`.
- Component clamp ranges: PCP ±10, BCQ ±12, RF ±10, PBE ±8, CTXHit ±5, BCP ±4. Verify before expanding.
- `APP_VERSION` (near top of `index.html`) must be bumped on every deploy that changes `localStorage` schema or scoring shape, so GitHub Pages users get a clean slate.

### Testing
- All scoring logic must be exercised by `tests/lab-scorer.test.js` before committing.
- Never commit with failing tests. Run `node tests/lab-scorer.test.js` and verify `0 failed`.
- Integration tests must use raw MLB API field names (`inningsPitched`, `strikeOuts`, `homeRuns`) — not pre-computed `kpct`/`hr9` — because that is what `mapPitcherStats` produces.

### What not to break
- Beat the Streak, Daily Dominator, Player Analyzer, Share Results, Overall Top Picks — treat as untouchable unless the user explicitly targets them.
- `openPlayerAnalyzer`, `openPlayerModal`, `labSelectPlayer`, `toggleStreakGameLog` — critical user-facing entry points; never rename or remove.
- Lab shortcut buttons and Analyze buttons — preserve `onclick` attributes exactly.

### Commit hygiene
- One logical change per commit.
- Commit message: `type(scope): description` (e.g. `fix(lab): ...`, `feat(twp): ...`, `chore: ...`).
- Always add `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` trailer.
- Push immediately after each commit — GitHub Pages is the live site.
