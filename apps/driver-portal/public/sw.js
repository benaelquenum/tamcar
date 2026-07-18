// TamCar Driver Portal Service Worker — Web Push receiver.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'TamCar Chauffeur', body: event.data.text() };
  }
  const {
    title = 'TamCar Chauffeur',
    body = '',
    tag,
    url = '/',
    icon = '/icon-192.png',
    badge = '/icon-72.png',
    vibrate = [80, 40, 80, 40, 80],
    requireInteraction = true, // chauffeur : alertes persistent
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon,
      badge,
      vibrate,
      requireInteraction,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of clients) {
        if ('focus' in c) {
          try {
            await c.focus();
            if ('navigate' in c) await c.navigate(url);
            return;
          } catch { /* ignore */ }
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })(),
  );
});
