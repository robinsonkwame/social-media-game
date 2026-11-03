// POST /api/act { slug, ...choice }  -> { ok, act }
// The choice depends on the phase: deal window { buy, pref1, pref2, offer },
// final call { raise } or { accept: [brand slugs] }, event window { choice }.
import { service, json, handle, requireMethod, body } from './_lib/server.mjs';

export default handle(async req => {
  requireMethod(req, 'POST');
  const { slug, ...choice } = await body(req);
  return json(await service().act(String(slug || ''), choice));
});

export const config = { path: '/api/act' };
