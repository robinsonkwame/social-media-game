// Simulated backend for `?debug=1` mode. Runs the real server logic
// (service.js) against localStorage instead of Netlify Blobs, and pings other
// tabs over BroadcastChannel, so one person can play host and several
// players side by side with nothing deployed.
import { createService } from './service.js';
import { createKvStore } from './kv.js';

const P = 'vp:kv:';
const chan = 'BroadcastChannel' in globalThis ? new BroadcastChannel('viral-path') : null;

const store = createKvStore({
  read: k => localStorage.getItem(P + k),
  write: (k, v) => localStorage.setItem(P + k, v),
  remove: k => localStorage.removeItem(P + k),
  keys: () => Object.keys(localStorage).filter(k => k.startsWith(P)).map(k => k.slice(P.length)),
}, { onWrite: () => chan?.postMessage('changed') });

const svc = createService(store);
const latency = () => new Promise(r => setTimeout(r, 60 + Math.random() * 140));

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function createMockApi() {
  return {
    mode: 'mock',
    now: () => Date.now(),
    async getState({ slug = '', role = '' } = {}, version) {
      const { serverNow, ...data } = role === 'host' ? await svc.hostState() : await svc.studentState(slug);
      const v = hash(JSON.stringify(data));
      if (v === version) return { unchanged: true, version: v, serverNow };
      return { ...data, unchanged: false, version: v, serverNow };
    },
    async join(name, profile, tag) { await latency(); return svc.join(name, profile, tag); },
    async act(slug, choice) { await latency(); return svc.act(slug, choice); },
    async leave(slug) { await latency(); return svc.leave(slug); },
    async host(action, payload = {}) { await latency(); return svc.host(action, payload); },
    onChange(cb) {
      chan?.addEventListener('message', cb);
      window.addEventListener('storage', e => { if (e.key?.startsWith(P)) cb(); });
    },
  };
}
