// lib/data/cache.js
// IndexedDB-backed API cache + global request throttle for the MLB Stats API.
// Loaded as a plain <script> before the main inline script — declares the same
// globals (cache, db, initDB, getCachedData, setCachedData, clearIndexedDB,
// clearAllCaches, forceRefreshData, showCachePrompt, _throttledFetch,
// cachedFetch, ...) the inline script already calls by name. Functions here
// reference `state`, `gameLogCache`, `hfCache`, `startFetch` etc. only inside
// their bodies — those globals exist by the time these functions are invoked.

// ─── CACHE ────────────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DB_NAME = 'BaseballDashboard';
const DB_STORE = 'apiCache';
const DB_TTL = 3 * 60 * 60 * 1000; // 3 hours (stats change throughout the day)
let db = null;

// Initialize IndexedDB with fallback for private mode / old browsers
async function initDB() {
  if (!window.indexedDB) {
    return null;
  }
  try {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = e => {
        const store = e.target.result.createObjectStore(DB_STORE);
        store.createIndex('expiry', 'expiry', { unique: false });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
  } catch (e) {
    return null;
  }
}

// Retrieve cached data from IndexedDB
async function getCachedData(url) {
  if (!db) return null;
  try {
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(url);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

// Store cached data in IndexedDB
async function setCachedData(url, data) {
  if (!db) return;
  try {
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put({
        url,
        data,
        ts: Date.now(),
        expiry: Date.now() + DB_TTL,
      });
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch (e) {
    // Silently fail—app still works with RAM cache
  }
}

// Wipe all IndexedDB entries (used on date change or manual refresh)
async function clearIndexedDB() {
  if (!db) return;
  try {
    await new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {}
}

// Clear every cache layer — RAM, IndexedDB, hfCache, gameLogCache, localStorage snapshot
async function clearAllCaches() {
  cache.clear();
  if (typeof gameLogCache !== 'undefined') gameLogCache.clear();
  if (typeof hfCache !== 'undefined') hfCache.clear();
  await clearIndexedDB();
  // Remove today's snapshot so next load fetches fresh
  try { localStorage.removeItem(`btsSnapshot_${state.date}`); } catch {}
}

// Force-refresh button handler — wipes all caches then re-runs full fetch
async function forceRefreshData() {
  const btn      = document.getElementById('refreshDataBtn');
  const clearBtn = document.getElementById('clearCacheBtn');
  if (btn)      { btn.disabled = true;      btn.textContent = '⟳ Loading…'; }
  if (clearBtn) { clearBtn.disabled = true; clearBtn.textContent = '⟳ Clearing…'; }
  await clearAllCaches();
  state.predictions     = {};
  state.playerMap       = {};
  state.savantPitcher    = null;
  state.savantBatter     = null;
  state.savantPitchRanks = null;
  state.savantYear       = null;
  state.savantFailed     = false;
  state.twpCachedHtml    = null;
  state.twpScanTime      = null;
  state.twpResultsByPk   = null;
  state.warMap           = new Map();
  state.warDataLoaded    = false;
  if (typeof leaderboardLoaded !== 'undefined') leaderboardLoaded = false;
  startFetch();
  if (btn) {
    btn.textContent = '✓ Refreshed';
    setTimeout(() => { btn.disabled = false; btn.textContent = '↺ Refresh'; }, 2500);
  }
  if (clearBtn) {
    clearBtn.textContent = '✓ Cleared';
    setTimeout(() => { clearBtn.disabled = false; clearBtn.textContent = '⊘ Clear Cache'; }, 2500);
  }
}

// Show cache consent prompt
function showCachePrompt() {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 10000;
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 8px; padding: 16px; max-width: 320px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 13px; color: var(--text-primary);
  `;
  dialog.id = 'cacheConsentDialog';
  dialog.innerHTML = `
    <div style="margin-bottom: 12px; font-weight: 600;">💾 Cache Data Locally?</div>
    <div style="margin-bottom: 12px; color: var(--text-muted); line-height: 1.5;">
      Save game data & stats on your device for faster future loads (~50 MB).
    </div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button onclick="document.getElementById('cacheConsentDialog').remove(); localStorage.setItem('cacheConsent', 'no')"
        style="padding: 6px 12px; background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 12px;">
        No
      </button>
      <button onclick="document.getElementById('cacheConsentDialog').remove(); localStorage.setItem('cacheConsent', 'yes')"
        style="padding: 6px 12px; background: var(--accent-blue); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">
        Enable
      </button>
    </div>
  `;
  document.body.appendChild(dialog);
}

// ─── GLOBAL REQUEST THROTTLE ─────────────────────────────────────────────
// 2 concurrent MLB API requests with 100ms inter-request gap.
// Gives ~2× throughput vs fully serial while staying within MLB API limits.
const MAX_CONCURRENT_REQUESTS = 2;
let _activeRequests = 0;
const _requestQueue = [];
let _lastRequestEnd = 0;
function _throttledFetch(url, opts) {
  return new Promise((resolve, reject) => {
    const execute = () => {
      _activeRequests++;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000); // 20s timeout
      fetch(url, { ...opts, signal: ctrl.signal })
        .then(resolve, reject)
        .finally(() => {
          clearTimeout(timer);
          _activeRequests--;
          _lastRequestEnd = Date.now();
          if (_requestQueue.length) {
            // Guard at execution time: two same-tick completions can both see
            // one queued item and both schedule a drain — the loser must no-op.
            setTimeout(() => { const next = _requestQueue.shift(); if (next) next(); }, 100);
          }
        });
    };
    if (_activeRequests < MAX_CONCURRENT_REQUESTS) {
      const gap = 100 - (Date.now() - _lastRequestEnd);
      if (gap > 0) setTimeout(execute, gap);
      else execute();
    } else {
      _requestQueue.push(execute);
    }
  });
}

async function cachedFetch(url, opts={}) {
  const now = Date.now();
  // Check RAM cache first (5 min TTL)
  if (cache.has(url)) {
    const { ts, data } = cache.get(url);
    if (now - ts < CACHE_TTL) return data;
  }
  // Check IndexedDB (24 hour TTL)
  try {
    const cached = await getCachedData(url);
    if (cached && now < cached.expiry) {
      cache.set(url, { ts: now, data: cached.data }); // refresh RAM
      return cached.data;
    }
  } catch (e) {
    // IndexedDB lookup failed, continue to fetch
  }
  // Fetch fresh from API
  const MAX_RETRIES = 4;
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // First retry fast (600ms) for transient ECONNRESET; then exponential: 2s → 4s
        const base = attempt === 1 ? 600 : 2000 * Math.pow(2, attempt - 2);
        const jitter = Math.floor(Math.random() * 300) - 150;
        await new Promise(r => setTimeout(r, base + jitter));
      }
      const res = await _throttledFetch(url, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cache.set(url, { ts: Date.now(), data });
      // Store in IndexedDB for next session only if user consented
      if (localStorage.getItem('cacheConsent') === 'yes') {
        try {
          await setCachedData(url, data);
        } catch (e) {
          // IndexedDB write failed, but data is in RAM cache
        }
      }
      return data;
    } catch (err) {
      lastErr = err;
      const msg = err.message || '';
      if (msg.startsWith('HTTP 4')) throw err; // don't retry 4xx
    }
  }
  throw lastErr;
}

// Node-only export for tests (browser loads this as a plain <script>) —
// same pattern as lib/lab-scorer.js.
if (typeof module !== 'undefined') {
  module.exports = { _throttledFetch, cachedFetch };
}
