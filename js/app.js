// ============================================================================
// FMCU VISIT STORE REPORT - Main Application Controller (UI/UX Revamp)
// - Mandatory GPS Gate (Web hanya terbuka jika GPS aktif & diizinkan)
// - Section Home & Analitik Dipisah
// - Form Visit hanya terbuka saat user masuk ke form toko masing-masing
// - Portal Admin disembunyikan dari sisi User Biasa
// ============================================================================

window.FMCUApp = {
  currentView: 'home',
  currentAdminTab: 'schedules',
  currentUser: null,
  gpsWatchId: null,
  isGpsUnlocked: false,
  hasActiveStoreForm: false,

  liveGps: {
    lat: null,
    lng: null,
    accuracy: null,
    status: 'WAITING'
  },
  homeMap: null,
  userMarker: null,
  storeMarkers: [],
  chartFindings: null,
  chartStores: null,

  // Form State
  formCrew: [],
  formQscPhotos: [],
  formObservations: [],
  formEvidencePhotos: [],

  // PDF Preview State
  activePreviewReportId: '__LIVE_FORM__',
  previewMode: 'slide',
  previewSlides: [],
  currentSlideIndex: 0,

  init() {
    window.FMCUData.init();

    // Setup Login Form Listener
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLoginSubmit(e));
    }

    // Keyboard navigation for PDF Slide Preview
    window.addEventListener('keydown', (e) => {
      if (this.currentView === 'preview' && this.previewMode === 'slide') {
        if (e.key === 'ArrowRight') this.nextSlide();
        if (e.key === 'ArrowLeft') this.prevSlide();
      }
    });

    // Default to Auditor (User Biasa) on first load if no session exists
    let sessionUser = window.FMCUData.getSession();
    if (!sessionUser) {
      const users = window.FMCUData.getUsers();
      sessionUser = users.find((u) => u.role === 'AUDITOR') || users[0] || null;
      if (sessionUser) window.FMCUData.setSession(sessionUser);
    }
    this.currentUser = sessionUser;

    // Check if there was an active store check-in session
    const activeCheckIn = window.FMCUData.getActiveCheckIn();
    this.hasActiveStoreForm = Boolean(activeCheckIn && activeCheckIn.storeCode);

    this.populateHeaderRoleSwitcher();
    this.updateUserHeaderUI();
    this.resetVisitForm(true);
    if (activeCheckIn && activeCheckIn.storeCode) {
      this.restoreActiveCheckInToForm(activeCheckIn);
    }
    this.renderAllViews();
    this.populateGasScriptPreview();
    this.onCloudStatusChanged(window.FMCUData.cloudStatus, window.FMCUData.cloudErrorMsg);

    // Auto-request Mandatory GPS Permission on load
    this.initMandatoryGpsSystem();
  },

  // ==========================================================================
  // CLOUD FIRESTORE REAL-TIME SYNC HANDLERS (fmcu-visit-database)
  // ==========================================================================
  onCloudStatusChanged(status, errorMsg = '') {
    const pill = document.getElementById('header-firestore-pill');
    const icon = document.getElementById('header-firestore-icon');
    const text = document.getElementById('header-firestore-text');
    const admBadge = document.getElementById('admin-firestore-status-badge');
    const admWarn = document.getElementById('admin-firestore-rules-warning');

    if (status === 'ONLINE') {
      if (pill) {
        pill.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-bold';
      }
      if (icon) icon.className = 'fa-solid fa-cloud-check text-[#009944]';
      if (text) text.textContent = 'Firestore: Terhubung';
      if (admBadge) {
        admBadge.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800';
        admBadge.textContent = 'ONLINE • Real-Time Sync Aktif';
      }
      if (admWarn) admWarn.classList.add('hidden');
    } else if (status === 'PERMISSION_DENIED') {
      if (pill) {
        pill.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-bold';
      }
      if (icon) icon.className = 'fa-solid fa-lock text-amber-600';
      if (text) text.textContent = 'Firestore: Rules Terkunci';
      if (admBadge) {
        admBadge.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800';
        admBadge.textContent = 'PERMISSION DENIED (Atur Rules di Firebase Console)';
      }
      if (admWarn) admWarn.classList.remove('hidden');
    } else if (status === 'OFFLINE') {
      if (pill) {
        pill.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold';
      }
      if (icon) icon.className = 'fa-solid fa-cloud-bolt text-rose-600';
      if (text) text.textContent = 'Firestore: Mode Lokal';
      if (admBadge) {
        admBadge.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800';
        admBadge.textContent = 'OFFLINE • Cache Lokal';
      }
    }
    this.updateAdminFirestoreSummary();
  },

  onCloudDataUpdated(collectionName) {
    if (collectionName === 'users') {
      const freshSession = window.FMCUData.getSession();
      if (freshSession) {
        this.currentUser = freshSession;
      }
      this.populateHeaderRoleSwitcher();
      this.updateUserHeaderUI();
    }
    if (collectionName === 'stores') {
      this.populateMasterStoreSelect();
    }
    this.updateAdminFirestoreSummary();
    this.renderAllViews();
  },

  updateAdminFirestoreSummary() {
    const summaryEl = document.getElementById('admin-firestore-summary');
    if (!summaryEl) return;
    const uCount = window.FMCUData.getUsers().length;
    const stCount = window.FMCUData.getStores().length;
    const schCount = window.FMCUData.getSchedules().length;
    const repCount = window.FMCUData.getReports().length;
    summaryEl.innerHTML = `Data tersinkronisasi di Cloud Firestore: <strong>${uCount} User</strong> (<code>users</code>) • <strong>${stCount} Master Toko</strong> (<code>stores</code>) • <strong>${schCount} Jadwal Visit</strong> (<code>schedules</code>) • <strong>${repCount} Laporan</strong> (<code>reports</code>).`;
  },

  async forceSyncFirestoreNow() {
    const btn = document.getElementById('btn-force-sync-firestore');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Menyinkronkan ke Firestore...</span>`;
    }
    try {
      const counts = await window.FMCUData.forcePushAllToCloud();
      this.updateAdminFirestoreSummary();
      this.showToast(
        `Berhasil push ke Firestore: ${counts.users} User, ${counts.stores} Toko, ${counts.schedules} Jadwal, ${counts.reports} Laporan!`,
        'success'
      );
    } catch (err) {
      console.error('Force sync Firestore error:', err);
      if (err && err.code === 'permission-denied') {
        this.onCloudStatusChanged('PERMISSION_DENIED', err.message);
        this.showToast('Firestore menolak akses tulis (Permission Denied). Silakan publish Rules di Firebase Console.', 'warning');
      } else {
        this.showToast('Gagal sinkronisasi ke Firestore: ' + (err.message || 'Periksa koneksi internet'), 'error');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i><span>Push & Sinkronkan ke Firestore</span>`;
      }
    }
  },

  // ==========================================================================
  // MANDATORY GPS GATE SYSTEM
  // (Auto-request izin lokasi; web hanya terbuka apabila lokasi GPS menyala)
  // ==========================================================================
  initMandatoryGpsSystem() {
    // Listen to browser permission changes if Permissions API is supported
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((permStatus) => {
          permStatus.onchange = () => {
            if (permStatus.state === 'granted') {
              this.requestMandatoryGps();
            } else if (permStatus.state === 'denied') {
              this.lockWebForGps('Izin lokasi GPS diblokir di pengaturan browser Anda.');
            }
          };
        })
        .catch(() => {});
    }

    // Automatically trigger GPS request on startup
    this.requestMandatoryGps();
  },

  requestMandatoryGps() {
    const btn = document.getElementById('btn-request-gps');
    const errBox = document.getElementById('gps-gate-error-box');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Meminta Izin & Sinyal Lokasi GPS...</span>`;
    }
    if (errBox) errBox.classList.add('hidden');

    if (!('geolocation' in navigator)) {
      this.lockWebForGps('Perangkat atau browser ini tidak mendukung fitur Geolocation GPS.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.unlockWebWithGps(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        this.startContinuousGpsWatch();
      },
      (err) => {
        let msg = 'Pastikan GPS perangkat menyala dan klik "Allow / Izinkan" saat browser meminta akses lokasi.';
        if (err.code === 1) {
          msg = 'Izin lokasi ditolak (Permission Denied). Klik ikon Gembok/Pengaturan di sebelah URL browser Anda, ubah Location menjadi "Allow / Izinkan", lalu klik tombol di bawah.';
        } else if (err.code === 2) {
          msg = 'Sinyal lokasi GPS tidak tersedia (Position Unavailable). Pastikan Location Service / GPS pada perangkat Anda sudah dinyalakan.';
        } else if (err.code === 3) {
          msg = 'Waktu permintaan sinyal GPS habis (Timeout). Silakan coba klik kembali tombol di bawah.';
        }
        this.lockWebForGps(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  },

  startContinuousGpsWatch() {
    if (this.gpsWatchId !== null || !('geolocation' in navigator)) return;
    this.gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.unlockWebWithGps(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        if (err.code === 1 || err.code === 2) {
          this.lockWebForGps('Koneksi lokasi GPS terputus atau izin lokasi dinonaktifkan. Nyalakan kembali GPS untuk melanjutkan.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 }
    );
  },

  unlockWebWithGps(lat, lng, accuracy) {
    const firstUnlock = !this.isGpsUnlocked;
    this.isGpsUnlocked = true;

    const gate = document.getElementById('gps-gate-screen');
    if (gate) gate.classList.add('hidden');

    const btn = document.getElementById('btn-request-gps');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-satellite-dish"></i><span>Izinkan & Nyalakan Lokasi GPS Sekarang</span>`;
    }

    this.applyGpsCoordinates(lat, lng, accuracy);
    if (firstUnlock) {
      this.showToast(`Lokasi GPS Aktif (${lat.toFixed(5)}, ${lng.toFixed(5)}). Akses web dibuka.`, 'success');
      setTimeout(() => {
        if (this.homeMap) this.homeMap.invalidateSize();
      }, 250);
    }
  },

  lockWebForGps(reasonText) {
    this.isGpsUnlocked = false;
    const gate = document.getElementById('gps-gate-screen');
    if (gate) gate.classList.remove('hidden');

    const errBox = document.getElementById('gps-gate-error-box');
    const errDetail = document.getElementById('gps-gate-error-detail');
    if (errBox && errDetail) {
      errDetail.textContent = reasonText;
      errBox.classList.remove('hidden');
    }

    const btn = document.getElementById('btn-request-gps');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-rotate-right"></i><span>Coba Lagi & Aktifkan Lokasi GPS</span>`;
    }
  },

  // ==========================================================================
  // TOAST NOTIFICATION HELPER
  // ==========================================================================
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const colors = {
      success: 'bg-emerald-900 text-white border-emerald-500',
      info: 'bg-slate-900 text-white border-teal-400',
      warning: 'bg-amber-900 text-white border-amber-400',
      error: 'bg-rose-900 text-white border-rose-400'
    };
    const icons = {
      success: 'fa-circle-check text-emerald-400',
      info: 'fa-circle-info text-teal-400',
      warning: 'fa-triangle-exclamation text-amber-400',
      error: 'fa-circle-xmark text-rose-400'
    };
    const el = document.createElement('div');
    el.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border-l-4 text-xs font-bold transition-all duration-300 ${colors[type] || colors.info}`;
    el.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.info} text-sm"></i>
      <span>${message}</span>
    `;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 300);
    }, 3400);
  },

  // ==========================================================================
  // AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC)
  // ==========================================================================
  handleLoginSubmit(e) {
    e.preventDefault();
    const uInput = document.getElementById('login-username').value.trim().toLowerCase();
    const pInput = document.getElementById('login-password').value.trim();
    const users = window.FMCUData.getUsers();

    const found = users.find(
      (u) => (u.username.toLowerCase() === uInput || (u.email && u.email.toLowerCase() === uInput)) && u.password === pInput
    );

    const errEl = document.getElementById('login-error');
    if (!found) {
      errEl.textContent = 'Username atau Password tidak sesuai.';
      errEl.classList.remove('hidden');
      return;
    }

    errEl.classList.add('hidden');
    this.setLoggedInUser(found);
    document.getElementById('auth-screen').classList.add('hidden');
    this.showToast(`Selamat datang, ${found.name} (${found.roleBadge})`, 'success');
  },

  quickLogin(username) {
    const users = window.FMCUData.getUsers();
    const found = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (found) {
      this.setLoggedInUser(found);
      document.getElementById('auth-screen').classList.add('hidden');
      this.showToast(`Login berhasil sebagai ${found.name} (${found.roleBadge})`, 'success');
    }
  },

  quickLoginById(userId) {
    if (userId === '__LOGOUT__') {
      this.logout();
      return;
    }
    const users = window.FMCUData.getUsers();
    const found = users.find((u) => u.id === userId);
    if (found) {
      this.setLoggedInUser(found);
      this.showToast(`Otoritas beralih ke: ${found.name} (${found.roleBadge})`, 'info');
    }
  },

  setLoggedInUser(user) {
    this.currentUser = user;
    window.FMCUData.setSession(user);
    this.populateHeaderRoleSwitcher();
    this.updateUserHeaderUI();
    this.renderAllViews();

    // If switched to a regular user while on Admin page, redirect to Home
    if (this.currentView === 'admin' && !this.hasAdminAuthority(user)) {
      this.navigate('home');
    }
  },

  logout() {
    this.closeModal('modal-user-profile');
    document.getElementById('auth-screen').classList.remove('hidden');
  },

  hasAdminAuthority(user = this.currentUser) {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_SCHEDULE') return true;
    const auths = user.authorities || [];
    return auths.includes('manage_schedule') || auths.includes('manage_users') || auths.includes('manage_stores');
  },

  populateHeaderRoleSwitcher() {
    const sel = document.getElementById('header-role-switcher');
    if (!sel) return;
    const users = window.FMCUData.getUsers();
    sel.innerHTML =
      users
        .map(
          (u) =>
            `<option value="${u.id}" ${this.currentUser && this.currentUser.id === u.id ? 'selected' : ''}>👤 ${u.name} (${u.role === 'SUPER_ADMIN' ? 'Admin' : u.role === 'ADMIN_SCHEDULE' ? 'Admin Jadwal' : 'User Biasa'})</option>`
        )
        .join('') + `<option value="__LOGOUT__">🚪 Ganti Login / Keluar...</option>`;
  },

  updateUserHeaderUI() {
    const u = this.currentUser;
    if (!u) return;
    const initials = u.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    ['sidebar-user-avatar', 'header-user-avatar'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = initials;
        el.style.backgroundColor = u.avatarColor || '#0099A6';
      }
    });

    ['sidebar-user-name', 'header-user-name', 'home-welcome-name'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = u.name;
    });

    const roleEl = document.getElementById('sidebar-user-role');
    if (roleEl) roleEl.textContent = u.roleBadge || u.role;

    const welcomeRole = document.getElementById('home-welcome-role');
    if (welcomeRole) welcomeRole.textContent = `Otoritas: ${u.roleBadge || u.role}`;

    // Hide Portal Admin button completely for Regular Users (User Biasa)
    const isAdmin = this.hasAdminAuthority(u);
    const navAdmin = document.getElementById('nav-admin');
    const mnavAdmin = document.getElementById('mnav-admin');
    if (navAdmin) navAdmin.classList.toggle('hidden', !isAdmin);
    if (mnavAdmin) mnavAdmin.classList.toggle('hidden', !isAdmin);

    this.updateActiveCheckInUI();
  },

  // ==========================================================================
  // NAVIGATION & VIEW ROUTER (HOME, ANALYTICS, FORM, PREVIEW, ADMIN)
  // ==========================================================================
  navigate(viewName, subTab = null) {
    // Guard: Regular user cannot open Admin page
    if (viewName === 'admin' && !this.hasAdminAuthority()) {
      this.showToast('Halaman Admin hanya tersedia untuk otoritas Admin.', 'warning');
      return;
    }

    // Guard: Form Visit Store only opens if user has entered a store's form
    if (viewName === 'form' && !this.hasActiveStoreForm) {
      this.showToast('Pilih dan lakukan Check-In pada toko di jadwal Anda terlebih dahulu untuk membuka Form Visit.', 'warning');
      viewName = 'home';
    }

    this.currentView = viewName;
    const views = ['home', 'analytics', 'form', 'preview', 'admin'];
    views.forEach((v) => {
      const mainEl = document.getElementById(`view-${v}`);
      if (mainEl) mainEl.classList.toggle('hidden', v !== viewName);

      const dNav = document.getElementById(`nav-${v}`);
      if (dNav) dNav.classList.toggle('active', v === viewName);

      const mNav = document.getElementById(`mnav-${v}`);
      if (mNav) mNav.classList.toggle('active', v === viewName);
    });

    const titles = {
      home: [
        'Home — Jadwal Toko & History Visit',
        'Daftar jadwal toko yang diminta visit serta riwayat & arsip laporan PDF'
      ],
      analytics: [
        'Analitik Dashboard — Performa, Trend Temuan & Toko',
        'Statistik realisasi visit, distribusi kategori temuan QSC, ranking toko, dan aktivitas live GPS auditor'
      ],
      form: [
        'Form Laporan Visit Toko (QSC, FamiTrack & Observasi)',
        'Lengkapi data kunjungan toko, bukti foto ber-watermark GPS, dan analisis akar masalah'
      ],
      preview: [
        'Preview Hasil PDF (Slide 16:9) & Download PDF',
        'Tampilan presisi sesuai format standar FMCU Visit Store Report siap unduh & kirim ke Google Drive'
      ],
      admin: [
        'Portal Otoritas Admin FMCU',
        'Manajemen Jadwal Visit, Master Data Toko, Otoritas User, dan Integrasi Email & Google Drive'
      ]
    };

    const [t, sub] = titles[viewName] || titles.home;
    document.getElementById('header-page-title').textContent = t;
    document.getElementById('header-page-subtitle').textContent = sub;

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (viewName === 'home') {
      this.renderHomeView();
      setTimeout(() => {
        if (this.homeMap) this.homeMap.invalidateSize();
      }, 200);
    } else if (viewName === 'analytics') {
      this.renderAnalyticsView();
    } else if (viewName === 'form') {
      this.updateFormGuardVisibility();
    } else if (viewName === 'preview') {
      this.renderPreviewView();
    } else if (viewName === 'admin') {
      this.checkAdminGateUI();
      if (subTab) this.switchAdminTab(subTab);
      this.renderAdminView();
    }
  },

  updateFormGuardVisibility() {
    const guardEl = document.getElementById('form-no-store-guard');
    const wrapperEl = document.getElementById('form-active-store-wrapper');
    const navForm = document.getElementById('nav-form');
    const mnavForm = document.getElementById('mnav-form');

    if (guardEl) guardEl.classList.toggle('hidden', this.hasActiveStoreForm);
    if (wrapperEl) wrapperEl.classList.toggle('hidden', !this.hasActiveStoreForm);
    if (navForm) navForm.classList.toggle('hidden', !this.hasActiveStoreForm);
    if (mnavForm) mnavForm.classList.toggle('hidden', !this.hasActiveStoreForm);
  },

  // ==========================================================================
  // LIVE GPS GEOLOCATION & LEAFLET MAP TRACKING
  // ==========================================================================
  refreshGpsLocation(notify = false) {
    if (!('geolocation' in navigator)) {
      this.lockWebForGps('Browser tidak mendukung Geolocation GPS.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.unlockWebWithGps(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        if (notify) {
          this.showToast(`Titik Live Location diperbarui: ${this.liveGps.lat}, ${this.liveGps.lng}`, 'success');
        }
      },
      () => {
        this.lockWebForGps('Lokasi GPS tidak aktif atau izin ditolak. Aktifkan kembali GPS untuk membuka aplikasi.');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  },

  applyGpsCoordinates(lat, lng, accuracy = null) {
    this.liveGps = {
      lat: lat !== null ? Number(lat.toFixed(5)) : null,
      lng: lng !== null ? Number(lng.toFixed(5)) : null,
      accuracy: accuracy ? Math.round(accuracy) : null,
      status: 'GPS AKTUAL'
    };

    const coordStr = `${this.liveGps.lat}, ${this.liveGps.lng}`;
    const sideEl = document.getElementById('sidebar-gps-coords');
    if (sideEl) sideEl.textContent = `${coordStr} (±${this.liveGps.accuracy || 10}m)`;

    const headEl = document.getElementById('header-gps-text');
    if (headEl) headEl.textContent = `GPS: ${coordStr}`;

    const homeEl = document.getElementById('home-gps-latlng');
    if (homeEl) homeEl.textContent = coordStr;

    const badgeEl = document.getElementById('home-gps-status-badge');
    if (badgeEl) {
      badgeEl.textContent = 'GPS Terkunci';
      badgeEl.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800';
    }

    const formGpsEl = document.getElementById('form-banner-gps');
    if (formGpsEl) {
      formGpsEl.innerHTML = `<i class="fa-solid fa-location-dot text-emerald-400"></i><span>Live GPS User: ${coordStr} (±${this.liveGps.accuracy || 10}m)</span>`;
    }

    if (this.currentUser) {
      const nowMs = Date.now();
      if (!this._lastLocationSyncedAt || nowMs - this._lastLocationSyncedAt > 45000) {
        this._lastLocationSyncedAt = nowMs;
        const users = window.FMCUData.getUsers();
        const idx = users.findIndex((u) => u.id === this.currentUser.id);
        if (idx !== -1) {
          users[idx].lastLocation = {
            lat: this.liveGps.lat,
            lng: this.liveGps.lng,
            updatedAt: new Date().toISOString(),
            status: 'ON_DUTY'
          };
          window.FMCUData.saveUsers(users);
        }
      }
    }

    this.initOrUpdateHomeMap();
  },

  initOrUpdateHomeMap() {
    const mapContainer = document.getElementById('home-live-map');
    if (!mapContainer || typeof L === 'undefined') return;

    const centerLat = this.liveGps.lat !== null ? this.liveGps.lat : -6.2088;
    const centerLng = this.liveGps.lng !== null ? this.liveGps.lng : 106.8456;

    if (!this.homeMap) {
      this.homeMap = L.map('home-live-map', {
        zoomControl: false,
        attributionControl: false
      }).setView([centerLat, centerLng], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(this.homeMap);
    } else if (this.liveGps.lat !== null) {
      this.homeMap.setView([centerLat, centerLng], 14);
    }

    if (this.userMarker) {
      this.homeMap.removeLayer(this.userMarker);
      this.userMarker = null;
    }
    this.storeMarkers.forEach((m) => this.homeMap.removeLayer(m));
    this.storeMarkers = [];

    // Draw Store Markers from Master Data
    const stores = window.FMCUData.getStores();
    stores.forEach((st) => {
      if (st.lat && st.lng) {
        const m = L.circleMarker([st.lat, st.lng], {
          radius: 6,
          fillColor: '#009944',
          color: '#ffffff',
          weight: 2,
          fillOpacity: 0.9
        })
          .addTo(this.homeMap)
          .bindPopup(`<b>FamilyMart ${st.name} (${st.code})</b><br/>Store Head: ${st.storeHead || '-'}`);
        this.storeMarkers.push(m);
      }
    });

    // Draw User Marker if Live GPS is detected
    if (this.liveGps.lat !== null && this.liveGps.lng !== null) {
      this.userMarker = L.circleMarker([this.liveGps.lat, this.liveGps.lng], {
        radius: 8,
        fillColor: '#0099A6',
        color: '#ffffff',
        weight: 3,
        fillOpacity: 1
      })
        .addTo(this.homeMap)
        .bindPopup(`<b>Lokasi Aktual Anda (${this.currentUser?.name || 'User'})</b><br/>GPS: ${this.liveGps.lat}, ${this.liveGps.lng}`);
    }
  },

  // ==========================================================================
  // ACTUAL IN & ACTUAL OUT + VISIT TOKO JADWAL HARI INI
  // ==========================================================================
  getCurrentTimeWIB() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
  },

  stampActualTime(type) {
    const timeStr = this.getCurrentTimeWIB();
    if (type === 'in') {
      document.getElementById('form-actual-in').value = timeStr;
      this.showToast(`Waktu Actual In tercatat: ${timeStr}`, 'success');
    } else {
      document.getElementById('form-actual-out').value = timeStr;
      this.showToast(`Waktu Actual Out tercatat: ${timeStr}`, 'info');
    }
  },

  updateActiveCheckInUI() {
    const active = window.FMCUData.getActiveCheckIn();
    const sideWidget = document.getElementById('sidebar-checkin-widget');
    const homeSummary = document.getElementById('home-checkin-summary');
    const navSub = document.getElementById('nav-form-store-subtitle');

    if (active && active.storeCode) {
      this.hasActiveStoreForm = true;
      if (sideWidget) {
        sideWidget.classList.remove('hidden');
        document.getElementById('sidebar-checkin-time').textContent = active.actualIn || '-';
        document.getElementById('sidebar-checkin-store').textContent = `${active.storeName || 'Toko'} (${active.storeCode || '-'})`;
      }
      if (homeSummary) {
        homeSummary.textContent = `Check-In: ${active.storeName || 'Toko'} (${active.actualIn || '-'})`;
        homeSummary.className = 'font-bold text-emerald-700 mt-0.5 truncate';
      }
      if (navSub) {
        navSub.textContent = `${active.storeName} (${active.storeCode})`;
      }
    } else {
      if (sideWidget) sideWidget.classList.add('hidden');
      if (homeSummary) {
        homeSummary.textContent = 'Belum Check-In';
        homeSummary.className = 'font-bold text-slate-700 mt-0.5 truncate';
      }
    }
    this.updateFormGuardVisibility();
  },

  // Handler for "Visit Toko Jadwal Hari Ini" button on Home
  handleVisitTodaySchedule() {
    // 1. If already checked in to a store, jump directly to its Form Visit
    const activeCheckIn = window.FMCUData.getActiveCheckIn();
    if (activeCheckIn && activeCheckIn.storeCode) {
      this.hasActiveStoreForm = true;
      this.updateFormGuardVisibility();
      this.navigate('form');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const schedules = window.FMCUData.getSchedules();
    const myPendingToday = schedules.find(
      (s) =>
        s.status !== 'COMPLETED' &&
        s.scheduledDate === todayStr &&
        (!this.currentUser || s.auditorId === this.currentUser.id || s.auditorName === this.currentUser.name)
    );

    const anyPendingToday = schedules.find((s) => s.status !== 'COMPLETED' && s.scheduledDate === todayStr);
    const myNextPending = schedules.find(
      (s) =>
        s.status !== 'COMPLETED' &&
        (!this.currentUser || s.auditorId === this.currentUser.id || s.auditorName === this.currentUser.name)
    );

    const targetSchedule = myPendingToday || anyPendingToday || myNextPending;
    if (targetSchedule) {
      this.checkInAndOpenForm(targetSchedule.storeCode, targetSchedule.id);
      return;
    }

    // No pending schedule found for today
    const filterEl = document.getElementById('schedule-filter-scope');
    if (filterEl) {
      filterEl.value = 'TODAY';
      this.renderHomeSchedules();
    }
    document.getElementById('home-schedule-section')?.scrollIntoView({ behavior: 'smooth' });
    this.showToast('Belum ada jadwal toko yang ditugaskan untuk hari ini.', 'warning');
  },

  restoreActiveCheckInToForm(checkInObj) {
    this.hasActiveStoreForm = true;
    this.updateFormGuardVisibility();
    document.getElementById('form-schedule-id').value = checkInObj.scheduleId || '';
    document.getElementById('form-actual-in').value = checkInObj.actualIn || '';
    if (checkInObj.storeCode) {
      document.getElementById('form-store-select').value = checkInObj.storeCode;
      this.onSelectMasterStore(checkInObj.storeCode);
    }
    if (this.currentUser) {
      document.getElementById('form-auditor-name').value = this.currentUser.name || '';
    }
  },

  checkInAndOpenForm(storeCode = '', scheduleId = null) {
    const stores = window.FMCUData.getStores();
    const schedules = window.FMCUData.getSchedules();
    const sch = schedules.find((s) => s.id === scheduleId) || null;
    const store = stores.find((s) => s.code === storeCode) || null;
    const nowTime = this.getCurrentTimeWIB();

    this.resetVisitForm(true);
    this.hasActiveStoreForm = true;
    this.updateFormGuardVisibility();

    document.getElementById('form-schedule-id').value = scheduleId || '';
    document.getElementById('form-actual-in').value = nowTime;
    if (this.currentUser) {
      document.getElementById('form-auditor-name').value = this.currentUser.name || '';
    }

    if (store) {
      document.getElementById('form-store-select').value = store.code;
      this.onSelectMasterStore(store.code);
    } else if (sch) {
      document.getElementById('form-store-code').value = sch.storeCode || '';
      document.getElementById('form-store-name').value = sch.storeName || '';
      document.getElementById('form-store-type').value = sch.storeType || 'CVS';
      document.getElementById('form-banner-title').textContent = `FMCU Visit Store Report — ${sch.storeName || ''}`;
      document.getElementById('form-banner-store-badge').textContent = `Kode Toko: ${sch.storeCode || '-'}`;
    }

    const checkInObj = {
      storeCode: store ? store.code : sch ? sch.storeCode : storeCode,
      storeName: store ? store.name : sch ? sch.storeName : 'Toko Visit',
      scheduleId: scheduleId,
      actualIn: nowTime,
      latIn: this.liveGps.lat,
      lngIn: this.liveGps.lng,
      startedAt: Date.now()
    };
    window.FMCUData.setActiveCheckIn(checkInObj);
    this.updateActiveCheckInUI();

    this.navigate('form');
    this.showToast(`Check-In (Actual In: ${nowTime}) di Toko ${checkInObj.storeName} berhasil! Form Visit dibuka.`, 'success');
  },

  // ==========================================================================
  // HALAMAN 1A & 1B: HOME VIEW & ANALYTICS VIEW (SEPARATED)
  // ==========================================================================
  renderAllViews() {
    this.renderHomeView();
    this.renderAnalyticsView();
    this.renderPreviewSelector();
    this.renderAdminView();
  },

  renderHomeView() {
    this.renderHomeSchedules();
    this.renderHomeHistory();
    this.initOrUpdateHomeMap();
  },

  renderAnalyticsView() {
    const schedules = window.FMCUData.getSchedules();
    const reports = window.FMCUData.getReports();

    const completedSchedules = schedules.filter((s) => s.status === 'COMPLETED').length;
    const totalSchedules = schedules.length;
    const compRate = totalSchedules > 0 ? Math.round((completedSchedules / totalSchedules) * 100) : 0;
    document.getElementById('kpi-total-visits').textContent = `${reports.length} Visit`;
    document.getElementById('kpi-completion-rate').textContent = `${completedSchedules}/${totalSchedules} Jadwal (${compRate}%)`;

    let totalFindings = 0;
    let openFindings = 0;
    let closedFindings = 0;
    let totalDuration = 0;
    let totalScore = 0;

    reports.forEach((r) => {
      const obs = r.observations || [];
      totalFindings += obs.length;
      obs.forEach((o) => {
        if (o.status === 'CLOSED') closedFindings++;
        else openFindings++;
      });
      totalDuration += Number(r.durationMinutes || 0);
      totalScore += Number(r.qscScore || 0);
    });

    document.getElementById('kpi-total-findings').textContent = String(totalFindings);
    document.getElementById('kpi-open-findings').textContent = `${openFindings} Open • ${closedFindings} Closed`;

    const avgDur = reports.length > 0 ? Math.round(totalDuration / reports.length) : 0;
    const hrs = Math.floor(avgDur / 60);
    const mins = avgDur % 60;
    document.getElementById('kpi-avg-duration').textContent = `${hrs}j ${mins}m`;

    const avgScore = reports.length > 0 ? (totalScore / reports.length).toFixed(1) : '0';
    document.getElementById('kpi-avg-score').textContent = `${avgScore}%`;

    this.renderAnalyticsCharts();
    this.renderUserPerformanceTable();
  },

  renderHomeSchedules() {
    const container = document.getElementById('home-schedule-list');
    if (!container) return;
    const scope = document.getElementById('schedule-filter-scope')?.value || 'ALL';
    const todayStr = new Date().toISOString().slice(0, 10);
    let schedules = window.FMCUData.getSchedules();

    if (scope === 'TODAY') {
      schedules = schedules.filter((s) => s.scheduledDate === todayStr);
    } else if (scope === 'MINE' && this.currentUser) {
      schedules = schedules.filter((s) => s.auditorId === this.currentUser.id || s.auditorName === this.currentUser.name);
    } else if (scope === 'PENDING') {
      schedules = schedules.filter((s) => s.status !== 'COMPLETED');
    } else if (scope === 'COMPLETED') {
      schedules = schedules.filter((s) => s.status === 'COMPLETED');
    }

    if (schedules.length === 0) {
      container.innerHTML = `
        <div class="col-span-full border border-dashed border-slate-200 rounded-2xl py-10 px-4 text-center space-y-1 bg-slate-50/50">
          <div class="text-slate-400 text-xs font-medium">Belum ada jadwal visit toko yang tersedia pada filter ini.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = schedules
      .map((s) => {
        const isDone = s.status === 'COMPLETED';
        const dateFormatted = window.FMCUPdf.formatIndonesianDate(s.scheduledDate, true);
        return `
          <div class="border ${isDone ? 'border-slate-200 bg-slate-50/60' : 'border-emerald-200 bg-white'} rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition">
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                  isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }">
                  ${isDone ? '✓ Visit Selesai' : '⏳ Menunggu Visit'}
                </span>
                <span class="text-[11px] font-mono font-bold text-slate-500">Kode: ${s.storeCode} (${s.storeType})</span>
              </div>

              <div>
                <h4 class="font-extrabold text-base text-slate-900">FamilyMart ${s.storeName}</h4>
                <div class="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5">
                  <i class="fa-regular fa-calendar text-[#0099A6]"></i>
                  <span>${dateFormatted} (${s.shiftWindow || '-'})</span>
                </div>
                <div class="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5">
                  <i class="fa-regular fa-user text-emerald-600"></i>
                  <span>Auditor: <strong>${s.auditorName}</strong></span>
                </div>
              </div>

              <p class="text-[11px] text-slate-500 bg-slate-100/80 p-2.5 rounded-xl leading-relaxed">
                ${s.auditFocus || '-'}
              </p>
            </div>

            <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              ${
                isDone
                  ? `
                <div class="text-[11px] text-emerald-700 font-semibold">
                  <i class="fa-solid fa-clock-rotate-left mr-1"></i>In: ${s.actualIn || '-'} • Out: ${s.actualOut || '-'}
                </div>
                ${
                  s.reportId
                    ? `<button onclick="FMCUApp.openReportPreview('${s.reportId}')" class="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0099A6] font-bold text-xs transition cursor-pointer">Lihat PDF →</button>`
                    : ''
                }
              `
                  : `
                <div class="text-[11px] text-slate-400 font-medium">Siap Check-In GPS</div>
                <button onclick="FMCUApp.checkInAndOpenForm('${s.storeCode}', '${s.id}')" class="fm-gradient hover:opacity-95 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer">
                  <i class="fa-solid fa-location-crosshairs"></i>
                  <span>Check-In & Masuk Form Toko</span>
                </button>
              `
              }
            </div>
          </div>
        `;
      })
      .join('');
  },

  renderAnalyticsCharts() {
    const reports = window.FMCUData.getReports();

    const catCounts = {};
    reports.forEach((r) => {
      (r.observations || []).forEach((o) => {
        if (o.temuan && o.temuan.trim() !== '') {
          const cat = o.category || 'Temuan Operasional QSC';
          catCounts[cat] = (catCounts[cat] || 0) + 1;
        }
      });
    });

    const catLabels = Object.keys(catCounts);
    const catValues = Object.values(catCounts);
    const palette = ['#0099A6', '#009944', '#F59E0B', '#E11D48', '#6366F1', '#0284C7'];

    const ctx1 = document.getElementById('chart-trend-findings');
    if (ctx1 && typeof Chart !== 'undefined') {
      if (this.chartFindings) this.chartFindings.destroy();
      this.chartFindings = new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: catLabels.length > 0 ? catLabels : ['Belum Ada Data Temuan'],
          datasets: [
            {
              data: catValues.length > 0 ? catValues : [1],
              backgroundColor: catValues.length > 0 ? palette : ['#E2E8F0'],
              borderWidth: 2,
              borderColor: '#ffffff'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: { legend: { display: false } }
        }
      });
    }

    const legendEl = document.getElementById('trend-findings-legend');
    if (legendEl) {
      if (catLabels.length === 0) {
        legendEl.innerHTML = `<div class="col-span-2 text-center text-slate-400 text-xs py-1">Belum ada data temuan observasi yang disimpan.</div>`;
      } else {
        legendEl.innerHTML = catLabels
          .map(
            (lbl, i) => `
            <div class="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
              <div class="flex items-center gap-2 truncate">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${palette[i % palette.length]}"></span>
                <span class="text-slate-700 font-medium truncate">${lbl}</span>
              </div>
              <span class="font-extrabold text-slate-900 ml-2">${catValues[i]}</span>
            </div>
          `
          )
          .join('');
      }
    }

    // Store Trend Chart
    const storeNames = reports.map((r) => r.storeName);
    const storeFindings = reports.map((r) => (r.observations || []).length);
    const storeScores = reports.map((r) => Number(r.qscScore || 0));

    const ctx2 = document.getElementById('chart-trend-stores');
    if (ctx2 && typeof Chart !== 'undefined') {
      if (this.chartStores) this.chartStores.destroy();
      this.chartStores = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: storeNames.length > 0 ? storeNames : ['Belum Ada Visit'],
          datasets: [
            {
              label: 'Jumlah Temuan',
              data: storeFindings.length > 0 ? storeFindings : [0],
              backgroundColor: '#0099A6',
              borderRadius: 6,
              yAxisID: 'y'
            },
            {
              label: 'Skor QSC (%)',
              data: storeScores.length > 0 ? storeScores : [0],
              backgroundColor: '#009944',
              borderRadius: 6,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Temuan' } },
            y1: { beginAtZero: true, max: 100, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Skor QSC %' } }
          },
          plugins: {
            legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      });
    }

    const storeSummaryEl = document.getElementById('trend-stores-summary');
    if (storeSummaryEl) {
      if (reports.length === 0) {
        storeSummaryEl.innerHTML = `<div class="col-span-3 text-center text-slate-400 text-xs py-1">Belum ada data laporan toko yang masuk.</div>`;
      } else {
        storeSummaryEl.innerHTML = reports
          .slice(0, 3)
          .map(
            (r) => `
            <div class="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
              <div class="font-extrabold text-slate-800 truncate">${r.storeName}</div>
              <div class="text-[11px] text-slate-500 mt-0.5">${(r.observations || []).length} Temuan • QSC ${r.qscScore || 0}%</div>
            </div>
          `
          )
          .join('');
      }
    }
  },

  renderUserPerformanceTable() {
    const tbody = document.getElementById('home-user-analytics-tbody');
    if (!tbody) return;
    const users = window.FMCUData.getUsers();
    const schedules = window.FMCUData.getSchedules();
    const reports = window.FMCUData.getReports();

    tbody.innerHTML = users
      .map((u) => {
        const assigned = schedules.filter((s) => s.auditorId === u.id || s.auditorName === u.name).length;
        const userReports = reports.filter((r) => r.auditorId === u.id || r.auditorName === u.name);
        const totalObs = userReports.reduce((acc, r) => acc + (r.observations ? r.observations.length : 0), 0);
        const loc = u.lastLocation || null;

        return `
          <tr class="hover:bg-slate-50/80 transition">
            <td class="py-3 px-4">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0" style="background:${u.avatarColor || '#0099A6'}">
                  ${u.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div class="font-bold text-slate-900">${u.name}</div>
                  <div class="text-[11px] text-slate-400">@${u.username}</div>
                </div>
              </div>
            </td>
            <td class="py-3 px-4">
              <div class="font-semibold text-slate-800">${u.roleBadge || u.role}</div>
              <div class="text-[11px] text-slate-500">${u.region || '-'}</div>
            </td>
            <td class="py-3 px-4 text-center font-bold text-slate-700">${assigned} Toko</td>
            <td class="py-3 px-4 text-center">
              <span class="font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs">${userReports.length} Selesai</span>
            </td>
            <td class="py-3 px-4 text-center font-bold text-amber-700">${totalObs} Temuan</td>
            <td class="py-3 px-4">
              ${
                loc && loc.lat
                  ? `<div class="text-[11px] font-mono text-slate-700">GPS: ${loc.lat}, ${loc.lng}</div>`
                  : `<span class="text-xs text-slate-400">Belum ada titik GPS</span>`
              }
            </td>
            <td class="py-3 px-4 text-center">
              <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>AKTIF
              </span>
            </td>
          </tr>
        `;
      })
      .join('');
  },

  renderHomeHistory() {
    const container = document.getElementById('home-history-list');
    if (!container) return;
    const query = (document.getElementById('history-search-input')?.value || '').toLowerCase();
    const reports = window.FMCUData.getReports().filter((r) => {
      if (!query) return true;
      return (
        (r.storeName || '').toLowerCase().includes(query) ||
        (r.storeCode || '').toLowerCase().includes(query) ||
        (r.auditorName || '').toLowerCase().includes(query)
      );
    });

    if (reports.length === 0) {
      container.innerHTML = `
        <div class="border border-dashed border-slate-200 rounded-2xl py-10 px-4 text-center space-y-1 bg-slate-50/50">
          <div class="text-slate-400 text-xs font-medium">Belum ada riwayat laporan visit yang tersimpan.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = reports
      .map((r) => {
        const obsCount = (r.observations || []).length;
        const evCount = (r.evidencePhotos || []).length;
        const dateText = r.visitDayDateFormatted || window.FMCUPdf.formatIndonesianDate(r.visitDate, true);
        return `
          <div class="border border-slate-200 hover:border-teal-300 rounded-2xl p-4 sm:p-5 bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition shadow-sm">
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-md bg-teal-50 text-[#0099A6] font-extrabold text-xs">
                  ${r.storeCode} • ${r.storeType || 'CVS'}
                </span>
                <h4 class="font-extrabold text-base sm:text-lg text-slate-900">FamilyMart ${r.storeName}</h4>
                <span class="text-xs text-slate-400">•</span>
                <span class="text-xs font-semibold text-slate-600">${dateText}</span>
              </div>

              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                <span><i class="fa-regular fa-user text-[#0099A6] mr-1"></i>Auditor: <strong>${r.auditorName}</strong></span>
                <span><i class="fa-solid fa-user-tie text-emerald-600 mr-1"></i>Store Head: <strong>${r.storeHead}</strong></span>
                <span><i class="fa-regular fa-clock text-amber-600 mr-1"></i>Actual In-Out: <strong>${r.actualIn || '-'} s/d ${r.actualOut || '-'}</strong></span>
                <span><i class="fa-solid fa-location-dot text-rose-500 mr-1"></i>GPS: <span class="font-mono">${r.gpsLat || '-'}, ${r.gpsLng || '-'}</span></span>
              </div>

              <div class="flex flex-wrap items-center gap-2 pt-1">
                <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  ${obsCount} Temuan Observasi
                </span>
                <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                  ${evCount} Foto Bukti Evidence
                </span>
                <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Skor QSC: ${r.qscScore || 0}%
                </span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <button onclick="FMCUApp.editReportById('${r.id}')" class="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer">
                <i class="fa-solid fa-pen mr-1"></i>Buka Form Toko
              </button>
              <button onclick="FMCUApp.openReportPreview('${r.id}')" class="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0099A6] font-bold text-xs transition flex items-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-display"></i>
                <span>Preview Slide PDF</span>
              </button>
              <button onclick="FMCUApp.downloadReportById('${r.id}')" class="fm-gradient hover:opacity-95 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-file-arrow-down"></i>
                <span>Unduh PDF</span>
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  },

  // ==========================================================================
  // HALAMAN 2: FORM VISIT STORE LOGIC & DYNAMIC SECTIONS
  // ==========================================================================
  populateMasterStoreSelect() {
    const sel = document.getElementById('form-store-select');
    if (!sel) return;
    const stores = window.FMCUData.getStores();
    sel.innerHTML =
      `<option value="">-- Pilih dari Master Toko --</option>` +
      stores.map((s) => `<option value="${s.code}">${s.code} - ${s.name} (${s.type})</option>`).join('');
  },

  onSelectMasterStore(storeCode) {
    const stores = window.FMCUData.getStores();
    const st = stores.find((s) => s.code === storeCode);
    if (!st) return;

    document.getElementById('form-store-name').value = st.name;
    document.getElementById('form-store-code').value = st.code;
    document.getElementById('form-store-type').value = st.type || 'CVS';
    document.getElementById('form-store-head').value = st.storeHead || '';
    document.getElementById('form-area-manager').value = st.areaManager || '';
    document.getElementById('form-regional-manager').value = st.regionalManager || '';
    document.getElementById('form-store-email').value = st.email || '';

    document.getElementById('form-banner-title').textContent = `FMCU Visit Store Report — ${st.name}`;
    document.getElementById('form-banner-store-badge').textContent = `Kode Toko: ${st.code} (${st.type})`;

    if (st.defaultCrew && st.defaultCrew.length > 0) {
      this.formCrew = JSON.parse(JSON.stringify(st.defaultCrew));
      this.renderCrewTable();
    }
  },

  resetVisitForm(silent = false) {
    this.populateMasterStoreSelect();
    const todayStr = new Date().toISOString().slice(0, 10);

    document.getElementById('form-report-id').value = '';
    document.getElementById('form-schedule-id').value = '';
    document.getElementById('form-store-select').value = '';
    document.getElementById('form-store-name').value = '';
    document.getElementById('form-store-code').value = '';
    document.getElementById('form-store-type').value = 'CVS';
    document.getElementById('form-auditor-name').value = '';
    document.getElementById('form-visit-date').value = todayStr;
    document.getElementById('form-qsc-score').value = '';
    document.getElementById('form-store-head').value = '';
    document.getElementById('form-area-manager').value = '';
    document.getElementById('form-regional-manager').value = '';
    document.getElementById('form-store-email').value = '';
    document.getElementById('form-ca-link').value = 'https://tinyurl.com/store-caassignment';
    document.getElementById('form-actual-in').value = '';
    document.getElementById('form-actual-out').value = '';

    document.getElementById('form-banner-title').textContent = 'FMCU Visit Store Report';
    document.getElementById('form-banner-store-badge').textContent = 'Kode Toko: -';

    this.formCrew = [
      { role: 'Store Head', name: '', jobLevel: '' },
      { role: 'Shift Leader', name: '', jobLevel: '' },
      { role: 'Crew Store 1', name: '', jobLevel: '' },
      { role: 'Crew Store 2', name: '', jobLevel: '' }
    ];

    this.formQscPhotos = [
      { id: 'qsc-1', caption: 'Foto QSC / Famitrack 1', dataUrl: '' },
      { id: 'qsc-2', caption: 'Foto QSC / Famitrack 2', dataUrl: '' }
    ];

    this.formObservations = [
      {
        id: 'obs-1',
        category: 'Food Safety & Expired',
        temuan: '',
        kondisiIdeal: '',
        penyebab: '',
        dampak: '',
        tindakanPerbaikan: '',
        hasil: '',
        deadline: todayStr,
        deadlineFormatted: window.FMCUPdf.formatIndonesianDate(todayStr, false),
        status: 'OPEN'
      }
    ];

    this.formEvidencePhotos = [];

    this.renderFormDynamicSections();
    if (!silent) {
      this.showToast('Form berhasil dikosongkan.', 'info');
    }
  },

  loadReportObjectToForm(rep) {
    this.populateMasterStoreSelect();
    this.hasActiveStoreForm = true;
    this.updateFormGuardVisibility();

    document.getElementById('form-report-id').value = rep.id || '';
    document.getElementById('form-schedule-id').value = rep.scheduleId || '';
    document.getElementById('form-store-select').value = rep.storeCode || '';
    document.getElementById('form-store-name').value = rep.storeName || '';
    document.getElementById('form-store-code').value = rep.storeCode || '';
    document.getElementById('form-store-type').value = rep.storeType || 'CVS';
    document.getElementById('form-auditor-name').value = rep.auditorName || '';
    document.getElementById('form-visit-date').value = rep.visitDate || new Date().toISOString().slice(0, 10);
    document.getElementById('form-qsc-score').value = rep.qscScore ?? '';
    document.getElementById('form-store-head').value = rep.storeHead || '';
    document.getElementById('form-area-manager').value = rep.areaManager || '';
    document.getElementById('form-regional-manager').value = rep.regionalManager || '';
    document.getElementById('form-store-email').value = rep.storeEmail || '';
    document.getElementById('form-ca-link').value = rep.caLink || 'https://tinyurl.com/store-caassignment';
    document.getElementById('form-actual-in').value = rep.actualIn || '';
    document.getElementById('form-actual-out').value = rep.actualOut || '';

    document.getElementById('form-banner-title').textContent = `FMCU Visit Store Report — ${rep.storeName || '-'}`;
    document.getElementById('form-banner-store-badge').textContent = `Kode Toko: ${rep.storeCode || '-'} (${rep.storeType || 'CVS'})`;

    const navSub = document.getElementById('nav-form-store-subtitle');
    if (navSub) navSub.textContent = `${rep.storeName || 'Toko'} (${rep.storeCode || '-'})`;

    this.formCrew = JSON.parse(JSON.stringify(rep.crewList || []));
    this.formQscPhotos = JSON.parse(JSON.stringify(rep.qscPhotos || []));
    this.formObservations = JSON.parse(JSON.stringify(rep.observations || []));
    this.formEvidencePhotos = JSON.parse(JSON.stringify(rep.evidencePhotos || []));

    this.renderFormDynamicSections();
  },

  renderFormDynamicSections() {
    this.renderCrewTable();
    this.renderQscPhotosGrid();
    this.renderObservationsList();
    this.renderEvidenceGrid();
  },

  // --- Section 1B: Crew Table ---
  renderCrewTable() {
    const tbody = document.getElementById('form-crew-tbody');
    if (!tbody) return;
    tbody.innerHTML = this.formCrew
      .map(
        (c, idx) => `
        <tr class="bg-white">
          <td class="p-2">
            <input type="text" value="${c.role || ''}" oninput="FMCUApp.formCrew[${idx}].role = this.value" placeholder="Jabatan / Role" class="fm-input py-1.5 text-xs font-bold" />
          </td>
          <td class="p-2">
            <input type="text" value="${c.name || ''}" oninput="FMCUApp.formCrew[${idx}].name = this.value" placeholder="Nama lengkap personil" class="fm-input py-1.5 text-xs" />
          </td>
          <td class="p-2">
            <input type="text" value="${c.jobLevel || ''}" oninput="FMCUApp.formCrew[${idx}].jobLevel = this.value" placeholder="NS1 / MG1" class="fm-input py-1.5 text-xs text-center font-bold" />
          </td>
          <td class="p-2 text-center">
            <button type="button" onclick="FMCUApp.removeCrewRow(${idx})" class="text-slate-400 hover:text-rose-600 p-1 cursor-pointer">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `
      )
      .join('');
  },

  addCrewRow() {
    this.formCrew.push({
      role: `Crew Store ${this.formCrew.length}`,
      name: '',
      jobLevel: ''
    });
    this.renderCrewTable();
  },

  removeCrewRow(idx) {
    if (this.formCrew.length <= 1) return;
    this.formCrew.splice(idx, 1);
    this.renderCrewTable();
  },

  // --- Section 2: QSC / FamiTrack Photos ---
  renderQscPhotosGrid() {
    const grid = document.getElementById('form-qsc-photos-grid');
    if (!grid) return;
    grid.innerHTML = this.formQscPhotos
      .map(
        (p, idx) => `
        <div class="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <input type="text" value="${p.caption || `Foto QSC / Famitrack ${idx + 1}`}" oninput="FMCUApp.formQscPhotos[${idx}].caption = this.value" class="fm-input py-1.5 text-xs font-bold bg-white" />
            <button type="button" onclick="FMCUApp.removeQscPhotoSlot(${idx})" class="text-slate-400 hover:text-rose-600 p-1.5 cursor-pointer">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>

          <div class="w-full h-48 rounded-xl bg-white border border-dashed border-slate-300 overflow-hidden flex items-center justify-center relative group">
            ${
              p.dataUrl
                ? `<img src="${p.dataUrl}" class="w-full h-full object-cover" alt="QSC Form" />`
                : `<div class="text-center text-slate-400 text-xs"><i class="fa-solid fa-file-image text-2xl mb-1 block"></i>Unggah foto form QSC / FamiTrack</div>`
            }
            <label class="absolute bottom-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer shadow">
              <i class="fa-solid fa-camera mr-1"></i>Pilih / Kamera
              <input type="file" accept="image/*" onchange="FMCUApp.handleQscPhotoUpload(event, ${idx})" class="hidden" />
            </label>
          </div>
        </div>
      `
      )
      .join('');
  },

  addQscPhotoSlot() {
    this.formQscPhotos.push({
      id: 'qsc-' + Date.now(),
      caption: `Foto QSC / Famitrack ${this.formQscPhotos.length + 1}`,
      dataUrl: ''
    });
    this.renderQscPhotosGrid();
  },

  removeQscPhotoSlot(idx) {
    if (this.formQscPhotos.length <= 1) return;
    this.formQscPhotos.splice(idx, 1);
    this.renderQscPhotosGrid();
  },

  async handleQscPhotoUpload(event, idx) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await window.FMCUPdf.processAndStampImage(file, {
      applyWatermark: false,
      maxDimension: 1200
    });
    this.formQscPhotos[idx].dataUrl = dataUrl;
    this.renderQscPhotosGrid();
    this.showToast(`Foto QSC / Famitrack ${idx + 1} berhasil diunggah`, 'success');
  },

  // --- Section 3: QSC Observation Findings ---
  renderObservationsList() {
    const container = document.getElementById('form-observations-list');
    if (!container) return;
    const presets = window.FMCUData.FINDING_PRESETS || [];

    container.innerHTML = this.formObservations
      .map(
        (obs, idx) => `
        <div class="border border-slate-300 rounded-2xl overflow-hidden bg-white shadow-sm">
          <!-- Card Header -->
          <div class="bg-[#0099A6] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-sm">Temuan ${idx + 1}/${this.formObservations.length}</span>
              <select onchange="FMCUApp.applyFindingPreset(${idx}, this.value)" class="text-xs bg-white/15 hover:bg-white/25 text-white border border-white/30 rounded-lg px-2.5 py-1 font-semibold focus:outline-none cursor-pointer">
                <option value="" class="text-slate-900">⚡ Pilih Template Standar SOP (Opsional)...</option>
                ${presets.map((pr) => `<option value="${pr.id}" class="text-slate-900">${pr.label}</option>`).join('')}
              </select>
            </div>

            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1.5 bg-white text-slate-800 px-2.5 py-1 rounded-full text-xs font-bold">
                <span class="text-rose-700">Deadline Perbaikan:</span>
                <input type="date" value="${obs.deadline || ''}" onchange="FMCUApp.formObservations[${idx}].deadline = this.value; FMCUApp.formObservations[${idx}].deadlineFormatted = window.FMCUPdf.formatIndonesianDate(this.value, false);" class="text-xs font-bold text-rose-700 focus:outline-none bg-transparent" />
              </div>
              <button type="button" onclick="FMCUApp.removeObservationCard(${idx})" class="text-white/80 hover:text-white p-1 cursor-pointer" title="Hapus Temuan">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>

          <!-- 2x3 Grid matching PDF layout -->
          <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div class="bg-[#FEFCE8] border border-amber-300 rounded-xl p-3 space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="font-extrabold text-amber-800 uppercase">Temuan (Finding) *</label>
                <select onchange="FMCUApp.formObservations[${idx}].category = this.value" class="text-[11px] bg-white border border-amber-200 rounded px-2 py-0.5 font-semibold text-slate-700">
                  ${[
                    'Food Safety & Expired',
                    'Standar SOP & Alat Takar',
                    'Kebersihan & Sanitasi (QSC)',
                    'Administrasi & Logbook',
                    'Merchandising & Price Card'
                  ]
                    .map(
                      (cat) =>
                        `<option value="${cat}" ${obs.category === cat ? 'selected' : ''}>${cat}</option>`
                    )
                    .join('')}
                </select>
              </div>
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].temuan = this.value" placeholder="Tuliskan detail temuan observasi..." class="w-full bg-white/90 border border-amber-200 rounded-lg p-2 font-bold text-slate-900 focus:outline-none">${obs.temuan || ''}</textarea>
            </div>

            <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <label class="font-extrabold text-[#008291] uppercase block">Dampak (Impact)</label>
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].dampak = this.value" placeholder="Tuliskan dampak terhadap kualitas / operasional toko..." class="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none">${obs.dampak || ''}</textarea>
            </div>

            <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <label class="font-extrabold text-[#008291] uppercase block">Kondisi Ideal</label>
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].kondisiIdeal = this.value" placeholder="Tuliskan standar kondisi ideal..." class="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none">${obs.kondisiIdeal || ''}</textarea>
            </div>

            <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <label class="font-extrabold text-[#008291] uppercase block">Tindakan Perbaikan (Corrective Action)</label>
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].tindakanPerbaikan = this.value" placeholder="Tuliskan tindakan perbaikan yang harus dilakukan..." class="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none">${obs.tindakanPerbaikan || ''}</textarea>
            </div>

            <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <label class="font-extrabold text-[#008291] uppercase block">Penyebab (Root Cause)</label>
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].penyebab = this.value" placeholder="Tuliskan akar penyebab temuan..." class="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none">${obs.penyebab || ''}</textarea>
            </div>

            <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <label class="font-extrabold text-[#008291] uppercase block">Hasil (Result / Follow-Up)</label>
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].hasil = this.value" placeholder="Tuliskan hasil tindak lanjut..." class="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none">${obs.hasil || ''}</textarea>
            </div>
          </div>
        </div>
      `
      )
      .join('');
  },

  addObservationCard() {
    const todayStr = new Date().toISOString().slice(0, 10);
    this.formObservations.push({
      id: 'obs-' + Date.now(),
      category: 'Food Safety & Expired',
      temuan: '',
      kondisiIdeal: '',
      penyebab: '',
      dampak: '',
      tindakanPerbaikan: '',
      hasil: '',
      deadline: todayStr,
      deadlineFormatted: window.FMCUPdf.formatIndonesianDate(todayStr, false),
      status: 'OPEN'
    });
    this.renderObservationsList();
  },

  removeObservationCard(idx) {
    if (this.formObservations.length <= 1) return;
    this.formObservations.splice(idx, 1);
    this.renderObservationsList();
  },

  applyFindingPreset(obsIdx, presetId) {
    if (!presetId) return;
    const preset = (window.FMCUData.FINDING_PRESETS || []).find((p) => p.id === presetId);
    if (!preset) return;
    this.formObservations[obsIdx] = {
      ...this.formObservations[obsIdx],
      category: preset.category,
      kondisiIdeal: preset.kondisiIdeal,
      penyebab: preset.penyebab,
      dampak: preset.dampak,
      tindakanPerbaikan: preset.tindakanPerbaikan,
      hasil: preset.hasil
    };
    this.renderObservationsList();
    this.showToast(`Template "${preset.label}" diterapkan ke Temuan #${obsIdx + 1}`, 'info');
  },

  // --- Section 4: Finding Evidence Photos ---
  renderEvidenceGrid() {
    const grid = document.getElementById('form-evidence-grid');
    if (!grid) return;

    if (this.formEvidencePhotos.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-400 text-xs">
          Belum ada foto bukti temuan. Klik <strong>"+ 1 Kartu Bukti"</strong> atau <strong>"Upload Banyak Foto Sekaligus"</strong>.
        </div>
      `;
      return;
    }

    grid.innerHTML = this.formEvidencePhotos
      .map(
        (ev, idx) => `
        <div class="border border-slate-300 rounded-2xl p-3 bg-white grid grid-cols-12 gap-3 relative shadow-sm">
          <button type="button" onclick="FMCUApp.removeEvidencePhotoCard(${idx})" class="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs cursor-pointer" title="Hapus Foto">
            <i class="fa-solid fa-xmark"></i>
          </button>

          <div class="col-span-5 h-36 bg-slate-100 rounded-xl overflow-hidden relative flex items-center justify-center border border-slate-200">
            ${
              ev.dataUrl
                ? `<img src="${ev.dataUrl}" class="w-full h-full object-cover" alt="Evidence" />`
                : `<i class="fa-solid fa-camera text-slate-300 text-xl"></i>`
            }
            <label class="absolute bottom-1.5 inset-x-1.5 bg-slate-900/80 hover:bg-slate-900 text-white text-[10px] font-bold py-1 rounded text-center cursor-pointer">
              Pilih Foto
              <input type="file" accept="image/*" onchange="FMCUApp.handleSingleEvidenceUpload(event, ${idx})" class="hidden" />
            </label>
          </div>

          <div class="col-span-7 flex flex-col justify-between pr-4">
            <div>
              <label class="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">Bukti #${idx + 1} — Keterangan</label>
              <textarea rows="4" oninput="FMCUApp.formEvidencePhotos[${idx}].description = this.value" placeholder="Tuliskan deskripsi temuan foto ini..." class="w-full border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-teal-500">${ev.description || ''}</textarea>
            </div>
          </div>
        </div>
      `
      )
      .join('');
  },

  addEvidencePhotoCard() {
    this.formEvidencePhotos.push({
      id: 'ev-' + Date.now(),
      description: '',
      dataUrl: ''
    });
    this.renderEvidenceGrid();
  },

  removeEvidencePhotoCard(idx) {
    this.formEvidencePhotos.splice(idx, 1);
    this.renderEvidenceGrid();
  },

  async handleSingleEvidenceUpload(event, idx) {
    const file = event.target.files?.[0];
    if (!file) return;
    const storeName = document.getElementById('form-store-name').value || 'STORE';
    const applyWm = document.getElementById('form-watermark-toggle')?.checked ?? true;
    const dataUrl = await window.FMCUPdf.processAndStampImage(file, {
      storeName,
      gpsLat: this.liveGps.lat,
      gpsLng: this.liveGps.lng,
      applyWatermark: applyWm
    });
    this.formEvidencePhotos[idx].dataUrl = dataUrl;
    this.renderEvidenceGrid();
    this.showToast(`Foto bukti #${idx + 1} berhasil diproses`, 'success');
  },

  async handleBulkEvidenceUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    const storeName = document.getElementById('form-store-name').value || 'STORE';
    const applyWm = document.getElementById('form-watermark-toggle')?.checked ?? true;

    for (const file of files) {
      const dataUrl = await window.FMCUPdf.processAndStampImage(file, {
        storeName,
        gpsLat: this.liveGps.lat,
        gpsLng: this.liveGps.lng,
        applyWatermark: applyWm
      });
      this.formEvidencePhotos.push({
        id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        description: '',
        dataUrl
      });
    }
    this.renderEvidenceGrid();
    this.showToast(`${files.length} foto bukti berhasil diunggah!`, 'success');
  },

  buildCurrentFormReportObject() {
    const existingId = document.getElementById('form-report-id')?.value || '';
    const scheduleId = document.getElementById('form-schedule-id')?.value || '';
    const visitDate = document.getElementById('form-visit-date')?.value || new Date().toISOString().slice(0, 10);
    const settings = window.FMCUData.getSettings();

    return {
      id: existingId || 'rep-' + Date.now(),
      scheduleId: scheduleId || null,
      reportTitle: settings.reportTitle || 'FMCU Visit Store Report',
      auditorId: this.currentUser?.id || 'usr-auditor',
      auditorName: document.getElementById('form-auditor-name')?.value.trim() || '-',
      visitDate,
      visitDateFormatted: window.FMCUPdf.formatIndonesianDate(visitDate, false),
      visitDayDateFormatted: window.FMCUPdf.formatIndonesianDate(visitDate, true),
      storeCode: document.getElementById('form-store-code')?.value.trim() || '-',
      storeName: (document.getElementById('form-store-name')?.value.trim() || '-').toUpperCase(),
      storeType: document.getElementById('form-store-type')?.value || 'CVS',
      storeHead: document.getElementById('form-store-head')?.value.trim() || '-',
      areaManager: document.getElementById('form-area-manager')?.value.trim() || '-',
      regionalManager: document.getElementById('form-regional-manager')?.value.trim() || '-',
      storeEmail: document.getElementById('form-store-email')?.value.trim() || '',
      actualIn: document.getElementById('form-actual-in')?.value.trim() || '-',
      actualOut: document.getElementById('form-actual-out')?.value.trim() || '-',
      durationMinutes: 0,
      gpsLat: this.liveGps.lat,
      gpsLng: this.liveGps.lng,
      qscScore: Number(document.getElementById('form-qsc-score')?.value || 0),
      crewList: JSON.parse(JSON.stringify(this.formCrew)),
      qscPhotos: JSON.parse(JSON.stringify(this.formQscPhotos)),
      observations: this.formObservations.map((o) => ({
        ...o,
        deadlineFormatted: o.deadlineFormatted || window.FMCUPdf.formatIndonesianDate(o.deadline, false)
      })),
      evidencePhotos: JSON.parse(JSON.stringify(this.formEvidencePhotos)),
      caLink: document.getElementById('form-ca-link')?.value.trim() || 'https://tinyurl.com/store-caassignment',
      createdAt: new Date().toISOString()
    };
  },

  collectAndSaveFormReport() {
    if (!document.getElementById('form-actual-out').value.trim()) {
      document.getElementById('form-actual-out').value = this.getCurrentTimeWIB();
    }
    const reportObj = this.buildCurrentFormReportObject();

    const reports = window.FMCUData.getReports();
    const idx = reports.findIndex((r) => r.id === reportObj.id);
    if (idx !== -1) {
      reports[idx] = reportObj;
    } else {
      reports.unshift(reportObj);
    }
    window.FMCUData.saveReports(reports);

    // Update linked Schedule if any
    const schedules = window.FMCUData.getSchedules();
    const schIdx = schedules.findIndex(
      (s) =>
        (reportObj.scheduleId && s.id === reportObj.scheduleId) ||
        (s.storeCode === reportObj.storeCode && s.status !== 'COMPLETED')
    );
    if (schIdx !== -1) {
      schedules[schIdx].status = 'COMPLETED';
      schedules[schIdx].actualIn = reportObj.actualIn;
      schedules[schIdx].actualOut = reportObj.actualOut;
      schedules[schIdx].actualLat = reportObj.gpsLat;
      schedules[schIdx].actualLng = reportObj.gpsLng;
      schedules[schIdx].reportId = reportObj.id;
      window.FMCUData.saveSchedules(schedules);
    }

    window.FMCUData.setActiveCheckIn(null);
    this.hasActiveStoreForm = false;
    this.updateActiveCheckInUI();

    return reportObj;
  },

  handleSaveAndPreview(event) {
    if (event) event.preventDefault();
    const saved = this.collectAndSaveFormReport();
    this.activePreviewReportId = saved.id;
    this.renderAllViews();
    this.navigate('preview');
    this.showToast(`Laporan Visit Toko ${saved.storeName} berhasil disimpan!`, 'success');
  },

  handleSaveAndSendIntegration() {
    const saved = this.collectAndSaveFormReport();
    this.activePreviewReportId = saved.id;
    this.renderAllViews();
    this.openIntegrationSendModal(saved.id);
  },

  // ==========================================================================
  // HALAMAN 3: PREVIEW HASIL PDF (16:9 SLIDE DECK + GRID + DOWNLOAD)
  // ==========================================================================
  renderPreviewSelector() {
    const sel = document.getElementById('preview-report-selector');
    if (!sel) return;
    const reports = window.FMCUData.getReports();

    if (reports.length > 0 && this.activePreviewReportId === '__LIVE_FORM__' && !this.hasActiveStoreForm) {
      this.activePreviewReportId = reports[0].id;
    }

    const optionsHtml =
      (this.hasActiveStoreForm || reports.length === 0
        ? `<option value="__LIVE_FORM__" ${this.activePreviewReportId === '__LIVE_FORM__' ? 'selected' : ''}>[Draft Form Toko Saat Ini]</option>`
        : '') +
      reports
        .map(
          (r) =>
            `<option value="${r.id}" ${r.id === this.activePreviewReportId ? 'selected' : ''}>${r.storeName} (${r.storeCode}) — ${r.visitDateFormatted || r.visitDate} [${r.auditorName}]</option>`
        )
        .join('');

    sel.innerHTML = optionsHtml;
  },

  getActivePreviewReport() {
    if (this.activePreviewReportId === '__LIVE_FORM__') {
      return this.buildCurrentFormReportObject();
    }
    const reports = window.FMCUData.getReports();
    return reports.find((r) => r.id === this.activePreviewReportId) || reports[0] || this.buildCurrentFormReportObject();
  },

  openReportPreview(reportId) {
    this.activePreviewReportId = reportId;
    this.currentSlideIndex = 0;
    this.navigate('preview');
  },

  onChangePreviewReport(reportId) {
    this.activePreviewReportId = reportId;
    this.currentSlideIndex = 0;
    this.renderPreviewView();
  },

  setPreviewMode(mode) {
    this.previewMode = mode;
    document.getElementById('preview-slide-mode-container').classList.toggle('hidden', mode !== 'slide');
    document.getElementById('preview-grid-mode-container').classList.toggle('hidden', mode !== 'grid');

    const btnSlide = document.getElementById('btn-mode-slide');
    const btnGrid = document.getElementById('btn-mode-grid');
    if (mode === 'slide') {
      btnSlide.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-900 shadow-sm transition cursor-pointer';
      btnGrid.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer';
    } else {
      btnGrid.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-900 shadow-sm transition cursor-pointer';
      btnSlide.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer';
    }
  },

  renderPreviewView() {
    this.renderPreviewSelector();
    const report = this.getActivePreviewReport();
    if (!report) return;

    this.previewSlides = window.FMCUPdf.buildHtmlSlides(report);
    if (this.currentSlideIndex >= this.previewSlides.length) {
      this.currentSlideIndex = 0;
    }

    this.renderActiveSlide();
    this.renderAllSlidesGrid();
  },

  renderActiveSlide() {
    const slide = this.previewSlides[this.currentSlideIndex];
    if (!slide) return;

    document.getElementById('preview-slide-counter').textContent = `Halaman ${this.currentSlideIndex + 1} / ${this.previewSlides.length}`;
    document.getElementById('preview-slide-title').textContent = slide.title;
    document.getElementById('preview-active-slide-stage').innerHTML = slide.html;

    const strip = document.getElementById('preview-thumbnails-strip');
    if (strip) {
      strip.innerHTML = this.previewSlides
        .map(
          (s, idx) => `
          <button type="button" onclick="FMCUApp.goToSlide(${idx})" class="shrink-0 px-3 py-2 rounded-xl border text-left transition cursor-pointer ${
            idx === this.currentSlideIndex
              ? 'border-[#0099A6] bg-teal-50 text-[#0099A6] font-extrabold shadow-sm'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }">
            <div class="text-[10px] uppercase tracking-wider">Hal ${idx + 1}</div>
            <div class="text-xs truncate max-w-[130px]">${s.title}</div>
          </button>
        `
        )
        .join('');
    }
  },

  renderAllSlidesGrid() {
    const grid = document.getElementById('preview-grid-mode-container');
    if (!grid) return;
    grid.innerHTML = this.previewSlides
      .map(
        (s, idx) => `
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
            <span>Halaman ${idx + 1}: ${s.title}</span>
            <span class="text-[11px] text-slate-400">16:9 PDF Page</span>
          </div>
          <div class="pdf-slide-wrapper">
            <div class="pdf-slide-canvas">${s.html}</div>
          </div>
        </div>
      `
      )
      .join('');
  },

  goToSlide(idx) {
    this.currentSlideIndex = idx;
    this.renderActiveSlide();
  },

  nextSlide() {
    if (this.currentSlideIndex < this.previewSlides.length - 1) {
      this.currentSlideIndex++;
      this.renderActiveSlide();
    }
  },

  prevSlide() {
    if (this.currentSlideIndex > 0) {
      this.currentSlideIndex--;
      this.renderActiveSlide();
    }
  },

  downloadCurrentPreviewPdf() {
    const report = this.getActivePreviewReport();
    if (!report) return;
    this.showToast(`Membuat & mengunduh file PDF ${window.FMCUPdf.getFileName(report)}...`, 'info');
    setTimeout(() => {
      window.FMCUPdf.downloadReportPdf(report);
      this.showToast(`PDF ${window.FMCUPdf.getFileName(report)} berhasil diunduh!`, 'success');
    }, 150);
  },

  downloadReportById(reportId) {
    const reports = window.FMCUData.getReports();
    const rep = reports.find((r) => r.id === reportId);
    if (!rep) return;
    window.FMCUPdf.downloadReportPdf(rep);
    this.showToast(`PDF ${window.FMCUPdf.getFileName(rep)} berhasil diunduh!`, 'success');
  },

  editReportById(reportId) {
    const reports = window.FMCUData.getReports();
    const rep = reports.find((r) => r.id === reportId);
    if (!rep) return;
    this.loadReportObjectToForm(rep);
    this.navigate('form');
    this.showToast(`Membuka form toko ${rep.storeName}`, 'info');
  },

  // ==========================================================================
  // EMAIL & GOOGLE DRIVE INTEGRATION
  // ==========================================================================
  openIntegrationSendModal(reportId = null) {
    if (reportId) this.activePreviewReportId = reportId;
    const rep = this.getActivePreviewReport();
    if (!rep) return;
    const settings = window.FMCUData.getSettings();

    document.getElementById('modal-send-report-name').textContent = `Laporan: FamilyMart ${rep.storeName || '-'} (${rep.storeCode || '-'}) — ${rep.visitDateFormatted || rep.visitDate}`;
    document.getElementById('modal-send-report-meta').textContent = `Auditor: ${rep.auditorName || '-'} • ${(rep.observations || []).length} Temuan Observasi • ${(rep.evidencePhotos || []).length} Foto Bukti`;
    document.getElementById('modal-send-to').value = rep.storeEmail || '';
    document.getElementById('modal-send-cc').value = settings.defaultCcEmails || '';
    document.getElementById('modal-send-folder').value = settings.gdriveFolderId || '';

    const statusEl = document.getElementById('modal-send-status');
    statusEl.classList.add('hidden');
    document.getElementById('modal-send-integration').classList.remove('hidden');
  },

  async executeSendEmailAndGDrive() {
    const rep = this.getActivePreviewReport();
    if (!rep) return;
    const settings = window.FMCUData.getSettings();
    const toEmail = document.getElementById('modal-send-to').value.trim();
    const ccEmail = document.getElementById('modal-send-cc').value.trim();
    const folderId = document.getElementById('modal-send-folder').value.trim();
    const statusEl = document.getElementById('modal-send-status');
    const btn = document.getElementById('btn-execute-send');

    btn.disabled = true;
    statusEl.className = 'p-3 rounded-xl font-semibold text-xs bg-teal-50 text-teal-900 border border-teal-200 block';
    statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Sedang membuat file PDF 16:9 dan memproses pengiriman...`;

    const fileName = window.FMCUPdf.getFileName(rep);
    window.FMCUPdf.downloadReportPdf(rep);

    if (settings.gasWebhookUrl && settings.gasWebhookUrl.startsWith('http')) {
      try {
        const pdfBase64 = window.FMCUPdf.getPdfBase64(rep);
        await fetch(settings.gasWebhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report: rep,
            pdfBase64,
            fileName,
            gdriveFolderId: folderId,
            recipientEmails: toEmail,
            ccEmails: ccEmail
          })
        });
        statusEl.className = 'p-3 rounded-xl font-semibold text-xs bg-emerald-50 text-emerald-900 border border-emerald-200 block';
        statusEl.innerHTML = `✅ Berhasil! File <b>${fileName}</b> telah diunggah ke Google Drive dan dikirim via Email.`;
        this.showToast('Laporan berhasil dikirim ke Email & Google Drive!', 'success');
      } catch (err) {
        statusEl.className = 'p-3 rounded-xl font-semibold text-xs bg-amber-50 text-amber-900 border border-amber-200 block';
        statusEl.innerHTML = `⚠️ File PDF telah diunduh (${fileName}).`;
      }
    } else {
      const obsListText = (rep.observations || [])
        .map((o, i) => `${i + 1}. ${o.temuan || '-'} (Deadline: ${o.deadlineFormatted || o.deadline || '-'})`)
        .join('%0D%0A');
      const subject = encodeURIComponent(`[FMCU VISIT REPORT] ${rep.storeName} (${rep.storeCode}) - ${rep.visitDateFormatted || rep.visitDate}`);
      const body =
        `Halo Tim Store ${rep.storeName} (${rep.storeCode}),%0D%0A%0D%0A` +
        `Berikut terlampir hasil FMCU Visit Store Report pada ${rep.visitDayDateFormatted || rep.visitDate}:%0D%0A` +
        `- Auditor: ${rep.auditorName}%0D%0A` +
        `- Store Head: ${rep.storeHead}%0D%0A` +
        `- Waktu Actual In - Out: ${rep.actualIn} s/d ${rep.actualOut}%0D%0A` +
        `- Koordinat GPS: ${rep.gpsLat || '-'}, ${rep.gpsLng || '-'}%0D%0A%0D%0A` +
        `Ringkasan Temuan Observasi:%0D%0A${obsListText}%0D%0A%0D%0A` +
        `Link Form Corrective Action: ${rep.caLink || 'https://tinyurl.com/store-caassignment'}`;

      statusEl.className = 'p-3 rounded-xl font-semibold text-xs bg-emerald-50 text-emerald-900 border border-emerald-200 block';
      statusEl.innerHTML = `
        <div class="space-y-1.5">
          <div>✅ File PDF <strong>${fileName}</strong> berhasil diunduh.</div>
          <div class="flex flex-wrap gap-2 pt-1">
            <a href="mailto:${toEmail}?cc=${encodeURIComponent(ccEmail)}&subject=${subject}&body=${body}" class="px-3 py-1.5 rounded-lg bg-[#009944] text-white font-bold inline-flex items-center gap-1">
              <i class="fa-regular fa-envelope"></i> Buka Aplikasi Email Siap Kirim
            </a>
          </div>
        </div>
      `;
      this.showToast(`File ${fileName} berhasil diunduh!`, 'success');
    }

    btn.disabled = false;
  },

  // ==========================================================================
  // HALAMAN 4: ADMIN PORTAL (RBAC GATE, SCHEDULES, STORES, USERS, INTEGRATIONS)
  // ==========================================================================
  checkAdminGateUI() {
    const hasAuth = this.hasAdminAuthority();
    document.getElementById('admin-authority-gate').classList.toggle('hidden', hasAuth);
    document.getElementById('admin-panel-content').classList.toggle('hidden', !hasAuth);
  },

  handleAdminGateLogin(event) {
    event.preventDefault();
    const uName = document.getElementById('gate-admin-username').value.trim().toLowerCase();
    const pass = document.getElementById('gate-admin-password').value.trim();
    const users = window.FMCUData.getUsers();
    const found = users.find((u) => u.username.toLowerCase() === uName && u.password === pass && this.hasAdminAuthority(u));

    if (!found) {
      this.showToast('Kredensial Admin tidak valid atau akun tidak memiliki otoritas Admin.', 'error');
      return;
    }

    this.setLoggedInUser(found);
    this.checkAdminGateUI();
    this.showToast(`Otoritas Admin terverifikasi: ${found.name}`, 'success');
  },

  switchAdminTab(tabName) {
    this.currentAdminTab = tabName;
    const tabs = ['schedules', 'stores', 'users', 'integrations'];
    tabs.forEach((t) => {
      const panel = document.getElementById(`admin-tab-${t}`);
      if (panel) panel.classList.toggle('hidden', t !== tabName);

      const btn = document.getElementById(`admin-tab-btn-${t}`);
      if (btn) {
        if (t === tabName) {
          btn.className = 'px-3.5 py-2 rounded-xl text-xs font-bold bg-[#009944] text-white transition cursor-pointer';
        } else {
          btn.className = 'px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer';
        }
      }
    });
  },

  renderAdminView() {
    const stores = window.FMCUData.getStores();
    const users = window.FMCUData.getUsers();
    const schedules = window.FMCUData.getSchedules();
    const settings = window.FMCUData.getSettings();

    // Populate Schedule Form Dropdowns
    const schStoreSel = document.getElementById('adm-sch-store');
    if (schStoreSel) {
      schStoreSel.innerHTML =
        stores.length > 0
          ? stores.map((s) => `<option value="${s.code}">${s.code} - ${s.name} (${s.type})</option>`).join('')
          : `<option value="">-- Tambahkan Master Toko Terlebih Dahulu --</option>`;
    }
    const schAuditorSel = document.getElementById('adm-sch-auditor');
    if (schAuditorSel) {
      schAuditorSel.innerHTML = users.map((u) => `<option value="${u.id}">${u.name} (${u.roleBadge || u.role})</option>`).join('');
    }
    const schDateInput = document.getElementById('adm-sch-date');
    if (schDateInput && !schDateInput.value) {
      schDateInput.value = new Date().toISOString().slice(0, 10);
    }

    // 1. Render Admin Schedules Table
    document.getElementById('admin-schedule-count').textContent = `${schedules.length} Jadwal`;
    const schTbody = document.getElementById('admin-schedules-tbody');
    if (schTbody) {
      if (schedules.length === 0) {
        schTbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">Belum ada jadwal visit toko.</td></tr>`;
      } else {
        schTbody.innerHTML = schedules
          .map(
            (s) => `
            <tr class="hover:bg-slate-50">
              <td class="py-2.5 px-3 font-semibold">${window.FMCUPdf.formatIndonesianDate(s.scheduledDate, false)}</td>
              <td class="py-2.5 px-3">
                <div class="font-bold text-slate-900">${s.storeName}</div>
                <div class="text-[10px] font-mono text-slate-400">Kode: ${s.storeCode} (${s.storeType})</div>
              </td>
              <td class="py-2.5 px-3 font-medium">${s.auditorName}</td>
              <td class="py-2.5 px-3 text-[11px] font-mono">
                ${s.actualIn ? `<span class="text-emerald-700 font-bold">${s.actualIn} - ${s.actualOut || '-'}</span>` : '<span class="text-slate-400">Belum Check-In</span>'}
              </td>
              <td class="py-2.5 px-3">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  s.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }">${s.status}</span>
              </td>
              <td class="py-2.5 px-3 text-right space-x-1">
                <button onclick="FMCUApp.checkInAndOpenForm('${s.storeCode}', '${s.id}')" class="text-[#0099A6] hover:underline font-bold cursor-pointer">Visit</button>
                <button onclick="FMCUApp.deleteSchedule('${s.id}')" class="text-rose-600 hover:underline font-bold ml-2 cursor-pointer">Hapus</button>
              </td>
            </tr>
          `
          )
          .join('');
      }
    }

    // 2. Render Admin Master Stores Table
    document.getElementById('admin-store-count').textContent = `${stores.length} Toko`;
    const stTbody = document.getElementById('admin-stores-tbody');
    if (stTbody) {
      if (stores.length === 0) {
        stTbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">Belum ada data master toko. Silakan tambahkan toko di form sebelah kiri.</td></tr>`;
      } else {
        stTbody.innerHTML = stores
          .map(
            (st) => `
            <tr class="hover:bg-slate-50">
              <td class="py-2.5 px-3 font-mono font-bold text-[#0099A6]">${st.code}</td>
              <td class="py-2.5 px-3 font-extrabold text-slate-900">${st.name}</td>
              <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded bg-slate-100 font-bold">${st.type}</span></td>
              <td class="py-2.5 px-3">${st.storeHead}</td>
              <td class="py-2.5 px-3 text-[11px]">
                <div>AM: <strong>${st.areaManager}</strong></div>
                <div>RM: <strong>${st.regionalManager}</strong></div>
              </td>
              <td class="py-2.5 px-3 text-right space-x-2">
                <button onclick="FMCUApp.editStore('${st.code}')" class="text-[#0099A6] hover:underline font-bold cursor-pointer">Edit</button>
                <button onclick="FMCUApp.deleteStore('${st.code}')" class="text-rose-600 hover:underline font-bold cursor-pointer">Hapus</button>
              </td>
            </tr>
          `
          )
          .join('');
      }
    }

    // 3. Render Admin Users & Authorities Table
    const usrTbody = document.getElementById('admin-users-tbody');
    if (usrTbody) {
      usrTbody.innerHTML = users
        .map(
          (u) => `
          <tr class="hover:bg-slate-50">
            <td class="py-2.5 px-3">
              <div class="font-bold text-slate-900">${u.name}</div>
              <div class="text-[11px] font-mono text-slate-400">@${u.username}</div>
            </td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                u.role === 'SUPER_ADMIN'
                  ? 'bg-emerald-100 text-emerald-800'
                  : u.role === 'ADMIN_SCHEDULE'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-teal-100 text-teal-800'
              }">${u.roleBadge || u.role}</span>
              <div class="text-[10px] text-slate-400 mt-0.5">${u.region || '-'}</div>
            </td>
            <td class="py-2.5 px-3">
              <div class="flex flex-wrap gap-1 max-w-xs">
                ${(u.authorities || []).map((a) => `<span class="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">${a}</span>`).join('')}
              </div>
            </td>
            <td class="py-2.5 px-3 font-mono text-[11px] text-slate-600">
              ${u.lastLocation && u.lastLocation.lat ? `${u.lastLocation.lat}, ${u.lastLocation.lng}` : '-'}
            </td>
            <td class="py-2.5 px-3 text-right space-x-2">
              <button onclick="FMCUApp.editUser('${u.id}')" class="text-emerald-700 hover:underline font-bold cursor-pointer">Edit / Password</button>
              <button onclick="FMCUApp.quickLoginById('${u.id}')" class="text-[#0099A6] hover:underline font-bold cursor-pointer">Pakai Akun</button>
              <button onclick="FMCUApp.deleteUser('${u.id}')" class="text-rose-600 hover:underline font-bold cursor-pointer">Hapus</button>
            </td>
          </tr>
        `
        )
        .join('');
    }

    // 4. Populate Integration Settings Form
    document.getElementById('set-report-title').value = settings.reportTitle || 'FMCU Visit Store Report';
    document.getElementById('set-footer-text').value = settings.footerText || 'GENERATED BY FMCU VISIT WEB REPORT';
    document.getElementById('set-ca-link').value = settings.caLink || 'https://tinyurl.com/store-caassignment';
    document.getElementById('set-gdrive-folder').value = settings.gdriveFolderId || '';
    document.getElementById('set-cc-emails').value = settings.defaultCcEmails || '';
    document.getElementById('set-gas-url').value = settings.gasWebhookUrl || '';
  },

  handleSaveSchedule(event) {
    event.preventDefault();
    const storeCode = document.getElementById('adm-sch-store').value;
    const auditorId = document.getElementById('adm-sch-auditor').value;
    const dateStr = document.getElementById('adm-sch-date').value;
    const priority = document.getElementById('adm-sch-priority').value;
    const windowStr = document.getElementById('adm-sch-window').value.trim();
    const focus = document.getElementById('adm-sch-focus').value.trim();

    const stores = window.FMCUData.getStores();
    const users = window.FMCUData.getUsers();
    const st = stores.find((s) => s.code === storeCode);
    const au = users.find((u) => u.id === auditorId);
    if (!st) {
      this.showToast('Silakan tambahkan Master Toko terlebih dahulu di Tab 2 (Master Toko).', 'warning');
      return;
    }
    if (!au) return;

    const schedules = window.FMCUData.getSchedules();
    schedules.unshift({
      id: 'sch-' + Date.now(),
      storeCode: st.code,
      storeName: st.name,
      storeType: st.type,
      auditorId: au.id,
      auditorName: au.name,
      scheduledDate: dateStr,
      shiftWindow: windowStr || '-',
      priority,
      auditFocus: focus || '-',
      status: 'PENDING',
      actualIn: null,
      actualOut: null,
      reportId: null,
      assignedBy: this.currentUser?.name || 'Admin FMCU'
    });
    window.FMCUData.saveSchedules(schedules);
    this.renderAllViews();
    document.getElementById('adm-sch-focus').value = '';
    this.showToast(`Jadwal Visit Toko ${st.name} untuk ${au.name} berhasil ditambahkan!`, 'success');
  },

  deleteSchedule(id) {
    const schedules = window.FMCUData.getSchedules().filter((s) => s.id !== id);
    window.FMCUData.saveSchedules(schedules);
    this.renderAllViews();
    this.showToast('Jadwal visit dihapus', 'info');
  },

  handleSaveStore(event) {
    event.preventDefault();
    const code = document.getElementById('adm-st-code').value.trim();
    const type = document.getElementById('adm-st-type').value;
    const name = document.getElementById('adm-st-name').value.trim().toUpperCase();
    const head = document.getElementById('adm-st-head').value.trim();
    const am = document.getElementById('adm-st-am').value.trim();
    const rm = document.getElementById('adm-st-rm').value.trim();
    const email = document.getElementById('adm-st-email').value.trim();
    const latVal = document.getElementById('adm-st-lat').value;
    const lngVal = document.getElementById('adm-st-lng').value;
    const lat = latVal !== '' ? parseFloat(latVal) : null;
    const lng = lngVal !== '' ? parseFloat(lngVal) : null;

    const stores = window.FMCUData.getStores();
    const existingIdx = stores.findIndex((s) => s.code === code);
    const storeObj = {
      code,
      name,
      type,
      storeHead: head,
      areaManager: am,
      regionalManager: rm,
      email,
      lat,
      lng,
      defaultCrew: [
        { role: 'Store Head', name: head, jobLevel: '' },
        { role: 'Shift Leader', name: '', jobLevel: '' },
        { role: 'Crew Store 1', name: '', jobLevel: '' },
        { role: 'Crew Store 2', name: '', jobLevel: '' }
      ]
    };

    if (existingIdx !== -1) {
      stores[existingIdx] = storeObj;
    } else {
      stores.push(storeObj);
    }
    window.FMCUData.saveStores(stores);
    this.populateMasterStoreSelect();
    this.renderAllViews();
    event.target.reset();
    this.showToast(`Master Toko ${name} (${code}) berhasil disimpan!`, 'success');
  },

  editStore(code) {
    const stores = window.FMCUData.getStores();
    const st = stores.find((s) => s.code === code);
    if (!st) return;
    document.getElementById('adm-st-code').value = st.code || '';
    document.getElementById('adm-st-type').value = st.type || 'CVS';
    document.getElementById('adm-st-name').value = st.name || '';
    document.getElementById('adm-st-head').value = st.storeHead || '';
    document.getElementById('adm-st-am').value = st.areaManager || '';
    document.getElementById('adm-st-rm').value = st.regionalManager || '';
    document.getElementById('adm-st-email').value = st.email || '';
    document.getElementById('adm-st-lat').value = st.lat !== null && st.lat !== undefined ? st.lat : '';
    document.getElementById('adm-st-lng').value = st.lng !== null && st.lng !== undefined ? st.lng : '';
    this.showToast(`Memuat data toko ${st.name} (${st.code}) untuk diedit`, 'info');
  },

  deleteStore(code) {
    const stores = window.FMCUData.getStores().filter((s) => s.code !== code);
    window.FMCUData.saveStores(stores);
    this.populateMasterStoreSelect();
    this.renderAllViews();
    this.showToast(`Toko kode ${code} dihapus dari Firestore`, 'info');
  },

  editUser(userId) {
    const users = window.FMCUData.getUsers();
    const u = users.find((x) => x.id === userId);
    if (!u) return;
    document.getElementById('adm-usr-name').value = u.name || '';
    document.getElementById('adm-usr-username').value = u.username || '';
    document.getElementById('adm-usr-password').value = u.password || '';
    document.getElementById('adm-usr-role').value = u.role || 'AUDITOR';
    document.getElementById('adm-usr-region').value = u.region || '';
    document.getElementById('adm-usr-email').value = u.email || '';

    const authSet = new Set(u.authorities || []);
    document.querySelectorAll('input[name="adm-auth"]').forEach((cb) => {
      cb.checked = authSet.has(cb.value);
    });
    this.showToast(`Memuat akun @${u.username} untuk ubah data / password`, 'info');
  },

  handleSaveUser(event) {
    event.preventDefault();
    const name = document.getElementById('adm-usr-name').value.trim();
    const username = document.getElementById('adm-usr-username').value.trim().toLowerCase();
    const password = document.getElementById('adm-usr-password').value.trim();
    const role = document.getElementById('adm-usr-role').value;
    const region = document.getElementById('adm-usr-region').value.trim();
    const email = document.getElementById('adm-usr-email').value.trim();

    const checkedAuths = Array.from(document.querySelectorAll('input[name="adm-auth"]:checked')).map((el) => el.value);
    const roleBadges = {
      AUDITOR: 'Auditor / Regional Bestie',
      ADMIN_SCHEDULE: 'Admin Jadwal',
      SUPER_ADMIN: 'Super Admin FMCU'
    };

    const users = window.FMCUData.getUsers();
    const existingIdx = users.findIndex((u) => u.username.toLowerCase() === username);
    const newUser = {
      id: existingIdx !== -1 ? users[existingIdx].id : 'usr-' + Date.now(),
      username,
      password,
      name,
      email,
      role,
      roleBadge: roleBadges[role] || role,
      region,
      avatarColor: role === 'SUPER_ADMIN' ? '#009944' : '#0099A6',
      active: true,
      authorities: checkedAuths,
      lastLocation: null
    };

    if (existingIdx !== -1) {
      users[existingIdx] = newUser;
    } else {
      users.push(newUser);
    }
    window.FMCUData.saveUsers(users);
    this.populateHeaderRoleSwitcher();
    this.renderAllViews();
    event.target.reset();
    this.showToast(`User ${name} (@${username}) berhasil disimpan!`, 'success');
  },

  deleteUser(userId) {
    const users = window.FMCUData.getUsers();
    if (users.length <= 1) return;
    window.FMCUData.saveUsers(users.filter((u) => u.id !== userId));
    this.populateHeaderRoleSwitcher();
    this.renderAllViews();
    this.showToast('Akun user dihapus', 'info');
  },

  handleSaveIntegrationSettings(event) {
    event.preventDefault();
    const settings = {
      reportTitle: document.getElementById('set-report-title').value.trim() || 'FMCU Visit Store Report',
      footerText: document.getElementById('set-footer-text').value.trim() || 'GENERATED BY FMCU VISIT WEB REPORT',
      caLink: document.getElementById('set-ca-link').value.trim() || 'https://tinyurl.com/store-caassignment',
      gdriveFolderId: document.getElementById('set-gdrive-folder').value.trim(),
      defaultCcEmails: document.getElementById('set-cc-emails').value.trim(),
      gasWebhookUrl: document.getElementById('set-gas-url').value.trim()
    };
    window.FMCUData.saveSettings(settings);
    this.renderPreviewView();
    this.showToast('Pengaturan Integrasi Email, Folder Google Drive & PDF berhasil disimpan!', 'success');
  },

  populateGasScriptPreview() {
    const codeBox = document.getElementById('gas-code-preview');
    if (!codeBox) return;
    codeBox.textContent = `function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var report = payload.report || {};
  var decoded = Utilities.base64Decode(payload.pdfBase64);
  var pdfBlob = Utilities.newBlob(decoded, 'application/pdf', payload.fileName);

  // 1. Simpan PDF ke Folder Google Drive Rekap
  var folder = payload.gdriveFolderId
    ? DriveApp.getFolderById(payload.gdriveFolderId)
    : DriveApp.createFolder('FMCU_Visit_Reports_Archive');
  var file = folder.createFile(pdfBlob);

  // 2. Kirim Email Otomatis beserta Lampiran PDF ke Store, AM, RM & FMCU
  if (payload.recipientEmails) {
    MailApp.sendEmail({
      to: payload.recipientEmails,
      cc: payload.ccEmails || '',
      subject: '[FMCU VISIT REPORT] ' + report.storeName + ' (' + report.storeCode + ')',
      htmlBody: 'Terlampir hasil FMCU Visit Store Report untuk toko <b>' + report.storeName + '</b>.<br/>Arsip GDrive: ' + file.getUrl(),
      attachments: [pdfBlob]
    });
  }
  return ContentService.createTextOutput(JSON.stringify({ status: 'SUCCESS', url: file.getUrl() }));
}`;
  },

  copyGasScript() {
    const text = document.getElementById('gas-code-preview')?.textContent || '';
    navigator.clipboard?.writeText(text);
    this.showToast('Kode Google Apps Script berhasil disalin ke Clipboard!', 'success');
  },

  clearAllDataConfirm() {
    window.FMCUData.clearAllData();
    this.hasActiveStoreForm = false;
    this.resetVisitForm(true);
    this.updateActiveCheckInUI();
    this.renderAllViews();
    this.showToast('Seluruh data toko, jadwal, dan laporan telah dikosongkan!', 'info');
  },

  // ==========================================================================
  // USER PROFILE & ATTENDANCE LOGS MODAL
  // ==========================================================================
  openProfileModal() {
    const u = this.currentUser;
    if (!u) return;
    const reports = window.FMCUData.getReports().filter((r) => r.auditorId === u.id || r.auditorName === u.name);
    const body = document.getElementById('profile-modal-body');
    const gpsText = this.liveGps.lat !== null ? `${this.liveGps.lat}, ${this.liveGps.lng}` : 'Belum terdeteksi';

    body.innerHTML = `
      <div class="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
        <div class="w-14 h-14 rounded-2xl text-white font-extrabold text-xl flex items-center justify-center shrink-0" style="background:${u.avatarColor || '#0099A6'}">
          ${u.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div class="text-xs font-extrabold text-[#009944] uppercase">${u.roleBadge || u.role}</div>
          <h4 class="text-lg font-extrabold text-slate-900">${u.name}</h4>
          <div class="text-xs text-slate-500">@${u.username} • ${u.region || '-'}</div>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 text-center text-xs">
        <div class="p-3 rounded-xl border border-slate-200">
          <div class="text-slate-400 font-bold uppercase text-[10px]">Visit Selesai</div>
          <div class="text-xl font-extrabold text-slate-900 mt-0.5">${reports.length}</div>
        </div>
        <div class="p-3 rounded-xl border border-slate-200">
          <div class="text-slate-400 font-bold uppercase text-[10px]">Live GPS Saat Ini</div>
          <div class="text-xs font-mono font-bold text-emerald-700 mt-1">${gpsText}</div>
        </div>
        <div class="p-3 rounded-xl border border-slate-200">
          <div class="text-slate-400 font-bold uppercase text-[10px]">Status Otoritas</div>
          <div class="text-xs font-extrabold text-[#0099A6] mt-1">${this.hasAdminAuthority(u) ? 'Admin + Auditor' : 'User Biasa (Auditor)'}</div>
        </div>
      </div>

      <div class="space-y-2">
        <div class="text-xs font-extrabold text-slate-700 uppercase">Log Aktivitas Actual In & Actual Out Terakhir:</div>
        <div class="space-y-2 max-h-48 overflow-y-auto">
          ${
            reports
              .map(
                (r) => `
              <div class="p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                <div>
                  <div class="font-bold text-slate-900">FamilyMart ${r.storeName} (${r.storeCode})</div>
                  <div class="text-[11px] text-slate-500">${r.visitDayDateFormatted || r.visitDate} • GPS: ${r.gpsLat || '-'}, ${r.gpsLng || '-'}</div>
                </div>
                <div class="text-right font-mono font-bold text-emerald-700">
                  <div>In: ${r.actualIn}</div>
                  <div>Out: ${r.actualOut}</div>
                </div>
              </div>
            `
              )
              .join('') || '<div class="text-xs text-slate-400">Belum ada riwayat visit pada akun ini.</div>'
          }
        </div>
      </div>
    `;

    document.getElementById('modal-user-profile').classList.remove('hidden');
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.FMCUApp.init();
});
