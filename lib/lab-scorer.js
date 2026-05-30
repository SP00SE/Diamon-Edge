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

if (typeof module !== 'undefined') {
  module.exports = {
    clamp: clamp,
    buildScoreLabel: buildScoreLabel,
    confidenceLabel: confidenceLabel,
    formatBreakdownKey: formatBreakdownKey,
  };
}
