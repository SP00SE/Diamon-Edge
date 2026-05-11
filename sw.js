const CACHE = 'diamond-edge-v1';

self.addEventListener('install', e => {
  // Cache the app shell (entire single-file app) on first install
  e.waitUntil(
    caches.open(CACHE).then(c => c.add('./index.html'))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Remove any old cache versions
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept external API calls (MLB stats, weather, etc.)
  if (url.origin !== self.location.origin) return;

  // Only cache the HTML navigation request (the app shell)
  if (e.request.mode !== 'navigate' && !url.pathname.endsWith('.html')) return;

  // Stale-while-revalidate: serve from cache instantly, update cache in background
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const network = fetch(e.request).then(fresh => {
          cache.put(e.request, fresh.clone());
          return fresh;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
