// POST /api/join { name, profile, tag? }  -> the team (new, or existing for the same name)
import { service, json, handle, requireMethod, body } from './_lib/server.mjs';

export default handle(async req => {
  requireMethod(req, 'POST');
  const { name, profile, tag } = await body(req);
  return json(await service().join(String(name || ''), String(profile || ''), String(tag || '')));
});

export const config = { path: '/api/join' };
