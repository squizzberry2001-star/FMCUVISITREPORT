// FMCU Visit Store Report - Service Worker for Mobile & Desktop Background Push Notifications
const SW_VERSION = 'fmcu-sw-v2';
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

  // --------------------------------------------------------------------------
  // KETENTUAN 1: PENGINGAT PAGI (08:00 - 08:50 WIB)
  // Menjelang jam 08:30 WIB batas check-in kedatangan
  // --------------------------------------------------------------------------
  const morningKey = `morning_${todayStr}`;
  if (totalMins >= 8 * 60 && totalMins <= 8 * 60 + 50 && !state.sent[morningKey]) {
    if (pendingSchedules.length > 0) {
      const storeNames = pendingSchedules.map((s) => s.storeName).slice(0, 2).join(', ');
      const extra = pendingSchedules.length > 2 ? ` (+${pendingSchedules.length - 2} lainnya)` : '';
      await showNotification(
        '🌅 Pengingat Jadwal Visit Toko (08:30 WIB)',
        `Selamat pagi! Jadwal visit Anda hari ini: ${storeNames}${extra}. Segera buka aplikasi dan lakukan check-in di toko.`,
        `fmcu-remind-morning-${todayStr}`
      );
      state.sent[morningKey] = Date.now();
      stateModified = true;
    }
  }

  // --------------------------------------------------------------------------
  // KETENTUAN 2: PENGINGAT OBSERVASI SIANG & FORM QSC (11:30 - 12:45 WIB)
  // --------------------------------------------------------------------------
  const noonKey = `noon_${todayStr}`;
  if (totalMins >= 11 * 60 + 30 && totalMins <= 12 * 60 + 45 && !state.sent[noonKey]) {
    if (hasActiveCheckIn || pendingSchedules.length > 0) {
      const targetStore = hasActiveCheckIn ? activeCheckIn.storeName : (pendingSchedules[0]?.storeName || 'Toko');
      await showNotification(
        '📋 Pengingat Observasi Siang & Form QSC',
        `FamilyMart ${targetStore}: Pastikan checklist QSC, food safety, suhu chiller, dan display hot snack/thawing terisi lengkap.`,
        `fmcu-remind-noon-${todayStr}`
      );
      state.sent[noonKey] = Date.now();
      stateModified = true;
    }
  }

  // --------------------------------------------------------------------------
  // KETENTUAN 3: PENGINGAT DOKUMENTASI EVIDENCE & CA (14:30 - 15:45 WIB)
  // --------------------------------------------------------------------------
  const afternoonKey = `afternoon_${todayStr}`;
  if (totalMins >= 14 * 60 + 30 && totalMins <= 15 * 60 + 45 && !state.sent[afternoonKey]) {
    if (hasActiveCheckIn || pendingSchedules.length > 0) {
      const targetStore = hasActiveCheckIn ? activeCheckIn.storeName : (pendingSchedules[0]?.storeName || 'Toko');
      await showNotification(
        '📸 Pengingat Dokumentasi Evidence & CA',
        `FamilyMart ${targetStore}: Lengkapi foto bukti temuan dan foto verifikasi tindakan perbaikan (Corrective Action) sebelum kunjungan selesai.`,
        `fmcu-remind-afternoon-${todayStr}`
      );
      state.sent[afternoonKey] = Date.now();
      stateModified = true;
    }
  }

  // --------------------------------------------------------------------------
  // KETENTUAN 4: PENGINGAT CHECK-OUT ACTUAL OUT (17:00 - 17:50 WIB)
  // Menjelang batas out 17:30 WIB
  // --------------------------------------------------------------------------
  const outKey = `out_${todayStr}`;
  if (totalMins >= 17 * 60 && totalMins <= 17 * 60 + 50 && !state.sent[outKey]) {
    if (hasActiveCheckIn || pendingSchedules.length > 0) {
      const targetStore = hasActiveCheckIn ? activeCheckIn.storeName : (pendingSchedules[0]?.storeName || 'Toko');
      await showNotification(
        '🏁 Pengingat Check-Out Actual OUT (17:30 WIB)',
        `Waktu operasional visit mencapai 17:30 WIB. Pastikan Anda berada di area FamilyMart ${targetStore} untuk merekam Actual OUT & finalisasi laporan.`,
        `fmcu-remind-out-${todayStr}`
      );
      state.sent[outKey] = Date.now();
      stateModified = true;
    }
  }

  // --------------------------------------------------------------------------
  // KETENTUAN 5: EVALUASI MALAM / LAPORAN PENDING (19:00 - 20:30 WIB)
  // --------------------------------------------------------------------------
  const nightKey = `night_${todayStr}`;
  if (totalMins >= 19 * 60 && totalMins <= 20 * 60 + 30 && !state.sent[nightKey]) {
    if (pendingSchedules.length > 0 || hasActiveCheckIn || overdueCount > 0) {
      const pendingCount = pendingSchedules.length + (hasActiveCheckIn ? 1 : 0);
      await showNotification(
        '⚠️ Evaluasi Visit Harian FamilyMart',
        `Terdapat ${pendingCount} jadwal visit/draft laporan yang belum disubmit hari ini. Buka aplikasi untuk meninjau status kunjungan.`,
        `fmcu-remind-night-${todayStr}`
      );
      state.sent[nightKey] = Date.now();
      stateModified = true;
    }
  }

  // --------------------------------------------------------------------------
  // KETENTUAN 6: PENGINGAT BERKALA SESI VISIT AKTIF (Tiap 90 Menit)
  // Berjalan jika visitor check-in namun belum mengirimkan laporan
  // --------------------------------------------------------------------------
  if (hasActiveCheckIn) {
    const lastActiveSent = Number(state.sent.lastActiveReminderTs || 0);
    const nowTs = Date.now();
    if (nowTs - lastActiveSent >= 90 * 60 * 1000) {
      await showNotification(
        `⏳ Sesi Visit Masih Aktif: FamilyMart ${activeCheckIn.storeName || activeCheckIn.storeCode}`,
        `Sesi kunjungan masih aktif berjalan. Pastikan data observasi dan dokumentasi foto telah disimpan sebelum meninggalkan toko.`,
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
