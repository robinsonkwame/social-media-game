// Small helpers shared by the host and player screens.
import { CARDS } from './cards.js';
import { band, BAND_NAME } from './rules.js';
import { netOf, trustChangeOf, money, describeNextEvent } from './engine.js';
import { CFG, VERSION } from './rules.js';

export { money };
export const $ = id => document.getElementById(id);

// Fills the page footer with the release number.
export function showVersion() {
  const el = document.getElementById('version');
  if (el) el.textContent = `Viral Path v${VERSION}`;
}
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const roleName = r => (r === 'brand' ? 'brand' : 'influencer');
export const trustLabel = t => `${t}/10 ${BAND_NAME[band(t)]}`;

export const PHASE_LABEL = {
  lobby: 'Waiting to start', ready: 'Waiting for the roll', deals: 'Deal window', final: 'Final call',
  dealt: 'Contracts signed', event: 'Reaction window', results: 'Round results', finished: 'Game over',
};

// The true-story panel behind Learn more, and the reveal after an event.
export function storyHtml(cardKey, showReal) {
  const c = CARDS[cardKey];
  if (!c) return '';
  return `<div class="story"><div class="eyebrow">True story · ${esc(c.story)}</div><ul>${c.learn.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="small"><a href="${c.source[1]}" target="_blank" rel="noopener">${esc(c.source[0])}</a></div></div>` +
    (showReal ? `<div class="story real"><div class="eyebrow">What really happened</div><div>${esc(c.real)}</div><div class="lesson">${esc(c.lesson)}</div></div>` : '');
}

// "+1", "−2", or "±0" for a change since the start.
export const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
export const deltaHtml = n => `<span class="delta ${n > 0 ? 'up' : n < 0 ? 'down' : ''}">${signed(n)}</span>`;

// Leaderboard for one role, ranked by profit (prize included once awarded).
export function leaderboard(game, role, meSlug, { compact = false } = {}) {
  const rows = Object.values(game.teams).filter(t => t.role === role).sort((a, b) => netOf(game, b) - netOf(game, a));
  if (!rows.length) return `<p class="small muted">No ${roleName(role)}s yet.</p>`;
  return `<table class="lb"><thead><tr><th>${role === 'brand' ? 'Brands' : 'Influencers'}</th><th>${term('cash')}</th><th>${term('profit')}</th><th>${term('attention', 'Att')}</th><th>${term('trust')}</th>${compact ? '' : `<th>${term('risk')}</th>`}<th>${term('space')}</th></tr></thead><tbody>${rows.map((t, i) => `
    <tr class="${t.slug === meSlug ? 'you' : ''}"><td>${game.phase === 'finished' && i === 0 ? '🏆 ' : ''}<span class="dot ${t.role}" style="background:${t.color}"></span>${esc(t.name)}<span class="tag">${t.slug === meSlug ? 'YOU' : t.bot ? `${t.bot.toUpperCase()} BOT` : ''}</span></td>
    <td>${money(t.money)}</td><td>${money(netOf(game, t))}</td><td>${t.att}</td><td>${t.trust} ${deltaHtml(trustChangeOf(t))}</td>${compact ? '' : `<td>${t.risk}</td>`}<td>${t.finished ? '🏁' : t.pos}</td></tr>`).join('')}</tbody></table>`;
}

export const MOVE_LINE = `Choices move pieces toward the ${money(CFG.prize)} finish: each button shows how many spaces. Your first tap is final, so read before you choose.`;

// "Next event" line shown from the roll until the card appears.
export function nextEventHtml(game, meSlug) {
  const line = describeNextEvent(game, meSlug);
  return line ? `<p class="small next-up"><b>Next event:</b> ${esc(line)}</p>` : '';
}

// What kind of card is up: aimed at one team, or for everyone.
export function eventKindHtml(game, meSlug) {
  const e = game.event;
  if (!e) return '';
  if (!e.target) return `<span class="chip">Affects everyone · nobody landed on an Event space</span>`;
  const who = e.target === meSlug ? 'you' : esc(game.teams[e.target]?.name || e.target);
  return `<span class="chip">Flop aimed at ${who}${e.reason === 'landed' ? ' · landed on an Event space' : e.reason === 'round1' ? ' · round 1 opener' : ''}</span>`;
}

export function feedHtml(game, n = 40) {
  return (game.log || []).slice(0, n).map(l => `<div><span class="r">R${l.r}</span>${esc(l.text)}</div>`).join('');
}

// ---------------------------------------------------------------- glossary
// Tap-to-learn explainers for the game's numbers. term() makes a word
// clickable anywhere; installGlossary() opens the card.

const B = CFG.buy;
export const GLOSSARY = {
  cash: {
    title: 'Cash',
    what: 'The money your team has right now. Brands start with $40,000 and influencers with $5,000. It never goes below $0.',
    up: ['Payday spaces and the finish: attention × trust × $100', 'Influencers: the fee when they sign a brand\'s deal'],
    down: ['Brands: paying an influencer\'s fee', `Buying down risk: ${money(B.brand)} a point for brands, ${money(B.infl)} for influencers`],
    win: ['maybe', 'Not by itself. Cash is what you spend on deals and on lowering risk. Spending is fine if it earns more back at your paydays. The score is profit.'],
  },
  profit: {
    title: 'Profit',
    what: `How much money you have made or lost since the start: your cash now minus your starting cash. The ${money(CFG.prize)} finish prize is added at the end.`,
    up: ['Everything that raises cash'],
    down: ['Everything that spends cash. Profit goes below zero after spending, and that\'s normal early on'],
    win: ['yes', 'Yes, this is the score. At the end, teams are ranked by profit against their own role (brands against brands, influencers against influencers).'],
  },
  attention: {
    title: 'Attention',
    what: 'How many eyes are on you, from 0 to 100. It comes fast and fades: a quarter of it disappears at the end of every round.',
    up: ['Your profile adds some every round', 'Event choices: +5 to +25', 'Brands borrow their influencer\'s attention: all of it when the influencer\'s tag is trending, half otherwise', 'Influencers get +3 a round for each contract'],
    down: ['Fades by a quarter each round', 'A backlash: −10'],
    win: ['yes', 'Yes, at paydays. A payday pays attention × trust × $100, so attention is worth most just before you reach one. It does not move your piece.'],
  },
  trust: {
    title: 'Trust',
    what: 'Whether people believe you, from 1 to 10. High is 7 or more, Mid is 4 to 6, Low is 3 or less. It is slow to build and slow to lose.',
    up: ['Lean in on your own flop while trust is High: +1', 'Sign the same partner again: +1 for both of you'],
    down: ['Delete: −1 · Ignore at Low trust: −1 · Lean in at Low trust: −2', 'A backlash: −1', 'Critique a High-trust team that leans in: −1', 'An influencer holding two deals: −1 a round'],
    win: ['yes', 'Yes, in two ways. It multiplies every payday, and it decides how your flop choices move you: Lean in is +3 spaces at High trust but −1 at Low.'],
  },
  risk: {
    title: 'Risk',
    what: `A wobbly candy stack. Everyone starts at 1. Each round a separate 1-${CFG.riskDie} risk check is rolled for you, and if your risk is higher, you get a backlash. Risk 2 is a 17% chance, 3 is 33%, 4 is 50%, 5 is 67%, 6 is 83%, and 7 or more is certain.`,
    up: ['Each viral road: +1', 'Lean in: +1 · Critique: +2 · Join a meme: +1', 'Landing on an Event space when another team gets the flop: +1', 'Brands signing a Low-trust influencer: +1'],
    down: ['Apologize: −1', 'A backlash: −2', `Buy it down in the deal window: ${money(B.brand)} a point for brands, ${money(B.infl)} for influencers`],
    win: ['no', 'No, it only hurts. Risk is the price of the bold moves that do help (viral roads, leaning in, critiquing). Decide whether a move is worth it, and lower risk before it bites.'],
  },
  backlash: {
    title: 'Backlash',
    what: 'What happens when your risk is higher than the risk check after the roll.',
    up: [],
    downLabel: 'What it does',
    down: ['−1 trust and −10 attention', `Your piece slides back ${CFG.backlashSlide} spaces`, 'Your risk drops by 2'],
    win: ['no', 'No. It costs spaces, trust and attention at once. Keeping risk low is how you avoid it.'],
  },
  space: {
    title: 'Space',
    what: 'Where your piece is on the track. The quiet roads make it 36 spaces to the castle, the viral roads 32.',
    up: [`The dice: 1-${CFG.diceSides} by default`, 'Event choices: each button shows how many spaces', 'Viral roads are shorter, but each adds 1 risk'],
    down: [`A backlash: back ${CFG.backlashSlide}`, 'Lean in at Low trust: back 1'],
    win: ['yes', `Yes. The first team to reach the castle wins ${money(CFG.prize)}, and if nobody does, the team furthest along wins it. Moving also takes you to payday spaces.`],
  },
  payday: {
    title: 'Payday',
    what: 'Payday spaces, and the finish, pay attention × trust × $100 the first time your piece lands on or passes them. Each route has four.',
    up: ['Raise attention and trust before you reach one'],
    down: ['Sliding back and passing a payday again pays nothing more'],
    win: ['yes', 'Yes. Besides the finish prize, paydays are the main way to make profit, so arrive with high attention and trust.'],
  },
  contract: {
    title: 'Deals and contracts',
    what: `A brand pays an influencer a fee (usually ${money(CFG.fee)}) to team up for two rounds. Each brand makes one offer a round; influencers choose between offers and can hold two.`,
    up: ['The brand gets the influencer\'s attention each round: all of it if their tag is trending, half if not', 'The influencer gets the fee in cash and +3 attention a round', 'Signing the same partner again: +1 trust for both'],
    down: ['The brand pays the fee', 'A brand signing a Low-trust influencer: +1 risk', 'An influencer holding two deals: −1 trust a round'],
    win: ['yes', 'Yes, for both sides. Influencers turn deals straight into profit. Brands pay now to get the attention that makes their paydays bigger.'],
  },
  trend: {
    title: 'Trend',
    what: 'One topic trends each round: Humor, Food, Fitness or Value. Every influencer has one of these as their tag.',
    up: ['A brand whose influencer\'s tag is trending gets all of that influencer\'s attention, not half', 'Trend Spike: +10 attention for influencers with the trending tag'],
    down: ['Algorithm Shift: brands with a contract but no trending partner lose 5 attention'],
    win: ['maybe', 'Sometimes. It doesn\'t score by itself, but it tells brands which influencer to sign this round.'],
  },
  dealSpace: {
    title: 'Deal space (D)',
    what: 'A space that widens who a brand can do business with.',
    upLabel: 'What happens',
    up: ['A brand standing on a Deal space after the roll can offer a contract to any influencer on the board that round', `Anywhere else, a brand can only offer to influencers within ${CFG.offerRange} spaces of it`],
    downLabel: 'What it doesn\'t do',
    down: ['Nothing extra for an influencer standing on it'],
    win: ['maybe', 'For brands, yes: it lets you sign the trending influencer even when they are far away. Influencers gain nothing here.'],
  },
  eventSpace: {
    title: 'Event space (E)',
    what: 'A space that can put your team at the center of the round\'s true-story flop.',
    upLabel: 'What happens',
    up: ['Of the teams that land on an Event space, the one with the lowest roll gets the round\'s flop aimed at it', 'The other teams on Event spaces get minor buzz: +5 attention and +1 risk', 'If nobody lands on one, the round\'s event affects everyone instead'],
    downLabel: 'What the flop can do',
    down: ['Lean in at High trust: +25 attention and +3 spaces', 'Lean in at Low trust: −2 trust and back 1 space', 'The other teams react to your flop and move too'],
    win: ['maybe', 'It can go either way. With High trust a flop is a chance to jump ahead; with Low trust it is a trap. Viral roads have more Event spaces.'],
  },
  talent: {
    title: 'Talent space (T)',
    what: 'In this version, a Talent space does nothing when you land on it. In the original board design it is where computer influencers wait for offers.',
    up: [], down: [],
    win: ['neutral', 'No. It is just a step along the road.'],
  },
  feed: {
    title: 'Feed space (F)',
    what: 'An ordinary day of posting. Nothing extra happens when you land here.',
    up: [], down: [],
    win: ['neutral', 'No. It is just a step along the road; your attention still grows by your profile\'s amount at the end of the round, like everyone\'s.'],
  },
  fork: {
    title: 'Fork (Y)',
    what: 'Where the road splits in two. There are two forks, and you choose a road at each one.',
    upLabel: 'How to choose',
    up: ['Pick Quiet or Viral in the deal window before your piece reaches the fork', 'If you don\'t pick, you take the quiet road'],
    downLabel: 'The two roads',
    down: ['Quiet road: 2 spaces longer, calmer, no extra risk', 'Viral road: 2 spaces shorter, more Event spaces, +1 risk'],
    win: ['maybe', 'It depends on your risk and trust. The viral road gets you to the prize sooner but raises your chance of a backlash and puts you in line for more flops.'],
  },
  viralRoad: {
    title: 'Viral road',
    what: 'The shortcut at each fork, drawn with pink stripes. Taking both makes the trip 32 spaces instead of 36.',
    upLabel: 'Good',
    up: ['2 spaces shorter at each fork', 'More Event spaces, so more chances at a flop that pays when your trust is High'],
    downLabel: 'Costly',
    down: ['+1 risk each time you take it', 'More Event spaces, so more chances at a flop that hurts when your trust is Low'],
    win: ['maybe', 'It can. It is the faster road to the finish prize, paid for in risk. Lower your risk first, or take it when your trust is High.'],
  },
  finish: {
    title: 'Finish (the castle)',
    what: `The end of the road. It counts as a payday too: attention × trust × $100.`,
    upLabel: 'What you win',
    up: [`The first team to get here wins the ${money(CFG.prize)} prize`, 'If nobody gets here by the last round, the team furthest along wins it', 'A team that finishes is safe from backlash and sits out later events'],
    down: [],
    win: ['yes', 'Yes. It is the one prize the whole class races for.'],
  },
  brand: {
    title: 'Brand (square piece)',
    what: 'A company. Brands start with $40,000 and are ranked against other brands.',
    upLabel: 'How brands earn',
    up: ['Paydays: attention × trust × $100', 'Signing influencers to borrow their attention, which makes paydays bigger', 'The finish prize'],
    downLabel: 'What brands spend',
    down: [`Influencer fees (usually ${money(CFG.fee)})`, `Lowering risk: ${money(CFG.buy.brand)} a point`],
    win: ['maybe', 'Your role decides who you are compared with. A brand wins by having the most profit among brands.'],
  },
  influencer: {
    title: 'Influencer (round piece)',
    what: 'A creator people follow. Influencers start with $5,000, have one trend tag, and are ranked against other influencers.',
    upLabel: 'How influencers earn',
    up: ['Fees from brand deals, paid straight into cash', 'Paydays: attention × trust × $100', 'The finish prize'],
    downLabel: 'What to watch',
    down: ['Holding two deals at once costs 1 trust a round', `Lowering risk: ${money(CFG.buy.infl)} a point`],
    win: ['maybe', 'Your role decides who you are compared with. An influencer wins by having the most profit among influencers.'],
  },
};
const TERM_ALIAS = { att: 'attention', money: 'cash', deal: 'contract', contracts: 'contract', trending: 'trend' };
const VERDICT = { yes: 'Helps you win', no: 'Works against you', maybe: 'Helps indirectly', neutral: 'No effect on winning' };

// A clickable game word. The label defaults to the glossary title.
export function term(key, label) {
  const k = TERM_ALIAS[key] || key;
  return `<button type="button" class="term" data-term="${k}" title="What is ${esc(GLOSSARY[k]?.title || k)}?">${esc(label ?? GLOSSARY[k]?.title ?? key)}</button>`;
}

function closeTerm() {
  const el = document.getElementById('termOverlay');
  if (!el) return;
  const back = el._from;
  el.remove();
  if (back?.isConnected) back.focus();
}

function openTerm(key, from) {
  const g = GLOSSARY[key];
  if (!g) return;
  closeTerm();
  const list = (label, items) => (items.length ? `<div class="eyebrow">${label}</div><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '');
  const el = document.createElement('div');
  el.className = 'overlay';
  el.id = 'termOverlay';
  el._from = from;
  el.innerHTML = `<div class="modal term-card stack" role="dialog" aria-modal="true" aria-labelledby="termTitle">
    <h2 id="termTitle">${esc(g.title)}</h2><p>${esc(g.what)}</p>
    ${list(g.upLabel || 'Goes up', g.up)}${list(g.downLabel || 'Goes down', g.down)}
    <div class="verdict ${g.win[0]}"><b>${VERDICT[g.win[0]]}.</b> ${esc(g.win[1])}</div>
    <div class="row"><button class="btn primary" type="button" data-close-term>Got it</button></div></div>`;
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close-term]')) closeTerm(); });
  document.body.appendChild(el);
  el.querySelector('[data-close-term]').focus();
}

export function installGlossary() {
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-term]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    openTerm(b.dataset.term, b);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeTerm();
    // the board key rows are SVG, not buttons, so give them Enter and Space
    const b = e.target.closest?.('[data-term]');
    if (b && b.tagName !== 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTerm(b.dataset.term, b); }
  });
}

export const HOW_TO = `
  <div class="howto">
    <p class="small muted" style="grid-column:1/-1;margin:0">Tap any <span class="term" style="cursor:default">underlined word</span> to see what it does and whether it helps you win.</p>
    <section><h3>The big idea</h3><ul>
      <li>Your team races along the candy track to the castle. <b>Brands</b> are companies; <b>influencers</b> are creators people follow.</li>
      <li>Each round: everyone rolls and moves, a topic starts trending, brands and influencers make deals, then <b>one event</b> happens. It's a <b>real social media flop</b> aimed at the team on an Event space with the lowest roll or, if nobody landed on one, an event for everyone.</li>
    </ul></section>
    <section><h3>How you move</h3><ul>
      <li><b>Dice:</b> roll 1-${CFG.diceSides} each round. The teacher (or you, in solo practice) can pick a bigger die.</li>
      <li><b>Event choices move you too.</b> If the flop is yours: Lean in <b>+3</b> at High trust, +1 at Mid, <b>−1</b> at Low · Apologize +1 · Ignore +1 (0 at Low) · Delete 0.</li>
      <li>Everyone else: Support <b>+${CFG.stepSupport}</b> · Critique <b>+${CFG.stepCritique}</b> · join a meme <b>+${CFG.stepJoin}</b> · stay out 0.</li>
      <li><b>Viral roads</b> are shorter but add 1 risk. A ${term('backlash')} slides you back ${CFG.backlashSlide}.</li>
    </ul></section>
    <section><h3>How you earn money</h3><ul>
      <li>${term('payday', 'Payday spaces')} (and the finish) pay <b>${term('attention')} × ${term('trust')} × $100</b>, so you need both.</li>
      <li><b>Influencers</b> are paid the fee when they sign a brand's deal.</li>
      <li><b>Brands</b> pay that fee, and in return borrow the influencer's attention for two rounds, which makes their paydays bigger.</li>
      <li>Buying down risk costs ${money(CFG.buy.brand)} a point for brands, ${money(CFG.buy.infl)} for influencers.</li>
    </ul></section>
    <section><h3>How you earn trust</h3><ul>
      <li>${term('trust', 'Trust')} runs 1-10: <b>High</b> is 7+, <b>Mid</b> 4-6, <b>Low</b> 1-3. It's slow to build and slow to lose.</li>
      <li><b>Gain +1:</b> lean in on your flop at High trust, or sign the same partner again (both of you).</li>
      <li><b>Lose:</b> Delete −1 · Ignore at Low −1 · Lean in at Low −2 · a backlash −1 · Critique a High-trust team that leans in −1 · an influencer holding two deals −1.</li>
    </ul></section>
    <section><h3>Attention and risk</h3><ul>
      <li>${term('attention')} comes from events (+5 to +25), your profile every round, and partners. A quarter of it fades each round.</li>
      <li>${term('risk')} is a wobbly candy stack. It grows with viral roads, Lean in, Critique and memes. Each round a separate 1-${CFG.riskDie} <b>risk check</b> is rolled: if your risk is higher, backlash (−1 trust, −10 attention, back ${CFG.backlashSlide}).</li>
    </ul></section>
    <section><h3>How to win</h3><ul>
      <li>The first team to reach the castle (${term('space', 'spaces')}) wins <b>${money(CFG.prize)}</b>. If nobody makes it, the team furthest along wins it.</li>
      <li>Leaning in pays big when your trust is High and pushes you back when it's Low.</li>
      <li>At the end, teams are ranked by ${term('profit', 'profit')} (money made since the start) against their own role.</li>
    </ul></section>
    <section><h3>How to work together</h3><ul>
      <li>${term('contract', 'Deals')}: a brand pays an influencer to team up for two rounds. The brand gets all of the influencer's attention if their topic is trending, half if not. The influencer gets the fee and extra attention.</li>
      <li><b>Support</b> a team in trouble: safe attention and a space. <b>Critique</b>: more attention and 2 spaces, but it adds risk.</li>
      <li>Tap <b>Learn more</b> to read the true story. It hints at the smart move.</li>
    </ul></section>
  </div>`;
