---
name: verify
description: Build/launch/drive recipe for verifying Diamond Edge (index.html SPA) changes end-to-end in a real browser
---

# Verifying Diamond Edge

## Serve
No build step. From the repo root: `python -m http.server 8123` (background), then browse `http://localhost:8123`.

## Drive (Playwright)
`playwright-core` + Chromium live in the npx cache — no install needed:

```js
const pw = require('C:/Users/Arish/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const browser = await pw.chromium.launch({ headless: false }); // headed REQUIRED, see gotchas
```

Startup: the tab bar `#mainTabs` is `display:none` until the initial schedule/lineup fetch finishes (1–3 min). Wait for
`page.waitForSelector('.main-tab[data-tab="lab"]', { state: 'visible', timeout: 300000 })`.

Team Win Predictor flow: click `.main-tab[data-tab="lab"]` → `#labTeamScanBtn` → wait `#labTeamScanCards .twp-card` (scan takes 1–3 min). Per-card: `▼ Details` button id `twp_detbtn_<gamePk>`, container `twp_det_<gamePk>`, simulator panel `twp-sim-panel-<gamePk>`.

## Gotchas
- **FanGraphs (WAR data) hard-blocks headless Chromium** — `net::ERR_FAILED`, no response, UA override does not help. Headless runs show "⚠ WAR data still loading" on every card even when the code is correct. Always verify WAR-dependent features with `headless: false`.
- `state` is a top-level `let`, not a window property: probe with `typeof state !== 'undefined'`, never `window.state`.
- A "Cache Data Locally?" consent dialog overlays the lower viewport on fresh profiles; dismiss or ignore it in screenshots.
- Pre-existing console noise: `TypeError: _requestQueue.shift(...) is not a function` from `lib/data/cache.js` (throttle race) fires during fetch bursts — not caused by UI changes.

## Static checks (pre-commit guards, not verification)
- `node tests/lab-scorer.test.js` → must end `0 failed`.
- Inline-script syntax: extract `<script>` bodies from `index.html` and `new Function(src)` each (catches template-literal typos in the 16k-line file).
