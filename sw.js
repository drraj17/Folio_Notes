'use strict';

const CACHE_VERSION = 'folio-v2';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      for (const relPath of PRECACHE_ASSETS) {
        try {
          const assetUrl = new URL(relPath, self.registration.scope).toString();
          await cache.add(assetUrl);
        } catch {
          // Ignore individual missing assets so installation never breaks
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((oldKey) => caches.delete(oldKey))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const reqUrl = new URL(req.url);

  // Never intercept cross-origin URLs or GitHub API requests
  if (reqUrl.origin !== self.location.origin) return;
  if (reqUrl.hostname === 'api.github.com') return;

  // Navigation requests: network first, fallback to cached index.html when offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              const indexUrl = new URL('./index.html', self.registration.scope).toString();
              cache.put(indexUrl, copy).catch(() => {});
            });
          }
          return networkRes;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_VERSION);
          const indexUrl = new URL('./index.html', self.registration.scope).toString();
          return (await cache.match(indexUrl)) || (await cache.match(req));
        })
    );
    return;
  }

  // Same-origin static files: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            cache.put(req, networkRes.clone()).catch(() => {});
          }
          return networkRes;
        })
        .catch(() => null);

      return cached || fetchPromise;
    })
  );
});