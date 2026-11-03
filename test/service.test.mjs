import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../public/js/service.js';
import { createKvStore, mapBacking } from '../public/js/kv.js';
import { CFG } from '../public/js/rules.js';

function setup(seed = 1) {
  let s = seed;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let clock = 1_000_000;
  const svc = createService(createKvStore(mapBacking()), { now: () => clock, rng });
  return { svc, tick: ms => { clock += ms; }, now: () => clock };
}

test('a full game with two students and bots runs to a winner', async () => {
  const { svc, tick } = setup(7);
  await svc.join('Pink Team', 'Heritage');
  await svc.join('Mint Squad', 'Niche', 'Food');
  await svc.host('bots', { role: 'brand', count: 2 });
  await svc.host('fill');
  let { game } = await svc.hostState();
  const roles = Object.values(game.teams).map(t => t.role);
  assert.equal(roles.filter(r => r === 'brand').length, roles.filter(r => r === 'infl').length);
  await svc.host('code', { code: 'TISA-42' });
  await svc.host('start');
  for (let round = 1; round <= CFG.rounds; round++) {
    await svc.host('roll');
    ({ game } = await svc.hostState());
    assert.equal(game.phase, 'deals');
    const mint = game.teams['mint-squad'];
    await svc.act('pink-team', { buy: 0, offer: mint.pos >= 0 ? { to: 'mint-squad', amt: 9000 } : null }).catch(() => {});
    await svc.host('finalCall');
    ({ game } = await svc.hostState());
    const mine = game.offers.filter(o => o.infl === 'mint-squad').map(o => o.brand);
    if (mine.length) await svc.act('mint-squad', { accept: mine.slice(0, 1) }).catch(() => {});
    await svc.host('closeDeals');
    await svc.host('fire');
    ({ game } = await svc.hostState());
    assert.equal(game.phase, 'event');
    tick(4000);
    const e = game.event;
    for (const slug of ['pink-team', 'mint-squad']) {
      const t = game.teams[slug];
      const choice = e.kind === 'flop' ? (e.target === slug ? 'Lean in' : 'Critique') : e.card === 'Meme Format' ? 'Join' : null;
      if (choice && !t.finished) await svc.act(slug, { choice });
    }
    tick(30000);
    await svc.host('resolve');
    ({ game } = await svc.hostState());
    assert.equal(game.phase, 'results');
    assert.ok(game.event.result);
    if (round < CFG.rounds) await svc.host('next');
  }
  await svc.host('finish');
  ({ game } = await svc.hostState());
  assert.equal(game.phase, 'finished');
  assert.ok(game.winner);
  const s = await svc.studentState('pink-team');
  assert.equal(s.game.code, 'TISA-42');
  assert.equal(s.game.teams['pink-team'].history.length, CFG.rounds);
});

test('a reaction after the host closes the window does not count, and the team is told', async () => {
  const { svc, tick } = setup(3);
  await svc.join('Solo', 'Heritage');
  await svc.host('bots', { role: 'brand', count: 1 });
  await svc.host('start');
  await svc.host('roll');
  await svc.host('finalCall');
  await svc.host('closeDeals');
  await svc.host('fire');
  tick(CFG.reactionSeconds * 1000 + CFG.graceMs + 1);
  const { game } = await svc.hostState();
  const choice = game.event.target === 'solo' ? 'Apologize' : 'Support';
  await assert.rejects(svc.act('solo', { choice }), /Time ran out/);
});

test('students cannot see the participation code or other teams\' offers before the end', async () => {
  const { svc } = setup(5);
  await svc.join('A', 'Heritage');
  await svc.join('B', 'Challenger');
  await svc.join('C', 'Niche', 'Humor');
  await svc.host('code', { code: 'SECRET' });
  await svc.host('start');
  await svc.host('roll');
  await svc.act('a', { offer: { to: 'c', amt: 8000 } }).catch(() => {});
  await svc.act('b', { offer: { to: 'c', amt: 9000 } }).catch(() => {});
  await svc.host('finalCall');
  const a = await svc.studentState('a');
  assert.equal(a.game.code, '');
  assert.ok(a.game.offers.every(o => o.brand === 'a' || o.infl === 'a'));
  const c = await svc.studentState('c');
  assert.ok(c.game.offers.every(o => o.infl === 'c'));
});

test('one answer per event: a second click is rejected', async () => {
  const { svc, tick } = setup(9);
  await svc.join('X', 'Heritage');
  await svc.join('Y', 'Niche', 'Food');
  await svc.host('start');
  await svc.host('roll');
  await svc.host('finalCall');
  await svc.host('closeDeals');
  await svc.host('fire');
  const { game } = await svc.hostState();
  tick(1000);
  const opts = game.event.target === 'y' ? 'Apologize' : 'Support';
  await svc.act('y', { choice: opts });
  await assert.rejects(svc.act('y', { choice: opts }), /already locked in/);
});
