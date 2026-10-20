/*
 * Learnovize service worker.
 *
 * The hard rule here: this caches NOTHING that belongs to a person.
 *
 * Everything on this platform is authenticated -- seats, payments, certificates,
 * trainer applications, and identity documents. A service worker that cached pages or
 * API responses would show one person's data to whoever used the device next, serve a
 * stale "unpaid" banner to somebody who had just paid, and keep a learner's details in
 * a cache after they logged out. None of that is worth the offline convenience.
 *
 * So the policy is deliberately narrow:
 *
 *   /_next/static/*  cache-first. These are content-hashed filenames, immutable by
 *                    construction, and carry no personal data.
 *   everything else   network only. No cache read, no cache write.
 *   offline + a page  the offline page, so a dropped connection says so plainly
 *                    instead of showing the browser's dinosaur.
 *
 * The classroom is unaffected: LiveKit runs over a websocket, which never reaches a
 * fetch handler.
 */

const VERSION = 'learnovize-v1';
const SHELL = `${VERSION}-shell`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icon-192.png', '/icon-512.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Same origin only. A cross-origin request is LiveKit, Paystack or a font, and none of
  // them should be proxied through here.
  if (url.origin !== self.location.origin) return;

  // Hashed build output is safe to serve from cache when the network is slow or gone.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            // Opaque or error responses are not worth storing.
            if (response && response.status === 200 && response.type === 'basic') {
              const copy = response.clone();
              caches.open(SHELL).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((hit) => hit || Response.error())),
    );
  }
  // Anything not matched above falls through to the network untouched. No respondWith
  // means no interception, which is the safest default available.
});

/* ------------------------------------------------------------------ *
 * Push
 *
 * The only thing this worker is allowed to show somebody is a
 * notification the server sent. It never reaches the network for a
 * payload on its own, and it never shows a message it did not receive.
 * ------------------------------------------------------------------ */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Learnovize', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Learnovize';
  const options = {
    body: data.body || '',
    // Same tag replaces the previous notification rather than stacking, so a class that
    // reminds you twice does not leave two on your lock screen.
    tag: data.tag || 'learnovize',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // A tab that is already open on the app should be brought to the front rather than a
      // second copy of the app opening.
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});
