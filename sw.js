// Same pattern as the gym tracker. Bump CACHE_NAME whenever app.js, logic.js and index.html change together.
const CACHE_NAME = 'dog-days-v2';
const ASSETS = ['./', './index.html', './style.css', './logic.js', './app.js', './manifest.json', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Own files: answer from the cache, refresh in the background. Weather and fireworks APIs (other origins) go straight to the network.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(e.request).then((cached) => {
        const fresh = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; });
        if (!cached) return fresh;
        e.waitUntil(fresh.catch(() => {}));
        return cached;
      })
    )
  );
});
