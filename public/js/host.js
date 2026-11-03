// The teacher's screen: controls on the left, and the projected board,
// event panel and leaderboards. The teacher decides when each step happens.
import { createApi, startPolling, isDebug } from './api.js';
import { createBoard } from './board.js';
import { CFG } from './rules.js';
import { CARDS } from './cards.js';
import { csvRows, netOf, money } from './engine.js';
import { $, esc, storyHtml, leaderboard, feedHtml, PHASE_LABEL, roleName } from './ui.js';

const api = await createApi();
const debug = isDebug();
const KEY = 'vp:hostKey';
let key = '';
try { key = localStorage.getItem(KEY) || ''; } catch { /* private mode */ }
let S = null, poller = null, busy = false, stageKey = '', armed = '';
const board = createBoard($('board'), $('legend'), { hopMs: 180 });
const joinUrl = () => `${location.origin}${location.pathname.replace(/host(\.html)?$/, '')}${debug ? '?debug=1' : ''}`;

$('modeChip').textContent = debug ? 'Simulated' : 'Live';
$('debugNote').hidden = !debug;

function needKey(message = '') {
  $('keyForm').hidden = false;
  $('hostUi').hidden = true;
  $('keyError').textContent = message;
}
$('keyForm').addEventListener('submit', e => {
  e.preventDefault();
  key = $('keyInput').value.trim();
  try { localStorage.setItem(KEY, key); } catch { /* private mode */ }
  $('keyError').textContent = '';
  start();
});

// ---------------------------------------------------------------- controls

// The one big next-step button for each phase, plus what it does.
const STEPS = {
  lobby: [['start', 'Start the game', 'Locks in teams and opens round 1. Late teams can still join.']],
  ready: [['roll', 'Roll the dice', 'Rolls for every team at once, moves the pieces, checks risk, and reveals the trend. Then the deal window opens.']],
  deals: [['finalCall', 'Start the final call', 'Applies risk buy-downs and road choices and collects offers. Brands whose influencer has several offers may raise once.']],
  final: [['closeDeals', 'Close deals', 'Influencers\' choices are final and contracts are signed.']],
  dealt: [['fire', 'Fire the next event', `Draws a true-story event card and opens a ${CFG.reactionSeconds}-second reaction window on every phone.`]],
  event: [['resolve', 'Close the event and score it', 'Applies everyone\'s choice, speed bonuses and movement, then ends the round.']],
};

function phaseButtons(g) {
  if (g.phase === 'results') {
    if (g.round < g.rounds) return [['next', `Start round ${g.round + 1}`, 'Clears the event and gets ready for the next roll.']];
    const out = [];
    if (g.rounds < CFG.maxRounds) out.push(['extend', `Extend to ${CFG.maxRounds} rounds`, 'Adds two more rounds.']);
    out.push(['finish', 'Finish the game', `Awards ${money(CFG.prize)} to the first team that finished (or the furthest along) and shows the participation code on every phone.`]);
    return out;
  }
  if (g.phase === 'finished') return [];
  return STEPS[g.phase] || [];
}

function renderControls() {
  const g = S.game;
  const teams = Object.values(g.teams);
  const humans = teams.filter(t => !t.bot);
  let status = '';
  if (g.phase === 'deals' || g.phase === 'final') status = `<p class="small muted">${S.submitted.length} of ${humans.length} team${humans.length === 1 ? '' : 's'} sent choices.</p>`;
  if (g.phase === 'event') status = `<p class="small muted">${S.submitted.length} of ${humans.filter(t => !t.finished).length} teams answered.</p>`;
  $('phaseActions').innerHTML = `<div class="eyebrow">${esc(PHASE_LABEL[g.phase] || g.phase)}${g.round ? ` · round ${g.round} of ${g.rounds}` : ''}</div>` + status +
    phaseButtons(g).map(([a, label, hint], i) => `<button class="btn ${i === phaseButtons(g).length - 1 ? 'primary' : ''}" data-action="${a}" type="button" ${busy ? 'disabled' : ''}>${esc(label)}</button><p class="small muted" style="margin:0">${esc(hint)}</p>`).join('') +
    (g.phase === 'finished' ? '<p class="small">Game over. Download the CSV, or reset to play again.</p>' : '');
  if (document.activeElement !== $('codeInput')) $('codeInput').value = g.code || '';
  $('unstickBtn').hidden = !g.closing;
  $('teamTable').innerHTML = teams.length ? teams.map(t => `<tr><td><span class="dot ${t.role}" style="background:${t.color}"></span>${esc(t.name)}${t.bot ? ' <span class="tag">BOT</span>' : ''}</td><td class="small muted">${roleName(t.role)}</td>
    <td style="text-align:right"><button class="btn" data-kick="${t.slug}" type="button">${armed === 'kick:' + t.slug ? 'Confirm' : 'Remove'}</button></td></tr>`).join('') : '<tr><td class="small muted">No teams yet.</td></tr>';
  $('resetBtn').textContent = armed === 'reset' ? 'Click again to reset everything' : 'Reset game';
}

async function hostAction(action, payload = {}) {
  busy = true; $('hostError').textContent = ''; renderControls();
  try {
    await api.host(action, payload, key);
  } catch (e) {
    if (e.status === 401) { needKey(e.message); return; }
    $('hostError').textContent = e.message;
  } finally {
    busy = false;
    poller?.refresh();
    if (S) renderControls();
  }
}

$('controls').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.action) hostAction(b.dataset.action);
  else if (b.dataset.bots) hostAction('bots', { role: b.dataset.bots, count: 1 });
  else if (b.dataset.kick) {
    if (armed === 'kick:' + b.dataset.kick) { armed = ''; hostAction('kick', { slug: b.dataset.kick }); }
    else { armed = 'kick:' + b.dataset.kick; renderControls(); }
  }
});
$('fillBtn').addEventListener('click', () => hostAction('fill'));

// The teacher can play too: join a team here and open its player screen in a
// new tab. The player page reads the same saved team, so it opens signed in.
const TEAM_KEY = 'vp:team';
const playerUrl = () => `index.html${debug ? '?debug=1' : ''}`;
const myTeam = () => { try { return localStorage.getItem(TEAM_KEY) || ''; } catch { return ''; } };
$('myProfile').addEventListener('change', () => { $('myTag').hidden = !['Niche', 'Mass'].includes($('myProfile').value); });
$('playBtn').addEventListener('click', async () => {
  const tab = window.open('', '_blank');  // open now, while the click still counts, then point it at the game
  try {
    const t = await api.join($('myTeamName').value, $('myProfile').value, $('myTag').value);
    try { localStorage.setItem(TEAM_KEY, t.slug); } catch { /* private mode */ }
    if (tab) tab.location.href = playerUrl();
    else $('playNote').innerHTML = `Joined. <a href="${playerUrl()}" target="_blank" rel="noopener">Open my player screen</a>`;
    poller?.refresh();
  } catch (e) {
    tab?.close();
    $('playNote').textContent = e.message;
  }
});

function renderPlay() {
  const mine = S && S.game.teams[myTeam()];
  $('playForm').hidden = !!mine || S?.game.phase === 'finished';
  if (mine) $('playNote').innerHTML = `You're playing as <b>${esc(mine.name)}</b>. <a href="${playerUrl()}" target="_blank" rel="noopener">Open my player screen</a>`;
}
$('codeBtn').addEventListener('click', () => hostAction('code', { code: $('codeInput').value }));
$('unstickBtn').addEventListener('click', () => hostAction('unstick'));
$('resetBtn').addEventListener('click', () => {
  if (armed === 'reset') { armed = ''; hostAction('reset'); }
  else { armed = 'reset'; renderControls(); setTimeout(() => { if (armed === 'reset') { armed = ''; renderControls(); } }, 5000); }
});
$('copyLinkBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(joinUrl()); $('copyLinkBtn').textContent = 'Copied!'; }
  catch { $('copyLinkBtn').textContent = joinUrl(); }
  setTimeout(() => { $('copyLinkBtn').textContent = 'Copy join link'; }, 2500);
});
$('projectorBtn').addEventListener('click', () => { $('hostApp').classList.add('projector'); $('showControls').hidden = false; });
$('showControls').addEventListener('click', () => { $('hostApp').classList.remove('projector'); $('showControls').hidden = true; });
$('csvBtn').addEventListener('click', () => {
  if (!S) return;
  const blob = new Blob([csvRows(S.game)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `viral-path-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------------------------------------------------------------- main screen

function renderStatus() {
  const g = S.game;
  $('roundSign').textContent = g.round || '–';
  $('roundsTotal').textContent = g.rounds;
  $('trendSign').textContent = g.trend || '—';
  $('phaseBanner').textContent = PHASE_LABEL[g.phase] || g.phase;
  $('lbBrand').innerHTML = leaderboard(g, 'brand', null);
  $('lbInfl').innerHTML = leaderboard(g, 'infl', null);
  $('feed').innerHTML = feedHtml(g, 30);
}

function qrSvg(text) {
  if (!window.qrcode) return '';
  const q = window.qrcode(0, 'M');
  q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

function renderStage() {
  const g = S.game;
  const key = JSON.stringify([g.phase, g.round, g.step, g.event?.card, g.event?.result ? 1 : 0, Object.keys(g.teams).length, g.code, g.partnerships.length, g.offers.length]);
  if (key === stageKey) return tickCountdown();
  stageKey = key;
  const teams = Object.values(g.teams);
  const chips = role => teams.filter(t => t.role === role).map(t => `<span class="chip"><span class="dot ${t.role}" style="background:${t.color}"></span>${esc(t.name)}</span>`).join('') || '<span class="small muted">none yet</span>';
  let h = '';
  switch (g.phase) {
    case 'lobby': {
      const nb = teams.filter(t => t.role === 'brand').length;
      h = `<h2>Join the race</h2><div class="joinbox"><div class="qr">${qrSvg(joinUrl())}</div>
        <div class="stack"><div class="join-url">${esc(joinUrl())}</div><p class="muted">Pick a team name, then a brand or influencer profile.</p></div></div>
        <div><div class="eyebrow">Brands · ${nb}</div><div class="chips">${chips('brand')}</div></div>
        <div><div class="eyebrow">Influencers · ${teams.length - nb}</div><div class="chips">${chips('infl')}</div></div>`;
      break;
    }
    case 'ready':
      h = `<h2>Round ${g.round}</h2><p class="event-prompt">Everyone rolls at once. If a team's risk beats its roll, it slides back ${CFG.backlashSlide} spaces.</p>`;
      break;
    case 'deals':
      h = `<h2>Deal window</h2><p class="event-prompt"><b>${esc(g.trend)}</b> is trending.</p>
        <ul><li>Brands: offer a two-round contract to an influencer within ${CFG.offerRange} spaces (or anyone, from a Deal space).</li>
        <li>Everyone: buy down risk (${money(CFG.buy.brand)} a point for brands, ${money(CFG.buy.infl)} for influencers) and pick your road at the next fork.</li></ul>`;
      break;
    case 'final': {
      const contested = [...new Set(g.offers.filter(o => o.notice).map(o => o.infl))].map(s => g.teams[s]?.name);
      h = `<h2>Final call</h2><p class="event-prompt">Influencers: pick up to two offers on your phone.</p>
        ${contested.length ? `<p>Considering multiple offers: <b>${esc(contested.join(', '))}</b>. Those brands may raise once.</p>` : '<p class="muted">No influencer has more than one offer.</p>'}`;
      break;
    }
    case 'dealt': {
      const signed = g.partnerships.filter(p => p.round === g.round && p.signed);
      h = `<h2>Contracts signed</h2>${signed.length ? `<ul>${signed.map(p => `<li><b>${esc(g.teams[p.brand]?.name)}</b> + <b>${esc(g.teams[p.infl]?.name)}</b> for ${money(p.amt)}</li>`).join('')}</ul>` : '<p class="muted">No contracts this round.</p>'}
        <p class="event-prompt">Next up: a real social media flop.</p>`;
      break;
    }
    case 'event': {
      const e = g.event, c = CARDS[e.card], target = e.target ? g.teams[e.target] : null;
      const prompt = c.kind === 'flop' ? `${c.others(target.name)} ${target.name}: Delete, Apologize, Ignore, or Lean in? Everyone else: Support, Critique, or Stay out?` : c.prompt;
      h = `<div class="phase-head"><h2 class="event-title">${esc(e.title)}</h2><span class="countdown" id="countdown"></span></div>
        <div class="eyebrow">Based on a true story · ${esc(c.story)}</div>
        <p class="event-prompt">${esc(prompt)}</p>
        <div class="timer" aria-hidden="true"><div id="timerBar" style="width:100%"></div></div>
        <p class="small muted">Answer on your phone. The first two teams to react move ahead 2 and 1 extra spaces.</p>`;
      break;
    }
    case 'results': {
      const e = g.event, r = e?.result;
      if (!r) break;
      const reactors = r.reactions.length;
      h = `<h2 class="event-title">${esc(e.title)}</h2><ul>${r.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
        ${e.target ? `<p><b>Who won the moment?</b> ${esc(g.teams[e.target]?.name)} gained ${r.targetGain} attention; the ${reactors} team${reactors === 1 ? '' : 's'} that reacted gained ${r.reactorGain} combined.</p>` : ''}
        ${storyHtml(e.card, true)}`;
      break;
    }
    case 'finished': {
      const w = g.winner ? g.teams[g.winner.slug] : null;
      h = `${g.code ? `<div class="eyebrow">Participation code</div><div class="big-code">${esc(g.code)}</div>` : ''}
        <h2>${w ? `${esc(w.name)} wins ${money(CFG.prize)}!` : 'Game over'}</h2>${w ? `<p class="event-prompt">${esc(w.name)} ${esc(g.winner.how)}.</p>` : ''}
        <h3>Every flop</h3><table class="lb"><thead><tr><th>Round · card</th><th>Target</th><th>Trust in</th><th>Response</th><th>Target +att</th><th>Reactors +att</th></tr></thead><tbody>
        ${g.flopLog.map(f => `<tr><td>${f.round} · ${esc(f.card)}</td><td>${esc(g.teams[f.target]?.name || f.target)}</td><td>${f.trustIn}</td><td>${esc(f.response)}</td><td>${f.targetGain}</td><td>${f.reactorGain}</td></tr>`).join('')}</tbody></table>
        <h3>Deals made and passed over</h3><ul class="small">${g.partnerships.map(p => `<li>R${p.round}: ${esc(g.teams[p.brand]?.name)} → ${esc(g.teams[p.infl]?.name)} ${money(p.amt)} ${p.signed ? '✓ signed' : '✗ passed'}</li>`).join('') || '<li>None.</li>'}</ul>`;
      break;
    }
  }
  $('stagePanel').innerHTML = h;
  tickCountdown();
}

function tickCountdown() {
  const e = S?.game.event;
  if (!e || S.game.phase !== 'event') return;
  const total = e.closesAt - e.openedAt, left = Math.max(0, e.closesAt - api.now());
  const bar = $('timerBar'), cd = $('countdown');
  if (bar) bar.style.width = (left / total * 100) + '%';
  if (cd) cd.textContent = left > 0 ? Math.ceil(left / 1000) : "Time's up";
}
setInterval(tickCountdown, 250);

// ---------------------------------------------------------------- start

function onState(s) {
  S = s;
  $('keyForm').hidden = true;
  $('hostUi').hidden = false;
  board.update(s.game, null);
  renderStatus();
  renderControls();
  renderStage();
  renderPlay();
}

function start() {
  poller?.stop();
  poller = startPolling(api, () => ({ role: 'host', key }), onState, {
    intervalMs: 1500,
    onError: e => { if (e.status === 401 || e.status === 500) needKey(e.message); },
  });
}

if (debug || key) start(); else needKey();
