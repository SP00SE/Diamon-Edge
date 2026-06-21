// lib/mlb/constants.js
// Static MLB reference data: team metadata, park factors/context, PA scoring config.
// Loaded as a plain <script> before the main inline script — declares globals
// (TEAM_INFO, PARK_FACTORS, PARK_CONTEXT, PA_CFG) exactly as index.html expects.

// ─── TEAM INFO (id → city, nickname, ESPN logo slug) ────────────────────────
const TEAM_INFO = {
  108: { city:'Los Angeles', nick:'Angels',    espn:'laa' },
  109: { city:'Arizona',     nick:'D-backs',   espn:'ari' },
  110: { city:'Baltimore',   nick:'Orioles',   espn:'bal' },
  111: { city:'Boston',      nick:'Red Sox',   espn:'bos' },
  112: { city:'Chicago',     nick:'Cubs',      espn:'chc' },
  113: { city:'Cincinnati',  nick:'Reds',      espn:'cin' },
  114: { city:'Cleveland',   nick:'Guardians', espn:'cle' },
  115: { city:'Colorado',    nick:'Rockies',   espn:'col' },
  116: { city:'Detroit',     nick:'Tigers',    espn:'det' },
  117: { city:'Houston',     nick:'Astros',    espn:'hou' },
  118: { city:'Kansas City', nick:'Royals',    espn:'kc'  },
  119: { city:'Los Angeles', nick:'Dodgers',   espn:'lad' },
  120: { city:'Washington',  nick:'Nationals', espn:'wsh' },
  121: { city:'New York',    nick:'Mets',      espn:'nym' },
  133: { city:'Sacramento',  nick:'Athletics', espn:'oak' },
  134: { city:'Pittsburgh',  nick:'Pirates',   espn:'pit' },
  135: { city:'San Diego',   nick:'Padres',    espn:'sd'  },
  136: { city:'Seattle',     nick:'Mariners',  espn:'sea' },
  137: { city:'San Francisco',nick:'Giants',   espn:'sf'  },
  138: { city:'St. Louis',   nick:'Cardinals', espn:'stl' },
  139: { city:'Tampa Bay',   nick:'Rays',      espn:'tb'  },
  140: { city:'Texas',       nick:'Rangers',   espn:'tex' },
  141: { city:'Toronto',     nick:'Blue Jays', espn:'tor' },
  142: { city:'Minnesota',   nick:'Twins',     espn:'min' },
  143: { city:'Philadelphia',nick:'Phillies',  espn:'phi' },
  144: { city:'Atlanta',     nick:'Braves',    espn:'atl' },
  145: { city:'Chicago',     nick:'White Sox', espn:'cws' },
  146: { city:'Miami',       nick:'Marlins',   espn:'mia' },
  147: { city:'New York',    nick:'Yankees',   espn:'nyy' },
  158: { city:'Milwaukee',   nick:'Brewers',   espn:'mil' },
};

// ─── PARK FACTORS ───────────────────────────────────────────────────────────
const PARK_FACTORS = {
  'Coors Field':                    { overall:1.25, hrL:1.32, hrR:1.28, isHitter:true,  isHR:true  },
  'Great American Ball Park':       { overall:1.13, hrL:1.20, hrR:1.18, isHitter:true,  isHR:true  },
  'Fenway Park':                    { overall:1.08, hrL:1.12, hrR:1.05, isHitter:true,  isHR:false },
  'Yankee Stadium':                 { overall:1.07, hrL:1.15, hrR:1.10, isHitter:true,  isHR:true  },
  'Citizens Bank Park':             { overall:1.05, hrL:1.10, hrR:1.08, isHitter:true,  isHR:true  },
  'Camden Yards':                   { overall:1.05, hrL:1.08, hrR:1.06, isHitter:true,  isHR:true  },
  'Globe Life Field':               { overall:1.04, hrL:1.06, hrR:1.05, isHitter:true,  isHR:false, isDome:true },
  'Guaranteed Rate Field':          { overall:1.03, hrL:1.05, hrR:1.05, isHitter:false, isHR:false },
  'Wrigley Field':                  { overall:1.02, hrL:1.05, hrR:1.03, isHitter:false, isHR:false },
  'Minute Maid Park':               { overall:1.02, hrL:1.04, hrR:1.03, isHitter:false, isHR:false, isDome:true },
  'Dodger Stadium':                 { overall:0.99, hrL:0.98, hrR:0.99, isHitter:false, isHR:false },
  'Angel Stadium':                  { overall:0.99, hrL:1.00, hrR:1.00, isHitter:false, isHR:false },
  'loanDepot park':                 { overall:0.97, hrL:0.95, hrR:0.97, isHitter:false, isHR:false, isDome:true },
  'Target Field':                   { overall:0.97, hrL:0.98, hrR:0.96, isHitter:false, isHR:false },
  'American Family Field':          { overall:0.98, hrL:1.00, hrR:1.00, isHitter:false, isHR:false, isDome:true },
  'Progressive Field':              { overall:0.97, hrL:0.96, hrR:0.97, isHitter:false, isHR:false },
  'PNC Park':                       { overall:0.97, hrL:0.94, hrR:0.96, isHitter:false, isHR:false },
  'Rogers Centre':                  { overall:1.01, hrL:1.02, hrR:1.02, isHitter:false, isHR:false, isDome:true },
  'Nationals Park':                 { overall:1.00, hrL:1.00, hrR:1.00, isHitter:false, isHR:false },
  'Truist Park':                    { overall:1.01, hrL:1.03, hrR:1.02, isHitter:false, isHR:false },
  'Chase Field':                    { overall:1.01, hrL:1.02, hrR:1.01, isHitter:false, isHR:false, isDome:true },
  'Busch Stadium':                  { overall:0.96, hrL:0.94, hrR:0.95, isHitter:false, isHR:false },
  'T-Mobile Park':                  { overall:0.88, hrL:0.85, hrR:0.87, isHitter:false, isHR:false, isDome:true },
  'Oracle Park':                    { overall:0.92, hrL:0.88, hrR:0.90, isHitter:false, isHR:false },
  'Petco Park':                     { overall:0.93, hrL:0.90, hrR:0.92, isHitter:false, isHR:false },
  'Citi Field':                     { overall:0.91, hrL:0.88, hrR:0.90, isHitter:false, isHR:false },
  'Kauffman Stadium':               { overall:0.94, hrL:0.91, hrR:0.93, isHitter:false, isHR:false },
  'Oakland Coliseum':               { overall:0.93, hrL:0.89, hrR:0.91, isHitter:false, isHR:false },
  'Sutter Health Park':             { overall:1.02, hrL:1.03, hrR:1.03, isHitter:false, isHR:false },
  'Tropicana Field':                { overall:0.95, hrL:0.93, hrR:0.94, isHitter:false, isHR:false, isDome:true },
  'Comerica Park':                  { overall:0.95, hrL:0.92, hrR:0.94, isHitter:false, isHR:false },
  'Sahlen Field':                   { overall:0.97, hrL:0.96, hrR:0.96, isHitter:false, isHR:false },
};

// ─── PARK CONTEXT (geometry + environment explanations) ───────────────────
const PARK_CONTEXT = {
  'Coors Field':              { headline:'High altitude suppresses pitch movement — fly balls carry farther', bullets:['At 5,280 ft, air is 18% less dense — breaking balls lose 15–20% of their bite','Fly balls carry ~5% farther than sea level; routine outs become doubles','Curveball/slider-heavy pitchers are at a significant disadvantage','Contact hitters benefit — weak contact still finds gaps','Power alleys (LF 347, CF 415) are large but altitude compensates'], hitterEdge:'All hitter types benefit, especially contact and gap power hitters', pitcherRisk:'Breaking-ball dependent pitchers are most exposed' },
  'Great American Ball Park': { headline:'Compact dimensions and warm air turn mistakes into home runs', bullets:['Short power alleys (LF 328, CF 404, RF 325) maximize HR opportunity','Warm Ohio River valley air aids carry in summer months','Mistake pitches become home runs at one of the highest rates in MLB','Pull hitters on both sides benefit from the short corners'], hitterEdge:'Pull power hitters, especially RHB to short LF porch', pitcherRisk:'Any pitcher prone to fly balls or occasional command lapses' },
  'Fenway Park':              { headline:'The Green Monster creates doubles; short RF is a left-handed hitter\'s dream', bullets:['37-ft Green Monster (310 ft) turns LF fly balls into singles/doubles for RHB','Short RF (302 ft) dramatically boosts LHB pull-side HR','Deep CF (420 ft) suppresses all-fields power hitters','Ground-ball pitchers can use the Monster to their advantage'], hitterEdge:'LHB pull hitters for HR; RHB line-drive hitters for Monster doubles', pitcherRisk:'Fly-ball pitchers — RF is dangerously short for LHB pull power' },
  'Yankee Stadium':           { headline:'Short right-field porch is a left-handed power hitter\'s best friend', bullets:['RF porch sits at 314 ft — LHB pull hitters see significant HR inflation','Deep CF (408 ft) keeps it neutral for all-fields hitters','RHB HR rate also elevated vs league average despite deeper LF','One of the most HR-friendly environments in the AL'], hitterEdge:'LHB pull power hitters gain the most; RF porch is among MLB\'s shortest', pitcherRisk:'Pitchers who allow elevated fly balls to left-handed hitters' },
  'Citizens Bank Park':       { headline:'Hitter-friendly dimensions with warm summers boost HR for pull hitters on both sides', bullets:['Slightly short corners (LF 329, RF 330) boost HR rates for pull hitters','Warm Philadelphia summer air supports fly-ball carry','Balanced hitter-friendly park — no single extreme dimension'], hitterEdge:'Pull power hitters on both sides; balanced park advantage', pitcherRisk:'Fly-ball pitchers in summer months' },
  'Camden Yards':             { headline:'Asymmetric layout with short RF favors left-handed pull power', bullets:['Short RF line (318 ft) gives LHB a clear HR advantage','Warehouse wall in RF prevents triples but keeps balls in play','Inner harbor proximity adds occasional wind variation'], hitterEdge:'LHB pull power hitters', pitcherRisk:'Fly-ball pitchers vs left-handed lineups' },
  'Globe Life Field':         { headline:'Retractable dome controls environment; moderate hitter advantage on turf', bullets:['Climate-controlled interior eliminates weather variables','Moderate dimensions (LF 332, CF 407, RF 326) provide balanced conditions','Artificial turf speeds up ground balls — benefits contact hitters'], hitterEdge:'Pull hitters and contact hitters who benefit from turf speed', pitcherRisk:'Moderate — turf slightly elevates BABIP on ground balls' },
  'Guaranteed Rate Field':    { headline:'Wind-variable open-air park — Lake Michigan creates unpredictable carry', bullets:['Standard dimensions (LF 330, CF 400, RF 335)','Open-air park in Chicago — wind from Lake Michigan creates variable carry','Cold spring games suppress offense; warm summer games slightly elevate it'], hitterEdge:'Power hitters on wind-out days; minimal edge otherwise', pitcherRisk:'Wind-out conditions can turn routine fly balls into HR' },
  'Wrigley Field':            { headline:'Famous wind-driven park — the same park can play wildly differently by day', bullets:['Wind blowing in from Lake Michigan is among the most suppressive effects in MLB','Wind blowing out to RF creates one of the most hitter-friendly conditions in baseball','Ivy walls create unique ground-rule doubles','Always check wind direction — it defines the matchup at Wrigley'], hitterEdge:'All power hitters on strong wind-out days', pitcherRisk:'Wind-out conditions elevate HR rates dramatically' },
  'Minute Maid Park':         { headline:'Crawford Boxes and roof-open Houston heat create left-handed advantage and carry boost', bullets:['Short LF line (315 ft) with 19-ft Crawford Boxes wall — tough HR, easy doubles','Roof-open games in Houston heat add significant fly-ball carry','Ground-ball pitchers limit damage from Crawford Boxes'], hitterEdge:'LHB for Crawford Box doubles; all hitters when roof is open in summer heat', pitcherRisk:'Fly-ball pitchers vs LHB when roof is open' },
  'Dodger Stadium':           { headline:'Marine air at elevation — neutral to slight pitcher advantage, especially at night', bullets:['Ocean marine air at 412 ft elevation creates moderate fly-ball suppression','Symmetrical dimensions (LF 330, CF 395, RF 330)','Night games intensify the marine layer — reduces carry further'], hitterEdge:'Line-drive gap hitters over pure fly-ball HR hitters', pitcherRisk:'Low — one of the better neutral-to-pitcher parks in the NL' },
  'Angel Stadium':            { headline:'Neutral symmetrical park; inland location reduces marine air effects', bullets:['Standard symmetrical dimensions (LF 330, CF 400, RF 330)','Hot inland Anaheim air can modestly boost carry in afternoon day games'], hitterEdge:'Slight power boost in afternoon heat', pitcherRisk:'Minimal' },
  'loanDepot park':           { headline:'Climate-controlled dome with large dimensions — strong pitcher\'s environment', bullets:['Deep dimensions (LF 344, CF 416, RF 335) and wide foul territory','Enclosed dome keeps conditions consistent — no weather help for hitters','One of the most pitcher-friendly environments in the NL'], hitterEdge:'Gap/contact hitters; unfavorable for HR-dependent power hitters', pitcherRisk:'Very low — park suppresses offense broadly' },
  'Target Field':             { headline:'Cold Minnesota air and deep dimensions slightly favor pitchers, especially early season', bullets:['Deep dimensions (LF 339, CF 404, RF 328)','Cold spring open-air games suppress carry meaningfully','Summer months become more neutral as temperatures rise'], hitterEdge:'Gap hitters over pure power in cold conditions', pitcherRisk:'Low in cold months; neutral in summer' },
  'American Family Field':    { headline:'Retractable dome offers consistent neutral conditions year-round', bullets:['Dome eliminates weather variability','Standard dimensions (LF 344, CF 400, RF 345)'], hitterEdge:'Minimal edge for either side — consistent neutral environment', pitcherRisk:'Low' },
  'Progressive Field':        { headline:'Large foul territory and Lake Erie air slightly favor pitchers', bullets:['Extensive foul territory increases pop-out frequency for pitchers','Deep power alleys (LF 325, CF 405, RF 325)','Lake Erie effect produces cool, damp air that suppresses carry'], hitterEdge:'Contact hitters who use the whole field', pitcherRisk:'Low; ground-ball pitchers benefit most from the large foul territory' },
  'PNC Park':                 { headline:'Deep alleys and Allegheny River air make PNC one of the better pitcher\'s parks', bullets:['Very deep CF (399 ft) and wide power alleys suppress HR significantly','Allegheny River cool air in night games reduces fly-ball carry','Short corners (LF 325, RF 320) create doubles but power alley depth suppresses HR'], hitterEdge:'Doubles/pull singles hitters; unfavorable for HR-reliant power hitters', pitcherRisk:'Low — consistently pitcher-friendly in the NL' },
  'Rogers Centre':            { headline:'Indoor dome with turf — consistent conditions, turf boosts BABIP', bullets:['Climate-controlled dome eliminates all weather variables','Artificial turf accelerates ground balls — benefits speed and contact hitters','Standard dimensions (LF 328, CF 400, RF 328)'], hitterEdge:'Contact and speed hitters on turf; consistent conditions for power', pitcherRisk:'Moderate — turf elevates BABIP on ground balls' },
  'Nationals Park':           { headline:'Neutral symmetrical park — DC summer heat provides modest carry boost', bullets:['Symmetrical dimensions (LF 336, CF 402, RF 335)','Hot humid DC summers add a modest fly-ball carry boost'], hitterEdge:'Slight power boost in midsummer heat; otherwise neutral', pitcherRisk:'Low' },
  'Truist Park':              { headline:'Compact RF and Georgia heat create moderate hitter advantage', bullets:['Compact RF line (325 ft) gives LHB a moderate HR edge','Atlanta heat and humidity add carry in afternoon day games'], hitterEdge:'LHB pull power hitters; modest advantage for all hitters in summer', pitcherRisk:'Fly-ball pitchers in hot afternoon games' },
  'Chase Field':              { headline:'Retractable roof at elevation — roof status is the defining variable', bullets:['Located at 1,100 ft altitude — mild carry boost even with roof closed','Roof-open in Phoenix summer heat (100°F+) creates extreme carry conditions','Roof-closed and air-conditioned normalizes conditions to near-neutral','Always check roof status — it defines the offense ceiling at Chase Field'], hitterEdge:'Power hitters significantly when roof is open in summer heat', pitcherRisk:'High on roof-open summer days; low when roof is closed' },
  'Busch Stadium':            { headline:'Deep alleys and cool Missouri nights make Busch a consistent pitcher\'s park', bullets:['Deep power alleys (LF 336, CF 400, RF 335) suppress HR','Cool Mississippi River air in night games reduces carry','Consistently one of the more spacious layouts in the NL'], hitterEdge:'Contact/gap hitters; unfavorable for pure HR power hitters', pitcherRisk:'Low — reliably pitcher-friendly' },
  'T-Mobile Park':            { headline:'Dense Pacific marine air — the most pitch-suppressive environment in MLB', bullets:['Dense marine air from Puget Sound suppresses HR carry more than any other park','HR park factor consistently among the lowest in MLB (0.85–0.88)','Deep dimensions (LF 331, CF 401, RF 326) compound the suppression','Fly-ball hitters are at their worst possible environment here'], hitterEdge:'Ground-ball and contact/gap hitters; pure power hitters severely hurt', pitcherRisk:'Very low — one of the best environments for fly-ball pitchers in MLB' },
  'Oracle Park':              { headline:'Cold Bay Area marine air and quirky dimensions — one of baseball\'s best pitcher\'s parks', bullets:['Dense San Francisco Bay air suppresses fly-ball carry significantly','Night game marine layer intensifies suppression dramatically','Quirky RF arcade and deep gaps suppress power despite the short RF fence (309 ft)','Tricky ball-in-play situations near RF arcade wall'], hitterEdge:'Contact hitters; LHB can target the short RF fence but carry is suppressed', pitcherRisk:'Very low — elite environment for fly-ball pitchers' },
  'Petco Park':               { headline:'Ocean marine air and deep dimensions create a strong pitcher\'s park', bullets:['Dense ocean air from San Diego Bay suppresses fly-ball carry','Deep power alleys (LF 336, CF 396, RF 322) compound suppression','Consistently among the lowest HR rates in the NL'], hitterEdge:'Contact/gap hitters; HR-dependent power hitters are at a disadvantage', pitcherRisk:'Very low — elite environment for pitchers' },
  'Citi Field':               { headline:'Very deep CF and Atlantic marine air make Citi one of the most HR-suppressive parks', bullets:['Very deep CF (408 ft) and large dimensions kill HR rates','Atlantic marine air from Jamaica Bay suppresses carry','Deliberately designed to suppress HR after the Shea Stadium era'], hitterEdge:'Contact/doubles hitters; not favorable for HR-reliant power', pitcherRisk:'Very low — consistently pitcher-friendly' },
  'Kauffman Stadium':         { headline:'Spacious open-air layout and wide alleys favor pitchers', bullets:['Large foul territory and deep dimensions (LF 330, CF 410, RF 330)','Ground-ball pitchers particularly effective with expansive foul territory','Midwest wind patterns add variability but alleys remain deep'], hitterEdge:'Contact hitters; gap power over pure HR sluggers', pitcherRisk:'Low — favorable for ground-ball and fly-ball pitchers alike' },
  'Oakland Coliseum':         { headline:'Massive foul territory and Bay Area marine air — historically MLB\'s best pitcher\'s park', bullets:['One of the largest foul territories in MLB — major pop-out advantage for pitchers','Dense Oakland Bay Area air further reduces fly-ball carry','Cavernous dimensions (LF 330, CF 400, RF 330 with very deep alleys)'], hitterEdge:'Minimal — one of the most pitcher-friendly environments in baseball', pitcherRisk:'Very low — historically elite for pitchers' },
  'Tropicana Field':          { headline:'Indoor dome with catwalks and turf — controlled but unique environment', bullets:['Fully enclosed dome eliminates all weather variables','Catwalks in play — balls hitting them remain in play per ground rules','Artificial turf boosts BABIP for ground-ball contact hitters'], hitterEdge:'Contact/speed hitters on turf; catwalks create unpredictable ball-in-play situations', pitcherRisk:'Low; turf slightly helps ground-ball defense' },
  'Comerica Park':            { headline:'Very deep CF and Great Lakes air suppress power significantly', bullets:['Very deep CF (420 ft) is among the deepest in MLB','Great Lakes cool air suppresses fly-ball carry','LF (345) and RF (330) are deeper than most parks'], hitterEdge:'Doubles/gap hitters; HR-reliant hitters face significant suppression', pitcherRisk:'Low — particularly suppressive for fly-ball-prone pitchers' },
  'Sahlen Field':             { headline:'Cold Buffalo air and Lake Erie proximity suppress power, especially early season', bullets:['Cold Lake Erie air extends deep into spring — suppresses carry throughout early months','Standard dimensions but cold air meaningfully reduces HR output'], hitterEdge:'Contact hitters; power production suppressed especially early season', pitcherRisk:'Low in cold conditions; neutral in summer' },
};

// ─── PA INDEX ─────────────────────────────────────────────────────────────
// Combines raw PA (sample size) with PA relative to team average (role).
// absComp: is the sample large enough to trust the stats?
// relComp: does this player get more/fewer PAs than their teammates?
// Returns { adj, label, type } or null if no meaningful signal.
// ─── PA SCORING CONFIG (tune values here) ─────────────────────────────────
const PA_CFG = {
  role: [
    { min: 0.80, score:  4 },
    { min: 0.65, score:  3 },
    { min: 0.50, score:  2 },
    { min: 0.35, score:  1 },
    { min: 0.20, score:  0 },
    { min: 0.10, score: -2 },
    { min: 0,    score: -4 },
  ],
  recentUsage: [
    { min: 29, score:   6 },  // 29+ AB — very strong everyday usage
    { min: 23, score:   3 },  // 23–28 AB — strong everyday usage
    { min: 17, score:  -3 },  // 17–22 AB — below-avg volume
    { min: 11, score:  -6 },  // 11–16 AB — below-avg opportunity
    { min:  6, score: -10 },  // 6–10 AB — limited role / bench
    { min:  1, score: -12 },  // 1–5 AB — bench/platoon/injury concern
    { min:  0, score: -18 },  // 0 AB — not playing
  ],
};
