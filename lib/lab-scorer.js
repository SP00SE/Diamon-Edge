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

function computeRF(ctx) {
  var player        = ctx.player || {};
  var l7avg         = (player.last7Stats || {}).avg || 0;
  var hitGames7     = player.hitGames7     != null ? player.hitGames7     : null;
  var recentGames   = player.recentGameCount != null ? player.recentGameCount : 7;
  var hitStreak     = player.hitStreak  || 0;
  var last3Hitless  = player.last3Hitless || false;
  var delta = 0, hasData = false;

  if (l7avg > 0) {
    hasData = true;
    if      (l7avg >= 0.350) delta += 5;
    else if (l7avg >= 0.300) delta += 3;
    else if (l7avg >= 0.250) delta += 1;
    else if (l7avg >= 0.200) delta -= 2;
    else                      delta -= 4;
  }
  if (hitGames7 !== null && recentGames > 0) {
    hasData = true;
    var actual = Math.min(recentGames, 7);
    var ghp    = hitGames7 / actual;
    var scale  = actual / 7;
    var ghpRaw = ghp >= 0.72 ? 3 : ghp >= 0.60 ? 2 : ghp >= 0.50 ? 1 : ghp >= 0.40 ? -2 : -4;
    delta += Math.round(ghpRaw * scale);
  }
  if      (hitStreak >= 7) delta += 2;
  else if (hitStreak >= 4) delta += 1;
  if (last3Hitless)        delta -= 1;

  return { value: clamp(delta, -10, 10), hasData: hasData };
}

function computePBE(ctx) {
  var player   = ctx.player  || {};
  var pitcher  = ctx.pitcher || {};
  var h2h      = ctx.h2h;
  var seasonAvg = (player.seasonStats || {}).avg || 0;
  var splitKey  = pitcher.pitchHand === 'L' ? 'vsLHP' : 'vsRHP';
  var split     = player[splitKey] || {};
  var splitAB   = split.atBats || 0;
  var splitAvg  = split.avg    || 0;
  var delta = 0, hasData = false;

  if (splitAB >= 20 && seasonAvg > 0) {
    hasData = true;
    var diff = splitAvg - seasonAvg;
    if (splitAB >= 40) {
      if      (diff >= 0.075)  delta += 6;
      else if (diff >= 0.050)  delta += 4;
      else if (diff >= 0.025)  delta += 2;
      else if (diff >= -0.024) delta += 0;
      else if (diff >= -0.050) delta -= 3;
      else if (diff >= -0.075) delta -= 5;
      else                      delta -= 7;
    } else {
      if      (diff >= 0.060)  delta += 3;
      else if (diff >= 0.030)  delta += 1;
      else if (diff >= -0.029) delta += 0;
      else if (diff >= -0.060) delta -= 2;
      else                      delta -= 4;
    }
  }
  if (h2h && h2h.ab >= 5) {
    hasData = true;
    var ab = h2h.ab, avg = h2h.avg || 0;
    if (ab >= 30) {
      if      (avg >= 0.350) delta += 5;
      else if (avg >= 0.300) delta += 2;
      else if (avg >= 0.200) delta += 0;
      else if (avg >  0.150) delta -= 3;
      else                    delta -= 5;
    } else if (ab >= 15) {
      if      (avg >= 0.350) delta += 3;
      else if (avg >= 0.300) delta += 1;
      else if (avg >= 0.200) delta += 0;
      else if (avg >= 0.150) delta -= 2;
      else                    delta -= 3;
    } else {
      if      (avg >= 0.400) delta += 1;
      else if (avg <  0.150) delta -= 1;
    }
  }
  return { value: clamp(delta, -8, 8), hasData: hasData };
}

function computeCTXHit(ctx) {
  var park = ctx.park || {}, weather = ctx.weather || {};
  var player = ctx.player || {}, order = ctx.battingOrder;
  var delta = 0, hasData = false, parkDelta = 0;

  if (park.overall > 0) {
    hasData = true;
    var pf = park.overall;
    parkDelta = pf >= 1.07 ? 2 : pf >= 1.03 ? 1 : pf >= 0.97 ? 0 : pf >= 0.93 ? -1 : -2;
  }
  var ps = player.parkStats || {};
  if ((ps.ab || 0) >= 10) {
    hasData = true;
    if      ((ps.avg || 0) >= 0.350) parkDelta = Math.min(parkDelta + 1,  3);
    else if ((ps.avg || 0) <  0.180) parkDelta = Math.max(parkDelta - 1, -3);
  }
  delta += clamp(parkDelta, -3, 3);

  if (order != null) {
    hasData = true;
    delta += order <= 3 ? 1 : order >= 7 ? -1 : 0;
  }
  if (weather.windDir && weather.windMph > 0) {
    hasData = true;
    if      (weather.windDir === 'out' && weather.windMph >= 12) delta += 1;
    else if (weather.windDir === 'in'  && weather.windMph >= 12) delta -= 1;
  }
  if (weather.tempF != null) {
    hasData = true;
    if (weather.tempF < 45) delta -= 1;
  }
  return { value: clamp(delta, -5, 5), hasData: hasData };
}

function computeBCP(ctx) {
  var b = ctx.bullpen || {};
  var hbf = b.hbf || 0, h9 = b.h9 || 0;
  var delta = 0, hasData = false;

  if (hbf > 0) {
    hasData = true;
    delta = hbf >= 0.270 ? 4 : hbf >= 0.250 ? 2 : hbf >= 0.240 ? 1 :
            hbf >= 0.220 ? 0 : hbf >= 0.190 ? -2 : -4;
  } else if (h9 > 0) {
    hasData = true;
    delta = h9 >= 9.5 ? 2 : h9 < 6.5 ? -2 : 0;
  }
  return { value: clamp(delta, -4, 4), hasData: hasData };
}

function computeConfidence(ctx, withData, total) {
  var lw = { confirmed:1.0, projected:0.6, unknown:0.3 };
  var lineupWeight = lw[ctx.lineupStatus] || 0.3;
  var hAB = ((ctx.player  || {}).seasonStats || {}).atBats || 0;
  var pIP = ((ctx.pitcher || {}).seasonStats || {}).ip     || 0;
  var sw  = (hAB >= 150 && pIP >= 30) ? 1.0 :
            (hAB >= 100 || pIP >= 20) ? 0.8 :
            (hAB >= 50  || pIP >= 10) ? 0.6 : 0.4;
  var cw  = total > 0 ? withData / total : 0;
  return Math.round((lineupWeight * 0.25 + sw * 0.40 + cw * 0.35) * 100) / 100;
}

function buildHitReasons(comps, ctx) {
  var reasons = [], ps = ((ctx.pitcher||{}).seasonStats||{}), pl = ((ctx.player||{}).seasonStats||{});
  var l7 = ((ctx.player||{}).last7Stats||{}).avg || 0;
  if (comps.pcp.hasData && comps.pcp.value > 0) {
    if ((ps.kpct||0) < 0.22)
      reasons.push('Low-K pitcher (' + Math.round((ps.kpct||0)*100) + '%)');
    if ((ps.babip||0) >= 0.315)
      reasons.push('Pitcher BABIP .' + Math.round((ps.babip||0)*1000).toString().padStart(3,'0'));
    if ((ps.whip||0) >= 1.30)
      reasons.push('Pitcher WHIP ' + (ps.whip||0).toFixed(2));
  }
  if (comps.bcq.hasData && comps.bcq.value > 0) {
    if ((pl.avg||0) >= 0.290)
      reasons.push('.' + Math.round((pl.avg||0)*1000).toString().padStart(3,'0') + ' season AVG');
    if ((pl.obp||0) >= 0.360)
      reasons.push('.' + Math.round((pl.obp||0)*1000).toString().padStart(3,'0') + ' OBP');
  }
  if (comps.rf.hasData && comps.rf.value > 0) {
    if (l7 >= 0.300)
      reasons.push('.' + Math.round(l7*1000).toString().padStart(3,'0') + ' over last 7 games');
    if ((ctx.player||{}).hitStreak >= 4)
      reasons.push(ctx.player.hitStreak + '-game hit streak');
  }
  return reasons.slice(0, 4);
}

function buildHitWarnings(comps, ctx) {
  var warnings = [], ps = ((ctx.pitcher||{}).seasonStats||{});
  if (comps.pcp.hasData && comps.pcp.value < -3 && (ps.kpct||0) >= 0.28)
    warnings.push('High-K pitcher (' + Math.round((ps.kpct||0)*100) + '%)');
  if (comps.bcq.hasData && comps.bcq.value < -2)
    warnings.push('Below-average contact rate this season');
  if (comps.rf.hasData  && comps.rf.value  < -3)
    warnings.push('Cold at the plate recently');
  if ((ctx.dataFlags||{}).savantMissing)
    warnings.push('Pitch-mix data unavailable');
  return warnings.slice(0, 2);
}

function computeHitScore(ctx) {
  var pcp    = computePCP(ctx),    bcq = computeBCQ(ctx),
      rf     = computeRF(ctx),     pbe = computePBE(ctx),
      ctxHit = computeCTXHit(ctx), bcp = computeBCP(ctx);
  var comps  = [pcp,bcq,rf,pbe,ctxHit,bcp];
  var withData = comps.filter(function(c){ return c.hasData; }).length;
  var rawTotal = pcp.value+bcq.value+rf.value+pbe.value+ctxHit.value+bcp.value;
  var score    = clamp(50+rawTotal, 0, 100);
  var breakdown = {
    pitcherContactProfile: pcp.hasData    ? pcp.value    : null,
    batterContactQuality:  bcq.hasData    ? bcq.value    : null,
    recentForm:            rf.hasData     ? rf.value     : null,
    platoonBvpEdge:        pbe.hasData    ? pbe.value    : null,
    hitContext:            ctxHit.hasData ? ctxHit.value : null,
    bullpenContactProfile: bcp.hasData    ? bcp.value    : null,
  };
  var cm = { pcp:pcp, bcq:bcq, rf:rf, pbe:pbe, ctxHit:ctxHit, bcp:bcp };
  return {
    score: score, rawTotal: rawTotal, breakdown: breakdown,
    confidence: computeConfidence(ctx, withData, comps.length),
    label:      buildScoreLabel(score),
    reasons:    buildHitReasons(cm, ctx),
    warnings:   buildHitWarnings(cm, ctx),
  };
}

function computeBPP(ctx) {
  var stats = (ctx.player&&ctx.player.seasonStats)||{};
  var slg=stats.slg||0, avg=stats.avg||0, bacon=stats.bacon||0, barrel=stats.barrel||0;
  var iso=slg-avg, delta=0, hasData=false;
  if (iso>0) { hasData=true;
    delta += iso>=0.260?8:iso>=0.220?5:iso>=0.180?2:iso>=0.140?0:iso>=0.100?-3:-6; }
  if (bacon>0) { hasData=true;
    delta += bacon>=0.330?4:bacon>=0.310?2:bacon>=0.290?0:bacon>=0.270?-1:-3; }
  if (barrel>0) { hasData=true;
    delta += barrel>=0.12?3:barrel>=0.08?1:barrel>=0.04?0:-2; }
  return { value:clamp(delta,-15,15), hasData:hasData };
}

function computeRPF(ctx) {
  var player=ctx.player||{}, gameLog=player.gameLog||[];
  var last14=gameLog.slice(-14);
  var recentHR=player.recentHR!=null?player.recentHR:last14.reduce(function(s,g){ return s+(g.hr||0); },0);
  var l10slg=((player.last10Stats||{}).slg)||0;
  var delta=0, hasData=false;
  if (last14.length>=7) { hasData=true;
    delta += recentHR>=4?6:recentHR>=2?3:recentHR>=1?1:-2; }
  if (l10slg>0) { hasData=true;
    if      (l10slg>=0.600) delta+=2;
    else if (l10slg< 0.300) delta-=2; }
  return { value:clamp(delta,-8,8), hasData:hasData };
}

function computePHS(ctx) {
  var stats=(ctx.pitcher&&ctx.pitcher.seasonStats)||{};
  var hr9=stats.hr9||0, kpct=stats.kpct||0, bacon=stats.bacon||0;
  var delta=0, hasData=false;
  if (hr9>0) { hasData=true;
    delta += hr9>=1.50?6:hr9>=1.20?3:hr9>=0.90?0:hr9>=0.60?-3:-6;
  } else {
    if (kpct>0)  { hasData=true; delta += kpct<0.18?2:kpct>=0.28?-2:0; }
    if (bacon>0) { hasData=true; delta += bacon>=0.310?2:bacon<0.270?-2:0; }
  }
  return { value:clamp(delta,-10,10), hasData:hasData };
}

function computeBvPH(ctx) {
  var h2h=ctx.h2h;
  if (!h2h||h2h.ab<15) return { value:0, hasData:false };
  var ab=h2h.ab, hr=h2h.hr||0, delta=0;
  if (ab>=30) {
    if      (hr/ab>=1/8)  delta=5;
    else if (hr/ab>=1/12) delta=3;
    else if (hr===0)      delta=-3;
  } else {
    if      (hr/ab>=1/10)    delta=3;
    else if (ab>=20&&hr===0) delta=-2;
  }
  return { value:clamp(delta,-5,5), hasData:true };
}

function computeCTXHR(ctx) {
  var park=ctx.park||{}, weather=ctx.weather||{};
  var bats=(ctx.player||{}).bats||'R';
  var parkHR = bats==='L' ? (park.lhh||park.overall||0) : (park.rhh||park.overall||0);
  var delta=0, hasData=false;
  if (parkHR>0) { hasData=true;
    delta += parkHR>=1.15?4:parkHR>=1.07?2:parkHR>=0.93?0:parkHR>=0.85?-2:-4; }
  if (weather.tempF!=null) { hasData=true;
    delta += weather.tempF>=80?2:weather.tempF>=65?1:weather.tempF>=50?0:weather.tempF>=45?-1:-2; }
  if (weather.windDir&&weather.windMph>0) { hasData=true;
    if      (weather.windDir==='out'&&weather.windMph>=15) delta+=2;
    else if (weather.windDir==='out'&&weather.windMph>=8)  delta+=1;
    else if (weather.windDir==='in' &&weather.windMph>=15) delta-=3;
    else if (weather.windDir==='in' &&weather.windMph>=8)  delta-=1;
  }
  return { value:clamp(delta,-8,8), hasData:hasData };
}

function computeBHS(ctx) {
  var b=ctx.bullpen||{}, hr9=b.hr9||0, era=b.era||0;
  var delta=0, hasData=false;
  if (hr9>0) { hasData=true;
    delta += hr9>=1.40?3:hr9>=1.00?1:hr9>=0.70?0:-2;
  } else if (era>0) { hasData=true;
    delta += era>=5.00?2:era<=3.00?-1:0; }
  return { value:clamp(delta,-3,3), hasData:hasData };
}

function buildHRReasons(comps,ctx) {
  var reasons=[], stats=((ctx.player||{}).seasonStats||{});
  var iso=(stats.slg||0)-(stats.avg||0);
  if (comps.bpp.hasData&&comps.bpp.value>0) {
    if (iso>=0.200) reasons.push('ISO '+iso.toFixed(3).replace('0.','.'));
    if ((stats.bacon||0)>=0.310) reasons.push('High hard-contact rate');
  }
  if (comps.rpf.hasData&&comps.rpf.value>0&&(ctx.player||{}).recentHR>=2)
    reasons.push((ctx.player.recentHR)+' HR in last 14 days');
  if (comps.ctxHR.hasData&&comps.ctxHR.value>0) {
    if ((ctx.weather||{}).windDir==='out'&&(ctx.weather.windMph||0)>=8)
      reasons.push('Wind out ('+ctx.weather.windMph+' mph)');
    if ((ctx.weather||{}).tempF>=75) reasons.push('Warm conditions ('+ctx.weather.tempF+'°F)');
  }
  if (comps.bvph.hasData&&comps.bvph.value>0) reasons.push('HR history vs this pitcher');
  return reasons.slice(0,4);
}

function buildHRWarnings(comps,ctx) {
  var warnings=[];
  if (comps.phs.hasData&&comps.phs.value<-3)      warnings.push('Pitcher suppresses HR');
  if (comps.ctxHR.hasData&&comps.ctxHR.value<-3)  warnings.push('Conditions unfavorable for power');
  if (comps.bvph.hasData&&comps.bvph.value<-2)    warnings.push('Weak history vs this pitcher');
  if ((ctx.dataFlags||{}).pitcherHR9Estimated)     warnings.push('Pitcher HR/9 estimated');
  return warnings.slice(0,2);
}

function computeHRScore(ctx) {
  var bpp=computeBPP(ctx), rpf=computeRPF(ctx), phs=computePHS(ctx),
      bvph=computeBvPH(ctx), ctxHR=computeCTXHR(ctx), bhs=computeBHS(ctx);
  var comps=[bpp,rpf,phs,bvph,ctxHR,bhs];
  var withData=comps.filter(function(c){ return c.hasData; }).length;
  var rawTotal=bpp.value+rpf.value+phs.value+bvph.value+ctxHR.value+bhs.value;
  var score=clamp(50+rawTotal,0,100);
  var breakdown={
    batterPowerProfile:      bpp.hasData  ?bpp.value:null,
    recentPowerForm:         rpf.hasData  ?rpf.value:null,
    pitcherHRSusceptibility: phs.hasData  ?phs.value:null,
    bvpPowerHistory:         bvph.hasData ?bvph.value:null,
    hrContext:               ctxHR.hasData?ctxHR.value:null,
    bullpenHRSusceptibility: bhs.hasData  ?bhs.value:null,
  };
  var cm={bpp:bpp,rpf:rpf,phs:phs,bvph:bvph,ctxHR:ctxHR,bhs:bhs};
  return { score:score, rawTotal:rawTotal, breakdown:breakdown,
           confidence:computeConfidence(ctx,withData,comps.length),
           label:buildScoreLabel(score),
           reasons:buildHRReasons(cm,ctx), warnings:buildHRWarnings(cm,ctx) };
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
    computeRF: computeRF,
    computePBE: computePBE,
    computeCTXHit: computeCTXHit,
    computeBCP: computeBCP,
    computeConfidence: computeConfidence,
    buildHitReasons: buildHitReasons,
    buildHitWarnings: buildHitWarnings,
    computeHitScore: computeHitScore,
    computeBPP: computeBPP,
    computeRPF: computeRPF,
    computePHS: computePHS,
    computeBvPH: computeBvPH,
    computeCTXHR: computeCTXHR,
    computeBHS: computeBHS,
    buildHRReasons: buildHRReasons,
    buildHRWarnings: buildHRWarnings,
    computeHRScore: computeHRScore,
  };
}

// Browser namespace — prevents inline index.html globals from shadowing these
// when the inline <script> runs after this file loads.
if (typeof window !== 'undefined') {
  window.LabScorer = {
    buildMatchupContext: buildMatchupContext,
    computeHitScore:    computeHitScore,
    computeHRScore:     computeHRScore,
  };
}
