// FMCU Visit Store Report - Service Worker for Mobile & Desktop Background Push Notifications
const SW_VERSION = 'fmcu-sw-v3-1793674611481';
const CACHE_STATE_KEY = 'fmcu-notif-state-v1';
const STATE_URL = '/__fmcu_notif_state__.json';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(() => {
      // Jalankan evaluasi pengingat pertama saat Service Worker aktif
      checkAndTriggerBackgroundReminders();
    })
  );
});

// ============================================================================
// HELPER: STATE PERSISTENCE VIA CACHE STORAGE (Accessible even when tab is closed)
// ============================================================================
async function loadStoredNotifState() {
  try {
    const cache = await caches.open(CACHE_STATE_KEY);
    const res = await cache.match(STATE_URL);
    if (!res) return null;
    return await res.json();
  } catch (err) {
    console.warn('[SW] Gagal membaca state notifikasi dari cache:', err);
    return null;
  }
}

async function saveStoredNotifState(stateObj) {
  try {
    const cache = await caches.open(CACHE_STATE_KEY);
    const res = new Response(JSON.stringify(stateObj), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(STATE_URL, res);
  } catch (err) {
    console.warn('[SW] Gagal menyimpan state notifikasi ke cache:', err);
  }
}

// ============================================================================
// BACKGROUND REMINDER ENGINE: JAM-JAM TERTENTU & INTERVAL BERKALA
// ============================================================================
async function checkAndTriggerBackgroundReminders() {
  const state = await loadStoredNotifState();
  if (!state || !state.currentUser) return;

  // Waktu saat ini dalam Waktu Indonesia Barat (WIB / UTC+7)
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const wibDate = new Date(utcMs + 7 * 3600000);

  const currentHour = wibDate.getHours();
  const currentMinute = wibDate.getMinutes();
  const totalMins = currentHour * 60 + currentMinute;
  const todayStr = wibDate.toISOString().slice(0, 10);

  state.sent = state.sent || {};

  const todaySchedules = Array.isArray(state.todaySchedules) ? state.todaySchedules : [];
  const activeCheckIn = state.activeCheckIn || null;
  const hasActiveCheckIn = Boolean(activeCheckIn && activeCheckIn.storeCode);
  const pendingSchedules = todaySchedules.filter((s) => s.status !== 'COMPLETED' && !s.hasReport);
  const overdueCount = Number(state.overdueCount || 0);

  const showNotification = async (title, body, tag, data = {}) => {
    try {
      await self.registration.showNotification(title, {
        body,
        icon: 'icon-192.png',
        badge: 'favicon-32x32.png',
        tag,
        renotify: true,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        data: { url: './', ...data }
      });
    } catch (err) {
      console.warn('[SW] showNotification error:', err);
    }
  };

  let stateModified = false;

  // ==========================================================================
  // ATURAN NOTIFIKASI TERORGANISIR SERVICE WORKER (HANYA 3 KONDISI, 0% SPAM):
  // 1. Jadwal Baru
  // 2. Jadwal Terlewat (Overdue)
  // 3. Form Visit Belum Selesai (Sesi Aktif)
  // ==========================================================================

  // KONDISI 1: PENUGASAN JADWAL BARU
  if (Array.isArray(state.newlyAssigned) && state.newlyAssigned.length > 0) {
    const newItems = state.newlyAssigned;
    const storeNames = newItems.map((s) => s.storeName).slice(0, 2).join(', ');
    const extra = newItems.length > 2 ? ` (+${newItems.length - 2} lainnya)` : '';
    await showNotification(
      `🆕 Penugasan Jadwal Visit Baru (${newItems.length} Toko)`,
      `Anda mendapatkan penugasan visit baru: ${storeNames}${extra}. Buka aplikasi untuk meninjau detailnya.`,
      `fmcu-new-sch-${Date.now()}`
    );
    state.newlyAssigned = [];
    stateModified = true;
  }

  // KONDISI 2: JADWAL TERLEWAT (OVERDUE) - Maksimal 1x per hari
  const overdueKey = `overdue_${todayStr}`;
  if (overdueCount > 0 && !state.sent[overdueKey]) {
    await showNotification(
      `⏰ ${overdueCount} Jadwal Visit Terlewat`,
      `Terdapat ${overdueCount} jadwal kunjungan lampau yang belum selesai. Buka aplikasi untuk memeriksa status kunjungan Anda.`,
      `fmcu-overdue-${todayStr}`
    );
    state.sent[overdueKey] = Date.now();
    stateModified = true;
  }

  // KONDISI 3: FORM VISIT BELUM SELESAI (SESI AKTIF) - Maksimal 1x per 90 Menit
  if (hasActiveCheckIn) {
    const lastActiveSent = Number(state.sent.lastActiveReminderTs || 0);
    const nowTs = Date.now();
    if (nowTs - lastActiveSent >= 90 * 60 * 1000) {
      await showNotification(
        `⏳ Form Visit Belum Selesai: FamilyMart ${activeCheckIn.storeName || activeCheckIn.storeCode}`,
        `Sesi kunjungan masih aktif berjalan. Pastikan data checklist, foto QSC, dan observasi dikirimkan sebelum meninggalkan toko.`,
        `fmcu-active-visit-${Math.floor(nowTs / (90 * 60 * 1000))}`
      );
      state.sent.lastActiveReminderTs = nowTs;
      stateModified = true;
    }
  }

  if (stateModified) {
    await saveStoredNotifState(state);
  }
}

// ============================================================================
// LISTENERS: MESSAGE (FROM WEB APP), PERIODIC SYNC, BACKGROUND SYNC, & TICKER
// ============================================================================
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'SYNC_NOTIF_DATA') {
    event.waitUntil(
      (async () => {
        const existing = (await loadStoredNotifState()) || {};
        const merged = {
          ...existing,
          ...event.data.payload,
          sent: existing.sent || {}
        };
        await saveStoredNotifState(merged);
        await checkAndTriggerBackgroundReminders();
      })()
    );
  } else if (event.data.type === 'TRIGGER_CHECK') {
    event.waitUntil(checkAndTriggerBackgroundReminders());
  }
});

// Periodic Background Sync (Chromium / Android PWA)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'fmcu-visit-reminder' || event.tag === 'fmcu-sync-reminders') {
    event.waitUntil(checkAndTriggerBackgroundReminders());
  }
});

// One-off Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'fmcu-sync-reminders' || event.tag === 'fmcu-visit-reminder') {
    event.waitUntil(checkAndTriggerBackgroundReminders());
  }
});

// Background Interval Ticker (Tetap berjalan saat worker aktif di background browser)
setInterval(() => {
  checkAndTriggerBackgroundReminders();
}, 4 * 60 * 1000);

// ============================================================================
// NOTIFICATION CLICK & SERVER PUSH
// ============================================================================
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
      icon: payload.icon || 'icon-192.png',
      badge: payload.badge || 'favicon-32x32.png',
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
        icon: 'icon-192.png',
        badge: 'favicon-32x32.png'
      })
    );
  }
});
