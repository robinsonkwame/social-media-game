// A team's phone: join, then follow the round the teacher is running.
import { createApi, startPolling } from './api.js';
import { createBoard } from './board.js';
import { CFG, PROFILES, TAGS, FLOP, band, BAND_NAME, FORK1, fork2Index } from './rules.js';
import { CARDS } from './cards.js';
import { inRange, spaceOf, lengthOf, choicesFor, netOf, trustChangeOf, money } from './engine.js';
import { $, esc, storyHtml, leaderboard, feedHtml, HOW_TO, PHASE_LABEL, roleName, signed, nextEventHtml, eventKindHtml, SPEED_LINE, ordinal } from './ui.js';

const api = await createApi();
const solo = api.mode === 'solo';  // solo practice: you run the host steps yourself
const KEY = solo ? 'vp:soloTeam' : 'vp:team';
const load = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const save = v => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

let slug = load();
let S = null;              // latest state from the server
let board = null;
let poller = null;
let cardKey = '';          // what the phase card currently shows
let draft = {};            // unsaved form choices for the current phase
let draftKey = '';
let showStory = false;
let busy = false;
let flash = '';            // one-line message under the phase card actions

// ---------------------------------------------------------------- join

let profile = 'Heritage';
function drawJoin(message = '') {
  $('howtoSlot').innerHTML = HOW_TO;
  $('profilePicker').innerHTML = Object.entries(PROFILES).map(([k, p]) => `
    <button type="button" class="pick" data-profile="${k}" aria-pressed="${k === profile}"><b>${k} ${roleName(p.role)}</b>
    <small>${p.blurb}</small><small class="num">${money(p.money)} · att ${p.att} · trust ${p.trust}</small></button>`).join('');
  $('tag').innerHTML = TAGS.map(t => `<option>${t}</option>`).join('');
  $('tagField').hidden = PROFILES[profile].role !== 'infl';
  $('joinError').textContent = message;
}
$('profilePicker').addEventListener('click', e => {
  const b = e.target.closest('[data-profile]');
  if (!b) return;
  profile = b.dataset.profile;
  document.querySelectorAll('[data-profile]').forEach(x => x.setAttribute('aria-pressed', x.dataset.profile === profile));
  $('tagField').hidden = PROFILES[profile].role !== 'infl';
});
$('joinForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('joinBtn').disabled = true;
  $('joinError').textContent = '';
  try {
    const t = await api.join($('teamName').value, profile, $('tag').value);
    slug = t.slug;
    save(slug);
    showGame();
  } catch (err) {
    $('joinError').textContent = err.message;
  } finally {
    $('joinBtn').disabled = false;
  }
});

function showJoin(message) {
  $('gameView').hidden = true;
  $('joinView').hidden = false;
  drawJoin(message);
}

function showGame() {
  $('joinView').hidden = true;
  $('gameView').hidden = false;
  if (!board) board = createBoard($('board'), $('legend'));
  cardKey = '';
  poller?.refresh();
}

// ---------------------------------------------------------------- state

function onState(s) {
  S = s;
  const g = s.game;
  if (!slug) {
    const ts = Object.values(g.teams);
    const nb = ts.filter(t => t.role === 'brand').length;
    if ($('sideCount')) $('sideCount').textContent = ts.length ? `Joined so far: ${nb} brand${nb === 1 ? '' : 's'}, ${ts.length - nb} influencer${ts.length - nb === 1 ? '' : 's'}.` : '';
    return;
  }
  if (!g.teams[slug]) {
    slug = '';
    save('');
    showJoin(g.phase === 'lobby' ? 'Your team is no longer in this game. Join again.' : 'This game was reset or your team was removed. Join again.');
    return;
  }
  if ($('gameView').hidden) showGame();
  board.update(g, slug);
  renderStatus();
  renderPhase();
}

const me = () => S.game.teams[slug];

function renderStatus() {
  const g = S.game, t = me();
  $('roundSign').textContent = g.round || '–';
  $('roundsTotal').textContent = g.rounds;
  $('trendSign').textContent = g.trend || '—';
  $('meName').textContent = t.name;
  $('meRole').textContent = `${t.profile} ${roleName(t.role)}${t.tag ? ' · ' + t.tag : ''}`;
  const chance = Math.round(Math.max(0, Math.min(6, t.risk - 1)) / 6 * 100);
  $('meStats').innerHTML = `
    <div class="stat"><div class="label">Cash</div><div class="value">${money(t.money)}</div><div class="small muted">Profit ${money(netOf(S.game, t))}</div></div>
    <div class="stat"><div class="label">Attention</div><div class="value">${t.att}</div><div class="bar"><div style="width:${t.att}%"></div></div></div>
    <div class="stat"><div class="label">Trust</div><div class="value">${t.trust}<span class="small muted">/10 ${BAND_NAME[band(t.trust)]}</span></div><div class="small muted">${signed(trustChangeOf(t))} since the start</div></div>
    <div class="stat"><div class="label">Risk</div><div class="value ${chance >= 33 ? 'risk-hi' : ''}">${t.risk}</div><div class="small muted">${chance}% backlash</div></div>`;
  const c = t.contracts.map(k => `${esc(g.teams[k.partner]?.name || k.partner)} (${k.left} round${k.left > 1 ? 's' : ''} left)`).join(', ');
  $('meContracts').innerHTML = `Space ${t.pos} of ${lengthOf(t)}${t.finished ? ' · finished!' : ''} · Contracts: ${c || 'none'}`;
  $('lbBrand').innerHTML = leaderboard(g, 'brand', slug);
  $('lbInfl').innerHTML = leaderboard(g, 'infl', slug);
  $('feed').innerHTML = feedHtml(g);
}

// ---------------------------------------------------------------- phase card

function head(title, eyebrow = '') {
  return `<div class="phase-head"><h2>${esc(title)}</h2><span class="eyebrow">${esc(eyebrow)}</span></div>`;
}
const flashLine = () => `<p class="small ${flash.startsWith('✓') ? 'okline' : 'error'}" id="flash" role="status">${esc(flash)}</p>`;

function renderPhase(force = false) {
  const g = S.game, t = me();
  const key = JSON.stringify([g.id, g.phase, g.round, g.step, g.closing, S.myAct, g.offers, g.event && g.event.result ? 1 : 0, g.event?.openedAt, g.event?.closesAt, t.contracts.length, flash, showStory, g.code]);
  if (!force && key === cardKey) return updateTicker();
  cardKey = key;
  const dk = `${g.id}:${g.round}:${g.phase}`;
  if (dk !== draftKey) { draftKey = dk; draft = {}; showStory = g.phase === 'event'; flash = ''; }
  const html = {
    lobby: lobbyCard, ready: readyCard, deals: dealsCard, final: finalCard,
    dealt: dealtCard, event: eventCard, results: resultsCard, finished: finishedCard,
  }[g.phase]?.(g, t) ?? '';
  $('phaseCard').innerHTML = html + (solo ? soloSteps(g, t) : '');
  updateTicker();
  tickTimer();
}

function lobbyCard(g, t) {
  const ts = Object.values(g.teams), nb = ts.filter(x => x.role === 'brand').length;
  return head("You're in!", 'Lobby') + `
    <p class="prompt">${esc(t.name)} joined as a ${t.profile} ${roleName(t.role)}.</p>
    <p class="muted small">Waiting for the teacher to start. ${ts.length} team${ts.length === 1 ? '' : 's'} so far: ${nb} brand${nb === 1 ? '' : 's'}, ${ts.length - nb} influencer${ts.length - nb === 1 ? '' : 's'}.</p>
    <div class="row"><button class="btn" data-leave type="button">Leave (wrong name or team)</button></div>${flashLine()}`;
}

function readyCard(g, t) {
  return head(`Round ${g.round}`, 'Get ready') + `
    <p class="prompt">${solo ? 'Roll when you are ready. Everyone rolls at once.' : 'Watch the main screen. The teacher rolls for every team at once.'}</p>
    <p class="small muted">If your risk (${t.risk}) is higher than your roll, you get a backlash and slide back ${CFG.backlashSlide} spaces. You can buy risk down in the deal window.</p>`;
}

function rollLine(g, t) {
  const r = t.lastRoll;
  const back = (g.log || []).some(l => l.r === g.round && l.text.startsWith(t.name + ' rolled') && l.text.includes('BACKLASH'));
  return t.finished ? 'You are at the finish!' : `You rolled ${r}${back ? ' and got a backlash' : ''}. You're on ${/^[AEIOU]/.test(spaceOf(t).type) ? 'an' : 'a'} ${spaceOf(t).type} space.`;
}

function dealsCard(g, t) {
  const price = CFG.buy[t.role];
  const saved = S.myAct;
  if (!('buy' in draft)) Object.assign(draft, { buy: saved?.buy || 0, pref1: saved?.pref1 || t.pref1 || 'quiet', pref2: saved?.pref2 || t.pref2 || 'quiet', offerTo: saved?.offer?.to || null, amt: saved?.offer?.amt || CFG.fee });
  const needFork1 = !t.c1 && t.pos >= FORK1 - 12;
  const needFork2 = t.c1 && !t.c2 && t.pos >= fork2Index(t.c1) - 12;
  const offerCost = draft.offerTo ? draft.amt : 0;
  const maxBuy = Math.max(0, Math.min(t.risk, Math.floor((t.money - offerCost) / price)));
  draft.buy = Math.min(draft.buy, maxBuy);
  const forkField = (n, cur) => `<div class="field"><label>Fork ${n} ahead: which road?</label><div class="picker">
    <button type="button" class="pick" data-fork="${n}:quiet" aria-pressed="${cur !== 'viral'}"><b>Quiet road</b><small>Longer and calmer.</small></button>
    <button type="button" class="pick" data-fork="${n}:viral" aria-pressed="${cur === 'viral'}"><b>Viral road</b><small>Shorter, more events, +1 risk.</small></button></div></div>`;
  let offer = '';
  if (t.role === 'brand') {
    const infl = Object.values(g.teams).filter(x => x.role === 'infl');
    offer = t.contracts.length >= 2 ? '<p class="small muted">You already hold two contracts.</p>' : `<div class="field"><label>Offer a two-round contract</label>
      ${infl.length ? `<div class="picker">${infl.map(x => {
        const ok = inRange(t, x) && x.contracts.length < 2;
        return `<button type="button" class="pick" data-infl="${x.slug}" aria-pressed="${draft.offerTo === x.slug}" ${ok ? '' : 'disabled'}><b>${esc(x.name)}</b>
          <small>${x.profile} · ${x.tag}${x.tag === g.trend ? ' (trending!)' : ''} · att ${x.att} · trust ${x.trust}</small>
          <small>${ok ? (spaceOf(t).type === 'Deal' ? 'You are on a Deal space: anyone' : `Within ${CFG.offerRange} spaces`) : (x.contracts.length >= 2 ? 'Fully booked' : 'Too far away')}</small></button>`;
      }).join('')}</div>` : '<p class="small muted">No influencers have joined.</p>'}
      ${draft.offerTo ? `<div class="row"><span class="small">Fee</span><input id="fee" type="range" min="1000" max="${Math.max(1000, Math.min(30000, t.money))}" step="500" value="${draft.amt}"><span class="num" id="feeLabel">${money(draft.amt)}</span><button type="button" class="btn" data-clear>No offer</button></div>` : ''}
      <p class="small muted">The usual rate is ${money(CFG.fee)}. You get half your influencer's attention each round, or all of it when their tag is trending.</p></div>`;
  } else {
    offer = '<p class="small muted">Brands are making offers now. You will see them side by side in the final call.</p>';
  }
  return head('Deal window', `${g.trend} is trending`) + `
    <p class="prompt">${esc(rollLine(g, t))}</p>${nextEventHtml(g, slug)}
    <div class="field"><label>Buy down risk (${money(price)} per point)</label>
      <div class="row"><button type="button" class="btn" data-buy="-1" ${draft.buy <= 0 ? 'disabled' : ''}>−</button><span class="num">${draft.buy}</span>
      <button type="button" class="btn" data-buy="1" ${draft.buy >= maxBuy ? 'disabled' : ''}>+</button>
      <span class="small muted">Risk ${t.risk} → ${t.risk - draft.buy} · cost ${money(draft.buy * price)}</span></div></div>
    ${needFork1 ? forkField(1, draft.pref1) : ''}${needFork2 ? forkField(2, draft.pref2) : ''}
    ${offer}
    <div class="row"><button type="button" class="btn primary" data-send="deal" ${busy ? 'disabled' : ''}>${saved ? 'Update my choices' : 'Lock in my choices'}</button></div>
    ${saved ? `<p class="small okline">Saved. You can change it until ${solo ? 'you finish the deal window' : 'the teacher starts the final call'}.</p>` : ''}${flashLine()}`;
}

function finalCard(g, t) {
  return finalCardBody(g, t) + nextEventHtml(g, slug);
}
function finalCardBody(g, t) {
  if (t.role === 'brand') {
    const o = g.offers.find(x => x.brand === slug);
    if (!o) return head('Final call', 'Deals') + '<p class="prompt">You made no offer this round.</p><p class="small muted">Influencers are choosing between offers now.</p>';
    const infl = g.teams[o.infl];
    if (o.notice && !o.raised) {
      if (!('raise' in draft)) draft.raise = S.myAct?.raise || o.amt;
      return head('Final call', 'Multiple offers') + `
        <p class="prompt">${esc(infl.name)} is considering multiple offers.</p>
        <p class="small muted">You don't know who else offered or how much. You can raise once.</p>
        <div class="row"><input id="raise" type="range" min="${o.amt}" max="${Math.max(o.amt, Math.min(40000, t.money))}" step="500" value="${draft.raise}"><span class="num" id="raiseLabel">${money(draft.raise)}</span></div>
        <div class="row"><button type="button" class="btn primary" data-send="raise" ${busy ? 'disabled' : ''}>${S.myAct ? 'Update final offer' : 'Send final offer'}</button></div>
        ${S.myAct ? `<p class="small okline">Final offer: ${money(S.myAct.raise)}.</p>` : ''}${flashLine()}`;
    }
    return head('Final call', 'Deals') + `<p class="prompt">You offered ${esc(infl.name)} ${money(o.amt)}.</p><p class="small muted">Waiting for them to decide.</p>`;
  }
  const mine = g.offers.filter(o => o.infl === slug).sort((a, b) => b.amt - a.amt);
  if (!mine.length) return head('Final call', 'Deals') + '<p class="prompt">No brands made you an offer this round.</p><p class="small muted">Get within 4 spaces of a brand, or hope one lands on a Deal space.</p>';
  const room = 2 - t.contracts.length;
  if (!('accept' in draft)) draft.accept = S.myAct?.accept || [];
  return head('Your offers', `Pick up to ${room}`) + `
    <div class="stack">${mine.map(o => { const b = g.teams[o.brand]; return `<button type="button" class="offer" data-accept="${o.brand}" aria-pressed="${draft.accept.includes(o.brand)}"><span><b>${esc(b.name)}</b>
      <span class="small muted">${b.profile} · att ${b.att} · trust ${b.trust}${b.trust <= 3 ? ' · low trust' : ''}</span></span><span class="num">${money(o.amt)}${o.raised ? ' ↑' : ''}</span></button>`; }).join('')}</div>
    <p class="small muted">A contract pays the fee now and gives you +3 attention per round for two rounds. Holding two contracts costs 1 trust per round. ↑ means the brand raised its offer.</p>
    <div class="row"><button type="button" class="btn primary" data-send="accept" ${busy ? 'disabled' : ''}>${S.myAct ? 'Update my choice' : 'Confirm my choice'}</button></div>
    ${S.myAct ? `<p class="small okline">Saved: ${S.myAct.accept.length ? S.myAct.accept.map(b => esc(g.teams[b]?.name)).join(', ') : 'no deals'}. You can change it until the teacher closes deals.</p>` : ''}${flashLine()}`;
}

function dealtCard(g, t) {
  const fresh = t.contracts.filter(k => k.left === 2).map(k => g.teams[k.partner]?.name).filter(Boolean);
  return head('Deals are done', `Round ${g.round}`) + `
    <p class="prompt">${fresh.length ? `You signed with ${esc(fresh.join(' and '))}.` : 'No new contract for you this round.'}</p>
    ${nextEventHtml(g, slug)}<p class="small muted">${esc(SPEED_LINE)}</p>`;
}

function respHint(r, t, c) {
  const f = FLOP[r], b = band(t.trust), step = CFG.stepTarget[r][b];
  const att = r === 'Delete' && c.deleteNoAttention ? 0 : f.att;
  return `+${att} att · ${f.trust[b] > 0 ? '+' : ''}${f.trust[b]} trust · ${f.risk > 0 ? '+' : ''}${f.risk} risk · ${step >= 0 ? '+' + step : step} spaces`;
}

function choiceList(e, c, t) {
  if (c.kind === 'flop' && e.target === slug) return Object.keys(FLOP).map(r => [r, r, respHint(r, t, c)]);
  if (c.kind === 'flop') return [['Support', 'Support', `+5 att · +${CFG.stepSupport} space`], ['Critique', 'Critique', `+10 att · +2 risk · +${CFG.stepCritique} spaces · −1 trust if they lean in at High trust`], ['Out', 'Stay out', 'No change']];
  return [['Join', 'Join the meme', `+8 att · +1 risk · +${CFG.stepJoin} space · speed bonus`], ['Out', 'Stay out', 'No change']];
}

function eventCard(g, t) {
  const e = g.event, c = CARDS[e.card];
  const options = choicesFor(g, t);
  const target = e.target ? g.teams[e.target] : null;
  let prompt = c.kind === 'flop' ? (e.target === slug ? c.target : c.others(target.name) + ' What do you do?') : c.prompt;
  const learn = `<div class="row"><button type="button" class="btn" data-learn aria-expanded="${showStory}">${showStory ? 'Hide the true story' : 'Learn more: the true story'}</button>${options.length && !S.myAct ? '<span class="small muted">The clock keeps running while you read.</span>' : ''}</div>
    <div>${showStory ? storyHtml(e.card, false) : ''}</div>`;
  const timer = `<div class="timer" aria-hidden="true"><div id="timerBar" style="width:100%"></div></div><div class="small muted" id="timerText"></div>`;
  const title = e.target === slug ? `${e.title}: it's you` : e.title;
  const kind = `<div>${eventKindHtml(g, slug)}</div>`;
  if (!e.timed) {
    return head(e.title, 'Event') + kind + `<p class="prompt">${esc(prompt)}</p>
      <p class="small muted">No decision this time. It applies to everyone when ${solo ? 'you apply' : 'the teacher applies'} it.</p>${storyHtml(e.card, false)}`;
  }
  if (!e.openedAt) {
    // reading time: the story is open and the choices wait for the countdown
    const preview = options.length ? `<div class="choices">${choiceList(e, c, t).map(([, label, hint]) => `<button type="button" class="choice" disabled><b>${esc(label)}</b><small>${esc(hint)}</small></button>`).join('')}</div>` : '';
    return head(title, 'Read the story') + kind + `<p class="prompt">${esc(prompt)}</p>${storyHtml(e.card, false)}${preview}
      <p class="small muted">${options.length ? `Your choices open when ${solo ? 'you start' : 'the teacher starts'} the ${g.reactionSeconds || CFG.reactionSeconds}-second countdown. ${SPEED_LINE}` : (t.finished ? "You're at the finish, so you sit this one out." : 'No decision this time.')}</p>`;
  }
  if (!options.length) {
    return head(title, 'Event') + `<p class="prompt">${esc(prompt)}</p>${timer}<p class="small muted">${t.finished ? "You're at the finish, so you sit this one out." : 'No decision this time. Watch the main screen.'}</p>${learn}`;
  }
  if (S.myAct) {
    const secs = ((S.myAct.at - e.openedAt) / 1000).toFixed(1);
    return head(title, 'Locked in') + `<p class="prompt">${esc(prompt)}</p>${timer}
      <p class="okline">You chose ${esc(S.myAct.choice === 'Out' ? 'Stay out' : S.myAct.choice)} at ${secs}s.</p>
      <p class="small muted">${solo ? 'Score the event when you are ready.' : 'Results appear when the teacher closes the event.'}</p>${learn}<div class="small muted" id="botTicker"></div>`;
  }
  const choices = choiceList(e, c, t);
  return head(title, 'Reaction window') + kind + `<p class="prompt">${esc(prompt)}</p>${timer}
    <p class="small"><b>${esc(SPEED_LINE)}</b></p>
    <div class="choices">${choices.map(([id, label, hint]) => `<button type="button" class="choice" data-choice="${id}" ${busy ? 'disabled' : ''}><b>${esc(label)}</b><small>${esc(hint)}</small></button>`).join('')}</div>
    ${learn}${flashLine()}<div class="small muted" id="botTicker"></div>`;
}

function resultsCard(g, t) {
  const e = g.event, r = e?.result;
  if (!r) return head('Round results', '') + '<p class="muted">Waiting for results.</p>';
  const idx = r.reactions.findIndex(x => x.slug === slug), mine = r.reactions[idx];
  const my = e.target === slug ? `You chose ${r.response}.`
    : mine ? `You chose ${mine.choice === 'Join' ? 'to join' : mine.choice} at ${mine.secs}s, ${ordinal(idx + 1)} to react${mine.bonus ? `: +${mine.bonus} bonus space${mine.bonus > 1 ? 's' : ''} toward the finish` : ' (only the first two get a speed bonus)'}.` : '';
  return head(e.title, 'Results') + `
    ${my ? `<p class="prompt">${esc(my)}</p>` : ''}
    <ul class="small">${r.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    ${storyHtml(e.card, true)}
    ${solo ? '' : `<p class="small muted">${g.round < g.rounds ? 'The teacher starts the next round when everyone is ready.' : 'That was the last round. Waiting for the teacher.'}</p>`}`;
}

function finishedCard(g, t) {
  const role = t.role, peers = Object.values(g.teams).filter(x => x.role === role);
  const rank = 1 + peers.filter(x => netOf(g, x) > netOf(g, t)).length;
  const winner = g.winner ? g.teams[g.winner.slug] : null;
  const h = t.history || [];
  const W = 300, H = 120, pad = 22;
  const x = i => pad + (h.length > 1 ? i * (W - pad * 2) / (h.length - 1) : 0);
  const yA = v => H - pad - v / 100 * (H - pad * 2), yT = v => H - pad - v / 10 * (H - pad * 2);
  const line = (fn, k) => h.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${fn(p[k]).toFixed(1)}`).join(' ');
  const chart = h.length ? `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your attention and trust by round">
    <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--line)"/>
    <path d="${line(yA, 'att')}" fill="none" stroke="var(--sky)" stroke-width="2.5"/>
    <path d="${line(yT, 'trust')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="5 4"/>
    ${h.map((p, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">R${p.round}</text>`).join('')}
    <text x="${pad}" y="12">attention (0–100)</text><text x="${W - pad}" y="12" text-anchor="end">trust (0–10, dashed)</text></svg>` : '';
  const flops = t.flops.length ? t.flops.map(f => `<li>Round ${f.round}, ${esc(f.card)}: trust ${f.trustIn} going in (${BAND_NAME[band(f.trustIn)]}), chose ${esc(f.response)}: +${f.dAtt} attention, ${f.dTrust >= 0 ? '+' : ''}${f.dTrust} trust, ${f.step >= 0 ? '+' : ''}${f.step} spaces.</li>`).join('') : '<li>No flop targeted your team.</li>';
  const code = solo ? '' : `<div class="eyebrow">Participation code</div>
    ${g.code ? `<div class="big-code" aria-label="Participation code">${esc(g.code)}</div>` : '<p class="prompt">Your teacher will give you the participation code.</p>'}`;
  return `${code}
    ${head('Game over', `${g.rounds} rounds`)}
    <p class="prompt">${winner ? `${esc(winner.name)} ${esc(g.winner.how)} and won ${money(CFG.prize)}. ` : ''}You finished <b>#${rank}</b> of ${peers.length} ${roleName(role)}s with ${money(netOf(g, t))} profit and trust ${t.trust} (${signed(trustChangeOf(t))}).</p>
    <div class="story"><div class="eyebrow">Success or lucky accident? · Our flops</div><ul>${flops}</ul></div>
    <div class="story"><div class="eyebrow">Who won the moment?</div>From other teams' events you gained <b class="num">${t.fromOthers.att}</b> attention and <b class="num">${t.fromOthers.spaces}</b> spaces.</div>
    <div class="story"><div class="eyebrow">Attention or lasting value?</div>${chart}</div>`;
}

// ---------------------------------------------------------------- solo steps

// In solo practice the player presses the teacher's buttons.
function soloSteps(g, t) {
  const steps = {
    ready: [['roll', 'Roll the dice']],
    deals: [['finalCall', 'Done with deals']],
    final: [['closeDeals', 'Close deals']],
    dealt: [['fire', 'Show the next event']],
    event: g.event && !g.event.timed ? [['resolve', 'Apply the event']]
      : g.event && !g.event.openedAt ? [['startTimer', `Start the ${g.reactionSeconds || CFG.reactionSeconds}-second countdown`]]
      : [['resolve', S.myAct || !choicesFor(g, t).length ? 'Score the event' : 'Skip and score the event']],
    results: g.round < g.rounds ? [['next', `Start round ${g.round + 1}`]]
      : [...(g.rounds < CFG.maxRounds ? [['extend', `Extend to ${CFG.maxRounds} rounds`]] : []), ['finish', 'Finish the game']],
    finished: [['again', 'Play again']],
  }[g.phase] || [];
  if (!steps.length) return '';
  return `<div class="row">${steps.map(([a, label], i) => `<button type="button" class="btn ${i === steps.length - 1 ? 'primary' : ''}" data-host="${a}" ${busy ? 'disabled' : ''}>${esc(label)}</button>`).join('')}</div>
    ${g.phase === 'finished' ? '' : '<p class="small muted" style="margin:0">In class, the teacher presses this.</p>'}`;
}

async function soloHost(action) {
  const g = S.game, t = me();
  busy = true; flash = ''; renderPhase(true);
  try {
    // send unsaved choices first, so pressing the step button never loses them
    if (action === 'finalCall' && !S.myAct) await api.act(slug, { buy: draft.buy, pref1: draft.pref1, pref2: draft.pref2, offer: draft.offerTo ? { to: draft.offerTo, amt: draft.amt } : null });
    if (action === 'closeDeals' && !S.myAct) {
      if (t.role === 'infl' && draft.accept?.length) await api.act(slug, { accept: draft.accept });
      const o = g.offers.find(x => x.brand === slug);
      if (t.role === 'brand' && o?.notice && !o.raised && draft.raise > o.amt) await api.act(slug, { raise: draft.raise });
    }
    if (action === 'again') {
      await api.host('reset');
      slug = ''; save('');
      showJoin('');
      return;
    }
    await api.host(action);
  } catch (err) {
    flash = err.message;
  } finally {
    busy = false;
    poller.refresh();
    if (slug) renderPhase(true);
  }
}

// ---------------------------------------------------------------- live bits

function updateTicker() {
  const el = $('botTicker');
  if (!el || !S?.game.event) return;
  const e = S.game.event;
  el.innerHTML = Object.entries(e.bots || {}).filter(([, b]) => b.at <= api.now())
    .map(([s, b]) => `⚡ ${esc(S.game.teams[s]?.name || s)} chose ${esc(b.choice === 'Out' ? 'Stay out' : b.choice)} at ${((b.at - e.openedAt) / 1000).toFixed(1)}s`).join('<br>');
}

function tickTimer() {
  const e = S?.game.event;
  const bar = $('timerBar'), txt = $('timerText');
  if (!e || !bar || S.game.phase !== 'event' || !e.openedAt) return;
  const total = e.closesAt - e.openedAt, left = Math.max(0, e.closesAt - api.now());
  bar.style.width = (left / total * 100) + '%';
  if (txt) txt.textContent = left > 0 ? `${Math.ceil(left / 1000)}s left` : "Time's up. Waiting for the teacher.";
  if (left <= 0) document.querySelectorAll('[data-choice]').forEach(b => { b.disabled = true; });
}
setInterval(() => { tickTimer(); updateTicker(); }, 250);

// ---------------------------------------------------------------- actions

async function send(payload) {
  busy = true; flash = ''; renderPhase(true);
  try {
    await api.act(slug, payload);
    flash = '✓ Sent.';
  } catch (err) {
    flash = err.message;
  } finally {
    busy = false;
    poller.refresh();
    renderPhase(true);
  }
}

$('phaseCard').addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const t = me();
  if (b.dataset.buy) { draft.buy += Number(b.dataset.buy); renderPhase(true); }
  else if (b.dataset.fork) { const [n, v] = b.dataset.fork.split(':'); draft[n === '1' ? 'pref1' : 'pref2'] = v; renderPhase(true); }
  else if (b.dataset.infl) { draft.offerTo = b.dataset.infl; renderPhase(true); }
  else if (b.hasAttribute('data-clear')) { draft.offerTo = null; renderPhase(true); }
  else if (b.dataset.accept) {
    const id = b.dataset.accept, room = 2 - t.contracts.length;
    draft.accept = draft.accept.includes(id) ? draft.accept.filter(x => x !== id) : draft.accept.length < room ? [...draft.accept, id] : draft.accept;
    renderPhase(true);
  } else if (b.hasAttribute('data-learn')) { showStory = !showStory; renderPhase(true); }
  else if (b.dataset.send === 'deal') send({ buy: draft.buy, pref1: draft.pref1, pref2: draft.pref2, offer: draft.offerTo ? { to: draft.offerTo, amt: draft.amt } : null });
  else if (b.dataset.send === 'raise') send({ raise: draft.raise });
  else if (b.dataset.send === 'accept') send({ accept: draft.accept });
  else if (b.dataset.choice) send({ choice: b.dataset.choice });
  else if (b.dataset.host) soloHost(b.dataset.host);
  else if (b.hasAttribute('data-leave')) {
    try { await api.leave(slug); } catch (err) { flash = err.message; renderPhase(true); return; }
    slug = ''; save(''); showJoin('');
  }
});
$('phaseCard').addEventListener('input', e => {
  if (e.target.id === 'fee') { draft.amt = Number(e.target.value); $('feeLabel').textContent = money(draft.amt); }
  if (e.target.id === 'raise') { draft.raise = Number(e.target.value); $('raiseLabel').textContent = money(draft.raise); }
});

// ---------------------------------------------------------------- rules overlay

$('rulesBtn').addEventListener('click', () => {
  const root = $('overlayRoot');
  root.innerHTML = `<div class="overlay"><div class="modal wide stack" role="dialog" aria-modal="true" aria-labelledby="rulesTitle">
    <h2 id="rulesTitle">How to play</h2>${HOW_TO}<div class="row"><button class="btn primary" data-close type="button">Back to the game</button></div></div></div>`;
  root.querySelector('[data-close]').addEventListener('click', () => { root.innerHTML = ''; });
});

// ---------------------------------------------------------------- solo restart

// Two clicks within a few seconds, so a stray tap doesn't wipe the game.
const restartBtn = $('restartBtn');
let restartArmed = null;
restartBtn?.addEventListener('click', async () => {
  if (!restartArmed) {
    restartBtn.textContent = 'Click again to restart';
    restartArmed = setTimeout(() => { restartArmed = null; restartBtn.textContent = 'Restart'; }, 4000);
    return;
  }
  clearTimeout(restartArmed);
  restartArmed = null;
  restartBtn.textContent = 'Restart';
  try { await api.host('reset'); } catch { /* a fresh join resets anyway */ }
  slug = ''; save('');
  showJoin('');
});

// ---------------------------------------------------------------- start

if (slug) showGame(); else showJoin('');
poller = startPolling(api, () => ({ slug }), onState, { intervalMs: 1500, onError: e => { if (e.status === 404) { slug = ''; save(''); showJoin('Join again.'); } } });
