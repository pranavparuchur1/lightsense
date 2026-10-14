// LightSense service worker: offline app shell + last-known weather.
//   navigations      → network first, fall back to the cached shell
//   same-origin GETs → stale-while-revalidate (hashed build assets, fonts, icons)
//   Open-Meteo       → network first, fall back to the last cached response
const CACHE = 'lightsense-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(fallbackUrl ?? req, res.clone());
    return res;
  } catch {
    return (await cache.match(fallbackUrl ?? req)) ?? Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const update = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit ?? Response.error());
  return hit ?? update;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, './index.html'));
  if (url.hostname.endsWith('open-meteo.com')) return e.respondWith(networkFirst(req));
  if (url.origin === self.location.origin) return e.respondWith(staleWhileRevalidate(req));
});
