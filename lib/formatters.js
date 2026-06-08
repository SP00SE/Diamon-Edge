// lib/formatters.js
// Pure display/formatting helpers shared across the dashboard's render functions.
// Loaded as a plain <script> after lib/mlb/constants.js (getParkFactor needs
// PARK_FACTORS) and before the main inline script — declares the same globals
// (escHtml, headshotUrl, fmtAvg, teamLogo, getParkFactor, getTodayStr, fmtDate,
// safe, clamp, ordinal) the inline script already calls by name.

const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const headshotUrl = id => `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`;

const fmtAvg = (v, empty='—') => v > 0 ? '.' + Math.round(v * 1000).toString().padStart(3,'0') : empty;

function teamLogo(espnSlug, abbr) {
  return `<img class="chip-logo" src="https://a.espncdn.com/i/teamlogos/mlb/500/${espnSlug}.png"
    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
    alt="${abbr}"><div class="chip-logo-fallback" style="display:none">${abbr.slice(0,3)}</div>`;
}

function getParkFactor(venueName) {
  if (!venueName) return { overall:1.00, hrL:1.00, hrR:1.00, isHitter:false, isHR:false };
  // exact match
  if (PARK_FACTORS[venueName]) return PARK_FACTORS[venueName];
  // partial match
  for (const [k,v] of Object.entries(PARK_FACTORS)) {
    if (venueName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(venueName.toLowerCase())) return v;
  }
  return { overall:1.00, hrL:1.00, hrR:1.00, isHitter:false, isHR:false };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDate(d) {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
}
function safe(v, decimals=3) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toFixed(decimals);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function ordinal(n) {
  if (!n) return '';
  const s = ['th','st','nd','rd'];
  const v = n%100;
  return s[(v-20)%10]||s[v]||s[0];
}

// ─── ACHIEVEMENT BADGES ──────────────────────────────────────────────────
// Shared "live game" achievement badge builders used by the prediction-card,
// streak, and lab render paths to show whether a player has gotten a hit/HR
// in their game today.
function buildLivePip(isLive) {
  return isLive
    ? `<span class="bb-live-pip">● LIVE</span>`
    : `<span class="bb-live-pip bb-pip-final">● FINAL</span>`;
}
function buildHitBadge(hits, atBats) {
  return hits > 0
    ? `<span class="bb-achieve-badge bb-achieve-yes">✅ Hit (${hits}/${atBats})</span>`
    : atBats > 0 ? `<span class="bb-achieve-badge bb-achieve-no">❌ No Hit (0/${atBats})</span>` : '';
}
function buildHRBadge(homeRuns, atBats) {
  return homeRuns > 0
    ? `<span class="bb-achieve-badge bb-achieve-yes">✅ HR</span>`
    : atBats > 0 ? `<span class="bb-achieve-badge bb-achieve-no">❌ No HR</span>` : '';
}
