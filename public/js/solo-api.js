// Backend for the solo practice page: the real server logic (service.js) on
// this browser's localStorage, with five bots and the player as the host.
// Joining adds the bots and starts the game; the player's own buttons then
// run each host step. A reload picks up where the game left off.
import { createService } from './service.js';
import { createKvStore } from './kv.js';

const P = 'vp:solo:';
const listeners = new Set();
const store = createKvStore({
  read: k => localStorage.getItem(P + k),
  write: (k, v) => localStorage.setItem(P + k, v),
  remove: k => localStorage.removeItem(P + k),
  keys: () => Object.keys(localStorage).filter(k => k.startsWith(P)).map(k => k.slice(P.length)),
}, { onWrite: () => setTimeout(() => listeners.forEach(cb => cb()), 0) });

const svc = createService(store);

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function createSoloApi() {
  return {
    mode: 'solo',
    now: () => Date.now(),
    async getState({ slug = '' } = {}, version) {
      const { serverNow, ...data } = await svc.studentState(slug);
      const v = hash(JSON.stringify(data));
      if (v === version) return { unchanged: true, version: v, serverNow };
      return { ...data, unchanged: false, version: v, serverNow };
    },
    async join(name, profile, tag) {
      const { game } = await svc.hostState();
      if (game.phase !== 'lobby') await svc.host('reset');
      const team = await svc.join(name, profile, tag);
      // three brands and three influencers, you included
      await svc.host('bots', { role: 'brand', count: team.role === 'brand' ? 2 : 3 });
      await svc.host('bots', { role: 'infl', count: team.role === 'infl' ? 2 : 3 });
      await svc.host('start');
      return team;
    },
    act: (slug, choice) => svc.act(slug, choice),
    leave: slug => svc.leave(slug),
    host: (action, payload = {}) => svc.host(action, payload),
    onChange(cb) { listeners.add(cb); },
  };
}
