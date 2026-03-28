const CACHE_NAME = 'sauf-imprevu-backoffice-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE).catch((err) => {
        console.log('Cache addAll error:', err);
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API calls - always go to network
  if (request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        // Cache HTML, CSS, JS, fonts, and images
        if (
          request.url.includes('.html') ||
          request.url.includes('.css') ||
          request.url.includes('.js') ||
          request.url.includes('.woff') ||
          request.url.includes('.woff2') ||
          request.url.includes('.ttf') ||
          request.url.includes('.eot') ||
          request.url.includes('.svg') ||
          request.url.includes('.png') ||
          request.url.includes('.jpg') ||
          request.url.includes('.jpeg') ||
          request.url.includes('.gif') ||
          request.url.includes('fonts.googleapis.com')
        ) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }

        return response;
      }).catch(() => {
        // Return a cached response if available, otherwise return offline page
        return caches.match('/index.html').then((response) => {
          return response || new Response('Offline - Unable to fetch resource', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      });
    })
  );
});

// Background sync for reservations (optional enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reservations') {
    event.waitUntil(syncReservations());
  }
});

async function syncReservations() {
  try {
    // Placeholder for syncing reservations when back online
    return Promise.resolve();
  } catch (err) {
    console.log('Sync failed:', err);
    return Promise.resolve();
  }
}

// Push notifications (optional enhancement)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nouvelle notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'sauf-imprevu-notification'
  };

  event.waitUntil(
    self.registration.showNotification('Sauf Imprévu', options)
  );
});
