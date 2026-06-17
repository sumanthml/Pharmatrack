const CACHE_NAME = 'pharmatrack-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icons.svg',
  '/manifest.json'
];

// Install Event: Caches shell assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker: Caching App Shell Assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Deletes old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🗑️ Service Worker: Clearing Old Cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Implements custom cache fallback strategies
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Stale-While-Revalidate strategy for static assets
  if (e.request.method === 'GET' && !url.pathname.startsWith('/api/') && !url.pathname.includes('/src/')) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        const fetchPromise = fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => {
          // Suppress errors when offline
        });
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Network-First-with-Cache-Fallback strategy for GET /api/medicines
  if (e.request.method === 'GET' && url.pathname.includes('/api/medicines')) {
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, cacheCopy);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          console.warn('📶 Network unavailable, serving cached medicines list.');
          return caches.match(e.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // Return empty list if cache doesn't contain results
            return new Response(JSON.stringify([]), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
  }
});
