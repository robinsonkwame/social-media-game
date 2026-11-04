// Server-side game logic over a key-value store with etags (see kv.js for the
// interface). The Netlify functions run this against Netlify Blobs; the
// in-browser simulator (?debug=1) runs the very same code against localStorage.
//
// Layout:
//   game                                   the whole game, teams included; written only
//                                          by join/leave and host actions, always with
//                                          compare-and-swap
//   g/<gameId>/acts/<round>/<stage>/<slug> one team's choices for a stage (deal, final,
//                                          event), written only by that team
//
// Host steps that read teams' choices first mark the game `closing`, then read
// the choices, then apply them. A team that writes a choice re-checks the game
// afterwards, so a choice is either counted or the team is told it was too late.
import * as E from './engine.js';

const { GameError } = E;
const STAGE_OF_PHASE = { deals: 'deal', final: 'final', event: 'event' };

export function createService(store, { now = () => Date.now(), rng = Math.random } = {}) {
  const actPrefix = (gid, round, stage) => `g/${gid}/acts/${round}/${stage}/`;
  const actKey = (gid, round, stage, slug) => `${actPrefix(gid, round, stage)}${slug}`;

  async function loadGame() {
    const r = await store.get('game');
    if (r) return { game: r.data, etag: r.etag };
    await store.set('game', E.newGame(now(), rng), { ifNew: true });
    const again = await store.get('game');
    return { game: again.data, etag: again.etag };
  }

  // Load, change and save the game with compare-and-swap, retrying when
  // someone else (a join, another host click) wrote first.
  async function withGame(fn) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { game, etag } = await loadGame();
      const next = structuredClone(game);
      const out = await fn(next);
      next.updatedAt = now();
      if (await store.set('game', next, { ifMatch: etag })) return { game: next, out };
      await new Promise(r => setTimeout(r, 40 + Math.random() * 120));
    }
    throw new GameError('The game is busy. Try again in a moment.', 409);
  }

  async function readActs(gid, round, stage) {
    const keys = await store.list(actPrefix(gid, round, stage));
    const docs = await Promise.all(keys.map(k => store.get(k)));
    const out = {};
    keys.forEach((k, i) => { if (docs[i]) out[k.slice(k.lastIndexOf('/') + 1)] = docs[i].data; });
    return out;
  }

  // Two-step host action for stages where teams submit choices.
  async function closeStage(phase, apply) {
    const stage = STAGE_OF_PHASE[phase];
    const { game } = await withGame(g => {
      if (g.phase !== phase) throw new GameError(`That step only works during ${phase}`);
      g.closing = phase;
    });
    const acts = await readActs(game.id, game.round, stage);
    await withGame(g => {
      if (g.phase !== phase || g.closing !== phase) throw new GameError('That step already ran');
      apply(g, acts);
      g.closing = null;
    });
  }

  // What a phone may see: everything public, its own team in full, and only
  // the offers that concern it. The participation code appears at the end.
  function publicGame(game, slug) {
    const g = { ...game, teams: {} };
    for (const [s, t] of Object.entries(game.teams)) {
      g.teams[s] = s === slug ? t : { ...t, history: undefined, cur: undefined, paid: undefined, past: undefined, pref1: undefined, pref2: undefined };
    }
    if (game.phase !== 'finished') g.code = '';
    if (game.event) {
      const t = now();
      const bots = {};
      for (const [s, b] of Object.entries(game.event.bots || {})) if (b.at && b.at <= t) bots[s] = { choice: b.choice, at: b.at };
      g.event = { ...game.event, bots };
    }
    g.offers = (game.offers || []).filter(o => o.brand === slug || o.infl === slug);
    g.partnerships = game.phase === 'finished' ? game.partnerships : [];
    return g;
  }

  return {
    async studentState(slug) {
      const { game } = await loadGame();
      slug = E.slugify(slug);
      const team = slug ? game.teams[slug] || null : null;
      const stage = STAGE_OF_PHASE[game.phase];
      let myAct = null;
      if (team && stage) myAct = (await store.get(actKey(game.id, game.round, stage, slug)))?.data || null;
      return { game: publicGame(game, slug), me: team ? slug : null, myAct, serverNow: now() };
    },

    async hostState() {
      const { game } = await loadGame();
      const stage = STAGE_OF_PHASE[game.phase];
      const acts = stage ? await readActs(game.id, game.round, stage) : {};
      return { game, submitted: Object.keys(acts), acts: stage === 'event' ? acts : {}, serverNow: now() };
    },

    async join(name, profile, tag) {
      const { out } = await withGame(g => E.addTeam(g, { name, profile, tag }, now(), rng));
      return out;
    },

    async leave(slug) {
      slug = E.slugify(slug);
      await withGame(g => {
        if (g.phase !== 'lobby') throw new GameError('You can only leave before the game starts. Ask the host if you need to.');
        if (g.teams[slug]) E.removeTeam(g, slug);
      });
      return { ok: true };
    },

    async act(slug, payload = {}) {
      slug = E.slugify(slug);
      const { game } = await loadGame();
      const t = game.teams[slug];
      if (!t) throw new GameError('Your team was not found. Join again.', 404);
      const stage = STAGE_OF_PHASE[game.phase];
      if (!stage) throw new GameError('Nothing to submit right now');
      let doc;
      if (stage === 'deal') doc = E.checkDeal(game, t, payload);
      else if (stage === 'final') doc = E.checkFinal(game, t, payload);
      else doc = E.checkReaction(game, t, payload, now());
      const key = actKey(game.id, game.round, stage, slug);
      if (stage === 'event') {
        // the first answer is final
        if (!(await store.set(key, doc, { ifNew: true }))) throw new GameError('You already locked in an answer');
      } else {
        await store.set(key, doc);
      }
      const after = (await loadGame()).game;
      if (after.id !== game.id || after.round !== game.round || after.phase !== game.phase || after.closing === game.phase) {
        throw new GameError('The host moved on just as you sent that. It may not count.', 409);
      }
      return { ok: true, act: doc };
    },

    async host(action, payload = {}) {
      switch (action) {
        case 'start': await withGame(g => E.startGame(g)); break;
        case 'roll': await withGame(g => E.rollAll(g, rng)); break;
        case 'finalCall': await closeStage('deals', (g, acts) => E.finalCall(g, acts, rng)); break;
        case 'closeDeals': await closeStage('final', (g, acts) => E.closeDeals(g, acts, rng)); break;
        case 'fire': await withGame(g => E.fireEvent(g, now(), rng)); break;
        case 'startTimer': await withGame(g => E.startTimer(g, now())); break;
        case 'addTime': await withGame(g => E.addTime(g, payload.seconds, now())); break;
        case 'timer': await withGame(g => E.setReactionSeconds(g, payload.seconds)); break;
        case 'dice': await withGame(g => E.setDiceSides(g, payload.sides)); break;
        case 'resolve': await closeStage('event', (g, acts) => E.resolveEvent(g, acts, now(), rng)); break;
        case 'next': await withGame(g => E.nextRound(g)); break;
        case 'extend': await withGame(g => E.extendGame(g)); break;
        case 'finish': await withGame(g => E.finishGame(g, rng)); break;
        case 'unstick': await withGame(g => { g.closing = null; }); break;
        case 'code': await withGame(g => { g.code = String(payload.code || '').trim().slice(0, 40); }); break;
        case 'kick': await withGame(g => E.removeTeam(g, E.slugify(payload.slug))); break;
        case 'bots': {
          const role = payload.role === 'infl' ? 'infl' : 'brand';
          await withGame(g => E.addBots(g, role, Math.max(1, Math.min(6, Number(payload.count) || 1)), now(), rng));
          break;
        }
        case 'fill': {
          // add bots to the short side so brands and influencers are even
          await withGame(g => {
            const ts = Object.values(g.teams);
            const nb = ts.filter(t => t.role === 'brand').length, ni = ts.length - nb;
            if (nb === ni) throw new GameError('The sides are already even');
            E.addBots(g, nb < ni ? 'brand' : 'infl', Math.abs(nb - ni), now(), rng);
          });
          break;
        }
        case 'reset': {
          const { game: old } = await loadGame();
          await withGame(g => { Object.keys(g).forEach(k => delete g[k]); Object.assign(g, E.newGame(now(), rng), { code: old.code, reactionSeconds: old.reactionSeconds || g.reactionSeconds, diceSides: old.diceSides || g.diceSides }); });
          const keys = await store.list(`g/${old.id}/`);
          await Promise.all(keys.map(k => store.del(k)));
          break;
        }
        default:
          throw new GameError(`Unknown host action: ${action}`);
      }
      return { ok: true };
    },
  };
}
