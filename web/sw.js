// NutriFood Service Worker — offline cache for static assets
const CACHE_NAME = 'nutrifood-v2';
const STATIC_ASSETS = [
  '/nutri-food/',
  '/nutri-food/foods.json',
  '/nutri-food/favicon.svg',
  '/nutri-food/manifest.json',
  '/nutri-food/js/app.bundle.js',
  '/nutri-food/js/tracking.js',
  '/nutri-food/js/deals.js',
  '/nutri-food/js/suggestions.js',
  '/nutri-food/js/grocery.js',
  '/nutri-food/js/history.js',
  '/nutri-food/js/cnf.js',
  '/nutri-food/js/food-modal.js',
  '/nutri-food/js/share.js',
  '/nutri-food/js/journal.js',
];

// Install: pre-cache static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch strategy:
// - API requests (/api/): network-only (always need fresh data)
// - Static assets: cache-first, fall back to network
// - Navigation requests: network-first, fall back to cached index.html (offline)
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') { return; }

  // Skip cross-origin requests (Cloudflare, etc.)
  if (url.origin !== self.location.origin) { return; }

  // API requests: always try network
  if (url.pathname.startsWith('/nutri-food/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigation requests: network-first, offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match('/nutri-food/');
      })
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) { return cached; }
      return fetch(event.request).then(function(response) {
        // Cache successful responses for future use
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline and not cached — nothing we can do
        return Response.error();
      });
    })
  );
});
