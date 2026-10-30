// Local bridge to this project's protected Preview deployment (read-only by default).
// Run with `vercel env run --environment development -- node ...` so the
// short-lived OIDC token remains process-local and never reaches browser code.
import http from 'node:http';

const rawOrigin = process.env.L2T_EVENT_COMMUNITY_PREVIEW_URL || '';
const token = (process.env.VERCEL_OIDC_TOKEN || '').trim();
const port = Number(process.env.L2T_EVENT_COMMUNITY_PROXY_PORT || 3984);
const allowWrites = process.env.L2T_EVENT_COMMUNITY_PREVIEW_ALLOW_WRITES === 'true';
let upstream;
try {
  upstream = new URL(rawOrigin);
  if (upstream.protocol !== 'https:' || !/^letsgo2travel-[a-z0-9]+-emirkaanpolat34-9211s-projects\.vercel\.app$/.test(upstream.hostname) || upstream.origin !== rawOrigin
    || upstream.username || upstream.password || !token || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error();
} catch {
  console.error('Protected preview relay requires an exact Vercel preview origin and a development OIDC token.');
  process.exit(1);
}
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' });
  res.end(JSON.stringify(body));
};
const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && !(allowWrites && req.method === 'POST')) return json(res, 405, { error: 'Bu yerel önizleme salt okunur.', code: 'preview_read_only' });
  let path;
  try { path = new URL(req.url || '/', 'http://127.0.0.1'); } catch { return json(res, 400, { error: 'Geçersiz istek.' }); }
  // Startup probes the protected backend without a user session or a data read.
  // A listening socket alone does not prove that the short-lived OIDC works.
  if (path.pathname === '/__event-community-health') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Geçersiz denetim isteği.' });
    try {
      const response = await fetch(`${upstream.origin}/api/event-community`, {
        redirect: 'manual', signal: AbortSignal.timeout(25000),
        headers: { Accept: 'application/json', 'x-vercel-trusted-oidc-idp-token': token },
      });
      const body = (response.headers.get('content-type') || '').includes('application/json')
        ? await response.json() : null;
      if (response.status === 401 && body?.error === 'Oturum gerekli.') {
        return json(res, 200, { service: 'event-community-preview', status: 'ready', writesEnabled: allowWrites });
      }
    } catch { /* Health responses never disclose upstream bodies or credentials. */ }
    return json(res, 503, { code: 'preview_backend_unavailable', error: 'Etkinlik sohbeti bağlantısı hazır değil.' });
  }
  if (path.pathname !== '/api/event-community') return json(res, 404, { error: 'Yerel önizleme yolu bulunamadı.' });
  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || authorization.length > 4103) return json(res, 401, { error: 'Oturum gerekli.' });
  let body;
  if (req.method === 'POST') {
    if (Number(req.headers['content-length']) > 10000) return json(res, 413, { error: 'İstek çok büyük.' });
    const parts = []; let size = 0;
    try {
      for await (const part of req) {
        size += part.length;
        if (size > 10000) return json(res, 413, { error: 'İstek çok büyük.' });
        parts.push(part);
      }
      body = Buffer.concat(parts);
    } catch { return json(res, 400, { error: 'İstek okunamadı.' }); }
  }
  try {
    const response = await fetch(`${upstream.origin}${path.pathname}${path.search}`, {
      method: req.method, body, redirect: 'manual', signal: AbortSignal.timeout(25000),
      headers: { Accept: 'application/json', Authorization: authorization, 'x-vercel-trusted-oidc-idp-token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (!(response.headers.get('content-type') || '').includes('application/json')) {
      return json(res, 503, { error: 'Korumalı önizlemeye erişilemiyor. Yerel erişim oturumunu yenile.', code: 'preview_protection_unavailable' });
    }
    const reader = response.body?.getReader();
    const chunks = []; let size = 0;
    if (reader) while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); return json(res, 503, { error: 'Önizleme yanıtı alınamadı.' }); }
      chunks.push(Buffer.from(part.value));
    }
    const responseBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    // Deployment access and the user's app session are separate boundaries.
    // Vercel also returns JSON protection errors; forwarding that 401 would
    // incorrectly tell the user that signing into the app again can fix it.
    const protection = responseBody?.error;
    if (response.status >= 300 && response.status < 400
      || response.status === 401 && protection && typeof protection === 'object'
        && String(protection.code) === '401' && protection.message === 'Protected deployment') {
      return json(res, 503, { error: 'Etkinlik sohbetine şu anda bağlanılamıyor. Daha sonra tekrar dene.', code: 'preview_protection_unavailable' });
    }
    return json(res, response.status, responseBody);
  } catch (failure) {
    console.error(JSON.stringify({ eventPreviewRelayFailure: true, name: failure?.name || 'Error', causeCode: failure?.cause?.code || null }));
    return json(res, 503, { error: 'Önizleme arka ucuna şu anda ulaşılamıyor.', code: 'preview_backend_unavailable' });
  }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ eventPreviewRelay: 'ready', host: '127.0.0.1', port, previewHost: upstream.hostname, readOnly: !allowWrites })));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
