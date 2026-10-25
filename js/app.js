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
  currentScheduleSubSection: 'create',
  scheduleCreateMode: 'weekly',
  weeklyMondayDate: '',
  weeklySelectedAuditors: [],
  weeklyDraftMatrix: {},
  weeklyActiveSlot: { auditorId: null, dayIndex: 0 },
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
  currentFormSection: 1,
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

    // Cek sesi login aktif di tab ini (sessionStorage). Jika tutup tab / buka baru / expired -> wajib login!
    const sessionUser = window.FMCUData.getSession();
    this.currentUser = sessionUser || null;
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) {
      authScreen.classList.toggle('hidden', Boolean(this.currentUser));
    }
    if (!this.currentUser) {
      this.triggerMobileAuthSplash();
    }

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

    // Aktifkan pemantau Time Session & Tab Close
    this.initSessionMonitor();

    // Auto-request Mandatory GPS Permission on load
    this.initMandatoryGpsSystem();
  },

  // ==========================================================================
  // TIME SESSION & TAB/APP CLOSE MONITOR
  // Otomatis meminta login kembali jika tutup tab / tutup web app / sesi habis
  // ==========================================================================
  initSessionMonitor() {
    // 1. Tandai waktu saat tab atau web app ditutup / di-unload
    const markUnload = () => {
      try {
        sessionStorage.setItem(window.FMCUData.TAB_UNLOAD_KEY, String(Date.now()));
      } catch (e) {}
    };
    window.addEventListener('pagehide', markUnload);
    window.addEventListener('beforeunload', markUnload);

    // 2. Perpanjang sesi aktif saat user berinteraksi (throttled tiap 10 detik)
    let lastTouch = 0;
    const onUserActivity = () => {
      if (!this.currentUser) return;
      const now = Date.now();
      if (now - lastTouch > 10000) {
        lastTouch = now;
        const ok = window.FMCUData.touchSession();
        if (!ok) {
          this.logout('Sesi waktu login Anda telah berakhir. Silakan login kembali.');
        }
      }
    };
    ['click', 'keydown', 'touchstart', 'scroll'].forEach((evt) => {
      window.addEventListener(evt, onUserActivity, { passive: true });
    });

    // 3. Cek kedaluwarsa sesi secara berkala & saat kembali ke tab/aplikasi
    const checkSessionValidity = () => {
      if (!this.currentUser) return;
      const validUser = window.FMCUData.getSession();
      if (!validUser) {
        this.logout('Sesi waktu login Anda telah berakhir. Silakan login kembali.');
      }
    };
    setInterval(checkSessionValidity, 5000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkSessionValidity();
      }
    });
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
      if (!this.currentUser) {
        this.triggerMobileAuthSplash();
      }
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

    // Pastikan halaman yang sedang dibuka sesuai dengan hak akses otoritas user ini
    const allowedView = this.isViewAllowedForUser(this.currentView, user)
      ? this.currentView
      : this.getFirstAllowedView(user);
    this.navigate(allowedView);
  },

  logout(reasonMsg = '') {
    window.FMCUData.setSession(null);
    this.currentUser = null;
    this.closeModal('modal-user-profile');
    this.updateSidebarAuthoritiesUI();

    const passInput = document.getElementById('login-password');
    if (passInput) passInput.value = '';

    const errEl = document.getElementById('login-error');
    if (errEl) {
      if (typeof reasonMsg === 'string' && reasonMsg.trim()) {
        errEl.textContent = reasonMsg;
        errEl.classList.remove('hidden');
        this.showToast(reasonMsg, 'warning');
      } else {
        errEl.classList.add('hidden');
      }
    }

    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.classList.remove('hidden');
    this.triggerMobileAuthSplash();
  },

  // ==========================================================================
  // MOBILE INTRO SPLASH LOADING ANIMATION BEFORE LOGIN FORM
  // ==========================================================================
  triggerMobileAuthSplash() {
    if (this._splashTimer) {
      clearTimeout(this._splashTimer);
      this._splashTimer = null;
    }
    const splashPanel = document.getElementById('auth-splash-panel');
    const loginPanel = document.getElementById('auth-login-panel');
    const progressEl = document.getElementById('auth-splash-progress');

    if (splashPanel) {
      splashPanel.classList.remove('hidden');
      splashPanel.classList.add('flex');
    }
    if (loginPanel) {
      loginPanel.classList.add('hidden');
      loginPanel.classList.remove('flex');
    }
    if (progressEl) {
      progressEl.classList.remove('splash-progress-bar');
      void progressEl.offsetWidth;
      progressEl.classList.add('splash-progress-bar');
    }

    this._splashTimer = setTimeout(() => {
      this.skipMobileAuthSplash();
    }, 2600);
  },

  skipMobileAuthSplash() {
    if (this._splashTimer) {
      clearTimeout(this._splashTimer);
      this._splashTimer = null;
    }
    const splashPanel = document.getElementById('auth-splash-panel');
    const loginPanel = document.getElementById('auth-login-panel');

    if (splashPanel) {
      splashPanel.classList.add('hidden', 'lg:flex');
      splashPanel.classList.remove('flex');
    }
    if (loginPanel) {
      loginPanel.classList.remove('hidden');
      loginPanel.classList.add('flex');
    }
  },

  hasAuthority(authKey, user = this.currentUser) {
    if (!user) return false;
    const auths = Array.isArray(user.authorities) ? user.authorities : [];
    if (user._v2AuthSchema) {
      return auths.includes(authKey);
    }
    // Kompatibilitas mundur untuk akun yang dibuat sebelum schema checkbox lengkap ditambahkan
    if (authKey === 'view_home') {
      return auths.includes('view_home') || auths.includes('create_visit') || auths.length === 0;
    }
    if (authKey === 'export_pdf') {
      return auths.includes('export_pdf') || auths.includes('create_visit') || user.role === 'SUPER_ADMIN';
    }
    if (authKey === 'manage_integrations') {
      return auths.includes('manage_integrations') || user.role === 'SUPER_ADMIN';
    }
    if (authKey === 'manage_schedule') {
      return auths.includes('manage_schedule') || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_SCHEDULE';
    }
    if (authKey === 'manage_stores' || authKey === 'manage_users') {
      return auths.includes(authKey) || user.role === 'SUPER_ADMIN';
    }
    return auths.includes(authKey);
  },

  hasAdminAuthority(user = this.currentUser) {
    if (!user) return false;
    return (
      this.hasAuthority('manage_schedule', user) ||
      this.hasAuthority('manage_stores', user) ||
      this.hasAuthority('manage_users', user) ||
      this.hasAuthority('manage_integrations', user)
    );
  },

  hasPortalAdminAuthority(user = this.currentUser) {
    if (!user) return false;
    return this.hasAuthority('manage_users', user) || this.hasAuthority('manage_integrations', user);
  },

  isViewAllowedForUser(viewName, user = this.currentUser) {
    if (!user) return false;
    if (viewName === 'home') return this.hasAuthority('view_home', user);
    if (viewName === 'analytics') return this.hasAuthority('view_analytics', user);
    if (viewName === 'form') return this.hasAuthority('create_visit', user) && this.hasActiveStoreForm;
    if (viewName === 'preview') return this.hasAuthority('export_pdf', user);
    if (viewName === 'schedules') return this.hasAuthority('manage_schedule', user);
    if (viewName === 'stores') return this.hasAuthority('manage_stores', user);
    if (viewName === 'admin') return this.hasPortalAdminAuthority(user);
    return false;
  },

  getFirstAllowedView(user = this.currentUser) {
    if (!user) return 'home';
    if (this.hasAuthority('view_home', user)) return 'home';
    if (this.hasAuthority('view_analytics', user)) return 'analytics';
    if (this.hasAuthority('export_pdf', user)) return 'preview';
    if (this.hasAuthority('manage_schedule', user)) return 'schedules';
    if (this.hasAuthority('manage_stores', user)) return 'stores';
    if (this.hasPortalAdminAuthority(user)) return 'admin';
    return 'home';
  },

  getFirstAllowedAdminTab(user = this.currentUser) {
    if (this.hasAuthority('manage_users', user)) return 'users';
    if (this.hasAuthority('manage_integrations', user)) return 'integrations';
    if (this.hasAuthority('manage_schedule', user)) return 'schedules';
    if (this.hasAuthority('manage_stores', user)) return 'stores';
    return 'users';
  },

  updateSidebarAuthoritiesUI() {
    const u = this.currentUser;
    const canHome = this.hasAuthority('view_home', u);
    const canAnalytics = this.hasAuthority('view_analytics', u);
    const canCreateVisit = this.hasAuthority('create_visit', u);
    const canForm = canCreateVisit && this.hasActiveStoreForm;
    const canPreview = this.hasAuthority('export_pdf', u);
    const canSchedules = this.hasAuthority('manage_schedule', u);
    const canStores = this.hasAuthority('manage_stores', u);
    const canPortalAdmin = this.hasPortalAdminAuthority(u);

    const togglePair = (desktopId, mobileId, allowed) => {
      const dEl = document.getElementById(desktopId);
      const mEl = document.getElementById(mobileId);
      if (dEl) dEl.classList.toggle('hidden', !allowed);
      if (mEl) mEl.classList.toggle('hidden', !allowed);
    };

    // 1. Sidebar & Mobile Bottom Nav Buttons (Muncul sesuai otoritas masing-masing)
    togglePair('nav-home', 'mnav-home', canHome);
    togglePair('nav-analytics', 'mnav-analytics', canAnalytics);
    togglePair('nav-form', 'mnav-form', canForm);
    togglePair('nav-preview', 'mnav-preview', canPreview);
    togglePair('nav-schedules', 'mnav-schedules', canSchedules);
    togglePair('nav-stores', 'mnav-stores', canStores);
    togglePair('nav-admin', 'mnav-admin', canPortalAdmin);

    // 2. Portal Admin Sub-Tab Buttons (User & Integrasi)
    const adminTabMap = [
      { tab: 'users', auth: 'manage_users' },
      { tab: 'integrations', auth: 'manage_integrations' }
    ];
    adminTabMap.forEach(({ tab, auth }) => {
      const btn = document.getElementById(`admin-tab-btn-${tab}`);
      if (btn) {
        btn.classList.toggle('hidden', !this.hasAuthority(auth, u));
      }
    });
  },

  populateHeaderRoleSwitcher() {
    const users = window.FMCUData.getUsers();

    // 1. Populate Login Form Registered Users Dropdown (#login-username) - Hanya Nama Lengkap
    const loginSel = document.getElementById('login-username');
    if (loginSel && loginSel.tagName === 'SELECT') {
      const currentVal = loginSel.value;
      loginSel.innerHTML =
        `<option value="">-- Pilih Nama User --</option>` +
        users
          .map(
            (u) =>
              `<option value="${u.username}">${u.name}</option>`
          )
          .join('');
      if (currentVal && users.some((u) => u.username === currentVal)) {
        loginSel.value = currentVal;
      } else if (users.length > 0 && !loginSel.value) {
        loginSel.value = users[0].username;
      }
    }

    // 2. Populate Header Role Switcher (if present)
    const sel = document.getElementById('header-role-switcher');
    if (!sel) return;
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
    this.updateSidebarAuthoritiesUI();
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

    this.updateActiveCheckInUI();
  },

  // ==========================================================================
  // NAVIGATION & VIEW ROUTER (HOME, ANALYTICS, FORM, PREVIEW, SCHEDULES, STORES, ADMIN)
  // ==========================================================================
  navigate(viewName, subTab = null) {
    this.updateSidebarAuthoritiesUI();

    if (viewName === 'schedules' && !this.hasAuthority('manage_schedule')) {
      this.showToast('Akun Anda tidak memiliki otoritas untuk mengakses Atur Jadwal Visit.', 'warning');
      return;
    }
    if (viewName === 'stores' && !this.hasAuthority('manage_stores')) {
      this.showToast('Akun Anda tidak memiliki otoritas untuk mengakses Master Toko.', 'warning');
      return;
    }
    if (viewName === 'admin' && !this.hasPortalAdminAuthority()) {
      this.showToast('Akun Anda tidak memiliki otoritas untuk mengakses Portal Admin.', 'warning');
      return;
    }
    if (viewName === 'analytics' && !this.hasAuthority('view_analytics')) {
      this.showToast('Akun Anda tidak memiliki otoritas untuk mengakses Analitik Dashboard.', 'warning');
      return;
    }
    if (viewName === 'preview' && !this.hasAuthority('export_pdf')) {
      this.showToast('Akun Anda tidak memiliki otoritas untuk mengakses Preview & Unduh PDF.', 'warning');
      return;
    }
    if (viewName === 'home' && !this.hasAuthority('view_home')) {
      viewName = this.getFirstAllowedView();
    }

    // Guard: Form Visit Store only opens if user has create_visit authority AND has entered a store's form
    if (viewName === 'form') {
      if (!this.hasAuthority('create_visit')) {
        this.showToast('Akun Anda tidak memiliki otoritas untuk mengisi Form Visit Store.', 'warning');
        return;
      }
      if (!this.hasActiveStoreForm) {
        this.showToast('Pilih dan lakukan Check-In pada toko di jadwal Anda terlebih dahulu untuk membuka Form Visit.', 'warning');
        viewName = this.getFirstAllowedView();
      }
    }

    this.currentView = viewName;
    const isAdminContainerView = viewName === 'admin' || viewName === 'schedules' || viewName === 'stores';
    const mainSections = ['home', 'analytics', 'form', 'preview', 'admin'];
    mainSections.forEach((sec) => {
      const mainEl = document.getElementById(`view-${sec}`);
      if (!mainEl) return;
      if (sec === 'admin') {
        mainEl.classList.toggle('hidden', !isAdminContainerView);
      } else {
        mainEl.classList.toggle('hidden', sec !== viewName);
      }
    });

    const navKeys = ['home', 'analytics', 'form', 'preview', 'schedules', 'stores', 'admin'];
    navKeys.forEach((k) => {
      const dNav = document.getElementById(`nav-${k}`);
      if (dNav) dNav.classList.toggle('active', k === viewName);

      const mNav = document.getElementById(`mnav-${k}`);
      if (mNav) mNav.classList.toggle('active', k === viewName);
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
      schedules: [
        'Atur Jadwal Visit Toko — Penugasan Auditor',
        'Buat dan kelola jadwal kunjungan toko untuk masing-masing Auditor / Regional Bestie'
      ],
      stores: [
        'Master Data Toko FamilyMart — Ekstraksi & Upload Excel',
        'Kelola database 610+ Master Toko FamilyMart dan upload file Excel (.xlsx / .xls / .csv)'
      ],
      admin: [
        'Portal Otoritas Admin FMCU',
        'Manajemen User & Otoritas Login serta Konfigurasi Integrasi Email & Google Drive'
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
      this.switchFormSection(this.currentFormSection || 1, false);
    } else if (viewName === 'preview') {
      this.renderPreviewView();
    } else if (viewName === 'schedules') {
      this.checkAdminGateUI();
      const ctrlHeader = document.getElementById('admin-control-center-header');
      if (ctrlHeader) ctrlHeader.classList.add('hidden');
      const syncBanner = document.getElementById('admin-firestore-sync-banner');
      if (syncBanner) syncBanner.classList.add('hidden');
      this.showAdminSectionPanel('schedules');
      this.switchScheduleSubSection(this.currentScheduleSubSection || 'create', false);
      this.renderAdminView();
    } else if (viewName === 'stores') {
      this.checkAdminGateUI();
      const ctrlHeader = document.getElementById('admin-control-center-header');
      if (ctrlHeader) ctrlHeader.classList.add('hidden');
      const syncBanner = document.getElementById('admin-firestore-sync-banner');
      if (syncBanner) syncBanner.classList.add('hidden');
      this.showAdminSectionPanel('stores');
      this.renderAdminView();
    } else if (viewName === 'admin') {
      this.checkAdminGateUI();
      const ctrlHeader = document.getElementById('admin-control-center-header');
      if (ctrlHeader) ctrlHeader.classList.remove('hidden');
      const syncBanner = document.getElementById('admin-firestore-sync-banner');
      if (syncBanner) syncBanner.classList.remove('hidden');
      const defaultPortalTab = this.hasAuthority('manage_users') ? 'users' : 'integrations';
      const targetTab = subTab && (subTab === 'users' || subTab === 'integrations') ? subTab : defaultPortalTab;
      this.switchAdminTab(targetTab);
      this.renderAdminView();
    }

    this.updateNavbarModeUI();
  },

  updateNavbarModeUI() {
    const isFormActive = this.currentView === 'form' && this.hasActiveStoreForm;
    const sideMain = document.getElementById('sidebar-main-nav');
    const sideForm = document.getElementById('sidebar-form-nav');
    const mobMain = document.getElementById('mobile-main-nav');
    const mobForm = document.getElementById('mobile-form-nav');
    const checkInWidget = document.getElementById('sidebar-checkin-widget');

    if (sideMain) sideMain.classList.toggle('hidden', isFormActive);
    if (sideForm) sideForm.classList.toggle('hidden', !isFormActive);
    if (mobMain) mobMain.classList.toggle('hidden', isFormActive);
    if (mobForm) mobForm.classList.toggle('hidden', !isFormActive);

    // Sembunyikan tombol "Buka Form Toko Ini" di widget atas jika sudah berada di dalam form
    if (checkInWidget && this.hasActiveStoreForm) {
      const openBtn = checkInWidget.querySelector('button');
      if (openBtn) openBtn.classList.toggle('hidden', isFormActive);
    }
  },

  switchFormSection(secNum, scrollTop = true) {
    const targetSec = Number(secNum) || 1;
    this.currentFormSection = targetSec;

    [1, 2, 3, 4].forEach((n) => {
      const secEl = document.getElementById(`form-sec-${n}`);
      if (secEl) secEl.classList.toggle('hidden', n !== targetSec);

      const dBtn = document.getElementById(`fnav-sec-${n}`);
      if (dBtn) dBtn.classList.toggle('active', n === targetSec);

      const mBtn = document.getElementById(`mfnav-sec-${n}`);
      if (mBtn) mBtn.classList.toggle('active', n === targetSec);
    });

    if (scrollTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },

  showAdminSectionPanel(sectionName) {
    const allPanels = ['schedules', 'stores', 'users', 'integrations'];
    allPanels.forEach((p) => {
      const panel = document.getElementById(`admin-tab-${p}`);
      if (panel) panel.classList.toggle('hidden', p !== sectionName);
    });
  },

  switchScheduleSubSection(subSec, scrollTop = true) {
    const mode = subSec === 'list' ? 'list' : subSec === 'single' ? 'single' : 'create';
    this.currentScheduleSubSection = mode;

    const createSec = document.getElementById('schedule-section-create');
    const listSec = document.getElementById('schedule-section-list');
    const btnCreate = document.getElementById('sch-subtab-btn-create');
    const btnSingle = document.getElementById('sch-subtab-btn-single');
    const btnList = document.getElementById('sch-subtab-btn-list');
    const countPill = document.getElementById('admin-schedule-count-pill');

    if (createSec) createSec.classList.toggle('hidden', mode === 'list');
    if (listSec) listSec.classList.toggle('hidden', mode !== 'list');

    if (mode === 'create') {
      this.switchScheduleCreateMode('weekly');
    } else if (mode === 'single') {
      this.switchScheduleCreateMode('single');
    }

    if (btnCreate) {
      btnCreate.className =
        mode === 'create'
          ? 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer bg-[#009944] text-white shadow-xs'
          : 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer text-slate-700 hover:bg-white';
    }

    if (btnSingle) {
      btnSingle.className =
        mode === 'single'
          ? 'flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer bg-[#009944] text-white shadow-xs'
          : 'flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer text-slate-700 hover:bg-white';
    }

    if (btnList) {
      btnList.className =
        mode === 'list'
          ? 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer bg-[#0099A6] text-white shadow-xs'
          : 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer text-slate-700 hover:bg-white';
    }

    if (countPill) {
      countPill.className =
        mode === 'list'
          ? 'px-1.5 py-0.2 rounded-full text-[10px] bg-white/25 text-white font-extrabold'
          : 'px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-extrabold';
    }

    if (scrollTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },

  updateFormGuardVisibility() {
    const guardEl = document.getElementById('form-no-store-guard');
    const wrapperEl = document.getElementById('form-active-store-wrapper');
    const navForm = document.getElementById('nav-form');
    const mnavForm = document.getElementById('mnav-form');
    const canShowFormNav = this.hasActiveStoreForm && this.hasAuthority('create_visit');

    if (guardEl) guardEl.classList.toggle('hidden', this.hasActiveStoreForm);
    if (wrapperEl) wrapperEl.classList.toggle('hidden', !this.hasActiveStoreForm);
    if (navForm) navForm.classList.toggle('hidden', !canShowFormNav);
    if (mnavForm) mnavForm.classList.toggle('hidden', !canShowFormNav);
    this.updateNavbarModeUI();
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

  isAuditorUser(user = this.currentUser) {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_SCHEDULE') return false;
    if (user.role === 'AUDITOR') return true;
    const badge = String(user.roleBadge || '').toLowerCase();
    return badge.includes('auditor') || badge.includes('bestie');
  },

  getSchedulableAuditors() {
    const users = window.FMCUData.getUsers();
    return users.filter((u) => this.isAuditorUser(u));
  },

  isScheduleOwnedByUser(schedule, user = this.currentUser) {
    if (!schedule || !user) return false;
    if (schedule.auditorId && user.id && String(schedule.auditorId) === String(user.id)) return true;
    const sName = String(schedule.auditorName || '').trim().toLowerCase();
    const uName = String(user.name || '').trim().toLowerCase();
    return Boolean(sName && uName && sName === uName);
  },

  getLocalDateISO(dt = new Date()) {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
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

    const todayStr = this.getLocalDateISO();
    const schedules = window.FMCUData.getSchedules();
    const myPendingToday = schedules.find(
      (s) => s.status !== 'COMPLETED' && s.scheduledDate === todayStr && this.isScheduleOwnedByUser(s, this.currentUser)
    );

    const myNextPending = schedules.find(
      (s) => s.status !== 'COMPLETED' && this.isScheduleOwnedByUser(s, this.currentUser)
    );

    const targetSchedule = myPendingToday || myNextPending;
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
    this.showToast('Belum ada jadwal toko yang ditugaskan untuk akun Anda hari ini.', 'warning');
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
    const todayStr = this.getLocalDateISO();
    let schedules = window.FMCUData.getSchedules();

    // User Auditor / Regional Bestie HANYA melihat jadwalnya masing-masing (tidak bisa melihat jadwal auditor lain)
    if (this.currentUser && (this.isAuditorUser(this.currentUser) || !this.hasAuthority('manage_schedule'))) {
      schedules = schedules.filter((s) => this.isScheduleOwnedByUser(s, this.currentUser));
    }

    if (scope === 'TODAY') {
      schedules = schedules.filter((s) => s.scheduledDate === todayStr);
    } else if (scope === 'MINE' && this.currentUser) {
      schedules = schedules.filter((s) => this.isScheduleOwnedByUser(s, this.currentUser));
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
    this.switchFormSection(1, false);
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
    this.switchFormSection(1, false);
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

  // --- Section 1C: QSC / FamiTrack Photos (Disimpan di Google Drive via Apps Script) ---
  renderQscPhotosGrid() {
    const grid = document.getElementById('form-qsc-photos-grid');
    if (!grid) return;
    grid.innerHTML = this.formQscPhotos
      .map((p, idx) => {
        const displaySrc = window.FMCUPdf.getPhotoDisplaySrc(p);
        const statusBadge = p._uploading
          ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Upload ke Google Drive...</span>`
          : p.driveFileId
          ? `<a href="${p.driveViewUrl || p.driveUrl || '#'}" target="_blank" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 hover:underline"><i class="fa-brands fa-google-drive mr-1"></i>Tersimpan di Google Drive</a>`
          : displaySrc
          ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-[#0099A6]"><i class="fa-solid fa-cloud-arrow-up mr-1"></i>Siap Sync ke Google Drive</span>`
          : '';

        return `
        <div class="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <input type="text" value="${p.caption || `Foto QSC / Famitrack ${idx + 1}`}" oninput="FMCUApp.formQscPhotos[${idx}].caption = this.value" class="fm-input py-1.5 text-xs font-bold bg-white" />
            <button type="button" onclick="FMCUApp.removeQscPhotoSlot(${idx})" class="text-slate-400 hover:text-rose-600 p-1.5 cursor-pointer">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>

          <div class="w-full h-48 rounded-xl bg-white border border-dashed border-slate-300 overflow-hidden flex items-center justify-center relative group">
            ${
              displaySrc
                ? `<img src="${displaySrc}" class="w-full h-full object-cover" alt="QSC Form" />`
                : `<div class="text-center text-slate-400 text-xs"><i class="fa-solid fa-file-image text-2xl mb-1 block"></i>Unggah foto form QSC / FamiTrack</div>`
            }
            ${statusBadge ? `<div class="absolute top-2 left-2 shadow-sm">${statusBadge}</div>` : ''}
            <label class="absolute bottom-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer shadow">
              <i class="fa-solid fa-camera mr-1"></i>Pilih / Kamera
              <input type="file" accept="image/*" onchange="FMCUApp.handleQscPhotoUpload(event, ${idx})" class="hidden" />
            </label>
          </div>
        </div>
      `;
      })
      .join('');
  },

  addQscPhotoSlot() {
    this.formQscPhotos.push({
      id: 'qsc-' + Date.now(),
      caption: `Foto QSC / Famitrack ${this.formQscPhotos.length + 1}`,
      dataUrl: '',
      driveFileId: '',
      driveUrl: ''
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
    const photoObj = this.formQscPhotos[idx];
    photoObj.id = photoObj.id || 'qsc-' + Date.now();
    photoObj.dataUrl = dataUrl;
    photoObj.driveFileId = '';
    photoObj.driveUrl = '';
    photoObj._uploading = true;
    window.FMCUData.cachePhotoInMemory(photoObj.id, null, dataUrl);
    this.renderQscPhotosGrid();

    const storeCode = document.getElementById('form-store-code')?.value.trim() || 'STORE';
    const storeName = document.getElementById('form-store-name')?.value.trim() || 'VISIT';
    await window.FMCUData.uploadPhotoToGDrive(photoObj, {
      storeCode,
      storeName,
      photoType: 'QSC'
    });
    photoObj._uploading = false;
    this.renderQscPhotosGrid();
    this.showToast(
      photoObj.driveFileId
        ? `Foto QSC #${idx + 1} berhasil disimpan ke Google Drive!`
        : `Foto QSC #${idx + 1} berhasil diproses`,
      'success'
    );
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
      .map((ev, idx) => {
        const displaySrc = window.FMCUPdf.getPhotoDisplaySrc(ev);
        const driveBadge = ev._uploading
          ? `<div class="mt-1 text-[10px] font-bold text-amber-700 flex items-center gap-1"><i class="fa-solid fa-spinner fa-spin"></i><span>Mengunggah ke Google Drive...</span></div>`
          : ev.driveFileId
          ? `<a href="${ev.driveViewUrl || ev.driveUrl || '#'}" target="_blank" class="mt-1 text-[10px] font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"><i class="fa-brands fa-google-drive"></i><span>Tersimpan di Google Drive</span></a>`
          : displaySrc
          ? `<div class="mt-1 text-[10px] font-semibold text-[#0099A6] flex items-center gap-1"><i class="fa-solid fa-cloud-arrow-up"></i><span>Siap Sync ke Google Drive</span></div>`
          : '';

        return `
        <div class="border border-slate-300 rounded-2xl p-3 bg-white grid grid-cols-12 gap-3 relative shadow-sm">
          <button type="button" onclick="FMCUApp.removeEvidencePhotoCard(${idx})" class="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs cursor-pointer" title="Hapus Foto">
            <i class="fa-solid fa-xmark"></i>
          </button>

          <div class="col-span-5 h-36 bg-slate-100 rounded-xl overflow-hidden relative flex items-center justify-center border border-slate-200">
            ${
              displaySrc
                ? `<img src="${displaySrc}" class="w-full h-full object-cover" alt="Evidence" />`
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
              <textarea rows="3" oninput="FMCUApp.formEvidencePhotos[${idx}].description = this.value" placeholder="Tuliskan deskripsi temuan foto ini..." class="w-full border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-teal-500">${ev.description || ''}</textarea>
              ${driveBadge}
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  },

  addEvidencePhotoCard() {
    this.formEvidencePhotos.push({
      id: 'ev-' + Date.now(),
      description: '',
      dataUrl: '',
      driveFileId: '',
      driveUrl: ''
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
    const storeCode = document.getElementById('form-store-code')?.value.trim() || 'STORE';
    const storeName = document.getElementById('form-store-name')?.value.trim() || 'STORE';
    const applyWm = document.getElementById('form-watermark-toggle')?.checked ?? true;
    const dataUrl = await window.FMCUPdf.processAndStampImage(file, {
      storeName,
      gpsLat: this.liveGps.lat,
      gpsLng: this.liveGps.lng,
      applyWatermark: applyWm
    });
    const evObj = this.formEvidencePhotos[idx];
    evObj.id = evObj.id || 'ev-' + Date.now();
    evObj.dataUrl = dataUrl;
    evObj.driveFileId = '';
    evObj.driveUrl = '';
    evObj._uploading = true;
    window.FMCUData.cachePhotoInMemory(evObj.id, null, dataUrl);
    this.renderEvidenceGrid();

    await window.FMCUData.uploadPhotoToGDrive(evObj, {
      storeCode,
      storeName,
      photoType: 'EVIDENCE'
    });
    evObj._uploading = false;
    this.renderEvidenceGrid();
    this.showToast(
      evObj.driveFileId
        ? `Foto bukti #${idx + 1} berhasil disimpan ke Google Drive!`
        : `Foto bukti #${idx + 1} berhasil diproses`,
      'success'
    );
  },

  async handleBulkEvidenceUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    const storeCode = document.getElementById('form-store-code')?.value.trim() || 'STORE';
    const storeName = document.getElementById('form-store-name')?.value.trim() || 'STORE';
    const applyWm = document.getElementById('form-watermark-toggle')?.checked ?? true;

    const newCards = [];
    for (const file of files) {
      const dataUrl = await window.FMCUPdf.processAndStampImage(file, {
        storeName,
        gpsLat: this.liveGps.lat,
        gpsLng: this.liveGps.lng,
        applyWatermark: applyWm
      });
      const evObj = {
        id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        description: '',
        dataUrl,
        driveFileId: '',
        driveUrl: '',
        _uploading: true
      };
      window.FMCUData.cachePhotoInMemory(evObj.id, null, dataUrl);
      this.formEvidencePhotos.push(evObj);
      newCards.push(evObj);
    }
    this.renderEvidenceGrid();

    await Promise.all(
      newCards.map((evObj) =>
        window.FMCUData.uploadPhotoToGDrive(evObj, {
          storeCode,
          storeName,
          photoType: 'EVIDENCE'
        }).finally(() => {
          evObj._uploading = false;
        })
      )
    );
    this.renderEvidenceGrid();
    const uploadedCount = newCards.filter((c) => Boolean(c.driveFileId)).length;
    this.showToast(
      uploadedCount > 0
        ? `${files.length} foto bukti berhasil diunggah & disimpan ke Google Drive!`
        : `${files.length} foto bukti berhasil diunggah!`,
      'success'
    );
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

  async collectAndSaveFormReport() {
    if (!document.getElementById('form-actual-out').value.trim()) {
      document.getElementById('form-actual-out').value = this.getCurrentTimeWIB();
    }
    const reportObj = this.buildCurrentFormReportObject();

    // Pastikan seluruh foto QSC & Evidence telah ter-upload ke Google Drive (jika URL Apps Script aktif)
    // sebelum menyimpan data laporan ke Cloud Firestore
    await window.FMCUData.ensureReportPhotosUploadedToGDrive(reportObj);

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

  validateVisitForm() {
    const requiredSec1Fields = [
      { id: 'form-store-name', label: 'Nama Store' },
      { id: 'form-store-code', label: 'Kode Toko' },
      { id: 'form-auditor-name', label: 'Nama Auditor' },
      { id: 'form-visit-date', label: 'Tanggal Visit' },
      { id: 'form-store-head', label: 'Store Head' },
      { id: 'form-area-manager', label: 'Area Manager' },
      { id: 'form-regional-manager', label: 'Regional Manager' }
    ];

    for (const f of requiredSec1Fields) {
      const el = document.getElementById(f.id);
      if (el && !el.value.trim()) {
        this.switchFormSection(1);
        setTimeout(() => el.focus(), 100);
        this.showToast(`Harap lengkapi kolom "${f.label}" pada Section 1 terlebih dahulu.`, 'warning');
        return false;
      }
    }
    return true;
  },

  async handleSaveAndPreview(event) {
    if (event) event.preventDefault();
    if (!this.validateVisitForm()) return;
    this.showToast('Menyimpan laporan ke Firestore & menyinkronkan foto ke Google Drive...', 'info');
    const saved = await this.collectAndSaveFormReport();
    this.activePreviewReportId = saved.id;
    this.renderAllViews();
    this.navigate('preview');
    this.showToast(`Laporan Visit Toko ${saved.storeName} berhasil disimpan!`, 'success');
  },

  async handleSaveAndSendIntegration() {
    if (!this.validateVisitForm()) return;
    this.showToast('Menyimpan laporan ke Firestore & menyinkronkan foto ke Google Drive...', 'info');
    const saved = await this.collectAndSaveFormReport();
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

  async downloadCurrentPreviewPdf() {
    const report = this.getActivePreviewReport();
    if (!report) return;
    this.showToast(`Membuat & mengunduh file PDF ${window.FMCUPdf.getFileName(report)}...`, 'info');
    await window.FMCUPdf.downloadReportPdf(report);
    this.showToast(`PDF ${window.FMCUPdf.getFileName(report)} berhasil diunduh!`, 'success');
  },

  async downloadReportById(reportId) {
    const reports = window.FMCUData.getReports();
    const rep = reports.find((r) => r.id === reportId);
    if (!rep) return;
    this.showToast(`Membuat & mengunduh file PDF ${window.FMCUPdf.getFileName(rep)}...`, 'info');
    await window.FMCUPdf.downloadReportPdf(rep);
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
    const matchedStore = window.FMCUData.getStores().find((s) => s.code === rep.storeCode);

    document.getElementById('modal-send-report-name').textContent = `Laporan: FamilyMart ${rep.storeName || '-'} (${rep.storeCode || '-'}) — ${rep.visitDateFormatted || rep.visitDate}`;
    document.getElementById('modal-send-report-meta').textContent = `Auditor: ${rep.auditorName || '-'} • ${(rep.observations || []).length} Temuan Observasi • ${(rep.evidencePhotos || []).length} Foto Bukti`;
    document.getElementById('modal-send-to').value = rep.storeEmail || matchedStore?.email || '';

    // Gabungkan otomatis Email Area Manager, Email Regional Manager dari Master Toko & Default CC Emails
    const ccSet = new Set();
    if (matchedStore?.areaManagerEmail) ccSet.add(matchedStore.areaManagerEmail.trim());
    if (matchedStore?.regionalManagerEmail) ccSet.add(matchedStore.regionalManagerEmail.trim());
    if (settings.defaultCcEmails) {
      settings.defaultCcEmails
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
        .forEach((e) => ccSet.add(e));
    }
    document.getElementById('modal-send-cc').value = Array.from(ccSet).join(', ');
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
    statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Sedang menyiapkan foto dari Google Drive, membuat PDF 16:9 & memproses pengiriman...`;

    const fileName = window.FMCUPdf.getFileName(rep);
    await window.FMCUPdf.downloadReportPdf(rep);

    if (settings.gasWebhookUrl && settings.gasWebhookUrl.startsWith('http')) {
      try {
        const pdfBase64 = await window.FMCUPdf.getPdfBase64(rep);
        await fetch(settings.gasWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'sendReport',
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
    const tabAuthMap = {
      schedules: 'manage_schedule',
      stores: 'manage_stores',
      users: 'manage_users',
      integrations: 'manage_integrations'
    };
    const requiredAuth = tabAuthMap[tabName];
    if (requiredAuth && !this.hasAuthority(requiredAuth)) {
      tabName = this.getFirstAllowedAdminTab();
    }

    this.currentAdminTab = tabName;
    const tabs = ['schedules', 'stores', 'users', 'integrations'];
    tabs.forEach((t) => {
      const panel = document.getElementById(`admin-tab-${t}`);
      if (panel) panel.classList.toggle('hidden', t !== tabName);

      const btn = document.getElementById(`admin-tab-btn-${t}`);
      if (btn) {
        const isAllowed = this.hasAuthority(tabAuthMap[t]);
        if (t === tabName) {
          btn.className = `px-3.5 py-2 rounded-xl text-xs font-bold bg-[#009944] text-white transition cursor-pointer ${isAllowed ? '' : 'hidden'}`;
        } else {
          btn.className = `px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer ${isAllowed ? '' : 'hidden'}`;
        }
      }
    });
  },

  filterAdminScheduleStoreDropdown(query = '') {
    const schStoreSel = document.getElementById('adm-sch-store');
    if (!schStoreSel) return;
    const stores = window.FMCUData.getStores();
    const q = String(query || '').trim().toLowerCase();
    const filtered = q
      ? stores.filter(
          (s) =>
            String(s.code || '').toLowerCase().includes(q) ||
            String(s.name || '').toLowerCase().includes(q) ||
            String(s.city || '').toLowerCase().includes(q) ||
            String(s.type || '').toLowerCase().includes(q)
        )
      : stores;

    schStoreSel.innerHTML =
      filtered.length > 0
        ? filtered
            .map(
              (s) =>
                `<option value="${s.code}">${s.code} - ${s.name} (${s.type || 'CVS'}${s.city ? ' • ' + s.city : ''})</option>`
            )
            .join('')
        : `<option value="">-- Tidak ada toko yang cocok dengan pencarian --</option>`;
  },

  renderAdminStoresTable() {
    const stores = window.FMCUData.getStores();
    const countEl = document.getElementById('admin-store-count');
    const stTbody = document.getElementById('admin-stores-tbody');
    if (!stTbody) return;

    const searchQ = (document.getElementById('adm-store-search-input')?.value || '').trim().toLowerCase();
    const typeFilter = document.getElementById('adm-store-type-filter')?.value || 'ALL';
    const limitVal = parseInt(document.getElementById('adm-store-limit-select')?.value || '9999', 10);

    // Populate unique Store Types in filter dropdown
    const typeSelect = document.getElementById('adm-store-type-filter');
    if (typeSelect) {
      const uniqueTypes = Array.from(new Set(stores.map((s) => s.type).filter(Boolean))).sort();
      const prevVal = typeSelect.value || 'ALL';
      typeSelect.innerHTML =
        `<option value="ALL">Semua Type (${stores.length})</option>` +
        uniqueTypes.map((t) => `<option value="${t}" ${t === prevVal ? 'selected' : ''}>${t}</option>`).join('');
    }

    const filtered = stores.filter((st) => {
      if (typeFilter !== 'ALL' && st.type !== typeFilter) return false;
      if (!searchQ) return true;
      return (
        String(st.code || '').toLowerCase().includes(searchQ) ||
        String(st.name || '').toLowerCase().includes(searchQ) ||
        String(st.city || '').toLowerCase().includes(searchQ) ||
        String(st.address || '').toLowerCase().includes(searchQ) ||
        String(st.email || '').toLowerCase().includes(searchQ) ||
        String(st.storePhone || '').toLowerCase().includes(searchQ) ||
        String(st.storeHead || '').toLowerCase().includes(searchQ) ||
        String(st.areaManager || '').toLowerCase().includes(searchQ) ||
        String(st.areaManagerEmail || '').toLowerCase().includes(searchQ) ||
        String(st.regionalManager || '').toLowerCase().includes(searchQ) ||
        String(st.regionalManagerEmail || '').toLowerCase().includes(searchQ)
      );
    });

    if (countEl) {
      countEl.textContent =
        filtered.length === stores.length
          ? `${stores.length} Master Toko`
          : `${filtered.length} / ${stores.length} Toko`;
    }

    if (filtered.length === 0) {
      stTbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400">Tidak ada data master toko yang sesuai filter pencarian.</td></tr>`;
      return;
    }

    const displayed = filtered.slice(0, limitVal);
    stTbody.innerHTML = displayed
      .map(
        (st) => `
        <tr class="hover:bg-slate-50 align-top">
          <td class="py-2.5 px-3">
            <div class="font-mono font-extrabold text-[#0099A6] text-xs">${st.code || '-'}</div>
            <div class="font-extrabold text-slate-900 text-xs mt-0.5">${st.name || '-'}</div>
          </td>
          <td class="py-2.5 px-3">
            <span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[10px]">${st.type || '-'}</span>
            <div class="text-[11px] font-semibold text-slate-600 mt-1">${st.city || '-'}</div>
          </td>
          <td class="py-2.5 px-3 text-[11px] text-slate-600 max-w-[240px] leading-snug">
            ${st.address || '-'}
          </td>
          <td class="py-2.5 px-3 text-[11px]">
            <div class="font-mono text-slate-700 break-all">${st.email || '-'}</div>
            <div class="font-mono text-emerald-700 font-bold mt-0.5"><i class="fa-solid fa-phone text-[9px] mr-1"></i>${st.storePhone || '-'}</div>
          </td>
          <td class="py-2.5 px-3 font-bold text-slate-800 text-xs">
            ${st.storeHead || '-'}
          </td>
          <td class="py-2.5 px-3 text-[11px]">
            <div class="font-bold text-slate-900">${st.areaManager || '-'}</div>
            <div class="font-mono text-[10px] text-slate-500 break-all">${st.areaManagerEmail || '-'}</div>
          </td>
          <td class="py-2.5 px-3 text-[11px]">
            <div class="font-bold text-slate-900">${st.regionalManager || '-'}</div>
            <div class="font-mono text-[10px] text-slate-500 break-all">${st.regionalManagerEmail || '-'}</div>
          </td>
          <td class="py-2.5 px-3 text-right whitespace-nowrap space-x-2">
            <button onclick="FMCUApp.editStore('${st.code}')" class="text-[#0099A6] hover:underline font-bold cursor-pointer">Edit</button>
            <button onclick="FMCUApp.deleteStore('${st.code}')" class="text-rose-600 hover:underline font-bold cursor-pointer">Hapus</button>
          </td>
        </tr>
      `
      )
      .join('');
  },

  async handleUploadStoreExcel() {
    const fileInput = document.getElementById('adm-excel-file-input');
    const modeSelect = document.getElementById('adm-excel-import-mode');
    const statusBox = document.getElementById('adm-excel-upload-status');
    const btn = document.getElementById('btn-upload-excel-stores');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      this.showToast('Silakan pilih file Excel (.xlsx / .xls / .csv) terlebih dahulu.', 'warning');
      return;
    }

    const file = fileInput.files[0];
    const mode = modeSelect ? modeSelect.value : 'replace';

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Mengekstrak Excel...</span>`;
    }
    if (statusBox) {
      statusBox.className = 'text-xs font-semibold p-3 rounded-xl bg-teal-50 text-teal-900 border border-teal-200 block';
      statusBox.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Sedang membaca & mengekstraksi kolom dari file <strong>${file.name}</strong>...`;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const extracted = window.FMCUData.parseStoresFromExcelArrayBuffer(arrayBuffer);

      if (!extracted || extracted.length === 0) {
        throw new Error('Tidak ditemukan baris data toko yang valid di dalam file Excel tersebut.');
      }

      let finalStores = [];
      if (mode === 'replace') {
        finalStores = extracted;
      } else {
        const existingMap = new Map();
        window.FMCUData.getStores().forEach((s) => existingMap.set(String(s.code), s));
        extracted.forEach((s) => existingMap.set(String(s.code), s));
        finalStores = Array.from(existingMap.values()).sort((a, b) => String(a.code).localeCompare(String(b.code)));
      }

      window.FMCUData.saveStores(finalStores);
      this.populateMasterStoreSelect();
      this.renderAllViews();
      this.updateAdminFirestoreSummary();

      if (statusBox) {
        statusBox.className = 'text-xs font-semibold p-3 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 block';
        statusBox.innerHTML = `✅ Berhasil mengekstrak <strong>${extracted.length} Toko</strong> dari file <strong>${file.name}</strong> (Total Master Toko: <strong>${finalStores.length} Toko</strong>) dan menyinkronkannya ke Cloud Firestore!`;
      }
      this.showToast(`Berhasil import ${extracted.length} Master Toko dari ${file.name}!`, 'success');
      fileInput.value = '';
    } catch (err) {
      console.error('Excel upload parse error:', err);
      if (statusBox) {
        statusBox.className = 'text-xs font-semibold p-3 rounded-xl bg-rose-50 text-rose-900 border border-rose-200 block';
        statusBox.innerHTML = `❌ Gagal membaca file Excel: ${err.message || 'Format kolom tidak sesuai'}`;
      }
      this.showToast('Gagal mengekstrak file Excel: ' + (err.message || ''), 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-file-import"></i><span>Upload & Ekstraksi Excel</span>`;
      }
    }
  },

  async reloadDefaultExcelStores() {
    const statusBox = document.getElementById('adm-excel-upload-status');
    if (statusBox) {
      statusBox.className = 'text-xs font-semibold p-3 rounded-xl bg-teal-50 text-teal-900 border border-teal-200 block';
      statusBox.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Mengekstrak ulang data dari file <code>10. List PIC Oktober 2026_rev01.xlsx</code>...`;
    }

    const extracted = await window.FMCUData.fetchAndExtractProjectExcelFile();
    if (extracted && extracted.length > 0) {
      window.FMCUData.saveStores(extracted);
      this.populateMasterStoreSelect();
      this.renderAllViews();
      this.updateAdminFirestoreSummary();
      if (statusBox) {
        statusBox.className = 'text-xs font-semibold p-3 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 block';
        statusBox.innerHTML = `✅ Berhasil mengekstrak ulang <strong>${extracted.length} Master Toko</strong> dari <code>10. List PIC Oktober 2026_rev01.xlsx</code> dan menyinkronkannya ke Cloud Firestore!`;
      }
      this.showToast(`${extracted.length} Master Toko dari 10. List PIC Oktober 2026_rev01.xlsx berhasil dimuat!`, 'success');
    } else {
      this.showToast('Gagal memuat file Excel default.', 'error');
    }
  },

  renderAdminView() {
    const users = window.FMCUData.getUsers();
    const auditorsOnly = this.getSchedulableAuditors();
    const schedules = window.FMCUData.getSchedules();
    const settings = window.FMCUData.getSettings();

    // Populate Schedule Form Dropdowns with Search Filter (Hanya Auditor / Regional Bestie)
    const searchVal = document.getElementById('adm-sch-store-search')?.value || '';
    this.filterAdminScheduleStoreDropdown(searchVal);

    const schAuditorSel = document.getElementById('adm-sch-auditor');
    if (schAuditorSel) {
      schAuditorSel.innerHTML =
        auditorsOnly.length > 0
          ? auditorsOnly.map((u) => `<option value="${u.id}">${u.name} (${u.roleBadge || u.role})</option>`).join('')
          : `<option value="">-- Belum ada user Auditor / Regional Bestie --</option>`;
    }
    const schDateInput = document.getElementById('adm-sch-date');
    if (schDateInput && !schDateInput.value) {
      schDateInput.value = this.getMondayOfWeek();
    }
    const schWinInput = document.getElementById('adm-sch-window');
    if (schWinInput && !schWinInput.value) {
      schWinInput.value = '08:30 - 17:30';
    }

    // 0. Render Interactive 5-Day Multi-Auditor Planner
    this.renderWeeklySchedulePlanner();

    // 1. Render Admin Schedules Table & Auditor Recap Strip
    const schPillEl = document.getElementById('admin-schedule-count-pill');
    if (schPillEl) schPillEl.textContent = String(schedules.length);

    this.renderAdminAuditorRecapStrip();

    const listAuditorSel = document.getElementById('adm-sch-list-auditor');
    if (listAuditorSel) {
      const prevAud = listAuditorSel.value || 'ALL';
      listAuditorSel.innerHTML =
        `<option value="ALL">Semua Auditor (${auditorsOnly.length})</option>` +
        auditorsOnly.map((u) => `<option value="${u.id}" ${u.id === prevAud ? 'selected' : ''}>${u.name}</option>`).join('');
    }

    const listSearchQ = (document.getElementById('adm-sch-list-search')?.value || '').trim().toLowerCase();
    const listAuditorFilter = document.getElementById('adm-sch-list-auditor')?.value || 'ALL';
    const listStatusFilter = document.getElementById('adm-sch-list-status')?.value || 'ALL';

    const filteredSchedules = schedules.filter((s) => {
      if (listAuditorFilter !== 'ALL' && s.auditorId !== listAuditorFilter) return false;
      if (listStatusFilter !== 'ALL' && s.status !== listStatusFilter) return false;
      if (!listSearchQ) return true;
      return (
        String(s.storeName || '').toLowerCase().includes(listSearchQ) ||
        String(s.storeCode || '').toLowerCase().includes(listSearchQ) ||
        String(s.auditorName || '').toLowerCase().includes(listSearchQ) ||
        String(s.scheduledDate || '').toLowerCase().includes(listSearchQ) ||
        String(s.auditFocus || '').toLowerCase().includes(listSearchQ)
      );
    });

    const schCountEl = document.getElementById('admin-schedule-count');
    if (schCountEl) {
      schCountEl.textContent =
        filteredSchedules.length === schedules.length
          ? `${schedules.length} Jadwal`
          : `${filteredSchedules.length} / ${schedules.length} Jadwal`;
    }

    const schTbody = document.getElementById('admin-schedules-tbody');
    if (schTbody) {
      if (filteredSchedules.length === 0) {
        schTbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">Tidak ada jadwal visit toko yang sesuai filter.</td></tr>`;
      } else {
        schTbody.innerHTML = filteredSchedules
          .map(
            (s) => `
            <tr class="hover:bg-slate-50">
              <td class="py-2.5 px-3">
                <div class="font-bold text-slate-900">${window.FMCUPdf.formatIndonesianDate(s.scheduledDate, true)}</div>
                <div class="text-[10px] font-mono text-slate-400">${s.shiftWindow || '08:30 - 17:30'}</div>
              </td>
              <td class="py-2.5 px-3">
                <div class="font-bold text-slate-900">${s.storeName}</div>
                <div class="text-[10px] font-mono text-slate-400">Site: ${s.storeCode} (${s.storeType || 'CVS'})</div>
              </td>
              <td class="py-2.5 px-3 font-bold text-slate-800">${s.auditorName}</td>
              <td class="py-2.5 px-3">
                <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${
                  s.priority === 'HIGH' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                }">${s.priority || 'NORMAL'}</span>
                <div class="text-[10px] text-slate-500 mt-0.5 max-w-[180px] truncate" title="${s.auditFocus || '-'}">${s.auditFocus || '-'}</div>
              </td>
              <td class="py-2.5 px-3 text-[11px] font-mono">
                ${s.actualIn ? `<span class="text-emerald-700 font-bold">${s.actualIn} - ${s.actualOut || '-'}</span>` : '<span class="text-slate-400">Belum Check-In</span>'}
              </td>
              <td class="py-2.5 px-3">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  s.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }">${s.status}</span>
              </td>
              <td class="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                <button onclick="FMCUApp.checkInAndOpenForm('${s.storeCode}', '${s.id}')" class="text-[#0099A6] hover:underline font-bold cursor-pointer">Visit</button>
                <button onclick="FMCUApp.deleteSchedule('${s.id}')" class="text-rose-600 hover:underline font-bold ml-2 cursor-pointer">Hapus</button>
              </td>
            </tr>
          `
          )
          .join('');
      }
    }

    // 2. Render Admin Master Stores Table (610+ Stores with Search & Filter)
    this.renderAdminStoresTable();

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
    const photoFolderInput = document.getElementById('set-gdrive-photo-folder');
    if (photoFolderInput) photoFolderInput.value = settings.gdrivePhotoFolderId || '';
    document.getElementById('set-gdrive-folder').value = settings.gdriveFolderId || '';
    document.getElementById('set-cc-emails').value = settings.defaultCcEmails || '';
    document.getElementById('set-gas-url').value = settings.gasWebhookUrl || '';
  },

  // ==========================================================================
  // INTERACTIVE 5-DAY WEEKLY SCHEDULE PLANNER (SENIN - JUMAT) & EXCEL EXPORT
  // ==========================================================================
  switchScheduleCreateMode(mode) {
    const targetMode = mode === 'single' ? 'single' : 'weekly';
    this.scheduleCreateMode = targetMode;

    const weeklyBox = document.getElementById('sch-create-mode-weekly');
    const singleBox = document.getElementById('sch-create-mode-single');
    const btnWeekly = document.getElementById('btn-sch-mode-weekly');
    const btnSingle = document.getElementById('btn-sch-mode-single');

    if (weeklyBox) weeklyBox.classList.toggle('hidden', targetMode !== 'weekly');
    if (singleBox) singleBox.classList.toggle('hidden', targetMode !== 'single');

    if (btnWeekly) {
      btnWeekly.className =
        targetMode === 'weekly'
          ? 'px-3 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer bg-[#009944] text-white shadow-xs'
          : 'px-3 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer text-slate-600 hover:bg-white';
    }
    if (btnSingle) {
      btnSingle.className =
        targetMode === 'single'
          ? 'px-3 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer bg-[#0099A6] text-white shadow-xs'
          : 'px-3 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer text-slate-600 hover:bg-white';
    }
  },

  getMondayOfWeek(dateInput) {
    const d = dateInput ? new Date(dateInput + 'T00:00:00') : new Date();
    if (isNaN(d.getTime())) return this.getLocalDateISO();
    const day = d.getDay(); // 0=Minggu, 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu
    // Cari hari Senin terdekat sesuai tanggal & hari aktual:
    // - Senin(1)..Kamis(4) -> Senin minggu berjalan (1 - day)
    // - Jumat(5), Sabtu(6) -> Senin terdekat berikutnya (8 - day, yaitu +3 atau +2 hari)
    // - Minggu(0) -> Senin besok (+1 hari)
    let offsetToNearestMonday = 0;
    if (day === 0) {
      offsetToNearestMonday = 1;
    } else if (day >= 1 && day <= 4) {
      offsetToNearestMonday = 1 - day;
    } else {
      offsetToNearestMonday = 8 - day;
    }
    const monday = new Date(d);
    monday.setDate(d.getDate() + offsetToNearestMonday);
    return this.getLocalDateISO(monday);
  },

  getFiveWorkDays(mondayStr) {
    const baseMon = this.getMondayOfWeek(mondayStr);
    const dayNames = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT'];
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const result = [];

    for (let i = 0; i < 5; i++) {
      const dt = new Date(baseMon + 'T00:00:00');
      dt.setDate(dt.getDate() + i);
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      result.push({
        dayIndex: i,
        dayName: dayNames[i],
        dateStr,
        shortDate: `${dt.getDate()} ${shortMonths[dt.getMonth()]}`,
        fullFormatted: `${dayNames[i]}, ${dt.getDate()} ${shortMonths[dt.getMonth()]} ${yyyy}`
      });
    }
    return result;
  },

  ensureWeeklyPlannerInitialized() {
    if (!this.weeklyMondayDate) {
      this.weeklyMondayDate = this.getMondayOfWeek();
    }
    // Daftar nama yang diatur jadwal HANYA Auditor / Regional Bestie (selain itu tidak termasuk)
    const auditors = this.getSchedulableAuditors();
    const validIds = new Set(auditors.map((u) => u.id));

    if (!Array.isArray(this.weeklySelectedAuditors) || this.weeklySelectedAuditors.length === 0) {
      this.weeklySelectedAuditors = auditors.map((u) => u.id);
    } else {
      this.weeklySelectedAuditors = this.weeklySelectedAuditors.filter((id) => validIds.has(id));
      if (this.weeklySelectedAuditors.length === 0 && auditors.length > 0 && !this._userClearedAuditors) {
        this.weeklySelectedAuditors = auditors.map((u) => u.id);
      }
    }

    if (!this.weeklyActiveSlot.auditorId || !this.weeklySelectedAuditors.includes(this.weeklyActiveSlot.auditorId)) {
      this.weeklyActiveSlot = {
        auditorId: this.weeklySelectedAuditors[0] || (auditors[0] ? auditors[0].id : null),
        dayIndex: 0
      };
    }
  },

  setWeeklyMondayToCurrentWeek(offsetDays = 0) {
    const dt = new Date();
    dt.setDate(dt.getDate() + Number(offsetDays || 0));
    this.weeklyMondayDate = this.getMondayOfWeek(this.getLocalDateISO(dt));
    this.renderWeeklySchedulePlanner();
  },

  shiftWeeklyMonday(deltaDays) {
    this.ensureWeeklyPlannerInitialized();
    const dt = new Date(this.weeklyMondayDate + 'T00:00:00');
    dt.setDate(dt.getDate() + Number(deltaDays || 0));
    this.weeklyMondayDate = this.getMondayOfWeek(this.getLocalDateISO(dt));
    this.renderWeeklySchedulePlanner();
  },

  onChangeWeeklyMonday(val) {
    if (!val) return;
    const snappedMonday = this.getMondayOfWeek(val);
    if (snappedMonday !== val) {
      this.showToast('Tanggal otomatis disesuaikan ke hari Senin terdekat pada minggu tersebut (Senin–Jumat).', 'info');
    }
    this.weeklyMondayDate = snappedMonday;
    this.renderWeeklySchedulePlanner();
  },

  toggleWeeklyAuditor(userId) {
    this.ensureWeeklyPlannerInitialized();
    const idx = this.weeklySelectedAuditors.indexOf(userId);
    if (idx !== -1) {
      this.weeklySelectedAuditors.splice(idx, 1);
      this._userClearedAuditors = this.weeklySelectedAuditors.length === 0;
    } else {
      this.weeklySelectedAuditors.push(userId);
      this._userClearedAuditors = false;
      this.weeklyActiveSlot = { auditorId: userId, dayIndex: 0 };
    }
    if (this.weeklySelectedAuditors.length > 0 && !this.weeklySelectedAuditors.includes(this.weeklyActiveSlot.auditorId)) {
      this.weeklyActiveSlot = { auditorId: this.weeklySelectedAuditors[0], dayIndex: 0 };
    }
    this.renderWeeklySchedulePlanner();
  },

  selectAllWeeklyAuditors(selectAll = true) {
    const auditors = this.getSchedulableAuditors();
    if (selectAll) {
      this._userClearedAuditors = false;
      this.weeklySelectedAuditors = auditors.map((u) => u.id);
      if (auditors.length > 0) this.weeklyActiveSlot = { auditorId: auditors[0].id, dayIndex: 0 };
    } else {
      this._userClearedAuditors = true;
      this.weeklySelectedAuditors = [];
    }
    this.renderWeeklySchedulePlanner();
  },

  selectOnlyRoleAuditors() {
    this.selectAllWeeklyAuditors(true);
  },

  setActiveWeeklySlot(auditorId, dayIndex) {
    this.weeklyActiveSlot = {
      auditorId,
      dayIndex: Math.max(0, Math.min(4, Number(dayIndex) || 0))
    };
    this.renderWeeklySchedulePlanner();
  },

  getWeeklySlotKey(auditorId, dayIndex) {
    return `${auditorId}__${dayIndex}`;
  },

  getWeeklySlotItems(auditorId, dayIndex) {
    const key = this.getWeeklySlotKey(auditorId, dayIndex);
    if (!Array.isArray(this.weeklyDraftMatrix[key])) {
      this.weeklyDraftMatrix[key] = [];
    }
    return this.weeklyDraftMatrix[key];
  },

  assignStoreToWeeklySlot(storeCode, targetAuditorId = null, targetDayIndex = null, fromQuickPicker = false) {
    this.ensureWeeklyPlannerInitialized();
    const audId = targetAuditorId || this.weeklyActiveSlot.auditorId;
    const dayIdx = targetDayIndex !== null ? Number(targetDayIndex) : Number(this.weeklyActiveSlot.dayIndex || 0);

    if (!audId) {
      this.showToast('Pilih minimal 1 Regional Bestie / Auditor terlebih dahulu di Langkah 2.', 'warning');
      return;
    }

    if (!this.weeklySelectedAuditors.includes(audId)) {
      this.weeklySelectedAuditors.push(audId);
    }

    const stores = window.FMCUData.getStores();
    const st = stores.find((s) => String(s.code) === String(storeCode));
    if (!st) return;

    const defaultPriority = document.getElementById('weekly-default-priority')?.value || 'NORMAL';
    const slotItems = this.getWeeklySlotItems(audId, dayIdx);

    if (slotItems.some((item) => String(item.storeCode) === String(st.code))) {
      this.showToast(`Toko ${st.name} (${st.code}) sudah ada di hari tersebut.`, 'info');
    } else {
      slotItems.push({
        storeCode: st.code,
        priority: defaultPriority
      });
    }

    const days = this.getFiveWorkDays(this.weeklyMondayDate);
    const dayName = days[dayIdx]?.dayName || 'HARI';

    // Jika berasal dari Quick Picker dan Auto-Advance aktif, geser ke hari berikutnya (Sen -> Sel -> Rab -> Kam -> Jum)
    const autoAdvance = document.getElementById('weekly-auto-advance-day')?.checked;
    if (fromQuickPicker && autoAdvance) {
      if (dayIdx < 4) {
        this.weeklyActiveSlot = { auditorId: audId, dayIndex: dayIdx + 1 };
      } else {
        // Pindah ke Auditor berikutnya pada hari Senin (0)
        const curAudPos = this.weeklySelectedAuditors.indexOf(audId);
        const nextAudId =
          curAudPos !== -1 && curAudPos + 1 < this.weeklySelectedAuditors.length
            ? this.weeklySelectedAuditors[curAudPos + 1]
            : audId;
        this.weeklyActiveSlot = { auditorId: nextAudId, dayIndex: 0 };
      }
    } else {
      this.weeklyActiveSlot = { auditorId: audId, dayIndex: dayIdx };
    }

    this.renderWeeklySchedulePlanner();
    const users = window.FMCUData.getUsers();
    const au = users.find((u) => u.id === audId);
    this.showToast(`+ ${st.code} ${st.name} ditambahkan ke ${au ? au.name : 'Auditor'} (${dayName})`, 'success');
  },

  onInlineAddStoreToDay(auditorId, dayIndex, selectEl) {
    if (!selectEl || !selectEl.value) return;
    const code = selectEl.value;
    selectEl.value = '';
    this.assignStoreToWeeklySlot(code, auditorId, dayIndex, false);
  },

  removeStoreFromWeeklySlot(auditorId, dayIndex, storeCode) {
    const key = this.getWeeklySlotKey(auditorId, dayIndex);
    const items = this.getWeeklySlotItems(auditorId, dayIndex);
    this.weeklyDraftMatrix[key] = items.filter((it) => String(it.storeCode) !== String(storeCode));
    this.renderWeeklySchedulePlanner();
  },

  toggleWeeklyStorePriority(auditorId, dayIndex, storeCode) {
    const items = this.getWeeklySlotItems(auditorId, dayIndex);
    const found = items.find((it) => String(it.storeCode) === String(storeCode));
    if (found) {
      found.priority = found.priority === 'HIGH' ? 'NORMAL' : 'HIGH';
      this.renderWeeklySchedulePlanner();
    }
  },

  clearAuditorWeeklyDraft(auditorId) {
    for (let d = 0; d < 5; d++) {
      this.weeklyDraftMatrix[this.getWeeklySlotKey(auditorId, d)] = [];
    }
    this.renderWeeklySchedulePlanner();
    this.showToast('Draft jadwal 5 hari untuk auditor tersebut dikosongkan.', 'info');
  },

  clearAllWeeklyDrafts() {
    this.weeklyDraftMatrix = {};
    this.renderWeeklySchedulePlanner();
    this.showToast('Seluruh draft jadwal pada planner 5 hari telah di-reset.', 'info');
  },

  copyAuditorWeekToOthers(sourceAuditorId) {
    this.ensureWeeklyPlannerInitialized();
    const targets = this.weeklySelectedAuditors.filter((id) => id !== sourceAuditorId);
    if (targets.length === 0) {
      this.showToast('Pilih minimal 2 Auditor di Langkah 2 untuk menyalin jadwal mingguan.', 'warning');
      return;
    }
    targets.forEach((tId) => {
      for (let d = 0; d < 5; d++) {
        const srcItems = this.getWeeklySlotItems(sourceAuditorId, d);
        this.weeklyDraftMatrix[this.getWeeklySlotKey(tId, d)] = srcItems.map((it) => ({ ...it }));
      }
    });
    this.renderWeeklySchedulePlanner();
    this.showToast(`Jadwal 5 hari (Senin–Jumat) berhasil disalin ke ${targets.length} auditor lainnya!`, 'success');
  },

  getFilteredStoresForWeeklyPicker() {
    const stores = window.FMCUData.getStores();
    const searchQ = (document.getElementById('weekly-store-search')?.value || '').trim().toLowerCase();
    const cityFilter = document.getElementById('weekly-store-city-filter')?.value || 'ALL';

    return stores.filter((st) => {
      if (cityFilter !== 'ALL' && (st.city || '') !== cityFilter) return false;
      if (!searchQ) return true;
      return (
        String(st.code || '').toLowerCase().includes(searchQ) ||
        String(st.name || '').toLowerCase().includes(searchQ) ||
        String(st.city || '').toLowerCase().includes(searchQ) ||
        String(st.areaManager || '').toLowerCase().includes(searchQ) ||
        String(st.regionalManager || '').toLowerCase().includes(searchQ)
      );
    });
  },

  autoFillFiveDaysForAuditor(auditorId, startCursor = { idx: 0 }, silent = false) {
    const filteredStores = this.getFilteredStoresForWeeklyPicker();
    if (filteredStores.length === 0) {
      if (!silent) this.showToast('Tidak ada toko yang cocok dengan filter saat ini.', 'warning');
      return 0;
    }

    const defaultPriority = document.getElementById('weekly-default-priority')?.value || 'NORMAL';
    const usedCodes = new Set();
    for (let d = 0; d < 5; d++) {
      this.getWeeklySlotItems(auditorId, d).forEach((it) => usedCodes.add(String(it.storeCode)));
    }

    let added = 0;
    for (let d = 0; d < 5; d++) {
      const slotItems = this.getWeeklySlotItems(auditorId, d);
      if (slotItems.length === 0) {
        let picked = null;
        for (let tries = 0; tries < filteredStores.length; tries++) {
          const candidate = filteredStores[(startCursor.idx + tries) % filteredStores.length];
          if (!usedCodes.has(String(candidate.code))) {
            picked = candidate;
            startCursor.idx = (startCursor.idx + tries + 1) % filteredStores.length;
            break;
          }
        }
        if (!picked) {
          picked = filteredStores[startCursor.idx % filteredStores.length];
          startCursor.idx = (startCursor.idx + 1) % filteredStores.length;
        }
        if (picked) {
          slotItems.push({ storeCode: picked.code, priority: defaultPriority });
          usedCodes.add(String(picked.code));
          added++;
        }
      }
    }

    if (!silent) {
      this.renderWeeklySchedulePlanner();
      this.showToast(`Berhasil mengisi otomatis ${added} hari kerja (Senin–Jumat)!`, 'success');
    }
    return added;
  },

  autoFillFiveDaysForActiveAuditor() {
    this.ensureWeeklyPlannerInitialized();
    const activeAud = this.weeklyActiveSlot.auditorId || this.weeklySelectedAuditors[0];
    if (!activeAud) {
      this.showToast('Pilih minimal 1 Auditor terlebih dahulu.', 'warning');
      return;
    }
    this.autoFillFiveDaysForAuditor(activeAud, { idx: 0 }, false);
  },

  autoFillFiveDaysForAllSelectedAuditors() {
    this.ensureWeeklyPlannerInitialized();
    if (this.weeklySelectedAuditors.length === 0) {
      this.showToast('Pilih minimal 1 Regional Bestie / Auditor di Langkah 2.', 'warning');
      return;
    }
    const cursor = { idx: 0 };
    let totalAdded = 0;
    this.weeklySelectedAuditors.forEach((audId) => {
      totalAdded += this.autoFillFiveDaysForAuditor(audId, cursor, true);
    });
    this.renderWeeklySchedulePlanner();
    this.showToast(
      `Berhasil menyebarkan ${totalAdded} jadwal toko untuk ${this.weeklySelectedAuditors.length} Auditor (Senin–Jumat)!`,
      'success'
    );
  },

  renderWeeklyQuickStoreResults() {
    const container = document.getElementById('weekly-store-quick-results');
    if (!container) return;

    const stores = window.FMCUData.getStores();
    const citySel = document.getElementById('weekly-store-city-filter');
    if (citySel && citySel.options.length <= 1 && stores.length > 0) {
      const cities = Array.from(new Set(stores.map((s) => s.city).filter(Boolean))).sort();
      const curVal = citySel.value || 'ALL';
      citySel.innerHTML =
        `<option value="ALL">Semua Kota / Wilayah (${stores.length} Toko)</option>` +
        cities.map((c) => `<option value="${c}" ${c === curVal ? 'selected' : ''}>${c}</option>`).join('');
    }

    const filtered = this.getFilteredStoresForWeeklyPicker();
    const previewList = filtered.slice(0, 28);

    if (previewList.length === 0) {
      container.innerHTML = `<div class="text-xs text-slate-400 py-1">Tidak ditemukan toko yang sesuai kata kunci pencarian.</div>`;
      return;
    }

    container.innerHTML = previewList
      .map(
        (st) => `
        <button
          type="button"
          onclick="FMCUApp.assignStoreToWeeklySlot('${st.code}', null, null, true)"
          class="shrink-0 px-3 py-2 rounded-xl bg-white/10 hover:bg-emerald-500 hover:text-slate-950 border border-white/15 transition text-left group cursor-pointer"
        >
          <div class="flex items-center gap-1.5">
            <span class="font-mono font-extrabold text-[11px] text-emerald-300 group-hover:text-slate-950">${st.code}</span>
            <span class="font-extrabold text-xs text-white group-hover:text-slate-950">${st.name}</span>
          </div>
          <div class="text-[10px] text-slate-300 group-hover:text-slate-900 mt-0.5">
            ${st.type || 'CVS'} • ${st.city || '-'} ${st.areaManager ? '• AM: ' + st.areaManager : ''}
          </div>
        </button>
      `
      )
      .join('');
  },

  renderWeeklySchedulePlanner() {
    this.ensureWeeklyPlannerInitialized();
    const users = this.getSchedulableAuditors();
    const stores = window.FMCUData.getStores();
    const schedules = window.FMCUData.getSchedules();
    const storeMap = new Map(stores.map((s) => [String(s.code), s]));

    // 1. Update Monday Input, Nearest Monday Info & Range Badge
    const monInput = document.getElementById('weekly-monday-input');
    if (monInput && monInput.value !== this.weeklyMondayDate) {
      monInput.value = this.weeklyMondayDate;
    }
    const fiveDays = this.getFiveWorkDays(this.weeklyMondayDate);
    const rangeBadge = document.getElementById('weekly-date-range-badge');
    if (rangeBadge && fiveDays.length === 5) {
      rangeBadge.textContent = `${fiveDays[0].shortDate} – ${fiveDays[4].shortDate} (Senin–Jumat)`;
    }
    const nearestInfoEl = document.getElementById('weekly-nearest-monday-info');
    if (nearestInfoEl && fiveDays.length === 5) {
      const todayActualStr = window.FMCUPdf.formatIndonesianDate(this.getLocalDateISO(), true);
      const mondayTargetStr = window.FMCUPdf.formatIndonesianDate(fiveDays[0].dateStr, true);
      nearestInfoEl.innerHTML = `<i class="fa-regular fa-calendar-check mr-1"></i>Aktual Hari Ini: <strong>${todayActualStr}</strong> &rarr; Senin Terdekat: <strong>${mondayTargetStr}</strong>`;
    }

    // 2. Render Step 2 Auditor Multi-Select Cards (Khusus Auditor / Regional Bestie)
    const audGrid = document.getElementById('weekly-auditor-selector-grid');
    if (audGrid) {
      if (users.length === 0) {
        audGrid.innerHTML = `<div class="col-span-full text-xs text-slate-400 py-3">Belum ada akun dengan role Auditor / Regional Bestie.</div>`;
      } else {
        const weekDatesSet = new Set(fiveDays.map((d) => d.dateStr));
        audGrid.innerHTML = users
          .map((u) => {
          const isSelected = this.weeklySelectedAuditors.includes(u.id);
          let draftCount = 0;
          for (let d = 0; d < 5; d++) {
            draftCount += this.getWeeklySlotItems(u.id, d).length;
          }
          const savedThisWeek = schedules.filter((s) => s.auditorId === u.id && weekDatesSet.has(s.scheduledDate)).length;
          const initials = u.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          return `
            <div
              onclick="FMCUApp.toggleWeeklyAuditor('${u.id}')"
              class="p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                isSelected
                  ? 'bg-emerald-50/90 border-[#009944] ring-1 ring-[#009944]/40 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300 opacity-75'
              }"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-8 h-8 rounded-lg text-white font-extrabold text-xs flex items-center justify-center shrink-0" style="background:${u.avatarColor || '#0099A6'}">
                  ${initials}
                </div>
                <div class="min-w-0">
                  <div class="font-extrabold text-xs text-slate-900 truncate">${u.name}</div>
                  <div class="text-[10px] text-slate-500 truncate">${u.roleBadge || u.role} ${u.region ? '• ' + u.region : ''}</div>
                </div>
              </div>
              <div class="flex flex-col items-end shrink-0 gap-1">
                <span class="w-5 h-5 rounded-md flex items-center justify-center text-[11px] ${
                  isSelected ? 'bg-[#009944] text-white' : 'bg-slate-100 text-slate-400 border border-slate-200'
                }">
                  <i class="fa-solid fa-check"></i>
                </span>
                <span class="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-700">
                  Draft: ${draftCount}${savedThisWeek > 0 ? ` • Aktif: ${savedThisWeek}` : ''}
                </span>
              </div>
            </div>
          `;
        })
        .join('');
      }
    }

    // 3. Update Active Slot Indicator & Quick Store Results
    const activeIndicator = document.getElementById('weekly-active-slot-indicator');
    const activeAudObj = users.find((u) => u.id === this.weeklyActiveSlot.auditorId);
    const activeDayObj = fiveDays[this.weeklyActiveSlot.dayIndex] || fiveDays[0];
    if (activeIndicator) {
      if (activeAudObj && activeDayObj) {
        activeIndicator.innerHTML = `🎯 Target Aktif: <strong>${activeAudObj.name}</strong> &mdash; <strong>${activeDayObj.dayName} (${activeDayObj.shortDate})</strong>`;
      } else {
        activeIndicator.textContent = '🎯 Pilih Auditor di Langkah 2 terlebih dahulu';
      }
    }
    this.renderWeeklyQuickStoreResults();

    // 4. Render 5-Day Matrix Board per Selected Auditor
    const boardEl = document.getElementById('weekly-planner-board');
    if (!boardEl) return;

    if (this.weeklySelectedAuditors.length === 0) {
      boardEl.innerHTML = `
        <div class="fm-card p-8 text-center space-y-2 border border-dashed border-slate-300">
          <div class="text-2xl text-slate-400"><i class="fa-solid fa-user-check"></i></div>
          <div class="font-extrabold text-sm text-slate-700">Belum Ada Regional Bestie / Auditor yang Dipilih</div>
          <p class="text-xs text-slate-500">Klik tombol <strong>"Pilih Semua"</strong> atau pilih nama Auditor pada Langkah 2 di atas untuk menampilkan papan jadwal 5 hari (Senin s/d Jumat).</p>
        </div>
      `;
    } else {
      const compactStoreOptions =
        `<option value="">+ Pilih Toko...</option>` +
        stores
          .slice(0, 250)
          .map((s) => `<option value="${s.code}">${s.code} - ${s.name} (${s.city || s.type || 'CVS'})</option>`)
          .join('');

      boardEl.innerHTML = this.weeklySelectedAuditors
        .map((audId) => {
          const u = users.find((x) => x.id === audId);
          if (!u) return '';
          let audDraftTotal = 0;
          for (let d = 0; d < 5; d++) {
            audDraftTotal += this.getWeeklySlotItems(u.id, d).length;
          }
          const initials = u.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          const daysColumnsHtml = fiveDays
            .map((dayObj) => {
              const isSlotActive =
                this.weeklyActiveSlot.auditorId === u.id && Number(this.weeklyActiveSlot.dayIndex) === dayObj.dayIndex;
              const draftItems = this.getWeeklySlotItems(u.id, dayObj.dayIndex);
              const existingDaySchedules = schedules.filter(
                (s) => s.auditorId === u.id && s.scheduledDate === dayObj.dateStr
              );

              return `
                <div
                  onclick="FMCUApp.setActiveWeeklySlot('${u.id}', ${dayObj.dayIndex})"
                  class="rounded-2xl border p-3 flex flex-col justify-between gap-2.5 transition cursor-pointer ${
                    isSlotActive
                      ? 'bg-emerald-50/70 border-[#009944] ring-2 ring-[#009944]/30 shadow-sm'
                      : 'bg-slate-50/70 border-slate-200 hover:border-teal-300 hover:bg-white'
                  }"
                >
                  <div class="space-y-2">
                    <!-- Day Header -->
                    <div class="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
                      <div>
                        <span class="text-[11px] font-extrabold tracking-wider ${
                          isSlotActive ? 'text-[#009944]' : 'text-slate-800'
                        }">${dayObj.dayName}</span>
                        <div class="text-[10px] font-semibold text-slate-500">${dayObj.shortDate}</div>
                      </div>
                      <span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                        isSlotActive
                          ? 'bg-[#009944] text-white'
                          : draftItems.length > 0
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-slate-200/70 text-slate-600'
                      }">
                        ${isSlotActive ? '🎯 Aktif' : `${draftItems.length} Toko`}
                      </span>
                    </div>

                    <!-- Already Saved Schedules on this date -->
                    ${
                      existingDaySchedules.length > 0
                        ? `<div class="space-y-1">
                            ${existingDaySchedules
                              .map(
                                (ex) => `
                                <div class="px-2 py-1 rounded-lg bg-slate-200/70 text-slate-700 text-[10px] flex items-center justify-between gap-1" title="Sudah terjadwal di database">
                                  <span class="truncate font-semibold"><i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i>${ex.storeCode} ${ex.storeName}</span>
                                  <span class="text-[9px] font-mono uppercase shrink-0">${ex.status === 'COMPLETED' ? 'Selesai' : 'Terjadwal'}</span>
                                </div>
                              `
                              )
                              .join('')}
                          </div>`
                        : ''
                    }

                    <!-- Draft Stores List -->
                    <div class="space-y-1.5 min-h-[54px]">
                      ${
                        draftItems.length === 0
                          ? `<div class="h-14 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-center p-2 text-[10px] text-slate-400">
                              <span>Klik hari ini lalu pilih toko di atas</span>
                            </div>`
                          : draftItems
                              .map((item) => {
                                const st = storeMap.get(String(item.storeCode));
                                const stName = st ? st.name : item.storeCode;
                                const stCity = st ? st.city || st.type || 'CVS' : 'CVS';
                                return `
                                  <div onclick="event.stopPropagation()" class="p-2 rounded-xl bg-white border border-emerald-200 shadow-2xs space-y-1">
                                    <div class="flex items-start justify-between gap-1">
                                      <div class="min-w-0">
                                        <div class="font-mono font-extrabold text-[10px] text-[#0099A6]">Site ${item.storeCode}</div>
                                        <div class="font-extrabold text-[11px] text-slate-900 leading-tight truncate" title="${stName}">${stName}</div>
                                        <div class="text-[9px] text-slate-500 truncate">${stCity}</div>
                                      </div>
                                      <button
                                        type="button"
                                        onclick="FMCUApp.removeStoreFromWeeklySlot('${u.id}', ${dayObj.dayIndex}, '${item.storeCode}')"
                                        class="text-slate-400 hover:text-rose-600 px-1 text-xs cursor-pointer"
                                        title="Hapus toko dari hari ini"
                                      >
                                        <i class="fa-solid fa-xmark"></i>
                                      </button>
                                    </div>
                                    <div class="flex items-center justify-between pt-0.5">
                                      <button
                                        type="button"
                                        onclick="FMCUApp.toggleWeeklyStorePriority('${u.id}', ${dayObj.dayIndex}, '${item.storeCode}')"
                                        class="px-1.5 py-0.2 rounded text-[9px] font-extrabold cursor-pointer ${
                                          item.priority === 'HIGH'
                                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                            : 'bg-slate-100 text-slate-600'
                                        }"
                                        title="Klik untuk ubah prioritas NORMAL / HIGH"
                                      >
                                        ${item.priority}
                                      </button>
                                      <span class="text-[9px] text-emerald-700 font-bold">Siap Assign</span>
                                    </div>
                                  </div>
                                `;
                              })
                              .join('')
                      }
                    </div>
                  </div>

                  <!-- Inline Quick Dropdown Add -->
                  <div onclick="event.stopPropagation()">
                    <select
                      onchange="FMCUApp.onInlineAddStoreToDay('${u.id}', ${dayObj.dayIndex}, this)"
                      class="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-700 focus:outline-none focus:border-[#009944]"
                    >
                      ${compactStoreOptions}
                    </select>
                  </div>
                </div>
              `;
            })
            .join('');

          return `
            <div class="fm-card p-4 sm:p-5 space-y-3.5 border border-slate-200">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl text-white font-extrabold text-sm flex items-center justify-center shrink-0 shadow-xs" style="background:${u.avatarColor || '#0099A6'}">
                    ${initials}
                  </div>
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <h4 class="font-extrabold text-sm sm:text-base text-slate-900">${u.name}</h4>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 text-[#0099A6] border border-teal-200">${u.roleBadge || u.role}</span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">${audDraftTotal} Toko di Minggu Ini</span>
                    </div>
                    <p class="text-[11px] text-slate-500">@${u.username} • Wilayah: ${u.region || 'Nasional'} • Klik kolom hari untuk mengisi toko</p>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onclick="FMCUApp.autoFillFiveDaysForAuditor('${u.id}')"
                    class="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#009944] border border-emerald-200 font-extrabold text-[11px] transition flex items-center gap-1 cursor-pointer"
                  >
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    <span>Isi Otomatis Sen–Jum</span>
                  </button>
                  <button
                    type="button"
                    onclick="FMCUApp.copyAuditorWeekToOthers('${u.id}')"
                    class="px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0099A6] border border-teal-200 font-extrabold text-[11px] transition flex items-center gap-1 cursor-pointer"
                    title="Salin susunan toko Senin-Jumat auditor ini ke auditor terpilih lainnya"
                  >
                    <i class="fa-regular fa-copy"></i>
                    <span>Salin ke Auditor Lain</span>
                  </button>
                  <button
                    type="button"
                    onclick="FMCUApp.clearAuditorWeeklyDraft('${u.id}')"
                    class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold text-[11px] transition cursor-pointer"
                  >
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>

              <!-- 5 Columns: Senin s/d Jumat -->
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                ${daysColumnsHtml}
              </div>
            </div>
          `;
        })
        .join('');
    }

    // 5. Update Bottom Sticky Summary Counter
    let totalDraftSchedules = 0;
    let activeAuditorsWithDraft = 0;
    this.weeklySelectedAuditors.forEach((audId) => {
      let c = 0;
      for (let d = 0; d < 5; d++) {
        c += this.getWeeklySlotItems(audId, d).length;
      }
      if (c > 0) activeAuditorsWithDraft++;
      totalDraftSchedules += c;
    });

    const totalDraftBadge = document.getElementById('weekly-total-draft-badge');
    if (totalDraftBadge) {
      totalDraftBadge.textContent = `${totalDraftSchedules} Jadwal Visit Siap Ditugaskan (Senin–Jumat)`;
    }
    const totalAudBadge = document.getElementById('weekly-total-auditor-badge');
    if (totalAudBadge) {
      totalAudBadge.textContent = `${activeAuditorsWithDraft} / ${this.weeklySelectedAuditors.length} Auditor`;
    }
    const applyBtnText = document.getElementById('weekly-apply-btn-text');
    if (applyBtnText) {
      applyBtnText.textContent =
        totalDraftSchedules > 0
          ? `Terapkan & Simpan ${totalDraftSchedules} Jadwal 5 Hari`
          : 'Terapkan & Simpan Jadwal 5 Hari';
    }
  },

  applyWeeklySchedulesBatch() {
    this.ensureWeeklyPlannerInitialized();
    const users = this.getSchedulableAuditors();
    const stores = window.FMCUData.getStores();
    const schedules = window.FMCUData.getSchedules();
    const userMap = new Map(users.map((u) => [u.id, u]));
    const storeMap = new Map(stores.map((s) => [String(s.code), s]));
    const fiveDays = this.getFiveWorkDays(this.weeklyMondayDate);

    const windowStr = (document.getElementById('weekly-default-window')?.value || '08:30 - 17:30').trim();
    const focusStr = (document.getElementById('weekly-default-focus')?.value || '').trim() || 'Audit Rutin Mingguan (QSC & Observasi)';
    const assignedBy = this.currentUser?.name || 'Admin FMCU';

    const newSchedules = [];
    const involvedAuditors = new Set();

    this.weeklySelectedAuditors.forEach((audId) => {
      const au = userMap.get(audId);
      if (!au) return;

      fiveDays.forEach((dayObj) => {
        const items = this.getWeeklySlotItems(audId, dayObj.dayIndex);
        items.forEach((item, idx) => {
          const st = storeMap.get(String(item.storeCode));
          if (!st) return;
          involvedAuditors.add(au.name);
          newSchedules.push({
            id: `sch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${idx}`,
            storeCode: st.code,
            storeName: st.name,
            storeType: st.type || 'CVS',
            auditorId: au.id,
            auditorName: au.name,
            scheduledDate: dayObj.dateStr,
            shiftWindow: windowStr || '08:30 - 17:30',
            priority: item.priority || 'NORMAL',
            auditFocus: focusStr,
            status: 'PENDING',
            actualIn: null,
            actualOut: null,
            reportId: null,
            assignedBy
          });
        });
      });
    });

    if (newSchedules.length === 0) {
      this.showToast('Belum ada toko yang dimasukkan ke dalam jadwal 5 hari (Senin–Jumat). Silakan pilih toko terlebih dahulu.', 'warning');
      return;
    }

    const updatedSchedules = [...newSchedules, ...schedules];
    window.FMCUData.saveSchedules(updatedSchedules);

    this.weeklyDraftMatrix = {};
    this.renderAllViews();
    this.switchScheduleSubSection('list');
    this.showToast(
      `🎉 Berhasil menerapkan ${newSchedules.length} Jadwal Visit (Senin–Jumat) untuk ${involvedAuditors.size} Auditor!`,
      'success'
    );
  },

  renderAdminAuditorRecapStrip() {
    const stripEl = document.getElementById('admin-auditor-recap-strip');
    if (!stripEl) return;
    const users = this.getSchedulableAuditors();
    const schedules = window.FMCUData.getSchedules();
    const reports = window.FMCUData.getReports();
    const currentFilter = document.getElementById('adm-sch-list-auditor')?.value || 'ALL';

    stripEl.innerHTML = users
      .map((u) => {
        const mySch = schedules.filter((s) => s.auditorId === u.id || s.auditorName === u.name);
        const completed = mySch.filter((s) => s.status === 'COMPLETED').length;
        const pending = mySch.length - completed;
        const pct = mySch.length > 0 ? Math.round((completed / mySch.length) * 100) : 0;
        const myReports = reports.filter((r) => r.auditorId === u.id || r.auditorName === u.name);
        const avgQsc =
          myReports.length > 0
            ? Math.round(myReports.reduce((acc, r) => acc + Number(r.qscScore || 0), 0) / myReports.length)
            : 0;
        const isFiltered = currentFilter === u.id;

        return `
          <div
            onclick="FMCUApp.filterScheduleListByAuditor('${u.id}')"
            class="p-3 rounded-xl border transition cursor-pointer ${
              isFiltered
                ? 'bg-teal-50/90 border-[#0099A6] ring-1 ring-[#0099A6]'
                : 'bg-slate-50/70 hover:bg-white border-slate-200'
            }"
            title="Klik untuk memfilter daftar jadwal berdasarkan ${u.name}"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="font-extrabold text-xs text-slate-900 truncate">${u.name}</div>
                <div class="text-[10px] text-slate-500 truncate">${u.roleBadge || u.role} • ${u.region || '-'}</div>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                pct >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-100 text-teal-800'
              }">${pct}%</span>
            </div>
            <div class="grid grid-cols-3 gap-1.5 mt-2.5 text-center text-[10px]">
              <div class="bg-white p-1.5 rounded-lg border border-slate-200/80">
                <div class="text-slate-400 font-bold">Total</div>
                <div class="font-extrabold text-slate-900 text-xs">${mySch.length}</div>
              </div>
              <div class="bg-white p-1.5 rounded-lg border border-slate-200/80">
                <div class="text-emerald-600 font-bold">Selesai</div>
                <div class="font-extrabold text-emerald-700 text-xs">${completed}</div>
              </div>
              <div class="bg-white p-1.5 rounded-lg border border-slate-200/80">
                <div class="text-amber-600 font-bold">Pending</div>
                <div class="font-extrabold text-amber-700 text-xs">${pending}</div>
              </div>
            </div>
            <div class="mt-2 flex items-center justify-between text-[10px] text-slate-500">
              <span>Laporan: <strong>${myReports.length}</strong></span>
              <span>Avg QSC: <strong>${avgQsc}%</strong></span>
            </div>
          </div>
        `;
      })
      .join('');
  },

  filterScheduleListByAuditor(auditorId) {
    const sel = document.getElementById('adm-sch-list-auditor');
    if (!sel) return;
    sel.value = sel.value === auditorId ? 'ALL' : auditorId;
    this.renderAdminView();
  },

  exportSchedulesAndAuditorRecapExcel() {
    if (typeof XLSX === 'undefined') {
      this.showToast('Library Excel (SheetJS) belum termuat. Silakan muat ulang halaman.', 'error');
      return;
    }

    const allUsers = window.FMCUData.getUsers();
    const users = this.getSchedulableAuditors();
    const schedules = window.FMCUData.getSchedules();
    const stores = window.FMCUData.getStores();
    const reports = window.FMCUData.getReports();

    const storeMap = new Map(stores.map((s) => [String(s.code), s]));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const reportByIdMap = new Map(reports.map((r) => [r.id, r]));

    // ========================================================================
    // SHEET 1: REKAPITULASI PERFORMA & BEBAN JADWAL SEMUA AUDITOR
    // ========================================================================
    const auditorRecapRows = users.map((u, idx) => {
      const mySchedules = schedules.filter((s) => s.auditorId === u.id || s.auditorName === u.name);
      const completedSch = mySchedules.filter((s) => s.status === 'COMPLETED');
      const pendingSch = mySchedules.filter((s) => s.status !== 'COMPLETED');
      const highPrioritySch = mySchedules.filter((s) => s.priority === 'HIGH');
      const realizationPct = mySchedules.length > 0 ? Math.round((completedSch.length / mySchedules.length) * 100) : 0;

      const myReports = reports.filter((r) => r.auditorId === u.id || r.auditorName === u.name);
      const avgQsc =
        myReports.length > 0
          ? Number((myReports.reduce((acc, r) => acc + Number(r.qscScore || 0), 0) / myReports.length).toFixed(1))
          : 0;
      const totalObservations = myReports.reduce((acc, r) => acc + (Array.isArray(r.observations) ? r.observations.length : 0), 0);
      const latestReport = myReports[0] || null;

      const assignedStoresText = mySchedules
        .map((s) => `${s.scheduledDate}: ${s.storeCode}-${s.storeName} (${s.status})`)
        .join(' | ');

      return {
        No: idx + 1,
        'Nama Auditor / Regional Bestie': u.name,
        Username: `@${u.username}`,
        'Jabatan / Role': u.roleBadge || u.role,
        'Wilayah / Region': u.region || '-',
        'Email Auditor': u.email || '-',
        'Total Jadwal Visit': mySchedules.length,
        'Visit Selesai (COMPLETED)': completedSch.length,
        'Visit Pending (PENDING)': pendingSch.length,
        'Realisasi Visit (%)': `${realizationPct}%`,
        'Jadwal Prioritas HIGH': highPrioritySch.length,
        'Total Laporan Masuk': myReports.length,
        'Rata-Rata Skor QSC (%)': avgQsc,
        'Total Temuan Observasi': totalObservations,
        'Visit Terakhir (Toko & Tanggal)': latestReport ? `${latestReport.storeName} (${latestReport.visitDate})` : '-',
        'Koordinat GPS Terakhir':
          u.lastLocation && u.lastLocation.lat ? `${u.lastLocation.lat}, ${u.lastLocation.lng}` : '-',
        'Rincian Toko yang Dijadwalkan': assignedStoresText || 'Belum ada jadwal'
      };
    });

    // ========================================================================
    // SHEET 2: DAFTAR SELURUH JADWAL VISIT TOKO & INFORMASI PENTING PIC
    // ========================================================================
    const scheduleDetailRows = schedules.map((s, idx) => {
      const st = storeMap.get(String(s.storeCode)) || {};
      const au = userMap.get(s.auditorId) || {};
      const linkedRep =
        (s.reportId && reportByIdMap.get(s.reportId)) ||
        reports.find((r) => r.scheduleId === s.id || (r.storeCode === s.storeCode && r.visitDate === s.scheduledDate)) ||
        null;

      return {
        No: idx + 1,
        'ID Jadwal': s.id,
        'Hari & Tanggal Target': window.FMCUPdf.formatIndonesianDate(s.scheduledDate, true),
        'Tanggal (YYYY-MM-DD)': s.scheduledDate || '-',
        'Nama Auditor / Bestie': s.auditorName || au.name || '-',
        'Region Auditor': au.region || '-',
        'Site Code Toko': s.storeCode || '-',
        'Nama Toko': s.storeName || st.name || '-',
        'Tipe Toko': s.storeType || st.type || 'CVS',
        'Kota / Wilayah': st.city || '-',
        'Alamat Toko': st.address || '-',
        'Store Head (Kepala Toko)': st.storeHead || linkedRep?.storeHead || '-',
        'Area Manager (AM)': st.areaManager || linkedRep?.areaManager || '-',
        'Email Area Manager': st.areaManagerEmail || '-',
        'Regional Manager (RM)': st.regionalManager || linkedRep?.regionalManager || '-',
        'Email Regional Manager': st.regionalManagerEmail || '-',
        'Email Toko': st.email || linkedRep?.storeEmail || '-',
        'No. Telepon Toko': st.storePhone || '-',
        'Prioritas Kunjungan': s.priority || 'NORMAL',
        'Jam Operasional Target': s.shiftWindow || '-',
        'Fokus Audit / Catatan Admin': s.auditFocus || '-',
        'Status Kunjungan': s.status || 'PENDING',
        'Actual Check-In': s.actualIn || linkedRep?.actualIn || '-',
        'Actual Check-Out': s.actualOut || linkedRep?.actualOut || '-',
        'Koordinat GPS Visit':
          s.actualLat || linkedRep?.gpsLat
            ? `${s.actualLat || linkedRep?.gpsLat}, ${s.actualLng || linkedRep?.gpsLng}`
            : '-',
        'Skor QSC (%)': linkedRep ? Number(linkedRep.qscScore || 0) : '-',
        'Jumlah Temuan Observasi': linkedRep && Array.isArray(linkedRep.observations) ? linkedRep.observations.length : 0,
        'Ditugaskan Oleh': s.assignedBy || 'Admin FMCU'
      };
    });

    // ========================================================================
    // SHEET 3: MATRIKS JADWAL 5 HARI (SENIN - JUMAT) PER AUDITOR
    // ========================================================================
    this.ensureWeeklyPlannerInitialized();
    const fiveDays = this.getFiveWorkDays(this.weeklyMondayDate);
    const weeklyMatrixRows = users.map((u, idx) => {
      const row = {
        No: idx + 1,
        'Nama Auditor / Regional Bestie': u.name,
        'Role / Jabatan': u.roleBadge || u.role,
        Wilayah: u.region || '-'
      };
      let weekTotal = 0;
      fiveDays.forEach((dObj) => {
        const daySch = schedules.filter((s) => (s.auditorId === u.id || s.auditorName === u.name) && s.scheduledDate === dObj.dateStr);
        weekTotal += daySch.length;
        const colHeader = `${dObj.dayName} (${dObj.dateStr})`;
        row[colHeader] =
          daySch.length > 0
            ? daySch.map((s) => `[${s.storeCode}] ${s.storeName} (${s.status})`).join(' ; ')
            : '-';
      });
      row['Total Toko Minggu Ini (Sen-Jum)'] = weekTotal;
      return row;
    });

    // ========================================================================
    // SHEET 4: REKAP DETAIL LAPORAN VISIT & TEMUAN OBSERVASI SEMUA AUDITOR
    // ========================================================================
    const reportDetailRows = reports.map((r, idx) => {
      const obsText = (r.observations || [])
        .map(
          (o, i) =>
            `${i + 1}. [${o.kategori || 'QSC'}] Temuan: ${o.temuan || '-'} | Akar Masalah: ${o.akarMasalah || '-'} | Action: ${o.correctiveAction || '-'} (Deadline: ${o.deadlineFormatted || o.deadline || '-'})`
        )
        .join(' || ');

      const gdriveLinks = [
        ...(r.qscPhotos || []).map((p) => p.driveViewUrl || p.driveUrl).filter(Boolean),
        ...(r.evidencePhotos || []).map((p) => p.driveViewUrl || p.driveUrl).filter(Boolean)
      ].join(' , ');

      return {
        No: idx + 1,
        'ID Laporan': r.id,
        'Hari & Tanggal Visit': r.visitDayDateFormatted || r.visitDate,
        'Nama Auditor': r.auditorName || '-',
        'Site Code': r.storeCode || '-',
        'Nama Toko': r.storeName || '-',
        'Tipe Toko': r.storeType || 'CVS',
        'Store Head': r.storeHead || '-',
        'Area Manager': r.areaManager || '-',
        'Regional Manager': r.regionalManager || '-',
        'Actual In': r.actualIn || '-',
        'Actual Out': r.actualOut || '-',
        'Koordinat GPS': r.gpsLat ? `${r.gpsLat}, ${r.gpsLng}` : '-',
        'Skor QSC (%)': Number(r.qscScore || 0),
        'Jumlah Crew bertugas': Array.isArray(r.crewList) ? r.crewList.length : 0,
        'Jumlah Temuan Observasi': Array.isArray(r.observations) ? r.observations.length : 0,
        'Detail Temuan, Akar Masalah & Corrective Action': obsText || 'Tidak ada temuan',
        'Link Foto Database Google Drive': gdriveLinks || '-'
      };
    });

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(
      auditorRecapRows.length > 0 ? auditorRecapRows : [{ Info: 'Belum ada data auditor' }]
    );
    ws1['!cols'] = [
      { wch: 5 },
      { wch: 28 },
      { wch: 16 },
      { wch: 24 },
      { wch: 20 },
      { wch: 26 },
      { wch: 16 },
      { wch: 20 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 28 },
      { wch: 22 },
      { wch: 65 }
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Rekap Performa Auditor');

    const ws2 = XLSX.utils.json_to_sheet(
      scheduleDetailRows.length > 0 ? scheduleDetailRows : [{ Info: 'Belum ada jadwal visit' }]
    );
    ws2['!cols'] = [
      { wch: 5 },
      { wch: 18 },
      { wch: 24 },
      { wch: 14 },
      { wch: 26 },
      { wch: 18 },
      { wch: 12 },
      { wch: 26 },
      { wch: 10 },
      { wch: 20 },
      { wch: 38 },
      { wch: 22 },
      { wch: 22 },
      { wch: 26 },
      { wch: 22 },
      { wch: 26 },
      { wch: 26 },
      { wch: 16 },
      { wch: 14 },
      { wch: 18 },
      { wch: 34 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 22 },
      { wch: 12 },
      { wch: 16 },
      { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Daftar Seluruh Jadwal');

    const ws3 = XLSX.utils.json_to_sheet(
      weeklyMatrixRows.length > 0 ? weeklyMatrixRows : [{ Info: 'Belum ada matriks mingguan' }]
    );
    ws3['!cols'] = [
      { wch: 5 },
      { wch: 26 },
      { wch: 22 },
      { wch: 18 },
      { wch: 32 },
      { wch: 32 },
      { wch: 32 },
      { wch: 32 },
      { wch: 32 },
      { wch: 22 }
    ];
    XLSX.utils.book_append_sheet(wb, ws3, 'Matriks 5 Hari (Sen-Jum)');

    const ws4 = XLSX.utils.json_to_sheet(
      reportDetailRows.length > 0 ? reportDetailRows : [{ Info: 'Belum ada laporan visit' }]
    );
    ws4['!cols'] = [
      { wch: 5 },
      { wch: 18 },
      { wch: 24 },
      { wch: 26 },
      { wch: 12 },
      { wch: 26 },
      { wch: 10 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 12 },
      { wch: 12 },
      { wch: 22 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 70 },
      { wch: 45 }
    ];
    XLSX.utils.book_append_sheet(wb, ws4, 'Rekap Laporan & Temuan');

    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `Rekap_Jadwal_Visit_&_Auditor_FMCU_${dateStamp}.xlsx`;
    XLSX.writeFile(wb, fileName);
    this.showToast(`File Excel "${fileName}" (4 Sheet Rekap Lengkap) berhasil diunduh!`, 'success');
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
      shiftWindow: windowStr || '08:30 - 17:30',
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
    this.switchScheduleSubSection('list');
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
    const type = document.getElementById('adm-st-type').value.trim() || 'CVS';
    const name = document.getElementById('adm-st-name').value.trim().toUpperCase();
    const city = document.getElementById('adm-st-city')?.value.trim() || '';
    const address = document.getElementById('adm-st-address')?.value.trim() || '';
    const email = document.getElementById('adm-st-email').value.trim();
    const storePhone = document.getElementById('adm-st-phone')?.value.trim() || '';
    const head = document.getElementById('adm-st-head').value.trim();
    const am = document.getElementById('adm-st-am').value.trim();
    const amEmail = document.getElementById('adm-st-am-email')?.value.trim() || '';
    const rm = document.getElementById('adm-st-rm').value.trim();
    const rmEmail = document.getElementById('adm-st-rm-email')?.value.trim() || '';

    const stores = window.FMCUData.getStores();
    const existingIdx = stores.findIndex((s) => s.code === code);
    const storeObj = {
      code,
      name,
      type,
      city,
      address,
      email,
      storePhone,
      storeHead: head,
      areaManager: am,
      areaManagerEmail: amEmail,
      regionalManager: rm,
      regionalManagerEmail: rmEmail
    };

    if (existingIdx !== -1) {
      stores[existingIdx] = storeObj;
    } else {
      stores.unshift(storeObj);
    }
    window.FMCUData.saveStores(stores, storeObj, null);
    this.populateMasterStoreSelect();
    this.renderAllViews();
    this.updateAdminFirestoreSummary();
    event.target.reset();
    this.showToast(`Master Toko ${name} (Site: ${code}) berhasil disimpan & disinkronkan ke Firestore!`, 'success');
  },

  editStore(code) {
    const stores = window.FMCUData.getStores();
    const st = stores.find((s) => s.code === code);
    if (!st) return;
    document.getElementById('adm-st-code').value = st.code || '';
    document.getElementById('adm-st-type').value = st.type || 'CVS';
    document.getElementById('adm-st-name').value = st.name || '';
    if (document.getElementById('adm-st-city')) document.getElementById('adm-st-city').value = st.city || '';
    if (document.getElementById('adm-st-address')) document.getElementById('adm-st-address').value = st.address || '';
    document.getElementById('adm-st-email').value = st.email || '';
    if (document.getElementById('adm-st-phone')) document.getElementById('adm-st-phone').value = st.storePhone || '';
    document.getElementById('adm-st-head').value = st.storeHead || '';
    document.getElementById('adm-st-am').value = st.areaManager || '';
    if (document.getElementById('adm-st-am-email')) document.getElementById('adm-st-am-email').value = st.areaManagerEmail || '';
    document.getElementById('adm-st-rm').value = st.regionalManager || '';
    if (document.getElementById('adm-st-rm-email')) document.getElementById('adm-st-rm-email').value = st.regionalManagerEmail || '';
    this.showToast(`Memuat data toko ${st.name} (Site: ${st.code}) ke form edit`, 'info');
  },

  deleteStore(code) {
    const stores = window.FMCUData.getStores().filter((s) => s.code !== code);
    window.FMCUData.saveStores(stores, null, code);
    this.populateMasterStoreSelect();
    this.renderAllViews();
    this.updateAdminFirestoreSummary();
    this.showToast(`Toko Site ${code} dihapus dari Master Toko & Firestore`, 'info');
  },

  onChangeUserRolePreset(role) {
    const presets = {
      AUDITOR: ['view_home', 'view_analytics', 'create_visit', 'export_pdf'],
      ADMIN_SCHEDULE: ['view_home', 'view_analytics', 'create_visit', 'export_pdf', 'manage_schedule'],
      SUPER_ADMIN: [
        'view_home',
        'view_analytics',
        'create_visit',
        'export_pdf',
        'manage_schedule',
        'manage_stores',
        'manage_users',
        'manage_integrations'
      ]
    };
    const set = new Set(presets[role] || presets.AUDITOR);
    document.querySelectorAll('input[name="adm-auth"]').forEach((cb) => {
      cb.checked = set.has(cb.value);
    });
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

    document.querySelectorAll('input[name="adm-auth"]').forEach((cb) => {
      cb.checked = this.hasAuthority(cb.value, u);
    });
    this.showToast(`Memuat akun @${u.username} untuk ubah data / password / otoritas`, 'info');
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
      _v2AuthSchema: true,
      lastLocation: existingIdx !== -1 ? users[existingIdx].lastLocation || null : null
    };

    if (existingIdx !== -1) {
      users[existingIdx] = newUser;
    } else {
      users.push(newUser);
    }
    window.FMCUData.saveUsers(users);
    if (this.currentUser && (this.currentUser.id === newUser.id || this.currentUser.username === newUser.username)) {
      this.setLoggedInUser(newUser);
    } else {
      this.populateHeaderRoleSwitcher();
      this.updateSidebarAuthoritiesUI();
      this.renderAllViews();
    }
    event.target.reset();
    this.onChangeUserRolePreset('AUDITOR');
    this.showToast(`User ${name} (@${username}) beserta otoritas menu sidebar berhasil disimpan ke Firestore!`, 'success');
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
      gdrivePhotoFolderId: document.getElementById('set-gdrive-photo-folder')?.value.trim() || '',
      gdriveFolderId: document.getElementById('set-gdrive-folder').value.trim(),
      defaultCcEmails: document.getElementById('set-cc-emails').value.trim(),
      gasWebhookUrl: document.getElementById('set-gas-url').value.trim()
    };
    window.FMCUData.saveSettings(settings);
    this.renderPreviewView();
    this.showToast('Pengaturan Integrasi Email, Database Foto Google Drive & PDF berhasil disimpan ke Firestore!', 'success');
  },

  populateGasScriptPreview() {
    const codeBox = document.getElementById('gas-code-preview');
    if (!codeBox) return;
    codeBox.textContent = `function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || 'sendReport';

    // 1. KHUSUS UPLOAD FOTO KE DATABASE GOOGLE DRIVE (QSC & EVIDENCE)
    if (action === 'uploadPhoto') {
      var rawBase64 = payload.photoBase64 || '';
      if (rawBase64.indexOf(',') !== -1) rawBase64 = rawBase64.split(',')[1];
      var photoBlob = Utilities.newBlob(Utilities.base64Decode(rawBase64), 'image/jpeg', payload.fileName || 'FMCU_PHOTO.jpg');
      var rootPhotoFolder = getOrCreateTargetFolder_(payload.gdrivePhotoFolderId, 'FMCU_Visit_Photos_Database');
      var storeFolderName = ((payload.storeCode || 'STORE') + ' - ' + (payload.storeName || 'VISIT')).replace(/[\\\\/:*?"<>|]/g, '_');
      var storeFolder = getOrCreateSubFolder_(rootPhotoFolder, storeFolderName);
      var photoFile = storeFolder.createFile(photoBlob);
      photoFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var fid = photoFile.getId();
      return jsonResponse_({
        status: 'SUCCESS',
        fileId: fid,
        directUrl: 'https://drive.google.com/thumbnail?id=' + fid + '&sz=w1200',
        viewUrl: photoFile.getUrl()
      });
    }

    // 2. AMBIL FOTO DARI GOOGLE DRIVE UNTUK CETAK PDF LINTAS PERANGKAT
    if (action === 'getPhotoBase64') {
      var fileIds = payload.fileIds || [];
      var photosMap = {};
      for (var i = 0; i < fileIds.length; i++) {
        try {
          var f = DriveApp.getFileById(fileIds[i]);
          var b = f.getBlob();
          photosMap[fileIds[i]] = 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes());
        } catch (err) { photosMap[fileIds[i]] = ''; }
      }
      return jsonResponse_({ status: 'SUCCESS', photos: photosMap });
    }

    // 3. SIMPAN PDF LAPORAN KE GOOGLE DRIVE & KIRIM EMAIL OTOMATIS
    var report = payload.report || {};
    var pdfBlob = null;
    var fileUrl = '';
    if (payload.pdfBase64) {
      var b64Pdf = payload.pdfBase64.indexOf(',') !== -1 ? payload.pdfBase64.split(',')[1] : payload.pdfBase64;
      pdfBlob = Utilities.newBlob(Utilities.base64Decode(b64Pdf), 'application/pdf', payload.fileName || 'FMCU_Visit_Report.pdf');
      var pdfFolder = getOrCreateTargetFolder_(payload.gdriveFolderId, 'FMCU_Visit_Reports_PDF_Archive');
      var pdfFile = pdfFolder.createFile(pdfBlob);
      pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileUrl = pdfFile.getUrl();
    }

    if (payload.recipientEmails) {
      MailApp.sendEmail({
        to: payload.recipientEmails,
        cc: payload.ccEmails || '',
        subject: '[FMCU VISIT REPORT] ' + (report.storeName || '') + ' (' + (report.storeCode || '') + ')',
        htmlBody: 'Terlampir hasil FMCU Visit Store Report untuk toko <b>' + (report.storeName || '') + '</b>.<br/>Arsip GDrive: ' + fileUrl,
        attachments: pdfBlob ? [pdfBlob] : []
      });
    }
    return jsonResponse_({ status: 'SUCCESS', fileUrl: fileUrl });
  } catch (err) {
    return jsonResponse_({ status: 'ERROR', message: err.toString() });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function getOrCreateTargetFolder_(folderIdOrUrl, defaultName) {
  if (folderIdOrUrl) {
    var m = String(folderIdOrUrl).trim().match(/[-\\w]{25,}/);
    var id = m ? m[0] : String(folderIdOrUrl).trim();
    if (id.length >= 15) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  }
  var it = DriveApp.getFoldersByName(defaultName);
  return it.hasNext() ? it.next() : DriveApp.createFolder(defaultName);
}
function getOrCreateSubFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
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
