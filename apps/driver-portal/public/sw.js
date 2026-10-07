// TamCar Driver Portal Service Worker — Web Push receiver.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch handler minimal (passthrough) — nécessaire pour que Chrome
// propose l'installation PWA. Sinon les critères d'installabilité échouent.
self.addEventListener('fetch', () => {
  // Passthrough : on ne intercepte rien, mais le listener doit exister.
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'TamCar Pro', body: event.data.text() };
  }
  const {
    title = 'TamCar Pro',
    body = '',
    tag,
    url = '/',
    vibrate = [80, 40, 80, 40, 80],
    requireInteraction = true, // chauffeur : alertes persistent
    renotify = false,
    ring,
  } = payload;

  // Fin d'alerte (la demande a été annulée, prise ou a expiré) : le système exige qu'un push affiche quelque
  // chose, donc on REMPLACE l'alerte (même tag) par un court message silencieux, puis on le retire.
  if (ring === 'end') {
    event.waitUntil(
      (async () => {
        await self.registration.showNotification(title, {
          body,
          tag,
          silent: true,
          requireInteraction: false,
          icon: '/icons/icon-192.png',
          badge: '/icons/badge-tamcar.png',
          data: { url: '/' },
        });
        await new Promise((resolve) => setTimeout(resolve, 6000));
        const list = await self.registration.getNotifications({ tag });
        list.forEach((n) => n.close());
      })(),
    );
    return;
  }

  const options = {
    body,
    tag,
    vibrate,
    requireInteraction,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-tamcar.png',
    data: { url },
    // Nouvelle demande : même tag = remplacement, mais on RE-sonne à chaque envoi (cercles suivants).
    ...(renotify && tag ? { renotify: true } : {}),
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
