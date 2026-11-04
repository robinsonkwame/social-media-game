// Balance values and the board. Numbers come from the simulation in
// sim/RESULTS.md; change them there first, then here.

// Shown at the bottom of every page. Bump it with each release you push.
export const VERSION = '1.1.0';

export const CFG = {
  rounds: 6, maxRounds: 8,
  prize: 50000,           // the finish prize; every screen reads it from here
  backlashSlide: 3,
  buy: { brand: 12000, infl: 4000 },
  paydayMult: 100,
  fee: 8000,
  // movement from choices; arrays are [High, Mid, Low] trust
  stepTarget: { 'Delete': [0, 0, 0], 'Apologize': [1, 1, 1], 'Ignore': [1, 1, 0], 'Lean in': [3, 1, -1] },
  stepSupport: 1, stepCritique: 2, stepJoin: 1,
  diceSides: 3,            // default movement die; the host can change it (diceChoices)
  diceChoices: [3, 4, 5, 6],
  riskDie: 6,              // the risk check is its own 1-6 roll, whatever the movement die
  reactionSeconds: 60,     // default; the host can change it (reactionChoices)
  reactionChoices: [30, 45, 60, 90, 120],
  graceMs: 1500,          // late reactions within this window still count (network lag)
  maxTeams: 40,
  offerRange: 4,          // brands may offer to influencers within this many spaces
};

export const PROFILES = {
  Heritage:   { role: 'brand', money: 40000, att: 10, trust: 8, gain: 3, blurb: 'Old, trusted name. Slow attention.' },
  Challenger: { role: 'brand', money: 40000, att: 20, trust: 7, gain: 6, blurb: 'Upstart brand. More buzz, a bit less trust.' },
  Niche:      { role: 'infl',  money: 5000,  att: 15, trust: 8, gain: 6, blurb: 'Small, loyal audience.' },
  Mass:       { role: 'infl',  money: 5000,  att: 25, trust: 6, gain: 8, blurb: 'Huge reach, shakier trust.' },
};
export const TAGS = ['Humor', 'Food', 'Fitness', 'Value'];

export const FLOP = { // attention, trust [High, Mid, Low], risk
  'Delete':    { att: 7,  trust: [-1, -1, -1], risk: 0 },
  'Apologize': { att: 10, trust: [0, 0, 0],    risk: -1 },
  'Ignore':    { att: 15, trust: [0, 0, -1],   risk: 0 },
  'Lean in':   { att: 25, trust: [1, 0, -2],   risk: 1 },
};
export const band = t => (t >= 7 ? 0 : t >= 4 ? 1 : 2);
export const BAND_NAME = ['High', 'Mid', 'Low'];

// Bot styles, also used to fill a short side in class.
export const STRATS = {
  Bold:     { fork: 'viral', target: 'lean', react: 'critique', buyAt: 99, speed: [1.5, 6], offer: 10000, raise: 4000, why: 'Bold bots chase attention fast' },
  Cautious: { fork: 'quiet', target: 'apologize', react: 'support', buyAt: 2, speed: [6, 16], offer: 8000, raise: 0, why: 'Cautious bots avoid risk' },
  Smart:    { fork: 'adaptive', target: 'trust', react: 'adaptive', buyAt: 3, speed: [3, 10], offer: 8000, raise: 2000, why: 'Smart bots weigh trust and risk' },
  Random:   { fork: 'random', target: 'random', react: 'random', buyAt: 99, speed: [2, 18], offer: 0, raise: 0, why: 'Random bots pick anything' },
};

// ---- board: 36 spaces on the quiet roads, 32 on the viral roads
export const SEGS = {
  trunk1: { types: ['Deal', 'Feed', 'Event', 'Talent', 'Feed', 'Payday', 'Deal', 'Fork'],
            pts: [[8, 53], [10, 43], [15, 34], [23, 27], [32, 22], [42, 18], [52, 16], [61, 18]] },
  f1q:    { types: ['Feed', 'Talent', 'Deal', 'Payday', 'Feed', 'Deal'],
            pts: [[70, 12], [79, 11], [87, 16], [91, 25], [89, 34], [83, 42]] },
  f1v:    { types: ['Event', 'Deal', 'Event', 'Payday'],
            pts: [[64, 26], [65, 33], [67, 40], [70, 46]] },
  trunk2: { types: ['Deal', 'Event', 'Talent', 'Payday', 'Feed', 'Fork'],
            pts: [[75, 52], [66, 57], [56, 60], [46, 61], [37, 58], [28, 57]] },
  f2q:    { types: ['Deal', 'Feed', 'Talent', 'Feed'],
            pts: [[19, 60], [11, 66], [10, 75], [16, 82]] },
  f2v:    { types: ['Event', 'Event'],
            pts: [[26, 66], [25, 74]] },
  trunk3: { types: ['Deal', 'Feed', 'Event', 'Talent', 'Feed', 'Deal', 'Feed', 'Feed', 'Event', 'Deal', 'Feed', 'Finish'],
            pts: [[24, 84], [33, 87], [42, 83], [48, 75], [56, 70], [65, 68], [74, 68], [83, 71], [89, 79], [86, 88], [77, 92], [66, 89]] },
};
export const START = { type: 'Start', x: 4, y: 63, key: 'start' };
export const FORK1 = 8;
export const fork2Index = c1 => 8 + (c1 === 'viral' ? 4 : 6) + 6;

export const seg = name => SEGS[name].types.map((type, i) => ({ type, x: SEGS[name].pts[i][0], y: SEGS[name].pts[i][1], key: `${name}-${i}` }));
const PATHS = {};
export function buildPath(c1, c2) {
  const k = `${c1 || 'quiet'}|${c2 || 'quiet'}`;
  if (!PATHS[k]) PATHS[k] = [START, ...seg('trunk1'), ...seg(c1 === 'viral' ? 'f1v' : 'f1q'), ...seg('trunk2'), ...seg(c2 === 'viral' ? 'f2v' : 'f2q'), ...seg('trunk3')];
  return PATHS[k];
}

export const TEAM_COLORS = ['#e3367a', '#2f8fd6', '#23a58a', '#f2a516', '#8a5cf0', '#ef6a3a', '#0fa3b1', '#b8336a', '#5c7cfa', '#7cb342', '#d9480f', '#9c36b5'];
