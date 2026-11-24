const CACHE_NAME = 'zelvo-pwa-v2';
const CORE_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => undefined);
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
  );
});

// Handle remote Web Push events (daily visits & pending payment reminders)
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Zelvo — Serviços no Terreno',
    body: 'Tem atualizações pendentes na sua agenda ou finanças.',
    tag: 'zelvo-general',
    tab: 'today',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: payload.tag,
      renotify: true,
      data: { tab: payload.tab || 'today' },
    })
  );
});

// Handle local notification triggers dispatched from the PWA client via postMessage
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'SHOW_NOTIFICATION') return;

  const { title, body, tag, tab } = data.payload || {};
  event.waitUntil(
    self.registration.showNotification(title || 'Zelvo', {
      body: body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: tag || 'zelvo-alert',
      renotify: true,
      data: { tab: tab || 'today' },
    })
  );
});

// Focus existing app window and navigate to the relevant tab on notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetTab = (event.notification.data && event.notification.data.tab) || 'today';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'NAVIGATE_TAB', tab: targetTab });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
      return undefined;
    })
  );
});
