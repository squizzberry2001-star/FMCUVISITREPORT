// FMCU Visit Store Report - Service Worker for Mobile & Desktop Push Notifications
const CACHE_NAME = 'fmcu-notif-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.title || 'FMCU Visit Notification';
    const options = {
      body: payload.body || '',
      icon: payload.icon || 'assets/taro.gif',
      badge: payload.badge || 'assets/taro.gif',
      vibrate: [200, 100, 200],
      tag: payload.tag || 'fmcu-push-' + Date.now(),
      renotify: true,
      data: payload.data || { url: './' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('FMCU Visit Store Report', {
        body: text,
        icon: 'assets/taro.gif',
        badge: 'assets/taro.gif'
      })
    );
  }
});
