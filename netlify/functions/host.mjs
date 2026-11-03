// POST /api/host { action, ...payload }
// actions: start, roll, finalCall, closeDeals, fire, resolve, next, extend,
// finish, code, bots, fill, kick, unstick, reset.
// Requires the X-Host-Key header to match the HOST_KEY environment variable.
import { service, json, handle, requireHost, requireMethod, body } from './_lib/server.mjs';

export default handle(async req => {
  requireMethod(req, 'POST');
  requireHost(req);
  const { action, ...payload } = await body(req);
  return json(await service().host(String(action || ''), payload));
});

export const config = { path: '/api/host' };
