const CACHE_NAME = 'viblend-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/css/main.css',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/room.js',
  '/js/taste.js',
  '/js/algorithm.js',
  '/js/player.js',
  '/js/karaoke.js',
  '/js/ui.js',
  '/js/pwa.js',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const API_PATTERNS = [
  /supabase\.co/,
  /spotify\.com/,
  /googleapis\.com/,
  /youtube\.com/,
  /apple\.com/,
  /peerjs\.com/
];

function isAPIRequest(url) {
  return API_PATTERNS.some(p => p.test(url));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (isAPIRequest(req.url)) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
  } else {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(response => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return response;
        }).catch(() => {
          if (req.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
    );
  }
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Viblend', {
      body: data.body || 'Something is happening in your party!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: data
    })
  );
});
