const CACHE = 'diamond-edge-v3';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.add('./index.html'))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept external API calls
  if (url.origin !== self.location.origin) return;

  // Only cache the HTML app shell
  if (e.request.mode !== 'navigate' && !url.pathname.endsWith('.html')) return;

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);

      const fetchPromise = fetch(e.request).then(async fresh => {
        // Detect version change by comparing ETag / Last-Modified headers
        const newSig = fresh.headers.get('etag') || fresh.headers.get('last-modified');
        const oldSig = cached?.headers?.get('etag') || cached?.headers?.get('last-modified');

        if (newSig && oldSig && newSig !== oldSig) {
          // New deploy detected — tell all open tabs to clear data caches
          const clients = await self.clients.matchAll({ includeUncontrolled: true });
          clients.forEach(c => c.postMessage({ type: 'APP_UPDATED' }));
        }

        cache.put(e.request, fresh.clone());
        return fresh;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
