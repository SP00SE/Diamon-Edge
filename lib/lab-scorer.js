// lib/lab-scorer.js
'use strict';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildScoreLabel(score) {
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Favorable';
  if (score >= 45) return 'Neutral';
  if (score >= 30) return 'Risky';
  return 'Avoid';
}

function confidenceLabel(c) {
  if (c >= 0.80) return 'High';
  if (c >= 0.60) return 'Medium';
  if (c >= 0.40) return 'Low';
  return 'Insufficient';
}

function formatBreakdownKey(key) {
  var labels = {
    pitcherContactProfile:    'Pitcher Contact',
    batterContactQuality:     'Batter Contact',
    recentForm:               'Recent Form',
    platoonBvpEdge:           'Platoon / BvP',
    hitContext:               'Park / Order / Weather',
    bullpenContactProfile:    'Bullpen Contact',
    batterPowerProfile:       'Power Profile',
    recentPowerForm:          'Recent Power',
    pitcherHRSusceptibility:  'Pitcher HR Rate',
    bvpPowerHistory:          'BvP HR History',
    hrContext:                'Park / Temp / Wind',
    bullpenHRSusceptibility:  'Bullpen HR Rate',
  };
  return labels[key] || key;
}

function buildMatchupContext(raw) {
  var player  = raw.player  || {};
  var pitcher = raw.pitcher || {};
  var bullpen = raw.bullpen || {};
  var park    = raw.park    || { overall: 1.0, rhh: 1.0, lhh: 1.0 };
  var weather = raw.weather || {};

  var gameLog         = player.gameLog || [];
  var last14          = gameLog.slice(-14);
  var last7           = gameLog.slice(-7);
  var recentHR        = last14.reduce(function (s, g) { return s + (g.hr   || 0); }, 0);
  var hitGames7       = last7.filter(function (g) { return (g.hits || 0) > 0; }).length;
  var recentGameCount = last7.length;
  var last3           = gameLog.slice(-3);
  var last3Hitless    = last3.length === 3 && last3.every(function (g) { return (g.hits || 0) === 0; });

  var enrichedPlayer = Object.assign({}, player, {
    recentHR: recentHR, hitGames7: hitGames7,
    recentGameCount: recentGameCount, last3Hitless: last3Hitless,
  });

  var hitterAB = (player.seasonStats || {}).atBats || 0;
  var dataFlags = {
    savantMissing:        !raw.savantBatter || !raw.savantPitcher,
    pitcherHR9Estimated:  !((pitcher.seasonStats || {}).hr9 > 0),
    barrelMissing:        !((player.seasonStats  || {}).barrel > 0),
    lineupProjected:      raw.lineupStatus !== 'confirmed',
    smallBatterSample:    hitterAB < 50,
    noBvpHistory:         !raw.h2h || (raw.h2h.ab || 0) < 5,
  };

  return {
    player: enrichedPlayer, pitcher: pitcher, bullpen: bullpen,
    park: park, weather: weather,
    h2h:           raw.h2h           || null,
    savantBatter:  raw.savantBatter   || null,
    savantPitcher: raw.savantPitcher  || null,
    lineupStatus:  raw.lineupStatus   || 'unknown',
    battingOrder:  raw.battingOrder   != null ? raw.battingOrder : null,
    dataFlags:     dataFlags,
  };
}

function computePCP(ctx) {
  var stats = (ctx.pitcher && ctx.pitcher.seasonStats) || {};
  var kpct  = stats.kpct  || 0;
  var babip = stats.babip || 0;
  var whip  = stats.whip  || 0;
  var delta = 0, hasData = false;

  if (kpct > 0) {
    hasData = true;
    if      (kpct < 0.18) delta += 4;
    else if (kpct < 0.22) delta += 2;
    else if (kpct < 0.25) delta += 0;
    else if (kpct < 0.28) delta -= 2;
    else if (kpct < 0.32) delta -= 4;
    else                   delta -= 6;
  }
  if (babip > 0) {
    hasData = true;
    if      (babip >= 0.330) delta += 2;
    else if (babip >= 0.315) delta += 1;
    else if (babip >= 0.300) delta += 0;
    else if (babip >= 0.280) delta -= 1;
    else if (babip >= 0.260) delta -= 2;
    else                      delta -= 4;
  }
  if (whip > 0) {
    hasData = true;
    if      (whip >= 1.45) delta += 3;
    else if (whip >= 1.30) delta += 1;
    else if (whip >= 1.10) delta += 0;
    else if (whip >= 0.95) delta -= 2;
    else                    delta -= 3;
  }
  return { value: clamp(delta, -10, 10), hasData: hasData };
}

function computeBCQ(ctx) {
  var stats = (ctx.player && ctx.player.seasonStats) || {};
  var avg = stats.avg || 0, obp = stats.obp || 0;
  var delta = 0, hasData = false;

  if (avg > 0) {
    hasData = true;
    if      (avg >= 0.310) delta += 4;
    else if (avg >= 0.290) delta += 2;
    else if (avg >= 0.260) delta += 0;
    else if (avg >= 0.230) delta -= 2;
    else                    delta -= 4;
  }
  if (obp > 0) {
    hasData = true;
    if      (obp >= 0.380) delta += 3;
    else if (obp >= 0.360) delta += 2;
    else if (obp >  0.330) delta += 1;
    else if (obp >= 0.300) delta += 0;
    else                    delta -= 2;
  }
  var rows = ctx.savantBatter;
  if (rows && rows.length > 0) {
    var totalUsage = 0, weightedWhiff = 0;
    for (var i = 0; i < rows.length; i++) {
      var u = parseFloat(rows[i].pitch_usage) / 100 || 0;
      var w = parseFloat(rows[i].whiff_percent) / 100 || 0;
      if (u > 0) { totalUsage += u; weightedWhiff += w * u; }
    }
    if (totalUsage > 0) {
      hasData = true;
      var wp = weightedWhiff / totalUsage;
      if      (wp < 0.18)  delta += 3;
      else if (wp < 0.23)  delta += 1;
      else if (wp < 0.28)  delta += 0;
      else if (wp <= 0.33) delta -= 2;
      else                  delta -= 4;
    }
  }
  return { value: clamp(delta, -12, 12), hasData: hasData };
}

if (typeof module !== 'undefined') {
  module.exports = {
    clamp: clamp,
    buildScoreLabel: buildScoreLabel,
    confidenceLabel: confidenceLabel,
    formatBreakdownKey: formatBreakdownKey,
    buildMatchupContext: buildMatchupContext,
    computePCP: computePCP,
    computeBCQ: computeBCQ,
  };
}
