// lib/twp-tracker.js
// Team Win Predictor — prediction snapshot log + last-N-days accuracy stats.
// Pure logic only: no DOM, no fetch, no localStorage (index.html wraps storage).
// Loaded as a plain <script> in the browser; CommonJS export for Node tests.
//
// Trust rules (why this module exists):
//  - A snapshot is saved ONLY while the game is in Preview (before first pitch).
//    Predictions computed after a game starts are never logged or graded.
//  - A pending snapshot MAY be refreshed by a newer pre-game scan (still
//    Preview-gated) so the graded pick reflects confirmed pitchers/lineups
//    instead of a stale morning guess; predictedAt is preserved and
//    updatedAt/updateCount record the revision. Once a game starts or is
//    graded, the entry is immutable except for grading fields.
//  - Doubleheaders are distinct entries keyed by gamePk.
//  - Accuracy = wins / (wins + losses). Pending, postponed, suspended,
//    no-call (tie) and invalid games never enter the percentage.

const TwpTracker = (() => {

  const SCHEMA_VERSION = 1;

  function emptyLog() {
    return { version: SCHEMA_VERSION, games: {} };
  }

  // Normalize a possibly-missing log loaded from storage.
  function normalizeLog(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.games !== 'object' || raw.games === null) return emptyLog();
    return { version: raw.version || SCHEMA_VERSION, games: raw.games };
  }

  // Build a pre-game snapshot from a runTeamScan result + the raw schedule
  // game. Returns null (and saves nothing) unless the game is still in
  // Preview and the mapping is complete enough to grade later.
  function makeSnapshot(r, rawGame, meta = {}) {
    if (!r || !rawGame) return null;
    const abstractState = rawGame.status?.abstractGameState;
    if (abstractState !== 'Preview') return null; // never snapshot after first pitch
    const gamePk = Number(r.gamePk);
    const winner = r.winner;
    if (!gamePk || !r.awayTeamId || !r.homeTeamId || !r.awayAbbr || !r.homeAbbr) return null;
    if (winner !== 'away' && winner !== 'home' && winner !== 'tie') return null;
    const officialDate = rawGame.officialDate || (r.gameDate || '').slice(0, 10);
    if (!officialDate) return null;
    return {
      gamePk,
      gameDate: r.gameDate || rawGame.gameDate || null,
      officialDate,                       // local calendar day — daily grouping key
      awayAbbr: r.awayAbbr, homeAbbr: r.homeAbbr,
      awayTeamId: r.awayTeamId, homeTeamId: r.homeTeamId,
      predWinner: winner,
      predWinnerAbbr: winner === 'away' ? r.awayAbbr : winner === 'home' ? r.homeAbbr : null,
      awayWinProb: r.awayWinProb ?? null, homeWinProb: r.homeWinProb ?? null,
      confidence: r.confidence || null,
      winEdge: r.winEdge || null,
      projAway: r.awayProjRuns ?? null, projHome: r.homeProjRuns ?? null,
      projTotal: r.predTotal ?? null,
      simAwayPct: null, simHomePct: null, simWinner: null, // attached later if sim runs pre-game
      awayPosted: !!r.awayPosted, homePosted: !!r.homePosted,
      awayPitcher: r.awayPitcherName || null, homePitcher: r.homePitcherName || null,
      predictedAt: meta.predictedAt || null,
      appVersion: meta.appVersion || null,
      status: 'pending',                  // pending | win | loss | nocall | postponed | suspended
      actualAway: null, actualHome: null, actualWinner: null, gradedAt: null,
    };
  }

  // Add a snapshot if absent. Existing entries are NEVER overwritten here —
  // pre-game revisions go through refreshSnapshot.
  function addSnapshot(log, entry) {
    if (!entry || !entry.gamePk) return false;
    const key = String(entry.gamePk);
    if (log.games[key]) return false;
    log.games[key] = entry;
    return true;
  }

  // Refresh a still-pending snapshot with a newer pre-game prediction.
  // `entry` must come from makeSnapshot(), which refuses to build once the
  // game leaves Preview — so a refresh can only ever carry pre-game info.
  // The original predictedAt and any attached sim results are preserved;
  // updatedAt/updateCount record the revision trail. The starting pitcher is
  // the model's most predictive input (Jul 2026 ablation), and morning scans
  // often run before pitchers are confirmed — without refresh, that weaker
  // early pick is what gets graded.
  function refreshSnapshot(log, entry, updatedAt) {
    if (!entry || !entry.gamePk) return false;
    const key = String(entry.gamePk);
    const old = log.games[key];
    if (!old || old.status !== 'pending') return false;
    if (old.predWinner  === entry.predWinner &&
        old.awayWinProb === entry.awayWinProb && old.homeWinProb === entry.homeWinProb &&
        old.confidence  === entry.confidence  && old.winEdge     === entry.winEdge &&
        old.awayPitcher === entry.awayPitcher && old.homePitcher === entry.homePitcher &&
        old.awayPosted  === entry.awayPosted  && old.homePosted  === entry.homePosted) return false;
    log.games[key] = {
      ...entry,
      predictedAt: old.predictedAt,
      simAwayPct: old.simAwayPct, simHomePct: old.simHomePct, simWinner: old.simWinner,
      updatedAt: updatedAt || null,
      updateCount: (old.updateCount || 0) + 1,
    };
    return true;
  }

  // Attach 100x-simulator results to an existing snapshot — allowed only
  // while the prediction is still pending and the game hasn't started.
  function attachSim(log, gamePk, sim, abstractState) {
    const e = log.games[String(gamePk)];
    if (!e || e.status !== 'pending' || abstractState !== 'Preview' || !sim) return false;
    e.simAwayPct = sim.awayWins ?? null;
    e.simHomePct = sim.homeWins ?? null;
    e.simWinner  = sim.simWinner || null;
    return true;
  }

  // Grade one game from final schedule info:
  //   final = { abstractState, detailedState, awayScore, homeScore }
  // Returns the new status, or null if nothing changed.
  // pending → win|loss|nocall|postponed|suspended; suspended → win|loss|nocall
  // (suspended games resume under the same gamePk). win/loss/nocall are final.
  function gradeGame(log, gamePk, final, gradedAt) {
    const e = log.games[String(gamePk)];
    if (!e || !final) return null;
    if (e.status !== 'pending' && e.status !== 'suspended' && e.status !== 'postponed') return null;
    const det = final.detailedState || '';
    if (/Postponed|Cancelled|Canceled/i.test(det)) {
      if (e.status === 'postponed') return null;
      e.status = 'postponed';
      return e.status;
    }
    if (/Suspended/i.test(det) && final.abstractState !== 'Final') {
      if (e.status === 'suspended') return null;
      e.status = 'suspended';
      return e.status;
    }
    if (final.abstractState !== 'Final') return null;
    const a = final.awayScore, h = final.homeScore;
    if (!Number.isFinite(a) || !Number.isFinite(h) || a === h) return null; // invalid — never grade
    e.actualAway   = a;
    e.actualHome   = h;
    e.actualWinner = h > a ? 'home' : 'away';
    e.gradedAt     = gradedAt || null;
    e.status       = e.predWinner === 'tie' ? 'nocall'
                   : e.predWinner === e.actualWinner ? 'win' : 'loss';
    return e.status;
  }

  // Classify WHY a graded loss happened from the prediction's component
  // scores vs the actual winner's. Mirrors the card postmortem taxonomy so
  // lessons and postgame analysis speak the same language.
  function classifyMiss(predComps, actualComps, meta = {}) {
    if (!predComps || !actualComps) return 'Unclassified';
    const deltas = [
      ['Offense & Form',   ((predComps.lineup || 0) + (predComps.form || 0)) - ((actualComps.lineup || 0) + (actualComps.form || 0))],
      ['Starting Pitcher', (predComps.starter   || 0) - (actualComps.starter   || 0)],
      ['Bullpen',          (predComps.bullpen   || 0) - (actualComps.bullpen   || 0)],
      ['Arsenal Matchup',  (predComps.arsenal   || 0) - (actualComps.arsenal   || 0)],
      ['Platoon Edge',     (predComps.platoon   || 0) - (actualComps.platoon   || 0)],
    ].filter(d => Math.abs(d[1]) >= 2);
    const wrong  = deltas.filter(d => d[1] > 0).sort((a, b) => b[1] - a[1]);   // pick's edges that didn't hold
    const missed = deltas.filter(d => d[1] < 0).sort((a, b) => a[1] - b[1]);   // winner's edges the model saw but underweighted
    if (wrong[0]?.[0] === 'Starting Pitcher' && wrong[0][1] >= 8) return 'ERA Trap';
    if (wrong[0]?.[0] === 'Bullpen' && wrong[0][1] >= 6)          return 'Bullpen Collapse';
    if (wrong[0]?.[0] === 'Offense & Form' && missed[0]?.[0] === 'Starting Pitcher') return 'Pitcher Dominance';
    if (missed[0]?.[0] === 'Starting Pitcher') return 'SP Outperformance';
    if (missed[0]?.[0] === 'Bullpen')          return 'Bullpen Dominance';
    if (missed[0]?.[0] === 'Offense & Form')   return 'Lineup Underrated';
    if (missed[0]?.[0] === 'Arsenal Matchup')  return 'Arsenal Mismatch';
    if (missed[0]?.[0] === 'Platoon Edge')     return 'Platoon Flip';
    if (meta.bothProjected)                    return 'Lineup Uncertainty';
    return 'Marginal Miss';
  }

  // Record the miss category on a graded loss. Write-once, losses only.
  function setMissCategory(log, gamePk, category) {
    const e = log.games[String(gamePk)];
    if (!e || e.status !== 'loss' || e.missCategory || !category) return false;
    e.missCategory = category;
    return true;
  }

  // Recurring miss categories among losses in the window INCLUDING today —
  // lessons should reflect the freshest mistakes.
  function missPatterns(log, todayStr, n = 10) {
    const dates = new Set(windowDates(todayStr, n));
    dates.add(todayStr);
    const counts = {};
    for (const e of Object.values(log.games)) {
      if (e.status !== 'loss' || !e.missCategory || e.missCategory === 'Unclassified') continue;
      if (!dates.has(e.officialDate)) continue;
      counts[e.missCategory] = (counts[e.missCategory] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Previous n calendar days, newest first, EXCLUDING todayStr (YYYY-MM-DD).
  function windowDates(todayStr, n = 10) {
    const out = [];
    const d = new Date(todayStr + 'T12:00:00');
    for (let i = 1; i <= n; i++) {
      const dd = new Date(d);
      dd.setDate(d.getDate() - i);
      out.push(dd.toISOString().slice(0, 10));
    }
    return out;
  }

  function _acc(wins, losses) {
    const g = wins + losses;
    return g ? Math.round(wins / g * 1000) / 10 : null;
  }

  function _bucket(map, key, isWin) {
    if (!key) return;
    const b = map[key] || (map[key] = { wins: 0, losses: 0 });
    if (isWin) b.wins++; else b.losses++;
  }

  // Aggregate the last-n-days window (excluding today).
  function computeStats(log, todayStr, n = 10) {
    const dates = windowDates(todayStr, n);
    const inWindow = new Set(dates);
    const entries = Object.values(log.games).filter(e => inWindow.has(e.officialDate));

    let wins = 0, losses = 0, pending = 0, nocalls = 0, postponed = 0, suspended = 0;
    const byDay = {};
    const byConfidence = {}, byEdge = {}, byLineup = {};
    let simFavWins = 0, simFavLosses = 0;
    let agreeWins = 0, agreeLosses = 0, disagreeWins = 0, disagreeLosses = 0;

    for (const e of entries) {
      const day = byDay[e.officialDate] || (byDay[e.officialDate] = { wins: 0, losses: 0, pending: 0, other: 0 });
      if (e.status === 'win' || e.status === 'loss') {
        const isWin = e.status === 'win';
        if (isWin) { wins++; day.wins++; } else { losses++; day.losses++; }
        _bucket(byConfidence, e.confidence, isWin);
        _bucket(byEdge, e.winEdge, isWin);
        _bucket(byLineup, (e.awayPosted && e.homePosted) ? 'Confirmed lineups' : 'Projected lineups', isWin);
        if (e.simWinner === 'away' || e.simWinner === 'home') {
          if (e.simWinner === e.actualWinner) simFavWins++; else simFavLosses++;
          if (e.simWinner === e.predWinner) { isWin ? agreeWins++ : agreeLosses++; }
          else                              { isWin ? disagreeWins++ : disagreeLosses++; }
        }
      }
      else if (e.status === 'pending')   { pending++;   day.pending++; }
      else if (e.status === 'nocall')    { nocalls++;   day.other++; }
      else if (e.status === 'postponed') { postponed++; day.other++; }
      else if (e.status === 'suspended') { suspended++; day.other++; }
    }

    // Daily rows, newest first, only days that have any logged games.
    const daily = dates
      .filter(d => byDay[d])
      .map(d => {
        const b = byDay[d];
        return { date: d, wins: b.wins, losses: b.losses, graded: b.wins + b.losses,
                 pending: b.pending, pct: _acc(b.wins, b.losses) };
      });

    // Current winning streak: walk graded games newest → oldest.
    const graded = entries
      .filter(e => e.status === 'win' || e.status === 'loss')
      .sort((a, b) => (b.gameDate || b.officialDate || '').localeCompare(a.gameDate || a.officialDate || '') || b.gamePk - a.gamePk);
    let streak = 0;
    for (const e of graded) { if (e.status === 'win') streak++; else break; }

    const gradedDays = daily.filter(d => d.graded > 0);
    const bestDay  = gradedDays.length ? [...gradedDays].sort((a, b) => b.pct - a.pct || b.graded - a.graded)[0] : null;
    const worstDay = gradedDays.length ? [...gradedDays].sort((a, b) => a.pct - b.pct || b.graded - a.graded)[0] : null;

    const finishBuckets = (map) => {
      for (const k of Object.keys(map)) map[k].pct = _acc(map[k].wins, map[k].losses);
      return map;
    };

    return {
      windowDates: dates,
      wins, losses, graded: wins + losses, pct: _acc(wins, losses),
      pending, nocalls, postponed, suspended,
      streak, bestDay, worstDay, daily,
      daysWithData: daily.length,
      byConfidence: finishBuckets(byConfidence),
      byEdge: finishBuckets(byEdge),
      byLineup: finishBuckets(byLineup),
      bySim: {
        favorite: { wins: simFavWins, losses: simFavLosses, pct: _acc(simFavWins, simFavLosses) },
        agree:    { wins: agreeWins, losses: agreeLosses, pct: _acc(agreeWins, agreeLosses) },
        disagree: { wins: disagreeWins, losses: disagreeLosses, pct: _acc(disagreeWins, disagreeLosses) },
      },
    };
  }

  return { SCHEMA_VERSION, emptyLog, normalizeLog, makeSnapshot, addSnapshot, refreshSnapshot, attachSim, gradeGame, windowDates, computeStats, classifyMiss, setMissCategory, missPatterns };
})();

if (typeof module !== 'undefined') {
  module.exports = TwpTracker;
}
