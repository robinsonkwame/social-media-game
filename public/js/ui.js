// Small helpers shared by the host and player screens.
import { CARDS } from './cards.js';
import { band, BAND_NAME } from './rules.js';
import { netOf, trustChangeOf, money, describeNextEvent } from './engine.js';
import { CFG } from './rules.js';

export { money };
export const $ = id => document.getElementById(id);
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
  return `<table class="lb"><thead><tr><th>${role === 'brand' ? 'Brands' : 'Influencers'}</th><th title="Money on hand to spend">Cash</th><th title="Money made or lost since the start. This is the score.">Profit</th><th>Att</th><th title="Trust now, and how much it has gone up or down since the start">Trust</th>${compact ? '' : '<th>Risk</th>'}<th>Space</th></tr></thead><tbody>${rows.map((t, i) => `
    <tr class="${t.slug === meSlug ? 'you' : ''}"><td>${game.phase === 'finished' && i === 0 ? '🏆 ' : ''}<span class="dot ${t.role}" style="background:${t.color}"></span>${esc(t.name)}<span class="tag">${t.slug === meSlug ? 'YOU' : t.bot ? `${t.bot.toUpperCase()} BOT` : ''}</span></td>
    <td>${money(t.money)}</td><td>${money(netOf(game, t))}</td><td>${t.att}</td><td>${t.trust} ${deltaHtml(trustChangeOf(t))}</td>${compact ? '' : `<td>${t.risk}</td>`}<td>${t.finished ? '🏁' : t.pos}</td></tr>`).join('')}</tbody></table>`;
}

export const SPEED_LINE = `Speed bonus: the first team to react moves ${CFG.speedBonus[0]} extra spaces and the second ${CFG.speedBonus[1]} extra. Spaces bring you closer to the $1,000,000 finish.`;
export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');

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

export const HOW_TO = `
  <div class="howto">
    <section><h3>The big idea</h3><ul>
      <li>Your team races along the candy track to the castle.</li>
      <li><b>Brands</b> are companies. <b>Influencers</b> are creators people follow.</li>
      <li>Each round: everyone rolls and moves, a topic starts trending, you make deals, then <b>one event</b> happens: a <b>real social media flop</b> aimed at the team on an Event space with the lowest roll, or, if nobody landed on one, an event that affects everyone.</li>
    </ul></section>
    <section><h3>Your four numbers</h3><ul>
      <li><b>Attention</b>: how many eyes are on you. Comes fast, fades a quarter every round.</li>
      <li><b>Trust</b>: whether people believe you. Slow to build, slow to lose.</li>
      <li><b>Money</b>: payday spaces pay attention × trust × $100.</li>
      <li><b>Risk</b>: a wobbly candy stack. If your risk is bigger than your roll, you get a backlash and slide back 3 spaces. Pay to shrink it.</li>
    </ul></section>
    <section><h3>How to win</h3><ul>
      <li>The first team to reach the castle wins <b>$1,000,000</b>. If nobody makes it, the team furthest along wins it.</li>
      <li>Good choices move you forward. <b>Speed bonus:</b> the first team to react to an event moves 2 extra spaces, the second 1 extra.</li>
      <li>Leaning in on a flop pays big when your trust is High, and pushes you back when it's Low.</li>
      <li>At the end, teams are ranked by money gained, against their own role.</li>
    </ul></section>
    <section><h3>How to work together</h3><ul>
      <li><b>Deals:</b> a brand pays an influencer to team up for two rounds. The brand borrows the influencer's attention (all of it if their topic is trending). The influencer gets the fee and extra attention.</li>
      <li>Team up with the same partner again and you both gain trust.</li>
      <li><b>Support</b> a team in trouble: safe attention and 1 space. <b>Critique</b>: more attention and 2 spaces, but it adds risk and backfires if they lean in with High trust.</li>
      <li>Tap <b>Learn more</b> to read the true story. It hints at the smart move, but the clock keeps running.</li>
    </ul></section>
  </div>`;
