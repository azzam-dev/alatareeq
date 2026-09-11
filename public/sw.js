// Service Worker بسيط: يخزن هيكل التطبيق للعمل بدون شبكة، ويوصل أزرار الإشعارات للصفحة.
const CACHE = 'alatareeq-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // خدمات الخرائط والخطوط: من الشبكة دائمًا
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action || 'open';
  const alertId = event.notification.data && event.notification.data.alertId;
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients[0];
      if (client) {
        client.postMessage({ type: 'notification-action', alertId, action });
        return client.focus();
      }
      return self.clients.openWindow('./#drive');
    }),
  );
});
