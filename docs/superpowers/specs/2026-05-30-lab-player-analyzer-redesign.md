# Lab Player Analyzer — Redesign Spec

**Date:** 2026-05-30  
**Status:** Awaiting approval  
**Scope:** `index.html` only — Lab section, Player Analyzer panel  
**Out of scope:** Team Win Predictor, Hub tab, game picker, any other section

---

## Problem Statement

The current Lab Player Analyzer produces a single 0–100 "Lab Matchup Score" that conflates hit likelihood with HR likelihood and matchup quality into one number. Key issues identified in the inspection:

1. No separate Hit Score or Home Run Score — one number serves all three purposes with no clear meaning.
2. H2H penalty missing — bad career records vs. this pitcher are silently ignored.
3. Savant data absence treated as neutral rather than flagged.
4. GHP outweighs L10/L7 AVG despite being noisier.
5. Weather is displayed but not scored — visually misleading.
6. No projected vs. confirmed lineup distinction.
7. BACON and BABIP appear in both pitcher and hitter components (double-counted framing).
8. Breakdown display may go stale if async fetch fails after initial render.
9. The `rhh`/`lhh` park factors exist but are not used — only the `overall` factor is.

---

## Goals

- Separate **Hit Score** (likelihood of recording a hit) from **Home Run Score** (likelihood of hitting a home run).
- Keep a **Lab Matchup Score** as a composite of both.
- Show **data confidence** and **lineup confirmation status** clearly.
- Show **key reasons** explaining why a player ranks highly or poorly.
- Never crash on missing data.
- Keep the model understandable and fully testable.
- Use only data already available in the project where possible; identify any new fetches needed.

---

## Architecture Choice: Independent Scoring Functions with Shared Context

One `buildMatchupContext()` assembles all data once. Three pure functions each receive that context and return a `ScoreResult`. This is the recommended approach because each function is independently testable, independently evolvable, and the separation directly matches the user's requirement that hit and HR recommendations be separate.

```
buildMatchupContext() → MatchupContext
computeHitScore(ctx)  → ScoreResult   ← this IS the Lab Matchup Score
computeHRScore(ctx)   → ScoreResult   ← displayed separately, informational only
labMatchupScore       = hitScore       (no HR weighting)
```

---

## Data Structures

### MatchupContext

```js
{
  player:        PlayerData,      // season stats, splits, recent form, savant batter rows
  pitcher:       PitcherData,     // ERA, K%, BABIP, BACON, HR/9, WHIP, savant pitcher rows
  bullpen:       BullpenData,     // ERA, H/9, H/BF%, HR/9 (new fetch)
  park:          ParkData,        // overall factor, rhh factor, lhh factor, venue career stats
  weather:       WeatherData,     // tempF, windMph, windDir ('out'|'in'|'cross'|'none')
  h2h:           H2HData | null,  // ab, avg, hr, bb, k — career vs this pitcher
  savantBatter:  PitchTypeRow[],  // per-pitch-type: ba, whiff_percent — may be null
  savantPitcher: PitchTypeRow[],  // per-pitch-type: usage, whiff_percent — may be null
  lineupStatus:  'confirmed' | 'projected' | 'unknown',
  battingOrder:  number | null,   // 1–9
  dataFlags:     DataFlags,       // which components have real data vs. fallback
}
```

### ScoreResult

```js
{
  score:      number,             // 0–100 clamped final
  rawTotal:   number,             // unclamped sum before clamp
  breakdown:  ComponentBreakdown, // named component deltas; null means no data (not 0)
  confidence: number,             // 0.0–1.0
  reasons:    string[],           // top supporting factors (up to 4)
  warnings:   string[],           // top risk factors (up to 2) + data flags
  label:      string,             // 'Strong'|'Favorable'|'Neutral'|'Risky'|'Avoid'
}
```

Breakdown fields that were not computed because data was missing are stored as `null`, not `0`. This distinguishes "genuinely neutral" from "no data."

Invariant that must always hold: `sum(breakdown values where not null) + 50 === rawTotal`, and `clamp(rawTotal, 0, 100) === score`.

---

## Hit Score Model

**Formula:** `hitScore = clamp(50 + PCP + BCQ + RF + PBE + CTX_hit + BCP, 0, 100)`

**Purpose:** Likelihood this hitter records at least one hit today.

### PCP — Pitcher Contact Profile (−10 to +10)

Measures how much contact this pitcher typically allows.

| Stat | Condition | Delta |
|---|---|---|
| K% | < 18% | +4 |
| K% | 18–21% | +2 |
| K% | 22–24% | 0 |
| K% | 25–27% | −2 |
| K% | 28–31% | −4 |
| K% | ≥ 32% | −6 |
| Pitcher BABIP | ≥ 0.330 | +3 |
| Pitcher BABIP | 0.315–0.329 | +2 |
| Pitcher BABIP | 0.300–0.314 | +1 |
| Pitcher BABIP | 0.280–0.299 | 0 |
| Pitcher BABIP | 0.260–0.279 | −2 |
| Pitcher BABIP | < 0.260 | −4 |
| Pitcher WHIP | ≥ 1.45 | +3 |
| Pitcher WHIP | 1.30–1.44 | +1 |
| Pitcher WHIP | 1.10–1.29 | 0 |
| Pitcher WHIP | 0.95–1.09 | −2 |
| Pitcher WHIP | < 0.95 | −3 |

WHIP is approximated from existing H/9 + BB/9 data if not directly available. Missing fields contribute 0 to the delta and reduce the confidence completeness weight.

### BCQ — Batter Contact Quality (−12 to +12)

Measures the hitter's ability to make contact and reach base. BACON is not in this component — it moves to BPP in the HR score to eliminate double-counting.

| Stat | Condition | Delta |
|---|---|---|
| Season AVG | ≥ .310 | +4 |
| Season AVG | .290–.309 | +2 |
| Season AVG | .260–.289 | 0 |
| Season AVG | .230–.259 | −2 |
| Season AVG | < .230 | −4 |
| OBP | ≥ .380 | +3 |
| OBP | .360–.379 | +2 |
| OBP | .330–.359 | +1 |
| OBP | .300–.329 | 0 |
| OBP | < .300 | −2 |
| Batter Whiff% (weighted avg from existing Savant rows) | < 18% | +3 |
| Batter Whiff% | 18–22% | +1 |
| Batter Whiff% | 23–27% | 0 |
| Batter Whiff% | 28–33% | −2 |
| Batter Whiff% | > 33% | −4 |

Batter Whiff% is derived from existing Savant pitch-type rows: `sum(whiff_percent × usage) / sum(usage)`. No new API call needed.

### RF — Recent Form (−10 to +10)

| Stat | Condition | Delta |
|---|---|---|
| L7 AVG | ≥ .350 | +5 |
| L7 AVG | .300–.349 | +3 |
| L7 AVG | .250–.299 | +1 |
| L7 AVG | .200–.249 | −2 |
| L7 AVG | < .200 | −4 |
| GHP (hit games / last 7 appearances) | ≥ 0.72 | +3 |
| GHP | 0.60–0.71 | +2 |
| GHP | 0.50–0.59 | +1 |
| GHP | 0.40–0.49 | −2 |
| GHP | < 0.40 | −4 |
| Hit streak | ≥ 7 games | +2 |
| Hit streak | 4–6 games | +1 |
| Hit streak | 0, last 3 hitless | −1 |

GHP is capped at ±4 (reduced from the old ±10). When fewer than 7 game appearances are available, GHP is scaled by `(actualAppearances / 7)` before applying thresholds. A player with 4 recent appearances cannot be assessed at full GHP weight.

### PBE — Platoon + BvP Edge (−8 to +8)

Fixes the inspection bug where H2H below .200 produced zero penalty.

**Platoon splits (vs LHP or RHP per pitcher hand):**

| Platoon split diff vs season AVG | Min AB | Delta |
|---|---|---|
| ≥ +.075 | 40 | +6 |
| +.050–.074 | 40 | +4 |
| +.025–.049 | 40 | +2 |
| −.024 to +.024 | 40 | 0 |
| −.050 to −.025 | 40 | −3 |
| −.075 to −.051 | 40 | −5 |
| ≤ −.075 | 40 | −7 |
| ≥ +.060 | 20–39 | +3 |
| +.030–.059 | 20–39 | +1 |
| −.029 to +.029 | 20–39 | 0 |
| −.060 to −.031 | 20–39 | −2 |
| ≤ −.060 | 20–39 | −4 |
| Any | < 20 | 0 (ignored) |

**H2H career record vs this pitcher:**

| H2H career AVG | Min AB | Delta |
|---|---|---|
| ≥ .350 | 30 | +5 |
| .300–.349 | 30 | +2 |
| .200–.299 | 30 | 0 |
| .150–.199 | 30 | −3 |
| < .150 | 30 | −5 |
| ≥ .350 | 15–29 | +3 |
| .300–.349 | 15–29 | +1 |
| .200–.299 | 15–29 | 0 |
| .150–.199 | 15–29 | −2 |
| < .150 | 15–29 | −3 |
| ≥ .400 | 5–14 | +1 |
| < .150 | 5–14 | −1 |
| Any | < 5 | 0 (hard gate, ignored) |

### CTX_hit — Hit Context (−5 to +5)

| Stat | Condition | Delta |
|---|---|---|
| Park factor (overall) | ≥ 1.07 | +2 |
| Park factor | 1.03–1.06 | +1 |
| Park factor | 0.97–1.02 | 0 |
| Park factor | 0.93–0.96 | −1 |
| Park factor | ≤ 0.92 | −2 |
| Venue career AVG (≥ 10 AB) | ≥ .350 | +1 |
| Venue career AVG (≥ 10 AB) | < .180 | −1 |
| Batting order | 1–3 | +1 |
| Batting order | 4–6 | 0 |
| Batting order | 7–9 | −1 |
| Batting order | unknown | 0 |
| Wind | Out ≥ 12 mph | +1 |
| Wind | In ≥ 12 mph | −1 |
| Temperature | < 45°F | −1 |

Park factor and venue history are capped together at ±3 (park: ±2, venue: ±1). Weather is now scored — this eliminates the "displayed but not counted" misleading UX from the old model.

### BCP — Bullpen Contact Profile (−4 to +4)

| Stat | Condition | Delta |
|---|---|---|
| Bullpen H/BF% | ≥ 0.270 | +4 |
| Bullpen H/BF% | 0.250–0.269 | +2 |
| Bullpen H/BF% | 0.230–0.249 | +1 |
| Bullpen H/BF% | 0.210–0.229 | 0 |
| Bullpen H/BF% | 0.190–0.209 | −2 |
| Bullpen H/BF% | < 0.190 | −4 |
| Bullpen H/9 (fallback if H/BF% missing) | ≥ 9.5 | +2 |
| Bullpen H/9 (fallback) | < 6.5 | −2 |

Reduced from old ±5 to ±4 to prevent over-weighting.

---

## Home Run Score Model

**Formula:** `hrScore = clamp(50 + BPP + RPF + PHS + BvPH + CTX_hr + BHS, 0, 100)`

**Purpose:** Likelihood this hitter hits at least one home run today.

### BPP — Batter Power Profile (−15 to +15)

BACON moves here from the hit score model. It is not in BCQ. This eliminates the double-counting identified in the inspection.

| Stat | Condition | Delta |
|---|---|---|
| ISO (SLG − AVG) | ≥ .260 | +8 |
| ISO | .220–.259 | +5 |
| ISO | .180–.219 | +2 |
| ISO | .140–.179 | 0 |
| ISO | .100–.139 | −3 |
| ISO | < .100 | −6 |
| BACON (hard contact %) | ≥ 0.330 | +4 |
| BACON | 0.310–0.329 | +2 |
| BACON | 0.290–0.309 | 0 |
| BACON | 0.270–0.289 | −1 |
| BACON | < 0.270 | −3 |
| Barrel% (new Savant aggregate fetch) | ≥ 12% | +3 |
| Barrel% | 8–11% | +1 |
| Barrel% | 4–7% | 0 |
| Barrel% | < 4% | −2 |

Pull% is not scored independently in BPP. It feeds into CTX_hr in combination with park orientation (future enhancement, not in MVP).

### RPF — Recent Power Form (−8 to +8)

| Stat | Condition | Delta |
|---|---|---|
| HR in last 14 days (from game log) | ≥ 4 | +6 |
| HR in last 14 days | 2–3 | +3 |
| HR in last 14 days | 1 | +1 |
| HR in last 14 days (0 in ≥ 14 PA) | 0 | −2 |
| SLG over last 10 games | ≥ .600 | +2 |
| SLG over last 10 games | < .300 | −2 |

HR in last 14 days is derived from the existing game log (scan `hr` field per game entry). No new API call needed.

### PHS — Pitcher HR Susceptibility (−10 to +10)

| Stat | Condition | Delta |
|---|---|---|
| Pitcher HR/9 (new fetch) | ≥ 1.50 | +6 |
| Pitcher HR/9 | 1.20–1.49 | +3 |
| Pitcher HR/9 | 0.90–1.19 | 0 |
| Pitcher HR/9 | 0.60–0.89 | −3 |
| Pitcher HR/9 | < 0.60 | −6 |
| Pitcher K% (proxy when HR/9 missing) | < 18% | +2 |
| Pitcher K% | ≥ 28% | −2 |
| Pitcher BACON (hard contact allowed) | ≥ 0.310 | +2 |
| Pitcher BACON | < 0.270 | −2 |

If HR/9 fetch fails, PHS uses K% and BACON as proxies. Confidence weight is reduced and `dataFlags.pitcherHR9Estimated = true`.

### BvPH — BvP Power History (−5 to +5)

Hard gate: requires ≥ 15 AB. Career HR count comes from the existing H2H fetch — no new data needed.

| HR rate vs this pitcher | Min AB | Delta |
|---|---|---|
| ≥ 1 HR per 8 AB | 30 | +5 |
| 1 HR per 9–12 AB | 30 | +3 |
| 0 HR | 30 | −3 |
| ≥ 1 HR per 10 AB | 15–29 | +3 |
| 0 HR | 20–29 | −2 |
| Any | < 15 | 0 (hard gate, ignored) |

### CTX_hr — HR Context (−8 to +8)

Uses `rhh` park factor for right-handed batters, `lhh` for left-handed. The existing `pf` object already has both; the old model only used `overall`.

| Stat | Condition | Delta |
|---|---|---|
| Park HR factor (rhh or lhh) | ≥ 1.15 | +4 |
| Park HR factor | 1.07–1.14 | +2 |
| Park HR factor | 0.93–1.06 | 0 |
| Park HR factor | 0.85–0.92 | −2 |
| Park HR factor | < 0.85 | −4 |
| Temperature | ≥ 80°F | +2 |
| Temperature | 65–79°F | +1 |
| Temperature | 50–64°F | 0 |
| Temperature | 45–49°F | −1 |
| Temperature | < 45°F | −2 |
| Wind out (to CF/LF/RF) | ≥ 15 mph | +2 |
| Wind out | 8–14 mph | +1 |
| Wind in | 8–14 mph | −1 |
| Wind in | ≥ 15 mph | −2 |
| Wind cross or calm | Any | 0 |

### BHS — Bullpen HR Susceptibility (−3 to +3)

| Stat | Condition | Delta |
|---|---|---|
| Bullpen HR/9 (new optional fetch) | ≥ 1.40 | +3 |
| Bullpen HR/9 | 1.00–1.39 | +1 |
| Bullpen HR/9 | 0.70–0.99 | 0 |
| Bullpen HR/9 | < 0.70 | −2 |
| Bullpen ERA (fallback) | ≥ 5.00 | +2 |
| Bullpen ERA (fallback) | ≤ 3.00 | −1 |

---

## Lab Matchup Score (Refactored)

```
labMatchupScore = hitScore
```

The Lab is focused on hit likelihood. The Lab Matchup Score is the Hit Score — no HR weighting. The HR Score is calculated and displayed as a separate informational panel for users who also want power context, but it has zero influence on the Lab Matchup Score.

**Labels:**

| Score | Label |
|---|---|
| 75+ | Strong |
| 60–74 | Favorable |
| 45–59 | Neutral |
| 30–44 | Risky |
| < 30 | Avoid |

---

## Missing-Data Handling

### Principles

1. Missing data never crashes a section — every component is wrapped in try/catch, failure returns `{ value: 0, hasData: false }`.
2. Missing data is never silently neutral — every missing component is recorded in `dataFlags` and surfaced in the UI.
3. Missing data reduces confidence, not the raw score — the component contributes 0 (neutral) and is excluded from the confidence completeness denominator.
4. Scores with confidence < 0.40 are suppressed and replaced with "Not enough data."

### Component Fallback Behavior

| Component | If Missing | Fallback | Confidence Impact |
|---|---|---|---|
| PCP — Pitcher WHIP | Estimate from ERA tier | K% and ERA only | Medium reduction |
| PCP — Pitcher BABIP | 0 | K% and WHIP only | Small |
| BCQ — Batter Whiff% | 0 | AVG and OBP only | Small |
| RF — L7 AVG | 0 | GHP and streak only | Medium |
| RF — GHP < 7 appearances | Scale by actual/7 | Partial weight | Small |
| PBE — Platoon < 20 AB | 0 | Ignored | Medium |
| PBE — H2H < 5 AB | 0 | Hard gate, ignored | None |
| BCP — H/BF% | 0 | H/9 → ERA fallback | Small |
| BPP — Barrel% | 0 | ISO and BACON only | Small |
| PHS — Pitcher HR/9 | 0 | K% + BACON proxy | Large |
| BvPH — H2H < 15 AB | 0 | Hard gate, ignored | None |
| CTX_hr — Temperature | 0 | Park factor only | Small |
| CTX_hr — Wind | 0 | Temperature and park only | Small |
| BHS — Bullpen HR/9 | 0 | ERA fallback | Small |
| Any Savant data | 0, flagged | Pitch-mix absent | Medium |

---

## Confidence Calculation

```
confidence = (lineupWeight × 0.25) + (sampleWeight × 0.40) + (completenessWeight × 0.35)
```

### lineupWeight

| Status | Weight |
|---|---|
| Confirmed | 1.00 |
| Projected | 0.60 |
| Unknown | 0.30 |

### sampleWeight

| Conditions | Weight |
|---|---|
| Hitter ≥ 150 AB and pitcher ≥ 30 IP | 1.00 |
| Hitter 100–149 AB or pitcher 20–29 IP | 0.80 |
| Hitter 50–99 AB or pitcher 10–19 IP | 0.60 |
| Hitter < 50 AB or pitcher < 10 IP | 0.40 |

### completenessWeight

```
completenessWeight = (components with hasData=true) / (total applicable components)
```

Optionally-available components (Barrel%, Bullpen HR/9) are excluded from the denominator until the corresponding fetches are wired in.

### Confidence Labels and UI Treatment

| Confidence | Label | UI Treatment |
|---|---|---|
| ≥ 0.80 | High | Score displayed normally |
| 0.60–0.79 | Medium | Medium-confidence badge shown |
| 0.40–0.59 | Low | Warning banner |
| < 0.40 | Insufficient | Score suppressed — "Not enough data" shown |

Projected lineups do not suppress scores — they reduce confidence. The lineup banner communicates reduced reliability without hiding the score.

---

## UI Display

### Three-Card Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ⚠ PROJECTED LINEUP — scores are preliminary   |  Data: Medium           │
├──────────────────────┬──────────────────────────┬────────────────────────┤
│  LAB MATCHUP SCORE            │  HOME RUN SCORE (info only)   │
│  (= Hit Score)                │                               │
│  [ 68 ]  Favorable            │  [ 59 ]  Neutral              │
│                               │                               │
│  ✓ Low K% pitcher             │  ✓ .245 ISO                   │
│  ✓ L7 AVG .333                │  ✓ 2 HR last 14 days          │
│  ✓ .382 OBP                   │  ✓ Hitter park (lhh)          │
│  ⚠ 28% Whiff rate             │  ⚠ Wind 10 mph in             │
│                               │                               │
│  Confidence: Medium            │  Confidence: Medium           │
│  [Breakdown ▾]                 │  [Breakdown ▾]                │
└──────────────────────┴──────────────────────────┴────────────────────────┘
```

### Score Color Schemes

| Score | Hit Score | HR Score | Lab Matchup |
|---|---|---|---|
| 75+ | Strong green | Strong amber | Strong green |
| 60–74 | Moderate green | Moderate amber | Moderate green |
| 45–59 | Neutral gray | Neutral gray | Neutral gray |
| 30–44 | Soft red | Soft red | Soft red |
| < 30 | Strong red | Strong red | Strong red |

Different hue families (green for hit, amber for HR) make the two scores visually distinct at a glance.

### Lineup Status Banner

Three states, shown at the top of the analyzer panel above all cards:
- `✓ Confirmed Lineup` — green background
- `⚠ Projected Lineup — scores are preliminary` — yellow background
- `? Lineup Status Unknown — scores may be unreliable` — gray background

### Expandable Breakdown Table

Each row: `Component Name | Delta | Data Status`

- Delta rendered as `+N` (green), `−N` (red), `0` (gray), or `N/A` (italicized gray for missing data)
- `rawTotal` row shows pre-clamp sum
- `finalScore` row shows clamped result
- Invariant enforced: `rawTotal + 50 = unclamped`, `clamp(unclamped, 0, 100) = finalScore`

### Reason Bullets

- Up to 4 positive bullets (✓), up to 2 negative bullets (⚠) per score card
- Each bullet describes the specific data point: `"Pitcher allows .330+ BABIP — lots of soft contact"` not `"High PCP"`
- If Savant data is unavailable, no pitch-mix bullet appears — no filler bullets

### Data Flag Chips

Small badges displayed below each score card when applicable:
- `⚠ Savant data unavailable`
- `⚠ Projected starter`
- `⚠ Small batter sample (< 50 AB)`
- `⚠ No BvP history`
- `⚠ Pitcher HR/9 estimated`

---

## Data Availability Assessment

### Already Available — No New Fetches

- Season AVG, OBP, BABIP, BACON, K (MLB Stats API, already fetched)
- SLG already fetched; ISO = SLG − AVG (computed inline)
- Platoon splits: AVG, OBP, SLG vs LHP and RHP (already fetched)
- Last 7/10 game AVG (already fetched)
- Game log: already fetched for park-specific history and hit streak; scan `hr` field for recent HR count
- H2H career: AB, AVG, HR, BB, K (already fetched)
- Pitcher: ERA, K%, BABIP, BACON (already fetched)
- Bullpen: ERA, H/9, H/BF% (already fetched)
- Park factors: overall, rhh, lhh (already fetched; rhh/lhh now used in CTX_hr)
- Weather: tempF, windMph, windDir (already fetched, now scored)
- Batting order position (already fetched, now scored in CTX_hit/CTX_hr)
- Savant pitch-type rows: ba, whiff_percent, pitch_usage (already fetched)
- Batter Whiff%: weighted avg from existing Savant rows (computed inline, no new call)

### New Fetches Required

| Data Point | Source | Fetch Location | Risk |
|---|---|---|---|
| Pitcher HR/9 | MLB Stats API | Add `homeRunsPer9Inn` to existing pitcher stats request | Low |
| Bullpen HR/9 | MLB Stats API | Add to existing bullpen stats request | Low |

### New Fetches That Require Verification

| Data Point | Source | Notes |
|---|---|---|
| Batter Barrel% | Baseball Savant aggregate endpoint | Separate from existing pitch-type rows; may have CORS or rate-limit issues |
| Batter Hard-hit% | Same Savant aggregate | Same concerns |

If the Savant aggregate endpoint is available: Barrel% feeds into BPP. If unavailable: BPP uses ISO + BACON only and `dataFlags.barrelMissing = true`. The system is designed to function at full quality without Barrel% — it is an enhancement, not a requirement.

---

## Files Changing

All changes are in `index.html`. No new files created.

| Section | Lines (approx.) | Change |
|---|---|---|
| `computeLabMatchupScore()` | 11650–11826 | Retire — replaced with 60/40 composite formula |
| `computePitchMixMatchup()` | 11597–11646 | Keep — add `hasData` flag, ensure null-safe |
| `buildMatchupContext()` | new | Add — extracted from `fetchElitePlayerData()` |
| `computeHitScore()` | new, after line 11646 | Add |
| `computeHRScore()` | new, after `computeHitScore` | Add |
| `fetchElitePlayerData()` | 11860–11917 | Extend — pitcher HR/9, bullpen HR/9, optional Savant aggregate |
| `openPlayerAnalyzer()` | 10180–13365 | Refactor render — three-card layout, lineup banner, confidence badges |
| `generateSmartMatchupSummary()` | 9515–9622 | Update — receives separate hit/HR scores and reasons |
| CSS (Lab section) | 380–490 | Add — hit card (blue-green), HR card (amber), confidence badge, lineup banner |

---

## Implementation Phases

### Phase 0 — Foundation (no user-visible UI changes)

Safe to deploy; no regressions. All existing behavior preserved.

- Extract `buildMatchupContext()` from `fetchElitePlayerData()`
- Add `lineupStatus` field detection from MLB Stats API lineup response
- Add `dataFlags` object
- Fix H2H negative case in existing `computeLabMatchupScore()`
- Fix Savant silent-zero: `computePitchMixMatchup()` returns `{ score, hasData }`
- Fix L7/GHP denominator scaling when fewer than 7 game appearances are available

### Phase 1 — Hit Score

- Implement `computeHitScore(ctx)` — all six components (PCP, BCQ, RF, PBE, CTX_hit, BCP)
- Derive batter Whiff% from existing Savant rows
- Add OBP scoring (data already present, not previously scored)
- Implement confidence calculation
- Render Hit Score card alongside existing Lab Matchup Score
- Add lineup status banner
- Add expandable breakdown and reason bullets for Hit Score

### Phase 2 — HR Score

- Add pitcher HR/9 and bullpen HR/9 to existing stats fetches
- Derive recent HR count from game log
- Implement `computeHRScore(ctx)` — all six components (BPP, RPF, PHS, BvPH, CTX_hr, BHS)
- Wire rhh/lhh park factors into CTX_hr
- Wire temperature and wind into CTX_hr and CTX_hit
- Investigate Savant aggregate endpoint for Barrel%; wire in if available
- Render HR Score card as third card
- Add expandable breakdown and reason bullets for HR Score

### Phase 3 — Lab Matchup Score Refactor

- Replace `computeLabMatchupScore()` with `computeHitScore()` — Lab Matchup Score is now the Hit Score directly
- HR Score card is rendered as a separate, clearly labeled informational panel with no bearing on the main score
- Update `generateSmartMatchupSummary()` to receive both scores; narrative focuses on hit likelihood but may reference HR context when both scores are high

### Phase 4 — Confidence and Polish

- Full confidence system wired to all three cards
- Data flag chips rendered below each card
- Scores with confidence < 0.40 suppressed — show "Not enough data"
- Breakdown tables show `N/A` for missing components (not `0`)
- Development assertion: `sum(breakdown) + 50 === rawTotal` (active during development, stripped for production)

---

## Test Plan

### Pre-Implementation Snapshot Tests

Five real player/pitcher combos. Call existing `computeLabMatchupScore()`, record outputs as regression anchors. These must not change until Phase 3 explicitly retires the function.

### Unit Tests: `computeHitScore()`

| Test | Expected |
|---|---|
| Neutral hitter, neutral pitcher, avg park (all inputs at median) | Score 48–52 |
| Hot hitter (.360 L7, 0.72 GHP) vs weak pitcher (18% K%, .335 BABIP) | Score > 65 |
| Cold hitter (.160 L7) vs elite pitcher (32% K%, .255 BABIP) | Score < 35 |
| Savant data null | No crash; `dataFlags.savantMissing=true`; pitch-mix bullet absent |
| H2H .150 AVG in 80 AB | PBE delta ≤ −3 |
| H2H 1 hit in 4 AB (below gate) | PBE H2H delta = 0 |
| Confirmed lineup, batting 2 | CTX_hit order delta = +1; confidence ≥ 0.80 |
| Projected lineup | Same score; confidence reduced |
| Bullpen data null | BCP = 0; no crash |
| Only 4 recent game appearances | GHP scaled by 4/7 |

### Unit Tests: `computeHRScore()`

| Test | Expected |
|---|---|
| ISO .280, barrel 14%, HR/9 1.6, wind out 18 mph, 82°F | Score > 75 |
| ISO .080, barrel 3%, HR/9 0.55, wind in 15 mph, 42°F | Score < 25 |
| H2H 4 HR in 30 AB | BvPH = +5 |
| H2H 0 HR in 32 AB | BvPH = −3 |
| H2H 2 HR in 12 AB (below gate) | BvPH = 0 |
| Pitcher HR/9 fetch fails | PHS uses proxy; no crash; flag set |
| Temperature null | CTX_hr temp delta = 0; no crash |
| Wind direction 'cross' | CTX_hr wind delta = 0 |
| LHH batter, pf.lhh = 1.18 | CTX_hr uses lhh, not overall |

### Unit Tests: Lab Matchup Score Identity

| Test | Expected |
|---|---|
| hitScore=70 | labMatchupScore = 70 (not influenced by hrScore) |
| hitScore=98, hrScore=10 | labMatchupScore = 98 (hrScore has zero effect) |
| hitScore=8, hrScore=95 | labMatchupScore = 8 (hrScore has zero effect) |
| Same inputs called twice | Same output (deterministic) |

### Unit Tests: Confidence

| Test | Expected |
|---|---|
| All data present, confirmed lineup, 200+ AB, 60+ IP | Confidence ≥ 0.80 |
| Savant null, projected lineup, 45 AB, 12 IP | Confidence ≤ 0.50 |
| Unknown lineup, any data | Confidence ≤ 0.45 |
| Pitcher IP = 4 (opener/bullpen game) | sampleWeight = 0.40; confidence reduced |

### Breakdown Reconciliation (Applied to Every Test)

```
assert: sum(breakdown component deltas where not null) + 50 === rawTotal
assert: clamp(rawTotal, 0, 100) === score
```

### Integration Test: Full Panel Render

- Real player + real game date
- Three cards render without errors
- Lineup banner reflects actual status from MLB API response
- Expected data flags appear when data is missing
- Confidence < 0.40 shows "Not enough data" instead of score
- Breakdown row sums reconcile for all three scores
