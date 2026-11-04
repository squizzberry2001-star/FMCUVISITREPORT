// FMCU Visit Store Report - Service Worker (Lightweight & Battery-Friendly PWA Asset Manager)
const SW_VERSION = 'fmcu-sw-v5-1800090000000';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Listener untuk pesan kontrol PWA (Skip Waiting)
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
