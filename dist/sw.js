// Grand Token Auto: 四九城 service worker (build 934ab75a1a)
const C = 'gta-files';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range')) return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  e.respondWith(u.searchParams.has('v') ? cacheFirst(r) : netFirst(r));
});
async function cacheFirst(r) {
  const c = await caches.open(C), hit = await c.match(r);
  if (hit) return hit;
  const res = await fetch(r);
  if (res.status === 200) c.put(r, res.clone()).catch(() => {});
  return res;
}
async function netFirst(r) {
  const c = await caches.open(C);
  try {
    const res = await fetch(r);
    if (res.status === 200) c.put(r, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await c.match(r);
    if (hit) return hit;
    throw err;
  }
}
self.addEventListener('message', (e) => {
  const keep = e.data && e.data.keep;
  if (!Array.isArray(keep)) return;
  e.waitUntil((async () => {
    const k = new Set(keep), c = await caches.open(C);
    for (const req of await c.keys()) if (new URL(req.url).searchParams.has('v') && !k.has(req.url)) await c.delete(req);
  })());
});
