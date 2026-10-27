/* Qmail service worker: PWA shell + push notifications.
   Pushes arrive without a payload by design (no mail content ever
   transits the push service), so the notification is generic. */

const OFFLINE_CACHE = 'qmail-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('qmail-offline-') && key !== OFFLINE_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Network-only for mail, API requests and assets. Cache only the public offline
// document; never persist a personalized response, login session or attachment.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname === '/api' || url.pathname.startsWith('/api/') || event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(async () => {
    const offline = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
    return offline || new Response('Qmail is offline. Reconnect and try again.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }));
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Qmail', {
      body: 'You have new mail.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'qmail-new-mail',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate('/inbox');
          return client.focus();
        }
      }
      return self.clients.openWindow('/inbox');
    })
  );
});
