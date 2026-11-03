// Viral Path rules as pure functions over plain data. The server (service.js)
// runs them inside one compare-and-swap write of the game doc, so every host
// step applies to all teams at once or not at all.
//
// game.teams is a map slug -> team. Every function here mutates the game it is
// given; callers pass a fresh copy (service.js uses structuredClone).
import { CFG, PROFILES, TAGS, FLOP, band, BAND_NAME, STRATS, buildPath, FORK1, fork2Index, TEAM_COLORS } from './rules.js';
import { CARDS, BRAND_FLOPS, INFL_FLOPS, OPEN_EVENTS, LAUNCH_AD_VARIANTS, titleOf } from './cards.js';

export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '')
  .trim().replace(/[\s-]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);

const pick = (a, rng) => a[Math.floor(rng() * a.length)];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const money = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
export const pathOf = t => buildPath(t.c1, t.c2);
export const spaceOf = t => pathOf(t)[t.pos];
export const lengthOf = t => pathOf(t).length - 1;
export const progressOf = t => t.pos / lengthOf(t);
const teamsOf = game => Object.values(game.teams);
const nameOf = t => t.name;

function say(game, text) {
  game.log.unshift({ r: game.round, text });
  if (game.log.length > 80) game.log.length = 80;
}

// ------------------------------------------------------------------ setup

export function newGame(now = Date.now(), rng = Math.random) {
  return {
    id: Math.floor(rng() * 36 ** 8).toString(36).padStart(8, '0'),
    phase: 'lobby', round: 0, rounds: CFG.rounds, closing: null,
    trend: null, stamp: 0, step: 0, trails: {},
    teams: {}, offers: [], event: null, finishOrder: [], partnerships: [], flopLog: [],
    log: [], winner: null, code: '', createdAt: now, updatedAt: now,
  };
}

export function newTeam(game, { name, profile, tag, bot = null }, now = Date.now(), rng = Math.random) {
  const display = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const slug = slugify(display);
  if (!slug) throw new GameError('Enter a team name with at least one letter or number');
  const p = PROFILES[profile];
  if (!p) throw new GameError('Pick a profile');
  if (p.role === 'infl' && !TAGS.includes(tag)) throw new GameError('Pick a trend tag');
  const index = Object.keys(game.teams).length;
  return {
    slug, name: display, profile, role: p.role, tag: p.role === 'infl' ? tag : null, bot,
    color: TEAM_COLORS[index % TEAM_COLORS.length],
    money: p.money, start: p.money, att: p.att, trust: p.trust, gain: p.gain, risk: 1,
    pos: 0, c1: null, c2: null, pref1: null, pref2: null, paid: [], finished: null,
    contracts: [], past: [], flops: [], fromOthers: { att: 0, spaces: 0 },
    history: [], cur: {}, backlashes: 0, lastRoll: 0, joinedAt: now,
  };
}

export function addTeam(game, opts, now, rng) {
  if (game.phase === 'finished') throw new GameError('The game is over. Ask the host to reset it.');
  const t = newTeam(game, opts, now, rng);
  if (game.teams[t.slug]) return game.teams[t.slug];  // a teammate's phone, or a reload: rejoin
  if (Object.keys(game.teams).length >= CFG.maxTeams) throw new GameError('This game is full');
  game.teams[t.slug] = t;
  say(game, `${t.name} joined as a ${t.profile} ${t.role === 'brand' ? 'brand' : 'influencer'}.`);
  return t;
}

const BOT_NAMES = { brand: ['Gumdrop Co.', 'Fizzwhistle', 'Crunchmallow', 'Taffy & Sons', 'Sugarloaf', 'Brittle Bros'], infl: ['@sprinklesam', '@taffytalks', '@chewchoo', '@lollilena', '@fudgefox', '@mintymo'] };
const BOT_STRATS = ['Smart', 'Bold', 'Cautious', 'Smart', 'Random'];

export function addBots(game, role, count, now, rng) {
  const added = [];
  for (let i = 0; i < count; i++) {
    const name = BOT_NAMES[role].find(n => !game.teams[slugify(n)]);
    if (!name) break;
    const nBots = teamsOf(game).filter(t => t.bot).length;
    const profile = role === 'brand' ? pick(['Heritage', 'Challenger'], rng) : pick(['Niche', 'Mass'], rng);
    added.push(addTeam(game, { name, profile, tag: pick(TAGS, rng), bot: BOT_STRATS[nBots % BOT_STRATS.length] }, now, rng));
  }
  return added;
}

export function startGame(game) {
  if (game.phase !== 'lobby') throw new GameError('The game has already started');
  if (!Object.keys(game.teams).length) throw new GameError('Wait for at least one team to join');
  game.phase = 'ready';
  game.round = 1;
  say(game, 'The race is on. Round 1.');
}

// ------------------------------------------------------------------ movement

function chooseFork(t, which, rng) {
  if (!t.bot) return (which === 1 ? t.pref1 : t.pref2) || 'quiet';
  const s = STRATS[t.bot].fork;
  if (s === 'random') return pick(['quiet', 'viral'], rng);
  if (s === 'adaptive') return t.risk <= 1 ? 'viral' : 'quiet';
  return s;
}

function advance(game, t, n, trail, rng) {
  for (let i = 0; i < n; i++) {
    if (t.finished) return;
    const nxt = t.pos + 1;
    if (!t.c1 && nxt > FORK1) {
      t.c1 = chooseFork(t, 1, rng);
      if (t.c1 === 'viral') { t.risk += 1; say(game, `${t.name} took the viral road at the first fork (+1 risk).`); }
    }
    if (t.c1 && !t.c2 && nxt > fork2Index(t.c1)) {
      t.c2 = chooseFork(t, 2, rng);
      if (t.c2 === 'viral') { t.risk += 1; say(game, `${t.name} took the viral road at the second fork (+1 risk).`); }
    }
    t.pos = nxt;
    trail.push(t.pos);
    const sp = spaceOf(t);
    if ((sp.type === 'Payday' || sp.type === 'Finish') && !t.paid.includes(sp.key)) {
      t.paid.push(sp.key);
      const pay = t.att * t.trust * CFG.paydayMult;
      t.money += pay;
      say(game, `${t.name} hit a payday: ${t.att} attention × ${t.trust} trust = ${money(pay)}.`);
    }
    if (sp.type === 'Finish') {
      t.finished = { round: game.round, stamp: game.stamp, left: n - i - 1 };
      game.finishOrder.push(t.slug);
      say(game, `🏁 ${t.name} reached the finish!`);
      return;
    }
  }
}

function move(game, t, n, rng) {
  const trail = [];
  if (n >= 0) advance(game, t, n, trail, rng);
  else if (!t.finished) for (let i = 0; i < -n && t.pos > 0; i++) { t.pos -= 1; trail.push(t.pos); }
  return trail;
}

function addTrail(game, t, trail) {
  if (!trail.length) return;
  (game.trails[t.slug] = game.trails[t.slug] || []).push(...trail);
}

function beginStep(game) {
  game.step += 1;
  game.stamp += 1;
  game.trails = {};
}

// ------------------------------------------------------------------ roll

export function rollAll(game, rng = Math.random) {
  if (game.phase !== 'ready') throw new GameError('You can roll once the round is ready');
  beginStep(game);
  for (const t of teamsOf(game)) {
    t.cur = { roll: null, riskBefore: t.risk };
    if (t.finished) continue;
    const r = 1 + Math.floor(rng() * 6);
    t.lastRoll = r;
    t.cur.roll = r;
    const trail = move(game, t, r, rng);
    let note = `${t.name} rolled ${r}`;
    if (!t.finished && t.risk > r) {
      t.trust = Math.max(1, t.trust - 1);
      t.att = Math.max(0, t.att - 10);
      t.risk = Math.max(0, t.risk - 2);
      t.backlashes += 1;
      t.cur.backlash = true;
      trail.push(...move(game, t, -CFG.backlashSlide, rng));
      note += `: BACKLASH, risk beat the roll (−1 trust, −10 attention, back ${CFG.backlashSlide})`;
    }
    t.cur.riskAfter = t.risk;
    addTrail(game, t, trail);
    say(game, note + '.');
  }
  game.trend = pick(TAGS, rng);
  game.offers = [];
  game.event = null;
  game.phase = 'deals';
  say(game, `Trending this round: ${game.trend}.`);
}

// ------------------------------------------------------------------ deals

export const inRange = (brand, infl) => spaceOf(brand).type === 'Deal' || Math.abs(brand.pos - infl.pos) <= CFG.offerRange;
const buyPrice = t => CFG.buy[t.role];

// A team's deal-window choices. Brands may make one offer per round.
export function checkDeal(game, t, act) {
  if (game.phase !== 'deals' || game.closing === 'deals') throw new GameError('The deal window is closed');
  const buy = Math.max(0, Math.floor(Number(act.buy) || 0));
  if (buy > t.risk) throw new GameError(`You only have ${t.risk} risk to buy down`);
  const pref = v => (v === 'viral' || v === 'quiet' ? v : null);
  const out = { buy, pref1: pref(act.pref1), pref2: pref(act.pref2), offer: null };
  let spend = buy * buyPrice(t);
  if (act.offer && act.offer.to) {
    if (t.role !== 'brand') throw new GameError('Only brands make offers');
    if (t.contracts.length >= 2) throw new GameError('You already hold two contracts');
    const infl = game.teams[act.offer.to];
    if (!infl || infl.role !== 'infl') throw new GameError('That influencer is not in the game');
    if (infl.contracts.length >= 2) throw new GameError(`${infl.name} is fully booked`);
    if (!inRange(t, infl)) throw new GameError(`${infl.name} is more than ${CFG.offerRange} spaces away. Stand on a Deal space to reach anyone.`);
    const amt = Math.round(Number(act.offer.amt) / 500) * 500;
    if (!(amt >= 1000)) throw new GameError('Offer at least $1,000');
    spend += amt;
    out.offer = { to: infl.slug, amt };
  }
  if (spend > t.money) throw new GameError(`That costs ${money(spend)} and you have ${money(t.money)}`);
  return out;
}

function botDeal(game, t, rng) {
  const s = STRATS[t.bot];
  const out = { buy: 0, offer: null };
  if (t.risk >= s.buyAt) {
    const reserve = t.role === 'brand' ? CFG.fee : 0;
    out.buy = Math.min(t.risk - 1, Math.max(0, Math.floor((t.money - reserve) / buyPrice(t))));
  }
  if (t.role === 'brand' && t.contracts.length < 1) {
    const amt = s.offer || (rng() < 0.5 ? 6000 + 1000 * Math.floor(rng() * 5) : 0);
    if (amt && t.money - out.buy * buyPrice(t) >= amt) {
      const pool = teamsOf(game).filter(i => i.role === 'infl' && i.contracts.length < 2 && inRange(t, i) && (t.bot !== 'Cautious' || i.trust >= 5));
      if (pool.length) {
        const target = t.bot === 'Random' ? pick(pool, rng)
          : pool.sort((x, y) => (y.tag === game.trend) - (x.tag === game.trend) || y.att - x.att)[0];
        out.offer = { to: target.slug, amt };
      }
    }
  }
  return out;
}

// Deal window -> final call. Applies buy-downs and road choices, collects
// offers, and tells brands when their influencer has more than one.
export function finalCall(game, acts, rng = Math.random) {
  if (game.phase !== 'deals') throw new GameError('Open the deal window first');
  const offers = [];
  for (const t of teamsOf(game)) {
    let act = t.bot ? botDeal(game, t, rng) : acts[t.slug];
    if (!act) continue;
    if (!t.bot) { try { act = checkDeal({ ...game, closing: null }, t, act); } catch { continue; } }
    if (act.pref1 && !t.c1) t.pref1 = act.pref1;
    if (act.pref2 && !t.c2) t.pref2 = act.pref2;
    if (act.buy) {
      t.money -= act.buy * buyPrice(t);
      t.risk -= act.buy;
      say(game, `${t.name} bought down ${act.buy} risk for ${money(act.buy * buyPrice(t))}.`);
    }
    if (act.offer && t.money >= act.offer.amt) offers.push({ brand: t.slug, infl: act.offer.to, amt: act.offer.amt, notice: false, raised: false });
  }
  const count = {};
  for (const o of offers) count[o.infl] = (count[o.infl] || 0) + 1;
  for (const o of offers) {
    o.notice = count[o.infl] > 1;
    const b = game.teams[o.brand];
    b.cur.offerMade = o.amt;
    if (o.notice && b.bot && STRATS[b.bot].raise && b.money >= o.amt + STRATS[b.bot].raise) {
      o.amt += STRATS[b.bot].raise;
      o.raised = true;
    }
  }
  for (const slug of Object.keys(count)) if (count[slug] > 1) say(game, `${game.teams[slug].name} is considering multiple offers.`);
  game.offers = offers;
  game.phase = 'final';
}

export function checkFinal(game, t, act) {
  if (game.phase !== 'final' || game.closing === 'final') throw new GameError('The final call is over');
  if (t.role === 'brand') {
    const o = game.offers.find(o => o.brand === t.slug);
    if (!o || !o.notice) throw new GameError('You can only raise when your influencer has more than one offer');
    if (o.raised) throw new GameError('You already raised once');
    const amt = Math.round(Number(act.raise) / 500) * 500;
    if (!(amt >= o.amt)) throw new GameError(`Raise to at least ${money(o.amt)}`);
    if (amt > t.money) throw new GameError(`You only have ${money(t.money)}`);
    return { raise: amt };
  }
  const mine = game.offers.filter(o => o.infl === t.slug).map(o => o.brand);
  const accept = [...new Set((act.accept || []).filter(b => mine.includes(b)))];
  if (accept.length > 2 - t.contracts.length) throw new GameError(`You can take ${2 - t.contracts.length} more contract${2 - t.contracts.length === 1 ? '' : 's'}`);
  return { accept };
}

// Final call -> contracts signed.
export function closeDeals(game, acts, rng = Math.random) {
  if (game.phase !== 'final') throw new GameError('Run the final call first');
  for (const o of game.offers) {
    const b = game.teams[o.brand], a = acts[o.brand];
    if (!b.bot && a && o.notice && !o.raised) {
      try { const c = checkFinal({ ...game, closing: null }, b, a); o.amt = c.raise; o.raised = true; } catch { /* keep the first offer */ }
    }
  }
  const signed = [];
  for (const infl of teamsOf(game).filter(t => t.role === 'infl')) {
    const list = game.offers.filter(o => o.infl === infl.slug).sort((a, b) => b.amt - a.amt || rng() - 0.5);
    if (!list.length) continue;
    const room = 2 - infl.contracts.length;
    let chosen;
    if (infl.bot) chosen = list.slice(0, infl.bot === 'Bold' ? room : Math.min(1, room)).map(o => o.brand);
    else {
      let a = acts[infl.slug];
      try { a = a ? checkFinal({ ...game, closing: null }, infl, a) : { accept: [] }; } catch { a = { accept: [] }; }
      chosen = a.accept;
    }
    for (const o of list) {
      const b = game.teams[o.brand];
      const ok = chosen.includes(o.brand) && b.money >= o.amt && b.contracts.length < 2 && infl.contracts.length < 2;
      game.partnerships.push({ round: game.round, brand: o.brand, infl: infl.slug, amt: o.amt, signed: ok });
      if (!ok) { say(game, `${infl.name} passed on ${b.name}'s offer.`); continue; }
      b.money -= o.amt;
      infl.money += o.amt;
      if (infl.trust <= 3) b.risk += 1;
      if (b.past.includes(infl.slug)) {
        b.trust = Math.min(10, b.trust + 1);
        infl.trust = Math.min(10, infl.trust + 1);
        say(game, `${b.name} and ${infl.name} teamed up again (+1 trust each).`);
      }
      if (!b.past.includes(infl.slug)) b.past.push(infl.slug);
      if (!infl.past.includes(b.slug)) infl.past.push(b.slug);
      b.contracts.push({ partner: infl.slug, left: 2 });
      infl.contracts.push({ partner: b.slug, left: 2 });
      b.cur.offerSelected = true;
      infl.cur.signed = (infl.cur.signed || 0) + 1;
      signed.push(`${b.name} signed ${infl.name} for ${money(o.amt)}`);
    }
  }
  signed.forEach(s => say(game, s + '.'));
  if (!signed.length) say(game, 'No contracts were signed this round.');
  game.phase = 'dealt';
}

// ------------------------------------------------------------------ events

function botTargetResponse(t, rng) {
  const s = STRATS[t.bot].target;
  if (s === 'random') return [pick(Object.keys(FLOP), rng), 'random pick'];
  if (s === 'trust') return [['Lean in', 'Ignore', 'Apologize'][band(t.trust)], `its trust is ${BAND_NAME[band(t.trust)]}`];
  return [{ lean: 'Lean in', apologize: 'Apologize' }[s], STRATS[t.bot].why];
}
function botReaction(t, target, rng) {
  const s = STRATS[t.bot].react;
  if (s === 'random') return [pick(['Support', 'Critique', 'Out'], rng), 'random pick'];
  if (s === 'adaptive') {
    if (band(target.trust) === 0) return ['Support', `${target.name} has High trust and may lean in`];
    return t.risk <= 0 || t.money >= CFG.buy[t.role] * 2 ? ['Critique', 'it can afford the extra risk'] : ['Support', "it can't afford more risk"];
  }
  return [{ critique: 'Critique', support: 'Support' }[s], STRATS[t.bot].why];
}
const botJoins = (t, rng) => ({ critique: true, support: true, adaptive: t.risk <= 2, random: rng() < 0.5 }[STRATS[t.bot].react]);
const botDelayMs = (t, rng) => { const [a, b] = STRATS[t.bot].speed; return Math.round((a + rng() * (b - a)) * 1000); };

export function fireEvent(game, now = Date.now(), rng = Math.random) {
  if (game.phase !== 'dealt') throw new GameError('Close the deals first');
  const live = teamsOf(game).filter(t => !t.finished);
  const onEvent = live.filter(t => spaceOf(t).type === 'Event');
  let target = null, card, minors = [];
  if (game.round === 1) {
    const brands = live.filter(t => t.role === 'brand');
    const pool = brands.length ? brands : live;
    target = pool.length ? pick(pool, rng) : null;
    card = brands.length ? 'Tiny Bite' : 'Missing Disclosure';
    minors = onEvent.filter(t => t !== target);
  } else if (onEvent.length) {
    target = onEvent.slice().sort((a, b) => a.lastRoll - b.lastRoll || rng() - 0.5)[0];
    card = pick(target.role === 'brand' ? BRAND_FLOPS : INFL_FLOPS, rng);
    if (card === 'Launch Ad') card = pick(LAUNCH_AD_VARIANTS, rng);
    minors = onEvent.filter(t => t !== target);
  }
  if (!target) card = pick(OPEN_EVENTS, rng);
  for (const t of minors) {
    t.att += 5; t.risk += 1;
    say(game, `${t.name} landed on an event space: minor buzz (+5 attention, +1 risk).`);
  }
  const c = CARDS[card];
  const bots = {};
  for (const t of live.filter(t => t.bot)) {
    if (c.kind === 'flop') {
      if (t === target) { const [choice, why] = botTargetResponse(t, rng); bots[t.slug] = { choice, why, at: now + botDelayMs(t, rng) }; }
      else { const [choice, why] = botReaction(t, target, rng); bots[t.slug] = { choice, why, at: now + botDelayMs(t, rng) }; }
    } else if (card === 'Meme Format') {
      bots[t.slug] = { choice: botJoins(t, rng) ? 'Join' : 'Out', why: STRATS[t.bot].why, at: now + botDelayMs(t, rng) };
    }
  }
  game.event = {
    card, title: titleOf(card), kind: c.kind, target: target ? target.slug : null,
    openedAt: now, closesAt: now + CFG.reactionSeconds * 1000, bots, result: null,
  };
  game.phase = 'event';
  say(game, target ? `Event: ${titleOf(card)} hits ${target.name}.` : `Event: ${titleOf(card)}.`);
}

// Which choices a team has in the open event window, or [] if none.
export function choicesFor(game, t) {
  const e = game.event;
  if (!e || t.finished) return [];
  if (e.kind === 'flop') return e.target === t.slug ? Object.keys(FLOP) : ['Support', 'Critique', 'Out'];
  if (e.card === 'Meme Format') return ['Join', 'Out'];
  return [];
}

export function checkReaction(game, t, act, now) {
  if (game.phase !== 'event' || game.closing === 'event') throw new GameError('The reaction window is closed');
  if (now > game.event.closesAt + CFG.graceMs) throw new GameError('Time ran out for this event');
  const options = choicesFor(game, t);
  if (!options.includes(act.choice)) throw new GameError('That choice is not available');
  return { choice: act.choice, at: now };
}

export function resolveEvent(game, acts, now = Date.now(), rng = Math.random) {
  if (game.phase !== 'event') throw new GameError('Fire an event first');
  beginStep(game);
  const e = game.event, c = CARDS[e.card];
  const deadline = e.closesAt + CFG.graceMs;
  const live = teamsOf(game).filter(t => !t.finished);
  // humans: their locked-in act if it came in on time; bots: precomputed
  const choiceOf = t => {
    if (t.bot) return e.bots[t.slug] || null;
    const a = acts[t.slug];
    return a && a.at <= deadline ? a : null;
  };
  const lines = [];
  const result = { response: null, reactions: [], lines, targetGain: 0, reactorGain: 0 };

  if (c.kind === 'flop') {
    const target = game.teams[e.target];
    const bandIn = band(target.trust), trustIn = target.trust;
    const ta = choiceOf(target);
    const response = ta ? ta.choice : 'Ignore';
    const f = FLOP[response];
    const dAtt = response === 'Delete' && c.deleteNoAttention ? 0 : f.att;
    const dTrust = f.trust[bandIn];
    target.att += dAtt;
    target.trust = clamp(target.trust + dTrust, 1, 10);
    target.risk = Math.max(0, target.risk + f.risk);
    if (c.sharesTrust) for (const k of target.contracts) {
      const p = game.teams[k.partner];
      if (p && dTrust) { p.trust = clamp(p.trust + dTrust, 1, 10); lines.push(`${p.name} shares the trust change as the contracted brand.`); }
    }
    const step = CFG.stepTarget[response][bandIn];
    addTrail(game, target, move(game, target, step, rng));
    target.flops.push({ round: game.round, card: e.title, trustIn, response, dAtt, dTrust, step });
    target.cur.eventRole = 'target';
    target.cur.reaction = response;
    result.response = response;
    result.targetGain = dAtt;
    lines.push(`${target.name} chose ${response}${ta ? '' : ' (no answer counts as Ignore)'} at ${BAND_NAME[bandIn]} trust: +${dAtt} attention, ${dTrust >= 0 ? '+' : ''}${dTrust} trust, ${step >= 0 ? '+' : ''}${step} spaces.`);

    const reactions = live.filter(t => t !== target).map(t => ({ t, a: choiceOf(t) }))
      .filter(x => x.a && x.a.choice !== 'Out').sort((x, y) => x.a.at - y.a.at);
    for (const t of live) if (t !== target) { t.cur.eventRole = 'reactor'; t.cur.reaction = 'Out'; }
    reactions.forEach(({ t, a }, i) => {
      const bonus = CFG.speedBonus[i] || 0;
      let steps, gain;
      if (a.choice === 'Support') { gain = 5; steps = CFG.stepSupport; }
      else {
        gain = 10; steps = CFG.stepCritique; t.risk += 2;
        if (response === 'Lean in' && bandIn === 0) t.trust = Math.max(1, t.trust - 1);
      }
      t.att += gain;
      t.fromOthers.att += gain;
      t.fromOthers.spaces += steps + bonus;
      t.cur.reaction = a.choice;
      result.reactorGain += gain;
      addTrail(game, t, move(game, t, steps + bonus, rng));
      const secs = ((a.at - e.openedAt) / 1000).toFixed(1);
      result.reactions.push({ slug: t.slug, choice: a.choice, secs, bonus });
      lines.push(`${t.name} ${a.choice === 'Support' ? 'supported' : 'critiqued'} at ${secs}s${bonus ? ` (+${bonus} speed bonus)` : ''}` +
        (a.choice === 'Critique' && response === 'Lean in' && bandIn === 0 ? ', and lost 1 trust because the target leaned in at High trust' : '') + '.');
    });
    game.flopLog.push({ round: game.round, card: e.title, target: target.slug, response, trustIn, targetGain: dAtt, reactorGain: result.reactorGain });
  } else if (e.card === 'Meme Format') {
    const joins = live.map(t => ({ t, a: choiceOf(t) })).filter(x => x.a && x.a.choice === 'Join').sort((x, y) => x.a.at - y.a.at);
    joins.forEach(({ t, a }, i) => {
      const bonus = CFG.speedBonus[i] || 0;
      t.att += 8; t.risk += 1;
      t.fromOthers.att += 8;
      t.fromOthers.spaces += CFG.stepJoin + bonus;
      t.cur.reaction = 'Join';
      addTrail(game, t, move(game, t, CFG.stepJoin + bonus, rng));
      const secs = ((a.at - e.openedAt) / 1000).toFixed(1);
      result.reactions.push({ slug: t.slug, choice: 'Join', secs, bonus });
      lines.push(`${t.name} joined the meme at ${secs}s${bonus ? ` (+${bonus} speed bonus)` : ''}.`);
    });
    if (!joins.length) lines.push('Nobody joined the meme.');
  } else if (e.card === 'Algorithm Shift') {
    for (const t of teamsOf(game)) if (t.role === 'brand' && t.contracts.length && !t.contracts.some(k => game.teams[k.partner]?.tag === game.trend)) {
      t.att = Math.max(0, t.att - 5);
      lines.push(`${t.name} lost 5 attention to the algorithm shift.`);
    }
    if (!lines.length) lines.push('No contracted brand was hurt this time.');
  } else if (e.card === 'Trend Spike') {
    for (const t of teamsOf(game)) if (t.role === 'infl' && t.tag === game.trend) { t.att += 10; lines.push(`${t.name} rides the ${game.trend} spike (+10 attention).`); }
    if (!lines.length) lines.push(`No influencer had the ${game.trend} tag.`);
  }
  lines.forEach(l => say(game, l));
  e.result = result;
  endRound(game);
  game.phase = 'results';
}

function endRound(game) {
  const teams = teamsOf(game);
  for (const t of teams) {
    t.att += t.gain;
    for (const k of t.contracts) {
      const p = game.teams[k.partner];
      if (!p) continue;
      if (t.role === 'brand') t.att += p.tag === game.trend ? p.att : Math.floor(p.att / 2);
      else t.att += 3;
    }
    if (t.role === 'infl' && t.contracts.length >= 2) { t.trust = Math.max(1, t.trust - 1); say(game, `${t.name} holds two contracts (−1 trust).`); }
  }
  for (const t of teams) {
    t.contracts.forEach(k => { k.left -= 1; });
    t.contracts = t.contracts.filter(k => k.left > 0);
    t.att = clamp(t.att, 0, 100);
    t.att -= Math.floor(t.att / 4);
    t.history.push({ round: game.round, ...t.cur, pos: t.pos, att: t.att, trust: t.trust, money: t.money - t.start });
    t.cur = {};
  }
  say(game, 'Attention faded by a quarter. Leaderboards updated.');
}

// ------------------------------------------------------------------ round flow

export function nextRound(game) {
  if (game.phase !== 'results') throw new GameError('Finish this round first');
  if (game.round >= game.rounds) throw new GameError('That was the last round. Extend or finish the game.');
  game.round += 1;
  game.phase = 'ready';
  game.event = null;
  game.trails = {};
  say(game, `Round ${game.round}.`);
}

export function extendGame(game) {
  if (game.rounds >= CFG.maxRounds) throw new GameError(`The game is already ${CFG.maxRounds} rounds`);
  game.rounds = CFG.maxRounds;
  say(game, `The host extended the game to ${CFG.maxRounds} rounds.`);
}

export function payoutOf(game, slug) { return game.winner && game.winner.slug === slug ? CFG.prize : 0; }
export const netOf = (game, t) => t.money - t.start + payoutOf(game, t.slug);

export function finishGame(game, rng = Math.random) {
  if (game.phase === 'lobby' || game.phase === 'finished') throw new GameError('Nothing to finish');
  const teams = teamsOf(game);
  let winner = game.finishOrder.map(s => game.teams[s]).filter(Boolean)
    .sort((a, b) => a.finished.stamp - b.finished.stamp || b.finished.left - a.finished.left)[0];
  let how = 'reached the finish first';
  if (!winner && teams.length) {
    winner = teams.slice().sort((a, b) => progressOf(b) - progressOf(a) || rng() - 0.5)[0];
    how = 'got furthest along (no one finished)';
  }
  game.winner = winner ? { slug: winner.slug, how } : null;
  if (winner) say(game, `${winner.name} ${how} and wins ${money(CFG.prize)}.`);
  game.phase = 'finished';
  game.event = null;
}

export function removeTeam(game, slug) {
  if (!game.teams[slug]) throw new GameError('No such team');
  const name = game.teams[slug].name;
  delete game.teams[slug];
  for (const t of teamsOf(game)) t.contracts = t.contracts.filter(k => k.partner !== slug);
  game.offers = game.offers.filter(o => o.brand !== slug && o.infl !== slug);
  say(game, `${name} was removed by the host.`);
}

// One row per team per round, for the instructor's CSV.
export function csvRows(game) {
  const head = ['round', 'team', 'role', 'profile', 'bot', 'roll', 'risk_before', 'risk_after', 'backlash', 'offer_made', 'offer_selected', 'contracts_signed', 'event_role', 'choice', 'position', 'attention', 'trust', 'net_money'];
  const rows = [head];
  for (const t of teamsOf(game)) for (const h of t.history) {
    rows.push([h.round, t.name, t.role, t.profile, t.bot || '', h.roll ?? '', h.riskBefore ?? '', h.riskAfter ?? '', h.backlash ? 1 : 0,
      h.offerMade ?? '', h.offerSelected ? 1 : 0, h.signed ?? 0, h.eventRole ?? '', h.reaction ?? '', h.pos, h.att, h.trust, h.money]);
  }
  return rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
}
