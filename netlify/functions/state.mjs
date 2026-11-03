// GET /api/state?team=<slug>&v=<version>        a player's view
// GET /api/state?role=host&v=<version>          the host's view (needs X-Host-Key)
import { service, json, handle, requireHost, requireMethod, versionOf } from './_lib/server.mjs';

export default handle(async req => {
  requireMethod(req, 'GET');
  const url = new URL(req.url);
  const svc = service();
  let data;
  if (url.searchParams.get('role') === 'host') {
    requireHost(req);
    data = await svc.hostState();
  } else {
    data = await svc.studentState(url.searchParams.get('team') || '');
  }
  const { serverNow, ...rest } = data;
  const version = versionOf(rest);
  if (url.searchParams.get('v') === version) return json({ unchanged: true, version, serverNow });
  return json({ ...rest, unchanged: false, version, serverNow });
});

export const config = { path: '/api/state' };
