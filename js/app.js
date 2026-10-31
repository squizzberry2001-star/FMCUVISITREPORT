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
  currentAnalyticsSubSection: 'history',
  scheduleCreateMode: 'weekly',
  weeklyMondayDate: '',
  weeklySelectedAuditors: [],
  weeklyDraftMatrix: {},
  weeklyActiveSlot: { auditorId: null, dayIndex: 0 },
  currentUser: null,
  gpsWatchId: null,
  isGpsUnlocked: false,
  isNotificationUnlocked: false,
  swRegistration: null,
  _notifCheckInterval: null,
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
  enableOpi: true,
  enableQsc: true,
  enableEvidence: true,
  enableCa: true,
  floatingEvidenceTarget: 'finding',
  formCrew: [],
  formQscPhotos: [],
  formOpiObservations: [],
  formObservations: [],
  formEvidencePhotos: [],
  formCaPhotos: [],

  // PDF Preview State
  activePreviewReportId: '__LIVE_FORM__',
  previewMode: 'slide',
  previewSlides: [],
  currentSlideIndex: 0,
  newsCurrentIndex: 0,
  newsTimer: null,
  newsItems: [],
  holdingTimeActiveCategory: 'ALL',
  adminHoldingDraft: null,

  init() {
    document.body.classList.remove('has-hud');
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

    // Touch swipe navigation for PDF Slide Preview on Mobile
    let previewTouchStartX = 0;
    let previewTouchStartY = 0;
    const previewStage = document.getElementById('preview-active-slide-stage');
    if (previewStage) {
      previewStage.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 1) {
          previewTouchStartX = e.touches[0].clientX;
          previewTouchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      previewStage.addEventListener('touchend', (e) => {
        if (e.changedTouches && e.changedTouches.length === 1) {
          const deltaX = e.changedTouches[0].clientX - previewTouchStartX;
          const deltaY = e.changedTouches[0].clientY - previewTouchStartY;
          if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
            if (deltaX < 0) {
              this.nextSlide();
            } else {
              this.prevSlide();
            }
          }
        }
      }, { passive: true });
    }

    // Touch swipe navigation for Home Subsections (Overview, Schedule, History)
    let homeTouchStartX = 0;
    let homeTouchStartY = 0;
    const viewHome = document.getElementById('view-home');
    if (viewHome) {
      viewHome.addEventListener('touchstart', (e) => {
        const target = e.target;
        if (target.closest('#home-map') || target.closest('#home-news-track') || target.closest('input, textarea, select, button, .leaflet-container')) {
          homeTouchStartX = 0;
          return;
        }
        if (e.touches && e.touches.length === 1) {
          homeTouchStartX = e.touches[0].clientX;
          homeTouchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      viewHome.addEventListener('touchend', (e) => {
        if (!homeTouchStartX) return;
        if (e.changedTouches && e.changedTouches.length === 1) {
          const deltaX = e.changedTouches[0].clientX - homeTouchStartX;
          const deltaY = e.changedTouches[0].clientY - homeTouchStartY;
          if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
            const sections = ['overview', 'schedule', 'history'];
            const curIdx = sections.indexOf(this.currentHomeSubSection || 'overview');
            if (deltaX < 0 && curIdx < sections.length - 1) {
              this.switchHomeSubSection(sections[curIdx + 1]);
            } else if (deltaX > 0 && curIdx > 0) {
              this.switchHomeSubSection(sections[curIdx - 1]);
            }
          }
        }
        homeTouchStartX = 0;
      }, { passive: true });
    }

    // Cek sesi login aktif di tab ini (sessionStorage). Jika tutup tab / buka baru / expired -> wajib login!
    const sessionUser = window.FMCUData.getSession();
    this.currentUser = sessionUser || null;
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) {
      authScreen.classList.toggle('hidden', Boolean(this.currentUser));
    }
    if (!this.currentUser) {
      this.triggerMobileAuthSplash();
      if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
        this.focusLoginNikInput();
      }
    }

    // Check if there was an active store check-in session
    const activeCheckIn = window.FMCUData.getActiveCheckIn();
    this.hasActiveStoreForm = Boolean(activeCheckIn && activeCheckIn.storeCode);

    this.setupCustomUserSelectListeners();
    this.populateHeaderRoleSwitcher();
    this.updateUserHeaderUI();
    this.checkAndDispatchUserVisitNotifications();

    this.renderHomeNewsSlider();
    if (activeCheckIn && activeCheckIn.storeCode) {
      this.restoreActiveCheckInToForm(activeCheckIn);
    } else {
      this.resetVisitForm(true);
    }
    this.setupFormAutoDraftListeners();
    this.populateGasScriptPreview();
    this.onCloudStatusChanged(window.FMCUData.cloudStatus, window.FMCUData.cloudErrorMsg);

    // Pulihkan active view & subtab saat refresh (atau arahkan ke default view otoritas user)
    if (this.currentUser) {
      const savedSchSub = sessionStorage.getItem('fmcu_active_sch_subtab');
      if (savedSchSub && (savedSchSub === 'create' || savedSchSub === 'list' || savedSchSub === 'calendar')) {
        this.currentScheduleSubSection = savedSchSub;
      }
      const savedAnalyticsSub = sessionStorage.getItem('fmcu_active_analytics_subtab');
      if (savedAnalyticsSub && (savedAnalyticsSub === 'history' || savedAnalyticsSub === 'performance')) {
        this.currentAnalyticsSubSection = savedAnalyticsSub;
      }
      const savedAdminTab = sessionStorage.getItem('fmcu_active_admin_tab');
      const savedView = sessionStorage.getItem('fmcu_active_view');
      const targetView = (savedView && this.isViewAllowedForUser(savedView, this.currentUser))
        ? savedView
        : this.getFirstAllowedView(this.currentUser);
      this.navigate(targetView, savedAdminTab || null);
    } else {
      this.navigate('home');
    }

    // Aktifkan pemantau Time Session & Tab Close
    this.initSessionMonitor();

    // Bersihkan dummy location GPS agar status actual akurat
    if (window.FMCUData && typeof window.FMCUData.clearDummyBestieLocations === 'function') {
      window.FMCUData.clearDummyBestieLocations();
    }

    // Auto-request Mandatory GPS & Push Notification Permission on load
    this.initMandatoryGpsSystem();
    this.initMandatoryNotificationSystem();

    // Listener visibility tab untuk re-check notifikasi saat kembali ke browser
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkAndDispatchUserVisitNotifications();
      }
    });

    // Jalankan continuous Geofence Ticker setiap 4 detik untuk memantau radius 15m & timer 15m
    if (this._geofenceInterval) clearInterval(this._geofenceInterval);
    this._geofenceInterval = setInterval(() => this.checkAutomaticGeofenceInOut(), 4000);
  },

  // ==========================================================================
  // TIME SESSION & TAB/APP CLOSE MONITOR
  // Otomatis meminta login kembali jika tutup tab / tutup web app / sesi habis
  // ==========================================================================
  initSessionMonitor() {
    // 1. Tandai waktu saat tab atau web app ditutup / di-unload & update status keluar aplikasi
    const markUnload = () => {
      try {
        this.saveCurrentFormDraft();
        sessionStorage.setItem(window.FMCUData.TAB_UNLOAD_KEY, String(Date.now()));
        if (this.currentUser && this.isAuditorUser(this.currentUser)) {
          window.FMCUData.markUserExited(this.currentUser.id);
        }
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

  _cloudDebounceTimer: null,
  onCloudDataUpdated(collectionName) {
    if (collectionName === 'users') {
      const freshSession = window.FMCUData.getSession();
      if (freshSession) {
        this.currentUser = freshSession;
      }
      this.populateHeaderRoleSwitcher();
      this.updateUserHeaderUI();
      // Segera sinkronkan pergerakan pinpoint Bestie di peta
      if (this.homeMap && this.homeBestieLayer) {
        this.renderBestieMarkers(this.homeMap, this.homeBestieLayer);
      }
      if (this.modalMap && this.modalBestieLayer && !document.getElementById('modal-interactive-map')?.classList.contains('hidden')) {
        this.renderBestieMarkers(this.modalMap, this.modalBestieLayer, true);
      }
      if (this.currentView === 'live-maps') {
        this.renderLiveLocView();
      }
    }
    if (collectionName === 'stores') {
      this.populateMasterStoreSelect();
    }
    if (collectionName === 'schedules') {
      this.checkAndDispatchUserVisitNotifications();
    }
    this.updateAdminFirestoreSummary();

    // Debounce rendering agar jika Firestore mengirim multi-snapshot sekaligus saat startup,
    // browser tidak melakukan renderAllViews berkali-kali berturut-turut.
    if (this._cloudDebounceTimer) {
      clearTimeout(this._cloudDebounceTimer);
    }
    this._cloudDebounceTimer = setTimeout(() => {
      this.renderCurrentActiveView();
    }, 150);
  },

  renderCurrentActiveView() {
    const v = this.currentView || 'home';
    if (v === 'home') {
      this.renderHomeView();
    } else if (v === 'analytics') {
      this.renderAnalyticsView();
    } else if (v === 'preview') {
      this.renderPreviewView();
    } else if (v === 'schedules' || v === 'stores' || v === 'admin') {
      this.renderAdminView();
    } else if (v === 'live-maps') {
      this.renderLiveLocView();
    }
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
              this.updateHoldingTimeBadges();
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
      // Toast lokasi GPS aktif di welcome login dihilangkan per instruksi user
      if (!this.currentUser) {
        this.triggerMobileAuthSplash();
      }
      setTimeout(() => {
        if (this.homeMap) this.homeMap.invalidateSize();
      }, 250);
      this.initMandatoryNotificationSystem();
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
  // MANDATORY PUSH NOTIFICATION SYSTEM (DESKTOP & MOBILE)
  // Memaksa browser mengizinkan push notifikasi sebelum web dapat diakses,
  // dan mengirimkan notifikasi status visit aktif, pending, terlewat, & jadwal baru
  // ==========================================================================
  initMandatoryNotificationSystem() {
    // 1. Cek dukungan Web Notification API
    if (!('Notification' in window)) {
      console.warn('Browser tidak mendukung Web Notifications API.');
      this.isNotificationUnlocked = true;
      this.unlockNotificationGate();
      return;
    }

    // 2. Registrasi Service Worker sw.js untuk notifikasi mobile & desktop
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('sw.js')
        .then((reg) => {
          this.swRegistration = reg;
        })
        .catch((err) => {
          console.warn('Gagal registrasi sw.js:', err);
        });
    }

    // 3. Pantau perubahan status izin secara real-time via Permissions API jika tersedia
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'notifications' })
        .then((permStatus) => {
          permStatus.onchange = () => {
            if (permStatus.state === 'granted') {
              this.isNotificationUnlocked = true;
              this.unlockNotificationGate();
              this.checkAndDispatchUserVisitNotifications(true);
              this.startNotificationInterval();
            } else if (permStatus.state === 'denied') {
              this.isNotificationUnlocked = false;
              this.lockWebForNotification(
                'Izin notifikasi diblokir di setelan browser. Klik ikon gembok/setelan situs di browser, ubah Notifikasi menjadi Izinkan, lalu muat ulang halaman.'
              );
            }
          };
        })
        .catch(() => {});
    }

    // 4. Evaluasi izin notifikasi saat ini
    if (Notification.permission === 'granted') {
      this.isNotificationUnlocked = true;
      this.unlockNotificationGate();
      this.checkAndDispatchUserVisitNotifications();
      this.startNotificationInterval();
    } else if (Notification.permission === 'denied') {
      this.isNotificationUnlocked = false;
      this.lockWebForNotification(
        'Izin notifikasi diblokir di browser Anda. Klik ikon Gembok / Setelan Situs di samping URL browser, ubah Notifikasi menjadi Allow (Izinkan), lalu muat ulang halaman.'
      );
    } else {
      // Status 'default': Kunci web sampai user menekan tombol izin notifikasi
      this.isNotificationUnlocked = false;
      this.lockWebForNotification();
    }
  },

  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      this.isNotificationUnlocked = true;
      this.unlockNotificationGate();
      this.showToast('Browser ini tidak mendukung Push Notifikasi.', 'info');
      return;
    }

    const btn = document.getElementById('btn-request-notif');
    const errBox = document.getElementById('notif-gate-error-box');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Meminta Izin Notifikasi...</span>`;
    }
    if (errBox) errBox.classList.add('hidden');

    try {
      if ('serviceWorker' in navigator && !this.swRegistration) {
        try {
          this.swRegistration = await navigator.serviceWorker.register('sw.js');
        } catch (e) {}
      }

      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        this.isNotificationUnlocked = true;
        this.unlockNotificationGate();
        this.showToast('Push notifikasi berhasil diaktifkan!', 'success');
        this.dispatchPushNotification(
          '🔔 Notifikasi FMCU Aktif',
          'Sistem siap mengirimkan pengingat kunjungan, jadwal pending, dan tugas baru secara real-time.',
          'notif-welcome'
        );
        this.checkAndDispatchUserVisitNotifications(true);
        this.startNotificationInterval();
      } else if (permission === 'denied') {
        this.isNotificationUnlocked = false;
        this.lockWebForNotification(
          'Izin notifikasi ditolak. Web tidak dapat diakses tanpa izin notifikasi. Silakan buka setelan browser dan ubah izin notifikasi menjadi Allow / Izinkan.'
        );
      } else {
        this.isNotificationUnlocked = false;
        this.lockWebForNotification('Harap setujui permintaan izin notifikasi untuk melanjutkan ke aplikasi.');
      }
    } catch (err) {
      console.warn('Gagal meminta izin notifikasi:', err);
      this.lockWebForNotification('Gagal meminta izin notifikasi: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-bell"></i><span>Izinkan & Aktifkan Notifikasi Sekarang</span>`;
      }
    }
  },

  unlockNotificationGate() {
    const gate = document.getElementById('notification-gate-screen');
    if (gate) gate.classList.add('hidden');
  },

  lockWebForNotification(reasonText = '') {
    const gate = document.getElementById('notification-gate-screen');
    if (gate) gate.classList.remove('hidden');
    const errBox = document.getElementById('notif-gate-error-box');
    const errDetail = document.getElementById('notif-gate-error-detail');
    if (reasonText && errBox && errDetail) {
      errDetail.textContent = reasonText;
      errBox.classList.remove('hidden');
    } else if (errBox) {
      errBox.classList.add('hidden');
    }
  },

  startNotificationInterval() {
    if (this._notifCheckInterval) clearInterval(this._notifCheckInterval);
    // Jalankan interval pemantauan status jadwal & visit tiap 10 menit
    this._notifCheckInterval = setInterval(() => {
      this.checkAndDispatchUserVisitNotifications();
    }, 10 * 60 * 1000);
  },

  async dispatchPushNotification(title, body, tag = 'fmcu-notif', data = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const icon = 'icon-192.png';
    const badge = 'favicon-32x32.png';
    const options = {
      body,
      icon,
      badge,
      tag,
      renotify: true,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: { url: window.location.href, ...data }
    };

    // 1. Coba melalui Service Worker (metode utama untuk Android Mobile & Chromium)
    try {
      if (this.swRegistration && this.swRegistration.showNotification) {
        await this.swRegistration.showNotification(title, options);
        return;
      }
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          this.swRegistration = reg;
          await reg.showNotification(title, options);
          return;
        }
      }
    } catch (e) {
      console.warn('SW showNotification fallback:', e);
    }

    // 2. Fallback standar Notification constructor (Desktop)
    try {
      const notif = new Notification(title, options);
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (err) {
      console.warn('Notification constructor error:', err);
    }
  },

  checkAndDispatchUserVisitNotifications(forceCheck = false) {
    if (!this.currentUser) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Throttle check agar tidak memborbardir notifikasi berulang kali dalam jeda singkat (< 5 menit)
    const now = Date.now();
    const lastCheck = Number(sessionStorage.getItem('fmcu_last_notif_check_ts') || 0);
    if (!forceCheck && now - lastCheck < 5 * 60 * 1000) {
      return;
    }
    sessionStorage.setItem('fmcu_last_notif_check_ts', String(now));

    const schedules = window.FMCUData.getSchedules();
    const reports = window.FMCUData.getReports();
    const todayStr = this.getLocalDateISO();
    const mySchedules = schedules.filter((s) => this.isScheduleOwnedByUser(s, this.currentUser));

    // 1. Notifikasi Status Visit yang Belum Selesai (Active Check-In / In-Progress Form)
    const activeCheckIn = window.FMCUData.getActiveCheckIn();
    if (activeCheckIn && activeCheckIn.storeCode) {
      const isCompleted = reports.some(
        (r) => r.storeCode === activeCheckIn.storeCode && r.visitDate === todayStr
      );
      if (!isCompleted) {
        this.dispatchPushNotification(
          `⚠️ Visit Belum Selesai: FamilyMart ${activeCheckIn.storeName || activeCheckIn.storeCode}`,
          `Sesi visit Anda saat ini masih aktif. Pastikan data form, foto QSC, dan observasi dikirimkan sebelum meninggalkan toko.`,
          `visit-active-${activeCheckIn.storeCode}`
        );
      }
    }

    // 2. Notifikasi Jadwal Pending Hari Ini
    const myPendingToday = mySchedules.filter((s) => {
      const hasReport = s.reportId || reports.some((r) => r.storeCode === s.storeCode && r.visitDate === s.scheduledDate);
      return s.scheduledDate === todayStr && s.status !== 'COMPLETED' && !hasReport;
    });

    if (myPendingToday.length > 0) {
      const storeNames = myPendingToday.map((s) => s.storeName).slice(0, 3).join(', ');
      const extra = myPendingToday.length > 3 ? ` (+${myPendingToday.length - 3} lainnya)` : '';
      this.dispatchPushNotification(
        `📅 ${myPendingToday.length} Jadwal Visit Pending Hari Ini`,
        `Toko: ${storeNames}${extra}. Segera lakukan check-in dan mulai kunjungan.`,
        `pending-today-${todayStr}`
      );
    }

    // 3. Notifikasi Jadwal Terlewat (Overdue / Missed Schedules)
    const myOverdue = mySchedules.filter((s) => {
      const isPast = String(s.scheduledDate || '') < todayStr;
      const hasReport = s.reportId || reports.some((r) => r.storeCode === s.storeCode && r.visitDate === s.scheduledDate);
      return isPast && s.status !== 'COMPLETED' && !hasReport;
    });

    if (myOverdue.length > 0) {
      const overdueNames = myOverdue.map((s) => `${s.storeName} (${s.scheduledDate})`).slice(0, 2).join(', ');
      const extra = myOverdue.length > 2 ? ` (+${myOverdue.length - 2} lainnya)` : '';
      this.dispatchPushNotification(
        `⏰ ${myOverdue.length} Jadwal Visit Terlewat`,
        `Terdapat jadwal yang belum selesai: ${overdueNames}${extra}. Harap segera periksa status kunjungan Anda.`,
        `overdue-schedules`
      );
    }

    // 4. Notifikasi Penugasan Jadwal Baru
    const storageKey = `fmcu_known_schedules_${this.currentUser.id || this.currentUser.username || 'usr'}`;
    const knownIds = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const currentIds = mySchedules.map((s) => s.id);

    if (knownIds.length > 0) {
      const newlyAssigned = mySchedules.filter(
        (s) => !knownIds.includes(s.id) && String(s.scheduledDate || '') >= todayStr
      );
      if (newlyAssigned.length > 0) {
        const newStoreNames = newlyAssigned.map((s) => s.storeName).slice(0, 2).join(', ');
        this.dispatchPushNotification(
          `🆕 ${newlyAssigned.length} Penugasan Jadwal Visit Baru`,
          `Anda mendapatkan jadwal kunjungan baru: ${newStoreNames}. Buka menu Jadwal untuk melihat detailnya.`,
          `new-schedule-${newlyAssigned[0].id}`
        );
      }
    }
    localStorage.setItem(storageKey, JSON.stringify(currentIds));
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
    const uInput = (document.getElementById('login-username')?.value || '').trim().toLowerCase();
    const pInput = (document.getElementById('login-password')?.value || '').trim();
    const users = window.FMCUData.getUsers();

    if (!uInput) {
      const errEl = document.getElementById('login-error');
      if (errEl) {
        errEl.textContent = 'Silakan pilih Nama Karyawan terlebih dahulu.';
        errEl.classList.remove('hidden');
      }
      this.openCustomUserDropdown();
      return;
    }

    const found = users.find(
      (u) =>
        (String(u.username || '').toLowerCase() === uInput ||
          (u.nik && String(u.nik).toLowerCase() === uInput) ||
          (u.email && u.email.toLowerCase() === uInput) ||
          (u.name && String(u.name).toLowerCase() === uInput)) &&
        (String(u.password || '') === pInput || (u.nik && String(u.nik) === pInput))
    );

    const errEl = document.getElementById('login-error');
    if (!found) {
      errEl.textContent = 'NIK Karyawan atau Password tidak sesuai.';
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
    this.checkAndDispatchUserVisitNotifications(true);

    // Prioritaskan savedView jika masih valid untuk role baru, atau ambil default role
    const savedView = sessionStorage.getItem('fmcu_active_view');
    const allowedView = (savedView && this.isViewAllowedForUser(savedView, user))
      ? savedView
      : this.getFirstAllowedView(user);
    const savedAdminTab = sessionStorage.getItem('fmcu_active_admin_tab');
    this.navigate(allowedView, savedAdminTab || null);
  },

  logout(reasonMsg = '', skipConfirm = false) {
    if (!skipConfirm && !reasonMsg) {
      const confirmLogout = confirm('Apakah Anda yakin ingin keluar dari akun aplikasi FMCU Visit Report?');
      if (!confirmLogout) return;
    }
    if (this.currentUser && this.isAuditorUser(this.currentUser)) {
      window.FMCUData.markUserExited(this.currentUser.id);
    }
    window.FMCUData.setSession(null);
    this.currentUser = null;
    this.closeModal('modal-user-profile');
    this.updateSidebarAuthoritiesUI();

    try {
      sessionStorage.removeItem('fmcu_active_view');
      sessionStorage.removeItem('fmcu_active_subtab');
      sessionStorage.removeItem('fmcu_active_sch_subtab');
      sessionStorage.removeItem('fmcu_active_admin_tab');
      sessionStorage.removeItem('fmcu_active_analytics_subtab');
      sessionStorage.removeItem('fmcu_active_home_subtab');
    } catch (e) {}
    this.currentView = 'home';

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
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      this.focusLoginNikInput();
    }
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
    this.focusLoginNikInput();
  },

  focusLoginNikInput() {
    setTimeout(() => {
      const authScreen = document.getElementById('auth-screen');
      if (authScreen && !authScreen.classList.contains('hidden')) {
        const customBtn = document.getElementById('custom-user-select-btn');
        if (customBtn) {
          try {
            customBtn.focus({ preventScroll: true });
          } catch (e) {
            customBtn.focus();
          }
          return;
        }
        const nikInput = document.getElementById('login-username');
        if (nikInput) {
          try {
            nikInput.focus({ preventScroll: true });
          } catch (e) {
            nikInput.focus();
          }
        }
      }
    }, 120);
  },

  // ==========================================================================
  // SECRET SUPER ADMIN ACCESS (10x Tap on Login Title + PIN 607090)
  // ==========================================================================
  _secretTapCount: 0,
  _secretTapTimer: null,

  handleSecretTitleTap(event) {
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    this._secretTapCount = (this._secretTapCount || 0) + 1;
    if (this._secretTapTimer) {
      clearTimeout(this._secretTapTimer);
    }
    this._secretTapTimer = setTimeout(() => {
      this._secretTapCount = 0;
    }, 4000);

    if (this._secretTapCount >= 10) {
      this._secretTapCount = 0;
      if (this._secretTapTimer) {
        clearTimeout(this._secretTapTimer);
        this._secretTapTimer = null;
      }
      this.openSuperAdminPinModal();
    }
  },

  openSuperAdminPinModal() {
    const modal = document.getElementById('modal-superadmin-pin');
    const input = document.getElementById('superadmin-pin-input');
    const errEl = document.getElementById('superadmin-pin-error');
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }
    if (input) {
      input.value = '';
    }
    if (modal) {
      modal.classList.remove('hidden');
    }
    setTimeout(() => {
      if (input) input.focus();
    }, 80);
  },

  closeSuperAdminPinModal() {
    const modal = document.getElementById('modal-superadmin-pin');
    const input = document.getElementById('superadmin-pin-input');
    const errEl = document.getElementById('superadmin-pin-error');
    if (modal) modal.classList.add('hidden');
    if (input) input.value = '';
    if (errEl) errEl.classList.add('hidden');
  },

  handleSuperAdminPinSubmit(event) {
    if (event) event.preventDefault();
    const input = document.getElementById('superadmin-pin-input');
    const errEl = document.getElementById('superadmin-pin-error');
    const pin = (input?.value || '').trim();

    if (pin !== '607090') {
      if (errEl) {
        errEl.textContent = 'PIN Otoritas Super Admin tidak sesuai!';
        errEl.classList.remove('hidden');
      }
      if (input) {
        input.value = '';
        input.focus();
      }
      return;
    }

    const users = window.FMCUData.getUsers();
    const superAdmin =
      users.find((u) => u.role === 'SUPER_ADMIN') ||
      (window.FMCUData.DEFAULT_USERS && window.FMCUData.DEFAULT_USERS[0]);

    if (!superAdmin) return;

    this.closeSuperAdminPinModal();
    this.setLoggedInUser(superAdmin);
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.classList.add('hidden');
    this.showToast(`Akses Rahasia Super Admin dibuka: ${superAdmin.name}`, 'success');
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
    // Admin Jadwal & Super Admin default mendarat di Atur Jadwal Visit
    if (user.role === 'ADMIN_SCHEDULE' || user.role === 'SUPER_ADMIN') {
      if (this.hasAuthority('manage_schedule', user)) return 'schedules';
      if (this.hasAuthority('manage_stores', user)) return 'stores';
      if (this.hasPortalAdminAuthority(user)) return 'admin';
    }
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
    const canLiveMaps = this.canAccessLiveMaps(u);

    const togglePair = (desktopId, mobileId, allowed) => {
      const dEl = document.getElementById(desktopId);
      const mEl = document.getElementById(mobileId);
      if (dEl) dEl.classList.toggle('hidden', !allowed);
      if (mEl) mEl.classList.toggle('hidden', !allowed);
    };

    const isSuperAdmin = Boolean(u && (u.role === 'SUPER_ADMIN' || u.username === 'admin'));

    // 1. Sidebar & Mobile Bottom Nav Buttons (Muncul sesuai otoritas masing-masing)
    togglePair('nav-home', 'mnav-home', canHome);
    togglePair('nav-analytics', 'mnav-analytics', canAnalytics);
    togglePair('nav-form', 'mnav-form', canForm);
    togglePair('nav-preview', 'mnav-preview', canPreview);
    togglePair('nav-schedules', 'mnav-schedules', canSchedules);
    togglePair('nav-stores', 'mnav-stores', canStores);
    togglePair('nav-admin', 'mnav-admin', canPortalAdmin);
    togglePair('nav-live-maps', 'mnav-live-maps', canLiveMaps);
    togglePair('nav-news', 'mnav-news', isSuperAdmin);

    // 2. Portal Admin Sub-Tab Buttons (User, News & Integrasi)
    const adminTabMap = [
      { tab: 'users', auth: 'manage_users' },
      { tab: 'news', isSuper: true },
      { tab: 'integrations', auth: 'manage_integrations' }
    ];
    adminTabMap.forEach(({ tab, auth, isSuper }) => {
      const btn = document.getElementById(`admin-tab-btn-${tab}`);
      if (btn) {
        if (isSuper) {
          btn.classList.toggle('hidden', !isSuperAdmin);
        } else {
          btn.classList.toggle('hidden', !this.hasAuthority(auth, u));
        }
      }
    });

    // 3. Sembunyikan label "18 Bestie / Visitor" di sisi User Biasa (Hanya tampil bagi Admin)
    const isPrivilegedAdmin = Boolean(
      u && (u.role === 'SUPER_ADMIN' || u.role === 'ADMIN_SCHEDULE' || u.username === 'admin')
    );
    const homeLegendBestie = document.getElementById('home-legend-bestie-count');
    if (homeLegendBestie) homeLegendBestie.classList.toggle('hidden', !isPrivilegedAdmin);

    const modalMapLegendBestie = document.getElementById('modal-map-legend-besties');
    if (modalMapLegendBestie) modalMapLegendBestie.classList.toggle('hidden', !isPrivilegedAdmin);

    const modalMapBtnAllBesties = document.getElementById('modal-map-btn-all-besties');
    if (modalMapBtnAllBesties) modalMapBtnAllBesties.classList.toggle('hidden', !isPrivilegedAdmin);
  },

  toggleAdminWatermarkGps(isChecked) {
    window.FMCUData.saveSettings({ autoWatermarkGps: isChecked });
    const watermarkBadge = document.getElementById('badge-admin-watermark');
    if (watermarkBadge) {
      watermarkBadge.textContent = isChecked ? 'ON' : 'OFF';
      watermarkBadge.className = isChecked
        ? 'text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 leading-none'
        : 'text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 leading-none';
    }
    const adminSetToggle = document.getElementById('set-auto-watermark-gps');
    if (adminSetToggle) adminSetToggle.checked = isChecked;
    this.showToast(`Watermark GPS & Timestamp foto ${isChecked ? 'diaktifkan (ON)' : 'dinonaktifkan (OFF)'}.`, isChecked ? 'success' : 'info');
  },


  // ==========================================================================
  // CUSTOM USER DROPDOWN (SMOOTH & INTERACTIVE UI - TANPA NATIVE OS PICKER HP)
  // ==========================================================================
  setupCustomUserSelectListeners() {
    if (this._customUserSelectListenerBound) return;
    this._customUserSelectListenerBound = true;

    document.addEventListener('click', (e) => {
      const container = document.getElementById('custom-user-select-container');
      if (container && !container.contains(e.target)) {
        this.closeCustomUserDropdown();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeCustomUserDropdown();
      }
    });
  },

  populateCustomUserDropdown() {
    const users = window.FMCUData.getUsers();
    const visibleLoginUsers = users
      .filter((u) => u.role !== 'SUPER_ADMIN')
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' }));

    this._cachedLoginUsers = visibleLoginUsers;
    this.renderCustomUserOptions(visibleLoginUsers);

    // Update count label
    const countEl = document.getElementById('custom-user-count-label');
    if (countEl) {
      countEl.textContent = `${visibleLoginUsers.length} Karyawan Terdaftar`;
    }

    // Set initial selection
    const backingInput = document.getElementById('login-username');
    const currentVal = backingInput ? backingInput.value : '';
    if (currentVal && visibleLoginUsers.some((u) => u.username === currentVal || u.nik === currentVal)) {
      this.selectCustomUser(currentVal, false);
    } else if (visibleLoginUsers.length > 0 && !currentVal) {
      this.selectCustomUser(visibleLoginUsers[0].username, false);
    }
  },

  renderCustomUserOptions(list, query = '') {
    const container = document.getElementById('custom-user-options-list');
    if (!container) return;

    if (!list || list.length === 0) {
      container.innerHTML = `
        <div class="py-6 px-4 text-center text-slate-400">
          <i class="fa-solid fa-user-slash text-2xl mb-1.5 text-slate-300"></i>
          <div class="text-xs font-bold text-slate-600">Karyawan tidak ditemukan</div>
          <div class="text-[11px] text-slate-400 mt-0.5">Coba gunakan kata kunci nama atau NIK lain</div>
        </div>
      `;
      return;
    }

    const backingInput = document.getElementById('login-username');
    const currentVal = backingInput ? backingInput.value : '';

    const html = list
      .map((u) => {
        const isSelected = u.username === currentVal || (u.nik && u.nik === currentVal);
        const nameParts = (u.name || '').trim().split(' ').filter(Boolean);
        const initials = nameParts.slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'FM';

        return `
          <button
            type="button"
            onclick="FMCUApp.selectCustomUser('${u.username}')"
            class="w-full text-left p-2 sm:p-2.5 rounded-xl flex items-center justify-between gap-2.5 transition-all duration-150 cursor-pointer select-none ${
              isSelected
                ? 'bg-emerald-50/90 border border-emerald-300/80 shadow-sm'
                : 'hover:bg-slate-100/80 active:bg-slate-200/60 border border-transparent'
            }"
            style="touch-action: manipulation;"
          >
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <div class="w-8 h-8 rounded-full ${
                isSelected
                  ? 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-sm ring-2 ring-emerald-300'
                  : 'bg-emerald-100/80 text-emerald-800'
              } flex items-center justify-center font-extrabold text-[11px] shrink-0 tracking-wider">
                ${initials}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-xs sm:text-sm font-bold ${isSelected ? 'text-emerald-950' : 'text-slate-800'} truncate">
                  ${u.name}
                </div>
              </div>
            </div>
            ${
              isSelected
                ? '<i class="fa-solid fa-circle-check text-emerald-600 text-base shrink-0 ml-1"></i>'
                : '<i class="fa-solid fa-chevron-right text-slate-300 text-xs shrink-0 ml-1 opacity-0 group-hover:opacity-100"></i>'
            }
          </button>
        `;
      })
      .join('');

    container.innerHTML = html;
  },

  toggleCustomUserDropdown() {
    const menu = document.getElementById('custom-user-dropdown-menu');
    if (!menu) return;
    if (menu.classList.contains('hidden')) {
      this.openCustomUserDropdown();
    } else {
      this.closeCustomUserDropdown();
    }
  },

  openCustomUserDropdown() {
    const container = document.getElementById('custom-user-select-container');
    const menu = document.getElementById('custom-user-dropdown-menu');
    const btn = document.getElementById('custom-user-select-btn');
    const arrow = document.getElementById('custom-user-select-arrow');
    const searchInput = document.getElementById('custom-user-search-input');
    if (!menu) return;

    if (container) container.classList.add('is-open');
    menu.classList.remove('hidden');
    requestAnimationFrame(() => {
      menu.classList.remove('scale-95', 'opacity-0');
      menu.classList.add('scale-100', 'opacity-100');
    });

    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
      btn.classList.add('border-emerald-500', 'ring-2', 'ring-emerald-500/20');
    }
    if (arrow) {
      arrow.classList.add('rotate-180', 'text-emerald-600');
    }

    if (searchInput) {
      searchInput.value = '';
      const clearBtn = document.getElementById('custom-user-search-clear');
      if (clearBtn) clearBtn.classList.add('hidden');
      setTimeout(() => {
        try {
          searchInput.focus({ preventScroll: true });
        } catch (e) {
          searchInput.focus();
        }
      }, 60);
    }

    if (this._cachedLoginUsers) {
      this.renderCustomUserOptions(this._cachedLoginUsers);
    }
  },

  closeCustomUserDropdown() {
    const container = document.getElementById('custom-user-select-container');
    const menu = document.getElementById('custom-user-dropdown-menu');
    const btn = document.getElementById('custom-user-select-btn');
    const arrow = document.getElementById('custom-user-select-arrow');
    if (!menu || menu.classList.contains('hidden')) return;

    if (container) container.classList.remove('is-open');
    menu.classList.remove('scale-100', 'opacity-100');
    menu.classList.add('scale-95', 'opacity-0');

    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('border-emerald-500', 'ring-2', 'ring-emerald-500/20');
    }
    if (arrow) {
      arrow.classList.remove('rotate-180', 'text-emerald-600');
    }

    setTimeout(() => {
      menu.classList.add('hidden');
    }, 150);
  },

  selectCustomUser(username, shouldFocusPassword = true) {
    if (!this._cachedLoginUsers) {
      this._cachedLoginUsers = window.FMCUData.getUsers().filter((u) => u.role !== 'SUPER_ADMIN');
    }
    const user = this._cachedLoginUsers.find((u) => u.username === username || u.nik === username);
    if (!user) return;

    const backingInput = document.getElementById('login-username');
    if (backingInput) {
      backingInput.value = user.username;
    }

    const nameEl = document.getElementById('custom-user-selected-name');
    const avatarEl = document.getElementById('custom-user-selected-avatar');

    if (nameEl) nameEl.textContent = user.name;
    if (avatarEl) {
      const nameParts = (user.name || '').trim().split(' ').filter(Boolean);
      const initials = nameParts.slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'FM';
      avatarEl.innerHTML = `<span class="font-extrabold text-[11px] tracking-wider">${initials}</span>`;
    }

    this.closeCustomUserDropdown();

    if (this._cachedLoginUsers) {
      this.renderCustomUserOptions(this._cachedLoginUsers);
    }

    if (shouldFocusPassword) {
      setTimeout(() => {
        const passInput = document.getElementById('login-password');
        if (passInput) {
          try {
            passInput.focus({ preventScroll: true });
          } catch (e) {
            passInput.focus();
          }
        }
      }, 100);
    }
  },

  filterCustomUserDropdown(query) {
    const q = (query || '').trim().toLowerCase();
    const clearBtn = document.getElementById('custom-user-search-clear');
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', !q);
    }

    if (!this._cachedLoginUsers) {
      this._cachedLoginUsers = window.FMCUData.getUsers()
        .filter((u) => u.role !== 'SUPER_ADMIN')
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' }));
    }

    const filtered = this._cachedLoginUsers.filter((u) => {
      const name = String(u.name || '').toLowerCase();
      const nik = String(u.nik || '').toLowerCase();
      const jabatan = String(u.jabatan || u.roleBadge || '').toLowerCase();
      return name.includes(q) || nik.includes(q) || jabatan.includes(q);
    });

    this.renderCustomUserOptions(filtered, q);
  },

  clearCustomUserSearch() {
    const searchInput = document.getElementById('custom-user-search-input');
    if (searchInput) {
      searchInput.value = '';
      this.filterCustomUserDropdown('');
      try {
        searchInput.focus({ preventScroll: true });
      } catch (e) {
        searchInput.focus();
      }
    }
  },

  populateHeaderRoleSwitcher() {
    const users = window.FMCUData.getUsers();

    // 1. Populate Custom User Dropdown UI (#custom-user-select-container)
    this.populateCustomUserDropdown();

    // Backward compatibility if select exists
    const loginInput = document.getElementById('login-username');
    if (loginInput && loginInput.tagName === 'SELECT') {
      const visibleLoginUsers = users
        .filter((u) => u.role !== 'SUPER_ADMIN')
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' }));
      const newHtml =
        `<option value="">-- Pilih Nama User --</option>` +
        visibleLoginUsers.map((u) => `<option value="${u.username}">${u.name}</option>`).join('');
      if (loginInput.innerHTML !== newHtml) {
        loginInput.innerHTML = newHtml;
      }
    }

    // 2. Populate Header Role Switcher (if present) - Diurutkan Abjad A-Z
    const sel = document.getElementById('header-role-switcher');
    if (!sel) return;
    const sortedUsers = [...users].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' })
    );
    const newHeaderHtml =
      sortedUsers
        .map(
          (u) =>
            `<option value="${u.id}" ${this.currentUser && this.currentUser.id === u.id ? 'selected' : ''}>👤 ${u.name} (${u.role === 'SUPER_ADMIN' ? 'Admin' : u.role === 'ADMIN_SCHEDULE' ? 'Admin Jadwal' : 'Visitor'})</option>`
        )
        .join('') + `<option value="__LOGOUT__">🚪 Ganti Login / Keluar...</option>`;
    if (sel.innerHTML !== newHeaderHtml) {
      sel.innerHTML = newHeaderHtml;
    }
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

    // Auto-save form draft jika visitor berpindah dari halaman Form
    if (this.currentView === 'form' && viewName !== 'form') {
      this.saveCurrentFormDraft();
    }

    if (viewName === 'schedules' && !this.hasAuthority('manage_schedule')) {
      this.showToast('Akun Anda tidak memiliki otoritas untuk mengakses Atur Jadwal Visit.', 'warning');
      return;
    }
    if (viewName === 'stores' && !this.hasAuthority('manage_stores')) {
      this.showToast('Akun Anda tidak memiliki otoritas untuk mengakses Master Toko.', 'warning');
      return;
    }
    if (viewName === 'live-maps' && !this.canAccessLiveMaps()) {
      this.showToast('Halaman Live Loc Maps khusus untuk Admin Jadwal dan Super Admin.', 'warning');
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
    try {
      sessionStorage.setItem('fmcu_active_view', viewName);
      if (subTab) {
        sessionStorage.setItem('fmcu_active_subtab', subTab);
      } else {
        sessionStorage.removeItem('fmcu_active_subtab');
      }
    } catch (e) {}
    const isAdminContainerView = viewName === 'admin' || viewName === 'schedules' || viewName === 'stores';
    const mainSections = ['home', 'analytics', 'form', 'preview', 'admin', 'live-maps'];
    mainSections.forEach((sec) => {
      const mainEl = document.getElementById(`view-${sec}`);
      if (!mainEl) return;
      if (sec === 'admin') {
        mainEl.classList.toggle('hidden', !isAdminContainerView);
      } else {
        mainEl.classList.toggle('hidden', sec !== viewName);
      }
    });

    const navKeys = ['home', 'analytics', 'form', 'preview', 'schedules', 'stores', 'admin', 'live-maps', 'news'];
    navKeys.forEach((k) => {
      const dNav = document.getElementById(`nav-${k}`);
      if (dNav) {
        if (k === 'news') {
          dNav.classList.toggle('active', viewName === 'admin' && this.currentAdminTab === 'news');
        } else if (k === 'admin') {
          dNav.classList.toggle('active', viewName === 'admin' && this.currentAdminTab !== 'news');
        } else {
          dNav.classList.toggle('active', k === viewName);
        }
      }
      const mNav = document.getElementById(`mnav-${k}`);
      if (mNav) {
        if (k === 'news') {
          mNav.classList.toggle('active', viewName === 'admin' && this.currentAdminTab === 'news');
        } else if (k === 'admin') {
          mNav.classList.toggle('active', viewName === 'admin' && this.currentAdminTab !== 'news');
        } else {
          mNav.classList.toggle('active', k === viewName);
        }
      }
    });

    const titles = {
      home: ['Home', ''],
      analytics: ['Analitik Performa', ''],
      form: ['Form Visit Store', ''],
      preview: ['Preview PDF', ''],
      schedules: ['Atur Jadwal Visit', ''],
      stores: ['Master Data Toko', ''],
      admin: ['Portal Admin', ''],
      'live-maps': ['Live Loc Maps', '']
    };

    const [t, sub] = titles[viewName] || titles.home;
    const titleEl = document.getElementById('header-page-title');
    if (titleEl) titleEl.textContent = t;
    const subEl = document.getElementById('header-page-subtitle');
    if (subEl) {
      subEl.textContent = sub || '';
      subEl.classList.toggle('hidden', !sub);
    }
    this.triggerHaptic('light');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Toggle Tombol Home di Header (HANYA tampil saat di Form Visit)
    const headerHomeBtn = document.getElementById('header-home-btn');
    if (headerHomeBtn) {
      headerHomeBtn.classList.toggle('hidden', viewName !== 'form');
    }

    // Toggle Tombol Standar Holding Time di Header (HANYA tampil saat di Form Visit)
    const holdingBtn = document.getElementById('header-holding-time-btn');
    if (holdingBtn) {
      if (viewName === 'form') {
        holdingBtn.classList.remove('hidden');
        holdingBtn.classList.add('inline-flex');
        const st = window.FMCUData?.getHoldingTimeStandards?.() || window.FMCU_HOLDING_TIME_R23;
        const badge = document.getElementById('header-holding-badge');
        if (badge && st?.revision) badge.textContent = st.revision;
      } else {
        holdingBtn.classList.add('hidden');
        holdingBtn.classList.remove('inline-flex');
      }
    }

    // Toggle Floating Action Buttons di Form (Hanya tampil di Form Visit)
    if (viewName !== 'form') {
      const fabObs = document.getElementById('floating-obs-actions');
      if (fabObs) fabObs.classList.add('hidden');
      const fabEv = document.getElementById('floating-evidence-actions');
      if (fabEv) fabEv.classList.add('hidden');
    }

    if (viewName === 'home') {
      this.renderHomeView();
      setTimeout(() => {
        if (this.homeMap) this.homeMap.invalidateSize();
      }, 200);
    } else if (viewName === 'analytics') {
      this.renderAnalyticsView();
    } else if (viewName === 'form') {
      const isVisitor = this.isAuditorUser(this.currentUser) || !this.hasAuthority('manage_schedule');
      const activeCheckIn = window.FMCUData.getActiveCheckIn();
      const todayStr = this.getLocalDateISO();

      if (!activeCheckIn?.isArchivedView && isVisitor && activeCheckIn && activeCheckIn.scheduleId) {
        const sch = window.FMCUData.getSchedules().find((s) => s.id === activeCheckIn.scheduleId);
        const isCompleted = sch && (sch.status === 'COMPLETED' || sch.reportId);
        if (!isCompleted && sch && sch.scheduledDate && sch.scheduledDate !== todayStr) {
          window.FMCUData.setActiveCheckIn(null);
          this.hasActiveStoreForm = false;
          this.showToast(
            `Jadwal visit aktif sebelumnya bukan untuk hari ini. Silakan buka jadwal visit hari ini (${window.FMCUPdf.formatIndonesianDate(todayStr, true)}).`,
            'warning'
          );
          this.navigate('home');
          return;
        }
      }
      this.updateFormGuardVisibility();
      this.switchFormSection(this.currentFormSection || 1, false);
    } else if (viewName === 'preview') {
      if (this.currentView === 'form' && this.hasActiveStoreForm) {
        this.activePreviewReportId = '__LIVE_FORM__';
      }
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
      const isSuperAdmin = Boolean(this.currentUser && (this.currentUser.role === 'SUPER_ADMIN' || this.currentUser.username === 'admin'));
      const defaultPortalTab = this.hasAuthority('manage_users') ? 'users' : 'integrations';
      const targetTab = subTab && (subTab === 'users' || subTab === 'integrations' || (subTab === 'news' && isSuperAdmin)) ? subTab : defaultPortalTab;
      this.switchAdminTab(targetTab);
      this.renderAdminView();
    } else if (viewName === 'live-maps') {
      this.renderLiveLocView();
      setTimeout(() => {
        if (this.liveLocMap) this.liveLocMap.invalidateSize();
      }, 200);
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

  autoExpandTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 42) + 'px';
  },

  switchFormSection(secNum, scrollTop = true) {
    this.triggerHaptic('light');
    const targetSec = Number(secNum) || 1;
    if (targetSec >= 4) {
      this.handleSaveAndPreview();
      return;
    }
    this.updateFormProgress();
    this.saveCurrentFormDraft();
    this.currentFormSection = targetSec;

    // Auto-fill nama visitor jika masih kosong
    if (targetSec === 1) {
      const audInput = document.getElementById('form-auditor-name');
      if (audInput && !audInput.value.trim() && this.currentUser) {
        audInput.value = this.currentUser.name || this.currentUser.username || '';
      }
    }

    // Tampilkan top banner Geofence Radar HANYA di Section 1 dan Section 4
    const topBanner = document.getElementById('form-top-geofence-banner');
    if (topBanner) {
      topBanner.classList.toggle('hidden', !(targetSec === 1 || targetSec === 4));
    }

    // Floating action button bar for Observation (HANYA tampil di Section 2: Observation)
    // Floating action button bar for Observation (HANYA tampil di Section 2: Observation)
    const fabObs = document.getElementById('floating-obs-actions');
    if (fabObs) {
      fabObs.classList.toggle('hidden', targetSec !== 2);
    }

    // Floating action button bar for Evidence (HANYA tampil di Section 3: Evidence)
    const fabEvidence = document.getElementById('floating-evidence-actions');
    if (fabEvidence) {
      fabEvidence.classList.toggle('hidden', targetSec !== 3);
    }

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
    const validModes = ['create', 'calendar', 'list'];
    const mode = validModes.includes(subSec) ? subSec : 'create';
    this.currentScheduleSubSection = mode;
    try {
      sessionStorage.setItem('fmcu_active_sch_subtab', mode);
    } catch (e) {}

    const createSec = document.getElementById('schedule-section-create');
    const calendarSec = document.getElementById('schedule-section-calendar');
    const listSec = document.getElementById('schedule-section-list');
    const btnCreate = document.getElementById('sch-subtab-btn-create');
    const btnCalendar = document.getElementById('sch-subtab-btn-calendar');
    const btnList = document.getElementById('sch-subtab-btn-list');
    const countPill = document.getElementById('admin-schedule-count-pill');

    if (createSec) createSec.classList.toggle('hidden', mode !== 'create');
    if (calendarSec) calendarSec.classList.toggle('hidden', mode !== 'calendar');
    if (listSec) listSec.classList.toggle('hidden', mode !== 'list');

    if (mode === 'create') {
      this.switchScheduleCreateMode('weekly');
    } else if (mode === 'calendar') {
      this.renderAdminCalendarView();
    }

    if (btnCreate) {
      btnCreate.className =
        mode === 'create'
          ? 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer bg-[#009944] text-white shadow-xs whitespace-nowrap'
          : 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer text-slate-700 hover:bg-white whitespace-nowrap';
    }

    if (btnCalendar) {
      btnCalendar.className =
        mode === 'calendar'
          ? 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer bg-amber-600 text-white shadow-xs whitespace-nowrap'
          : 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer text-slate-700 hover:bg-white whitespace-nowrap';
    }

    if (btnList) {
      btnList.className =
        mode === 'list'
          ? 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer bg-[#0099A6] text-white shadow-xs whitespace-nowrap'
          : 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer text-slate-700 hover:bg-white whitespace-nowrap';
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
      const activeCheckIn = window.FMCUData.getActiveCheckIn();
      const storeName = activeCheckIn?.storeName ? `FamilyMart ${activeCheckIn.storeName}` : null;
      const nowMs = Date.now();
      if (!this._lastLocationSyncedAt || nowMs - this._lastLocationSyncedAt > 15000) {
        this._lastLocationSyncedAt = nowMs;
        window.FMCUData.updateUserLocation(
          this.currentUser.id || this.currentUser.username,
          this.liveGps.lat,
          this.liveGps.lng,
          storeName
        );
      }
    }

    this.initOrUpdateHomeMap();
    this.checkAutomaticGeofenceInOut();
  },

  isHomeMapExpanded: false,
  isLiveLocMapExpanded: false,
  modalMap: null,
  modalStoreLayer: null,
  modalBestieLayer: null,
  homeBestieLayer: null,
  modalUserMarker: null,
  _modalStoreMarkerMap: null,
  _modalBestieMarkerMap: null,

  initOrUpdateHomeMap() {
    const mapContainer = document.getElementById('home-live-map');
    if (!mapContainer || typeof L === 'undefined') return;

    const centerLat = this.liveGps.lat !== null ? this.liveGps.lat : -6.2088;
    const centerLng = this.liveGps.lng !== null ? this.liveGps.lng : 106.8456;

    if (!this.homeMap) {
      this.homeMap = L.map('home-live-map', {
        zoomControl: true,
        attributionControl: false
      }).setView([centerLat, centerLng], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(this.homeMap);
    } else if (this.liveGps.lat !== null && !this._userPannedMap) {
      this.homeMap.setView([centerLat, centerLng], this.isHomeMapExpanded ? 13 : 12);
    }

    // Bersihkan marker layer lama jika ada
    if (this.homeStoreLayer) {
      this.homeMap.removeLayer(this.homeStoreLayer);
    }
    this.homeStoreLayer = L.layerGroup().addTo(this.homeMap);

    if (this.homeBestieLayer) {
      this.homeMap.removeLayer(this.homeBestieLayer);
    }
    this.homeBestieLayer = L.layerGroup().addTo(this.homeMap);

    // Ambil Master Toko (pastikan selalu memiliki koordinat)
    let stores = window.FMCUData.getStores();
    if (!stores || stores.length === 0 || !stores.some((s) => s.lat || s.latitude)) {
      stores = Array.isArray(window.FMCU_INITIAL_STORES) ? window.FMCU_INITIAL_STORES : [];
    }

    const activeCheckIn = window.FMCUData.getActiveCheckIn();
    const activeStoreCode = activeCheckIn?.storeCode || null;

    // Render seluruh titik toko FamilyMart
    stores.forEach((st) => {
      const lat = Number(st.lat ?? st.latitude);
      const lng = Number(st.lng ?? st.longitude);
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

      const isTargetActive = activeStoreCode && String(st.code) === String(activeStoreCode);

      const m = L.circleMarker([lat, lng], {
        radius: isTargetActive ? 9 : 6,
        fillColor: isTargetActive ? '#f59e0b' : '#009944',
        color: '#ffffff',
        weight: isTargetActive ? 3 : 2,
        fillOpacity: 0.95
      }).addTo(this.homeStoreLayer);

      // Jika toko aktif, gambarkan lingkaran radius geofence 15m
      if (isTargetActive) {
        L.circle([lat, lng], {
          radius: 15,
          color: '#009944',
          fillColor: '#009944',
          fillOpacity: 0.15,
          weight: 2,
          dashArray: '4, 4'
        }).addTo(this.homeStoreLayer);
      }

      // Jarak dari posisi user
      let distText = '';
      if (this.liveGps.lat !== null && this.liveGps.lng !== null) {
        const d = this.calculateHaversineDistance(this.liveGps.lat, this.liveGps.lng, lat, lng);
        if (d !== null) {
          distText = d < 1000 ? `${d} meter` : `${(d / 1000).toFixed(1)} km`;
        }
      }

      m.bindPopup(`
        <div class="text-xs p-1 space-y-1.5" style="min-width: 210px;">
          <div class="font-extrabold text-emerald-800 text-sm flex items-center gap-1.5">
            <i class="fa-solid fa-store text-[#009944]"></i>
            <span>FamilyMart ${st.name}</span>
          </div>
          <div class="text-[11px] font-mono text-slate-500 font-bold">
            Site: ${st.code} • ${st.type || 'CVS'}
          </div>
          <div class="text-[11px] text-slate-700 leading-snug">
            ${st.address || st.city || '-'}
          </div>
          <div class="text-[10px] font-mono text-slate-600 bg-slate-50 p-1 rounded border border-slate-200">
            📍 ${lat.toFixed(5)}, ${lng.toFixed(5)} ${distText ? `• <strong>${distText}</strong>` : ''}
          </div>
          <div class="pt-1 flex items-center justify-between border-t border-slate-100 text-[10px]">
            <span class="text-slate-500">PIC: <strong>${st.storeHead || '-'}</strong></span>
            <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener noreferrer" class="font-bold text-[#0099A6] hover:underline flex items-center gap-1">
              <span>Buka Rute</span>
              <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
            </a>
          </div>
        </div>
      `);
    });

    // Render User Live GPS Marker
    if (this.userMarker) {
      this.homeMap.removeLayer(this.userMarker);
      this.userMarker = null;
    }
    if (this.userAccuracyCircle) {
      this.homeMap.removeLayer(this.userAccuracyCircle);
      this.userAccuracyCircle = null;
    }

    if (this.liveGps.lat !== null && this.liveGps.lng !== null) {
      this.userMarker = L.circleMarker([this.liveGps.lat, this.liveGps.lng], {
        radius: 9,
        fillColor: '#0099A6',
        color: '#ffffff',
        weight: 3,
        fillOpacity: 1
      }).addTo(this.homeMap);

      this.userMarker.bindPopup(`
        <div class="text-xs p-1 space-y-1">
          <div class="font-extrabold text-[#0099A6] flex items-center gap-1">
            <i class="fa-solid fa-crosshairs"></i>
            <span>Lokasi Aktual Anda</span>
          </div>
          <div class="text-[11px] text-slate-600">${this.currentUser?.name || 'User'}</div>
          <div class="font-mono text-[10px] text-slate-500 bg-slate-50 p-1 rounded border border-slate-200">
            GPS: ${this.liveGps.lat}, ${this.liveGps.lng}
          </div>
        </div>
      `);

      if (this.liveGps.accuracy && this.liveGps.accuracy < 250) {
        this.userAccuracyCircle = L.circle([this.liveGps.lat, this.liveGps.lng], {
          radius: this.liveGps.accuracy,
          color: '#0099A6',
          fillColor: '#0099A6',
          fillOpacity: 0.1,
          weight: 1
        }).addTo(this.homeMap);
      }
    }

    // Render Pinpoint Actual GPS untuk setiap Bestie / Visitor
    this.renderBestieMarkers(this.homeMap, this.homeBestieLayer);
  },

  toggleHomeMapExpand() {
    const mapEl = document.getElementById('home-live-map');
    const iconEl = document.getElementById('icon-toggle-home-map');
    const textEl = document.getElementById('text-toggle-home-map');
    if (!mapEl) return;

    this.isHomeMapExpanded = !this.isHomeMapExpanded;

    if (this.isHomeMapExpanded) {
      mapEl.classList.remove('h-36');
      mapEl.classList.add('h-[480px]');
      if (iconEl) iconEl.className = 'fa-solid fa-compress text-rose-500';
      if (textEl) textEl.textContent = 'Perkecil Maps';
      this.showToast('Tampilan peta diperbesar (Tekan tombol perkecil untuk kembali)', 'info', 2500);
    } else {
      mapEl.classList.remove('h-[480px]');
      mapEl.classList.add('h-36');
      if (iconEl) iconEl.className = 'fa-solid fa-maximize text-[#0099A6]';
      if (textEl) textEl.textContent = 'Perbesar Maps';
    }

    setTimeout(() => {
      if (this.homeMap) {
        this.homeMap.invalidateSize();
        if (this.liveGps.lat !== null && this.liveGps.lng !== null) {
          this.homeMap.setView([this.liveGps.lat, this.liveGps.lng], this.isHomeMapExpanded ? 13 : 12);
        }
      }
    }, 250);
  },

  toggleLiveLocMapExpand() {
    const mapEl = document.getElementById('live-loc-dedicated-map');
    const iconEl = document.getElementById('icon-toggle-live-loc-map');
    const textEl = document.getElementById('text-toggle-live-loc-map');
    if (!mapEl) return;

    this.isLiveLocMapExpanded = !this.isLiveLocMapExpanded;

    if (this.isLiveLocMapExpanded) {
      mapEl.classList.remove('h-[380px]', 'sm:h-[480px]', 'lg:h-[640px]');
      mapEl.classList.add('h-[80vh]', 'min-h-[580px]');
      if (iconEl) iconEl.className = 'fa-solid fa-compress text-rose-500';
      if (textEl) textEl.textContent = 'Perkecil Maps';
      this.showToast('Tampilan peta diperbesar (Tekan tombol perkecil untuk kembali)', 'info', 2500);
    } else {
      mapEl.classList.remove('h-[80vh]', 'min-h-[580px]');
      mapEl.classList.add('h-[380px]', 'sm:h-[480px]', 'lg:h-[640px]');
      if (iconEl) iconEl.className = 'fa-solid fa-maximize text-[#0099A6]';
      if (textEl) textEl.textContent = 'Perbesar Maps';
    }

    setTimeout(() => {
      if (this.liveLocMap) {
        this.liveLocMap.invalidateSize();
      }
    }, 250);
  },

  openHomeMapModal() {
    const modal = document.getElementById('modal-interactive-map');
    if (!modal) return;
    modal.classList.remove('hidden');

    const searchInput = document.getElementById('modal-map-search-input');
    if (searchInput) searchInput.value = '';
    const statusEl = document.getElementById('modal-map-search-status');
    if (statusEl) statusEl.textContent = '';

    setTimeout(() => {
      this.initOrUpdateModalMap();
    }, 150);
  },

  closeHomeMapModal() {
    const modal = document.getElementById('modal-interactive-map');
    if (modal) modal.classList.add('hidden');
  },

  initOrUpdateModalMap() {
    const container = document.getElementById('modal-live-map');
    if (!container || typeof L === 'undefined') return;

    const centerLat = this.liveGps.lat !== null ? this.liveGps.lat : -6.2088;
    const centerLng = this.liveGps.lng !== null ? this.liveGps.lng : 106.8456;

    if (!this.modalMap) {
      this.modalMap = L.map('modal-live-map', {
        zoomControl: true,
        attributionControl: false
      }).setView([centerLat, centerLng], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(this.modalMap);
    } else {
      this.modalMap.invalidateSize();
      this.modalMap.setView([centerLat, centerLng], 12);
    }

    if (this.modalStoreLayer) {
      this.modalMap.removeLayer(this.modalStoreLayer);
    }
    this.modalStoreLayer = L.layerGroup().addTo(this.modalMap);

    if (this.modalBestieLayer) {
      this.modalMap.removeLayer(this.modalBestieLayer);
    }
    this.modalBestieLayer = L.layerGroup().addTo(this.modalMap);
    this._modalStoreMarkerMap = new Map();
    this._modalBestieMarkerMap = new Map();

    const stores = window.FMCUData.getStores();
    const activeCheckIn = window.FMCUData.getActiveCheckIn();
    const activeCode = activeCheckIn?.storeCode || null;

    stores.forEach((st) => {
      const lat = Number(st.lat ?? st.latitude);
      const lng = Number(st.lng ?? st.longitude);
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

      const isTarget = activeCode && String(st.code) === String(activeCode);

      const m = L.circleMarker([lat, lng], {
        radius: isTarget ? 10 : 7,
        fillColor: isTarget ? '#f59e0b' : '#009944',
        color: '#ffffff',
        weight: isTarget ? 3 : 2,
        fillOpacity: 0.95
      }).addTo(this.modalStoreLayer);

      if (isTarget) {
        L.circle([lat, lng], {
          radius: 15,
          color: '#009944',
          fillColor: '#009944',
          fillOpacity: 0.2,
          weight: 2,
          dashArray: '4, 4'
        }).addTo(this.modalStoreLayer);
      }

      let distText = '';
      if (this.liveGps.lat !== null && this.liveGps.lng !== null) {
        const d = this.calculateHaversineDistance(this.liveGps.lat, this.liveGps.lng, lat, lng);
        if (d !== null) {
          distText = d < 1000 ? `${d} meter` : `${(d / 1000).toFixed(1)} km`;
        }
      }

      m.bindPopup(`
        <div class="text-xs p-1 space-y-1.5" style="min-width: 230px;">
          <div class="font-extrabold text-emerald-800 text-sm flex items-center gap-1.5">
            <i class="fa-solid fa-store text-[#009944]"></i>
            <span>FamilyMart ${st.name}</span>
          </div>
          <div class="text-[11px] font-mono text-slate-500 font-bold">
            Site: ${st.code} • Tipe: ${st.type || 'CVS'}
          </div>
          <div class="text-[11px] text-slate-700 leading-snug">
            ${st.address || st.city || '-'}
          </div>
          <div class="text-[10px] font-mono text-slate-600 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            📍 Lat: ${lat.toFixed(5)}, Long: ${lng.toFixed(5)} ${distText ? `<br/>🎯 Jarak: <strong>${distText}</strong>` : ''}
          </div>
          <div class="pt-1.5 flex items-center justify-between border-t border-slate-100 text-[11px]">
            <span class="text-slate-600">PIC: <strong>${st.storeHead || '-'}</strong></span>
            <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener noreferrer" class="font-extrabold text-white bg-[#0099A6] hover:bg-[#007a85] px-2.5 py-1 rounded-lg flex items-center gap-1 transition shadow-xs">
              <span>Buka Rute Maps</span>
              <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
            </a>
          </div>
        </div>
      `);

      this._modalStoreMarkerMap.set(String(st.code), { marker: m, store: st, lat, lng });
    });

    // Render User Live GPS Marker on Modal
    if (this.modalUserMarker) {
      this.modalMap.removeLayer(this.modalUserMarker);
      this.modalUserMarker = null;
    }

    if (this.liveGps.lat !== null && this.liveGps.lng !== null) {
      this.modalUserMarker = L.circleMarker([this.liveGps.lat, this.liveGps.lng], {
        radius: 10,
        fillColor: '#0099A6',
        color: '#ffffff',
        weight: 3,
        fillOpacity: 1
      }).addTo(this.modalMap);

      this.modalUserMarker.bindPopup(`
        <div class="text-xs p-1 space-y-1">
          <div class="font-extrabold text-[#0099A6] flex items-center gap-1">
            <i class="fa-solid fa-crosshairs"></i>
            <span>Posisi GPS Aktual Anda</span>
          </div>
          <div class="text-[11px] text-slate-600">${this.currentUser?.name || 'User'}</div>
          <div class="font-mono text-[10px] text-slate-500 bg-slate-50 p-1 rounded border border-slate-200">
            GPS: ${this.liveGps.lat}, ${this.liveGps.lng}
          </div>
        </div>
      `);
    }

    // Render Pinpoint Actual GPS untuk setiap Bestie / Visitor di Fullscreen Modal
    this.renderBestieMarkers(this.modalMap, this.modalBestieLayer, true);

    setTimeout(() => {
      this.modalMap.invalidateSize();
    }, 200);
  },

  centerModalMapToUser() {
    if (!this.modalMap) return;
    if (this.liveGps.lat !== null && this.liveGps.lng !== null) {
      this.modalMap.setView([this.liveGps.lat, this.liveGps.lng], 15);
      if (this.modalUserMarker) this.modalUserMarker.openPopup();
      this.showToast('Peta dipusatkan ke posisi GPS Anda', 'info', 2000);
    } else {
      this.showToast('Sinyal GPS belum aktif pada perangkat', 'warning', 2500);
    }
  },

  fitModalMapToAllStores() {
    if (!this.modalMap || !this._modalStoreMarkerMap) return;
    const points = [];
    this._modalStoreMarkerMap.forEach((entry) => {
      points.push([entry.lat, entry.lng]);
    });
    if (this.liveGps.lat !== null && this.liveGps.lng !== null) {
      points.push([this.liveGps.lat, this.liveGps.lng]);
    }
    if (points.length > 0) {
      this.modalMap.fitBounds(points, { padding: [30, 30] });
      this.showToast('Menampilkan seluruh titik toko FamilyMart', 'info', 2000);
    }
  },

  // ==========================================================================
  // PINPOINT ACTUAL GPS UNTUK SETIAP BESTIE / VISITOR (SEMUA ORANG BISA LIHAT)
  // ==========================================================================
  getBestieFallbackLocation(bestie) {
    // DUMMY GPS CLEARED: Hanya gunakan lokasi actual GPS dari perangkat visitor saat mengakses web
    return null;
  },

  // Helper terpusat untuk kalkulasi status aktual Bestie/Visitor (dipakai di Live Loc Maps & Analitik Performa)
  getBestieActualStatus(bestie) {
    const lat = bestie.lastLocation?.lat ? Number(bestie.lastLocation.lat) : null;
    const lng = bestie.lastLocation?.lng ? Number(bestie.lastLocation.lng) : null;
    const hasActualLocation = Boolean(lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0);
    const isExited = Boolean(bestie.lastLocation?.isExited);

    const schedules = window.FMCUData.getSchedules();
    const stores = window.FMCUData.getStores();
    const todayStr = this.getLocalDateISO();
    const todaySchedules = schedules.filter((s) => s.scheduledDate === todayStr);
    const myTodaySch = todaySchedules.find((s) => this.isScheduleOwnedByUser(s, bestie));
    let distToStore = null;
    let targetStore = null;

    if (myTodaySch) {
      targetStore = stores.find((st) => String(st.code) === String(myTodaySch.storeCode));
      if (targetStore && hasActualLocation) {
        const sLat = Number(targetStore.lat ?? targetStore.latitude);
        const sLng = Number(targetStore.lng ?? targetStore.longitude);
        if (!isNaN(sLat) && !isNaN(sLng) && sLat !== 0 && sLng !== 0) {
          distToStore = this.calculateHaversineDistance(lat, lng, sLat, sLng);
        }
      }
    }

    let timeAgoText = 'Hari Ini';
    if (bestie.lastLocation?.updatedAt) {
      const diffMs = Date.now() - new Date(bestie.lastLocation.updatedAt).getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 2) timeAgoText = 'Baru saja';
      else if (diffMin < 60) timeAgoText = `${diffMin}m lalu`;
      else timeAgoText = `${Math.floor(diffMin / 60)}j lalu`;
    }

    // 1. Belum Akses Web: jika lokasi tidak terdeteksi / tidak membuka web
    if (!hasActualLocation) {
      return {
        key: 'NOT_ACCESSED',
        label: 'Belum Akses Web',
        badgeHtml: '<span class="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-extrabold border border-slate-200">Belum Akses Web</span>',
        subtitleHtml: '<span class="text-[10px] text-slate-400 font-medium">Belum Akses Web</span>',
        lat,
        lng,
        hasActualLocation: false,
        isExited: false,
        timeAgoText,
        myTodaySch,
        distToStore,
        targetStore
      };
    }

    // 2. Keluar Aplikasi: jika visitor keluar / menutup tab web app atau logout
    if (isExited) {
      const exitTime = bestie.lastLocation?.exitedAt ? new Date(bestie.lastLocation.exitedAt) : null;
      const exitTimeStr = exitTime
        ? `${String(exitTime.getHours()).padStart(2, '0')}:${String(exitTime.getMinutes()).padStart(2, '0')} WIB`
        : timeAgoText;
      return {
        key: 'EXITED',
        label: 'Keluar Aplikasi',
        badgeHtml: '<span class="text-[9px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-extrabold border border-slate-300 flex items-center gap-1"><i class="fa-solid fa-arrow-right-from-bracket text-[9px] text-slate-500"></i>Keluar Aplikasi</span>',
        subtitleHtml: `<span class="text-[10px] text-slate-500 font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Keluar Aplikasi (${exitTimeStr})</span>`,
        lat,
        lng,
        hasActualLocation: true,
        isExited: true,
        exitTimeStr,
        timeAgoText,
        myTodaySch,
        distToStore,
        targetStore
      };
    }

    // 3. Sedang Visit: lokasi terdeteksi di toko yang terjadwal <= 15m
    if (myTodaySch && ((distToStore !== null && distToStore <= 15) || myTodaySch.status === 'IN_PROGRESS')) {
      return {
        key: 'VISITING',
        label: 'Sedang Visit',
        badgeHtml: '<span class="text-[9px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-300 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 gps-pulse"></span>Sedang Visit</span>',
        subtitleHtml: `<span class="text-[10px] text-emerald-700 font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Di Toko (${distToStore !== null ? distToStore + 'm' : '≤15m'}) • ${timeAgoText}</span>`,
        lat,
        lng,
        hasActualLocation: true,
        isExited: false,
        timeAgoText,
        myTodaySch,
        distToStore,
        targetStore
      };
    }

    // 4. Diluar Radius Toko: lokasi terdeteksi di luar radius toko yang dijadwalkan > 15m
    const distText = distToStore !== null ? (distToStore < 1000 ? `${distToStore}m` : `${(distToStore / 1000).toFixed(1)}km`) : '>15m';
    return {
      key: 'OUTSIDE_RADIUS',
      label: 'Diluar Radius Toko',
      badgeHtml: '<span class="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold border border-amber-300 flex items-center gap-1"><i class="fa-solid fa-triangle-exclamation text-[9px] text-amber-600"></i>Diluar Radius Toko</span>',
      subtitleHtml: `<span class="text-[10px] text-amber-700 font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Diluar Radius Toko (${distText}) • ${timeAgoText}</span>`,
      lat,
      lng,
      hasActualLocation: true,
      isExited: false,
      timeAgoText,
      myTodaySch,
      distToStore,
      targetStore
    };
  },

  renderBestieMarkers(map, layerGroup, isModal = false) {
    if (!map || !layerGroup || typeof L === 'undefined') return;
    layerGroup.clearLayers();

    const isPrivilegedAdmin = Boolean(
      this.currentUser &&
      (this.currentUser.role === 'SUPER_ADMIN' ||
       this.currentUser.role === 'SCHEDULE_ADMIN' ||
       this.currentUser.role === 'AREA_MANAGER' ||
       this.currentUser.role === 'REGIONAL_MANAGER' ||
       this.currentUser.username === 'admin')
    );

    const users = window.FMCUData.getUsers();
    const besties = users.filter((u) => this.isAuditorUser(u));
    const currentUserId = this.currentUser?.id || this.currentUser?.username;
    const now = Date.now();

    besties.forEach((bestie) => {
      let lat = bestie.lastLocation?.lat;
      let lng = bestie.lastLocation?.lng;
      let storeVisit = bestie.lastLocation?.storeVisit || null;

      // HANYA RENDER JIKA MEMILIKI KOORDINAT GPS AKTUAL (TIDAK DUMMY)
      if (!lat || !lng) return;

      lat = Number(lat);
      lng = Number(lng);
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

      const isMe = String(bestie.id || bestie.username) === String(currentUserId);

      // LIVE LOC SISI USER:
      // Regular user / bestie HANYA boleh melihat posisi GPS miliknya sendiri dan titik toko.
      // Dilarang menampilkan lokasi pin Bestie lain jika bukan admin!
      if (!isPrivilegedAdmin && !isMe) {
        return;
      }
      const initials = (bestie.name || 'RB')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('');

      let distText = '';
      if (this.liveGps.lat !== null && this.liveGps.lng !== null && !isMe) {
        const d = this.calculateHaversineDistance(this.liveGps.lat, this.liveGps.lng, lat, lng);
        if (d !== null) {
          distText = d < 1000 ? `${d}m dari Anda` : `${(d / 1000).toFixed(1)}km dari Anda`;
        }
      }

      let timeAgoText = 'Aktif Hari Ini';
      if (bestie.lastLocation?.updatedAt) {
        const diffMs = now - new Date(bestie.lastLocation.updatedAt).getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 2) timeAgoText = 'Baru saja';
        else if (diffMin < 60) timeAgoText = `${diffMin} menit yang lalu`;
        else timeAgoText = `${Math.floor(diffMin / 60)} jam yang lalu`;
      }

      // Marker HTML Avatar Bestie Pin
      const markerHtml = `
        <div class="relative flex items-center justify-center cursor-pointer group" style="transform: translate(-50%, -50%);">
          <div class="w-8 h-8 rounded-full ${
            isMe
              ? 'bg-gradient-to-tr from-[#0099A6] to-teal-400 ring-4 ring-teal-300/60 shadow-lg animate-pulse'
              : 'bg-gradient-to-tr from-indigo-600 to-purple-600 ring-2 ring-white shadow-md'
          } flex items-center justify-center text-white text-[11px] font-black transition transform group-hover:scale-125">
            ${isMe ? '<i class="fa-solid fa-crosshairs text-xs"></i>' : initials}
          </div>
          <div class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full ${
            isMe ? 'bg-teal-400' : 'bg-emerald-500'
          } border-2 border-white shadow-xs flex items-center justify-center text-[7px] text-white">
            <i class="fa-solid fa-check"></i>
          </div>
          <div class="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow pointer-events-none">
            ${isMe ? 'Anda (' + (bestie.name?.split(' ')[0] || 'User') + ')' : bestie.name?.split(' ')[0] || 'Bestie'}
          </div>
        </div>
      `;

      const bestieIcon = L.divIcon({
        className: 'bestie-gps-pin',
        html: markerHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18]
      });

      const m = L.marker([lat, lng], { icon: bestieIcon, zIndexOffset: isMe ? 1000 : 600 }).addTo(layerGroup);

      m.bindPopup(`
        <div class="text-xs p-1.5 space-y-2" style="min-width: 240px;">
          <div class="flex items-center gap-2 border-b border-slate-100 pb-2">
            <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-extrabold flex items-center justify-center text-xs shrink-0 shadow-xs">
              ${initials}
            </div>
            <div class="min-w-0">
              <div class="font-extrabold text-slate-900 text-xs truncate">
                ${bestie.name} ${isMe ? '<span class="text-[#0099A6] font-bold">(Anda)</span>' : ''}
              </div>
              <div class="text-[10px] text-indigo-700 font-extrabold flex items-center gap-1">
                <i class="fa-solid fa-id-badge"></i>
                <span>${bestie.roleBadge || 'Regional Bestie'} • NIK: ${bestie.nik || '-'}</span>
              </div>
            </div>
          </div>

          <div class="space-y-1 text-[11px] text-slate-600">
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Status GPS:</span>
              <span class="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                ● Live GPS Aktif
              </span>
            </div>
            ${
              storeVisit
                ? `<div class="flex items-center justify-between gap-1">
                    <span class="text-slate-400 shrink-0">Lokasi Visit:</span>
                    <span class="font-bold text-slate-800 text-right truncate">${storeVisit}</span>
                   </div>`
                : ''
            }
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Update Terakhir:</span>
              <span class="font-semibold text-slate-700">${timeAgoText}</span>
            </div>
            ${
              distText
                ? `<div class="flex items-center justify-between">
                    <span class="text-slate-400">Jarak:</span>
                    <span class="font-bold text-[#0099A6]">${distText}</span>
                   </div>`
                : ''
            }
          </div>

          <div class="bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-[10px] font-mono text-slate-600 flex items-center justify-between">
            <span>📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
            <span class="text-[9px] font-bold text-emerald-700">GPS Verified</span>
          </div>

          <div class="pt-1 border-t border-slate-100 flex items-center justify-end">
            <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener noreferrer" class="text-[10px] font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow-xs">
              <i class="fa-solid fa-location-arrow text-[10px]"></i>
              <span>Rute Google Maps ke Bestie</span>
            </a>
          </div>
        </div>
      `);

      if (isModal && this._modalBestieMarkerMap) {
        this._modalBestieMarkerMap.set(String(bestie.id || bestie.nik || bestie.username), {
          marker: m,
          bestie,
          lat,
          lng
        });
      }
    });
  },

  fitModalMapToAllBesties() {
    if (!this.modalMap) return;
    const users = window.FMCUData.getUsers().filter((u) => this.isAuditorUser(u));
    const points = [];
    users.forEach((b) => {
      const loc = b.lastLocation || this.getBestieFallbackLocation(b);
      if (loc && loc.lat && loc.lng) {
        points.push([Number(loc.lat), Number(loc.lng)]);
      }
    });
    if (this.liveGps.lat !== null && this.liveGps.lng !== null) {
      points.push([this.liveGps.lat, this.liveGps.lng]);
    }
    if (points.length > 0) {
      this.modalMap.fitBounds(points, { padding: [40, 40] });
      this.showToast('Menampilkan seluruh titik pinpoint GPS 18 Regional Bestie & Visitor', 'info', 2500);
    }
  },

  searchStoreOnModalMap(query = '') {
    const q = String(query || '').trim().toLowerCase();
    const statusEl = document.getElementById('modal-map-search-status');
    if (!q) {
      if (statusEl) statusEl.textContent = '';
      return;
    }

    // 1. Cari di Bestie / Visitor terlebih dahulu
    if (this._modalBestieMarkerMap) {
      let foundBestie = null;
      this._modalBestieMarkerMap.forEach((entry) => {
        if (foundBestie) return;
        const b = entry.bestie;
        if (
          String(b.name || '').toLowerCase().includes(q) ||
          String(b.nik || '').toLowerCase().includes(q) ||
          String(b.username || '').toLowerCase().includes(q)
        ) {
          foundBestie = entry;
        }
      });

      if (foundBestie) {
        this.modalMap.setView([foundBestie.lat, foundBestie.lng], 16);
        foundBestie.marker.openPopup();
        if (statusEl) {
          statusEl.innerHTML = `<span class="text-indigo-700 font-extrabold">✓ Ditemukan: Regional Bestie ${foundBestie.bestie.name}</span>`;
        }
        return;
      }
    }

    // 2. Cari di Toko FamilyMart
    if (this._modalStoreMarkerMap) {
      let foundStore = null;
      this._modalStoreMarkerMap.forEach((entry) => {
        if (foundStore) return;
        const st = entry.store;
        if (
          String(st.code || '').toLowerCase().includes(q) ||
          String(st.name || '').toLowerCase().includes(q) ||
          String(st.city || '').toLowerCase().includes(q) ||
          String(st.address || '').toLowerCase().includes(q)
        ) {
          foundStore = entry;
        }
      });

      if (foundStore) {
        this.modalMap.setView([foundStore.lat, foundStore.lng], 16);
        foundStore.marker.openPopup();
        if (statusEl) {
          statusEl.innerHTML = `<span class="text-emerald-700 font-bold">✓ Ditemukan: ${foundStore.store.name} (${foundStore.store.code})</span>`;
        }
        return;
      }
    }

    if (statusEl) {
      statusEl.innerHTML = `<span class="text-rose-500 font-bold">Toko / Bestie tidak ditemukan</span>`;
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
    this.showToast('Pencatatan IN & OUT kini otomatis dari sistem via GPS Geofence (Radius 15m & Rentan Waktu 15 Menit).', 'info');
  },

  // ==========================================================================
  // AUTOMATIC GEOFENCE GPS IN / OUT ENGINE (15M RADIUS & 15-MINUTE AWAY SPAN)
  // ==========================================================================
  calculateDistance(lat1, lon1, lat2, lon2) {
    return this.calculateHaversineDistance(lat1, lon1, lat2, lon2);
  },

  calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
    const R = 6371000; // Radius bumi dalam meter
    const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
    const dLon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((Number(lat1) * Math.PI) / 180) *
        Math.cos((Number(lat2) * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  },

  getSmartAutoInTime() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const totalMinutes = h * 60 + m;
    const cutoff830 = 8 * 60 + 30; // 08:30 WIB

    // Jika dibuka pertama kali pada jam 08:30 atau sebelum jam tersebut (<= 08:30)
    if (totalMinutes <= cutoff830) {
      return '08:30 WIB';
    }
    // Jika pertama kali tiba di toko sesudah jam 08:30
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} WIB`;
  },

  getSmartAutoOutTime() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const totalMinutes = h * 60 + m;
    const cutoff1730 = 17 * 60 + 30; // 17:30 WIB

    // OUT hanya dibaca jika web ini dibuka di jam 17:30 atau sesudah jam tersebut (>= 17:30)
    if (totalMinutes < cutoff1730) {
      return null;
    }
    // Jika dibuka di rentang 17:30 - 17:35, gunakan standard 17:30 WIB
    if (totalMinutes <= cutoff1730 + 5) {
      return '17:30 WIB';
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} WIB`;
  },

  getActiveTargetStore() {
    const activeCheckIn = window.FMCUData.getActiveCheckIn();
    const storeCode =
      activeCheckIn?.storeCode ||
      document.getElementById('form-store-code')?.value?.trim() ||
      null;
    if (!storeCode) return null;

    const stores = window.FMCUData.getStores();
    return stores.find((s) => String(s.code) === String(storeCode)) || null;
  },

  checkAutomaticGeofenceInOut() {
    // 1. Validasi keberadaan Live GPS visitor
    if (this.liveGps.lat === null || this.liveGps.lng === null) {
      this.updateGeofenceUI('NO_GPS', null);
      return;
    }

    const activeCheckIn = window.FMCUData.getActiveCheckIn();
    const isFormVisible = this.currentView === 'form' && this.hasActiveStoreForm;

    if (!activeCheckIn && !isFormVisible) {
      return;
    }

    const targetStore = this.getActiveTargetStore();
    if (!targetStore) {
      return;
    }

    // 2. Acuan Pin Point Titik Koordinat Toko dari Master Data
    const storeLat = targetStore.lat ?? targetStore.latitude ?? null;
    const storeLng = targetStore.lng ?? targetStore.longitude ?? null;

    if (storeLat === null || storeLng === null) {
      this.updateGeofenceUI('NO_STORE_COORDS', null);
      return;
    }

    // 3. Hitung jarak akurat Haversine antara GPS visitor dan Titik Pinpoint Toko
    const distanceMeters = this.calculateHaversineDistance(
      this.liveGps.lat,
      this.liveGps.lng,
      storeLat,
      storeLng
    );

    const inInput = document.getElementById('form-actual-in');
    const outInput = document.getElementById('form-actual-out');
    let currentInVal = inInput?.value?.trim() || activeCheckIn?.actualIn || '';
    let currentOutVal = outInput?.value?.trim() || activeCheckIn?.actualOut || '';

    const GEOFENCE_RADIUS = 15; // Kepatuhan radius lokasi toko <= 15 meter
    const now = new Date();
    const currentTotalMins = now.getHours() * 60 + now.getMinutes();
    const CUTOFF_OUT_MINS = 17 * 60 + 30; // 17:30 WIB

    // ========================================================================
    // KONDISI A: LOKASI TIDAK TERDETEKSI DI DALAM RADIUS TOKO (> 15 METER)
    // "dan jika di rentan antara jam tersebut tidak terdeteksi lokasi/terdeteksi maka tidak direcord"
    // ========================================================================
    if (distanceMeters === null || distanceMeters > GEOFENCE_RADIUS) {
      if (!currentInVal || currentInVal === '--:-- WIB' || currentInVal === '-') {
        this.updateGeofenceUI('OUTSIDE_DENIED_IN', distanceMeters);
      } else if (!currentOutVal || currentOutVal === '--:-- WIB' || currentOutVal === '-') {
        this.updateGeofenceUI('OUTSIDE_DENIED_OUT', distanceMeters, currentInVal);
      } else {
        this.updateGeofenceUI('AUTO_OUT_COMPLETED', distanceMeters, currentOutVal);
      }
      return;
    }

    // ========================================================================
    // KONDISI B: LOKASI TERDETEKSI DI TITIK PINPOINT TOKO (RADIUS <= 15 METER)
    // ========================================================================
    
    // 1. ATURAN RECORD IN:
    // "untuk IN yang di baca adalah pertama kali web dibuka/dijam 08:30 atau sebelum jam tersebut"
    if (!currentInVal || currentInVal === '--:-- WIB' || currentInVal === '-') {
      const autoInTime = this.getSmartAutoInTime();
      currentInVal = autoInTime;
      if (inInput) inInput.value = autoInTime;

      if (activeCheckIn) {
        activeCheckIn.actualIn = autoInTime;
        activeCheckIn.latIn = this.liveGps.lat;
        activeCheckIn.lngIn = this.liveGps.lng;
        window.FMCUData.setActiveCheckIn(activeCheckIn);
      }

      const schId = activeCheckIn?.scheduleId || document.getElementById('form-schedule-id')?.value;
      if (schId) {
        const schedules = window.FMCUData.getSchedules();
        const sch = schedules.find((s) => s.id === schId);
        if (sch && (!sch.actualIn || sch.actualIn === '-')) {
          sch.actualIn = autoInTime;
          sch.actualLat = this.liveGps.lat;
          sch.actualLng = this.liveGps.lng;
          sch.status = 'IN_PROGRESS';
          window.FMCUData.saveSchedules(schedules);
        }
      }

      this.updateActiveCheckInUI();
      this.showToast(
        `✓ Actual IN Tercatat: ${autoInTime} (Terdeteksi di titik pinpoint toko, jarak ${distanceMeters}m <= 15m)`,
        'success'
      );
    }

    // 2. ATURAN RECORD OUT:
    // "jika visitor/regional bestie sengaja menutup aplikasi atau web maka out tidak ter record"
    // "untuk OUT yang dibaca adalah jam terakhir web ini di Buka/dijam 17:30 atau sesudah jam tersebut"
    if (currentTotalMins < CUTOFF_OUT_MINS) {
      // BELUM MENCAPAI JAM 17:30 -> OUT TIDAK TER-RECORD!
      // Jika visitor sengaja menutup aplikasi atau web sebelum jam 17:30, out tidak ter-record.
      this.updateGeofenceUI('INSIDE_WAITING_OUT', distanceMeters, currentInVal);
    } else {
      // WAKTU SUDAH JAM 17:30 ATAU SESUDAHNYA (>= 17:30) & VISITOR MEMBUKA WEB DI LOKASI TOKO (<= 15m):
      // Rekam jam terakhir web ini dibuka sebagai Actual OUT
      const autoOutTime = this.getSmartAutoOutTime();
      if (autoOutTime) {
        currentOutVal = autoOutTime;
        if (outInput) outInput.value = autoOutTime;

        if (activeCheckIn) {
          activeCheckIn.actualOut = autoOutTime;
          activeCheckIn.latOut = this.liveGps.lat;
          activeCheckIn.lngOut = this.liveGps.lng;
          window.FMCUData.setActiveCheckIn(activeCheckIn);
        }

        const schId = activeCheckIn?.scheduleId || document.getElementById('form-schedule-id')?.value;
        if (schId) {
          const schedules = window.FMCUData.getSchedules();
          const sch = schedules.find((s) => s.id === schId);
          if (sch && sch.actualOut !== autoOutTime) {
            sch.actualOut = autoOutTime;
            sch.actualLat = this.liveGps.lat;
            sch.actualLng = this.liveGps.lng;
            window.FMCUData.saveSchedules(schedules);
          }
        }

        this.updateActiveCheckInUI();
        this.updateGeofenceUI('AUTO_OUT_COMPLETED', distanceMeters, autoOutTime);
      }
    }
  },

  updateGeofenceUI(state, distance, auxInfo = null) {
    const radarPill = document.getElementById('form-geofence-radar-pill');
    const titleEl = document.getElementById('form-geofence-radar-title');
    const descEl = document.getElementById('form-geofence-radar-desc');
    const inDot = document.getElementById('form-auto-in-status');
    const outDot = document.getElementById('form-auto-out-status');

    if (!radarPill) return;
    if (state === 'INSIDE_WAITING_OUT') {
      radarPill.className = 'w-full bg-emerald-500/20 border border-emerald-400/40 rounded-xl p-2 sm:p-2.5 text-xs flex items-center gap-2';
      if (titleEl) titleEl.textContent = '✓ Di Titik Pinpoint Toko (Radius ≤ 15m)';
      if (descEl) descEl.textContent = `Jarak: ${distance}m • In: ${auxInfo || '08:30 WIB'} • Out aktif jam ≥ 17:30`;
      if (inDot) inDot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0';
      if (outDot) outDot.className = 'w-2 h-2 rounded-full bg-slate-400 shrink-0';
    } else if (state === 'AUTO_OUT_COMPLETED') {
      radarPill.className = 'w-full bg-teal-500/20 border border-teal-400/40 rounded-xl p-2 sm:p-2.5 text-xs flex items-center gap-2';
      if (titleEl) titleEl.textContent = '✓ Sesi Presensi Selesai (Actual IN & OUT Lengkap)';
      if (descEl) descEl.textContent = `Actual Out: ${auxInfo || '17:30 WIB'} • Jarak toko: ${distance}m`;
      if (inDot) inDot.className = 'w-2 h-2 rounded-full bg-emerald-400 shrink-0';
      if (outDot) outDot.className = 'w-2 h-2 rounded-full bg-teal-400 shrink-0';
    } else if (state === 'OUTSIDE_DENIED_IN') {
      radarPill.className = 'w-full bg-rose-500/20 border border-rose-400/40 rounded-xl p-2 sm:p-2.5 text-xs flex items-center gap-2';
      if (titleEl) titleEl.textContent = '⛔ Di Luar Radius Toko (> 15m)';
      if (descEl) descEl.textContent = `Jarak: ${distance}m > 15m • Mendekat ke titik toko untuk record Actual IN`;
      if (inDot) inDot.className = 'w-2 h-2 rounded-full bg-slate-400 shrink-0';
      if (outDot) outDot.className = 'w-2 h-2 rounded-full bg-slate-400 shrink-0';
    } else if (state === 'OUTSIDE_DENIED_OUT') {
      radarPill.className = 'w-full bg-amber-500/20 border border-amber-400/40 rounded-xl p-2 sm:p-2.5 text-xs flex items-center gap-2';
      if (titleEl) titleEl.textContent = '⛔ Di Luar Radius Toko (> 15m)';
      if (descEl) descEl.textContent = `In: ${auxInfo} • Out TIDAK direcord jika web dibuka di luar lokasi toko`;
      if (inDot) inDot.className = 'w-2 h-2 rounded-full bg-emerald-400 shrink-0';
      if (outDot) outDot.className = 'w-2 h-2 rounded-full bg-amber-400 shrink-0';
    } else if (state === 'NO_STORE_COORDS') {
      radarPill.className = 'w-full bg-amber-500/20 border border-amber-400/40 rounded-xl p-2 sm:p-2.5 text-xs flex items-center gap-2';
      if (titleEl) titleEl.textContent = '⚠️ Koordinat Pinpoint Toko Belum Ada';
      if (descEl) descEl.textContent = 'Hubungi Admin untuk mengisi Latitude & Longitude toko di Master Toko';
      if (inDot) inDot.className = 'w-2 h-2 rounded-full bg-slate-400 shrink-0';
      if (outDot) outDot.className = 'w-2 h-2 rounded-full bg-slate-400 shrink-0';
    } else {
      radarPill.className = 'w-full bg-slate-500/20 border border-slate-400/30 rounded-xl p-2 sm:p-2.5 text-xs flex items-center gap-2';
      if (titleEl) titleEl.textContent = '⚠️ Sinyal GPS Tidak Terdeteksi';
      if (descEl) descEl.textContent = 'Pastikan izin GPS perangkat aktif agar kehadiran toko dapat direcord';
      if (inDot) inDot.className = 'w-2 h-2 rounded-full bg-slate-400 shrink-0';
      if (outDot) outDot.className = 'w-2 h-2 rounded-full bg-slate-400 shrink-0';
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
    if (user.role === 'AUDITOR' || user.role === 'VISITOR') return true;
    const badge = String(user.roleBadge || '').toLowerCase();
    return badge.includes('visitor') || badge.includes('auditor') || badge.includes('bestie');
  },

  getSchedulableAuditors() {
    const users = window.FMCUData.getUsers();
    return users
      .filter((u) => this.isAuditorUser(u))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' }));
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
    this.triggerHaptic('light');
    const todayStr = this.getLocalDateISO();
    const todayFormatted = window.FMCUPdf.formatIndonesianDate(todayStr, true);
    const schedules = window.FMCUData.getSchedules() || [];
    const reports = window.FMCUData.getReports() || [];

    // 1. If already checked in to a store, verify if it was already completed today and belongs to today
    const activeCheckIn = window.FMCUData.getActiveCheckIn();
    if (activeCheckIn && activeCheckIn.storeCode) {
      const sch = schedules.find((s) => s.id === activeCheckIn.scheduleId);
      const isTodaySchedule = sch ? (sch.scheduledDate === todayStr) : (activeCheckIn.checkInDate === todayStr);
      const isAlreadyCompleted = reports.some(
        (r) => r.storeCode === activeCheckIn.storeCode && r.visitDate === todayStr
      );
      if (isAlreadyCompleted || !isTodaySchedule) {
        // Toko yang dicek-in sebelumnya sudah selesai atau bukan jadwal hari ini, hapus agar visitor tidak terkunci
        window.FMCUData.setActiveCheckIn(null);
      } else {
        this.openStoreVisitForm(activeCheckIn.storeCode, activeCheckIn.scheduleId);
        this.showToast(`Melanjutkan Form Visit aktif di FamilyMart ${activeCheckIn.storeName || activeCheckIn.storeCode}.`, 'info');
        return;
      }
    }

    // 2. Find schedules owned by current user for today
    const myTodaySchedules = schedules.filter(
      (s) => s.scheduledDate === todayStr && this.isScheduleOwnedByUser(s, this.currentUser)
    );

    // Pick first today schedule that hasn't completed or had report filled
    const myPendingToday = myTodaySchedules.find((s) => {
      const hasReport = s.reportId || reports.some((r) => r.storeCode === s.storeCode && r.visitDate === s.scheduledDate);
      return s.status !== 'COMPLETED' && !hasReport;
    });

    if (myPendingToday) {
      this.openStoreVisitForm(myPendingToday.storeCode, myPendingToday.id);
      this.showToast(`Membuka Form Visit ${myPendingToday.storeName} untuk jadwal hari ini (${todayFormatted}).`, 'success');
      return;
    }

    // 3. If user has schedules today but all are already completed
    if (myTodaySchedules.length > 0) {
      const completedToday = myTodaySchedules[0];
      const rep = reports.find((r) => (completedToday.reportId && r.id === completedToday.reportId) || (r.storeCode === completedToday.storeCode && r.visitDate === todayStr));
      if (rep) {
        this.openReportPreview(rep.id);
        this.showToast(`Seluruh jadwal visit hari ini telah selesai. Menampilkan preview PDF ${completedToday.storeName}.`, 'info');
        return;
      }
      this.openStoreVisitForm(completedToday.storeCode, completedToday.id);
      return;
    }

    // 4. Jika hari aktual tidak ada jadwal visit: FORM VISIT TIDAK BISA DIBUKA
    this.triggerHaptic('warning');
    const isVisitor = this.isAuditorUser(this.currentUser) || !this.hasAuthority('manage_schedule');
    const warningMsg = isVisitor
      ? `⛔ Akses Ditolak: Anda tidak memiliki jadwal visit yang ditugaskan untuk hari ini (${todayFormatted}). Form visit tidak dapat dibuka karena tidak ada jadwal kunjungan aktif di hari aktual.`
      : `⛔ Tidak Ada Jadwal Hari Ini: Tidak ada jadwal visit untuk tanggal aktual (${todayFormatted}). Silakan atur atau tambahkan jadwal terlebih dahulu di menu Jadwal Visit.`;
    this.showToast(warningMsg, 'warning', 6000);
    this.switchHomeSubSection('schedule');
  },

  // Update button visual state & label on Home according to today's schedule availability
  updateHomeTodayVisitButtonUI() {
    const btn = document.getElementById('btn-visit-today-schedule');
    const label = document.getElementById('btn-visit-today-label');
    if (!btn || !label) return;

    const todayStr = this.getLocalDateISO();
    const schedules = window.FMCUData.getSchedules() || [];
    const reports = window.FMCUData.getReports() || [];

    const myTodaySchedules = schedules.filter(
      (s) => s.scheduledDate === todayStr && this.isScheduleOwnedByUser(s, this.currentUser)
    );

    const pendingToday = myTodaySchedules.filter((s) => {
      const hasReport = s.reportId || reports.some((r) => r.storeCode === s.storeCode && r.visitDate === s.scheduledDate);
      return s.status !== 'COMPLETED' && !hasReport;
    });

    if (myTodaySchedules.length === 0) {
      btn.className = 'bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-200 font-extrabold p-2.5 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm shadow-none transition flex items-center justify-center text-center gap-1.5 sm:gap-2 cursor-pointer';
      label.textContent = 'Visit Jadwal Hari Ini (Tidak Ada Jadwal)';
      btn.title = 'Tidak ada jadwal visit yang ditugaskan untuk hari ini';
    } else if (pendingToday.length > 0) {
      btn.className = 'fm-gradient hover:opacity-95 text-white font-extrabold p-2.5 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm shadow-sm transition flex items-center justify-center text-center gap-1.5 sm:gap-2 cursor-pointer';
      label.textContent = `Visit Jadwal Hari Ini (${pendingToday.length} Toko)`;
      btn.title = `Ada ${pendingToday.length} toko pada jadwal hari ini yang siap divisit`;
    } else {
      btn.className = 'bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold p-2.5 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm shadow-sm transition flex items-center justify-center text-center gap-1.5 sm:gap-2 cursor-pointer';
      label.textContent = 'Visit Jadwal Hari Ini (✓ Selesai)';
      btn.title = 'Semua jadwal visit hari ini telah selesai dilaksanakan';
    }
  },

  restoreActiveCheckInToForm(checkInObj) {
    if (!checkInObj || !checkInObj.storeCode) return;
    this.hasActiveStoreForm = true;
    this.updateFormGuardVisibility();
    this.restoreStoreData(checkInObj.storeCode, checkInObj.scheduleId || null);

    if (checkInObj.scheduleId) {
      const schEl = document.getElementById('form-schedule-id');
      if (schEl) schEl.value = checkInObj.scheduleId;
    }
    if (checkInObj.actualIn) {
      const inEl = document.getElementById('form-actual-in');
      if (inEl && !inEl.value) inEl.value = checkInObj.actualIn;
    }
    if (checkInObj.actualOut) {
      const outEl = document.getElementById('form-actual-out');
      if (outEl && !outEl.value) outEl.value = checkInObj.actualOut;
    }
    this.checkAutomaticGeofenceInOut();
    if (this.currentUser) {
      const audInput = document.getElementById('form-auditor-name');
      if (audInput && !audInput.value.trim()) {
        audInput.value = this.currentUser.name || '';
      }
    }
    this.activePreviewReportId = '__LIVE_FORM__';
  },

  openStoreVisitForm(storeCode = '', scheduleId = null) {
    const stores = window.FMCUData.getStores();
    const schedules = window.FMCUData.getSchedules();
    const sch = schedules.find((s) => s.id === scheduleId) || null;
    const store = stores.find((s) => s.code === storeCode) || null;
    const targetCode = store ? store.code : sch ? sch.storeCode : storeCode;
    const targetName = store ? store.name : sch ? sch.storeName : 'Toko Visit';
    const todayStr = this.getLocalDateISO();

    // Simpan draft toko saat ini jika visitor berpindah membuka form toko lain
    const currentStoreCode = document.getElementById('form-store-code')?.value.trim();
    if (currentStoreCode && currentStoreCode !== '-' && currentStoreCode !== targetCode) {
      this.saveCurrentFormDraft();
    }

    // KEPATUHAN TANGGAL HARI AKTUAL:
    // Jika visitor atau regional bestie mencoba membuka jadwal visit di hari yang bukan aktual, form visit TIDAK BISA DIBUKA
    // Catatan: Jadwal yang sudah selesai visit / tersimpan di arsip tetap dapat dibuka untuk review!
    const isVisitorOrRegionalBestie = this.isAuditorUser(this.currentUser) || !this.hasAuthority('manage_schedule');
    const reports = window.FMCUData.getReports();
    const isCompleted = sch && (sch.status === 'COMPLETED' || sch.reportId || reports.some((r) => (sch.reportId && r.id === sch.reportId) || (r.storeCode === targetCode && r.visitDate === sch.scheduledDate)));
    if (!isCompleted && isVisitorOrRegionalBestie && sch && sch.scheduledDate && sch.scheduledDate !== todayStr) {
      const schDateFormatted = window.FMCUPdf.formatIndonesianDate(sch.scheduledDate, true);
      const todayFormatted = window.FMCUPdf.formatIndonesianDate(todayStr, true);
      this.showToast(
        `⛔ Akses Ditolak: Jadwal visit ke FamilyMart ${sch.storeName || ''} terjadwal untuk ${schDateFormatted}. Form visit hanya dapat dibuka pada hari aktual kunjungan (Hari ini: ${todayFormatted}).`,
        'warning',
        6000
      );
      return;
    }

    // Pulihkan data laporan yang sudah ada, draft toko yang tersimpan, atau mulai form baru
    this.restoreStoreData(targetCode, scheduleId);

    if (scheduleId) {
      const schIdEl = document.getElementById('form-schedule-id');
      if (schIdEl) schIdEl.value = scheduleId;
    }
    if (sch?.actualIn && !document.getElementById('form-actual-in').value) {
      document.getElementById('form-actual-in').value = sch.actualIn;
    }
    if (sch?.actualOut && !document.getElementById('form-actual-out').value) {
      document.getElementById('form-actual-out').value = sch.actualOut;
    }
    if (this.currentUser) {
      const audInput = document.getElementById('form-auditor-name');
      if (audInput && !audInput.value.trim()) {
        audInput.value = this.currentUser.name || this.currentUser.username || '';
      }
    }

    const checkInObj = {
      storeCode: targetCode,
      storeName: targetName,
      scheduleId: scheduleId,
      actualIn: document.getElementById('form-actual-in')?.value || sch?.actualIn || null,
      actualOut: document.getElementById('form-actual-out')?.value || sch?.actualOut || null,
      latIn: this.liveGps.lat,
      lngIn: this.liveGps.lng,
      storeLat: store?.lat || null,
      storeLng: store?.lng || null,
      startedAt: Date.now()
    };
    window.FMCUData.setActiveCheckIn(checkInObj);
    this.updateActiveCheckInUI();

    this.hasActiveStoreForm = true;
    this.updateFormGuardVisibility();
    this.activePreviewReportId = '__LIVE_FORM__';

    this.navigate('form');

    // Segera evaluasi geofence otomatis (15m radius & 15m away span)
    this.checkAutomaticGeofenceInOut();
  },

  checkInAndOpenForm(storeCode = '', scheduleId = null) {
    this.openStoreVisitForm(storeCode, scheduleId);
  },

  // ==========================================================================
  // HALAMAN 1A & 1B: HOME VIEW & ANALYTICS VIEW (SEPARATED)
  // ==========================================================================
  renderAllViews() {
    this.renderHomeView();
    this.renderAnalyticsView();
    this.renderPreviewSelector();
    this.renderAdminView();
    if (this.currentView === 'live-maps') {
      this.renderLiveLocView();
    }
  },

  currentHomeSubSection: 'overview',

  switchHomeSubSection(subSec, scrollTop = false) {
    this.triggerHaptic('light');
    const validSections = ['overview', 'schedule', 'history'];
    const target = validSections.includes(subSec) ? subSec : 'overview';
    this.currentHomeSubSection = target;

    try {
      sessionStorage.setItem('fmcu_active_home_subtab', target);
    } catch (e) {}

    validSections.forEach((sec) => {
      const el = document.getElementById(`home-subsec-${sec}`);
      if (el) el.classList.toggle('hidden', sec !== target);

      const btn = document.getElementById(`home-subtab-btn-${sec}`);
      if (btn) {
        if (sec === target) {
          btn.className = 'shrink-0 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer bg-[#009944] text-white shadow-xs whitespace-nowrap';
        } else {
          btn.className = 'shrink-0 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap';
        }
      }
    });

    this.updateHomeSubSectionPills();
    this.scrollActiveHomeSubtabIntoView();

    if (target === 'overview') {
      this.renderHomeNewsSlider();
      setTimeout(() => {
        if (this.homeMap) this.homeMap.invalidateSize();
      }, 150);
    } else if (target === 'schedule') {
      this.renderHomeSchedules();
    } else if (target === 'history') {
      this.renderHomeHistory();
    }

    if (scrollTop) {
      document.getElementById('home-subsection-switcher-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  _subtabPeekTimer: null,
  _subtabInterval: null,

  // Auto-Slide & Peek Feature for Mobile Sub-section Buttons
  initHomeSubtabAutoSlide() {
    const track = document.getElementById('home-subtab-track');
    if (!track) return;

    // Auto-slide peek on mobile:
    // Saat user membuka halaman Home pada HP, track secara otomatis geser halus ke kanan
    // untuk memperlihatkan button History & Arsip agar user tahu ada lebih dari 2 button section!
    if (this._subtabPeekTimer) clearTimeout(this._subtabPeekTimer);
    this._subtabPeekTimer = setTimeout(() => {
      if (this.currentView !== 'home') return;
      const maxScroll = track.scrollWidth - track.clientWidth;
      if (maxScroll > 10) {
        // 1. Auto slide ke kanan (peek tombol History & Arsip)
        track.scrollTo({ left: maxScroll, behavior: 'smooth' });

        // 2. Tahan sebentar lalu auto slide kembali ke tab aktif
        setTimeout(() => {
          if (this.currentView !== 'home') return;
          this.scrollActiveHomeSubtabIntoView();
        }, 1300);
      }
    }, 650);

    // Subtle auto-peek reminder berkala setiap 9 detik jika masih di section overview
    if (this._subtabInterval) clearInterval(this._subtabInterval);
    this._subtabInterval = setInterval(() => {
      if (this.currentView !== 'home' || this.currentHomeSubSection !== 'overview') return;
      const maxScroll = track.scrollWidth - track.clientWidth;
      if (maxScroll > 10 && track.scrollLeft <= 5) {
        track.scrollTo({ left: Math.min(80, maxScroll), behavior: 'smooth' });
        setTimeout(() => {
          if (this.currentHomeSubSection === 'overview') {
            track.scrollTo({ left: 0, behavior: 'smooth' });
          }
        }, 1000);
      }
    }, 9000);
  },

  scrollActiveHomeSubtabIntoView() {
    const track = document.getElementById('home-subtab-track');
    const activeBtn = document.getElementById(`home-subtab-btn-${this.currentHomeSubSection || 'overview'}`);
    if (track && activeBtn) {
      const trackRect = track.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      const offset = (btnRect.left - trackRect.left) + track.scrollLeft - (track.clientWidth / 2) + (btnRect.width / 2);
      track.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
    }
  },

  updateHomeSubSectionPills() {
    const todayStr = this.getLocalDateISO();
    let schedules = window.FMCUData.getSchedules();
    let reports = window.FMCUData.getReports();

    if (this.currentUser && (this.isAuditorUser(this.currentUser) || !this.hasAuthority('manage_schedule'))) {
      schedules = schedules.filter((s) => this.isScheduleOwnedByUser(s, this.currentUser));
      reports = reports.filter((r) => !this.currentUser.name || r.auditorName === this.currentUser.name);
    }

    const activeSchedules = schedules.filter((s) => {
      const isPast = s.scheduledDate < todayStr;
      const isDone = s.status === 'COMPLETED' || Boolean(s.reportId) || reports.some((r) => r.storeCode === s.storeCode && r.visitDate === s.scheduledDate);
      return !isPast && !isDone;
    });

    const schPill = document.getElementById('home-schedule-count-pill');
    if (schPill) {
      schPill.textContent = activeSchedules.length;
    }

    const histPill = document.getElementById('home-history-count-pill');
    if (histPill) {
      histPill.textContent = reports.length;
    }
  },

  renderHomeView() {
    let savedSubSec = 'overview';
    try {
      savedSubSec = sessionStorage.getItem('fmcu_active_home_subtab') || 'overview';
    } catch (e) {}

    this.switchHomeSubSection(this.currentHomeSubSection || savedSubSec, false);
    this.renderHomeNewsSlider();
    this.renderHomeSchedules();
    this.renderHomeHistory();
    this.initOrUpdateHomeMap();
    this.updateHomeSubSectionPills();
    this.initHomeSubtabAutoSlide();
    this.updateHomeTodayVisitButtonUI();
  },

  renderAnalyticsView() {
    const isAdmin = Boolean(
      this.currentUser &&
      (this.currentUser.role === 'ADMIN_SCHEDULE' || this.currentUser.role === 'SUPER_ADMIN')
    );

    const switcherBox = document.getElementById('analytics-admin-switcher-box');
    if (switcherBox) {
      switcherBox.classList.toggle('hidden', !isAdmin);
    }

    if (isAdmin) {
      const savedSub = sessionStorage.getItem('fmcu_active_analytics_subtab');
      const targetSub = savedSub && (savedSub === 'performance' || savedSub === 'history')
        ? savedSub
        : this.currentAnalyticsSubSection || 'history';
      this.switchAnalyticsSubSection(targetSub, false);
    } else {
      const historySec = document.getElementById('analytics-subsection-history');
      const perfSec = document.getElementById('analytics-subsection-performance');
      if (historySec) historySec.classList.add('hidden');
      if (perfSec) perfSec.classList.remove('hidden');
      this.renderAnalyticsPerformance();
    }
  },

  switchAnalyticsSubSection(subSec, scrollTop = true) {
    const mode = subSec === 'performance' ? 'performance' : 'history';
    this.currentAnalyticsSubSection = mode;
    try {
      sessionStorage.setItem('fmcu_active_analytics_subtab', mode);
    } catch (e) {}

    const historySec = document.getElementById('analytics-subsection-history');
    const perfSec = document.getElementById('analytics-subsection-performance');
    const btnHistory = document.getElementById('analytics-subtab-btn-history');
    const btnPerf = document.getElementById('analytics-subtab-btn-performance');
    const countPill = document.getElementById('analytics-history-count-pill');

    if (historySec) historySec.classList.toggle('hidden', mode !== 'history');
    if (perfSec) perfSec.classList.toggle('hidden', mode !== 'performance');

    if (btnHistory) {
      btnHistory.className =
        mode === 'history'
          ? 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer bg-[#009944] text-white shadow-xs'
          : 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer text-slate-700 hover:bg-white';
    }

    if (btnPerf) {
      btnPerf.className =
        mode === 'performance'
          ? 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer bg-[#0099A6] text-white shadow-xs'
          : 'flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer text-slate-700 hover:bg-white';
    }

    if (countPill) {
      countPill.className =
        mode === 'history'
          ? 'px-1.5 py-0.2 rounded-full text-[10px] bg-white/25 text-white font-extrabold'
          : 'px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-extrabold';
    }

    if (mode === 'history') {
      this.renderAnalyticsHistory();
    } else {
      this.renderAnalyticsPerformance();
    }

    if (scrollTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },

  renderAnalyticsHistory() {
    const container = document.getElementById('analytics-history-list');
    const countPill = document.getElementById('analytics-history-count-pill');
    if (!container) return;

    const allReports = window.FMCUData.getReports();
    if (countPill) countPill.textContent = String(allReports.length);

    // Populate Visitor Filter dropdown
    const visFilterEl = document.getElementById('analytics-history-visitor-filter');
    if (visFilterEl) {
      const auditors = this.getSchedulableAuditors();
      const curVal = visFilterEl.value || 'ALL';
      visFilterEl.innerHTML =
        `<option value="ALL">Semua Visitor (${allReports.length} Laporan)</option>` +
        auditors
          .map((u) => {
            const count = allReports.filter((r) => r.auditorId === u.id || r.auditorName === u.name).length;
            return `<option value="${u.id}" ${u.id === curVal ? 'selected' : ''}>${u.name} (${count})</option>`;
          })
          .join('');
    }

    const searchQ = (document.getElementById('analytics-history-search')?.value || '').trim().toLowerCase();
    const selectedVis = document.getElementById('analytics-history-visitor-filter')?.value || 'ALL';

    const filtered = allReports.filter((r) => {
      if (selectedVis !== 'ALL' && r.auditorId !== selectedVis && r.auditorName !== selectedVis) {
        return false;
      }
      if (!searchQ) return true;
      return (
        String(r.storeName || '').toLowerCase().includes(searchQ) ||
        String(r.storeCode || '').toLowerCase().includes(searchQ) ||
        String(r.auditorName || '').toLowerCase().includes(searchQ) ||
        String(r.storeHead || '').toLowerCase().includes(searchQ) ||
        String(r.visitDate || '').toLowerCase().includes(searchQ)
      );
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="border border-dashed border-slate-200 rounded-2xl py-12 px-4 text-center space-y-2 bg-slate-50/50">
          <div class="text-3xl text-slate-300"><i class="fa-solid fa-file-circle-question"></i></div>
          <div class="text-slate-600 text-xs sm:text-sm font-bold">Tidak ada riwayat visit yang sesuai filter / pencarian.</div>
          <p class="text-xs text-slate-400">Silakan ubah filter Visitor atau kata kunci pencarian toko.</p>
        </div>
      `;
      return;
    }

    const isAdmin = Boolean(
      this.currentUser &&
      (this.currentUser.role === 'ADMIN_SCHEDULE' || this.currentUser.role === 'SUPER_ADMIN')
    );
    const canDelete = isAdmin;

    container.innerHTML = filtered
      .map((r) => {
        const obsCount = (r.observations || []).length;
        const evCount = (r.evidencePhotos || []).length;
        const dateText = r.visitDayDateFormatted || window.FMCUPdf.formatIndonesianDate(r.visitDate, true);
        return `
          <div class="border border-slate-200 hover:border-teal-300 rounded-2xl p-4 sm:p-5 bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition shadow-xs hover:shadow-sm">
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-md bg-teal-50 text-[#0099A6] font-extrabold text-xs">
                  Site ${r.storeCode} • ${r.storeType || 'CVS'}
                </span>
                <h4 class="font-extrabold text-base sm:text-lg text-slate-900">FamilyMart ${r.storeName}</h4>
                <span class="text-xs text-slate-400">•</span>
                <span class="text-xs font-semibold text-slate-600">${dateText}</span>
              </div>

              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                <span><i class="fa-regular fa-user text-[#0099A6] mr-1"></i>Visitor: <strong>${r.auditorName || '-'}</strong></span>
                <span><i class="fa-solid fa-user-tie text-emerald-600 mr-1"></i>Store Head: <strong>${r.storeHead || '-'}</strong></span>
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

              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 shrink-0">
              ${
                isAdmin
                  ? `
                <a href="${r.storeFolderUrl || r.visitorFolderUrl || 'https://drive.google.com/drive/u/3/folders/15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8'}" target="_blank" rel="noopener noreferrer" class="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0099A6] border border-teal-200 font-extrabold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
                  <i class="fa-solid fa-folder-open text-[#009944]"></i>
                  <span>Folder Toko</span>
                </a>
              `
                  : `
                <button type="button" onclick="FMCUApp.editReportById('${r.id}')" class="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer">
                  <i class="fa-solid fa-pen mr-1"></i>Buka Form
                </button>
                <button type="button" onclick="FMCUApp.openReportPreview('${r.id}')" class="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0099A6] font-bold text-xs transition flex items-center gap-1.5 cursor-pointer">
                  <i class="fa-solid fa-display"></i>
                  <span>Preview Slide PDF</span>
                </button>
                <button type="button" onclick="FMCUApp.downloadReportById('${r.id}')" class="fm-gradient hover:opacity-95 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer">
                  <i class="fa-solid fa-file-arrow-down"></i>
                  <span>Unduh PDF</span>
                </button>
              `
              }
            </div>
          </div>
        `;
      })
      .join('');
  },

  renderAnalyticsPerformance() {
    const schedules = window.FMCUData.getSchedules();
    const reports = window.FMCUData.getReports();

    const completedSchedules = schedules.filter((s) => s.status === 'COMPLETED').length;
    const totalSchedules = schedules.length;
    const compRate = totalSchedules > 0 ? Math.round((completedSchedules / totalSchedules) * 100) : 0;
    const kpiVisEl = document.getElementById('kpi-total-visits');
    if (kpiVisEl) kpiVisEl.textContent = `${reports.length} Visit`;
    const kpiCompEl = document.getElementById('kpi-completion-rate');
    if (kpiCompEl) kpiCompEl.textContent = `${completedSchedules}/${totalSchedules} Jadwal (${compRate}%)`;

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

    const kpiFindEl = document.getElementById('kpi-total-findings');
    if (kpiFindEl) kpiFindEl.textContent = String(totalFindings);
    const kpiOpenEl = document.getElementById('kpi-open-findings');
    if (kpiOpenEl) kpiOpenEl.textContent = `${openFindings} Open • ${closedFindings} Closed`;

    const avgDur = reports.length > 0 ? Math.round(totalDuration / reports.length) : 0;
    const hrs = Math.floor(avgDur / 60);
    const mins = avgDur % 60;
    const kpiDurEl = document.getElementById('kpi-avg-duration');
    if (kpiDurEl) kpiDurEl.textContent = `${hrs}j ${mins}m`;

    const avgScore = reports.length > 0 ? (totalScore / reports.length).toFixed(1) : '0';
    const kpiScoreEl = document.getElementById('kpi-avg-score');
    if (kpiScoreEl) kpiScoreEl.textContent = `${avgScore}%`;

    this.renderAnalyticsCharts();
    this.renderUserPerformanceTable();
    this.checkAndRunSilentAiSummary();
  },

  deleteReportById(reportId) {
    const isAdmin = Boolean(
      this.currentUser &&
      (this.currentUser.role === 'ADMIN_SCHEDULE' || this.currentUser.role === 'SUPER_ADMIN')
    );
    if (!isAdmin) {
      this.showToast('Hanya Admin Jadwal dan Super Admin yang memiliki otoritas untuk menghapus history laporan visit.', 'warning');
      return;
    }

    const reports = window.FMCUData.getReports();
    const rep = reports.find((r) => String(r.id) === String(reportId));
    if (!rep) return;

    const confirmMsg = `Hapus laporan visit FamilyMart ${rep.storeName || ''} (${rep.storeCode || ''}) tanggal ${rep.visitDate || ''}?\n\nTindakan ini akan menghapus arsip PDF dan history laporan secara permanen dari database.`;
    if (!confirm(confirmMsg)) return;

    // Lepaskan tautan dari jadwal jika ada
    const schedules = window.FMCUData.getSchedules();
    let schUpdated = false;
    schedules.forEach((s) => {
      if (s.reportId === reportId || (s.storeCode === rep.storeCode && s.scheduledDate === rep.visitDate && s.status === 'COMPLETED')) {
        s.reportId = null;
        s.status = 'PENDING';
        s.actualOut = null;
        schUpdated = true;
      }
    });
    if (schUpdated) {
      window.FMCUData.saveSchedules(schedules);
    }

    window.FMCUData.deleteReport(reportId);

    // Refresh views
    this.renderAnalyticsHistory();
    this.renderHomeHistory();
    this.renderCurrentActiveView();
    this.showToast(`Laporan visit Toko ${rep.storeName} berhasil dihapus dari database!`, 'success');
  },

  showLockedScheduleNotice(storeName, scheduledDate) {
    const todayStr = this.getLocalDateISO();
    const todayFormatted = window.FMCUPdf.formatIndonesianDate(todayStr, true);
    const schFormatted = window.FMCUPdf.formatIndonesianDate(scheduledDate, true);
    this.showToast(
      `⛔ Jadwal Terkunci: Jadwal visit ke FamilyMart ${storeName} adalah ${schFormatted}. Anda hanya dapat membuka form visit pada hari aktual (hari ini: ${todayFormatted}).`,
      'warning',
      6000
    );
  },

  renderHomeSchedules() {
    const container = document.getElementById('home-schedule-list');
    if (!container) return;
    const scope = document.getElementById('schedule-filter-scope')?.value || 'ACTIVE';
    const todayStr = this.getLocalDateISO();
    let schedules = window.FMCUData.getSchedules();
    const reports = window.FMCUData.getReports();

    // User Auditor / Regional Bestie HANYA melihat jadwalnya masing-masing
    if (this.currentUser && (this.isAuditorUser(this.currentUser) || !this.hasAuthority('manage_schedule'))) {
      schedules = schedules.filter((s) => this.isScheduleOwnedByUser(s, this.currentUser));
    }

    // Helper untuk mendeteksi apakah jadwal masuk kategori ARSIP (lewat hari atau sudah pernah diisi form)
    const isScheduleArchived = (s) => {
      const isPast = String(s.scheduledDate || '') < todayStr;
      const isDone = s.status === 'COMPLETED' || Boolean(s.reportId) || reports.some((r) => r.storeCode === s.storeCode && r.visitDate === s.scheduledDate);
      return isPast || isDone;
    };

    if (scope === 'ACTIVE') {
      // Sisi user: Otomatis exclude yang sudah lewat hari atau sudah pernah diisi form
      schedules = schedules.filter((s) => !isScheduleArchived(s));
    } else if (scope === 'TODAY') {
      schedules = schedules.filter((s) => s.scheduledDate === todayStr && !isScheduleArchived(s));
    } else if (scope === 'UPCOMING') {
      schedules = schedules.filter((s) => s.scheduledDate > todayStr && !isScheduleArchived(s));
    } else if (scope === 'ARCHIVED') {
      schedules = schedules.filter((s) => isScheduleArchived(s));
    } else if (scope === 'PENDING') {
      schedules = schedules.filter((s) => s.status !== 'COMPLETED' && !s.reportId);
    } else if (scope === 'COMPLETED') {
      schedules = schedules.filter((s) => s.status === 'COMPLETED' || s.reportId);
    }

    // Urutkan jadwal toko dimulai dari tanggal terdekat untuk card pertama dan seterusnya
    schedules.sort((a, b) => {
      const dateA = String(a.scheduledDate || '');
      const dateB = String(b.scheduledDate || '');
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      return String(a.storeCode || '').localeCompare(String(b.storeCode || ''));
    });

    if (schedules.length === 0) {
      container.innerHTML = `
        <div class="col-span-full border border-dashed border-slate-200 rounded-2xl py-10 px-4 text-center space-y-1 bg-slate-50/50">
          <div class="text-slate-400 text-xs font-medium">Belum ada jadwal visit toko yang tersedia pada filter ini.</div>
        </div>
      `;
      this.updateHomeTodayVisitButtonUI();
      return;
    }

    container.innerHTML = schedules
      .map((s) => {
        const isPast = String(s.scheduledDate || '') < todayStr;
        const matchedRep = reports.find((r) => (s.reportId && r.id === s.reportId) || (r.storeCode === s.storeCode && r.visitDate === s.scheduledDate));
        const isDone = s.status === 'COMPLETED' || Boolean(s.reportId) || Boolean(matchedRep);
        const isArchived = isPast || isDone;
        const repId = s.reportId || matchedRep?.id || null;
        const dateFormatted = window.FMCUPdf.formatIndonesianDate(s.scheduledDate, true);
        return `
          <div class="border ${isArchived ? 'border-slate-200 bg-slate-50/70' : 'border-emerald-200 bg-white'} rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition">
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                  isDone
                    ? 'bg-emerald-100 text-emerald-800'
                    : isPast
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-amber-100 text-amber-800'
                }">
                  ${isDone ? '🗃️ Arsip • Selesai Visit' : isPast ? '🗃️ Arsip • Lewat Hari' : '⏳ Menunggu Visit'}
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
                  <span>Visitor: <strong>${s.auditorName}</strong></span>
                </div>
              </div>

              <p class="text-[11px] text-slate-500 bg-slate-100/80 p-2.5 rounded-xl leading-relaxed">
                ${s.auditFocus || '-'}
              </p>
            </div>

            <div class="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              ${
                isDone
                  ? `
                <div class="text-[11px] text-emerald-700 font-semibold">
                  <i class="fa-solid fa-clock-rotate-left mr-1"></i>In: ${s.actualIn || '-'} • Out: ${s.actualOut || '-'}
                </div>
                <div class="flex items-center gap-1.5">
                  ${
                    repId
                      ? `<button onclick="FMCUApp.editReportById('${repId}')" class="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer"><i class="fa-solid fa-pen mr-1"></i>Buka Form</button>
                         <button onclick="FMCUApp.openReportPreview('${repId}')" class="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0099A6] font-bold text-xs transition cursor-pointer">Lihat PDF →</button>`
                      : `<button onclick="FMCUApp.openStoreVisitForm('${s.storeCode}', '${s.id}')" class="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0099A6] font-bold text-xs transition cursor-pointer">Buka Form →</button>`
                  }
                </div>
              `
                  : isPast
                  ? `
                <div class="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                  <i class="fa-solid fa-box-archive text-slate-400"></i>
                  <span>Jadwal telah kadaluarsa & diarsipkan</span>
                </div>
              `
                  : s.scheduledDate !== todayStr && (this.isAuditorUser(this.currentUser) || !this.hasAuthority('manage_schedule'))
                  ? `
                <div class="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                  <i class="fa-solid fa-lock text-amber-600"></i>
                  <span>Jadwal Mendatang</span>
                </div>
                <button type="button" onclick="FMCUApp.showLockedScheduleNotice('${s.storeName}', '${s.scheduledDate}')" class="bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 font-bold px-3 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer">
                  <i class="fa-solid fa-lock text-amber-600"></i>
                  <span>Terkunci (Bukan Hari Ini)</span>
                </button>
              `
                  : `
                <div class="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                  <i class="fa-solid fa-satellite-dish text-emerald-600 animate-pulse"></i>
                  <span>${s.actualIn ? `In: ${s.actualIn} (Auto GPS)` : 'Auto Geofence 15m'}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <button type="button" onclick="FMCUApp.openGoogleMapsRoute('${s.storeCode}')" class="bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold px-2.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs" title="Buka Rute di Google Maps">
                    <i class="fa-solid fa-diamond-turn-right text-[#0099A6]"></i>
                    <span>Rute Maps</span>
                  </button>
                  <button onclick="FMCUApp.openStoreVisitForm('${s.storeCode}', '${s.id}')" class="fm-gradient hover:opacity-95 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer">
                    <i class="fa-solid fa-file-waveform"></i>
                    <span>Buka Form</span>
                  </button>
                </div>
              `
              }
            </div>
          </div>
        `;
      })
      .join('');
    this.updateHomeTodayVisitButtonUI();
  },


  // ==========================================================================
  // T.A.R.O (Trainer Asyik Rekan Operasional) AI
  // Persona: Observer, Senior Audit QC, & Corporate Leadership Retail FamilyMart
  // ==========================================================================
  _isAiSummaryGenerating: false,
  _taroSections: [],
  _taroActiveSlide: 0,
  _taroSlideInterval: null,
  _isTaroExpanded: false,
  _lastAiSummaryFetchTime: 0,
  _taroFullText: '',

  async checkAndRunSilentAiSummary(force = false) {
    const reports = window.FMCUData.getReports();
    const completedReports = (reports || []).filter((r) => r.visitDate && (r.storeCode || r.storeName));

    const emptyEl = document.getElementById('ai-summary-empty');
    const loadingEl = document.getElementById('ai-summary-loading');
    const containerEl = document.getElementById('taro-summary-container');
    if (loadingEl) loadingEl.classList.add('hidden');
    if (containerEl) containerEl.classList.remove('hidden');

    if (completedReports.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      if (loadingEl) loadingEl.classList.add('hidden');
      if (containerEl) containerEl.classList.add('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    // Strict fingerprint based on report IDs, findings count, and timestamps
    const fingerprint = `${completedReports.length}_${completedReports.map((r) => `${r.id || ''}:${(r.observations || []).length}:${r.updatedAt || r.visitDate || ''}`).join('|')}`;
    
    // Check localStorage cache (v3 with conversational 8-line format)
    let cached = null;
    try {
      localStorage.removeItem('fmcu_taro_ai_cache');
      localStorage.removeItem('fmcu_taro_ai_cache_v2');
      localStorage.removeItem('fmcu_taro_ai_cache_v3');
      localStorage.removeItem('fmcu_taro_ai_cache_v4');
      const raw = localStorage.getItem('fmcu_taro_ai_cache_v5');
      if (raw) cached = JSON.parse(raw);
    } catch (e) {}

    const now = Date.now();
    const TTL_MS = 60 * 60 * 1000; // 1 hour TTL
    const isCacheFresh = cached && (now - (cached.timestampMs || 0) < TTL_MS);
    const isFingerprintMatch = cached && cached.fingerprint === fingerprint;

    if (!force && isCacheFresh && isFingerprintMatch && cached.content) {
      // Instant cache hit: zero wait, zero API quota usage!
      if (loadingEl) loadingEl.classList.add('hidden');
      if (containerEl) containerEl.classList.remove('hidden');
      this.renderTaroAnalysis(cached);
      return;
    }

    // If cache exists from prior analysis, render it immediately so the user sees content
    // while we refresh quietly in the background
    if (cached && cached.content) {
      if (loadingEl) loadingEl.classList.add('hidden');
      if (containerEl) containerEl.classList.remove('hidden');
      this.renderTaroAnalysis(cached);
    } else {
      // First time generation: seamless silent generation, no bouncing loading skeleton
      if (loadingEl) loadingEl.classList.add('hidden');
      if (containerEl) containerEl.classList.remove('hidden');
      const bodyEl = document.getElementById('taro-slide-body');
      if (bodyEl && !bodyEl.innerHTML.trim()) {
        bodyEl.innerHTML = '<p class="text-xs sm:text-[13px] text-slate-500 italic">Menyusun rekapitulasi temuan observasi all visitor...</p>';
      }
    }

    // Rate-limiting / debounce: avoid spamming Gemini API if called repeatedly within 60s
    if (!force && (now - this._lastAiSummaryFetchTime < 60000)) {
      return;
    }

    // Perform silent background generation
    await this.fetchGeminiAiSummary(completedReports, fingerprint, force);
  },

  async refreshAiSummaryOverview(isUserClick = true) {
    if (this._isAiSummaryGenerating) return;
    if (isUserClick) {
      this.triggerHaptic('light');
    }
    await this.checkAndRunSilentAiSummary(true);
  },

  async fetchGeminiAiSummary(reports, fingerprint, isUserClick = false) {
    if (this._isAiSummaryGenerating) return;
    this._isAiSummaryGenerating = true;
    this._lastAiSummaryFetchTime = Date.now();

    const loadingEl = document.getElementById('ai-summary-loading');
    const containerEl = document.getElementById('taro-summary-container');

    try {
      const apiKey = window.FMCUData?.GEMINI_CONFIG?.getApiKey?.() || (typeof atob !== 'undefined' ? atob('QVEuQWI4Uk42S1M2TlhBVEFXTU9lRXVFZWNMU3NEUUlXWG5uUEpqT2FfVEtKbVVNNHMyYVE=') : '');
      const models = ['models/gemini-3.5-flash', 'models/gemini-3-flash-preview', 'models/gemini-3.8-flash'];

      // Format report data
      const dataSummaryText = this.buildReportDataForGemini(reports);

      const promptText = `Anda adalah "T.A.R.O (Trainer Asyik Rekan Operasional) AI" di FamilyMart Indonesia (FMCU).

ATURAN UTAMA (SANGAT PENTING - BUKAN STORYTELLING):
- DILARANG KERAS membuat paragraf naratif panjang / mendongeng (storytelling)!
- JANGAN menulis basa-basi pembuka yang bertele-tele (seperti "Senang sekali rasanya...", "Toko ini punya sejarah...", dll).
- FORMAT BULLET POINTS FLEKSIBEL: Sajikan analisa dalam bentuk BULLET POINTS yang ringkas, tajam, padat, dan langsung to the point.
- JUMLAH BULLET POINT FLEKSIBEL (JANGAN KONSISTEN 3, BISA SAMPAI MAKSIMAL 8): Sesuaikan banyaknya bullet points dengan temuan riil di lapangan (fleksibel mulai dari 2 hingga MAKSIMAL 8 bullet points per heading, tergantung seberapa banyak temuan/poin penting yang perlu disampaikan).
- Setiap bullet point WAJIB diawali KATA KUNCI TEBAL (bold), contoh: "- **Food Safety & Expired**: Penjelasan ringkas...".
- Gaya bahasa tetap santai, asyik, dan akrab khas teman kerja di Famima Cafe, tapi informasinya harus cepat dan mudah dibaca sekilas (scannable).
- TIDAK BERHALUSINASI: Analisis HANYA data observasi toko nyata di bawah (Quality, Service, Cleanliness, Suhu Chiller, Hot Snack, FEFO, Grooming, dll).
- ACUAN RESMI STANDAR HOLDING TIME: Jadikan data Standar Holding Time Resmi FamilyMart di atas sebagai tolok ukur utama pengawasan Food Safety, Thawing, Suhu Chiller, dan Display Hot Snack. Jika ada temuan display melewati holding time (misal Chicken Parting > 4 jam, Sosis > 4 jam, Oden > 10 jam, Biang Teh disimpan saat closing, Fresh Milk sisa closing > 24 jam di chiller, thawing suhu ruang tanpa timer digital, dll), sebutkan secara spesifik deviasi holding timenya terhadap standar resmi!

DATA OBSERVASI TOKO SELURUH VISITOR:
${dataSummaryText}

FORMAT STRUKTUR OUTPUT WAJIB (GUNAKAN PERSIS 4 HEADING DI BAWAH, DENGAN BULLET POINTS FLEKSIBEL MAKSIMAL 8 POIN PER HEADING):
### 1. Kabar Baik & Performa Toko Kita
(Sajikan 2 s/d maksimal 8 bullet points poin positif performa toko, apresiasi area bersih/rapi, keramahan crew, dan kepatuhan SOP yang sudah prima, dengan kata kunci bold di awal tiap bullet)

### 2. Catatan & Pola Temuan Kritis
(Sajikan 2 s/d maksimal 8 bullet points sesuai banyaknya temuan nyata seluruh visitor: Food Safety, suhu chiller, expired date, display hot snack, kebersihan dapur, label harga, dll, dengan kata kunci bold di awal tiap bullet)

### 3. Kenapa Bisa Terjadi? (Akar Masalah)
(Sajikan 2 s/d maksimal 8 bullet points analisa faktor penyebab: rush hour, briefing shift, rotasi FEFO, atau fasilitas, dengan kata kunci bold di awal tiap bullet)

### 4. Action Plan Asyik & Solusi Cepat 1x24 Jam
(Sajikan 2 s/d maksimal 8 bullet points rekomendasi solusi konkret 1x24 jam dan supervisi berkelanjutan yang siap dieksekusi crew toko, dengan kata kunci bold di awal tiap bullet)`;

      let aiResultText = '';
      let fetchError = null;

      const userSeed = this.currentUser?.id || this.currentUser?.username || Date.now();
      const geminiKeys = window.FMCUData?.GEMINI_CONFIG?.getAllKeys?.(userSeed) || [apiKey];

      // Rotasi multi-key Gemini untuk mencegah bentrok kuota antar user
      for (const gKey of geminiKeys) {
        if (aiResultText) break;
        for (const model of models) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${gKey}`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
              })
            });

            if (res.ok) {
              const data = await res.json();
              if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                aiResultText = data.candidates[0].content.parts[0].text;
                break;
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              fetchError = errData?.error?.message || `HTTP ${res.status}`;
            }
          } catch (e) {
            fetchError = e.message;
          }
        }
      }

      // Engine Fallback 1: Groq AI (Ultra-fast LPU inference)
      if (!aiResultText) {
        const groqKey = window.FMCUData?.GROQ_CONFIG?.getApiKey?.();
        const groqEndpoint = window.FMCUData?.GROQ_CONFIG?.endpoint || 'https://api.groq.com/openai/v1/chat/completions';
        const groqModels = window.FMCUData?.GROQ_CONFIG?.models || ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
        if (groqKey) {
          for (const gModel of groqModels) {
            try {
              const gRes = await fetch(groqEndpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${groqKey}`
                },
                body: JSON.stringify({
                  model: gModel,
                  messages: [
                    { role: 'system', content: 'Anda adalah T.A.R.O (Trainer Asyik Rekan Operasional) AI di FamilyMart Indonesia. Sajikan jawaban dalam bentuk bullet points fleksibel (2 hingga maksimal 8 bullet points sesuai kebutuhan data temuan riil) dengan kata kunci tebal di awal. Jangan bercerita naratif panjang/storytelling, langsung to the point dan mudah dibaca sekilas.' },
                    { role: 'user', content: promptText }
                  ],
                  temperature: 0.3
                })
              });
              if (gRes.ok) {
                const gData = await gRes.json();
                if (gData.choices && gData.choices[0]?.message?.content) {
                  aiResultText = gData.choices[0].message.content;
                  break;
                }
              }
            } catch (gErr) {
              console.warn('Groq AI attempt failed:', gErr);
            }
          }
        }
      }

      // Engine Fallback 2: OpenRouter AI (Universal Gateway)
      if (!aiResultText) {
        const orKey = window.FMCUData?.OPENROUTER_CONFIG?.getApiKey?.();
        const orEndpoint = window.FMCUData?.OPENROUTER_CONFIG?.endpoint || 'https://openrouter.ai/api/v1/chat/completions';
        const orModels = window.FMCUData?.OPENROUTER_CONFIG?.models || ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'liquid/lfm-2.5-2.6b:free', 'openai/gpt-4o-mini'];
        if (orKey) {
          for (const orModel of orModels) {
            try {
              const orRes = await fetch(orEndpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${orKey}`,
                  'HTTP-Referer': 'https://familymartindonesia.com',
                  'X-Title': 'FMCU Visit Report'
                },
                body: JSON.stringify({
                  model: orModel,
                  messages: [
                    { role: 'system', content: 'Anda adalah T.A.R.O (Trainer Asyik Rekan Operasional) AI di FamilyMart Indonesia. Sajikan jawaban dalam bentuk bullet points fleksibel (2 hingga maksimal 8 bullet points sesuai kebutuhan data temuan riil) dengan kata kunci tebal di awal. Jangan bercerita naratif panjang/storytelling, langsung to the point dan mudah dibaca sekilas.' },
                    { role: 'user', content: promptText }
                  ]
                })
              });
              if (orRes.ok) {
                const orData = await orRes.json();
                if (orData.choices && orData.choices[0]?.message?.content) {
                  aiResultText = orData.choices[0].message.content;
                  break;
                }
              }
            } catch (orErr) {
              console.warn('OpenRouter attempt failed:', orErr);
            }
          }
        }
      }

      // Engine Fallback 3: TokenPlus.net
      if (!aiResultText) {
        const tpKey = window.FMCUData?.TOKENPLUS_CONFIG?.getApiKey?.();
        const tpEndpoint = window.FMCUData?.TOKENPLUS_CONFIG?.endpoint || 'https://api.tokenplus.net/v1/chat/completions';
        const tpModels = window.FMCUData?.TOKENPLUS_CONFIG?.models || ['deepseek-v4-flash', 'gpt-4o-mini'];
        if (tpKey) {
          for (const tpModel of tpModels) {
            try {
              const tpRes = await fetch(tpEndpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${tpKey}`
                },
                body: JSON.stringify({
                  model: tpModel,
                  messages: [{ role: 'user', content: promptText }]
                })
              });
              if (tpRes.ok) {
                const tpData = await tpRes.json();
                if (tpData.choices && tpData.choices[0]?.message?.content) {
                  aiResultText = tpData.choices[0].message.content;
                  break;
                }
              }
            } catch (tpErr) {
              console.warn('TokenPlus attempt failed:', tpErr);
            }
          }
        }
      }

      if (!aiResultText) {
        throw new Error(fetchError || 'Gagal memperoleh respon dari AI Service');
      }

      // Parse structured sections for uniform slide carousel
      const sections = this.parseTaroSections(aiResultText);
      const renderedHtml = this.formatAiMarkdown(aiResultText);
      const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

      // Cache result
      const cacheObj = {
        fingerprint,
        content: aiResultText,
        sections,
        renderedHtml,
        timestamp: nowStr,
        timestampMs: Date.now(),
        reportCount: reports.length
      };
      try {
        localStorage.setItem('fmcu_taro_ai_cache_v5', JSON.stringify(cacheObj));
      } catch (e) {}

      if (loadingEl) loadingEl.classList.add('hidden');
      if (containerEl) containerEl.classList.remove('hidden');

      this.renderTaroAnalysis(cacheObj);

      if (isUserClick) {
        this.showToast('Analisa T.A.R.O AI berhasil diperbarui.', 'success');
      }
    } catch (err) {
      console.error('TARO AI Summary Error:', err);
      if (loadingEl) loadingEl.classList.add('hidden');
      if (containerEl) containerEl.classList.remove('hidden');

      const expandedContent = document.getElementById('taro-expanded-content');
      const slideBody = document.getElementById('taro-slide-body');
      const errHtml = `
        <div class="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
          <div class="font-bold flex items-center gap-1.5">
            <i class="fa-solid fa-triangle-exclamation text-amber-600"></i>
            <span>T.A.R.O AI sedang menunggu koneksi stabil</span>
          </div>
          <p>${err.message || 'Periksa koneksi internet untuk memperbarui analisa temuan terbaru.'}</p>
        </div>
      `;
      if (slideBody && !slideBody.innerHTML.trim()) {
        slideBody.innerHTML = errHtml;
      }
      if (expandedContent && !expandedContent.innerHTML.trim()) {
        expandedContent.innerHTML = errHtml;
      }
      if (isUserClick) {
        this.showToast(`Gagal memperbarui analisa: ${err.message}`, 'error');
      }
    } finally {
      this._isAiSummaryGenerating = false;
    }
  },

  parseTaroSections(rawText) {
    if (!rawText) return [];
    const metaList = [
      { defaultTitle: '1. Kabar Baik & Performa Toko Kita', icon: 'fa-thumbs-up', color: 'emerald' },
      { defaultTitle: '2. Catatan & Pola Temuan Kritis', icon: 'fa-triangle-exclamation', color: 'amber' },
      { defaultTitle: '3. Kenapa Bisa Terjadi? (Akar Masalah)', icon: 'fa-magnifying-glass-chart', color: 'rose' },
      { defaultTitle: '4. Action Plan Asyik & Solusi Cepat', icon: 'fa-rocket', color: 'teal' }
    ];

    // Split markdown by common heading variants:
    // Matches: ### 1., ## 1., # 1., **1., 1. **, or 1. Kabar / Catatan / Kenapa / Action
    const splitRegex = /(?:^|\n)(?=(?:#{1,4}\s+|\*\*\s*[1-4][\.\)]|[1-4][\.\)]\s+\*\*|[1-4][\.\)]\s+(?:Kabar|Catatan|Kenapa|Action)))/i;
    let chunks = rawText.split(splitRegex).map(c => c.trim()).filter(Boolean);

    // If first chunk is an unstructured intro or greeting, skip it if there are 4+ sections
    if (chunks.length > 4 && !/^(?:#{1,4}|\*\*|\d+[\.\)])/i.test(chunks[0])) {
      chunks = chunks.slice(1);
    }

    const sections = [];
    chunks.forEach((chunk, idx) => {
      if (idx >= 4) return;
      const lines = chunk.split('\n').filter(l => l.trim().length > 0);
      let rawTitle = (lines[0] || '').trim();
      const cleanTitle = rawTitle.replace(/^[#\s\*]+/, '').replace(/[\*\#]+$/, '').trim();
      const bodyLines = lines.slice(1).join('\n').trim();
      const meta = metaList[idx] || { defaultTitle: `Poin ${idx + 1}`, icon: 'fa-clipboard-check', color: 'emerald' };

      const content = bodyLines || chunk;
      const title = cleanTitle || meta.defaultTitle;

      sections.push({
        title: title || meta.defaultTitle,
        icon: meta.icon,
        color: meta.color,
        rawText: content,
        html: this.formatAiMarkdown(content)
      });
    });

    // Fallback: Jika sections kurang dari 4, pecah paragraf secara proporsional TANPA duplikasi berulang
    if (sections.length < 4) {
      const paragraphs = rawText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      for (let i = sections.length; i < 4; i++) {
        const meta = metaList[i];
        const pText = paragraphs[i] || (i === 0 ? rawText : '- Belum ada temuan tambahan pada kategori ini.');
        sections.push({
          title: meta.defaultTitle,
          icon: meta.icon,
          color: meta.color,
          rawText: pText,
          html: this.formatAiMarkdown(pText)
        });
      }
    }

    return sections;
  },

  renderTaroAnalysis(data) {
    if (!data) return;
    this._taroFullText = data.content || '';
    this._taroSections = data.sections || this.parseTaroSections(data.content);

    // Render Full Content for Expanded View
    const expandedContent = document.getElementById('taro-expanded-content');
    if (expandedContent) {
      expandedContent.innerHTML = data.renderedHtml || this.formatAiMarkdown(data.content);
    }

    // Show active slide without jumping back to 0 if already cycling
    const targetSlide = (this._taroActiveSlide >= 0 && this._taroActiveSlide < this._taroSections.length)
      ? this._taroActiveSlide
      : 0;
    this.showTaroSlide(targetSlide);

    // Start auto alternating slides (no manual toggles)
    this.startTaroCarousel();
  },

  typewriterElement(el, htmlContent, onComplete) {
    if (!el) return;

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.innerHTML = htmlContent;
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    el.innerHTML = htmlContent;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const textItems = [];
    let textNode;
    while ((textNode = walker.nextNode())) {
      const fullText = textNode.nodeValue;
      if (fullText && fullText.trim().length > 0) {
        textItems.push({
          node: textNode,
          fullText: fullText,
          pos: 0
        });
        textNode.nodeValue = '';
      }
    }

    if (textItems.length === 0) {
      el.innerHTML = htmlContent;
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const cursor = document.createElement('span');
    cursor.className = 'taro-typewriter-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    el.appendChild(cursor);

    let currentIdx = 0;
    let isCancelled = false;
    const charsPerTick = 8; // Ultra-snappy typewriter speed (handles up to 8 bullets in ~1s)
    const tickIntervalMs = 10;

    const intervalId = setInterval(() => {
      if (isCancelled) {
        clearInterval(intervalId);
        cursor.remove();
        return;
      }

      if (currentIdx >= textItems.length) {
        clearInterval(intervalId);
        cursor.remove();
        if (this._activeTaroTypewriter?.intervalId === intervalId) {
          this._activeTaroTypewriter = null;
        }
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      const currentItem = textItems[currentIdx];
      currentItem.pos = Math.min(currentItem.pos + charsPerTick, currentItem.fullText.length);
      currentItem.node.nodeValue = currentItem.fullText.slice(0, currentItem.pos);

      if (currentItem.node.parentNode) {
        currentItem.node.parentNode.insertBefore(cursor, currentItem.node.nextSibling);
      }

      if (currentItem.pos >= currentItem.fullText.length) {
        currentIdx++;
      }
    }, tickIntervalMs);

    this._activeTaroTypewriter = {
      intervalId,
      cancel: () => {
        isCancelled = true;
        clearInterval(intervalId);
        cursor.remove();
        textItems.forEach(it => {
          if (it.node) it.node.nodeValue = it.fullText;
        });
      }
    };
  },

  showTaroSlide(index) {
    if (!this._taroSections || this._taroSections.length === 0) return;
    if (index < 0) index = 0;
    if (index >= this._taroSections.length) index = this._taroSections.length - 1;
    this._taroActiveSlide = index;

    const sec = this._taroSections[index];
    const titleEl = document.getElementById('taro-slide-title');
    const iconEl = document.getElementById('taro-slide-icon');
    const bodyEl = document.getElementById('taro-slide-body');

    if (titleEl) titleEl.textContent = sec.title;
    if (iconEl) iconEl.className = `fa-solid ${sec.icon} text-${sec.color}-600`;

    if (bodyEl) {
      if (this._activeTaroTypewriter) {
        this._activeTaroTypewriter.cancel();
        this._activeTaroTypewriter = null;
      }
      this.typewriterElement(bodyEl, sec.html);
    }

    // Update Slide Indicator Dots
    const dotsContainer = document.getElementById('taro-slide-dots');
    if (dotsContainer) {
      const dots = dotsContainer.querySelectorAll('.taro-dot');
      dots.forEach((dot, dIdx) => {
        if (dIdx === index) {
          dot.className = 'taro-dot w-2 h-2 rounded-full transition-all duration-300 bg-emerald-600 scale-125 cursor-pointer';
        } else {
          dot.className = 'taro-dot w-2 h-2 rounded-full transition-all duration-300 bg-slate-300 hover:bg-slate-400 cursor-pointer';
        }
      });
    }
  },

  nextTaroSlide() {
    if (!this._taroSections || this._taroSections.length === 0) return;
    const nextIdx = (this._taroActiveSlide + 1) % this._taroSections.length;
    this.showTaroSlide(nextIdx);
  },

  prevTaroSlide() {
    if (!this._taroSections || this._taroSections.length === 0) return;
    const prevIdx = (this._taroActiveSlide - 1 + this._taroSections.length) % this._taroSections.length;
    this.showTaroSlide(prevIdx);
  },

  startTaroCarousel() {
    if (this._taroSlideInterval) {
      clearInterval(this._taroSlideInterval);
      this._taroSlideInterval = null;
    }
    if (this._taroHoverTimeout) {
      clearTimeout(this._taroHoverTimeout);
      this._taroHoverTimeout = null;
    }
    if (this._isTaroExpanded) return;
    if (!this._taroSections || this._taroSections.length <= 1) return;

    this._taroSlideInterval = setInterval(() => {
      this.nextTaroSlide();
    }, 8500);
  },

  pauseTaroCarousel() {
    if (this._taroSlideInterval) {
      clearInterval(this._taroSlideInterval);
      this._taroSlideInterval = null;
    }
    if (this._taroHoverTimeout) {
      clearTimeout(this._taroHoverTimeout);
      this._taroHoverTimeout = null;
    }
  },

  resumeTaroCarousel() {
    if (!this._isTaroExpanded && !this._taroSlideInterval) {
      this.startTaroCarousel();
    }
  },

  toggleTaroExpand() {
    this.triggerHaptic('light');
    this._isTaroExpanded = !this._isTaroExpanded;

    const minView = document.getElementById('taro-minimized-view');
    const expView = document.getElementById('taro-expanded-view');
    const expandLabel = document.getElementById('taro-expand-label');
    const expandIcon = document.getElementById('taro-expand-icon');

    if (this._isTaroExpanded) {
      if (this._activeTaroTypewriter) {
        this._activeTaroTypewriter.cancel();
        this._activeTaroTypewriter = null;
      }
      if (minView) minView.classList.add('hidden');
      if (expView) expView.classList.remove('hidden');
      if (expandLabel) expandLabel.textContent = 'Perkecil';
      if (expandIcon) expandIcon.className = 'fa-solid fa-compress';
      this.pauseTaroCarousel();
    } else {
      if (minView) minView.classList.remove('hidden');
      if (expView) expView.classList.add('hidden');
      if (expandLabel) expandLabel.textContent = 'Perbesar';
      if (expandIcon) expandIcon.className = 'fa-solid fa-expand';
      this.showTaroSlide(this._taroActiveSlide);
      this.startTaroCarousel();
    }
  },

  taroBotGreeting() {
    this.triggerHaptic('medium');
    const floatBox = document.getElementById('taro-mascot-float-box');
    if (floatBox) {
      floatBox.classList.remove('taro-mascot-jump-anim');
      void floatBox.offsetWidth;
      floatBox.classList.add('taro-mascot-jump-anim');
      setTimeout(() => {
        if (floatBox) floatBox.classList.remove('taro-mascot-jump-anim');
      }, 700);
    }

    const greetings = [
      'Hai! Aku T.A.R.O. AI, siap mendampingi peningkatan standar QSC toko kita!',
      'Aku memantau temuan visit secara real-time untuk memastikan Food Safety & Service prima!',
      'Disiplin checklist harian dan FEFO adalah kunci operasional retail kelas dunia. Semangat Rekan Ops!',
      'Kualitas kopi Famima Cafe & display hot snack yang prima berawal dari komitmen kita bersama!'
    ];
    const randomGreet = greetings[Math.floor(Math.random() * greetings.length)];
    this.showToast(`🤖 ${randomGreet}`, 'info');
  },

  buildReportDataForGemini(reports) {
    let out = `- Total Laporan Observasi Selesai: ${reports.length} Toko\n`;
    
    // Group observations by store
    reports.forEach((r, idx) => {
      const storeTitle = r.storeName || r.storeCode || `Toko #${idx + 1}`;
      const code = r.storeCode ? `(${r.storeCode})` : '';
      const visitor = r.auditorName || 'Visitor';
      const score = r.qscScore ? `${r.qscScore}%` : '-';
      const date = r.visitDate || '-';
      const obs = r.observations || [];

      out += `\n[Toko ${idx + 1}] FamilyMart ${storeTitle} ${code}\n`;
      out += `  Visitor: ${visitor} | Tanggal: ${date} | Skor QSC: ${score} | Durasi: ${r.durationMinutes || '-'} menit\n`;
      
      const opiObs = r.opiObservations || [];
      if (opiObs.length > 0) {
        out += `  Daftar Temuan Proyek OPI (${opiObs.length} item):\n`;
        opiObs.forEach((o, oIdx) => {
          const temuan = o.temuan || 'Temuan OPI';
          const ideal = o.kondisiIdeal ? ` (Kondisi Ideal: ${o.kondisiIdeal})` : '';
          const penyebab = o.penyebab ? ` (Penyebab: ${o.penyebab})` : '';
          out += `    ${oIdx + 1}. [OPI] ${temuan}${ideal}${penyebab}\n`;
        });
      }

      if (obs.length === 0) {
        out += `  Temuan: Tidak ada temuan negatif (Area operasional bersih & sesuai SOP).\n`;
      } else {
        out += `  Daftar Temuan (${obs.length} item):\n`;
        obs.forEach((o, oIdx) => {
          const cat = o.category ? `[${o.category}] ` : '';
          const temuan = o.temuan || 'Temuan operasional';
          const ideal = o.kondisiIdeal ? ` (Kondisi Ideal: ${o.kondisiIdeal})` : '';
          const penyebab = o.penyebab ? ` (Penyebab: ${o.penyebab})` : '';
          const status = o.status || 'OPEN';
          out += `    ${oIdx + 1}. ${cat}${temuan}${ideal}${penyebab} [Status: ${status}]\n`;
        });
      }
      if (r.summary || r.notes) {
        out += `  Catatan Kesimpulan Visitor: "${r.summary || r.notes}"\n`;
      }
    });

    // Sertakan Metadata Standar Holding Time Resmi (QC) yang sedang aktif
    const standards = window.FMCUData?.getHoldingTimeStandards?.() || window.FMCU_HOLDING_TIME_R23;
    if (standards) {
      out += `\n========================================\n`;
      out += `ACUAN RESMI STANDAR HOLDING TIME & FOOD SAFETY TOKO (${standards.version || 'R23'}):\n`;
      out += `Dokumen QA: ${standards.department || 'QA & Product Improvement'} | Efektif: ${standards.effectiveDateFormatted || standards.effectiveDate || '-'}\n`;
      if (standards.generalRules && standards.generalRules.length > 0) {
        out += `Ketentuan Umum QA:\n`;
        standards.generalRules.forEach((rule, rIdx) => {
          out += `  ${rIdx + 1}. ${rule}\n`;
        });
      }
      out += `Batas Holding Time Kritis Per Kategori:\n`;
      (standards.categories || []).forEach((cat) => {
        out += `* [${cat.name}] (Suhu Alat: ${cat.machineTemp || '-'})
`;
        (cat.items || []).forEach((it) => {
          out += `  - ${it.name}: Holding ${it.holding} | Thawing: ${it.thawing} | Umur Chiller: ${it.shelfLife} | Pemanasan: ${it.cooking}\n`;
        });
      });
      out += `========================================\n`;
    }

    return out;
  },

  formatAiMarkdown(mdText) {
    if (!mdText) return '';
    let html = mdText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headings
    html = html.replace(/^### (.*$)/gim, '<div class="flex items-center gap-2 mt-4 mb-2 pt-2.5 border-t border-emerald-100 first:border-t-0 first:pt-0"><span class="w-2 h-4 rounded-full bg-[#009944]"></span><h4 class="text-xs sm:text-sm font-extrabold text-slate-900">$1</h4></div>');
    html = html.replace(/^## (.*$)/gim, '<h3 class="text-sm sm:text-base font-black text-slate-900 mt-5 mb-2 pb-1 border-b border-slate-200">$1</h3>');
    html = html.replace(/^#### (.*$)/gim, '<h5 class="text-xs font-bold text-slate-800 mt-2.5 mb-1 uppercase tracking-wider text-emerald-800">$1</h5>');

    // Horizontal rule
    html = html.replace(/^---$/gim, '<hr class="my-3 border-slate-200/80" />');

    // Bold & Italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-extrabold text-slate-900">$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em class="italic text-slate-700">$1</em>');

        // Bullet items to styled lists with custom emerald dots
    html = html.replace(/^[\*\-]\s+(.*$)/gim, '<li class="text-xs sm:text-[13px] text-slate-700 leading-relaxed flex items-start gap-2 my-1"><span class="w-1.5 h-1.5 rounded-full bg-[#009944] mt-1.5 shrink-0"></span><div class="flex-1 text-justify">$1</div></li>');
    html = html.replace(/^(\d+)\.\s+(.*$)/gim, '<li class="text-xs sm:text-[13px] text-slate-700 leading-relaxed flex items-start gap-2 my-1"><span class="font-black text-[#009944] text-[11px] shrink-0">$1.</span><div class="flex-1 text-justify">$2</div></li>');

    // Wrap consecutive li elements in ul container
    html = html.replace(/((?:<li[\s\S]*?<\/li>\s*)+)/g, '<ul class="space-y-1 my-1">$1</ul>');

// Wrap paragraphs
    html = html.split('\n\n').map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<div') || p.startsWith('<h') || p.startsWith('<li') || p.startsWith('<hr')) {
        return p;
      }
      return '<p class="text-xs sm:text-[13.5px] text-slate-700 leading-relaxed my-1.5 text-justify">' + p + '</p>';
    }).join('\n');

    return html;
  },

  copyAiSummaryText() {
    this.triggerHaptic('light');
    let textToCopy = this._taroFullText;
    if (!textToCopy) {
      try {
        const raw = localStorage.getItem('fmcu_taro_ai_cache_v5');
        if (raw) {
          const obj = JSON.parse(raw);
          textToCopy = obj.content;
        }
      } catch (e) {}
    }

    if (!textToCopy) {
      const expEl = document.getElementById('taro-expanded-content');
      textToCopy = expEl ? expEl.innerText : '';
    }

    if (!textToCopy || textToCopy.trim() === '') {
      this.showToast('Belum ada teks analisa T.A.R.O untuk disalin.', 'warning');
      return;
    }

    const header = `*T.A.R.O (Trainer Asyik Rekan Operasional) AI*\n_Rekapitulasi Analisa Temuan All Visitor FamilyMart Indonesia_\n========================================\n\n`;
    const fullMessage = header + textToCopy.trim();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullMessage).then(() => {
        this.showToast('Narasi analisa T.A.R.O AI berhasil disalin!', 'success');
      }).catch(() => {
        this.fallbackCopyText(fullMessage);
      });
    } else {
      this.fallbackCopyText(fullMessage);
    }
  },

  fallbackCopyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      this.showToast('Narasi analisa T.A.R.O AI berhasil disalin!', 'success');
    } catch (e) {
      this.showToast('Gagal menyalin teks.', 'error');
    }
    document.body.removeChild(ta);
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

    // Store Trend Chart (Komparasi Temuan: OPI vs QSC per Toko)
    const storeNames = reports.map((r) => r.storeName || r.storeCode || 'Toko');
    const storeOpiCount = reports.map((r) => {
      const opiList = (r.enableOpi !== false ? r.opiObservations : []) || [];
      return opiList.filter((o) => o && o.temuan && o.temuan.trim()).length;
    });
    const storeQscCount = reports.map((r) => {
      const qscList = (r.enableQsc !== false ? (r.qscObservations || r.observations) : []) || [];
      return qscList.filter((o) => o && o.temuan && o.temuan.trim()).length;
    });

    const totalOpi = storeOpiCount.reduce((a, b) => a + b, 0);
    const totalQsc = storeQscCount.reduce((a, b) => a + b, 0);
    const totalAll = totalOpi + totalQsc;

    const ctx2 = document.getElementById('chart-trend-stores');
    if (ctx2 && typeof Chart !== 'undefined') {
      if (this.chartStores) this.chartStores.destroy();

      // Dynamic wrapper height so bars are spacious and never cramped
      const chartWrapper = document.getElementById('chart-trend-stores-wrapper');
      if (chartWrapper) {
        const dynamicH = Math.max(260, Math.min(1200, (storeNames.length || 1) * 38 + 60));
        chartWrapper.style.height = `${dynamicH}px`;
      }

      this.chartStores = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: storeNames.length > 0 ? storeNames : ['Belum Ada Visit'],
          datasets: [
            {
              label: 'Temuan Proyek OPI',
              data: storeOpiCount.length > 0 ? storeOpiCount : [0],
              backgroundColor: '#0099A6',
              borderRadius: 6
            },
            {
              label: 'Temuan QSC',
              data: storeQscCount.length > 0 ? storeQscCount : [0],
              backgroundColor: '#009944',
              borderRadius: 6
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { boxWidth: 12, font: { size: 11, weight: 'bold' } }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { precision: 0, font: { size: 10 } },
              title: { display: true, text: 'Jumlah Temuan', font: { size: 10, weight: 'bold' } },
              grid: { color: '#f1f5f9' }
            },
            y: {
              ticks: { font: { size: 10, weight: 'bold' } },
              grid: { display: false }
            }
          }
        }
      });
    }

    const storeSummaryEl = document.getElementById('trend-stores-summary');
    if (storeSummaryEl) {
      storeSummaryEl.innerHTML = `
        <div class="bg-teal-50 border border-teal-200 rounded-xl p-2.5 text-center">
          <div class="text-[10px] uppercase font-extrabold text-teal-800">Total Temuan OPI</div>
          <div class="text-base sm:text-lg font-black text-teal-900 mt-0.5">${totalOpi}</div>
        </div>
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
          <div class="text-[10px] uppercase font-extrabold text-emerald-800">Total Temuan QSC</div>
          <div class="text-base sm:text-lg font-black text-emerald-900 mt-0.5">${totalQsc}</div>
        </div>
        <div class="bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-center">
          <div class="text-[10px] uppercase font-extrabold text-slate-700">Total Keseluruhan</div>
          <div class="text-base sm:text-lg font-black text-slate-900 mt-0.5">${totalAll}</div>
        </div>
      `;
    }
  },

  renderUserPerformanceTable() {
    // 1. SEMBUNYIKAN DARI VISITOR / REGIONAL BESTIE
    const isVisitor = this.isAuditorUser(this.currentUser);
    const perfCard = document.getElementById('analytics-user-performance-card');
    if (perfCard) {
      perfCard.classList.toggle('hidden', isVisitor);
    }
    if (isVisitor) return;

    const tbody = document.getElementById('home-user-analytics-tbody');
    if (!tbody) return;

    const users = window.FMCUData.getUsers();
    // 2. HANYA MENAMPILKAN VISITOR / REGIONAL BESTIE
    const besties = users.filter((u) => this.isAuditorUser(u));
    const schedules = window.FMCUData.getSchedules();
    const reports = window.FMCUData.getReports();

    // 3. URUTKAN BERDASARKAN JUMLAH TOKO SELESAI TERBANYAK (DESCENDING)
    besties.sort((a, b) => {
      const compA = reports.filter((r) => r.auditorId === a.id || r.auditorName === a.name).length;
      const compB = reports.filter((r) => r.auditorId === b.id || r.auditorName === b.name).length;
      if (compB !== compA) return compB - compA;
      const schA = schedules.filter((s) => this.isScheduleOwnedByUser(s, a)).length;
      const schB = schedules.filter((s) => this.isScheduleOwnedByUser(s, b)).length;
      if (schB !== schA) return schB - schA;
      return (a.name || '').localeCompare(b.name || '');
    });

    // 4. STATUS & LOKASI TERAKHIR DISAMAKAN PERSIS DENGAN HALAMAN MAPS
    tbody.innerHTML = besties
      .map((u) => {
        const assigned = schedules.filter((s) => s.auditorId === u.id || s.auditorName === u.name || this.isScheduleOwnedByUser(s, u)).length;
        const userReports = reports.filter((r) => r.auditorId === u.id || r.auditorName === u.name);
        const totalObs = userReports.reduce((acc, r) => acc + (r.observations ? r.observations.length : 0), 0);
        const stInfo = this.getBestieActualStatus(u);

        let locHtml = '';
        if (stInfo.hasActualLocation) {
          const gmapUrl = `https://www.google.com/maps/dir/?api=1&destination=${stInfo.lat},${stInfo.lng}`;
          let locDesc = '';
          if (stInfo.isExited) {
            locDesc = `<span class="text-slate-600 font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Keluar Aplikasi (${stInfo.exitTimeStr})</span>`;
          } else if (stInfo.key === 'VISITING') {
            locDesc = `<span class="text-emerald-700 font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Di Toko (${stInfo.distToStore !== null ? stInfo.distToStore + 'm' : '≤15m'})</span>`;
          } else {
            locDesc = `<span class="text-amber-700 font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Diluar Radius Toko (${stInfo.distToStore !== null ? (stInfo.distToStore < 1000 ? stInfo.distToStore + 'm' : (stInfo.distToStore/1000).toFixed(1) + 'km') : '>15m'})</span>`;
          }

          locHtml = `
            <div>
              <div class="text-[11px] font-mono font-bold text-slate-800 flex items-center gap-1.5">
                <i class="fa-solid fa-location-dot ${stInfo.isExited ? 'text-slate-400' : 'text-emerald-600'} text-xs"></i>
                <span>${stInfo.lat.toFixed(4)}, ${stInfo.lng.toFixed(4)}</span>
                <a href="${gmapUrl}" target="_blank" rel="noopener noreferrer" class="text-teal-600 hover:text-teal-800 text-[10px]" title="Buka Google Maps">
                  <i class="fa-solid fa-arrow-up-right-from-square"></i>
                </a>
              </div>
              <div class="text-[10px] mt-0.5">${locDesc} • ${stInfo.timeAgoText}</div>
            </div>
          `;
        } else {
          locHtml = `
            <div>
              <div class="text-[11px] font-mono text-slate-400 italic flex items-center gap-1">
                <i class="fa-solid fa-location-slash text-slate-300"></i>
                <span>GPS Belum Terdeteksi</span>
              </div>
              <div class="text-[10px] text-slate-400">Belum Akses Web</div>
            </div>
          `;
        }

        return `
          <tr class="hover:bg-slate-50/80 transition">
            <td class="py-3 px-4">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0" style="background:${u.avatarColor || '#0099A6'}">
                  ${(u.name || 'VS').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div class="font-bold text-slate-900">${u.name}</div>
                  <div class="text-[11px] text-slate-400">NIK: ${u.nik || '-'} • @${u.username}</div>
                </div>
              </div>
            </td>
            <td class="py-3 px-4">
              <div class="font-semibold text-slate-800">${u.roleBadge || u.role}</div>
              <div class="text-[11px] text-slate-500">${u.region || 'Jabodetabek'}</div>
            </td>
            <td class="py-3 px-4 text-center font-bold text-slate-700">${assigned} Toko</td>
            <td class="py-3 px-4 text-center">
              <span class="font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs">${userReports.length} Selesai</span>
            </td>
            <td class="py-3 px-4 text-center font-bold text-amber-700">${totalObs} Temuan</td>
            <td class="py-3 px-4">
              ${locHtml}
            </td>
            <td class="py-3 px-4 text-center">
              ${stInfo.badgeHtml}
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

    const isAdmin = Boolean(
      this.currentUser &&
        (this.currentUser.role === 'ADMIN_SCHEDULE' || this.currentUser.role === 'SUPER_ADMIN')
    );

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
                <span><i class="fa-regular fa-user text-[#0099A6] mr-1"></i>Visitor: <strong>${r.auditorName}</strong></span>
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

              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 shrink-0">
              ${
                isAdmin
                  ? `
                <a href="${r.storeFolderUrl || r.visitorFolderUrl || 'https://drive.google.com/drive/u/3/folders/15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8'}" target="_blank" rel="noopener noreferrer" class="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0099A6] border border-teal-200 font-extrabold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
                  <i class="fa-solid fa-folder-open text-[#009944]"></i>
                  <span>Folder Toko</span>
                </a>
              `
                  : `
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
              `
              }
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

  setupFormAutoDraftListeners() {
    const formEl = document.getElementById('view-form');
    if (!formEl || this._formDraftListenersAttached) return;
    this._formDraftListenersAttached = true;

    formEl.addEventListener('input', () => {
      this.triggerAutoSaveDraft();
    });
    formEl.addEventListener('change', () => {
      this.triggerAutoSaveDraft();
    });
  },

  saveCurrentFormDraft() {
    if (this._isHydratingForm) return;
    const storeCode = document.getElementById('form-store-code')?.value.trim();
    if (!storeCode || storeCode === '-' || storeCode === '') return;
    try {
      const draft = this.buildCurrentFormReportObject();
      window.FMCUData.saveStoreDraft(storeCode, draft);
    } catch (e) {
      console.warn('Draft save error:', e);
    }
  },

  triggerAutoSaveDraft() {
    if (this._draftSaveTimer) clearTimeout(this._draftSaveTimer);
    this._draftSaveTimer = setTimeout(() => {
      this.saveCurrentFormDraft();
    }, 600);
  },

  populateStoreFields(st) {
    if (!st) return;
    const sSel = document.getElementById('form-store-select');
    if (sSel) sSel.value = st.code;
    const sName = document.getElementById('form-store-name');
    if (sName) sName.value = st.name || '';
    const sCode = document.getElementById('form-store-code');
    if (sCode) sCode.value = st.code || '';
    const sType = document.getElementById('form-store-type');
    if (sType) sType.value = st.type || 'CVS';
    const sHead = document.getElementById('form-store-head');
    if (sHead) sHead.value = st.storeHead || '';
    const sAm = document.getElementById('form-area-manager');
    if (sAm) sAm.value = st.areaManager || '';
    const sRm = document.getElementById('form-regional-manager');
    if (sRm) sRm.value = st.regionalManager || '';
    const sEmail = document.getElementById('form-store-email');
    if (sEmail) sEmail.value = st.email || '';

    if (document.getElementById('form-banner-title')) {
      document.getElementById('form-banner-title').textContent = `FMCU Visit Store Report — ${st.name}`;
    }
    const badge = document.getElementById('form-banner-store-badge');
    if (badge) badge.textContent = `Kode Toko: ${st.code} (${st.type || 'CVS'})`;
    const navSub = document.getElementById('nav-form-store-subtitle');
    if (navSub) navSub.textContent = `${st.name} (${st.code})`;

    if (st.defaultCrew && st.defaultCrew.length > 0) {
      this.formCrew = JSON.parse(JSON.stringify(st.defaultCrew));
    }
    if (st.storeHead) {
      this.syncStoreHeadToCrew(st.storeHead);
    } else {
      this.renderCrewTable();
    }
  },

  restoreStoreData(targetStoreCode, scheduleId = null) {
    if (!targetStoreCode || targetStoreCode === '-') return false;
    const reports = window.FMCUData.getReports();
    const todayStr = this.getLocalDateISO();

    // 1. Cek apakah ada draft yang sedang aktif dikerjakan untuk toko ini
    const draft = window.FMCUData.getStoreDraft(targetStoreCode);
    const hasMeaningfulDraft =
      draft &&
      ((draft.observations && draft.observations.length > 0) ||
        (draft.opiObservations && draft.opiObservations.length > 0) ||
        (draft.evidencePhotos && draft.evidencePhotos.length > 0) ||
        (draft.caPhotos && draft.caPhotos.length > 0) ||
        (draft.qscScore && Number(draft.qscScore) > 0) ||
        (draft.actualIn && draft.actualIn !== '-') ||
        (draft.crewList && draft.crewList.some((c) => c.name && c.name.trim())));

    // 2. Cek laporan yang sudah ada di database / arsip untuk toko ini
    let existingRep = null;
    if (scheduleId) {
      existingRep = reports.find((r) => r.scheduleId === scheduleId);
    }
    if (!existingRep) {
      existingRep = reports.find((r) => r.storeCode === targetStoreCode && r.visitDate === todayStr);
    }

    // Jika ada laporan di arsip dan TIDAK ADA draft aktif baru, muat data laporan arsip toko ini
    if (existingRep && (!hasMeaningfulDraft || existingRep.id === draft?.id)) {
      this.loadReportObjectToForm(existingRep);
      this.hasActiveStoreForm = true;
      this.activePreviewReportId = existingRep.id;
      this.updateFormGuardVisibility();
      return true;
    }

    // Jika ada draft aktif yang sedang diedit pengguna, muat draft tersebut
    if (draft) {
      this.loadReportObjectToForm(draft);
      this.hasActiveStoreForm = true;
      this.activePreviewReportId = draft.id || '__LIVE_FORM__';
      this.updateFormGuardVisibility();
      return true;
    }

    // Jika ada existingRep (meskipun ada draft kosong), tetap muat existingRep
    if (existingRep) {
      this.loadReportObjectToForm(existingRep);
      this.hasActiveStoreForm = true;
      this.activePreviewReportId = existingRep.id;
      this.updateFormGuardVisibility();
      return true;
    }

    // 3. Hanya jika toko benar-benar baru tanpa draft dan tanpa arsip riwayat laporan sama sekali
    this.resetVisitForm(true);
    this.hasActiveStoreForm = true;
    this.activePreviewReportId = '__LIVE_FORM__';
    this.updateFormGuardVisibility();

    const stores = window.FMCUData.getStores();
    const st = stores.find((s) => s.code === targetStoreCode);
    if (st) {
      this.populateStoreFields(st);
    }
    return false;
  },

  onSelectMasterStore(storeCode) {
    if (!storeCode) return;
    const prevCode = document.getElementById('form-store-code')?.value.trim();
    if (prevCode && prevCode !== '-' && prevCode !== storeCode) {
      this.saveCurrentFormDraft();
    }

    this.restoreStoreData(storeCode, null);

    const stores = window.FMCUData.getStores();
    const st = stores.find((s) => s.code === storeCode);
    const storeName = st ? st.name : (document.getElementById('form-store-name')?.value || 'Toko Visit');

    const checkInObj = {
      storeCode: storeCode,
      storeName: storeName,
      scheduleId: document.getElementById('form-schedule-id')?.value || null,
      actualIn: document.getElementById('form-actual-in')?.value || null,
      actualOut: document.getElementById('form-actual-out')?.value || null,
      latIn: this.liveGps.lat,
      lngIn: this.liveGps.lng,
      storeLat: st?.lat || null,
      storeLng: st?.lng || null,
      startedAt: Date.now()
    };
    window.FMCUData.setActiveCheckIn(checkInObj);
    this.updateActiveCheckInUI();
    this.activePreviewReportId = '__LIVE_FORM__';
    this.checkAutomaticGeofenceInOut();
  },

  syncStoreHeadToCrew(storeHeadName) {
    if (!this.formCrew || !Array.isArray(this.formCrew)) {
      this.formCrew = [{ role: 'Store Head', name: storeHeadName || '', jobLevel: '' }];
    } else {
      const shRow = this.formCrew.find(
        (c) => c.role && c.role.toLowerCase().includes('store head')
      );
      if (shRow) {
        shRow.name = storeHeadName || '';
      } else {
        this.formCrew.unshift({ role: 'Store Head', name: storeHeadName || '', jobLevel: '' });
      }
    }
    this.renderCrewTable();
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
    const defaultAuditor = this.currentUser?.name || this.currentUser?.username || '';
    document.getElementById('form-auditor-name').value = defaultAuditor;
    document.getElementById('form-visit-date').value = todayStr;
    document.getElementById('form-qsc-score').value = '';
    document.getElementById('form-store-head').value = '';
    document.getElementById('form-area-manager').value = '';
    document.getElementById('form-regional-manager').value = '';
    document.getElementById('form-store-email').value = '';
    const caEl1 = document.getElementById('form-ca-link'); if (caEl1) caEl1.value = 'https://tinyurl.com/store-caassignment';
    document.getElementById('form-actual-in').value = '';
    document.getElementById('form-actual-out').value = '';

    if (document.getElementById('form-banner-title')) document.getElementById('form-banner-title').textContent = 'FMCU Visit Store Report';
    document.getElementById('form-banner-store-badge').textContent = 'Kode Toko: -';

    this.enableOpi = true;
    this.enableQsc = true;
    this.enableEvidence = true;
    this.enableCa = true;
    this.floatingEvidenceTarget = 'finding';

    const tOpi = document.getElementById('form-toggle-opi');
    if (tOpi) tOpi.checked = true;
    const tQsc = document.getElementById('form-toggle-qsc');
    if (tQsc) tQsc.checked = true;
    const tEv = document.getElementById('form-toggle-evidence');
    if (tEv) tEv.checked = true;
    const tCa = document.getElementById('form-toggle-ca');
    if (tCa) tCa.checked = true;

    this.formCrew = [
      { role: 'Store Head', name: '', jobLevel: '' },
      { role: 'Shift Leader', name: '', jobLevel: '' },
      { role: 'Crew Store 1', name: '', jobLevel: '' },
      { role: 'Crew Store 2', name: '', jobLevel: '' }
    ];

    const qscTs = Date.now();
    this.formQscPhotos = [
      { id: `qsc-${qscTs}-1`, caption: 'Lembar Form QSC / FamiTrack #1 (Wajib)', dataUrl: '', driveFileId: '', driveUrl: '' },
      { id: `qsc-${qscTs}-2`, caption: 'Lembar Form QSC / FamiTrack #2 (Wajib)', dataUrl: '', driveFileId: '', driveUrl: '' }
    ];

    // Default card temuan kosong sesuai permintaan user
    this.formObservations = [];
    this.formOpiObservations = [];
    this.formEvidencePhotos = [];
    this.formCaPhotos = [];

    this.renderFormDynamicSections();
    this.switchFormSection(1, false);
    if (!silent) {
      this.showToast('Form berhasil dikosongkan.', 'info');
    }
  },

  loadReportObjectToForm(rep) {
    if (!rep) return;
    this._isHydratingForm = true;
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
    const caEl2 = document.getElementById('form-ca-link'); if (caEl2) caEl2.value = rep.caLink || 'https://tinyurl.com/store-caassignment';
    document.getElementById('form-actual-in').value = rep.actualIn || '';
    document.getElementById('form-actual-out').value = rep.actualOut || '';

    if (document.getElementById('form-banner-title')) document.getElementById('form-banner-title').textContent = `FMCU Visit Store Report — ${rep.storeName || '-'}`;
    document.getElementById('form-banner-store-badge').textContent = `Kode Toko: ${rep.storeCode || '-'} (${rep.storeType || 'CVS'})`;

    const navSub = document.getElementById('nav-form-store-subtitle');
    if (navSub) navSub.textContent = `${rep.storeName || 'Toko'} (${rep.storeCode || '-'})`;

    this.enableOpi = rep.enableOpi !== false;
    this.enableQsc = rep.enableQsc !== false;
    this.enableEvidence = rep.enableEvidence !== false;
    this.enableCa = rep.enableCa !== false;

    const tOpi = document.getElementById('form-toggle-opi');
    if (tOpi) tOpi.checked = this.enableOpi;
    const tQsc = document.getElementById('form-toggle-qsc');
    if (tQsc) tQsc.checked = this.enableQsc;
    const tEv = document.getElementById('form-toggle-evidence');
    if (tEv) tEv.checked = this.enableEvidence;
    const tCa = document.getElementById('form-toggle-ca');
    if (tCa) tCa.checked = this.enableCa;

    const bOpi = document.getElementById('badge-status-opi');
    if (bOpi) bOpi.textContent = this.enableOpi ? 'ON' : 'OFF';
    const bQsc = document.getElementById('badge-status-qsc');
    if (bQsc) bQsc.textContent = this.enableQsc ? 'ON' : 'OFF';
    const bEv = document.getElementById('badge-status-evidence');
    if (bEv) bEv.textContent = this.enableEvidence ? 'ON' : 'OFF';
    const bCa = document.getElementById('badge-status-ca');
    if (bCa) bCa.textContent = this.enableCa ? 'ON' : 'OFF';

    const hydratePhoto = (p) => {
      if (!p) return p;
      if (p.id === 'qsc-1' || p.id === 'qsc-2') {
        if (!p.dataUrl || !p.dataUrl.startsWith('data:image')) {
          p.dataUrl = '';
          return p;
        }
      }
      const mem = window.FMCUData?.getPhotoFromMemory?.(p.id, p.driveFileId);
      if ((!p.dataUrl || !p.dataUrl.startsWith('data:image')) && mem) {
        p.dataUrl = mem;
      }
      return p;
    };
    this.formCrew = JSON.parse(JSON.stringify(rep.crewList || []));
    let qscList = JSON.parse(JSON.stringify(rep.qscPhotos || []));
    if (!Array.isArray(qscList) || qscList.length === 0) {
      const qscTs = Date.now();
      qscList = [
        { id: `qsc-${qscTs}-1`, caption: 'Lembar Form QSC / FamiTrack #1 (Wajib)', dataUrl: '', driveFileId: '', driveUrl: '' },
        { id: `qsc-${qscTs}-2`, caption: 'Lembar Form QSC / FamiTrack #2 (Wajib)', dataUrl: '', driveFileId: '', driveUrl: '' }
      ];
    } else {
      qscList = qscList.map(hydratePhoto);
      while (qscList.length < 2) {
        const nextIdx = qscList.length;
        qscList.push({
          id: `qsc-${Date.now()}-${nextIdx + 1}`,
          caption: nextIdx === 0 ? 'Lembar Form QSC / FamiTrack #1 (Wajib)' : 'Lembar Form QSC / FamiTrack #2 (Wajib)',
          dataUrl: '',
          driveFileId: '',
          driveUrl: ''
        });
      }
    }
    this.formQscPhotos = qscList;
    this.formOpiObservations = JSON.parse(JSON.stringify(rep.opiObservations || []));
    this.formObservations = JSON.parse(JSON.stringify(rep.qscObservations || rep.observations || []));
    this.formEvidencePhotos = JSON.parse(JSON.stringify(rep.evidencePhotos || [])).map(hydratePhoto);
    this.formCaPhotos = JSON.parse(JSON.stringify(rep.caPhotos || rep.correctiveActionPhotos || [])).map(hydratePhoto);

    // Otomatis aktifkan subtab sesuai data yang ada di laporan arsip
    if (this.formOpiObservations.length > 0 && this.formObservations.length === 0) {
      this.switchObsSubSection('opi');
    } else {
      this.switchObsSubSection('qsc');
    }
    if (this.formCaPhotos.length > 0 && this.formEvidencePhotos.length === 0) {
      this.switchEvidenceSubSection('ca');
    } else {
      this.switchEvidenceSubSection('finding');
    }

    this.renderFormDynamicSections();
    this.switchFormSection(1, false);

    // Asynchronous IndexedDB photo hydration (apabila tab sempat di-refresh atau memory cache kosong)
    if (window.FMCUData && typeof window.FMCUData.getPhotoFromDb === 'function') {
      const allFormPhotos = [...this.formQscPhotos, ...this.formEvidencePhotos, ...this.formCaPhotos];
      // Hanya hydrate foto yang memang memiliki driveFileId atau driveUrl (bukan slot kosong)
      const needsHydration = allFormPhotos.filter(
        (p) => p && (!p.dataUrl || !p.dataUrl.startsWith('data:image')) && p.id !== 'qsc-1' && p.id !== 'qsc-2' && (p.driveFileId || p.driveUrl)
      );
      if (needsHydration.length > 0) {
        Promise.all(
          needsHydration.map(async (p) => {
            let b64 =
              (p.id ? await window.FMCUData.getPhotoFromDb(p.id) : '') ||
              (p.driveFileId ? await window.FMCUData.getPhotoFromDb(p.driveFileId) : '');
            if (b64 && b64.startsWith('data:image')) {
              p.dataUrl = b64;
              window.FMCUData.cachePhotoInMemory(p.id, p.driveFileId, b64);
            }
          })
        ).then(() => {
          this._isHydratingForm = false;
          this.renderFormDynamicSections();
        });
      } else {
        this._isHydratingForm = false;
      }
    } else {
      this._isHydratingForm = false;
    }
  },

  renderFormDynamicSections() {
    this.renderCrewTable();
    this.renderQscPhotosGrid();
    this.renderOpiObservationsList();
    this.renderObservationsList();
    this.renderEvidenceGrid();
    this.renderCaPhotosGrid();
  },

  // --- Sub-section Switchers for Section 2 (Observation) and Section 3 (Evidence) ---
  currentObsSubTab: 'qsc',
  currentEvidenceSubTab: 'finding',

  switchObsSubSection(tab) {
    this.currentObsSubTab = tab;
    const isQsc = tab === 'qsc';

    const tabQsc = document.getElementById('tab-btn-obs-qsc');
    const tabOpi = document.getElementById('tab-btn-obs-opi');
    const secQsc = document.getElementById('sub-sec-obs-qsc');
    const secOpi = document.getElementById('sub-sec-obs-opi');

    if (tabQsc) tabQsc.classList.toggle('active', isQsc);
    if (tabOpi) tabOpi.classList.toggle('active', !isQsc);
    if (secQsc) secQsc.classList.toggle('hidden', !isQsc);
    if (secOpi) secOpi.classList.toggle('hidden', isQsc);

    const bQsc = document.getElementById('badge-status-qsc');
    if (bQsc && this.enableQsc) {
      bQsc.className = isQsc 
        ? 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white text-emerald-800 shadow-2xs leading-none'
        : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 shadow-2xs leading-none';
    }
    const bOpi = document.getElementById('badge-status-opi');
    if (bOpi && this.enableOpi) {
      bOpi.className = !isQsc 
        ? 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white text-emerald-800 shadow-2xs leading-none'
        : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 shadow-2xs leading-none';
    }

    this.triggerHaptic('light');
  },

  switchEvidenceSubSection(tab) {
    this.currentEvidenceSubTab = tab;
    this.floatingEvidenceTarget = tab;
    const isFinding = tab === 'finding';

    const tabFinding = document.getElementById('tab-btn-ev-finding');
    const tabCa = document.getElementById('tab-btn-ev-ca');
    const secFinding = document.getElementById('sub-sec-ev-finding');
    const secCa = document.getElementById('sub-sec-ev-ca');

    if (tabFinding) tabFinding.classList.toggle('active', isFinding);
    if (tabCa) tabCa.classList.toggle('active', !isFinding);
    if (secFinding) secFinding.classList.toggle('hidden', !isFinding);
    if (secCa) secCa.classList.toggle('hidden', isFinding);

    const bFinding = document.getElementById('badge-status-evidence');
    if (bFinding && this.enableEvidence) {
      bFinding.className = isFinding
        ? 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white text-emerald-800 shadow-2xs leading-none'
        : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 shadow-2xs leading-none';
    }
    const bCa = document.getElementById('badge-status-ca');
    if (bCa && this.enableCa) {
      bCa.className = !isFinding
        ? 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white text-emerald-800 shadow-2xs leading-none'
        : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 shadow-2xs leading-none';
    }

    this.triggerHaptic('light');
  },

  addActiveObservation() {
    this.triggerHaptic('medium');
    if (this.currentObsSubTab === 'opi') {
      if (!this.enableOpi) {
        this.toggleObservationSubSection('opi', true);
      }
      this.addOpiObservationCard();
    } else {
      if (!this.enableQsc) {
        this.toggleObservationSubSection('qsc', true);
      }
      this.addObservationCard();
    }
  },

  handleFloatingCameraClick() {
    const input = document.getElementById('fab-camera-input');
    if (input) {
      input.value = '';
      input.click();
    }
  },

  handleFloatingGalleryClick() {
    const input = document.getElementById('fab-gallery-input');
    if (input) {
      input.value = '';
      input.click();
    }
  },

  // Toggle Sub-sections Observation & Evidence
  toggleObservationSubSection(type, isChecked) {
    if (type === 'opi') {
      this.enableOpi = isChecked;
      const badge = document.getElementById('badge-status-opi');
      if (badge) {
        badge.textContent = isChecked ? 'ON' : 'OFF';
        badge.className = isChecked
          ? (this.currentObsSubTab === 'opi' ? 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white text-emerald-800 shadow-2xs leading-none' : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 shadow-2xs leading-none')
          : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500 shadow-2xs leading-none';
      }
      const btn = document.getElementById('btn-add-opi');
      if (btn) btn.classList.toggle('hidden', !isChecked);
      this.renderOpiObservationsList();
      this.showToast(isChecked ? 'Section Proyek OPI diaktifkan (ON)' : 'Section Proyek OPI dinonaktifkan (OFF - tidak muncul di PDF)', isChecked ? 'info' : 'warning');
    } else if (type === 'qsc') {
      this.enableQsc = isChecked;
      const badge = document.getElementById('badge-status-qsc');
      if (badge) {
        badge.textContent = isChecked ? 'ON' : 'OFF';
        badge.className = isChecked
          ? (this.currentObsSubTab === 'qsc' ? 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white text-emerald-800 shadow-2xs leading-none' : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 shadow-2xs leading-none')
          : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500 shadow-2xs leading-none';
      }
      const btn = document.getElementById('btn-add-qsc');
      if (btn) btn.classList.toggle('hidden', !isChecked);
      this.renderObservationsList();
      this.showToast(isChecked ? 'Section QSC diaktifkan (ON)' : 'Section QSC dinonaktifkan (OFF - tidak muncul di PDF)', isChecked ? 'info' : 'warning');
    }
  },

  toggleEvidenceSubSection(type, isChecked) {
    if (type === 'evidence') {
      this.enableEvidence = isChecked;
      const badge = document.getElementById('badge-status-evidence');
      if (badge) {
        badge.textContent = isChecked ? 'ON' : 'OFF';
        badge.className = isChecked
          ? (this.currentEvidenceSubTab === 'finding' ? 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white text-emerald-800 shadow-2xs leading-none' : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 shadow-2xs leading-none')
          : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500 shadow-2xs leading-none';
      }
      this.renderEvidenceGrid();
      this.showToast(isChecked ? 'Section Foto Bukti Temuan diaktifkan (ON)' : 'Section Foto Bukti Temuan dinonaktifkan (OFF - tidak muncul di PDF)', isChecked ? 'info' : 'warning');
    } else if (type === 'ca') {
      this.enableCa = isChecked;
      const badge = document.getElementById('badge-status-ca');
      if (badge) {
        badge.textContent = isChecked ? 'ON' : 'OFF';
        badge.className = isChecked
          ? (this.currentEvidenceSubTab === 'ca' ? 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white text-emerald-800 shadow-2xs leading-none' : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 shadow-2xs leading-none')
          : 'hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500 shadow-2xs leading-none';
      }
      this.renderCaPhotosGrid();
      this.showToast(isChecked ? 'Section Foto Perbaikan (CA) diaktifkan (ON)' : 'Section Foto Perbaikan (CA) dinonaktifkan (OFF - tidak muncul di PDF)', isChecked ? 'info' : 'warning');
    }
  },

  setFloatingEvidenceTarget(target) {
    this.floatingEvidenceTarget = target;
    const btnFinding = document.getElementById('btn-fab-target-finding');
    const btnCa = document.getElementById('btn-fab-target-ca');
    if (btnFinding && btnCa) {
      if (target === 'finding') {
        btnFinding.className = 'px-2.5 py-1.5 rounded-xl bg-teal-600 text-white shadow-xs transition cursor-pointer';
        btnCa.className = 'px-2.5 py-1.5 rounded-xl text-slate-300 hover:text-white transition cursor-pointer';
      } else {
        btnFinding.className = 'px-2.5 py-1.5 rounded-xl text-slate-300 hover:text-white transition cursor-pointer';
        btnCa.className = 'px-2.5 py-1.5 rounded-xl bg-purple-600 text-white shadow-xs transition cursor-pointer';
      }
    }
    this.showToast(target === 'finding' ? 'Target upload: Foto Bukti Temuan (Evidence)' : 'Target upload: Foto Perbaikan (Corrective Action)', 'info');
  },

  async handleFloatingCameraUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    const isCa = this.currentEvidenceSubTab === 'ca' || this.floatingEvidenceTarget === 'ca';
    this.promptPhotoEdit(file, async (editedDataUrl) => {
      const storeCode = document.getElementById('form-store-code')?.value.trim() || 'STORE';
      const storeName = document.getElementById('form-store-name')?.value.trim() || 'STORE';
      const settings = window.FMCUData.getSettings();
      const applyWm = true;

      this.showToast('Memproses foto & timestamp...', 'info');
      const dataUrl = await window.FMCUPdf.processAndStampImage(editedDataUrl, {
        storeName,
        gpsLat: this.liveGps.lat,
        gpsLng: this.liveGps.lng,
        applyWatermark: applyWm
      });

      if (isCa) {
        if (!this.formCaPhotos) this.formCaPhotos = [];
        const caObj = {
          id: 'ca-' + Date.now(),
          description: '',
          dataUrl,
          driveFileId: '',
          driveUrl: '',
          _uploading: true
        };
        window.FMCUData.cachePhotoInMemory(caObj.id, null, dataUrl);
        this.formCaPhotos.push(caObj);
        this.renderCaPhotosGrid();
        this.saveCurrentFormDraft();
        await window.FMCUData.uploadPhotoToGDrive(caObj, {
          storeCode,
          storeName,
          photoType: 'CORRECTIVE_ACTION'
        });
        caObj._uploading = false;
        this.renderCaPhotosGrid();
        this.saveCurrentFormDraft();
        this.showToast('Foto perbaikan (CA) berhasil ditambahkan!', 'success');
      } else {
        if (!this.formEvidencePhotos) this.formEvidencePhotos = [];
        const evObj = {
          id: 'ev-' + Date.now(),
          description: '',
          dataUrl,
          driveFileId: '',
          driveUrl: '',
          _uploading: true
        };
        window.FMCUData.cachePhotoInMemory(evObj.id, null, dataUrl);
        this.formEvidencePhotos.push(evObj);
        this.renderEvidenceGrid();
        this.saveCurrentFormDraft();
        await window.FMCUData.uploadPhotoToGDrive(evObj, {
          storeCode,
          storeName,
          photoType: 'EVIDENCE'
        });
        evObj._uploading = false;
        this.renderEvidenceGrid();
        this.saveCurrentFormDraft();
        this.showToast('Foto bukti temuan berhasil ditambahkan!', 'success');
      }
      this.updateFormProgress();
    });
  },

  async handleFloatingGalleryUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    event.target.value = '';
    const isCa = this.currentEvidenceSubTab === 'ca' || this.floatingEvidenceTarget === 'ca';

    const processFile = (file) => {
      return new Promise((resolve) => {
        this.promptPhotoEdit(file, async (editedDataUrl) => {
          const storeCode = document.getElementById('form-store-code')?.value.trim() || 'STORE';
          const storeName = document.getElementById('form-store-name')?.value.trim() || 'STORE';
          const settings = window.FMCUData.getSettings();
          const applyWm = true;

          const dataUrl = await window.FMCUPdf.processAndStampImage(editedDataUrl, {
            storeName,
            gpsLat: this.liveGps.lat,
            gpsLng: this.liveGps.lng,
            applyWatermark: applyWm
          });

          if (isCa) {
            if (!this.formCaPhotos) this.formCaPhotos = [];
            const caObj = {
              id: 'ca-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
              description: '',
              dataUrl,
              driveFileId: '',
              driveUrl: '',
              _uploading: true
            };
            window.FMCUData.cachePhotoInMemory(caObj.id, null, dataUrl);
            this.formCaPhotos.push(caObj);
            this.renderCaPhotosGrid();
            this.saveCurrentFormDraft();
            window.FMCUData.uploadPhotoToGDrive(caObj, {
              storeCode,
              storeName,
              photoType: 'CORRECTIVE_ACTION'
            }).then(() => {
              caObj._uploading = false;
              this.renderCaPhotosGrid();
              this.saveCurrentFormDraft();
            });
          } else {
            if (!this.formEvidencePhotos) this.formEvidencePhotos = [];
            const evObj = {
              id: 'ev-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
              description: '',
              dataUrl,
              driveFileId: '',
              driveUrl: '',
              _uploading: true
            };
            window.FMCUData.cachePhotoInMemory(evObj.id, null, dataUrl);
            this.formEvidencePhotos.push(evObj);
            this.renderEvidenceGrid();
            this.saveCurrentFormDraft();
            window.FMCUData.uploadPhotoToGDrive(evObj, {
              storeCode,
              storeName,
              photoType: 'EVIDENCE'
            }).then(() => {
              evObj._uploading = false;
              this.renderEvidenceGrid();
              this.saveCurrentFormDraft();
            });
          }
          this.updateFormProgress();
          resolve();
        }, () => resolve());
      });
    };

    for (const f of files) {
      await processFile(f);
    }
    this.saveCurrentFormDraft();
    this.showToast(`${files.length} foto berhasil diproses!`, 'success');
  },

  // --- Section 1B: Crew Table ---
  renderCrewTable() {
    const tbody = document.getElementById('form-crew-tbody');
    const mobileContainer = document.getElementById('form-crew-mobile-list');
    const JOB_LEVELS = ['1A', 'NS3', 'NS2', 'NS1', 'MG3', 'MG2', 'MG1', 'OJT'];

    // 1. Mobile Responsive Card List (Tanpa geser kiri-kanan)
    if (mobileContainer) {
      mobileContainer.innerHTML = this.formCrew
        .map(
          (c, idx) => `
          <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-slate-100 text-slate-800 font-extrabold text-xs border border-slate-200 select-none">
                <i class="fa-solid ${
                  (c.role || '').toLowerCase().includes('store head')
                    ? 'fa-user-tie text-emerald-700'
                    : (c.role || '').toLowerCase().includes('leader')
                    ? 'fa-user-gear text-[#0099A6]'
                    : 'fa-user text-slate-500'
                } text-[11px] shrink-0"></i>
                <span class="truncate">${c.role || 'Crew'}</span>
              </div>
              <div class="flex items-center gap-2">
                <select onchange="FMCUApp.formCrew[${idx}].jobLevel = this.value; FMCUApp.renderCrewTable();" class="fm-input py-1 px-2 text-xs font-extrabold bg-white border border-slate-300 rounded-lg shadow-2xs cursor-pointer">
                  <option value="">-- Level --</option>
                  ${JOB_LEVELS.map(
                    (lvl) => `<option value="${lvl}" ${c.jobLevel === lvl ? 'selected' : ''}>${lvl}</option>`
                  ).join('')}
                  ${c.jobLevel && !JOB_LEVELS.includes(c.jobLevel) ? `<option value="${c.jobLevel}" selected>${c.jobLevel}</option>` : ''}
                </select>
                ${
                  idx >= 2
                    ? `
                  <button type="button" onclick="FMCUApp.removeCrewRow(${idx})" title="Hapus Crew" class="text-rose-600 hover:text-rose-700 p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 cursor-pointer transition">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                  </button>
                `
                    : `
                  <span class="text-slate-300 p-1.5 cursor-not-allowed" title="Role Wajib">
                    <i class="fa-solid fa-lock text-xs"></i>
                  </span>
                `
                }
              </div>
            </div>
            <div>
              <input type="text" value="${c.name || ''}" oninput="FMCUApp.formCrew[${idx}].name = this.value" placeholder="Nama lengkap personil" class="fm-input py-1.5 text-xs font-medium w-full" />
            </div>
          </div>
        `
        )
        .join('');
    }

    // 2. Desktop Table Body
    if (tbody) {
      tbody.innerHTML = this.formCrew
        .map(
          (c, idx) => `
          <tr class="bg-white hover:bg-slate-50/50 transition">
            <td class="p-2 sm:px-3 whitespace-nowrap w-36">
              <div class="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-slate-100 text-slate-800 font-extrabold text-xs border border-slate-200 select-none">
                <i class="fa-solid ${
                  (c.role || '').toLowerCase().includes('store head')
                    ? 'fa-user-tie text-emerald-700'
                    : (c.role || '').toLowerCase().includes('leader')
                    ? 'fa-user-gear text-[#0099A6]'
                    : 'fa-user text-slate-500'
                } text-[11px] shrink-0"></i>
                <span class="truncate">${c.role || 'Crew'}</span>
              </div>
            </td>
            <td class="p-2 sm:px-3 min-w-[150px]">
              <input type="text" value="${c.name || ''}" oninput="FMCUApp.formCrew[${idx}].name = this.value" placeholder="Nama lengkap personil" class="fm-input py-1.5 text-xs font-medium w-full" />
            </td>
            <td class="p-2 sm:px-3 w-32 min-w-[105px] text-center whitespace-nowrap">
              <select onchange="FMCUApp.formCrew[${idx}].jobLevel = this.value; FMCUApp.renderCrewTable();" class="fm-input py-1.5 px-2 text-xs font-extrabold bg-white cursor-pointer text-center w-full min-w-[95px] border border-slate-300 rounded-lg shadow-2xs">
                <option value="">-- Level --</option>
                ${JOB_LEVELS.map(
                  (lvl) => `<option value="${lvl}" ${c.jobLevel === lvl ? 'selected' : ''}>${lvl}</option>`
                ).join('')}
                ${c.jobLevel && !JOB_LEVELS.includes(c.jobLevel) ? `<option value="${c.jobLevel}" selected>${c.jobLevel}</option>` : ''}
              </select>
            </td>
            <td class="p-2 text-center whitespace-nowrap">
              ${
                idx >= 2
                  ? `
                <button type="button" onclick="FMCUApp.removeCrewRow(${idx})" title="Hapus Baris Crew" class="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              `
                  : `
                <span class="text-slate-300 text-xs cursor-not-allowed" title="Role Wajib (Tidak bisa dihapus)">
                  <i class="fa-solid fa-lock"></i>
                </span>
              `
              }
            </td>
          </tr>
        `
        )
        .join('');
    }
  },

  addCrewRow() {
    const nextNum = this.formCrew.length - 1;
    this.formCrew.push({
      role: `Crew Store ${nextNum}`,
      name: '',
      jobLevel: '1A'
    });
    this.renderCrewTable();
    this.saveCurrentFormDraft();
  },

  removeCrewRow(idx) {
    if (idx < 2) return;
    this.formCrew.splice(idx, 1);
    this.renderCrewTable();
    this.saveCurrentFormDraft();
  },

  syncStoreHeadToCrew(name) {
    if (this.formCrew.length > 0) {
      this.formCrew[0].name = name;
      this.renderCrewTable();
    }
  },

  // --- Section 1C: QSC Photos ---
  renderQscPhotosGrid() {
    const grid = document.getElementById('form-qsc-photos-grid');
    if (!grid) return;

    // Pastikan selalu fix tepat 2 slot (wajib 2)
    if (!Array.isArray(this.formQscPhotos) || this.formQscPhotos.length !== 2) {
      const qscTs = Date.now();
      const p0 = this.formQscPhotos?.[0] || { id: `qsc-${qscTs}-1`, caption: 'Lembar Form QSC / FamiTrack #1 (Wajib)', dataUrl: '', driveFileId: '', driveUrl: '' };
      const p1 = this.formQscPhotos?.[1] || { id: `qsc-${qscTs}-2`, caption: 'Lembar Form QSC / FamiTrack #2 (Wajib)', dataUrl: '', driveFileId: '', driveUrl: '' };
      this.formQscPhotos = [p0, p1];
    }

    grid.innerHTML = this.formQscPhotos
      .map((p, idx) => {
        // Jika slot belum memiliki dataUrl/driveFileId tetapi memiliki id legacy qsc-1/qsc-2, perbarui id-nya
        if ((!p.dataUrl || !p.dataUrl.startsWith('data:image')) && !p.driveFileId && (p.id === 'qsc-1' || p.id === 'qsc-2')) {
          p.id = `qsc-${Date.now()}-${idx + 1}`;
        }
        const displaySrc = window.FMCUPdf.getPhotoDisplaySrc(p);
        const statusBadge = p._uploading
          ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Upload ke Google Drive...</span>`
          : p.driveFileId
          ? `<a href="${p.driveViewUrl || p.driveUrl || '#'}" target="_blank" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 hover:underline"><i class="fa-brands fa-google-drive mr-1"></i>Tersimpan di Google Drive</a>`
          : displaySrc
          ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-[#0099A6]"><i class="fa-solid fa-cloud-arrow-up mr-1"></i>Siap Sync ke Google Drive</span>`
          : '';

        const slotTitle = idx === 0 ? 'Lembar Form QSC / FamiTrack #1 (Wajib)' : 'Lembar Form QSC / FamiTrack #2 (Wajib)';

        return `
        <div class="border-2 ${displaySrc ? 'border-emerald-300 bg-white' : 'border-dashed border-slate-300 bg-slate-50/70'} rounded-2xl p-4 space-y-3 transition">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-6 h-6 rounded-lg ${displaySrc ? 'bg-[#009944]' : 'bg-slate-400'} text-white text-xs font-extrabold flex items-center justify-center shrink-0 shadow-2xs">${idx + 1}</span>
              <span class="text-xs font-extrabold text-slate-800 truncate">${slotTitle}</span>
            </div>
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${displaySrc ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
              ${displaySrc ? '✓ Foto Terunggah' : '* Wajib Diisi'}
            </span>
          </div>

          <div class="w-full h-52 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center relative group">
            ${
              displaySrc
                ? `<img src="${displaySrc}" class="w-full h-full object-contain p-1 bg-slate-900/5" alt="QSC Form ${idx + 1}" />`
                : `<div class="text-center text-slate-400 text-xs p-4">
                    <i class="fa-solid fa-file-invoice text-3xl mb-1.5 text-slate-300 block"></i>
                    <span class="font-bold text-slate-600 block">Foto Lembar QSC #${idx + 1}</span>
                    <span class="text-[11px] text-slate-400">Ketuk tombol di bawah untuk mengambil foto / unggah</span>
                   </div>`
            }
            ${statusBadge ? `<div class="absolute top-2 left-2 shadow-sm">${statusBadge}</div>` : ''}
            <div class="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
              ${
                displaySrc
                  ? `<button type="button" onclick="FMCUApp.removeQscPhoto(${idx})" class="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer shadow-md transition flex items-center gap-1">
                      <i class="fa-solid fa-trash-can text-xs"></i>
                      <span>Hapus</span>
                     </button>`
                  : ''
              }
              <label class="bg-slate-900/85 hover:bg-slate-950 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl cursor-pointer shadow-md transition flex items-center gap-1.5">
                <i class="fa-solid fa-camera text-emerald-400"></i>
                <span>${displaySrc ? 'Ganti Foto' : 'Pilih Foto / Kamera'}</span>
                <input type="file" accept="image/*" onchange="FMCUApp.handleQscPhotoUpload(event, ${idx})" class="hidden" />
              </label>
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  },

  removeQscPhoto(idx) {
    if (!this.formQscPhotos || !this.formQscPhotos[idx]) return;
    const oldPhoto = this.formQscPhotos[idx];
    if (oldPhoto.id && window.FMCUData) {
      delete window.FMCUData.photoMemoryCache[oldPhoto.id];
      if (typeof window.FMCUData.deletePhotoFromDb === 'function') {
        window.FMCUData.deletePhotoFromDb(oldPhoto.id);
      }
    }
    if (oldPhoto.driveFileId && window.FMCUData) {
      delete window.FMCUData.photoMemoryCache[oldPhoto.driveFileId];
      if (typeof window.FMCUData.deletePhotoFromDb === 'function') {
        window.FMCUData.deletePhotoFromDb(oldPhoto.driveFileId);
      }
    }
    this.formQscPhotos[idx] = {
      id: `qsc-${Date.now()}-${idx + 1}`,
      caption: idx === 0 ? 'Lembar Form QSC / FamiTrack #1 (Wajib)' : 'Lembar Form QSC / FamiTrack #2 (Wajib)',
      dataUrl: '',
      driveFileId: '',
      driveUrl: '',
      _uploading: false
    };
    this.renderQscPhotosGrid();
    this.saveCurrentFormDraft();
    this.showToast(`Foto lembar QSC #${idx + 1} berhasil dikosongkan.`, 'info');
  },

  async handleQscPhotoUpload(event, idx) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    this.promptPhotoEdit(file, async (editedDataUrl) => {
      const storeCode = document.getElementById('form-store-code')?.value.trim() || 'STORE';
      const storeName = document.getElementById('form-store-name')?.value.trim() || 'STORE';
      const settings = window.FMCUData.getSettings();
      const applyWm = true;
      const dataUrl = await window.FMCUPdf.processAndStampImage(editedDataUrl, {
        storeName,
        gpsLat: this.liveGps.lat,
        gpsLng: this.liveGps.lng,
        applyWatermark: applyWm
      });
      const photoObj = this.formQscPhotos[idx];
      if (!photoObj.id || photoObj.id === 'qsc-1' || photoObj.id === 'qsc-2') {
        photoObj.id = `qsc-${Date.now()}-${idx + 1}`;
      }
      photoObj.dataUrl = dataUrl;
      photoObj.driveFileId = '';
      photoObj.driveUrl = '';
      photoObj._uploading = true;
      window.FMCUData.cachePhotoInMemory(photoObj.id, null, dataUrl);
      this.renderQscPhotosGrid();

      await window.FMCUData.uploadPhotoToGDrive(photoObj, {
        storeCode,
        storeName,
        photoType: 'QSC'
      });
      photoObj._uploading = false;
      this.renderQscPhotosGrid();
      this.saveCurrentFormDraft();
      this.showToast(
        photoObj.driveFileId
          ? `Foto lembar QSC #${idx + 1} berhasil disimpan ke Google Drive!`
          : `Foto lembar QSC #${idx + 1} berhasil disesuaikan & diproses`,
        'success'
      );
    });
  },

  // --- Section 2: OPI Project Observation Findings ---
  renderOpiObservationsList() {
    const container = document.getElementById('form-opi-observations-list');
    if (!container) return;

    // Update Quick Jump Bar for OPI
    this.renderJumpBar('opi');

    if (!this.enableOpi) {
      container.innerHTML = `
        <div class="border border-dashed border-slate-300 rounded-2xl p-4 text-center text-slate-500 bg-slate-50/70">
          <p class="font-extrabold text-xs text-slate-700">Section OPI dinonaktifkan (OFF)</p>
          <p class="text-[11px] text-slate-400 mt-0.5">Temuan proyek OPI dan dividernya tidak akan dicetak ke laporan PDF.</p>
        </div>
      `;
      return;
    }

    if (!this.formOpiObservations || this.formOpiObservations.length === 0) {
      container.innerHTML = `
        <div class="py-8 px-4 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
          <i class="fa-solid fa-clipboard-check text-slate-300 text-3xl mb-1.5 block"></i>
          <p class="text-xs font-semibold text-slate-500">Belum ada temuan observasi proyek OPI (Default Kosong)</p>
          <button type="button" onclick="FMCUApp.addOpiObservationCard()" class="mt-2 text-xs font-bold text-teal-700 hover:underline cursor-pointer">
            + Tambah Temuan OPI
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.formOpiObservations
      .map(
        (obs, idx) => `
        <div id="obs-card-opi-${idx}" class="relative bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-4 sm:p-5 shadow-xs transition space-y-4 scroll-mt-24">
          <!-- Top Right Corner Delete Button (Dengan Konfirmasi Iya / Tidak) -->
          <button type="button" onclick="FMCUApp.confirmRemoveObservation(${idx}, 'opi')" class="absolute top-3.5 right-3.5 w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition cursor-pointer" title="Hapus Temuan OPI #${idx + 1}">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>

          <!-- Card Header Info -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pr-10">
            <div class="flex items-center gap-2 flex-wrap shrink-0">
              <span class="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 font-black text-xs shrink-0">
                Temuan #${idx + 1}
              </span>
              <span class="text-[10px] font-extrabold text-teal-700 bg-teal-50/80 px-2 py-0.5 rounded-full border border-teal-200 shrink-0">
                OPI Project
              </span>
            </div>

            <div class="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl text-xs font-bold border border-slate-200 max-w-full">
              <span class="text-rose-700 text-[11px] font-extrabold whitespace-nowrap shrink-0"><i class="fa-regular fa-calendar-xmark mr-1"></i>Deadline:</span>
              <input type="date" value="${obs.deadline || ''}" onchange="FMCUApp.formOpiObservations[${idx}].deadline = this.value; FMCUApp.formOpiObservations[${idx}].deadlineFormatted = window.FMCUPdf.formatIndonesianDate(this.value, false);" class="text-xs font-bold text-rose-700 focus:outline-none bg-transparent cursor-pointer min-w-0 w-full sm:w-auto" />
            </div>
          </div>

          <!-- Clean Form Groups -->
          <div class="space-y-3">
            <div class="space-y-1">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <label class="font-extrabold text-xs text-amber-800 uppercase flex items-center gap-1">
                  <i class="fa-solid fa-triangle-exclamation text-amber-500"></i>Temuan (Finding) *
                </label>
                <div class="flex items-center gap-1.5">
                  <!-- AI Auto-Isi Button with Loading State -->
                  <button type="button" id="btn-ai-analyze-opi-${idx}" onclick="FMCUApp.autoAnalyzeFindingWithAi(${idx}, 'opi')" class="text-[10px] font-extrabold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-95 px-2.5 py-1 rounded-lg border border-teal-500/30 flex items-center gap-1.5 transition cursor-pointer shadow-2xs" title="Auto-analisa temuan dengan AI (Kondisi Ideal, Dampak, Penyebab, Tindakan, Hasil)">
                    <i class="fa-solid fa-wand-magic-sparkles text-amber-300"></i>
                    <span>Auto-Isi AI</span>
                  </button>
                  <button type="button" onclick="FMCUApp.startVoiceInput('obs-opi-temuan-${idx}', this)" class="text-[10px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-lg border border-teal-200 flex items-center gap-1 transition cursor-pointer shadow-2xs" title="Diktekan temuan dengan suara">
                    <i class="fa-solid fa-microphone text-rose-500"></i>
                    <span>Dikte</span>
                  </button>
                </div>
              </div>
              <textarea id="obs-opi-temuan-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formOpiObservations[${idx}].temuan = this.value; FMCUApp.updateFormProgress();" placeholder="Tuliskan detail temuan observasi proyek OPI..." class="fm-auto-textarea w-full bg-amber-50/30 border border-amber-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 transition">${obs.temuan || ''}</textarea>
            </div>

            <!-- AI Loading Banner Container -->
            <div id="ai-loading-box-opi-${idx}" class="hidden"></div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="space-y-1">
                <label class="font-bold text-[11px] text-slate-600 uppercase tracking-wide block">Dampak (Impact)</label>
                <textarea id="obs-opi-dampak-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formOpiObservations[${idx}].dampak = this.value" placeholder="Tuliskan dampak terhadap operasional..." class="fm-auto-textarea w-full bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-teal-500 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none transition">${obs.dampak || ''}</textarea>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-[11px] text-slate-600 uppercase tracking-wide block">Kondisi Ideal</label>
                <textarea id="obs-opi-kondisi-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formOpiObservations[${idx}].kondisiIdeal = this.value" placeholder="Tuliskan standar kondisi ideal..." class="fm-auto-textarea w-full bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-teal-500 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none transition">${obs.kondisiIdeal || ''}</textarea>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-[11px] text-slate-600 uppercase tracking-wide block">Tindakan Perbaikan (Corrective Action)</label>
                <textarea id="obs-opi-tindakan-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formOpiObservations[${idx}].tindakanPerbaikan = this.value" placeholder="Tuliskan tindakan perbaikan..." class="fm-auto-textarea w-full bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-teal-500 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none transition">${obs.tindakanPerbaikan || ''}</textarea>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-[11px] text-slate-600 uppercase tracking-wide block">Penyebab (Root Cause)</label>
                <textarea id="obs-opi-penyebab-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formOpiObservations[${idx}].penyebab = this.value" placeholder="Tuliskan akar penyebab temuan..." class="fm-auto-textarea w-full bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-teal-500 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none transition">${obs.penyebab || ''}</textarea>
              </div>

              <div class="space-y-1 md:col-span-2">
                <label class="font-bold text-[11px] text-slate-600 uppercase tracking-wide block">Hasil (Result / Follow-Up)</label>
                <textarea id="obs-opi-hasil-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formOpiObservations[${idx}].hasil = this.value" placeholder="Tuliskan hasil tindak lanjut..." class="fm-auto-textarea w-full bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-teal-500 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none transition">${obs.hasil || ''}</textarea>
              </div>
            </div>
          </div>
        </div>
      `
      )
      .join('');

    container.querySelectorAll('textarea').forEach((ta) => this.autoExpandTextarea(ta));
    this.updateFloatingJumpLabel();
  },

  // ==========================================================================
  // CONFIRM DELETE TEMUAN (OPI & QSC) - PERMINTAAN USER: KONFIRMASI IYA / TIDAK
  // ==========================================================================
  confirmRemoveObservation(idx, type = 'qsc') {
    this.triggerHaptic('medium');
    const isOpi = type === 'opi';
    const label = isOpi ? 'Temuan OPI' : 'Temuan QSC';
    const num = idx + 1;
    const isConfirmed = window.confirm(
      `Apakah Anda yakin ingin menghapus ${label} #${num}?\n\n` +
      `Tindakan ini akan menghapus detail temuan ini dari laporan visit.\n\n` +
      `Klik OK untuk IYA (Hapus), atau klik Batal untuk TIDAK.`
    );
    if (!isConfirmed) return;

    if (isOpi) {
      this.removeOpiObservationCard(idx);
    } else {
      this.removeObservationCard(idx);
    }
  },

  // ==========================================================================
  // QUICK NAVIGATE ANTAR TEMUAN (LOMPAT CEPAT TANPA BANYAK SCROLL)
  // ==========================================================================
  renderJumpBar(type = 'qsc') {
    const isOpi = type === 'opi';
    const barEl = document.getElementById(isOpi ? 'jump-bar-opi' : 'jump-bar-qsc');
    const list = isOpi ? this.formOpiObservations : this.formObservations;
    if (!barEl) return;

    if (!list || list.length < 2) {
      barEl.classList.add('hidden');
      barEl.innerHTML = '';
      return;
    }

    barEl.classList.remove('hidden');
    let pillsHtml = `
      <div class="flex items-center gap-1.5 shrink-0 pr-1">
        <span class="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
          <i class="fa-solid fa-location-arrow text-teal-600"></i>Lompat:
        </span>
      </div>
    `;

    list.forEach((_, idx) => {
      pillsHtml += `
        <button type="button" onclick="FMCUApp.scrollToObservation(${idx}, '${type}')" class="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs hover:border-teal-400 transition cursor-pointer shrink-0 active:scale-95">
          #${idx + 1}
        </button>
      `;
    });

    barEl.innerHTML = pillsHtml;
  },

  scrollToObservation(idx, type = 'qsc') {
    this.triggerHaptic('light');
    const card = document.getElementById(`obs-card-${type}-${idx}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('ring-2', 'ring-teal-500', 'transition-all');
      setTimeout(() => card.classList.remove('ring-2', 'ring-teal-500'), 1500);
      this._currentObsJumpIdx = idx;
      this.updateFloatingJumpLabel();
    }
  },

  scrollToNextObservation() {
    this.triggerHaptic('light');
    const isOpi = this.currentObsSubSection === 'opi';
    const type = isOpi ? 'opi' : 'qsc';
    const list = isOpi ? this.formOpiObservations : this.formObservations;
    if (!list || list.length === 0) return;

    if (typeof this._currentObsJumpIdx !== 'number') {
      this._currentObsJumpIdx = 0;
    } else {
      this._currentObsJumpIdx = (this._currentObsJumpIdx + 1) % list.length;
    }
    this.scrollToObservation(this._currentObsJumpIdx, type);
  },

  updateFloatingJumpLabel() {
    const isOpi = this.currentObsSubSection === 'opi';
    const list = isOpi ? this.formOpiObservations : this.formObservations;
    const btnJump = document.getElementById('btn-fab-obs-jump');
    const label = document.getElementById('floating-obs-jump-label');
    if (!btnJump) return;

    if (!list || list.length < 2) {
      btnJump.classList.add('hidden');
      return;
    }

    btnJump.classList.remove('hidden');
    const nextIdx = typeof this._currentObsJumpIdx === 'number' ? ((this._currentObsJumpIdx + 1) % list.length) : 1;
    if (label) label.textContent = `Temuan #${nextIdx + 1}`;
  },

  // ==========================================================================
  // FITUR AI ANALISIS PADA MASING-MASING TEMUAN (AUTO-ISI KONDISI IDEAL DLL)
  // Dilengkapi Multi-Engine: Groq LPU (Ultra-Fast < 1.2s), Gemini, OpenRouter,
  // dan Smart Heuristic SOP FamilyMart (0ms, 100% selalu berhasil).
  // ==========================================================================
  generateInstantHeuristicFindingAnalysis(findingText = '', category = '') {
    const text = (findingText || '').toLowerCase();
    const cat = (category || '').toLowerCase();

    // 1. Food Safety & Expired
    if (text.includes('expir') || text.includes('kadaluarsa') || text.includes('basi') || text.includes('fefo') || text.includes('fifo') || cat.includes('expired') || cat.includes('food safety')) {
      return {
        kondisiIdeal: `Seluruh produk dan bahan baku (${findingText.slice(0, 45).trim()}) wajib memiliki tanggal kedaluwarsa yang valid dan terdisplay mematuhi prinsip FEFO (First Expired, First Out).`,
        dampak: 'Berisiko fatal terhadap standar keamanan pangan (Food Safety), membahayakan kesehatan konsumen jika terbeli, dan menurunkan reputasi toko.',
        penyebab: 'Kelalaian crew dalam pengecekan rutin tanggal kedaluwarsa saat pergantian shift dan minimnya verifikasi silang (double check) FEFO saat restocking produk.',
        tindakanPerbaikan: '1. Segera tarik dan musnahkan (waste) produk expired sesuai prosedur. 2. Lakukan audit FEFO menyeluruh pada rak/chiller terkait. 3. Briefing ulang crew mengenai disiplin pengecekan daily expired checklist.',
        hasil: 'Akan dimonitoring pada visit berikutnya'
      };
    }

    // 2. Suhu Chiller / Freezer / Alat Pendingin
    if (text.includes('suhu') || text.includes('chiller') || text.includes('freezer') || text.includes('derajat') || text.includes('dingin') || text.includes('bocor') || cat.includes('suhu')) {
      return {
        kondisiIdeal: 'Suhu penyimpanan unit pendingin wajib stabil pada standar FamilyMart (Chiller: 2°C - 8°C, Freezer: -18°C s/d -20°C) dan tercatat rutin di logbook kontrol.',
        dampak: 'Kenaikan suhu menyebabkan kualitas produk chilled/frozen menurun cepat (bakteri berkembang), produk cepat rusak, serta potensi komplain pelanggan.',
        penyebab: 'Pintu chiller sering terbuka lama, kotoran menumpuk di kondensor/evaporator, atau penurunan performa kompresor/termostat pendingin.',
        tindakanPerbaikan: '1. Periksa kerapatan seal pintu dan bersihkan area ventilasi. 2. Pindahkan produk rentan ke unit cadangan jika suhu tidak kunjung stabil. 3. Laporkan segera ke tim Maintenance/Teknisi.',
        hasil: 'Akan dimonitoring pada visit berikutnya'
      };
    }

    // 3. Kebersihan, Sanitasi, Debu, Sampah, Noda, Bau
    if (text.includes('kotor') || text.includes('debu') || text.includes('sampah') || text.includes('bau') || text.includes('noda') || text.includes('pel') || text.includes('berminyak') || cat.includes('kebersihan')) {
      return {
        kondisiIdeal: 'Seluruh area operasional, display rak, meja dining, dan fasilitas toko dalam kondisi bersih, higienis, kering, dan bebas dari debu maupun bau.',
        dampak: 'Mengurangi kenyamanan belanja konsumen, menciptakan kesan toko kumuh/tidak terawat, serta berpotensi menjadi sarang kontaminasi hama/serangga.',
        penyebab: 'Pembersihan harian tidak dijalankan secara disiplin sesuai jadwal checklist kebersihan toko, terutama saat jam sibuk (rush hour).',
        tindakanPerbaikan: '1. Lakukan pembersihan dan sanitasi menyeluruh pada area temuan saat ini juga. 2. Pastikan Shift Leader mengontrol pengisian dan eksekusi checklist kebersihan per shift.',
        hasil: 'Akan dimonitoring pada visit berikutnya'
      };
    }

    // 4. Alat Takar & SOP Takaran
    if (text.includes('takar') || text.includes('jigger') || text.includes('scoop') || text.includes('gramasi') || text.includes('resep') || cat.includes('takar')) {
      return {
        kondisiIdeal: 'Seluruh peracikan produk beverage dan makanan wajib menggunakan alat takar resmi (jigger/scoop/timbangan) sesuai SOP Recipe Guide FamilyMart.',
        dampak: 'Rasa dan kualitas produk menjadi tidak konsisten (terlalu manis/hambar), berpotensi menyebabkan selisih bahan baku (HPP membengkak).',
        penyebab: 'Crew meracik dengan perkiraan tanpa alat takar demi mempercepat pelayanan saat antrean atau ketiadaan alat takar standar di station.',
        tindakanPerbaikan: '1. Sediakan alat takar standar lengkap di station barista/dapur. 2. Berikan teguran dan coaching praktik pembuatan resep sesuai takaran standar kepada seluruh crew.',
        hasil: 'Akan dimonitoring pada visit berikutnya'
      };
    }

    // 5. Holding Time & Hot Snack
    if (text.includes('holding') || text.includes('warmer') || text.includes('thawing') || text.includes('ayam') || text.includes('sosis') || text.includes('oden')) {
      return {
        kondisiIdeal: 'Seluruh produk hot snack dan makanan siap saji wajib dipajang dengan timer holding time aktif dan ditarik tepat waktu sesuai Standar Holding Time R23 resmi.',
        dampak: 'Tekstur dan cita rasa produk menurun (kering/alot/dingin), serta melanggar standar food safety FamilyMart jika melewati batas waktu holding.',
        penyebab: 'Timer digital holding time tidak dinyalakan saat produk dimasukkan ke showcase warmer, atau crew lupa membuang produk yang lewat batas jam holding.',
        tindakanPerbaikan: '1. Segera tarik dan musnahkan produk yang melewati holding time. 2. Pasang dan aktifkan timer digital setiap kali display produk baru dilakukan.',
        hasil: 'Akan dimonitoring pada visit berikutnya'
      };
    }

    // 6. Merchandising, Price Card, Label Harga
    if (text.includes('price') || text.includes('harga') || text.includes('label') || text.includes('tag') || text.includes('display') || cat.includes('price')) {
      return {
        kondisiIdeal: 'Setiap item produk yang terdisplay di rak dan chiller wajib memiliki price card / POP harga yang jelas, rapi, dan sesuai dengan master harga di POS.',
        dampak: 'Menimbulkan kebingungan pelanggan, memicu selisih paham di kasir saat pembayaran, serta melanggar regulasi kepatuhan pencantuman harga barang.',
        penyebab: 'Price card terlepas/hilang saat penataan barang atau keterlambatan pencetakan update harga promosi terbaru.',
        tindakanPerbaikan: '1. Segera cetak dan pasang price card yang sesuai. 2. Lakukan pengecekan kelengkapan label harga di seluruh lorong rak saat facing barang.',
        hasil: 'Akan dimonitoring pada visit berikutnya'
      };
    }

    // 7. Administrasi, Logbook, Checklist
    if (text.includes('logbook') || text.includes('catat') || text.includes('checklist') || text.includes('form') || cat.includes('administrasi')) {
      return {
        kondisiIdeal: 'Seluruh dokumen checklist kontrol operasional (logbook suhu, kebersihan, oil test, waste) wajib terisi lengkap, akurat, dan tepat waktu setiap shift.',
        dampak: 'Hilangnya kontrol kualitas operasional toko, risiko kegagalan audit internal, dan kesulitan melacak riwayat insiden toko.',
        penyebab: 'Crew menunda-nunda pencatatan hingga akhir shift atau menganggap remeh pengisian logbook kontrol harian.',
        tindakanPerbaikan: '1. Lengkapi pencatatan aktual hari ini. 2. Jadikan pengisian logbook sebagai syarat serah terima tugas saat pergantian shift (handover checklist).',
        hasil: 'Akan dimonitoring pada visit berikutnya'
      };
    }

    // Default Smart Contextual
    return {
      kondisiIdeal: `Kondisi operasional terkait "${findingText.slice(0, 50).trim()}" wajib sesuai dengan Standar Operasional Prosedur (SOP) FamilyMart Indonesia.`,
      dampak: 'Berpotensi mengganggu kelancaran operasional toko, menurunkan standar layanan prima, dan mempengaruhi kepuasan pelanggan.',
      penyebab: 'Kurangnya pengawasan rutin dari Shift Leader / Store Head serta kurangnya pemahaman crew terhadap kepatuhan standar kerja harian.',
      tindakanPerbaikan: '1. Lakukan tindakan perbaikan langsung pada temuan terkait hari ini. 2. Berikan arahan dan evaluasi saat briefing shift toko agar temuan tidak berulang.',
      hasil: 'Akan dimonitoring pada visit berikutnya'
    };
  },

  async callAiJsonAnalysis(findingText, category = '') {
    const promptText = `Anda adalah asisten Quality & Service Control (QSC) dan Operational Performance Improvement (OPI) FamilyMart Indonesia.
Tugas Anda menganalisa temuan observasi toko berikut:
Kategori: ${category || 'Umum / QSC'}
Temuan: "${findingText}"

Instruksi:
- Berikan analisis operasional yang tajam, profesional, dan to the point sesuai standar retail convenience store (SOP & Food Safety FamilyMart Indonesia).
- Balas HANYA dalam format JSON valid persis tanpa tanda kutip markdown backticks, dengan 5 field berikut:
{
  "kondisiIdeal": "Standar kondisi ideal yang seharusnya berlaku di toko...",
  "dampak": "Dampak risiko terhadap kualitas produk, kenyamanan pelanggan, atau operasional toko...",
  "penyebab": "Akar masalah utama mengapa temuan ini bisa terjadi...",
  "tindakanPerbaikan": "Tindakan perbaikan (corrective action) konkret dan cepat yang harus diambil crew...",
  "hasil": "Akan dimonitoring pada visit berikutnya"
}`;

    // ========================================================================
    // ENGINE 1 (PRIMARY): GROQ LPU (Ultra-Fast: ~600ms s/d 1.2 detik)
    // ========================================================================
    const groqKey = window.FMCUData?.GROQ_CONFIG?.getApiKey?.();
    const groqEndpoint = window.FMCUData?.GROQ_CONFIG?.endpoint || 'https://api.groq.com/openai/v1/chat/completions';
    const groqModels = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b'];

    if (groqKey) {
      for (const model of groqModels) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5 detik timeout ketat

          const res = await fetch(groqEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: 'system', content: 'Anda adalah asisten QSC & OPI FamilyMart Indonesia. Outputkan analisis dalam format JSON murni tanpa markdown.' },
                { role: 'user', content: promptText }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.2
            }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            const rawContent = data.choices?.[0]?.message?.content;
            if (rawContent) {
              const cleanJson = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(cleanJson);
              if (parsed.kondisiIdeal || parsed.penyebab || parsed.dampak) {
                return parsed;
              }
            }
          }
        } catch (e) {
          console.warn(`Groq model ${model} analysis failed / timeout, trying next engine:`, e);
        }
      }
    }

    // ========================================================================
    // ENGINE 2 (FALLBACK): GOOGLE GEMINI MULTI-KEY POOL (LOAD BALANCED ANTAR USER)
    // Mendukung KEY 1 s/d KEY 4 + KEY 0, berotasi otomatis jika salah satu terkena limit
    // ========================================================================
    const userSeed = this.currentUser?.id || this.currentUser?.username || Date.now();
    const geminiKeys = window.FMCUData?.GEMINI_CONFIG?.getAllKeys?.(userSeed) || [];
    const geminiModels = ['models/gemini-3.5-flash', 'models/gemini-3-flash-preview', 'models/gemini-3.8-flash'];

    for (const gKey of geminiKeys) {
      for (const model of geminiModels) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${gKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: { temperature: 0.2 }
            }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(cleanJson);
              if (parsed.kondisiIdeal || parsed.penyebab) {
                return parsed;
              }
            }
          }
        } catch (e) {
          console.warn(`Gemini key / model ${model} failed, trying next key:`, e);
        }
      }
    }

    // ========================================================================
    // ENGINE 3 (FALLBACK): OPENAI API (KEY 5)
    // ========================================================================
    const openAiKey = window.FMCUData?.OPENAI_CONFIG?.getApiKey?.();
    if (openAiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Anda adalah asisten QSC & OPI FamilyMart Indonesia. Outputkan analisis dalam format JSON murni.' },
              { role: 'user', content: promptText }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          const raw = data.choices?.[0]?.message?.content;
          if (raw) {
            const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(clean);
            if (parsed.kondisiIdeal || parsed.penyebab) return parsed;
          }
        }
      } catch (e) {}
    }

    // ========================================================================
    // ENGINE 4 (INSTANT GUARANTEE): SMART HEURISTIC SOP ENGINE (0ms, 100% RELIABLE)
    // Menjamin analisis selalu berhasil seketika tanpa loading lama jika offline/limit
    // ========================================================================
    return this.generateInstantHeuristicFindingAnalysis(findingText, category);
  },

  async autoAnalyzeFindingWithAi(idx, type = 'qsc') {
    this.triggerHaptic('light');
    const isOpi = type === 'opi';
    const list = isOpi ? this.formOpiObservations : this.formObservations;
    const obs = list[idx];
    if (!obs) return;

    const textareaEl = document.getElementById(isOpi ? `obs-opi-temuan-${idx}` : `obs-temuan-${idx}`);
    const findingText = (textareaEl ? textareaEl.value : obs.temuan || '').trim();

    if (!findingText) {
      this.showToast('Harap tuliskan Temuan terlebih dahulu sebelum menekan Auto-Isi AI.', 'warning');
      if (textareaEl) textareaEl.focus();
      return;
    }

    obs.temuan = findingText;

    const btnAi = document.getElementById(`btn-ai-analyze-${type}-${idx}`);
    const loadingBox = document.getElementById(`ai-loading-box-${type}-${idx}`);

    if (btnAi) {
      btnAi.disabled = true;
      btnAi.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-amber-300"></i><span>Menganalisis...</span>';
      btnAi.classList.add('opacity-80', 'cursor-not-allowed');
    }
    if (loadingBox) {
      loadingBox.innerHTML = `
        <div class="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 text-teal-900 text-xs shadow-2xs animate-pulse">
          <div class="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 text-xs shadow-2xs">
            <i class="fa-solid fa-brain fa-bounce"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-extrabold text-[11px] sm:text-xs text-teal-900">T.A.R.O AI sedang menganalisa temuan...</div>
            <div class="text-[9.5px] sm:text-[10px] text-teal-700 truncate">Merumuskan Kondisi Ideal, Dampak, Akar Masalah & Solusi Perbaikan</div>
          </div>
        </div>
      `;
      loadingBox.classList.remove('hidden');
    }

    try {
      const result = await this.callAiJsonAnalysis(findingText, obs.category || '');
      if (result) {
        if (result.kondisiIdeal) obs.kondisiIdeal = result.kondisiIdeal;
        if (result.dampak) obs.dampak = result.dampak;
        if (result.penyebab) obs.penyebab = result.penyebab;
        if (result.tindakanPerbaikan) obs.tindakanPerbaikan = result.tindakanPerbaikan;
        if (result.hasil) obs.hasil = result.hasil;

        const fKondisi = document.getElementById(`obs-${type}-kondisi-${idx}`);
        const fDampak = document.getElementById(`obs-${type}-dampak-${idx}`);
        const fPenyebab = document.getElementById(`obs-${type}-penyebab-${idx}`);
        const fTindakan = document.getElementById(`obs-${type}-tindakan-${idx}`);
        const fHasil = document.getElementById(`obs-${type}-hasil-${idx}`);

        if (fKondisi) { fKondisi.value = obs.kondisiIdeal; this.autoExpandTextarea(fKondisi); }
        if (fDampak) { fDampak.value = obs.dampak; this.autoExpandTextarea(fDampak); }
        if (fPenyebab) { fPenyebab.value = obs.penyebab; this.autoExpandTextarea(fPenyebab); }
        if (fTindakan) { fTindakan.value = obs.tindakanPerbaikan; this.autoExpandTextarea(fTindakan); }
        if (fHasil) { fHasil.value = obs.hasil; this.autoExpandTextarea(fHasil); }

        this.updateFormProgress();
        this.saveCurrentFormDraft();
        this.showToast(`Analisa temuan #${idx + 1} berhasil diisi otomatis oleh AI!`, 'success');
      }
    } catch (err) {
      console.error('AI Analysis Error:', err);
      this.showToast(`Gagal auto-analisa AI: ${err.message || 'Periksa koneksi'}`, 'error');
    } finally {
      if (btnAi) {
        btnAi.disabled = false;
        btnAi.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles text-amber-300"></i><span>Auto-Isi AI</span>';
        btnAi.classList.remove('opacity-80', 'cursor-not-allowed');
      }
      if (loadingBox) {
        loadingBox.classList.add('hidden');
        loadingBox.innerHTML = '';
      }
    }
  },

  addOpiObservationCard() {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (!this.formOpiObservations) this.formOpiObservations = [];
    this.formOpiObservations.push({
      id: 'opi-obs-' + Date.now(),
      category: 'OPI Project',
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
    this.renderOpiObservationsList();
    this.saveCurrentFormDraft();
  },

  removeOpiObservationCard(idx) {
    if (!this.formOpiObservations) return;
    this.formOpiObservations.splice(idx, 1);
    this.renderOpiObservationsList();
    this.updateFormProgress();
    this.saveCurrentFormDraft();
    this.showToast('Temuan OPI berhasil dihapus.', 'info');
  },

  // --- Section 2: QSC Observation Findings ---
  renderObservationsList() {
    const container = document.getElementById('form-observations-list');
    if (!container) return;

    // Update Quick Jump Bar for QSC
    this.renderJumpBar('qsc');

    if (!this.enableQsc) {
      container.innerHTML = `
        <div class="border border-dashed border-slate-300 rounded-2xl p-4 text-center text-slate-500 bg-slate-50/70">
          <p class="font-extrabold text-xs text-slate-700">Section QSC dinonaktifkan (OFF)</p>
          <p class="text-[11px] text-slate-400 mt-0.5">Temuan observasi QSC dan dividernya tidak akan dicetak ke laporan PDF.</p>
        </div>
      `;
      return;
    }

    if (!this.formObservations || this.formObservations.length === 0) {
      container.innerHTML = `
        <div class="py-8 px-4 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
          <i class="fa-solid fa-clipboard-check text-slate-300 text-3xl mb-1.5 block"></i>
          <p class="text-xs font-semibold text-slate-500">Belum ada temuan observasi QSC (Default Kosong)</p>
          <button type="button" onclick="FMCUApp.addObservationCard()" class="mt-2 text-xs font-bold text-emerald-700 hover:underline cursor-pointer">
            + Tambah Temuan QSC
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.formObservations
      .map(
        (obs, idx) => `
        <div id="obs-card-qsc-${idx}" class="relative bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-4 sm:p-5 shadow-xs transition space-y-4 scroll-mt-24">
          <!-- Top Right Corner Delete Button (Dengan Konfirmasi Iya / Tidak) -->
          <button type="button" onclick="FMCUApp.confirmRemoveObservation(${idx}, 'qsc')" class="absolute top-3.5 right-3.5 w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition cursor-pointer" title="Hapus Temuan QSC #${idx + 1}">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>

          <!-- Card Header Info -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pr-10">
            <div class="flex items-center gap-2 flex-wrap min-w-0">
              <span class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-black text-xs shrink-0">
                Temuan #${idx + 1}
              </span>
              <!-- QSC Observation Pill Badge (Sesuai format OPI) -->
              <span class="text-[10px] font-extrabold text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                QSC Observation
              </span>
              <select onchange="FMCUApp.formObservations[${idx}].category = this.value; FMCUApp.renderObservationsList();" class="text-xs font-extrabold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 cursor-pointer w-full sm:w-auto max-w-full sm:max-w-[190px] truncate">
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

            <div class="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl text-xs font-bold border border-slate-200 max-w-full">
              <span class="text-rose-700 text-[11px] font-extrabold whitespace-nowrap shrink-0"><i class="fa-regular fa-calendar-xmark mr-1"></i>Deadline:</span>
              <input type="date" value="${obs.deadline || ''}" onchange="FMCUApp.formObservations[${idx}].deadline = this.value; FMCUApp.formObservations[${idx}].deadlineFormatted = window.FMCUPdf.formatIndonesianDate(this.value, false);" class="text-xs font-bold text-rose-700 focus:outline-none bg-transparent cursor-pointer min-w-0 w-full sm:w-auto" />
            </div>
          </div>

          <!-- Clean Form Groups -->
          <div class="space-y-3">
            <div class="space-y-1">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <label class="font-extrabold text-xs text-amber-800 uppercase flex items-center gap-1">
                  <i class="fa-solid fa-triangle-exclamation text-amber-500"></i>Temuan (Finding) *
                </label>
                <div class="flex items-center gap-1.5">
                  <!-- AI Auto-Isi Button with Loading State -->
                  <button type="button" id="btn-ai-analyze-qsc-${idx}" onclick="FMCUApp.autoAnalyzeFindingWithAi(${idx}, 'qsc')" class="text-[10px] font-extrabold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-95 px-2.5 py-1 rounded-lg border border-teal-500/30 flex items-center gap-1.5 transition cursor-pointer shadow-2xs" title="Auto-analisa temuan dengan AI (Kondisi Ideal, Dampak, Penyebab, Tindakan, Hasil)">
                    <i class="fa-solid fa-wand-magic-sparkles text-amber-300"></i>
                    <span>Auto-Isi AI</span>
                  </button>
                  <button type="button" onclick="FMCUApp.startVoiceInput('obs-temuan-${idx}', this)" class="text-[10px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-lg border border-teal-200 flex items-center gap-1 transition cursor-pointer shadow-2xs" title="Diktekan temuan dengan suara">
                    <i class="fa-solid fa-microphone text-rose-500"></i>
                    <span>Dikte</span>
                  </button>
                </div>
              </div>
              <textarea id="obs-temuan-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formObservations[${idx}].temuan = this.value; FMCUApp.updateFormProgress();" placeholder="Tuliskan detail temuan observasi QSC..." class="fm-auto-textarea w-full bg-amber-50/30 border border-amber-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 transition">${obs.temuan || ''}</textarea>
            </div>

            <!-- AI Loading Banner Container -->
            <div id="ai-loading-box-qsc-${idx}" class="hidden"></div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="space-y-1">
                <label class="font-bold text-[11px] text-slate-600 uppercase tracking-wide block">Dampak (Impact)</label>
                <textarea id="obs-qsc-dampak-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formObservations[${idx}].dampak = this.value" placeholder="Tuliskan dampak terhadap kualitas..." class="fm-auto-textarea w-full bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none transition">${obs.dampak || ''}</textarea>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-[11px] text-slate-600 uppercase tracking-wide block">Kondisi Ideal</label>
                <textarea id="obs-qsc-kondisi-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formObservations[${idx}].kondisiIdeal = this.value" placeholder="Tuliskan standar kondisi ideal..." class="fm-auto-textarea w-full bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none transition">${obs.kondisiIdeal || ''}</textarea>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-[11px] text-slate-600 uppercase tracking-wide block">Tindakan Perbaikan (Corrective Action)</label>
                <textarea id="obs-qsc-tindakan-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formObservations[${idx}].tindakanPerbaikan = this.value" placeholder="Tuliskan tindakan perbaikan..." class="fm-auto-textarea w-full bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none transition">${obs.tindakanPerbaikan || ''}</textarea>
              </div>

              <div class="space-y-1">
                <label class="font-bold text-[11px] text-slate-600 uppercase tracking-wide block">Penyebab (Root Cause)</label>
                <textarea id="obs-qsc-penyebab-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formObservations[${idx}].penyebab = this.value" placeholder="Tuliskan akar penyebab temuan..." class="fm-auto-textarea w-full bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none transition">${obs.penyebab || ''}</textarea>
              </div>

              <div class="space-y-1 md:col-span-2">
                <label class="font-bold text-[11px] text-slate-600 uppercase tracking-wide block">Hasil (Result / Follow-Up)</label>
                <textarea id="obs-qsc-hasil-${idx}" rows="2" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formObservations[${idx}].hasil = this.value" placeholder="Tuliskan hasil tindak lanjut..." class="fm-auto-textarea w-full bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none transition">${obs.hasil || ''}</textarea>
              </div>
            </div>
          </div>
        </div>
      `
      )
      .join('');

    container.querySelectorAll('textarea').forEach((ta) => this.autoExpandTextarea(ta));
    this.updateFloatingJumpLabel();
  },

    addObservationCard() {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (!this.formObservations) this.formObservations = [];
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
    this.updateFormProgress();
    this.saveCurrentFormDraft();
    setTimeout(() => {
      const list = document.getElementById('form-observations-list');
      if (list && list.lastElementChild) {
        list.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  },

  removeObservationCard(idx) {
    if (!this.formObservations) return;
    this.formObservations.splice(idx, 1);
    this.renderObservationsList();
    this.updateFormProgress();
    this.saveCurrentFormDraft();
    this.showToast('Temuan QSC berhasil dihapus.', 'info');
  },

  applyFindingPreset(obsIdx, presetId) {
    if (!presetId) return;
    const preset = (window.FMCUData.FINDING_PRESETS || []).find((p) => p.id === presetId);
    if (!preset) return;
    this.formObservations[obsIdx] = {
      ...this.formObservations[obsIdx],
      category: preset.category,
      kondisiIdeal: preset.kondisiIdeal,
      penyebab: preset.rootCause || preset.penyebab || '',
      tindakanPerbaikan: preset.actionPlan || preset.tindakanPerbaikan || '',
      dampak: preset.dampak || '',
      hasil: preset.hasil || ''
    };
    this.renderObservationsList();
    this.updateFormProgress();
    this.saveCurrentFormDraft();
    this.showToast(`Template "${preset.label}" diterapkan ke temuan #${obsIdx + 1}`, 'success');
  },

  renderEvidenceGrid() {
    const grid = document.getElementById('form-evidence-grid');
    if (!grid) return;

    if (!this.enableEvidence) {
      grid.innerHTML = `
        <div class="col-span-full border-2 border-dashed border-slate-300 rounded-2xl p-5 text-center text-slate-500 bg-slate-50/70">
          <i class="fa-solid fa-power-off text-slate-400 text-lg mb-1 block"></i>
          <p class="font-extrabold text-xs text-slate-700">Section Foto Bukti Temuan dinonaktifkan (OFF)</p>
          <p class="text-[11px] text-slate-500 mt-0.5">Foto bukti temuan dan halaman dividernya tidak akan dimasukkan ke dalam laporan PDF.</p>
        </div>
      `;
      return;
    }

    if (this.formEvidencePhotos.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full border-2 border-dashed border-amber-200 bg-amber-50/20 rounded-2xl p-6 text-center text-slate-400 text-xs">
          Belum ada foto bukti temuan. Gunakan tombol kamera / galeri melayang di pojok kanan bawah untuk menambah foto secara otomatis.
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

          <div class="col-span-5 h-36 bg-slate-100 rounded-xl overflow-hidden relative flex items-center justify-center border border-slate-200 group">
            ${
              displaySrc
                ? `<img src="${displaySrc}" class="w-full h-full object-cover" alt="Evidence" />`
                : `<div class="text-center p-2"><i class="fa-solid fa-camera text-slate-300 text-xl block mb-1"></i><span class="text-[9px] text-slate-400 font-bold block leading-tight">Panduan: Rak tegak lurus</span></div>`
            }
            <div class="absolute inset-0 viewfinder-grid pointer-events-none opacity-20 group-hover:opacity-40 transition"></div>
            <label class="absolute bottom-1.5 inset-x-1.5 bg-slate-900/85 hover:bg-slate-900 text-white text-[10px] font-bold py-1 rounded text-center cursor-pointer flex items-center justify-center gap-1 shadow-sm">
              <i class="fa-solid fa-camera text-[10px]"></i>
              <span>Pilih / Foto</span>
              <input type="file" accept="image/*" capture="environment" onchange="FMCUApp.handleSingleEvidenceUpload(event, ${idx})" class="hidden" />
            </label>
          </div>

          <div class="col-span-7 flex flex-col justify-between pr-4">
            <div>
              <div class="flex items-center justify-between gap-1.5 mb-1.5 min-h-[26px]">
                <span class="text-[10px] font-black text-slate-500 uppercase tracking-wider truncate">Keterangan #${idx + 1}</span>
                <button type="button" onclick="FMCUApp.startVoiceInput('ev-desc-${idx}', this)" class="shrink-0 h-6 text-[10px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 rounded-lg border border-teal-200 flex items-center gap-1 cursor-pointer transition shadow-2xs" title="Diktekan dengan Suara">
                  <i class="fa-solid fa-microphone text-rose-500 text-[10px]"></i>
                  <span>Dikte</span>
                </button>
              </div>
              <textarea id="ev-desc-${idx}" rows="3" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formEvidencePhotos[${idx}].description = this.value; FMCUApp.updateFormProgress();" placeholder="Tuliskan deskripsi temuan foto ini..." class="fm-auto-textarea border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-teal-500">${ev.description || ''}</textarea>
              ${driveBadge}
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    grid.querySelectorAll('textarea').forEach((ta) => this.autoExpandTextarea(ta));
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
    this.saveCurrentFormDraft();
  },

  removeEvidencePhotoCard(idx) {
    this.formEvidencePhotos.splice(idx, 1);
    this.renderEvidenceGrid();
    this.saveCurrentFormDraft();
  },

  async handleSingleEvidenceUpload(event, idx) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    this.promptPhotoEdit(file, async (editedDataUrl) => {
      const storeCode = document.getElementById('form-store-code')?.value.trim() || 'STORE';
      const storeName = document.getElementById('form-store-name')?.value.trim() || 'STORE';
      const settings = window.FMCUData.getSettings();
      const applyWm = true;
      const dataUrl = await window.FMCUPdf.processAndStampImage(editedDataUrl, {
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
      this.saveCurrentFormDraft();
      this.showToast(
        evObj.driveFileId
          ? `Foto bukti #${idx + 1} berhasil disimpan ke Google Drive!`
          : `Foto bukti #${idx + 1} berhasil disesuaikan & diproses`,
        'success'
      );
    });
  },

  async handleBulkEvidenceUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    const storeCode = document.getElementById('form-store-code')?.value.trim() || 'STORE';
    const storeName = document.getElementById('form-store-name')?.value.trim() || 'STORE';
    const settings = window.FMCUData.getSettings();
    const applyWm = true;

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
    this.saveCurrentFormDraft();

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
    this.saveCurrentFormDraft();
    const uploadedCount = newCards.filter((c) => Boolean(c.driveFileId)).length;
    this.showToast(
      uploadedCount > 0
        ? `${files.length} foto bukti berhasil diunggah & disimpan ke Google Drive!`
        : `${files.length} foto bukti berhasil diunggah!`,
      'success'
    );
  },

  // --- Section 3: Corrective Action Evidence & Result Photos ---
  renderCaPhotosGrid() {
    const grid = document.getElementById('form-ca-photos-grid');
    if (!grid) return;

    if (!this.enableCa) {
      grid.innerHTML = `
        <div class="col-span-full border-2 border-dashed border-slate-300 rounded-2xl p-5 text-center text-slate-500 bg-slate-50/70">
          <i class="fa-solid fa-power-off text-slate-400 text-lg mb-1 block"></i>
          <p class="font-extrabold text-xs text-slate-700">Section Foto Perbaikan (CA) dinonaktifkan (OFF)</p>
          <p class="text-[11px] text-slate-500 mt-0.5">Foto tindakan perbaikan dan halaman dividernya tidak akan dimasukkan ke dalam laporan PDF.</p>
        </div>
      `;
      return;
    }

    if (!this.formCaPhotos || this.formCaPhotos.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full border-2 border-dashed border-purple-200 bg-purple-50/20 rounded-2xl p-6 text-center text-slate-400 text-xs">
          Belum ada foto bukti tindakan perbaikan (Corrective Action). Gunakan tombol kamera / galeri melayang di pojok kanan bawah untuk menambah foto secara otomatis.
        </div>
      `;
      return;
    }

    grid.innerHTML = this.formCaPhotos
      .map((ca, idx) => {
        const displaySrc = window.FMCUPdf.getPhotoDisplaySrc(ca);
        const driveBadge = ca._uploading
          ? `<div class="mt-1 text-[10px] font-bold text-amber-700 flex items-center gap-1"><i class="fa-solid fa-spinner fa-spin"></i><span>Mengunggah ke Google Drive...</span></div>`
          : ca.driveFileId
          ? `<a href="${ca.driveViewUrl || ca.driveUrl || '#'}" target="_blank" class="mt-1 text-[10px] font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"><i class="fa-brands fa-google-drive"></i><span>Tersimpan di Google Drive</span></a>`
          : displaySrc
          ? `<div class="mt-1 text-[10px] font-semibold text-purple-700 flex items-center gap-1"><i class="fa-solid fa-cloud-arrow-up"></i><span>Siap Sync ke Google Drive</span></div>`
          : '';

        return `
        <div class="border border-purple-200 rounded-2xl p-3 bg-white grid grid-cols-12 gap-3 relative shadow-sm">
          <button type="button" onclick="FMCUApp.removeCaPhotoCard(${idx})" class="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs cursor-pointer" title="Hapus Foto">
            <i class="fa-solid fa-xmark"></i>
          </button>

          <div class="col-span-5 h-36 bg-slate-100 rounded-xl overflow-hidden relative flex items-center justify-center border border-slate-200 group">
            ${
              displaySrc
                ? `<img src="${displaySrc}" class="w-full h-full object-cover" alt="Corrective Action" />`
                : `<div class="text-center p-2"><i class="fa-solid fa-camera text-slate-300 text-xl block mb-1"></i><span class="text-[9px] text-purple-500 font-bold block leading-tight">Foto Bukti Perbaikan</span></div>`
            }
            <div class="absolute inset-0 viewfinder-grid pointer-events-none opacity-20 group-hover:opacity-40 transition"></div>
            <label class="absolute bottom-1.5 inset-x-1.5 bg-purple-900/85 hover:bg-purple-900 text-white text-[10px] font-bold py-1 rounded text-center cursor-pointer flex items-center justify-center gap-1 shadow-sm">
              <i class="fa-solid fa-camera text-[10px]"></i>
              <span>Pilih / Foto</span>
              <input type="file" accept="image/*" capture="environment" onchange="FMCUApp.handleSingleCaUpload(event, ${idx})" class="hidden" />
            </label>
          </div>

          <div class="col-span-7 flex flex-col justify-between pr-4">
            <div>
              <div class="flex items-center justify-between gap-1.5 mb-1.5 min-h-[26px]">
                <span class="text-[10px] font-black text-purple-900/70 uppercase tracking-wider truncate">Perbaikan #${idx + 1}</span>
                <button type="button" onclick="FMCUApp.startVoiceInput('ca-desc-${idx}', this)" class="shrink-0 h-6 text-[10px] font-bold text-purple-800 bg-purple-50 hover:bg-purple-100 px-2 rounded-lg border border-purple-200 flex items-center gap-1 cursor-pointer transition shadow-2xs" title="Diktekan dengan Suara">
                  <i class="fa-solid fa-microphone text-rose-500 text-[10px]"></i>
                  <span>Dikte</span>
                </button>
              </div>
              <textarea id="ca-desc-${idx}" rows="3" oninput="FMCUApp.autoExpandTextarea(this); FMCUApp.formCaPhotos[${idx}].description = this.value; FMCUApp.updateFormProgress();" placeholder="Tuliskan deskripsi tindakan perbaikan / hasil..." class="fm-auto-textarea border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-purple-500">${ca.description || ''}</textarea>
              ${driveBadge}
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    grid.querySelectorAll('textarea').forEach((ta) => this.autoExpandTextarea(ta));
  },

  addCaPhotoCard() {
    if (!this.formCaPhotos) this.formCaPhotos = [];
    this.formCaPhotos.push({
      id: 'ca-' + Date.now(),
      description: '',
      dataUrl: '',
      driveFileId: '',
      driveUrl: ''
    });
    this.renderCaPhotosGrid();
    this.saveCurrentFormDraft();
  },

  removeCaPhotoCard(idx) {
    if (!this.formCaPhotos) return;
    this.formCaPhotos.splice(idx, 1);
    this.renderCaPhotosGrid();
    this.saveCurrentFormDraft();
  },

  async handleSingleCaUpload(event, idx) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    this.promptPhotoEdit(file, async (editedDataUrl) => {
      const storeCode = document.getElementById('form-store-code')?.value.trim() || 'STORE';
      const storeName = document.getElementById('form-store-name')?.value.trim() || 'STORE';
      const settings = window.FMCUData.getSettings();
      const applyWm = true;
      const dataUrl = await window.FMCUPdf.processAndStampImage(editedDataUrl, {
        storeName,
        gpsLat: this.liveGps.lat,
        gpsLng: this.liveGps.lng,
        applyWatermark: applyWm
      });
      if (!this.formCaPhotos) this.formCaPhotos = [];
      const caObj = this.formCaPhotos[idx];
      if (!caObj) return;
      caObj.id = caObj.id || 'ca-' + Date.now();
      caObj.dataUrl = dataUrl;
      caObj.driveFileId = '';
      caObj.driveUrl = '';
      caObj._uploading = true;
      window.FMCUData.cachePhotoInMemory(caObj.id, null, dataUrl);
      this.renderCaPhotosGrid();

      await window.FMCUData.uploadPhotoToGDrive(caObj, {
        storeCode,
        storeName,
        photoType: 'CORRECTIVE_ACTION'
      });
      caObj._uploading = false;
      this.renderCaPhotosGrid();
      this.saveCurrentFormDraft();
      this.showToast(
        caObj.driveFileId
          ? `Foto perbaikan #${idx + 1} berhasil disimpan ke Google Drive!`
          : `Foto perbaikan #${idx + 1} berhasil disesuaikan & diproses`,
        'success'
      );
    });
  },

  async handleBulkCaUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    const storeCode = document.getElementById('form-store-code')?.value.trim() || 'STORE';
    const storeName = document.getElementById('form-store-name')?.value.trim() || 'STORE';
    const settings = window.FMCUData.getSettings();
    const applyWm = true;

    if (!this.formCaPhotos) this.formCaPhotos = [];
    const newCards = [];
    for (const file of files) {
      const dataUrl = await window.FMCUPdf.processAndStampImage(file, {
        storeName,
        gpsLat: this.liveGps.lat,
        gpsLng: this.liveGps.lng,
        applyWatermark: applyWm
      });
      const caObj = {
        id: 'ca-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        description: '',
        dataUrl,
        driveFileId: '',
        driveUrl: '',
        _uploading: true
      };
      window.FMCUData.cachePhotoInMemory(caObj.id, null, dataUrl);
      this.formCaPhotos.push(caObj);
      newCards.push(caObj);
    }
    this.renderCaPhotosGrid();
    this.saveCurrentFormDraft();

    await Promise.all(
      newCards.map((caObj) =>
        window.FMCUData.uploadPhotoToGDrive(caObj, {
          storeCode,
          storeName,
          photoType: 'CORRECTIVE_ACTION'
        }).finally(() => {
          caObj._uploading = false;
        })
      )
    );
    this.renderCaPhotosGrid();
    this.saveCurrentFormDraft();
    const uploadedCount = newCards.filter((c) => Boolean(c.driveFileId)).length;
    this.showToast(
      uploadedCount > 0
        ? `${files.length} foto perbaikan berhasil diunggah & disimpan ke Google Drive!`
        : `${files.length} foto perbaikan berhasil diunggah!`,
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
      enableOpi: this.enableOpi !== false,
      enableQsc: this.enableQsc !== false,
      enableEvidence: this.enableEvidence !== false,
      enableCa: this.enableCa !== false,
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
      qscPhotos: (this.formQscPhotos || []).map((p, idx) => ({
        id: p.id || `qsc-${Date.now()}-${idx + 1}`,
        caption: p.caption || (idx === 0 ? 'Lembar Form QSC / FamiTrack #1 (Wajib)' : 'Lembar Form QSC / FamiTrack #2 (Wajib)'),
        dataUrl: p.dataUrl || '',
        driveFileId: p.driveFileId || '',
        driveUrl: p.driveUrl || '',
        driveViewUrl: p.driveViewUrl || ''
      })),
      opiObservations: (this.formOpiObservations || []).map((o) => ({
        ...o,
        deadlineFormatted: o.deadlineFormatted || window.FMCUPdf.formatIndonesianDate(o.deadline, false)
      })),
      observations: this.formObservations.map((o) => ({
        ...o,
        deadlineFormatted: o.deadlineFormatted || window.FMCUPdf.formatIndonesianDate(o.deadline, false)
      })),
      evidencePhotos: JSON.parse(JSON.stringify(this.formEvidencePhotos)),
      caPhotos: JSON.parse(JSON.stringify(this.formCaPhotos || [])),
      correctiveActionPhotos: JSON.parse(JSON.stringify(this.formCaPhotos || [])),
      caLink: document.getElementById('form-ca-link')?.value?.trim() || 'https://tinyurl.com/store-caassignment',
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

    // Hapus draft toko ini karena laporan sudah final disimpan
    window.FMCUData.deleteStoreDraft(reportObj.storeCode);

    window.FMCUData.setActiveCheckIn(null);
    this.hasActiveStoreForm = false;
    this.updateActiveCheckInUI();
    this.checkAndRunSilentAiSummary();
    this.activePreviewReportId = reportObj.id;

    return reportObj;
  },

  validateVisitForm() {
    const requiredSec1Fields = [
      { id: 'form-store-name', label: 'Nama Store' },
      { id: 'form-store-code', label: 'Kode Toko' },
      { id: 'form-auditor-name', label: 'Nama Visitor' },
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
    this.triggerConfetti();
    this.openIntegrationSendModal(saved.id);
  },

  // ==========================================================================
  // HALAMAN 3: PREVIEW HASIL PDF (16:9 SLIDE DECK + GRID + DOWNLOAD)
  // ==========================================================================
  renderPreviewSelector() {
    const sel = document.getElementById('preview-report-selector');
    if (!sel) return;
    const reports = window.FMCUData.getReports();

    // Urutkan laporan dari yang paling baru
    reports.sort((a, b) => String(b.createdAt || b.visitDate || '').localeCompare(String(a.createdAt || a.visitDate || '')));

    const currentStoreName = document.getElementById('form-store-name')?.value.trim() || '';
    const currentStoreCode = document.getElementById('form-store-code')?.value.trim() || '';
    const hasCurrentStore = Boolean(currentStoreCode && currentStoreCode !== '-');

    if (!this.activePreviewReportId) {
      if (this.hasActiveStoreForm && hasCurrentStore) {
        this.activePreviewReportId = '__LIVE_FORM__';
      } else if (reports.length > 0) {
        this.activePreviewReportId = reports[0].id;
      } else {
        this.activePreviewReportId = '__LIVE_FORM__';
      }
    } else if (this.activePreviewReportId !== '__LIVE_FORM__') {
      const exists = reports.some((r) => r.id === this.activePreviewReportId);
      if (!exists) {
        if (this.hasActiveStoreForm && hasCurrentStore) {
          this.activePreviewReportId = '__LIVE_FORM__';
        } else if (reports.length > 0) {
          this.activePreviewReportId = reports[0].id;
        } else {
          this.activePreviewReportId = '__LIVE_FORM__';
        }
      }
    }

    const liveLabel = hasCurrentStore
      ? `🎯 [Draft Form Toko Aktif: ${currentStoreName} (${currentStoreCode})]`
      : `🎯 [Draft Form Toko Saat Ini]`;

    const liveOptionHtml =
      (this.hasActiveStoreForm || reports.length === 0)
        ? `<option value="__LIVE_FORM__" ${this.activePreviewReportId === '__LIVE_FORM__' ? 'selected' : ''}>${liveLabel}</option>`
        : '';

    const reportsOptionsHtml = reports
      .map(
        (r) =>
          `<option value="${r.id}" ${r.id === this.activePreviewReportId ? 'selected' : ''}>${r.storeName} (${r.storeCode}) — ${r.visitDateFormatted || r.visitDate} [${r.auditorName}]</option>`
      )
      .join('');

    sel.innerHTML = liveOptionHtml + reportsOptionsHtml;
  },

  getActivePreviewReport() {
    if (this.activePreviewReportId === '__LIVE_FORM__') {
      return this.buildCurrentFormReportObject();
    }
    const reports = window.FMCUData.getReports();
    return (
      reports.find((r) => r.id === this.activePreviewReportId) ||
      (this.hasActiveStoreForm ? this.buildCurrentFormReportObject() : reports[0]) ||
      this.buildCurrentFormReportObject()
    );
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
    const slideCont = document.getElementById('preview-slide-mode-container');
    const pdfCont = document.getElementById('preview-pdf-mode-container');
    const gridCont = document.getElementById('preview-grid-mode-container');

    if (slideCont) slideCont.classList.toggle('hidden', mode !== 'slide');
    if (pdfCont) pdfCont.classList.toggle('hidden', mode !== 'pdf');
    if (gridCont) gridCont.classList.toggle('hidden', mode !== 'grid');

    const btnSlide = document.getElementById('btn-mode-slide');
    const btnPdf = document.getElementById('btn-mode-pdf');
    const btnGrid = document.getElementById('btn-mode-grid');

    const activeCls = 'px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-900 shadow-sm transition cursor-pointer truncate';
    const inactiveCls = 'px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer truncate';

    if (btnSlide) btnSlide.className = mode === 'slide' ? activeCls : inactiveCls;
    if (btnPdf) btnPdf.className = mode === 'pdf' ? activeCls : inactiveCls;
    if (btnGrid) btnGrid.className = mode === 'grid' ? activeCls : inactiveCls;

    if (mode === 'pdf') {
      this.renderActualPdfViewer();
    }
  },

  async renderActualPdfViewer() {
    const report = this.getActivePreviewReport();
    if (!report) return;
    const loadingEl = document.getElementById('preview-pdf-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    try {
      await window.FMCUPdf.hydrateReportPhotosFromGDrive(report);
      const doc = window.FMCUPdf.generatePdfDoc(report);
      const blobUrl = doc.output('bloburl');
      this.currentPdfBlobUrl = blobUrl;
      const iframe = document.getElementById('preview-actual-pdf-iframe');
      if (iframe) {
        iframe.src = `${blobUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=1`;
      }
      const docNameEl = document.getElementById('preview-pdf-doc-name');
      if (docNameEl) {
        docNameEl.textContent = `Dokumen PDF Asli: ${window.FMCUPdf.getFileName(report)}`;
      }
    } catch (e) {
      console.warn('Error generating actual PDF preview:', e);
    } finally {
      if (loadingEl) {
        setTimeout(() => loadingEl.classList.add('hidden'), 350);
      }
    }
  },

  async openActualPdfInNewTab() {
    this.triggerHaptic('light');
    const report = this.getActivePreviewReport();
    if (!report) return;
    this.showToast('Menyiapkan dokumen PDF asli...', 'info');
    await window.FMCUPdf.hydrateReportPhotosFromGDrive(report);
    const doc = window.FMCUPdf.generatePdfDoc(report);
    const blobUrl = doc.output('bloburl');
    this.currentPdfBlobUrl = blobUrl;
    window.open(blobUrl, '_blank');
  },

  downloadCurrentCaExcel() {
    this.triggerHaptic('medium');
    const report = this.getActivePreviewReport();
    if (!report) {
      this.showToast('Tidak ada laporan visit aktif.', 'warning');
      return;
    }
    this.showToast('Meng-generate file Excel CA Store Assignment...', 'info');
    window.FMCUPdf.downloadCaStoreAssignmentExcel(report);
  },

  openCurrentCaSpreadsheet() {
    this.triggerHaptic('light');
    const report = this.getActivePreviewReport();
    const settings = window.FMCUData.getSettings();
    const link = (report && (report.caSpreadsheetUrl || report.caLink)) || settings.caLink || 'https://tinyurl.com/store-caassignment';
    window.open(link, '_blank');
  },

  async downloadCurrentQscCollagePdf() {
    this.triggerHaptic('medium');
    const report = this.getActivePreviewReport();
    if (!report) {
      this.showToast('Tidak ada laporan visit aktif.', 'warning');
      return;
    }
    this.showToast('Menyusun PDF Kolase Lembar QSC (Format Vertikal)...', 'info');
    await window.FMCUPdf.downloadVerticalQscPdf(report);
    this.showToast('PDF Kolase QSC berhasil diunduh!', 'success');
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

    if (this.previewMode === 'pdf') {
      this.renderActualPdfViewer();
    }
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
    this.hasActiveStoreForm = true;
    this.updateFormGuardVisibility();
    const checkInObj = {
      storeCode: rep.storeCode,
      storeName: rep.storeName,
      scheduleId: rep.scheduleId || null,
      isArchivedView: true,
      actualIn: rep.actualIn || null,
      actualOut: rep.actualOut || null,
      latIn: rep.gpsLat || this.liveGps.lat,
      lngIn: rep.gpsLng || this.liveGps.lng,
      storeLat: null,
      storeLng: null,
      startedAt: Date.now()
    };
    window.FMCUData.setActiveCheckIn(checkInObj);
    this.updateActiveCheckInUI();
    this.activePreviewReportId = rep.id;
    this.navigate('form');
    this.showToast(`Membuka form toko ${rep.storeName}`, 'info');
  },

  // ==========================================================================
  // GOOGLE DRIVE SYNC INTEGRATION (ROOT: 15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8)
  // Catatan: Sistem pengiriman email dinonaktifkan total selama masa testing.
  // ==========================================================================
  async handlePreviewGDriveSyncClick() {
    const rep = this.getActivePreviewReport();
    if (!rep) {
      this.showToast('Laporan aktif tidak ditemukan.', 'warning');
      return;
    }

    const loader = document.getElementById('loading-gdrive-sync');
    const loaderStatus = document.getElementById('loading-gdrive-sync-status');
    if (loader) {
      if (loaderStatus) loaderStatus.textContent = 'Menyiapkan berkas laporan...';
      loader.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }

    try {
      if (loaderStatus) loaderStatus.textContent = 'Menyimpan 3 berkas ke Google Drive...';
      await this.triggerBackgroundDriveUpload(rep);
    } catch (err) {
      console.warn('Sync error:', err);
    } finally {
      if (loader) {
        loader.classList.add('hidden');
        document.body.style.overflow = '';
      }
      // Tampilkan pop-up konfirmasi setelah proses upload selesai
      this.openIntegrationSendModal(rep.id, true);
    }
  },

  openIntegrationSendModal(reportId = null, skipBackgroundTrigger = false) {
    if (reportId) this.activePreviewReportId = reportId;
    const rep = this.getActivePreviewReport();
    if (!rep) return;

    const nameEl = document.getElementById('modal-send-report-name');
    if (nameEl) {
      nameEl.textContent = `FamilyMart ${rep.storeName || '-'} (${rep.storeCode || '-'}) — ${rep.visitDateFormatted || rep.visitDate}`;
    }
    const metaEl = document.getElementById('modal-send-report-meta');
    if (metaEl) {
      metaEl.textContent = `Visitor: ${rep.auditorName || '-'} • ${(rep.observations || []).length} Temuan Observasi • ${(rep.evidencePhotos || []).length} Foto Bukti`;
    }

    // Set tautan tombol buka folder toko dan spreadsheet CA jika ada di DOM
    const folderBtn = document.getElementById('btn-open-store-folder');
    if (folderBtn) {
      folderBtn.href = rep.storeFolderUrl || 'https://drive.google.com/drive/u/3/folders/15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8';
    }
    const caBtn = document.getElementById('btn-open-ca-sheet');
    if (caBtn) {
      if (rep.caSpreadsheetUrl) {
        caBtn.href = rep.caSpreadsheetUrl;
        caBtn.classList.remove('hidden');
      } else {
        caBtn.classList.add('hidden');
      }
    }

    // Kolom masukan ID folder Google tersembunyi & auto-linked ke 15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8
    const folderInput = document.getElementById('modal-send-folder');
    if (folderInput) folderInput.value = '15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8';

    // Buka Modal Pop-up
    const modal = document.getElementById('modal-send-integration');
    if (modal) modal.classList.remove('hidden');

    // Secara otomatis dibalik layar simpan seluruh berkas ke Google Drive jika belum dipicu
    if (!skipBackgroundTrigger) {
      this.triggerBackgroundDriveUpload(rep);
    }
  },

  async triggerBackgroundDriveUpload(rep, retryCount = 0) {
    if (!rep) return;
    const statusBox = document.getElementById('modal-send-status');
    const statusIconEl = document.getElementById('modal-send-status-icon');
    const statusTextEl = document.getElementById('modal-send-status-text');

    const fileName = window.FMCUPdf.getFileName(rep);
    const settings = window.FMCUData.getSettings();
    const gasUrl = (settings.gasWebhookUrl || '').trim();
    const targetFolderId = '15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8';

    // Jika Webhook Google Apps Script belum dikonfigurasi, tampilkan form input cepat langsung di pop-up
    if (!gasUrl || !gasUrl.startsWith('http')) {
      if (statusBox) {
        statusBox.className = 'p-3.5 rounded-2xl font-semibold text-xs border border-amber-300 bg-amber-50 text-amber-950 flex flex-col gap-2.5';
      }
      if (statusIconEl) {
        statusIconEl.className = 'fa-solid fa-triangle-exclamation text-amber-600 text-sm shrink-0';
      }
      if (statusTextEl) {
        statusTextEl.innerHTML = `
          <div class="space-y-2">
            <div class="font-extrabold text-amber-900 text-xs">
              Webhook Google Apps Script Belum Terhubung
            </div>
            <p class="text-[11px] text-amber-800 leading-relaxed">
              Untuk mengaktifkan sinkronisasi otomatis 3 berkas ke Google Drive (<code>15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8</code>) & pembuatan Spreadsheet CA unik toko, silakan tempel Web App URL Google Apps Script Anda di bawah ini:
            </p>
            <div class="flex items-center gap-1.5 pt-0.5">
              <input type="url" id="quick-gas-url-input" placeholder="https://script.google.com/macros/s/.../exec" class="fm-input text-xs font-mono bg-white flex-1 py-1.5 px-3" />
              <button type="button" onclick="FMCUApp.saveQuickGasUrl()" class="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs cursor-pointer shrink-0 shadow-xs transition">
                <i class="fa-solid fa-link mr-1"></i>Hubungkan
              </button>
            </div>
            <p class="text-[10px] text-amber-700">
              *Script siap pakai dapat disalin dari menu Portal Admin &gt; Integrasi GDrive.
            </p>
          </div>
        `;
      }
      return;
    }

    if (statusBox) {
      statusBox.className = 'p-3 rounded-2xl font-semibold text-xs border border-teal-200 bg-teal-50/90 text-teal-900 flex items-start gap-2.5';
    }
    if (statusIconEl) {
      statusIconEl.className = 'fa-solid fa-spinner fa-spin text-teal-600 text-sm mt-0.5 shrink-0';
    }
    if (statusTextEl) {
      statusTextEl.innerHTML = `<span>Menyimpan otomatis 3 berkas ke Google Drive (PDF Laporan, PDF QSC, & Spreadsheet CA unik toko)...</span>`;
    }

    try {
      const isLiveReport = !rep.id || rep.id === '__LIVE_FORM__' || (this.hasActiveStoreForm && rep.storeCode === document.getElementById('form-store-code')?.value.trim());

      // Pastikan lembar QSC Section 1 disinkronkan dengan live formQscPhotos jika laporan aktif saat ini
      if (isLiveReport && Array.isArray(this.formQscPhotos) && this.formQscPhotos.length > 0) {
        if (!rep.qscPhotos || rep.qscPhotos.length === 0) {
          rep.qscPhotos = JSON.parse(JSON.stringify(this.formQscPhotos));
        } else {
          rep.qscPhotos.forEach((p, idx) => {
            if ((!p.dataUrl || !p.dataUrl.startsWith('data:image')) && this.formQscPhotos[idx]?.dataUrl) {
              p.dataUrl = this.formQscPhotos[idx].dataUrl;
            }
          });
        }
      }

      // Pastikan Foto Bukti Temuan (Evidence) disinkronkan dengan formEvidencePhotos live jika tersedia
      if (isLiveReport && Array.isArray(this.formEvidencePhotos) && this.formEvidencePhotos.length > 0) {
        if (!rep.evidencePhotos || rep.evidencePhotos.length === 0) {
          rep.evidencePhotos = JSON.parse(JSON.stringify(this.formEvidencePhotos));
        } else {
          rep.evidencePhotos.forEach((p, idx) => {
            if ((!p.dataUrl || !p.dataUrl.startsWith('data:image')) && this.formEvidencePhotos[idx]?.dataUrl) {
              p.dataUrl = this.formEvidencePhotos[idx].dataUrl;
            }
          });
        }
      }

      // Pastikan Foto Hasil Perbaikan (CA) disinkronkan dengan formCaPhotos live jika tersedia
      if (isLiveReport && Array.isArray(this.formCaPhotos) && this.formCaPhotos.length > 0) {
        if (!rep.caPhotos || rep.caPhotos.length === 0) {
          rep.caPhotos = JSON.parse(JSON.stringify(this.formCaPhotos));
          rep.correctiveActionPhotos = JSON.parse(JSON.stringify(this.formCaPhotos));
        } else {
          rep.caPhotos.forEach((p, idx) => {
            if ((!p.dataUrl || !p.dataUrl.startsWith('data:image')) && this.formCaPhotos[idx]?.dataUrl) {
              p.dataUrl = this.formCaPhotos[idx].dataUrl;
            }
          });
          rep.correctiveActionPhotos = rep.caPhotos;
        }
      }

      const pdfBase64 = await window.FMCUPdf.getPdfBase64(rep);
      const qscPdfBase64 = await window.FMCUPdf.getVerticalQscPdfBase64(rep);

      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sendReport',
          report: rep,
          pdfBase64,
          qscPdfBase64,
          fileName,
          gdriveFolderId: targetFolderId,
          // AUTO-KIRIM EMAIL DIMATIKAN SESUAI INSTRUKSI USER:
          // Kosongkan recipientEmails dan ccEmails agar Google Apps Script tidak mengeksekusi MailApp.sendEmail otomatis.
          // Pengiriman email dilakukan manual oleh user melalui tombol "Buka Aplikasi Email Siap Kirim" atau "Buka di Web Gmail".
          sendEmail: false,
          recipientEmails: '',
          ccEmails: ''
        })
      });

      let responseText = '';
      try {
        responseText = await response.text();
      } catch (e) {}

      let gasJson = null;
      try {
        gasJson = JSON.parse(responseText);
      } catch (e) {}

      if (gasJson && gasJson.status === 'SUCCESS') {
        if (gasJson.caSpreadsheetUrl) {
          rep.caSpreadsheetUrl = gasJson.caSpreadsheetUrl;
          const caBtn = document.getElementById('btn-open-ca-sheet');
          if (caBtn) {
            caBtn.href = gasJson.caSpreadsheetUrl;
            caBtn.classList.remove('hidden');
          }
        }
        if (gasJson.pdfUrl) {
          rep.pdfDriveUrl = gasJson.pdfUrl;
        }
        if (gasJson.qscPdfUrl) {
          rep.qscPdfDriveUrl = gasJson.qscPdfUrl;
        }
        if (gasJson.storeFolderUrl) {
          rep.storeFolderUrl = gasJson.storeFolderUrl;
          const folderBtn = document.getElementById('btn-open-store-folder');
          if (folderBtn) {
            folderBtn.href = gasJson.storeFolderUrl;
          }
        }

        if (window.FMCUData && typeof window.FMCUData.saveReport === 'function') {
          window.FMCUData.saveReport(rep);
        } else {
          const reports = window.FMCUData.getReports();
          const idx = reports.findIndex((r) => String(r.id) === String(rep.id));
          if (idx !== -1) {
            reports[idx] = { ...reports[idx], ...rep };
          } else {
            reports.unshift(rep);
          }
          window.FMCUData.saveReports(reports);
        }

        if (statusBox) {
          statusBox.className = 'p-3 rounded-2xl font-semibold text-xs border border-emerald-300 bg-emerald-50 text-emerald-950 flex items-start gap-2.5';
        }
        if (statusIconEl) {
          statusIconEl.className = 'fa-solid fa-circle-check text-emerald-600 text-base mt-0.5 shrink-0';
        }
        if (statusTextEl) {
          statusTextEl.innerHTML = `
            <div class="space-y-1.5">
              <div class="font-extrabold text-emerald-800 text-xs">
                3 Berkas Tersimpan Rapi di Google Drive!
              </div>
              <div class="text-[11px] text-emerald-900/90 leading-tight">
                Folder: <code>01. VISIT BESTIE 2026 / ${rep.auditorName || 'Visitor'} / ${rep.storeCode || ''} - ${rep.storeName || 'STORE'}</code>
              </div>
              <div class="flex flex-wrap gap-2.5 pt-1 text-[11px]">
                ${gasJson.caSpreadsheetUrl ? `<a href="${gasJson.caSpreadsheetUrl}" target="_blank" class="font-bold text-[#009944] hover:underline flex items-center gap-1"><i class="fa-solid fa-table"></i> Buka Spreadsheet CA Toko</a>` : ''}
                ${gasJson.storeFolderUrl ? `<a href="${gasJson.storeFolderUrl}" target="_blank" class="font-bold text-teal-700 hover:underline flex items-center gap-1"><i class="fa-solid fa-folder-open"></i> Buka Folder Toko</a>` : ''}
              </div>
            </div>
          `;
        }
        this.showToast('Semua berkas laporan berhasil diarsipkan ke Google Drive!', 'success');
        return;
      } else {
        let errMsg = (gasJson && gasJson.message) ? gasJson.message : '';
        if (!errMsg) {
          if (response.status === 403 || responseText.includes('memerlukan akses') || responseText.includes('accounts.google.com')) {
            errMsg = 'Akses Ditolak (403): Pada script.google.com, buka Deploy > Manage deployments > Edit > ganti "Who has access" menjadi "Anyone" (Siapa saja), lalu simpan deployment baru.';
          } else {
            errMsg = 'Respon gagal (' + response.status + ') dari Google Apps Script.';
          }
        }
        throw new Error(errMsg);
      }
    } catch (err) {
      console.warn('Background GAS sync error:', err);
      // Auto-retry di balik layar tanpa tombol manual
      if (retryCount < 3) {
        const nextAttempt = retryCount + 1;
        if (statusBox) {
          statusBox.className = 'p-3 rounded-2xl font-semibold text-xs border border-teal-200 bg-teal-50/90 text-teal-900 flex items-start gap-2.5';
        }
        if (statusIconEl) {
          statusIconEl.className = 'fa-solid fa-spinner fa-spin text-teal-600 text-sm mt-0.5 shrink-0';
        }
        if (statusTextEl) {
          statusTextEl.innerHTML = `
            <div class="space-y-0.5">
              <div class="font-bold text-teal-950">Menyinkronkan otomatis di balik layar...</div>
              <div class="text-[11px] text-teal-800">Menghubungkan ke Google Drive (Percobaan ${nextAttempt}/3)</div>
            </div>
          `;
        }
        setTimeout(() => {
          this.triggerBackgroundDriveUpload(rep, nextAttempt);
        }, 2500 * nextAttempt);
        return;
      }

      // Background queue state saat jaringan bermasalah
      if (statusBox) {
        statusBox.className = 'p-3 rounded-2xl font-semibold text-xs border border-slate-200 bg-slate-50 text-slate-800 flex items-start gap-2.5';
      }
      if (statusIconEl) {
        statusIconEl.className = 'fa-solid fa-cloud-arrow-up text-teal-600 text-sm mt-0.5 shrink-0';
      }
      if (statusTextEl) {
        statusTextEl.innerHTML = `
          <div class="space-y-0.5">
            <div class="font-bold text-slate-900">Sinkronisasi Berjalan di Latar Belakang</div>
            <p class="text-[11px] text-slate-600 leading-tight">
              Sistem otomatis mengarsipkan 3 berkas laporan ke Google Drive saat jaringan kembali stabil.
            </p>
          </div>
        `;
      }
    }
  },

  resetToVerifiedGasUrl() {
    const verifiedUrl = 'https://script.google.com/macros/s/AKfycbxqumXFq5ohGM9o-AiMOdMRad8idrUjrRl1B-yy17RliyM7ZTblheA1lCDHJbpKADgDZQ/exec';
    const settings = window.FMCUData.getSettings();
    settings.gasWebhookUrl = verifiedUrl;
    window.FMCUData.saveSettings(settings);
    const setGasUrl = document.getElementById('set-gas-url');
    if (setGasUrl) setGasUrl.value = verifiedUrl;
    this.showToast('Dialihkan ke URL Webhook Google Apps Script resmi yang aktif & terverifikasi!', 'success');
    const rep = this.getActivePreviewReport();
    if (rep) {
      this.triggerBackgroundDriveUpload(rep);
    }
  },

  saveQuickGasUrl() {
    const input = document.getElementById('quick-gas-url-input');
    const url = (input ? input.value : '').trim();
    if (!url || !url.startsWith('http')) {
      this.showToast('Masukkan URL Web App Google Apps Script yang valid (diawali https://)!', 'warning');
      return;
    }
    const settings = window.FMCUData.getSettings();
    settings.gasWebhookUrl = url;
    window.FMCUData.saveSettings(settings);
    const setGasUrl = document.getElementById('set-gas-url');
    if (setGasUrl) setGasUrl.value = url;
    this.showToast('Google Apps Script Webhook berhasil dihubungkan!', 'success');
    
    const rep = this.getActivePreviewReport();
    if (rep) {
      this.triggerBackgroundDriveUpload(rep);
    }
  },

  openReadyEmailApp() {
    this.showToast('Fitur email dinonaktifkan selama masa testing agar tidak masuk ke email orang.', 'warning');
  },

  openGmailWebDirectly() {
    this.showToast('Fitur email dinonaktifkan selama masa testing agar tidak masuk ke email orang.', 'warning');
  },

  copyEmailContent() {
    this.showToast('Fitur email dinonaktifkan selama masa testing agar tidak masuk ke email orang.', 'warning');
  },

  async executeSendEmailAndGDrive() {
    const rep = this.getActivePreviewReport();
    if (!rep) return;
    this.triggerHaptic('medium');
    this.showToast('Menyinkronkan ulang ke Google Drive...', 'info');
    await this.triggerBackgroundDriveUpload(rep);
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
    const isSuperAdmin = Boolean(this.currentUser && (this.currentUser.role === 'SUPER_ADMIN' || this.currentUser.username === 'admin'));
    const tabAuthMap = {
      schedules: 'manage_schedule',
      stores: 'manage_stores',
      users: 'manage_users',
      integrations: 'manage_integrations',
      news: 'super_admin'
    };
    if (tabName === 'news' && !isSuperAdmin) {
      tabName = this.getFirstAllowedAdminTab();
    } else {
      const requiredAuth = tabAuthMap[tabName];
      if (requiredAuth && requiredAuth !== 'super_admin' && !this.hasAuthority(requiredAuth)) {
        tabName = this.getFirstAllowedAdminTab();
      }
    }

    this.currentAdminTab = tabName;
    try {
      sessionStorage.setItem('fmcu_active_admin_tab', tabName);
    } catch (e) {}
    const tabs = ['schedules', 'stores', 'users', 'integrations', 'news'];
    tabs.forEach((t) => {
      const panel = document.getElementById(`admin-tab-${t}`);
      if (panel) panel.classList.toggle('hidden', t !== tabName);

      const btn = document.getElementById(`admin-tab-btn-${t}`);
      if (btn) {
        const isAllowed = t === 'news' ? isSuperAdmin : this.hasAuthority(tabAuthMap[t]);
        if (t === tabName) {
          btn.className = `px-3.5 py-2 rounded-xl text-xs font-bold bg-[#009944] text-white transition cursor-pointer ${isAllowed ? '' : 'hidden'}`;
        } else {
          btn.className = `px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer ${isAllowed ? '' : 'hidden'}`;
        }
      }
    });

    if (tabName === 'news') {
      this.renderAdminNewsTable();
    }
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
        String(st.lat || '').toLowerCase().includes(searchQ) ||
        String(st.lng || '').toLowerCase().includes(searchQ) ||
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
      stTbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400">Tidak ada data master toko yang sesuai filter pencarian.</td></tr>`;
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
          <td class="py-2.5 px-3 text-[11px] whitespace-nowrap">
            ${
              (st.lat !== undefined && st.lat !== null && st.lat !== '') && (st.lng !== undefined && st.lng !== null && st.lng !== '')
                ? `
                  <div class="font-mono text-slate-800 font-extrabold flex items-center gap-1">
                    <i class="fa-solid fa-location-dot text-rose-500 text-xs"></i>
                    <span>${st.lat}, ${st.lng}</span>
                  </div>
                  <a href="https://www.google.com/maps?q=${st.lat},${st.lng}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[10px] font-bold text-[#0099A6] hover:underline mt-1 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    <i class="fa-solid fa-map-location-dot text-teal-700"></i><span>Pinpoint Maps</span>
                  </a>
                `
                : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Belum Diset</span>`
            }
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
          : `<option value="">-- Belum ada user Visitor / Regional Bestie --</option>`;
    }
    const schDateInput = document.getElementById('adm-sch-date');
    if (schDateInput && !schDateInput.value) {
      schDateInput.value = this.getMondayOfWeek();
    }
    const schWinInput = document.getElementById('adm-sch-window');
    if (schWinInput && !schWinInput.value) {
      schWinInput.value = '08:30 - 17:30';
    }

    // 0. Render Interactive 5-Day Multi-Visitor Planner
    this.renderWeeklySchedulePlanner();
    if (this.currentScheduleSubSection === 'calendar') {
      this.renderAdminCalendarView();
    }

    // 1. Render Admin Schedules Table & Visitor Recap Strip
    const schPillEl = document.getElementById('admin-schedule-count-pill');
    if (schPillEl) schPillEl.textContent = String(schedules.length);

    this.renderAdminAuditorRecapStrip();

    const listAuditorSel = document.getElementById('adm-sch-list-auditor');
    if (listAuditorSel) {
      const prevAud = listAuditorSel.value || 'ALL';
      listAuditorSel.innerHTML =
        `<option value="ALL">Semua Visitor (${auditorsOnly.length})</option>` +
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

    // Urutkan jadwal toko dimulai dari tanggal terdekat
    filteredSchedules.sort((a, b) => {
      const dateA = String(a.scheduledDate || '');
      const dateB = String(b.scheduledDate || '');
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      return String(a.storeCode || '').localeCompare(String(b.storeCode || ''));
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
    const userSearchQ = (document.getElementById('adm-user-search-input')?.value || '').trim().toLowerCase();
    const filteredUsers = users
      .filter((u) => {
        if (!userSearchQ) return true;
        return (
          String(u.name || '').toLowerCase().includes(userSearchQ) ||
          String(u.nik || '').toLowerCase().includes(userSearchQ) ||
          String(u.username || '').toLowerCase().includes(userSearchQ) ||
          String(u.jabatan || '').toLowerCase().includes(userSearchQ) ||
          String(u.roleBadge || '').toLowerCase().includes(userSearchQ) ||
          String(u.region || '').toLowerCase().includes(userSearchQ)
        );
      })
      .sort((a, b) => {
        if (a.role === 'SUPER_ADMIN' && b.role !== 'SUPER_ADMIN') return -1;
        if (b.role === 'SUPER_ADMIN' && a.role !== 'SUPER_ADMIN') return 1;
        return String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' });
      });

    const usrCountEl = document.getElementById('admin-user-count');
    if (usrCountEl) {
      usrCountEl.textContent =
        filteredUsers.length === users.length
          ? `${users.length} User`
          : `${filteredUsers.length} / ${users.length} User`;
    }

    const usrTbody = document.getElementById('admin-users-tbody');
    if (usrTbody) {
      if (filteredUsers.length === 0) {
        usrTbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">Tidak ada user yang sesuai kata kunci pencarian.</td></tr>`;
      } else {
        usrTbody.innerHTML = filteredUsers
          .map(
            (u) => `
            <tr class="hover:bg-slate-50">
              <td class="py-2.5 px-3">
                <div class="font-bold text-slate-900">${u.name}</div>
                <div class="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] font-mono">
                  <span class="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-bold">NIK/User: ${u.nik || u.username}</span>
                  <span class="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-bold">PIN/Pass: ${u.password || '-'}</span>
                </div>
              </td>
              <td class="py-2.5 px-3">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  u.role === 'SUPER_ADMIN'
                    ? 'bg-emerald-100 text-emerald-800'
                    : u.role === 'ADMIN_SCHEDULE'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-teal-100 text-teal-800'
                }">${u.roleBadge || u.role}</span>
                <div class="text-[10px] text-slate-500 mt-0.5">${u.jabatan ? u.jabatan + (u.region && u.region !== '-' ? ' • ' + u.region : '') : u.region || '-'}</div>
              </td>
              <td class="py-2.5 px-3">
                <div class="flex flex-wrap gap-1 max-w-xs">
                  ${(u.authorities || []).map((a) => `<span class="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">${a}</span>`).join('')}
                </div>
              </td>
              <td class="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                ${u.lastLocation && u.lastLocation.lat ? `${u.lastLocation.lat}, ${u.lastLocation.lng}` : '-'}
              </td>
              <td class="py-2.5 px-3 text-right whitespace-nowrap space-x-2">
                <button onclick="FMCUApp.editUser('${u.id}')" class="text-emerald-700 hover:underline font-bold cursor-pointer">Edit / Password</button>
                <button onclick="FMCUApp.quickLoginById('${u.id}')" class="text-[#0099A6] hover:underline font-bold cursor-pointer">Pakai Akun</button>
                <button onclick="FMCUApp.deleteUser('${u.id}')" class="text-rose-600 hover:underline font-bold cursor-pointer">Hapus</button>
              </td>
            </tr>
          `
          )
          .join('');
      }
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
    const setWmGps = document.getElementById('set-auto-watermark-gps');
    if (setWmGps) setWmGps.checked = settings.autoWatermarkGps !== false;

    // 5. Populate Admin News Table
    this.renderAdminNewsTable();
  },

  // ==========================================================================
  // INTERACTIVE 5-DAY WEEKLY SCHEDULE PLANNER (SENIN - JUMAT) & EXCEL EXPORT
  // ==========================================================================
  switchScheduleCreateMode(mode = 'weekly') {
    this.scheduleCreateMode = 'weekly';
    const weeklyBox = document.getElementById('sch-create-mode-weekly');
    if (weeklyBox) weeklyBox.classList.remove('hidden');
    const singleBox = document.getElementById('sch-create-mode-single');
    if (singleBox) singleBox.classList.add('hidden');
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
    const dayNames = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'];
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const result = [];

    for (let i = 0; i < 7; i++) {
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

    // Default uncheck pada checklist nama user
    if (!Array.isArray(this.weeklySelectedAuditors)) {
      this.weeklySelectedAuditors = [];
    } else {
      this.weeklySelectedAuditors = this.weeklySelectedAuditors.filter((id) => validIds.has(id));
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
      this.showToast('Tanggal otomatis disesuaikan ke hari Senin terdekat pada minggu tersebut (Senin–Minggu).', 'info');
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
      dayIndex: Math.max(0, Math.min(6, Number(dayIndex) || 0))
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
      this.showToast('Pilih minimal 1 Regional Bestie / Visitor terlebih dahulu di Langkah 2.', 'warning');
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

    // Jika berasal dari Quick Picker dan Auto-Advance aktif, geser ke hari berikutnya (Sen -> Sel -> Rab -> Kam -> Jum -> Sab -> Min)
    const autoAdvance = document.getElementById('weekly-auto-advance-day')?.checked;
    if (fromQuickPicker && autoAdvance) {
      if (dayIdx < 6) {
        this.weeklyActiveSlot = { auditorId: audId, dayIndex: dayIdx + 1 };
      } else {
        // Pindah ke Visitor berikutnya pada hari Senin (0)
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
    this.showToast(`+ ${st.code} ${st.name} ditambahkan ke ${au ? au.name : 'Visitor'} (${dayName})`, 'success');
  },

  promptAddManualStoreToWeeklySlot(auditorId, dayIndex) {
    const storeName = prompt('Masukkan Nama Toko yang ingin ditambahkan:');
    if (!storeName || !storeName.trim()) return;

    const trimmedName = storeName.trim();
    let storeCode = prompt('Masukkan Kode / Site Toko (opsional, tekan OK untuk kode otomatis):');
    if (storeCode) {
      storeCode = storeCode.trim();
    }
    if (!storeCode) {
      storeCode = 'M-' + Math.floor(1000 + Math.random() * 9000);
    }

    let stores = window.FMCUData.getStores();
    let existing = stores.find(
      (s) =>
        String(s.code).toLowerCase() === String(storeCode).toLowerCase() ||
        String(s.name).toLowerCase() === trimmedName.toLowerCase()
    );

    if (!existing) {
      existing = {
        code: storeCode,
        name: trimmedName,
        type: 'CVS',
        city: 'Manual Add',
        address: 'Input Manual dari Atur Jadwal',
        lat: null,
        lng: null,
        radiusMeters: 50
      };
      stores.push(existing);
      window.FMCUData.saveStores(stores, existing);
    }

    this.assignStoreToWeeklySlot(existing.code, auditorId, dayIndex, false);
    this.showToast(`Toko manual "${existing.name}" (${existing.code}) berhasil ditambahkan ke jadwal!`, 'success');
  },

  onInlineAddStoreToDay(auditorId, dayIndex, selectEl) {
    if (!selectEl || !selectEl.value) return;
    const code = selectEl.value;
    selectEl.value = '';
    this.assignStoreToWeeklySlot(code, auditorId, dayIndex, false);
  },

  // ==========================================================================
  // CUSTOM STORE PICKER MODAL (PENGGANTI NATIVE DROPDOWN SYSTEM PADA CARD HARI)
  // ==========================================================================
  weeklyPickerTarget: { auditorId: null, dayIndex: null },
  weeklyPickerSearch: '',
  weeklyPickerCity: 'ALL',

  openWeeklyStorePickerModal(auditorId, dayIndex) {
    this.weeklyPickerTarget = { auditorId, dayIndex: Number(dayIndex) };
    this.weeklyPickerSearch = '';
    this.weeklyPickerCity = 'ALL';

    const modal = document.getElementById('modal-weekly-store-picker');
    if (!modal) return;

    // Reset search input & clear button
    const sInput = document.getElementById('weekly-picker-search-input');
    if (sInput) sInput.value = '';
    const sClear = document.getElementById('weekly-picker-search-clear');
    if (sClear) sClear.classList.add('hidden');

    // Populate City filter
    const stores = window.FMCUData.getStores();
    const citySel = document.getElementById('weekly-picker-city-select');
    if (citySel) {
      const cities = Array.from(new Set(stores.map((s) => s.city).filter(Boolean))).sort();
      citySel.innerHTML =
        `<option value="ALL">Semua Kota / Wilayah (${stores.length} Toko)</option>` +
        cities.map((c) => `<option value="${c}">${c}</option>`).join('');
      citySel.value = 'ALL';
    }

    // Set Header info
    const users = this.getSchedulableAuditors();
    const au = users.find((u) => u.id === auditorId);
    const days = this.getFiveWorkDays(this.weeklyMondayDate);
    const dayObj = days[Number(dayIndex)] || { dayName: 'Hari', shortDate: '' };

    const nameEl = document.getElementById('weekly-picker-auditor-name');
    if (nameEl) nameEl.textContent = au ? `${au.name} (@${au.username || au.nik || ''})` : 'Visitor';

    const dayBadge = document.getElementById('weekly-picker-day-badge');
    if (dayBadge) dayBadge.textContent = `${dayObj.dayName}, ${dayObj.shortDate}`;

    this.renderWeeklyStorePickerModalContent();
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Auto-focus search input
    setTimeout(() => {
      sInput?.focus();
    }, 120);
  },

  closeWeeklyStorePickerModal() {
    const modal = document.getElementById('modal-weekly-store-picker');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
    this.renderWeeklySchedulePlanner();
  },

  onWeeklyStorePickerSearch(val) {
    this.weeklyPickerSearch = (val || '').trim().toLowerCase();
    const sClear = document.getElementById('weekly-picker-search-clear');
    if (sClear) {
      sClear.classList.toggle('hidden', !this.weeklyPickerSearch);
    }
    this.renderWeeklyStorePickerModalContent();
  },

  clearWeeklyStorePickerSearch() {
    this.weeklyPickerSearch = '';
    const sInput = document.getElementById('weekly-picker-search-input');
    if (sInput) {
      sInput.value = '';
      sInput.focus();
    }
    const sClear = document.getElementById('weekly-picker-search-clear');
    if (sClear) sClear.classList.add('hidden');
    this.renderWeeklyStorePickerModalContent();
  },

  onWeeklyStorePickerCityFilter(val) {
    this.weeklyPickerCity = val || 'ALL';
    this.renderWeeklyStorePickerModalContent();
  },

  toggleStoreInWeeklyPicker(storeCode) {
    const { auditorId, dayIndex } = this.weeklyPickerTarget;
    if (!auditorId || dayIndex === null) return;

    const items = this.getWeeklySlotItems(auditorId, dayIndex);
    const exists = items.some((it) => String(it.storeCode) === String(storeCode));

    if (exists) {
      this.removeStoreFromWeeklySlot(auditorId, dayIndex, storeCode);
    } else {
      this.assignStoreToWeeklySlot(storeCode, auditorId, dayIndex, false);
    }

    this.renderWeeklyStorePickerModalContent();
  },

  renderWeeklyStorePickerModalContent() {
    const { auditorId, dayIndex } = this.weeklyPickerTarget;
    if (!auditorId || dayIndex === null) return;

    const stores = window.FMCUData.getStores();
    const items = this.getWeeklySlotItems(auditorId, dayIndex);
    const assignedCodes = new Set(items.map((it) => String(it.storeCode)));

    // 1. Render Assigned Strip at Top
    const stripEl = document.getElementById('weekly-picker-assigned-strip');
    if (stripEl) {
      if (items.length === 0) {
        stripEl.innerHTML = `
          <div class="flex items-center gap-2 py-0.5 text-[11px] text-slate-500">
            <i class="fa-regular fa-calendar-xmark text-slate-400"></i>
            <span>Belum ada toko yang ditugaskan pada hari ini. Pilih dari daftar di bawah.</span>
          </div>
        `;
      } else {
        const storeMap = new Map(stores.map((s) => [String(s.code), s]));
        stripEl.innerHTML = `
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="w-5 h-5 rounded-md bg-[#009944] text-white flex items-center justify-center text-[10px] font-bold">
              ${items.length}
            </span>
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-900 shrink-0">
              Terpilih Hari Ini:
            </span>
          </div>
          <div class="flex items-center gap-1.5 overflow-x-auto py-0.5">
            ${items
              .map((it) => {
                const st = storeMap.get(String(it.storeCode));
                const name = st ? st.name : it.storeCode;
                return `
                  <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-white text-emerald-950 border border-emerald-300 shadow-2xs shrink-0">
                    <span class="font-mono text-[10px] text-[#0099A6]">${it.storeCode}</span>
                    <span class="truncate max-w-[130px] sm:max-w-[180px]">${name}</span>
                    <button
                      type="button"
                      onclick="FMCUApp.toggleStoreInWeeklyPicker('${it.storeCode}')"
                      class="ml-1 text-slate-400 hover:text-rose-600 cursor-pointer p-0.5"
                      title="Hapus toko dari hari ini"
                    >
                      <i class="fa-solid fa-xmark text-[11px]"></i>
                    </button>
                  </span>
                `;
              })
              .join('')}
          </div>
        `;
      }
    }

    // 2. Filter Stores
    const q = this.weeklyPickerSearch;
    const city = this.weeklyPickerCity;

    let filtered = stores.filter((s) => {
      if (city !== 'ALL' && s.city !== city) return false;
      if (!q) return true;
      return (
        String(s.code || '').toLowerCase().includes(q) ||
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.address || '').toLowerCase().includes(q) ||
        String(s.city || '').toLowerCase().includes(q) ||
        String(s.areaManager || '').toLowerCase().includes(q) ||
        String(s.storeHead || '').toLowerCase().includes(q)
      );
    });

    // Urutkan: Toko yang sudah dipilih diletakkan di paling atas, lalu urut kode toko
    filtered.sort((a, b) => {
      const aAssigned = assignedCodes.has(String(a.code));
      const bAssigned = assignedCodes.has(String(b.code));
      if (aAssigned && !bAssigned) return -1;
      if (!aAssigned && bAssigned) return 1;
      return String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true });
    });

    // Update stats counter
    const statsEl = document.getElementById('weekly-picker-stats');
    if (statsEl) {
      statsEl.textContent = `Menampilkan ${filtered.length} dari ${stores.length} Toko`;
    }

    // 3. Render Store Cards List
    const listEl = document.getElementById('weekly-picker-list-container');
    if (!listEl) return;

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="py-12 text-center text-slate-400 space-y-2">
          <i class="fa-solid fa-store-slash text-3xl text-slate-300"></i>
          <p class="text-xs font-semibold text-slate-600">Tidak ada toko yang cocok dengan pencarian "${q}".</p>
          <p class="text-[11px] text-slate-400">Gunakan formulir Tambah Toko Manual di bawah jika toko belum terdaftar.</p>
        </div>
      `;
      return;
    }

    // Tampilkan hingga 150 baris per pencarian (agar sangat responsif)
    const displayList = filtered.slice(0, 150);

    listEl.innerHTML = displayList
      .map((st) => {
        const isAssigned = assignedCodes.has(String(st.code));
        return `
          <div class="p-2.5 sm:p-3 rounded-xl border transition ${
            isAssigned
              ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-300/40 shadow-2xs'
              : 'bg-white border-slate-200 hover:border-emerald-300 hover:bg-slate-50/80 shadow-2xs'
          } flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <div class="w-9 h-9 rounded-xl ${
                isAssigned ? 'bg-[#009944] text-white shadow-xs' : 'bg-slate-100 text-slate-700'
              } flex items-center justify-center font-mono font-black text-xs shrink-0 shadow-2xs">
                ${isAssigned ? '<i class="fa-solid fa-check"></i>' : (st.code ? st.code.slice(-3) : 'FM')}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-mono font-extrabold text-xs ${isAssigned ? 'text-emerald-800' : 'text-[#0099A6]'}">Site ${st.code}</span>
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-slate-100 text-slate-600">${st.type || 'CVS'}</span>
                  ${st.city ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-500">${st.city}</span>` : ''}
                  ${isAssigned ? `<span class="px-2 py-0.2 rounded-full text-[9px] font-extrabold bg-emerald-200 text-emerald-900">✓ Terjadwal Hari Ini</span>` : ''}
                </div>
                <h5 class="font-extrabold text-xs sm:text-sm text-slate-900 truncate leading-snug mt-0.5" title="${st.name}">${st.name}</h5>
                <p class="text-[10px] text-slate-500 truncate mt-0.5">${st.address || '-'} ${st.areaManager ? ' • AM: ' + st.areaManager : ''}</p>
              </div>
            </div>
            <div class="shrink-0">
              ${
                isAssigned
                  ? `<button
                       type="button"
                       onclick="FMCUApp.toggleStoreInWeeklyPicker('${st.code}')"
                       class="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-extrabold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                       title="Hapus toko dari hari ini"
                     >
                       <i class="fa-solid fa-trash-can text-[10px]"></i>
                       <span>Hapus</span>
                     </button>`
                  : `<button
                       type="button"
                       onclick="FMCUApp.toggleStoreInWeeklyPicker('${st.code}')"
                       class="px-3.5 py-1.5 rounded-xl bg-[#009944] hover:bg-emerald-700 text-white text-xs font-extrabold shadow-2xs transition cursor-pointer flex items-center gap-1"
                       title="Tambahkan toko ke jadwal hari ini"
                     >
                       <i class="fa-solid fa-plus text-[10px]"></i>
                       <span>Pilih</span>
                     </button>`
              }
            </div>
          </div>
        `;
      })
      .join('');
  },

  submitManualStoreFromPicker() {
    const { auditorId, dayIndex } = this.weeklyPickerTarget;
    if (!auditorId || dayIndex === null) return;

    const nameInput = document.getElementById('weekly-picker-manual-name');
    const codeInput = document.getElementById('weekly-picker-manual-code');
    const nameVal = (nameInput?.value || '').trim();
    let codeVal = (codeInput?.value || '').trim();

    if (!nameVal) {
      this.showToast('Ketik nama toko yang ingin ditambahkan.', 'warning');
      nameInput?.focus();
      return;
    }

    if (!codeVal) {
      codeVal = 'M-' + Math.floor(1000 + Math.random() * 9000);
    }

    let stores = window.FMCUData.getStores();
    let existing = stores.find(
      (s) =>
        String(s.code).toLowerCase() === String(codeVal).toLowerCase() ||
        String(s.name).toLowerCase() === nameVal.toLowerCase()
    );

    if (!existing) {
      existing = {
        code: codeVal,
        name: nameVal,
        type: 'CVS',
        city: 'Manual Add',
        address: 'Input Manual dari Atur Jadwal',
        lat: null,
        lng: null,
        radiusMeters: 50
      };
      stores.push(existing);
      window.FMCUData.saveStores(stores, existing);
    }

    this.assignStoreToWeeklySlot(existing.code, auditorId, dayIndex, false);
    if (nameInput) nameInput.value = '';
    if (codeInput) codeInput.value = '';

    this.renderWeeklyStorePickerModalContent();
    this.showToast(`Toko manual "${existing.name}" (${existing.code}) berhasil ditambahkan ke jadwal!`, 'success');
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
    for (let d = 0; d < 7; d++) {
      this.weeklyDraftMatrix[this.getWeeklySlotKey(auditorId, d)] = [];
    }
    this.renderWeeklySchedulePlanner();
    this.showToast('Draft jadwal 1 minggu untuk visitor tersebut dikosongkan.', 'info');
  },

  clearAllWeeklyDrafts() {
    this.weeklyDraftMatrix = {};
    this.renderWeeklySchedulePlanner();
    this.showToast('Seluruh draft jadwal pada planner 1 week telah di-reset.', 'info');
  },

  copyAuditorWeekToOthers(sourceAuditorId) {
    this.ensureWeeklyPlannerInitialized();
    const targets = this.weeklySelectedAuditors.filter((id) => id !== sourceAuditorId);
    if (targets.length === 0) {
      this.showToast('Pilih minimal 2 Visitor di Langkah 2 untuk menyalin jadwal mingguan.', 'warning');
      return;
    }
    targets.forEach((tId) => {
      for (let d = 0; d < 7; d++) {
        const srcItems = this.getWeeklySlotItems(sourceAuditorId, d);
        this.weeklyDraftMatrix[this.getWeeklySlotKey(tId, d)] = srcItems.map((it) => ({ ...it }));
      }
    });
    this.renderWeeklySchedulePlanner();
    this.showToast(`Jadwal 1 minggu (Senin–Minggu) berhasil disalin ke ${targets.length} visitor lainnya!`, 'success');
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
    for (let d = 0; d < 7; d++) {
      this.getWeeklySlotItems(auditorId, d).forEach((it) => usedCodes.add(String(it.storeCode)));
    }

    let added = 0;
    for (let d = 0; d < 7; d++) {
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
      this.showToast(`Berhasil mengisi otomatis ${added} hari (Senin–Minggu)!`, 'success');
    }
    return added;
  },

  autoFillFiveDaysForActiveAuditor() {
    this.ensureWeeklyPlannerInitialized();
    const activeAud = this.weeklyActiveSlot.auditorId || this.weeklySelectedAuditors[0];
    if (!activeAud) {
      this.showToast('Pilih minimal 1 Visitor terlebih dahulu.', 'warning');
      return;
    }
    this.autoFillFiveDaysForAuditor(activeAud, { idx: 0 }, false);
  },

  autoFillFiveDaysForAllSelectedAuditors() {
    this.ensureWeeklyPlannerInitialized();
    if (this.weeklySelectedAuditors.length === 0) {
      this.showToast('Pilih minimal 1 Regional Bestie / Visitor di Langkah 2.', 'warning');
      return;
    }
    const cursor = { idx: 0 };
    let totalAdded = 0;
    this.weeklySelectedAuditors.forEach((audId) => {
      totalAdded += this.autoFillFiveDaysForAuditor(audId, cursor, true);
    });
    this.renderWeeklySchedulePlanner();
    this.showToast(
      `Berhasil menyebarkan ${totalAdded} jadwal toko untuk ${this.weeklySelectedAuditors.length} Visitor (Senin–Minggu)!`,
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
          class="shrink-0 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 transition text-left group cursor-pointer shadow-2xs"
        >
          <div class="flex items-center gap-1.5">
            <span class="font-mono font-extrabold text-[11px] text-[#009944]">${st.code}</span>
            <span class="font-extrabold text-xs text-slate-800 group-hover:text-slate-900">${st.name}</span>
          </div>
          <div class="text-[10px] text-slate-500 mt-0.5">
            ${st.type || 'CVS'} • ${st.city || '-'} ${st.areaManager ? '• AM: ' + st.areaManager : ''}
          </div>
        </button>
      `
      )
      .join('');
  },

  // ==========================================================================
  // FOKUS AUDIT (MULTIPLE CHECKLIST & DYNAMIC CUSTOM OPTIONS)
  // ==========================================================================
  renderWeeklyFocusChecklist() {
    const container = document.getElementById('weekly-focus-checklist-container');
    if (!container) return;

    const allOptions = window.FMCUData.getAuditFocusOptions();
    const selectedIds = window.FMCUData.getSelectedFocusOptions();

    // Update badge counter
    const countBadge = document.getElementById('weekly-focus-count-badge');
    if (countBadge) {
      countBadge.textContent = `${selectedIds.length} Terpilih`;
      countBadge.className =
        selectedIds.length > 0
          ? 'text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-teal-50 text-[#0099A6] border border-teal-200 shrink-0'
          : 'text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500 border border-slate-200 shrink-0';
    }

    if (allOptions.length === 0) {
      container.innerHTML = '<div class="text-xs text-slate-400 py-2 text-center">Belum ada pilihan fokus audit. Klik <strong>+ Tambah</strong> untuk menambahkan.</div>';
    } else {
      container.innerHTML = allOptions
        .map((opt) => {
          const isSelected = selectedIds.includes(opt.id);
          const safeText = String(opt.text || '').replace(/"/g, '&quot;');
          return `
            <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-100/80 transition border ${
              isSelected ? 'border-emerald-200 bg-emerald-50/70 shadow-2xs' : 'border-transparent'
            }">
              <label class="flex items-center gap-2 cursor-pointer flex-1 min-w-0 select-none">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="FMCUApp.onToggleFocusOption('${opt.id}', this.checked)" class="w-4 h-4 rounded text-[#009944] focus:ring-emerald-500 accent-[#009944] cursor-pointer shrink-0" />
                <span class="text-xs ${isSelected ? 'font-bold text-emerald-950' : 'text-slate-700'} truncate" title="${safeText}">
                  ${safeText}
                </span>
              </label>
              ${
                !opt.isDefault
                  ? `
                <button type="button" onclick="FMCUApp.deleteFocusOption('${opt.id}')" title="Hapus Pilihan Ini" class="text-slate-400 hover:text-rose-600 p-1 text-[11px] cursor-pointer shrink-0 transition">
                  <i class="fa-regular fa-trash-can"></i>
                </button>
              `
                  : ''
              }
            </div>
          `;
        })
        .join('');
    }

    // Hitung gabungan string fokus terpilih untuk sinkronisasi batch submit jadwal
    const selectedTexts = allOptions.filter((o) => selectedIds.includes(o.id)).map((o) => o.text);
    const combinedStr = selectedTexts.join(', ');

    const hiddenInput = document.getElementById('weekly-default-focus');
    if (hiddenInput) {
      hiddenInput.value = combinedStr || 'Audit Rutin Mingguan (QSC & Observasi)';
    }

    const summaryText = document.getElementById('weekly-focus-summary-text');
    if (summaryText) {
      if (selectedTexts.length > 0) {
        summaryText.textContent = combinedStr;
        summaryText.className = 'text-slate-700 font-semibold truncate';
      } else {
        summaryText.textContent = 'Belum ada fokus audit dipilih (default: Audit Rutin Mingguan)';
        summaryText.className = 'text-slate-400 italic truncate';
      }
    }
  },

  onToggleFocusOption(optId, isChecked) {
    let selectedIds = window.FMCUData.getSelectedFocusOptions();
    if (isChecked) {
      if (!selectedIds.includes(optId)) selectedIds.push(optId);
    } else {
      selectedIds = selectedIds.filter((id) => id !== optId);
    }
    window.FMCUData.saveSelectedFocusOptions(selectedIds);
    this.renderWeeklyFocusChecklist();
  },

  toggleAllWeeklyFocusOptions(selectAll) {
    const allOptions = window.FMCUData.getAuditFocusOptions();
    const selectedIds = selectAll ? allOptions.map((o) => o.id) : [];
    window.FMCUData.saveSelectedFocusOptions(selectedIds);
    this.renderWeeklyFocusChecklist();
  },

  openAddFocusOptionPrompt() {
    const box = document.getElementById('weekly-focus-add-box');
    const input = document.getElementById('weekly-new-focus-input');
    if (box) {
      box.classList.remove('hidden');
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 60);
      }
    }
  },

  closeAddFocusOptionBox() {
    const box = document.getElementById('weekly-focus-add-box');
    const input = document.getElementById('weekly-new-focus-input');
    if (input) input.value = '';
    if (box) box.classList.add('hidden');
  },

  submitNewFocusOption() {
    const input = document.getElementById('weekly-new-focus-input');
    const val = (input?.value || '').trim();
    if (!val) {
      this.showToast('Ketik nama pilihan fokus audit terlebih dahulu.', 'warning');
      return;
    }

    const allOptions = window.FMCUData.getAuditFocusOptions();
    const exists = allOptions.some((o) => o.text.toLowerCase() === val.toLowerCase());
    if (exists) {
      this.showToast('Pilihan fokus audit tersebut sudah ada di dalam daftar.', 'info');
      this.closeAddFocusOptionBox();
      return;
    }

    const newOption = {
      id: `foc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: val,
      isDefault: false
    };
    allOptions.push(newOption);
    window.FMCUData.saveAuditFocusOptions(allOptions);

    // Otomatis centang pilihan baru yang ditambahkan
    const selectedIds = window.FMCUData.getSelectedFocusOptions();
    if (!selectedIds.includes(newOption.id)) {
      selectedIds.push(newOption.id);
      window.FMCUData.saveSelectedFocusOptions(selectedIds);
    }

    this.closeAddFocusOptionBox();
    this.renderWeeklyFocusChecklist();
    this.showToast(`Pilihan fokus audit "${val}" berhasil ditambahkan!`, 'success');
  },

  deleteFocusOption(optId) {
    let allOptions = window.FMCUData.getAuditFocusOptions();
    const target = allOptions.find((o) => o.id === optId);
    if (!target) return;

    if (!confirm(`Hapus pilihan fokus audit "${target.text}"?`)) return;

    allOptions = allOptions.filter((o) => o.id !== optId);
    window.FMCUData.saveAuditFocusOptions(allOptions);

    let selectedIds = window.FMCUData.getSelectedFocusOptions();
    selectedIds = selectedIds.filter((id) => id !== optId);
    window.FMCUData.saveSelectedFocusOptions(selectedIds);

    this.renderWeeklyFocusChecklist();
    this.showToast('Pilihan fokus audit berhasil dihapus.', 'info');
  },

  renderWeeklySchedulePlanner() {
    this.ensureWeeklyPlannerInitialized();
    this.renderWeeklyFocusChecklist();
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
    if (rangeBadge && fiveDays.length === 7) {
      rangeBadge.textContent = `${fiveDays[0].shortDate} – ${fiveDays[6].shortDate} (Senin–Minggu)`;
    }
    const nearestInfoEl = document.getElementById('weekly-nearest-monday-info');
    if (nearestInfoEl && fiveDays.length === 7) {
      const todayActualStr = window.FMCUPdf.formatIndonesianDate(this.getLocalDateISO(), true);
      const mondayTargetStr = window.FMCUPdf.formatIndonesianDate(fiveDays[0].dateStr, true);
      nearestInfoEl.innerHTML = `<i class="fa-regular fa-calendar-check mr-1"></i>Aktual Hari Ini: <strong>${todayActualStr}</strong> &rarr; Senin Terdekat: <strong>${mondayTargetStr}</strong>`;
    }

    // 2. Render Step 2 Visitor Multi-Select Cards (Khusus Visitor / Regional Bestie)
    const audGrid = document.getElementById('weekly-auditor-selector-grid');
    if (audGrid) {
      if (users.length === 0) {
        audGrid.innerHTML = `<div class="col-span-full text-xs text-slate-400 py-3">Belum ada akun dengan role Visitor / Regional Bestie.</div>`;
      } else {
        const weekDatesSet = new Set(fiveDays.map((d) => d.dateStr));
        audGrid.innerHTML = users
          .map((u) => {
          const isSelected = this.weeklySelectedAuditors.includes(u.id);
          let draftCount = 0;
          for (let d = 0; d < 7; d++) {
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
        activeIndicator.textContent = '🎯 Pilih Visitor di Langkah 2 terlebih dahulu';
      }
    }
    this.renderWeeklyQuickStoreResults();

    // 4. Render 1-Week Matrix Board per Selected Visitor
    const boardEl = document.getElementById('weekly-planner-board');
    if (!boardEl) return;

    if (this.weeklySelectedAuditors.length === 0) {
      boardEl.innerHTML = `
        <div class="fm-card p-8 text-center space-y-2 border border-dashed border-slate-300">
          <div class="text-2xl text-slate-400"><i class="fa-solid fa-user-check"></i></div>
          <div class="font-extrabold text-sm text-slate-700">Belum Ada Regional Bestie / Visitor yang Dipilih</div>
          <p class="text-xs text-slate-500">Klik tombol <strong>"Pilih Semua Visitor"</strong> atau pilih nama Visitor pada Langkah 2 di atas untuk menampilkan papan jadwal 1 week (Senin s/d Minggu).</p>
        </div>
      `;
    } else {
      boardEl.innerHTML = this.weeklySelectedAuditors
        .map((audId) => {
          const u = users.find((x) => x.id === audId);
          if (!u) return '';
          let audDraftTotal = 0;
          for (let d = 0; d < 7; d++) {
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
                  class="rounded-2xl border p-2.5 sm:p-3 flex flex-col justify-between gap-2.5 transition cursor-pointer ${
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

                  <!-- Custom Store Picker Action Button (Tanpa Native Dropdown System) -->
                  <div onclick="event.stopPropagation()" class="space-y-1.5 pt-1">
                    <button
                      type="button"
                      onclick="FMCUApp.openWeeklyStorePickerModal('${u.id}', ${dayObj.dayIndex})"
                      class="w-full py-2 px-2.5 rounded-xl border border-emerald-300 hover:border-[#009944] bg-emerald-50/70 hover:bg-emerald-100/90 text-emerald-900 text-[11px] font-extrabold flex items-center justify-between shadow-2xs transition group cursor-pointer"
                      title="Buka pemilih toko khusus untuk ${dayObj.dayName}"
                    >
                      <span class="flex items-center gap-1.5 truncate">
                        <i class="fa-solid fa-store text-emerald-600 text-xs"></i>
                        <span>Pilih Toko...</span>
                      </span>
                      <span class="w-5 h-5 rounded-lg bg-white text-[#009944] group-hover:bg-[#009944] group-hover:text-white flex items-center justify-center text-[10px] shadow-2xs transition shrink-0">
                        <i class="fa-solid fa-plus"></i>
                      </span>
                    </button>
                    <button
                      type="button"
                      onclick="FMCUApp.promptAddManualStoreToWeeklySlot('${u.id}', ${dayObj.dayIndex})"
                      class="w-full py-1 px-2 rounded-lg bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                      title="Tambah toko secara manual jika belum ada di master toko"
                    >
                      <i class="fa-solid fa-pencil text-[9px] text-slate-400"></i>
                      <span>+ Toko Manual</span>
                    </button>
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
                    <span>Isi Otomatis Sen–Min</span>
                  </button>
                  <button
                    type="button"
                    onclick="FMCUApp.copyAuditorWeekToOthers('${u.id}')"
                    class="px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0099A6] border border-teal-200 font-extrabold text-[11px] transition flex items-center gap-1 cursor-pointer"
                    title="Salin susunan toko 1 minggu visitor ini ke visitor terpilih lainnya"
                  >
                    <i class="fa-regular fa-copy"></i>
                    <span>Salin ke Visitor Lain</span>
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

              <!-- 7 Columns: Senin s/d Minggu -->
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-2.5">
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
      for (let d = 0; d < 7; d++) {
        c += this.getWeeklySlotItems(audId, d).length;
      }
      if (c > 0) activeAuditorsWithDraft++;
      totalDraftSchedules += c;
    });

    const totalDraftBadge = document.getElementById('weekly-total-draft-badge');
    if (totalDraftBadge) {
      totalDraftBadge.innerHTML = `
        <span class="sm:hidden">${totalDraftSchedules} Jadwal Siap</span>
        <span class="hidden sm:inline">${totalDraftSchedules} Jadwal Visit Siap Ditugaskan (Senin–Minggu)</span>
      `;
    }
    const totalAudBadge = document.getElementById('weekly-total-auditor-badge');
    if (totalAudBadge) {
      totalAudBadge.textContent = `${activeAuditorsWithDraft} / ${this.weeklySelectedAuditors.length} Visitor`;
    }
    const applyBtnText = document.getElementById('weekly-apply-btn-text');
    if (applyBtnText) {
      applyBtnText.innerHTML =
        totalDraftSchedules > 0
          ? `<span class="sm:hidden">Simpan (${totalDraftSchedules})</span><span class="hidden sm:inline">Terapkan & Simpan Jadwal 1 Week (${totalDraftSchedules})</span>`
          : `<span class="sm:hidden">Simpan Jadwal</span><span class="hidden sm:inline">Terapkan & Simpan Jadwal 1 Week</span>`;
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
      this.showToast('Belum ada toko yang dimasukkan ke dalam jadwal 1 minggu (Senin–Minggu). Silakan pilih toko terlebih dahulu.', 'warning');
      return;
    }

    const updatedSchedules = [...newSchedules, ...schedules];
    window.FMCUData.saveSchedules(updatedSchedules);

    this.weeklyDraftMatrix = {};
    this.renderAllViews();
    this.switchScheduleSubSection('list');
    this.showToast(
      `🎉 Berhasil menerapkan ${newSchedules.length} Jadwal Visit 1 Week (Senin–Minggu) untuk ${involvedAuditors.size} Visitor!`,
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
        'Nama Visitor / Regional Bestie': u.name,
        Username: `@${u.username}`,
        'Jabatan / Role': u.roleBadge || u.role,
        'Wilayah / Region': u.region || '-',
        'Email Visitor': u.email || '-',
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
        'Nama Visitor / Bestie': s.auditorName || au.name || '-',
        'Region Visitor': au.region || '-',
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
    // SHEET 3: MATRIKS JADWAL 5 HARI (SENIN - JUMAT) PER VISITOR
    // ========================================================================
    this.ensureWeeklyPlannerInitialized();
    const fiveDays = this.getFiveWorkDays(this.weeklyMondayDate);
    const weeklyMatrixRows = users.map((u, idx) => {
      const row = {
        No: idx + 1,
        'Nama Visitor / Regional Bestie': u.name,
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
      row['Total Toko Minggu Ini (Senin–Minggu)'] = weekTotal;
      return row;
    });

    // ========================================================================
    // SHEET 4: REKAP DETAIL LAPORAN VISIT & TEMUAN OBSERVASI SEMUA VISITOR
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
        'Nama Visitor': r.auditorName || '-',
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
      auditorRecapRows.length > 0 ? auditorRecapRows : [{ Info: 'Belum ada data visitor' }]
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
    XLSX.utils.book_append_sheet(wb, ws1, 'Rekap Performa Visitor');

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
    XLSX.utils.book_append_sheet(wb, ws3, 'Matriks 1 Week (Sen-Min)');

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
    const fileName = `Rekap_Jadwal_Visit_&_Visitor_FMCU_${dateStamp}.xlsx`;
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

  // ==========================================================================
  // KALENDER PENUH JADWAL VISIT (FULL MONTH VIEW) UNTUK ADMIN
  // ==========================================================================
  adminCalendarState: {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    selectedAuditor: 'ALL',
    selectedStatus: 'ALL',
    selectedDateStr: null
  },

  renderAdminCalendarView() {
    const gridEl = document.getElementById('admin-calendar-days-grid');
    if (!gridEl) return;

    if (!this.adminCalendarState) {
      const now = new Date();
      this.adminCalendarState = {
        year: now.getFullYear(),
        month: now.getMonth(),
        selectedAuditor: 'ALL',
        selectedStatus: 'ALL',
        selectedDateStr: null
      };
    }

    const year = this.adminCalendarState.year;
    const month = this.adminCalendarState.month;
    const indoMonths = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    // 1. Update Month & Year Heading Label
    const labelEl = document.getElementById('admin-calendar-month-label');
    if (labelEl) {
      labelEl.textContent = `${indoMonths[month]} ${year}`;
    }

    // 2. Populate Visitor Filter Dropdown
    const audFilterSel = document.getElementById('admin-calendar-filter-auditor');
    if (audFilterSel) {
      const auditors = this.getSchedulableAuditors();
      const curAud = this.adminCalendarState.selectedAuditor || 'ALL';
      audFilterSel.innerHTML =
        `<option value="ALL">Semua Visitor (${auditors.length})</option>` +
        auditors.map((u) => `<option value="${u.id}" ${u.id === curAud ? 'selected' : ''}>${u.name}</option>`).join('');
    }

    // 3. Retrieve All Schedules & Reports
    const allSchedules = window.FMCUData.getSchedules() || [];
    const reports = window.FMCUData.getReports() || [];
    const todayStr = this.getLocalDateISO();

    // Monthly Metrics Calculation
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthlySchedules = allSchedules.filter((s) => String(s.scheduledDate || '').startsWith(monthPrefix));

    let totalInMonth = 0;
    let completedInMonth = 0;
    let pendingInMonth = 0;
    const uniqueStoresSet = new Set();

    monthlySchedules.forEach((s) => {
      totalInMonth++;
      if (s.storeCode) uniqueStoresSet.add(s.storeCode);
      const isDone = s.status === 'COMPLETED' || Boolean(s.reportId) || reports.some((r) => r.storeCode === s.storeCode && r.visitDate === s.scheduledDate);
      if (isDone) completedInMonth++;
      else pendingInMonth++;
    });

    const statTotalEl = document.getElementById('admin-cal-stat-total');
    if (statTotalEl) statTotalEl.innerHTML = `Total: <strong>${totalInMonth}</strong> Jadwal`;
    const statCompEl = document.getElementById('admin-cal-stat-completed');
    if (statCompEl) statCompEl.innerHTML = `✓ Selesai: <strong>${completedInMonth}</strong>`;
    const statPendEl = document.getElementById('admin-cal-stat-pending');
    if (statPendEl) statPendEl.innerHTML = `⏳ Pending: <strong>${pendingInMonth}</strong>`;
    const statStoresEl = document.getElementById('admin-cal-stat-stores');
    if (statStoresEl) statStoresEl.innerHTML = `🏬 Toko: <strong>${uniqueStoresSet.size}</strong>`;

    // 4. Calculate 7-day grid starting from Monday
    const firstDay = new Date(year, month, 1);
    const dayOfWeek = firstDay.getDay(); // 0 is Sunday, 1 is Monday...
    const startOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Mon=0, Tue=1, ..., Sun=6

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const selAuditor = this.adminCalendarState.selectedAuditor || 'ALL';
    const selStatus = this.adminCalendarState.selectedStatus || 'ALL';

    const cellHtmls = [];

    for (let i = 0; i < totalCells; i++) {
      let cellYear = year;
      let cellMonth = month;
      let cellDayNum = 0;
      let isCurrentMonth = true;

      if (i < startOffset) {
        // Prev Month Padding
        isCurrentMonth = false;
        cellDayNum = daysInPrevMonth - startOffset + 1 + i;
        if (month === 0) {
          cellMonth = 11;
          cellYear = year - 1;
        } else {
          cellMonth = month - 1;
        }
      } else if (i >= startOffset + daysInMonth) {
        // Next Month Padding
        isCurrentMonth = false;
        cellDayNum = i - (startOffset + daysInMonth) + 1;
        if (month === 11) {
          cellMonth = 0;
          cellYear = year + 1;
        } else {
          cellMonth = month + 1;
        }
      } else {
        // Current Month
        isCurrentMonth = true;
        cellDayNum = i - startOffset + 1;
      }

      const cellDateStr = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(cellDayNum).padStart(2, '0')}`;
      const isToday = cellDateStr === todayStr;

      // Filter schedules on this date
      let daySchedules = allSchedules.filter((s) => s.scheduledDate === cellDateStr);

      if (selAuditor !== 'ALL') {
        daySchedules = daySchedules.filter((s) => s.auditorId === selAuditor);
      }

      if (selStatus === 'COMPLETED') {
        daySchedules = daySchedules.filter((s) => s.status === 'COMPLETED' || s.reportId || reports.some((r) => r.storeCode === s.storeCode && r.visitDate === s.scheduledDate));
      } else if (selStatus === 'PENDING') {
        daySchedules = daySchedules.filter((s) => s.status !== 'COMPLETED' && !s.reportId && !reports.some((r) => r.storeCode === s.storeCode && r.visitDate === s.scheduledDate));
      }

      const completedCount = daySchedules.filter((s) => s.status === 'COMPLETED' || s.reportId || reports.some((r) => r.storeCode === s.storeCode && r.visitDate === s.scheduledDate)).length;
      const pendingCount = daySchedules.length - completedCount;

      cellHtmls.push(`
        <div onclick="FMCUApp.openAdminCalendarDayDetail('${cellDateStr}')"
             class="min-h-[85px] sm:min-h-[115px] p-1.5 sm:p-2 rounded-xl flex flex-col justify-between transition cursor-pointer select-none group ${
               !isCurrentMonth
                 ? 'bg-slate-50/50 border border-slate-100 text-slate-400 opacity-60 hover:opacity-100 hover:bg-slate-50'
                 : isToday
                 ? 'bg-emerald-50/50 border-2 border-[#009944] shadow-xs ring-2 ring-emerald-500/20'
                 : 'bg-white border border-slate-200/90 hover:border-amber-400 hover:shadow-xs'
             }">
          <!-- Header Cell: Tanggal & Badge Jumlah -->
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="text-xs font-black ${
              isToday
                ? 'w-6 h-6 rounded-full bg-[#009944] text-white flex items-center justify-center text-[11px] shadow-2xs'
                : !isCurrentMonth
                ? 'text-slate-400'
                : 'text-slate-700 group-hover:text-amber-700'
            }">${cellDayNum}</span>

            ${daySchedules.length > 0 ? `
              <div class="flex items-center gap-0.5">
                ${completedCount > 0 ? `<span class="text-[9px] font-extrabold px-1 rounded-full bg-emerald-100 text-emerald-800" title="${completedCount} Selesai">✓${completedCount}</span>` : ''}
                ${pendingCount > 0 ? `<span class="text-[9px] font-extrabold px-1 rounded-full bg-amber-100 text-amber-800" title="${pendingCount} Pending">⏳${pendingCount}</span>` : ''}
              </div>
            ` : ''}
          </div>

          <!-- Body Cell: List Toko (Maksimal 2 kartu ringkas) -->
          <div class="space-y-1 flex-1 overflow-hidden">
            ${daySchedules.slice(0, 2).map((s) => {
              const isDone = s.status === 'COMPLETED' || s.reportId || reports.some((r) => r.storeCode === s.storeCode && r.visitDate === s.scheduledDate);
              return `
                <div class="px-1.5 py-0.5 rounded text-[10px] leading-tight font-bold truncate flex items-center gap-1 ${
                  isDone ? 'bg-emerald-100/90 text-emerald-900 border border-emerald-200' : 'bg-amber-100/90 text-amber-900 border border-amber-200'
                }" title="${s.storeName} - ${s.auditorName || ''}">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? 'bg-emerald-600' : 'bg-amber-600'}"></span>
                  <span class="truncate">${s.storeName}</span>
                </div>
              `;
            }).join('')}

            ${daySchedules.length > 2 ? `
              <div class="text-[9px] font-extrabold text-amber-700 pt-0.5 group-hover:underline truncate">
                +${daySchedules.length - 2} toko lagi...
              </div>
            ` : ''}
          </div>

          <!-- Footer Cell -->
          <div class="text-[9px] text-slate-400 font-medium text-right pt-0.5 hidden sm:block">
            ${daySchedules.length > 0 ? `<span class="text-[9px] text-slate-500 font-semibold group-hover:text-amber-700">Detail &raquo;</span>` : ''}
          </div>
        </div>
      `);
    }

    gridEl.innerHTML = cellHtmls.join('');
  },

  shiftAdminCalendarMonth(delta) {
    this.triggerHaptic('light');
    if (!this.adminCalendarState) {
      const now = new Date();
      this.adminCalendarState = { year: now.getFullYear(), month: now.getMonth(), selectedAuditor: 'ALL', selectedStatus: 'ALL', selectedDateStr: null };
    }
    this.adminCalendarState.month += delta;
    if (this.adminCalendarState.month < 0) {
      this.adminCalendarState.month = 11;
      this.adminCalendarState.year -= 1;
    } else if (this.adminCalendarState.month > 11) {
      this.adminCalendarState.month = 0;
      this.adminCalendarState.year += 1;
    }
    this.renderAdminCalendarView();
  },

  setAdminCalendarToCurrentMonth() {
    this.triggerHaptic('light');
    const now = new Date();
    this.adminCalendarState = {
      year: now.getFullYear(),
      month: now.getMonth(),
      selectedAuditor: this.adminCalendarState?.selectedAuditor || 'ALL',
      selectedStatus: this.adminCalendarState?.selectedStatus || 'ALL',
      selectedDateStr: null
    };
    this.renderAdminCalendarView();
  },

  onAdminCalendarFilterChange() {
    if (!this.adminCalendarState) return;
    const audSel = document.getElementById('admin-calendar-filter-auditor');
    const statusSel = document.getElementById('admin-calendar-filter-status');
    if (audSel) this.adminCalendarState.selectedAuditor = audSel.value;
    if (statusSel) this.adminCalendarState.selectedStatus = statusSel.value;
    this.renderAdminCalendarView();
  },

  openAdminCalendarDayDetail(dateStr) {
    if (!dateStr) return;
    this.triggerHaptic('light');
    this.adminCalendarState.selectedDateStr = dateStr;

    const modal = document.getElementById('modal-admin-calendar-day-detail');
    const titleEl = document.getElementById('modal-cal-day-title');
    const subtitleEl = document.getElementById('modal-cal-day-subtitle');
    const bodyEl = document.getElementById('modal-cal-day-body');
    const btnOpenPlanner = document.getElementById('modal-cal-btn-open-planner');
    if (!modal || !bodyEl) return;

    const dayFormatted = window.FMCUPdf.formatIndonesianDate(dateStr, true);
    if (titleEl) titleEl.textContent = dayFormatted;

    const schedules = window.FMCUData.getSchedules() || [];
    const reports = window.FMCUData.getReports() || [];
    const daySchedules = schedules.filter((s) => s.scheduledDate === dateStr);

    if (subtitleEl) {
      subtitleEl.textContent = `${daySchedules.length} Jadwal Kunjungan Toko`;
    }

    if (btnOpenPlanner) {
      btnOpenPlanner.onclick = () => this.openPlannerForDate(dateStr);
    }

    if (daySchedules.length === 0) {
      bodyEl.innerHTML = `
        <div class="border border-dashed border-slate-200 rounded-2xl py-10 px-4 text-center space-y-2 bg-slate-50/50">
          <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl mx-auto">
            <i class="fa-regular fa-calendar-xmark"></i>
          </div>
          <div class="text-slate-800 font-extrabold text-sm">Tidak Ada Jadwal Visit</div>
          <div class="text-slate-500 text-xs max-w-sm mx-auto">Belum ada kunjungan toko yang dijadwalkan untuk tanggal ${dayFormatted}.</div>
          <div class="pt-3">
            <button type="button" onclick="FMCUApp.openPlannerForDate('${dateStr}')" class="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-calendar-plus"></i>
              <span>Jadwalkan Toko di Tanggal Ini</span>
            </button>
          </div>
        </div>
      `;
    } else {
      bodyEl.innerHTML = daySchedules.map((s) => {
        const matchedRep = reports.find((r) => (s.reportId && r.id === s.reportId) || (r.storeCode === s.storeCode && r.visitDate === s.scheduledDate));
        const isDone = s.status === 'COMPLETED' || Boolean(s.reportId) || Boolean(matchedRep);
        const repId = s.reportId || matchedRep?.id || null;
        return `
          <div class="border ${isDone ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'} rounded-2xl p-4 space-y-3 shadow-2xs">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                    ${isDone ? '✓ Selesai' : '⏳ Terjadwal'}
                  </span>
                  <span class="text-xs font-black text-slate-900">${s.storeName} (${s.storeCode})</span>
                </div>
                <div class="text-[11px] text-slate-500 mt-0.5">
                  <i class="fa-solid fa-user-check text-slate-400 mr-1"></i>Visitor: <strong class="text-slate-800">${s.auditorName || 'Belum Ditugaskan'}</strong>
                </div>
              </div>

              <div class="flex items-center gap-1.5">
                ${isDone && repId ? `
                  <button type="button" onclick="FMCUApp.openReportPreview('${repId}'); FMCUApp.closeAdminCalendarDayDetail();" class="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-2xs transition flex items-center gap-1 cursor-pointer">
                    <i class="fa-solid fa-file-pdf"></i>
                    <span>Lihat PDF</span>
                  </button>
                ` : `
                  <button type="button" onclick="FMCUApp.openStoreVisitForm('${s.storeCode}', '${s.id}'); FMCUApp.closeAdminCalendarDayDetail();" class="px-3 py-1.5 rounded-xl fm-gradient text-white font-extrabold text-xs shadow-2xs transition flex items-center gap-1 cursor-pointer">
                    <i class="fa-solid fa-file-waveform"></i>
                    <span>Form Visit</span>
                  </button>
                  <button type="button" onclick="FMCUApp.deleteSchedule('${s.id}'); FMCUApp.openAdminCalendarDayDetail('${dateStr}');" class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition cursor-pointer" title="Hapus Jadwal Ini">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                `}
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div class="flex items-center gap-1.5 text-slate-600">
                <i class="fa-regular fa-clock text-slate-400"></i>
                <span>Window: <strong>${s.window || '08:30 - 17:30'}</strong></span>
              </div>
              <div class="flex items-center gap-1.5 text-slate-600">
                <i class="fa-solid fa-crosshairs text-slate-400"></i>
                <span>Fokus: <strong>${s.focus || 'Audit Standar'}</strong></span>
              </div>
              ${s.actualIn ? `
                <div class="flex items-center gap-1.5 text-emerald-700 sm:col-span-2 font-semibold">
                  <i class="fa-solid fa-location-dot text-emerald-600"></i>
                  <span>Check-in: ${s.actualIn} ${s.actualOut ? `| Check-out: ${s.actualOut}` : ''}</span>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  closeAdminCalendarDayDetail() {
    const modal = document.getElementById('modal-admin-calendar-day-detail');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
  },

  openPlannerForDate(dateStr) {
    if (!dateStr) return;
    this.closeAdminCalendarDayDetail();
    // Calculate Monday of the week for dateStr
    const parts = dateStr.split('-');
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const day = dt.getDay(); // 0 Sun, 1 Mon ...
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(dt.setDate(diff));
    const yyyy = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    const mondayStr = `${yyyy}-${mm}-${dd}`;

    this.weeklyMondayDate = mondayStr;
    const mondayInput = document.getElementById('weekly-monday-input');
    if (mondayInput) mondayInput.value = mondayStr;
    this.onChangeWeeklyMonday(mondayStr);
    this.switchScheduleSubSection('create');
    this.showToast(`Membuka Planner 1 Week untuk periode minggu ${mondayStr}.`, 'info');
  },

  handleSaveStore(event) {
    event.preventDefault();
    const code = document.getElementById('adm-st-code').value.trim();
    const type = document.getElementById('adm-st-type').value.trim() || 'CVS';
    const name = document.getElementById('adm-st-name').value.trim().toUpperCase();
    const city = document.getElementById('adm-st-city')?.value.trim() || '';
    const address = document.getElementById('adm-st-address')?.value.trim() || '';
    const rawLat = document.getElementById('adm-st-lat')?.value?.trim() || '';
    const rawLng = document.getElementById('adm-st-lng')?.value?.trim() || '';
    const parsedLat = rawLat !== '' && !isNaN(Number(rawLat)) ? Number(rawLat) : null;
    const parsedLng = rawLng !== '' && !isNaN(Number(rawLng)) ? Number(rawLng) : null;
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
      lat: parsedLat,
      lng: parsedLng,
      latitude: parsedLat,
      longitude: parsedLng,
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
    if (document.getElementById('adm-st-lat')) document.getElementById('adm-st-lat').value = st.lat ?? st.latitude ?? '';
    if (document.getElementById('adm-st-lng')) document.getElementById('adm-st-lng').value = st.lng ?? st.longitude ?? '';
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

  onInputUserNik(val) {
    const cleanNik = String(val || '').trim();
    const uEl = document.getElementById('adm-usr-username');
    const pEl = document.getElementById('adm-usr-password');
    if (uEl && (!uEl.value || uEl.dataset.autoFromNik === '1')) {
      uEl.value = cleanNik.toLowerCase();
      uEl.dataset.autoFromNik = cleanNik ? '1' : '';
    }
    if (pEl && (!pEl.value || pEl.dataset.autoFromNik === '1')) {
      pEl.value = cleanNik;
      pEl.dataset.autoFromNik = cleanNik ? '1' : '';
    }
  },

  mergeOrReplaceImportedUsers(extractedUsers, mode = 'merge') {
    const currentUsers = window.FMCUData.getUsers();
    if (mode === 'replace') {
      // Pertahankan akun Super Admin & Admin Jadwal agar akses Admin tetap aman, ganti seluruh akun Visitor
      const preservedAdmins = currentUsers.filter(
        (u) => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN_SCHEDULE'
      );
      const adminKeys = new Set(
        preservedAdmins.map((u) => String(u.nik || u.username || '').toLowerCase())
      );
      const nonDuplicateImported = extractedUsers.filter(
        (u) => !adminKeys.has(String(u.nik || u.username || '').toLowerCase())
      );
      return [...preservedAdmins, ...nonDuplicateImported];
    }

    // Mode Merge: Tambah user baru & perbarui user dengan NIK / Username / Nama yang sama
    const finalUsers = [...currentUsers];
    extractedUsers.forEach((imp) => {
      const impNik = String(imp.nik || '').trim().toLowerCase();
      const impUser = String(imp.username || '').trim().toLowerCase();
      const impName = String(imp.name || '').trim().toLowerCase();

      const existIdx = finalUsers.findIndex((u) => {
        const uNik = String(u.nik || '').trim().toLowerCase();
        const uUser = String(u.username || '').trim().toLowerCase();
        const uName = String(u.name || '').trim().toLowerCase();
        return (
          (impNik && (uNik === impNik || uUser === impNik)) ||
          (impUser && uUser === impUser) ||
          (impName && uName === impName && u.role !== 'SUPER_ADMIN')
        );
      });

      if (existIdx !== -1) {
        const prev = finalUsers[existIdx];
        finalUsers[existIdx] = {
          ...prev,
          ...imp,
          id: prev.id || imp.id,
          lastLocation: prev.lastLocation || null
        };
      } else {
        finalUsers.push(imp);
      }
    });

    return finalUsers;
  },

  async handleUploadUserExcel() {
    const fileInput = document.getElementById('adm-user-excel-file-input');
    const passModeSelect = document.getElementById('adm-user-excel-pass-mode');
    const importModeSelect = document.getElementById('adm-user-excel-import-mode');
    const statusBox = document.getElementById('adm-user-excel-upload-status');
    const btn = document.getElementById('btn-upload-excel-users');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      this.showToast('Silakan pilih file Excel (.xlsx / .xls / .csv) berisi tabel Nama, NIK, JABATAN terlebih dahulu.', 'warning');
      return;
    }

    const file = fileInput.files[0];
    const passwordMode = passModeSelect ? passModeSelect.value : 'nik';
    const importMode = importModeSelect ? importModeSelect.value : 'merge';

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Mengimport...</span>`;
    }
    if (statusBox) {
      statusBox.className = 'text-xs font-semibold p-3 rounded-xl bg-teal-50 text-teal-900 border border-teal-200 block';
      statusBox.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Sedang membaca & mengekstraksi tabel karyawan/user dari file <strong>${file.name}</strong>...`;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const extracted = window.FMCUData.parseUsersFromExcelArrayBuffer(arrayBuffer, { passwordMode });

      if (!extracted || extracted.length === 0) {
        throw new Error('Tidak ditemukan baris data user yang valid di dalam file Excel tersebut.');
      }

      const finalUsers = this.mergeOrReplaceImportedUsers(extracted, importMode);
      window.FMCUData.saveUsers(finalUsers);
      this.populateHeaderRoleSwitcher();
      this.renderAllViews();
      this.updateAdminFirestoreSummary();

      if (statusBox) {
        statusBox.className = 'text-xs font-semibold p-3 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 block';
        statusBox.innerHTML = `✅ Berhasil meng-import <strong>${extracted.length} User Karyawan</strong> dari file <strong>${file.name}</strong> (Total User Terdaftar: <strong>${finalUsers.length} Akun</strong>) dan menyinkronkannya ke Cloud Firestore!`;
      }
      this.showToast(`Berhasil import ${extracted.length} User dari ${file.name}!`, 'success');
      fileInput.value = '';
    } catch (err) {
      console.error('User Excel upload parse error:', err);
      if (statusBox) {
        statusBox.className = 'text-xs font-semibold p-3 rounded-xl bg-rose-50 text-rose-900 border border-rose-200 block';
        statusBox.innerHTML = `❌ Gagal membaca file Excel: ${err.message || 'Pastikan terdapat kolom Nama, NIK, JABATAN'}`;
      }
      this.showToast('Gagal mengekstrak file Excel User: ' + (err.message || ''), 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-file-import"></i><span>Import User Excel</span>`;
      }
    }
  },

  async reloadDefaultExcelUsers() {
    const passModeSelect = document.getElementById('adm-user-excel-pass-mode');
    const importModeSelect = document.getElementById('adm-user-excel-import-mode');
    const statusBox = document.getElementById('adm-user-excel-upload-status');
    const passwordMode = passModeSelect ? passModeSelect.value : 'nik';
    const importMode = importModeSelect ? importModeSelect.value : 'merge';

    if (statusBox) {
      statusBox.className = 'text-xs font-semibold p-3 rounded-xl bg-teal-50 text-teal-900 border border-teal-200 block';
      statusBox.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Membaca & meng-import data dari file <code>Data_Karyawan_NIK.xlsx</code>...`;
    }

    const extracted = await window.FMCUData.fetchAndExtractProjectUserExcelFile({ passwordMode });
    if (extracted && extracted.length > 0) {
      const finalUsers = this.mergeOrReplaceImportedUsers(extracted, importMode);
      window.FMCUData.saveUsers(finalUsers);
      this.populateHeaderRoleSwitcher();
      this.renderAllViews();
      this.updateAdminFirestoreSummary();

      if (statusBox) {
        statusBox.className = 'text-xs font-semibold p-3 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 block';
        statusBox.innerHTML = `✅ Berhasil mengekstrak & meng-import <strong>${extracted.length} Karyawan (Nama, NIK, JABATAN)</strong> dari <code>Data_Karyawan_NIK.xlsx</code> (Total User: <strong>${finalUsers.length} Akun</strong>) dan menyinkronkannya ke Cloud Firestore!`;
      }
      this.showToast(`${extracted.length} User dari Data_Karyawan_NIK.xlsx berhasil di-import!`, 'success');
    } else {
      this.showToast('Gagal memuat file Data_Karyawan_NIK.xlsx.', 'error');
    }
  },

  downloadUserExcelTemplate() {
    if (typeof XLSX === 'undefined') {
      this.showToast('Library Excel (SheetJS) belum termuat.', 'error');
      return;
    }
    const seedRows = (window.FMCUData.EMPLOYEE_NIK_SEED_ROWS || []).map((r) => ({
      Nama: r.name,
      NIK: r.nik,
      JABATAN: r.jabatan
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(
      seedRows.length > 0
        ? seedRows
        : [
            { Nama: 'Aan Bagus Permana', NIK: '210822947', JABATAN: 'Regional Bestie' },
            { Nama: 'Anggi Novita', NIK: '230723742', JABATAN: 'Regional Bestie' }
          ]
    );
    ws['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Data_Karyawan_NIK');
    XLSX.writeFile(wb, 'Data_Karyawan_NIK_Template.xlsx');
    this.showToast('Template Excel (Nama, NIK, JABATAN) berhasil diunduh!', 'success');
  },

  editUser(userId) {
    const users = window.FMCUData.getUsers();
    const u = users.find((x) => x.id === userId);
    if (!u) return;
    document.getElementById('adm-usr-name').value = u.name || '';
    const nikEl = document.getElementById('adm-usr-nik');
    if (nikEl) nikEl.value = u.nik || '';
    const jabEl = document.getElementById('adm-usr-jabatan');
    if (jabEl) jabEl.value = u.jabatan || 'Regional Bestie';
    const uEl = document.getElementById('adm-usr-username');
    if (uEl) {
      uEl.value = u.username || '';
      uEl.dataset.autoFromNik = '';
    }
    const pEl = document.getElementById('adm-usr-password');
    if (pEl) {
      pEl.value = u.password || '';
      pEl.dataset.autoFromNik = '';
    }
    document.getElementById('adm-usr-role').value = u.role || 'AUDITOR';
    document.getElementById('adm-usr-region').value = u.region || '';
    document.getElementById('adm-usr-email').value = u.email || '';

    document.querySelectorAll('input[name="adm-auth"]').forEach((cb) => {
      cb.checked = this.hasAuthority(cb.value, u);
    });
    this.showToast(`Memuat akun ${u.name} (NIK/User: ${u.nik || u.username}) ke form edit`, 'info');
  },

  handleSaveUser(event) {
    event.preventDefault();
    const name = document.getElementById('adm-usr-name').value.trim();
    const nik = (document.getElementById('adm-usr-nik')?.value || '').trim();
    const jabatan = (document.getElementById('adm-usr-jabatan')?.value || 'Regional Bestie').trim();
    const username = document.getElementById('adm-usr-username').value.trim().toLowerCase();
    const password = document.getElementById('adm-usr-password').value.trim();
    const role = document.getElementById('adm-usr-role').value;
    const region = document.getElementById('adm-usr-region').value.trim();
    const email = document.getElementById('adm-usr-email').value.trim();

    const checkedAuths = Array.from(document.querySelectorAll('input[name="adm-auth"]:checked')).map((el) => el.value);
    const roleBadges = {
      AUDITOR: jabatan ? `Visitor / ${jabatan}` : 'Visitor / Regional Bestie',
      ADMIN_SCHEDULE: 'Admin Jadwal',
      SUPER_ADMIN: 'Super Admin FMCU'
    };

    const users = window.FMCUData.getUsers();
    const existingIdx = users.findIndex(
      (u) =>
        u.username.toLowerCase() === username ||
        (nik && u.nik && String(u.nik).toLowerCase() === nik.toLowerCase())
    );
    const newUser = {
      id: existingIdx !== -1 ? users[existingIdx].id : nik ? `usr-${nik}` : 'usr-' + Date.now(),
      nik,
      jabatan: jabatan || 'Regional Bestie',
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
    this.showToast(`User ${name} (NIK/User: ${nik || username}) berhasil disimpan ke Firestore!`, 'success');
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
      gasWebhookUrl: document.getElementById('set-gas-url').value.trim(),
      autoWatermarkGps: document.getElementById('set-auto-watermark-gps')?.checked ?? true
    };
    window.FMCUData.saveSettings(settings);
    this.renderPreviewView();
    this.showToast('Pengaturan Integrasi Email, Database Foto Google Drive & PDF berhasil disimpan ke Firestore!', 'success');
  },

  populateGasScriptPreview() {
    const codeBox = document.getElementById('gas-code-preview');
    if (!codeBox) return;
    codeBox.textContent = `/**
 * ============================================================================
 * FMCU VISIT STORE REPORT - GOOGLE APPS SCRIPT BACKEND (Code.gs)
 * Arsitektur Penyimpanan Hierarki Folder Google Drive:
 * 1. Root Folder: 15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8
 * 2. Folder Tahun: "01. VISIT BESTIE 2026" (Auto-create tahun berjalan/berikutnya)
 * 3. Folder Visitor: Nama Regional Bestie / Visitor
 * 4. Folder Toko: Kode & Nama Toko yang divisit (contoh: "0449 - PORIS PARADISE")
 * 5. Tiga Lampiran di dalam Folder Toko:
 *    a. PDF Laporan Visit ("Hasil Kunjungan-{Nama Store}-{DD-MM-YYYY}.pdf")
 *    b. Foto Lembar QSC ("Lembar QSC-FAMITRACK-{Nama Store}-{DD-MM-YYYY}.pdf") - Vertikal
 *    c. Spreadsheet CA Store Assignment (Auto generate link live online & lock Kolom A-D)
 * ============================================================================
 *
 * CARA DEPLOY (1 MENIT):
 * 1. Buka https://script.google.com -> Buat Project Baru
 * 2. Paste seluruh kode ini ke dalam Code.gs
 * 3. Klik tombol "Deploy" -> "New deployment"
 * 4. Pilih type: "Web app"
 *    - Description: "FMCU Backend v2"
 *    - Execute as: "Me" (Akun Google Anda yang memiliki akses folder GDrive)
 *    - Who has access: "Anyone" (Siapa saja, agar web app FMCU bisa mengirim data)
 * 5. Salin Web App URL (https://script.google.com/macros/s/.../exec)
 * 6. Tempel URL tersebut pada pop-up Kirim Laporan atau Portal Admin di web FMCU.
 * ============================================================================
 */

var DEFAULT_ROOT_GDRIVE_ID = "15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8";

/**
 * UJI KONEKTIVITAS & OTORISASI DRIVEAPP
 * Jalankan fungsi ini langsung di editor Apps Script (pilih fungsi 'testConnection' lalu klik '▷ Jalankan')
 * untuk memicu pop-up Otorisasi Izin Google Drive dan memeriksa apakah akun Anda sudah diberi hak akses ke folder.
 */
function testConnection() {
  var rootId = DEFAULT_ROOT_GDRIVE_ID;
  var userEmail = '';
  try {
    userEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  } catch (eU) {}

  Logger.log('====================================================');
  Logger.log('=== UJI KONEKTIVITAS FMCU DRIVEAPP & PERMISSION ===');
  Logger.log('Akun Google aktif yang mengeksekusi: ' + (userEmail || '(akun pemilik deployment)'));
  Logger.log('Target Folder ID: ' + rootId);
  Logger.log('----------------------------------------------------');

  try {
    var folder = DriveApp.getFolderById(rootId);
    Logger.log('✓ BERHASIL TERHUBUNG KE GOOGLE DRIVE!');
    Logger.log('  Nama Folder  : "' + folder.getName() + '"');
    Logger.log('  URL Folder   : ' + folder.getUrl());

    // Uji coba membuat sub-folder sementara
    var testSubName = '_uji_koneksi_' + new Date().getTime();
    var testSub = folder.createFolder(testSubName);
    Logger.log('✓ BERHASIL MEMBUAT FOLDER UJI: "' + testSub.getName() + '"');
    testSub.setTrashed(true);
    Logger.log('✓ FOLDER UJI BERHASIL DIBERSIHKAN (TRASHED).');
    Logger.log('====================================================');
    Logger.log('STATUS FINAL: DRIVEAPP 100% AKTIF, TEROTORISASI & SIAP DIGUNAKAN!');
    Logger.log('====================================================');
    return 'SUKSES: DriveApp aktif dan terhubung ke folder: ' + folder.getName();
  } catch (err) {
    Logger.log('✗ GAGAL MENGAKSES FOLDER: ' + err.toString());
    Logger.log('----------------------------------------------------');
    Logger.log('PANDUAN SOLUSI "Akses ditolak DriveApp":');
    Logger.log('1. Akun "' + (userEmail || 'Anda') + '" belum ditambahkan sebagai Editor pada folder ' + rootId);
    Logger.log('2. Buka link ini di browser: https://drive.google.com/drive/folders/' + rootId);
    Logger.log('3. Klik tombol Bagikan (Share) pada folder "05. VISIT STORE"');
    Logger.log('4. Masukkan email "' + (userEmail || 'FamilyMart Anda') + '" dan pilih peran sebagai "Editor"');
    Logger.log('5. Setelah dibagikan, jalankan ulang fungsi testConnection ini.');
    Logger.log('====================================================');
    throw err;
  }
}

/**
 * Endpoint GET: Health check & uji coba konektivitas
 */
function doGet(e) {
  var rootId = DEFAULT_ROOT_GDRIVE_ID;
  var accessible = false;
  var rootName = '';
  var errorNotice = null;
  var userEmail = '';

  try {
    userEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  } catch (eU) {}

  try {
    var f = DriveApp.getFolderById(rootId);
    accessible = true;
    rootName = f.getName();
  } catch (err) {
    errorNotice = err.toString();
  }

  return jsonResponse_({
    status: 'ONLINE',
    service: 'FMCU Visit Report - Google Drive & Email Backend',
    timestamp: new Date().toISOString(),
    accountExecuting: userEmail || 'Owner Deployment',
    targetFolderId: rootId,
    targetFolderAccessible: accessible,
    targetFolderName: rootName,
    errorNotice: errorNotice,
    troubleshooting: !accessible ? {
      message: 'Folder ' + rootId + ' belum dibagikan ke akun ' + (userEmail || 'ini'),
      action: 'Buka folder https://drive.google.com/drive/folders/' + rootId + ' di browser, klik Bagikan (Share), lalu tambahkan email "' + (userEmail || 'Google Apps Script Anda') + '" sebagai Editor.'
    } : null
  });
}

/**
 * Endpoint POST: Menangani Upload Foto, Sync 3 Berkas & Pengiriman Email
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({
        status: 'ERROR',
        message: 'Payload kosong atau tidak valid.'
      });
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || 'sendReport';

    // ========================================================================
    // ACTION 1: UPLOAD FOTO INDIVIDUAL KE DATABASE GOOGLE DRIVE (QSC / BUKTI)
    // ========================================================================
    if (action === 'uploadPhoto') {
      var rawBase64 = payload.photoBase64 || '';
      if (rawBase64.indexOf(',') !== -1) {
        rawBase64 = rawBase64.split(',')[1];
      }
      var decodedPhoto = Utilities.base64Decode(rawBase64);
      var photoFileName = payload.fileName || ('FMCU_PHOTO_' + new Date().getTime() + '.jpg');
      var photoBlob = Utilities.newBlob(decodedPhoto, 'image/jpeg', photoFileName);

      var rootFolderPhoto = getOrCreateTargetFolder_(payload.gdrivePhotoFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_Visit_Database');
      var storeFolderNamePhoto = ((payload.storeCode || 'STORE') + ' - ' + (payload.storeName || 'VISIT')).replace(/[\\\\/:*?"<>|]/g, ' ').trim();
      var storeFolderPhoto = getOrCreateSubFolder_(rootFolderPhoto, storeFolderNamePhoto);

      var photoFile = storeFolderPhoto.createFile(photoBlob);
      try {
        photoFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (eShareP) {}
      var fileId = photoFile.getId();

      return jsonResponse_({
        status: 'SUCCESS',
        action: 'uploadPhoto',
        photoId: payload.photoId || '',
        fileId: fileId,
        directUrl: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200',
        viewUrl: photoFile.getUrl()
      });
    }

    // ========================================================================
    // ACTION 2: AMBIL FOTO DARI GOOGLE DRIVE DALAM BENTUK BASE64
    // ========================================================================
    if (action === 'getPhotoBase64') {
      var fileIds = payload.fileIds || (payload.fileId ? [payload.fileId] : []);
      var photosMap = {};

      for (var i = 0; i < fileIds.length; i++) {
        var fid = fileIds[i];
        if (!fid) continue;
        try {
          var f = DriveApp.getFileById(fid);
          var blob = f.getBlob();
          var b64 = Utilities.base64Encode(blob.getBytes());
          var mime = blob.getContentType() || 'image/jpeg';
          photosMap[fid] = 'data:' + mime + ';base64,' + b64;
        } catch (errFetch) {
          photosMap[fid] = '';
        }
      }

      return jsonResponse_({
        status: 'SUCCESS',
        action: 'getPhotoBase64',
        photos: photosMap
      });
    }

    // ========================================================================
    // ACTION 3: SIMPAN LAPORAN DENGAN ATURAN HIERARKI FOLDER GDRIVE & 3 LAMPIRAN
    // ========================================================================
    var report = payload.report || {};
    var storeName = (report.storeName || payload.storeName || 'STORE').trim();
    var storeCode = (report.storeCode || payload.storeCode || '').trim();
    var visitorName = (report.auditorName || payload.visitorName || 'Visitor').trim();
    var rawDate = report.visitDate || '';

    // Hitung Tahun & Tanggal Terformat (DD-MM-YYYY)
    var visitYear = '2026';
    var ddMmYyyy = '';
    if (rawDate) {
      var yMatch = String(rawDate).match(/^(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})/);
      if (yMatch) {
        visitYear = yMatch[1];
        ddMmYyyy = ('0' + yMatch[3]).slice(-2) + '-' + ('0' + yMatch[2]).slice(-2) + '-' + visitYear;
      } else {
        var dObj = new Date(rawDate);
        if (!isNaN(dObj.getTime())) {
          visitYear = String(dObj.getFullYear());
          ddMmYyyy = ('0' + dObj.getDate()).slice(-2) + '-' + ('0' + (dObj.getMonth() + 1)).slice(-2) + '-' + visitYear;
        }
      }
    }
    if (!ddMmYyyy) {
      var now = new Date();
      visitYear = String(now.getFullYear());
      ddMmYyyy = ('0' + now.getDate()).slice(-2) + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + visitYear;
    }

    // 1. Root Folder (Target folder: 15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8)
    var rootFolderId = payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID;
    var rootFolder = getOrCreateTargetFolder_(rootFolderId, 'FMCU_VISIT_REPORTS');

    // 2. Folder Tahun (Format: "01. VISIT BESTIE 2026", auto create untuk tahun selanjutnya)
    var yearFolderName = '01. VISIT BESTIE ' + visitYear;
    var yearFolder = getOrCreateSubFolder_(rootFolder, yearFolderName);

    // 3. Folder Visitor (Target nama yang cocok sesuai Visitor)
    var visitorFolder = getOrCreateSubFolder_(yearFolder, visitorName);

    // 4. Folder Toko yang divisit (di dalam folder visitor)
    var storeFolderName = (storeCode ? (storeCode + ' - ' + storeName) : storeName).replace(/[\\\\/:*?"<>|]/g, ' ').trim();
    var storeFolder = getOrCreateSubFolder_(visitorFolder, storeFolderName);

    // ------------------------------------------------------------------------
    // LAMPIRAN 1: PDF Laporan Visit ("Hasil Kunjungan-{Nama Store}-{DD-MM-YYYY}.pdf")
    // ------------------------------------------------------------------------
    var pdfFile = null;
    var pdfUrl = '';
    var pdfFileName = 'Hasil Kunjungan-' + storeName + '-' + ddMmYyyy + '.pdf';

    if (payload.pdfBase64) {
      try {
        var b64Pdf = payload.pdfBase64.indexOf(',') !== -1 ? payload.pdfBase64.split(',')[1] : payload.pdfBase64;
        var decodedPdf = Utilities.base64Decode(b64Pdf);
        var pdfBlob = Utilities.newBlob(decodedPdf, 'application/pdf', payload.fileName || pdfFileName);
        
        // Hapus versi lama jika ada nama file yang sama
        var existingPdfs = storeFolder.getFilesByName(payload.fileName || pdfFileName);
        while (existingPdfs.hasNext()) {
          try { existingPdfs.next().setTrashed(true); } catch (eTr) {}
        }

        pdfFile = storeFolder.createFile(pdfBlob);
        try {
          pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        } catch (eSharePdf) {}
        pdfUrl = pdfFile.getUrl();
      } catch (errPdf) {
        Logger.log('Error creating Lampiran 1 PDF: ' + errPdf.toString());
      }
    }

    // ------------------------------------------------------------------------
    // LAMPIRAN 2: Foto Lembar QSC - Auto Kolase Format PDF Vertikal
    // ------------------------------------------------------------------------
    var qscPdfFile = null;
    var qscPdfUrl = '';
    if (payload.qscPdfBase64) {
      try {
        var b64Qsc = payload.qscPdfBase64.indexOf(',') !== -1 ? payload.qscPdfBase64.split(',')[1] : payload.qscPdfBase64;
        var decodedQsc = Utilities.base64Decode(b64Qsc);
        var qscFileName = 'Lembar QSC-FAMITRACK-' + storeName + '-' + ddMmYyyy + '.pdf';
        var qscBlob = Utilities.newBlob(decodedQsc, 'application/pdf', qscFileName);

        // Hapus versi lama jika ada nama file yang sama
        var existingQscs = storeFolder.getFilesByName(qscFileName);
        while (existingQscs.hasNext()) {
          try { existingQscs.next().setTrashed(true); } catch (eTrQ) {}
        }

        qscPdfFile = storeFolder.createFile(qscBlob);
        try {
          qscPdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        } catch (eShareQsc) {}
        qscPdfUrl = qscPdfFile.getUrl();
      } catch (errQsc) {
        Logger.log('Error creating Lampiran 2 QSC PDF: ' + errQsc.toString());
      }
    }

    // ------------------------------------------------------------------------
    // LAMPIRAN 3: Spreadsheet CA Store Assignment (Auto generate & LOCK Kolom A-D)
    // ------------------------------------------------------------------------
    var caSpreadsheetUrl = '';
    try {
      var ssTitle = 'CA Store Assignment - ' + storeName;
      var existingSs = storeFolder.getFilesByName(ssTitle);
      var ss = null;

      if (existingSs.hasNext()) {
        var exFile = existingSs.next();
        ss = SpreadsheetApp.openById(exFile.getId());
      } else {
        ss = SpreadsheetApp.create(ssTitle);
        var ssFile = DriveApp.getFileById(ss.getId());
        ssFile.moveTo(storeFolder);
        ssFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
      }

      var sheet = ss.getActiveSheet();
      sheet.setName('ISI LANGSUNG PADA SPREADSHEET');
      sheet.clear();

      // Atur lebar kolom persis template CA_Store_Assignment.xlsx
      sheet.setColumnWidth(1, 45);   // A: NO
      sheet.setColumnWidth(2, 35);   // B: DAFTAR TEMUAN part 1
      sheet.setColumnWidth(3, 110);  // C: part 2
      sheet.setColumnWidth(4, 180);  // D: part 3
      sheet.setColumnWidth(5, 160);  // E: TANGGAL PERBAIKAN
      sheet.setColumnWidth(6, 480);  // F: BUKTI PERBAIKAN

      // Row 1: Header Banner (Background #46BDC6 / Cyan FM, Teks Putih Bold)
      var r1 = sheet.getRange('A1:F1');
      r1.merge();
      r1.setValue('FORM DIISI OLEH TIM OPERASIONAL TOKO');
      r1.setBackground('#46BDC6');
      r1.setFontColor('#FFFFFF');
      r1.setFontWeight('bold');
      r1.setFontSize(12);
      r1.setHorizontalAlignment('center');
      r1.setVerticalAlignment('middle');
      sheet.setRowHeight(1, 46);

      // Rows 3-7: Info Metadata Kunjungan
      var metaRows = [
        { label: 'Kode Toko', val: storeCode || '-' },
        { label: 'Nama Store', val: storeName || '-' },
        { label: 'Nama Visitor', val: visitorName || '-' },
        { label: 'Tanggal Visit', val: report.visitDateFormatted || ddMmYyyy || '-' },
        { label: 'PIC Store', val: report.storeHead || '-' }
      ];

      for (var m = 0; m < metaRows.length; m++) {
        var rIdx = 3 + m;
        var rLabel = sheet.getRange('A' + rIdx + ':C' + rIdx);
        rLabel.merge();
        rLabel.setValue(metaRows[m].label);
        rLabel.setBackground('#46BDC6');
        rLabel.setFontColor('#FFFFFF');
        rLabel.setFontWeight('bold');
        rLabel.setFontSize(10);
        rLabel.setVerticalAlignment('middle');

        var rVal = sheet.getRange('D' + rIdx + ':E' + rIdx);
        rVal.merge();
        rVal.setValue(metaRows[m].val);
        rVal.setFontWeight('bold');
        rVal.setFontSize(10);
        rVal.setVerticalAlignment('middle');

        sheet.getRange(rIdx, 1, 1, 5).setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);
        sheet.setRowHeight(rIdx, 24);
      }

      // Row 9: Header Kolom Temuan
      var r9No = sheet.getRange('A9');
      r9No.setValue('NO');
      r9No.setBackground('#46BDC6');
      r9No.setFontColor('#FFFFFF');
      r9No.setFontWeight('bold');
      r9No.setFontSize(10);
      r9No.setHorizontalAlignment('center');
      r9No.setVerticalAlignment('middle');

      var r9Daftar = sheet.getRange('B9:D9');
      r9Daftar.merge();
      r9Daftar.setValue('DAFTAR TEMUAN\\n(berdasarkan list pada visit report)');
      r9Daftar.setBackground('#46BDC6');
      r9Daftar.setFontColor('#FFFFFF');
      r9Daftar.setFontWeight('bold');
      r9Daftar.setFontSize(10);
      r9Daftar.setHorizontalAlignment('center');
      r9Daftar.setVerticalAlignment('middle');
      r9Daftar.setWrap(true);

      var r9Tgl = sheet.getRange('E9');
      r9Tgl.setValue('TANGGAL PERBAIKAN');
      r9Tgl.setBackground('#46BDC6');
      r9Tgl.setFontColor('#FFFFFF');
      r9Tgl.setFontWeight('bold');
      r9Tgl.setFontSize(10);
      r9Tgl.setHorizontalAlignment('center');
      r9Tgl.setVerticalAlignment('middle');
      r9Tgl.setWrap(true);

      var r9Bukti = sheet.getRange('F9');
      r9Bukti.setValue('BUKTI PERBAIKAN\\n(isi dengan foto perbaikan)');
      r9Bukti.setBackground('#46BDC6');
      r9Bukti.setFontColor('#FFFFFF');
      r9Bukti.setFontWeight('bold');
      r9Bukti.setFontSize(10);
      r9Bukti.setHorizontalAlignment('center');
      r9Bukti.setVerticalAlignment('middle');
      r9Bukti.setWrap(true);

      sheet.getRange('A9:F9').setBorder(true, true, true, true, true, true, '#94A3B8', SpreadsheetApp.BorderStyle.SOLID);
      sheet.setRowHeight(9, 50);

      // Rows 10+: Temuan Observasi (Batch Write & Style for Ultra-Fast Execution)
      var observations = [];
      if (Array.isArray(report.opiObservations) && report.opiObservations.length > 0) {
        observations = observations.concat(report.opiObservations.filter(function(o) { return o && (o.temuan || o.deskripsi); }));
      }
      var qscObs = report.qscObservations || report.observations || [];
      if (Array.isArray(qscObs) && qscObs.length > 0) {
        observations = observations.concat(qscObs.filter(function(o) { return o && (o.temuan || o.deskripsi); }));
      }
      if (observations.length === 0 && Array.isArray(report.observations)) {
        observations = report.observations;
      }
      var totalDataRows = Math.max(observations.length, 5);
      var tableValues = [];

      for (var oi = 0; oi < totalDataRows; oi++) {
        var obsItem = (oi < observations.length) ? observations[oi] : null;
        var descText = obsItem ? (obsItem.temuan || obsItem.deskripsi || '') : '';
        if (obsItem && obsItem.tindakanPerbaikan) {
          descText += '\\n(Action: ' + obsItem.tindakanPerbaikan + ')';
        }
        var deadlineText = obsItem ? (obsItem.deadlineFormatted || obsItem.deadline || '') : '';
        tableValues.push([
          oi + 1,
          descText,
          '',
          '',
          deadlineText,
          ''
        ]);
      }

      sheet.getRange(10, 1, totalDataRows, 6).setValues(tableValues);
      sheet.getRange(10, 1, totalDataRows, 6).setBorder(true, true, true, true, true, true, '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(10, 1, totalDataRows, 1).setHorizontalAlignment('center').setVerticalAlignment('middle').setFontSize(10);
      sheet.getRange(10, 2, totalDataRows, 3).setWrap(true).setVerticalAlignment('top').setFontSize(10);
      sheet.getRange(10, 5, totalDataRows, 1).setHorizontalAlignment('center').setVerticalAlignment('middle').setFontSize(10);
      sheet.getRange(10, 6, totalDataRows, 1).setVerticalAlignment('middle');

      for (var oi = 0; oi < totalDataRows; oi++) {
        var rNum = 10 + oi;
        sheet.getRange(rNum, 2, 1, 3).merge();
        sheet.setRowHeight(rNum, 40);
      }

      // KUNCI / LOCK KOLOM A-D (Toko hanya bisa mengisi Kolom E & F pada data temuan)
      try {
        var protection = sheet.protect().setDescription('Kunci Kolom A-D (Form Store CA)');
        var unprotectedRange = sheet.getRange(10, 5, totalDataRows, 2); // Kolom E & F
        protection.setUnprotectedRanges([unprotectedRange]);
      } catch (eProt) {
        Logger.log('Protection setup notice: ' + eProt.toString());
      }

      caSpreadsheetUrl = ss.getUrl();
    } catch (eSs) {
      Logger.log('CA Spreadsheet creation error: ' + eSs.toString());
    }

    // ------------------------------------------------------------------------
    // SISTEM PENGIRIMAN EMAIL DIHAPUS TOTAL (MODE TESTING)
    // ------------------------------------------------------------------------
    // Seluruh kode pengiriman email dinonaktifkan agar tidak ada email yang terkirim ke
    // tim Store, Area Manager, Regional Manager, maupun tim FMCU.
    // Laporan murni hanya diarsipkan ke Google Drive.
    var emailStatus = 'DISABLED';

    return jsonResponse_({
      status: 'SUCCESS',
      pdfUrl: pdfUrl,
      qscPdfUrl: qscPdfUrl,
      caSpreadsheetUrl: caSpreadsheetUrl,
      storeFolderUrl: storeFolder.getUrl(),
      visitorFolderUrl: visitorFolder.getUrl(),
      yearFolderUrl: yearFolder.getUrl(),
      emailStatus: emailStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return jsonResponse_({
      status: 'ERROR',
      message: error.toString()
    });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function extractDriveFolderId_(input) {
  if (!input) return '';
  var str = String(input).trim();
  var folderMatch = str.match(/\\/folders\\/([a-zA-Z0-9_-]{20,})/);
  if (folderMatch) return folderMatch[1];
  var idParamMatch = str.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (idParamMatch) return idParamMatch[1];
  var directMatch = str.match(/([a-zA-Z0-9_-]{25,})/);
  if (directMatch) return directMatch[1];
  return str;
}

function getOrCreateTargetFolder_(folderIdOrUrl, defaultFolderName) {
  var cleanId = extractDriveFolderId_(folderIdOrUrl);
  if (cleanId && cleanId.length >= 15) {
    try {
      return DriveApp.getFolderById(cleanId);
    } catch (e) {
      Logger.log('Could not get folder by ID: ' + cleanId + ' -> ' + e.toString());
    }
  }
  var folders = DriveApp.getFoldersByName(defaultFolderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(defaultFolderName);
}

function findSubFolderCaseInsensitive_(parentFolder, targetName) {
  if (!parentFolder || !targetName) return null;
  var cleanTarget = String(targetName).trim().toLowerCase();
  var subFolders = parentFolder.getFolders();
  while (subFolders.hasNext()) {
    var f = subFolders.next();
    if (f.getName().trim().toLowerCase() === cleanTarget) {
      return f;
    }
  }
  return null;
}

function getOrCreateSubFolder_(parentFolder, subFolderName) {
  var existing = findSubFolderCaseInsensitive_(parentFolder, subFolderName);
  if (existing) {
    return existing;
  }
  return parentFolder.createFolder(subFolderName);
}
`;
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
          <div class="text-xs font-extrabold text-[#0099A6] mt-1">${this.hasAdminAuthority(u) ? 'Admin + Visitor' : 'Visitor / Regional Bestie'}</div>
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

  // ==========================================================================
  // HALAMAN KHUSUS: LIVE LOCATION MAPS (KHUSUS ADMIN JADWAL & SUPER ADMIN)
  // ==========================================================================
  liveLocMap: null,
  liveLocStoreLayer: null,
  liveLocGeofenceLayer: null,
  liveLocRouteLayer: null,
  liveLocBestieLayer: null,
  liveLocSelectedBestieId: null,
  liveLocSearchQuery: '',
  liveLocBestieScope: 'ALL',
  _liveLocBestieMarkerMap: null,
  _liveLocStoreMarkerMap: null,
  _liveLocLayerVisibility: {
    besties: true,
    stores: true,
    geofence: true,
    routes: true
  },

  canAccessLiveMaps(user = this.currentUser) {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_SCHEDULE') return true;
    if (this.hasAuthority('manage_schedule', user) || this.hasAuthority('manage_users', user) || this.hasAuthority('view_live_maps', user)) return true;
    return false;
  },

  renderLiveLocView() {
    if (!this.canAccessLiveMaps()) return;

    const users = window.FMCUData.getUsers();
    const besties = users.filter((u) => this.isAuditorUser(u));
    const stores = window.FMCUData.getStores();
    const schedules = window.FMCUData.getSchedules();
    const todayStr = this.getLocalDateISO();
    const todaySchedules = schedules.filter((s) => s.scheduledDate === todayStr);

    // 1. KPI Stats
    const totalBestiesEl = document.getElementById('live-loc-stat-total-besties');
    if (totalBestiesEl) totalBestiesEl.textContent = besties.length || 18;

    const onlineBestiesEl = document.getElementById('live-loc-stat-online-besties');
    if (onlineBestiesEl) {
      const activeCount = besties.filter((b) => b.lastLocation?.lat || b.active).length;
      onlineBestiesEl.textContent = activeCount || besties.length;
    }

    const totalStoresEl = document.getElementById('live-loc-stat-total-stores');
    if (totalStoresEl) totalStoresEl.textContent = stores.length || 610;

    const todayVisitsEl = document.getElementById('live-loc-stat-today-visits');
    if (todayVisitsEl) todayVisitsEl.textContent = todaySchedules.length;

    const schedSubEl = document.getElementById('live-loc-stat-schedule-sub');
    if (schedSubEl) {
      const completedCount = todaySchedules.filter((s) => s.status === 'COMPLETED').length;
      schedSubEl.textContent = `${completedCount} Selesai • ${todaySchedules.length - completedCount} Berjalan`;
    }

    // 2. Populate Bestie Select Dropdown
    const selectEl = document.getElementById('live-loc-bestie-select');
    if (selectEl) {
      const currentVal = selectEl.value;
      const sortedBesties = [...besties].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'));
      let optHtml = `<option value="ALL">-- Pilih Fokus Bestie (Semua ${besties.length}) --</option>`;
      sortedBesties.forEach((b) => {
        const idVal = b.id || b.username;
        optHtml += `<option value="${idVal}">${b.name} (${b.nik || '-'})</option>`;
      });
      selectEl.innerHTML = optHtml;
      if (currentVal && Array.from(selectEl.options).some((o) => o.value === currentVal)) {
        selectEl.value = currentVal;
      }
    }

    // 3. Render Leaflet Map & Markers
    this.initOrUpdateLiveLocMap();

    // 4. Render Responsive Bestie Cards Side List
    this.renderLiveLocBestieList();
  },

  initOrUpdateLiveLocMap() {
    const container = document.getElementById('live-loc-dedicated-map');
    if (!container || typeof L === 'undefined') return;

    const centerLat = this.liveGps.lat !== null ? this.liveGps.lat : -6.2088;
    const centerLng = this.liveGps.lng !== null ? this.liveGps.lng : 106.8456;

    if (!this.liveLocMap) {
      this.liveLocMap = L.map('live-loc-dedicated-map', {
        zoomControl: true,
        attributionControl: false
      }).setView([centerLat, centerLng], 11);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(this.liveLocMap);
    }

    // Buat layer groups jika belum ada
    if (!this.liveLocStoreLayer) this.liveLocStoreLayer = L.layerGroup();
    if (!this.liveLocGeofenceLayer) this.liveLocGeofenceLayer = L.layerGroup();
    if (!this.liveLocRouteLayer) this.liveLocRouteLayer = L.layerGroup();
    if (!this.liveLocBestieLayer) this.liveLocBestieLayer = L.layerGroup();

    // Pastikan layer terdaftar atau disembunyikan sesuai toggle
    const syncLayer = (layer, key) => {
      if (this._liveLocLayerVisibility[key]) {
        if (!this.liveLocMap.hasLayer(layer)) this.liveLocMap.addLayer(layer);
      } else {
        if (this.liveLocMap.hasLayer(layer)) this.liveLocMap.removeLayer(layer);
      }
    };

    syncLayer(this.liveLocStoreLayer, 'stores');
    syncLayer(this.liveLocGeofenceLayer, 'geofence');
    syncLayer(this.liveLocRouteLayer, 'routes');
    syncLayer(this.liveLocBestieLayer, 'besties');

    this.liveLocStoreLayer.clearLayers();
    this.liveLocGeofenceLayer.clearLayers();
    this.liveLocRouteLayer.clearLayers();
    this.liveLocBestieLayer.clearLayers();

    this._liveLocBestieMarkerMap = new Map();
    this._liveLocStoreMarkerMap = new Map();

    const stores = window.FMCUData.getStores();
    const schedules = window.FMCUData.getSchedules();
    const todayStr = this.getLocalDateISO();
    const todaySchedules = schedules.filter((s) => s.scheduledDate === todayStr);
    const scheduledStoreCodes = new Set(todaySchedules.map((s) => String(s.storeCode)));

    // 1. Render seluruh Toko FamilyMart
    stores.forEach((st) => {
      const lat = Number(st.lat ?? st.latitude);
      const lng = Number(st.lng ?? st.longitude);
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

      const codeStr = String(st.code);
      const isScheduledToday = scheduledStoreCodes.has(codeStr);
      const schInfo = todaySchedules.find((s) => String(s.storeCode) === codeStr);

      const circle = L.circleMarker([lat, lng], {
        radius: isScheduledToday ? 8 : 5,
        fillColor: isScheduledToday ? '#f59e0b' : '#009944',
        color: '#ffffff',
        weight: isScheduledToday ? 2.5 : 1.5,
        fillOpacity: isScheduledToday ? 0.95 : 0.85
      }).addTo(this.liveLocStoreLayer);

      this._liveLocStoreMarkerMap.set(codeStr, circle);

      // Gambar Geofence 15m jika ada jadwal hari ini
      if (isScheduledToday) {
        L.circle([lat, lng], {
          radius: 15,
          color: '#009944',
          fillColor: '#009944',
          fillOpacity: 0.15,
          weight: 2,
          dashArray: '4, 4'
        }).addTo(this.liveLocGeofenceLayer);
      }

      const gmapUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      circle.bindPopup(`
        <div class="text-xs p-1 space-y-2" style="min-width: 220px;">
          <div class="font-extrabold text-emerald-800 text-sm flex items-center gap-1.5">
            <i class="fa-solid fa-store text-[#009944]"></i>
            <span>FamilyMart ${st.name}</span>
          </div>
          <div class="text-[11px] font-mono text-slate-500 font-bold">
            Kode: <span class="text-slate-800 font-bold">${st.code}</span> • ${st.city || 'Jabodetabek'}
          </div>
          <div class="text-[11px] text-slate-600">
            ${st.address || '-'}
          </div>
          ${
            isScheduledToday
              ? `<div class="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                  <div class="font-extrabold flex items-center gap-1">
                    <i class="fa-solid fa-calendar-day"></i> Jadwal Hari Ini:
                  </div>
                  <div>Visitor: <strong>${schInfo?.auditorName || '-'}</strong></div>
                  <div>Status: <span class="font-bold">${schInfo?.status || 'PENDING'}</span></div>
                </div>`
              : ''
          }
          <div class="pt-1 flex items-center justify-between border-t border-slate-100">
            <span class="text-[10px] font-mono text-slate-400">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
            <a href="${gmapUrl}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 rounded bg-[#009944] hover:bg-emerald-700 text-white font-bold text-[10px] inline-flex items-center gap-1">
              <i class="fa-solid fa-diamond-turn-right"></i> Rute Maps
            </a>
          </div>
        </div>
      `);
    });

    // 2. Render Regional Besties & Route lines
    const isPrivilegedAdmin = Boolean(
      this.currentUser &&
      (this.currentUser.role === 'SUPER_ADMIN' ||
       this.currentUser.role === 'SCHEDULE_ADMIN' ||
       this.currentUser.role === 'AREA_MANAGER' ||
       this.currentUser.role === 'REGIONAL_MANAGER' ||
       this.currentUser.username === 'admin')
    );
    const users = window.FMCUData.getUsers();
    const besties = users.filter((u) => this.isAuditorUser(u));
    const currentUserId = this.currentUser?.id || this.currentUser?.username;
    const now = Date.now();

    besties.forEach((bestie) => {
      let lat = bestie.lastLocation?.lat;
      let lng = bestie.lastLocation?.lng;
      let storeVisit = bestie.lastLocation?.storeVisit || null;

      // HANYA RENDER JIKA MEMILIKI LOKASI GPS AKTUAL
      if (!lat || !lng) return;

      lat = Number(lat);
      lng = Number(lng);
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

      const isMe = String(bestie.id || bestie.username) === String(currentUserId);

      // LIVE LOC SISI USER: Regular visitor only sees self!
      if (!isPrivilegedAdmin && !isMe) {
        return;
      }
      const initials = (bestie.name || 'RB')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('');

      // Cek jadwal hari ini
      const myScheduleToday = todaySchedules.find((s) => this.isScheduleOwnedByUser(s, bestie));
      let targetStore = null;
      if (myScheduleToday) {
        targetStore = stores.find((st) => String(st.code) === String(myScheduleToday.storeCode));
      }

      // Jika ada target store, gambar rute garis putus-putus
      if (targetStore && targetStore.lat && targetStore.lng) {
        const tLat = Number(targetStore.lat);
        const tLng = Number(targetStore.lng);
        if (!isNaN(tLat) && !isNaN(tLng)) {
          L.polyline([[lat, lng], [tLat, tLng]], {
            color: '#0099A6',
            weight: 2,
            dashArray: '5, 8',
            opacity: 0.75
          }).addTo(this.liveLocRouteLayer);
        }
      }

      let distText = '';
      if (this.liveGps.lat !== null && this.liveGps.lng !== null && !isMe) {
        const d = this.calculateHaversineDistance(this.liveGps.lat, this.liveGps.lng, lat, lng);
        if (d !== null) {
          distText = d < 1000 ? `${d}m dari Anda` : `${(d / 1000).toFixed(1)}km dari Anda`;
        }
      }

      let timeAgoText = 'Aktif Hari Ini';
      if (bestie.lastLocation?.updatedAt) {
        const diffMs = now - new Date(bestie.lastLocation.updatedAt).getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 2) timeAgoText = 'Baru saja';
        else if (diffMin < 60) timeAgoText = `${diffMin} menit yang lalu`;
        else timeAgoText = `${Math.floor(diffMin / 60)} jam yang lalu`;
      }

      const markerHtml = `
        <div class="relative flex items-center justify-center cursor-pointer group" style="transform: translate(-50%, -50%);">
          <div class="w-8 h-8 rounded-full ${
            isMe
              ? 'bg-gradient-to-tr from-[#0099A6] to-teal-400 ring-4 ring-teal-300/60 shadow-lg animate-pulse'
              : 'bg-gradient-to-tr from-indigo-600 to-purple-600 ring-2 ring-white shadow-md'
          } flex items-center justify-center text-white text-[11px] font-black transition transform group-hover:scale-125">
            ${isMe ? '<i class="fa-solid fa-crosshairs text-xs"></i>' : initials}
          </div>
          <div class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full ${
            isMe ? 'bg-teal-400' : 'bg-emerald-500'
          } border-2 border-white shadow-xs flex items-center justify-center text-[7px] text-white">
            <i class="fa-solid fa-check"></i>
          </div>
          <div class="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow pointer-events-none">
            ${isMe ? 'Anda (' + (bestie.name?.split(' ')[0] || 'User') + ')' : bestie.name?.split(' ')[0] || 'Bestie'}
          </div>
        </div>
      `;

      const bestieIcon = L.divIcon({
        className: 'bestie-gps-pin',
        html: markerHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18]
      });

      const m = L.marker([lat, lng], { icon: bestieIcon, zIndexOffset: 1000 }).addTo(this.liveLocBestieLayer);
      const bKey = String(bestie.id || bestie.username);
      this._liveLocBestieMarkerMap.set(bKey, m);

      const gmapUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      m.bindPopup(`
        <div class="text-xs p-1 space-y-2" style="min-width: 230px;">
          <div class="flex items-center gap-2 pb-1.5 border-b border-slate-100">
            <div class="w-8 h-8 rounded-full ${isMe ? 'bg-[#0099A6]' : 'bg-indigo-600'} text-white font-extrabold text-xs flex items-center justify-center">
              ${initials}
            </div>
            <div class="min-w-0">
              <div class="font-extrabold text-slate-900 text-sm truncate">${bestie.name} ${isMe ? '<span class="text-xs text-teal-600 font-bold">(Anda)</span>' : ''}</div>
              <div class="text-[10px] text-slate-400 font-mono">NIK: ${bestie.nik || '-'} • ${bestie.roleBadge || bestie.role}</div>
            </div>
          </div>

          <div class="space-y-1 text-[11px] text-slate-600">
            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-semibold">Status:</span>
              <span class="font-bold flex items-center gap-1">
                ${this.getBestieActualStatus(bestie).badgeHtml}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-semibold">Lokasi Terakhir:</span>
              <span class="font-semibold text-slate-800">
                ${bestie.lastLocation?.isExited ? `Keluar Aplikasi (${this.getBestieActualStatus(bestie).exitTimeStr || timeAgoText})` : `${timeAgoText}`}
              </span>
            </div>
            ${
              distText
                ? `<div class="flex items-center justify-between">
                    <span class="text-slate-400 font-semibold">Jarak:</span>
                    <span class="font-bold text-slate-800">${distText}</span>
                  </div>`
                : ''
            }
            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-semibold">Toko Hari Ini:</span>
              <span class="font-bold text-slate-800 truncate max-w-[140px]">${myScheduleToday ? `FM ${myScheduleToday.storeName}` : storeVisit || 'Jadwal Standar'}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-semibold">Koordinat GPS:</span>
              <span class="font-mono text-[10px] font-bold text-slate-700">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
            </div>
          </div>

          <div class="pt-2 flex items-center justify-between border-t border-slate-100">
            <span class="text-[10px] text-emerald-700 font-bold">Terhubung Real-time</span>
            <a href="${gmapUrl}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded bg-[#0099A6] hover:bg-teal-700 text-white font-bold text-[10px] inline-flex items-center gap-1">
              <i class="fa-solid fa-diamond-turn-right"></i> Buka Rute
            </a>
          </div>
        </div>
      `);
    });

    const coordsInd = document.getElementById('live-loc-map-coords-indicator');
    if (coordsInd && this.liveGps.lat !== null) {
      coordsInd.textContent = `GPS Anda: ${this.liveGps.lat.toFixed(4)}, ${this.liveGps.lng.toFixed(4)}`;
    }
  },

  renderLiveLocBestieList() {
    const container = document.getElementById('live-loc-bestie-list-container');
    if (!container) return;

    const isPrivilegedAdmin = Boolean(
      this.currentUser &&
      (this.currentUser.role === 'SUPER_ADMIN' ||
       this.currentUser.role === 'SCHEDULE_ADMIN' ||
       this.currentUser.role === 'AREA_MANAGER' ||
       this.currentUser.role === 'REGIONAL_MANAGER' ||
       this.currentUser.username === 'admin')
    );
    const currentUserId = this.currentUser?.id || this.currentUser?.username;

    const users = window.FMCUData.getUsers();
    const besties = users.filter((u) => this.isAuditorUser(u));
    const query = (this.liveLocSearchQuery || '').toLowerCase().trim();
    const scope = this.liveLocBestieScope || 'ALL';

    let filtered = besties.filter((b) => {
      const isMe = String(b.id || b.username) === String(currentUserId);
      if (!isPrivilegedAdmin && !isMe) return false;
      const stInfo = this.getBestieActualStatus(b);

      if (scope === 'VISITING' && stInfo.key !== 'VISITING') return false;
      if (scope === 'OUTSIDE_RADIUS' && stInfo.key !== 'OUTSIDE_RADIUS') return false;
      if (scope === 'EXITED' && stInfo.key !== 'EXITED') return false;
      if (scope === 'NOT_ACCESSED' && stInfo.key !== 'NOT_ACCESSED') return false;
      if (scope === 'SCHEDULED' && !stInfo.myTodaySch) return false;

      if (query) {
        const matchName = (b.name || '').toLowerCase().includes(query);
        const matchNik = String(b.nik || '').toLowerCase().includes(query);
        const matchRegion = (b.region || '').toLowerCase().includes(query);
        const matchStore = stInfo.myTodaySch && ((stInfo.myTodaySch.storeName || '').toLowerCase().includes(query) || String(stInfo.myTodaySch.storeCode || '').includes(query));
        const matchStatus = stInfo.label.toLowerCase().includes(query);
        return matchName || matchNik || matchRegion || matchStore || matchStatus;
      }
      return true;
    });

    const badgeEl = document.getElementById('live-loc-bestie-count-badge');
    if (badgeEl) badgeEl.textContent = `${filtered.length} Personil`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-slate-400 text-xs">
          <i class="fa-solid fa-user-slash text-2xl mb-2 text-slate-300"></i>
          <div>Tidak ada personil Bestie yang sesuai dengan filter pencarian.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered
      .map((b) => {
        const isMe = String(b.id || b.username) === String(currentUserId);
        const initials = (b.name || 'RB')
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0].toUpperCase())
          .join('');

        const bKey = String(b.id || b.username);
        const stInfo = this.getBestieActualStatus(b);
        const { key: statusKey, hasActualLocation, lat, lng, myTodaySch, distToStore, targetStore } = stInfo;

        let distTextToStore = '';
        if (distToStore !== null) {
          distTextToStore = distToStore < 1000 ? `${distToStore}m` : `${(distToStore / 1000).toFixed(1)}km`;
        }

        // TAMPILAN STATUS SESUAI DENGAN KONDISI AKTUAL:
        let avatarDotClass = '';
        let avatarBgClass = '';

        if (statusKey === 'NOT_ACCESSED') {
          avatarDotClass = 'bg-slate-300 border border-white';
          avatarBgClass = isMe ? 'bg-[#0099A6] ring-2 ring-teal-200' : 'bg-slate-400';
        } else if (statusKey === 'EXITED') {
          avatarDotClass = 'bg-slate-400 border border-white';
          avatarBgClass = isMe ? 'bg-[#0099A6] ring-2 ring-slate-300' : 'bg-slate-500';
        } else if (statusKey === 'VISITING') {
          avatarDotClass = 'bg-emerald-500 border border-white gps-pulse';
          avatarBgClass = isMe ? 'bg-gradient-to-tr from-[#0099A6] to-teal-400 ring-4 ring-teal-300/60 shadow-lg animate-pulse' : 'bg-gradient-to-tr from-[#009944] to-emerald-600 shadow-md';
        } else {
          avatarDotClass = 'bg-amber-400 border border-white';
          avatarBgClass = isMe ? 'bg-gradient-to-tr from-[#0099A6] to-teal-400 ring-4 ring-teal-300/60 shadow-lg animate-pulse' : 'bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-md';
        }

        // Baris Info Toko
        let storeRowHtml = '';
        if (myTodaySch) {
          let storeDistBadge = '';
          if (statusKey === 'VISITING') {
            storeDistBadge = `<span class="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Radius ≤15m</span>`;
          } else if (statusKey === 'OUTSIDE_RADIUS') {
            storeDistBadge = `<span class="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">${distTextToStore ? `${distTextToStore} dari toko` : '>15m'}</span>`;
          } else if (statusKey === 'EXITED') {
            storeDistBadge = `<span class="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">Keluar (${stInfo.exitTimeStr})</span>`;
          } else {
            storeDistBadge = `<span class="text-[10px] text-slate-400 font-mono">Jadwal Hari Ini</span>`;
          }
          storeRowHtml = `
            <div class="p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-700 flex items-center justify-between gap-2">
              <div class="truncate flex items-center gap-1.5">
                <i class="fa-solid fa-store text-emerald-600 text-xs shrink-0"></i>
                <span class="font-bold truncate">FM ${myTodaySch.storeName} (${myTodaySch.storeCode})</span>
              </div>
              ${storeDistBadge}
            </div>
          `;
        } else {
          storeRowHtml = `
            <div class="p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-400 flex items-center justify-between gap-2">
              <div class="truncate flex items-center gap-1.5">
                <i class="fa-solid fa-store-slash text-slate-400 text-xs shrink-0"></i>
                <span class="truncate">Belum ada jadwal toko hari ini</span>
              </div>
              <span class="text-[10px] text-slate-400 font-mono shrink-0">${b.region || '-'}</span>
            </div>
          `;
        }

        // Baris Bawah: Status Lokasi Terakhir & Tombol Aksi
        let bottomRowHtml = '';
        if (hasActualLocation) {
          const gmapUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
          const isEx = statusKey === 'EXITED';
          bottomRowHtml = `
            <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 pt-1 border-t border-slate-100">
              <div class="text-[10px] font-mono ${isEx ? 'text-slate-500' : 'text-slate-700'} font-semibold truncate flex items-center gap-1">
                <i class="fa-solid ${isEx ? 'fa-location-dot text-slate-400' : 'fa-satellite-dish text-emerald-600'} text-[9px]"></i>
                <span>${lat.toFixed(4)}, ${lng.toFixed(4)} ${isEx ? `(Keluar ${stInfo.exitTimeStr})` : ''}</span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" onclick="FMCUApp.focusLiveLocOnBestie('${bKey}')" class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-teal-50 text-teal-800 hover:bg-teal-100 transition cursor-pointer flex items-center gap-1">
                  <i class="fa-solid fa-crosshairs text-teal-600"></i> Fokus Peta
                </button>
                <a href="${gmapUrl}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition" title="Buka Rute Google Maps">
                  <i class="fa-solid fa-arrow-up-right-from-square"></i>
                </a>
              </div>
            </div>
          `;
        } else {
          bottomRowHtml = `
            <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 pt-1 border-t border-slate-100">
              <div class="text-[10px] font-mono text-slate-400 italic truncate flex items-center gap-1">
                <i class="fa-solid fa-location-slash text-slate-300 text-[9px]"></i>
                <span>GPS Belum Terdeteksi</span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" onclick="FMCUApp.showToast('Lokasi ${b.name} belum terdeteksi karena personil belum mengakses web app.', 'info')" class="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-100 text-slate-400 hover:bg-slate-200 transition cursor-pointer flex items-center gap-1">
                  <i class="fa-solid fa-crosshairs text-slate-400"></i> Fokus Peta
                </button>
              </div>
            </div>
          `;
        }

        return `
          <div class="p-3 rounded-xl border border-slate-200 bg-white hover:border-[#0099A6] hover:shadow-xs transition space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="relative w-8 h-8 rounded-full ${avatarBgClass} text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                  ${initials}
                  <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${avatarDotClass}"></span>
                </div>
                <div class="min-w-0">
                  <div class="font-extrabold text-xs text-slate-900 truncate">
                    ${b.name} ${isMe ? '<span class="text-[10px] text-teal-600 font-bold">(Anda)</span>' : ''}
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono truncate">
                    NIK: ${b.nik || '-'} • ${stInfo.subtitleHtml}
                  </div>
                </div>
              </div>
              <div class="shrink-0">
                ${stInfo.badgeHtml}
              </div>
            </div>

            <!-- Store Info -->
            ${storeRowHtml}

            <!-- Bottom Row: Lokasi Terakhir -->
            ${bottomRowHtml}
          </div>
        `;
      })
      .join('');
  },

  focusLiveLocOnBestie(bestieId) {
    if (!this.liveLocMap) return;
    const marker = this._liveLocBestieMarkerMap?.get(String(bestieId));
    if (marker) {
      const ll = marker.getLatLng();
      this.liveLocMap.flyTo(ll, 16, { animate: true, duration: 1 });
      setTimeout(() => marker.openPopup(), 400);
      return;
    }

    const users = window.FMCUData.getUsers();
    const b = users.find((u) => String(u.id) === String(bestieId) || String(u.username) === String(bestieId) || String(u.nik) === String(bestieId));
    if (b) {
      let lat = b.lastLocation?.lat;
      let lng = b.lastLocation?.lng;
      if (lat && lng) {
        this.liveLocMap.flyTo([Number(lat), Number(lng)], 16, { animate: true, duration: 1 });
      } else {
        this.showToast(`Lokasi GPS ${b.name || 'Bestie'} belum terdeteksi (Belum Akses Web).`, 'warning');
      }
    }
  },

  focusLiveLocOnStore(storeCode) {
    if (!this.liveLocMap) return;
    const marker = this._liveLocStoreMarkerMap?.get(String(storeCode));
    if (marker) {
      const ll = marker.getLatLng();
      this.liveLocMap.flyTo(ll, 17, { animate: true, duration: 1 });
      setTimeout(() => marker.openPopup(), 400);
      return;
    }

    const stores = window.FMCUData.getStores();
    const st = stores.find((s) => String(s.code) === String(storeCode));
    if (st && st.lat && st.lng) {
      this.liveLocMap.flyTo([Number(st.lat), Number(st.lng)], 17, { animate: true, duration: 1 });
    }
  },

  fitLiveLocMapToAllBesties() {
    if (!this.liveLocMap) return;
    const latLngs = [];
    if (this._liveLocBestieMarkerMap) {
      this._liveLocBestieMarkerMap.forEach((m) => {
        latLngs.push(m.getLatLng());
      });
    }

    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      this.liveLocMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      this.showToast(`Menampilkan seluruh ${latLngs.length} titik Regional Bestie / Visitor aktif di peta.`, 'info');
    } else {
      this.showToast('Belum ada personil Regional Bestie yang mengakses web / GPS aktif.', 'warning');
    }
  },

  fitLiveLocMapToAllStores() {
    if (!this.liveLocMap) return;
    const stores = window.FMCUData.getStores();
    const latLngs = [];
    stores.forEach((st) => {
      const lat = Number(st.lat ?? st.latitude);
      const lng = Number(st.lng ?? st.longitude);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        latLngs.push([lat, lng]);
      }
    });

    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      this.liveLocMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
      this.showToast(`Menampilkan sebaran seluruh 610 Toko FamilyMart se-Indonesia.`, 'info');
    }
  },

  focusLiveLocMapOnMe() {
    if (!this.liveLocMap) return;
    if (this.liveGps.lat !== null && this.liveGps.lng !== null) {
      this.liveLocMap.flyTo([this.liveGps.lat, this.liveGps.lng], 16, { animate: true, duration: 1 });
      this.showToast('Memusatkan peta ke posisi GPS Anda saat ini.', 'info');
    } else {
      this.showToast('Mencari sinyal GPS Anda... Pastikan izin lokasi aktif.', 'warning');
      this.refreshGpsLocation(true);
    }
  },

  onLiveLocSearch(query) {
    this.liveLocSearchQuery = query;
    this.renderLiveLocBestieList();
  },

  toggleLiveLocLayer(layerKey, isVisible) {
    this._liveLocLayerVisibility[layerKey] = Boolean(isVisible);
    if (!this.liveLocMap) return;

    const layerMap = {
      stores: this.liveLocStoreLayer,
      geofence: this.liveLocGeofenceLayer,
      besties: this.liveLocBestieLayer,
      routes: this.liveLocRouteLayer
    };

    const layer = layerMap[layerKey];
    if (layer) {
      if (isVisible) {
        if (!this.liveLocMap.hasLayer(layer)) this.liveLocMap.addLayer(layer);
      } else {
        if (this.liveLocMap.hasLayer(layer)) this.liveLocMap.removeLayer(layer);
      }
    }
  },

  toggleLiveLocFullscreen() {
    const el = document.getElementById('view-live-maps');
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  },

  onLiveLocBestieFilterChange(val) {
    if (!val || val === 'ALL') {
      this.fitLiveLocMapToAllBesties();
    } else {
      this.focusLiveLocOnBestie(val);
    }
  },

  filterLiveLocBestieScope(scope) {
    this.liveLocBestieScope = scope;
    const btnAll = document.getElementById('btn-bestie-scope-all');
    const btnVisiting = document.getElementById('btn-bestie-scope-visiting');
    const btnOutside = document.getElementById('btn-bestie-scope-outside');
    const btnExited = document.getElementById('btn-bestie-scope-exited');
    const btnNotAccessed = document.getElementById('btn-bestie-scope-not-accessed');

    const setBtn = (btn, isActive, activeColor, inactiveText) => {
      if (!btn) return;
      btn.className = isActive
        ? `flex-1 sm:flex-initial text-center justify-center px-2 sm:px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold ${activeColor} text-white shadow-xs cursor-pointer`
        : `flex-1 sm:flex-initial text-center justify-center px-2 sm:px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold ${inactiveText} hover:bg-white transition cursor-pointer`;
    };

    setBtn(btnAll, scope === 'ALL', 'bg-slate-900', 'text-slate-600');
    setBtn(btnVisiting, scope === 'VISITING', 'bg-emerald-600', 'text-emerald-800');
    setBtn(btnOutside, scope === 'OUTSIDE_RADIUS', 'bg-amber-500', 'text-amber-800');
    setBtn(btnExited, scope === 'EXITED', 'bg-slate-600', 'text-slate-700');
    setBtn(btnNotAccessed, scope === 'NOT_ACCESSED', 'bg-slate-400', 'text-slate-500');

    this.renderLiveLocBestieList();
  },

  // ==========================================================================
  // HOME NEWS & INFORMATION SLIDER (SWIPEABLE TEXT & DOT INDICATORS)
  // ==========================================================================
  renderHomeNewsSlider() {
    const rawItems = window.FMCUData ? window.FMCUData.getNews(true) : [];
    const items = rawItems.length > 0 ? rawItems : [
      {
        id: 'news-def',
        category: 'Panduan Visit',
        content: 'Silakan pilih toko pada sub section Jadwal Visit atau tekan tombol Visit Toko Jadwal Hari Ini di bawah ini untuk melakukan Check-In (Actual In) dan membuka Form Visit toko tersebut.'
      }
    ];
    this.newsItems = items;

    if (this.newsCurrentIndex >= items.length) {
      this.newsCurrentIndex = 0;
    }
    if (this.newsCurrentIndex < 0) {
      this.newsCurrentIndex = items.length - 1;
    }

    const currentItem = items[this.newsCurrentIndex] || items[0];

    const catBadge = document.getElementById('news-badge-category');
    if (catBadge) {
      catBadge.textContent = currentItem.category || 'Info Visit';
    }

    const counter = document.getElementById('news-slide-counter');
    if (counter) {
      counter.textContent = `${this.newsCurrentIndex + 1} / ${items.length}`;
    }

    const textEl = document.getElementById('home-news-text');
    if (textEl) {
      textEl.style.opacity = '0';
      setTimeout(() => {
        textEl.textContent = currentItem.content || '';
        textEl.style.opacity = '1';
      }, 150);
    }

    // Render Indicator Dots
    const dotsContainer = document.getElementById('home-news-dots');
    if (dotsContainer) {
      dotsContainer.innerHTML = items
        .map((_, idx) => {
          const isActive = idx === this.newsCurrentIndex;
          return `<button type="button" onclick="FMCUApp.goToNewsSlide(${idx})" class="${
            isActive ? 'w-5 h-1.5 bg-[#009944]' : 'w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400'
          } rounded-full transition-all duration-300 cursor-pointer" title="Informasi ${idx + 1}"></button>`;
        })
        .join('');
    }

    // Touch Swipe Event Listener on Carousel
    const carousel = document.getElementById('home-news-carousel');
    if (carousel && !carousel._touchBound) {
      carousel._touchBound = true;
      let startX = 0;
      let startY = 0;
      carousel.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
          this.stopNewsAutoSlide();
        }
      }, { passive: true });
      carousel.addEventListener('touchend', (e) => {
        if (e.changedTouches && e.changedTouches[0]) {
          const deltaX = e.changedTouches[0].clientX - startX;
          const deltaY = e.changedTouches[0].clientY - startY;
          if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX < 0) {
              this.nextNewsSlide();
            } else {
              this.prevNewsSlide();
            }
          }
          this.startNewsAutoSlide();
        }
      }, { passive: true });
      carousel.addEventListener('mouseenter', () => this.stopNewsAutoSlide());
      carousel.addEventListener('mouseleave', () => this.startNewsAutoSlide());
    }

    this.startNewsAutoSlide();
  },

  goToNewsSlide(idx) {
    const total = this.newsItems ? this.newsItems.length : 0;
    if (idx >= 0 && idx < total) {
      this.newsCurrentIndex = idx;
      this.renderHomeNewsSlider();
    }
  },

  nextNewsSlide() {
    this.triggerHaptic('light');
    const total = this.newsItems ? this.newsItems.length : 0;
    if (total > 0) {
      this.newsCurrentIndex = (this.newsCurrentIndex + 1) % total;
      this.renderHomeNewsSlider();
    }
  },

  prevNewsSlide() {
    const total = this.newsItems ? this.newsItems.length : 0;
    if (total > 0) {
      this.newsCurrentIndex = (this.newsCurrentIndex - 1 + total) % total;
      this.renderHomeNewsSlider();
    }
  },

  startNewsAutoSlide() {
    this.stopNewsAutoSlide();
    if (this.newsItems && this.newsItems.length > 1) {
      this.newsTimer = setInterval(() => {
        this.nextNewsSlide();
      }, 6000);
    }
  },

  stopNewsAutoSlide() {
    if (this.newsTimer) {
      clearInterval(this.newsTimer);
      this.newsTimer = null;
    }
  },

  // ==========================================================================
  // SUPER ADMIN NEWS CONTROL METHODS (CRUD)
  // ==========================================================================
  renderAdminNewsTable() {
    const tbody = document.getElementById('admin-news-table-body');
    if (!tbody) return;
    const newsList = window.FMCUData ? window.FMCUData.getNews(false) : [];
    if (newsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">Belum ada item berita/informasi. Klik "Tambah Informasi Baru" untuk membuat pengumuman.</td></tr>`;
      return;
    }
    tbody.innerHTML = newsList
      .map(
        (item, idx) => `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 text-center font-bold text-slate-500">${idx + 1}</td>
          <td class="py-2.5 px-3">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
              ${item.category || 'Info'}
            </span>
            ${item.title ? `<div class="font-bold text-slate-800 mt-0.5 truncate">${item.title}</div>` : ''}
          </td>
          <td class="py-2.5 px-3">
            <p class="text-slate-700 leading-snug line-clamp-2 max-w-xl">${item.content}</p>
            <span class="text-[9px] text-slate-400 font-mono mt-0.5 block">${
              item.createdAt
                ? new Date(item.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                : ''
            }</span>
          </td>
          <td class="py-2.5 px-3 text-center">
            <button type="button" onclick="FMCUApp.toggleNewsActive('${item.id}')" class="px-2.5 py-1 rounded-full text-[10px] font-extrabold transition cursor-pointer ${
          item.active !== false
            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
        }">
              ${item.active !== false ? '✓ Aktif di Slide' : '✕ Dinonaktifkan'}
            </button>
          </td>
          <td class="py-2.5 px-3 text-center whitespace-nowrap space-x-1.5">
            <button type="button" onclick="FMCUApp.openNewsModal('${item.id}')" class="text-[#0099A6] hover:text-teal-800 font-bold p-1 cursor-pointer" title="Edit informasi">
              <i class="fa-solid fa-pen-to-square"></i> Edit
            </button>
            <button type="button" onclick="FMCUApp.deleteNewsItem('${item.id}')" class="text-rose-600 hover:text-rose-800 font-bold p-1 ml-2 cursor-pointer" title="Hapus informasi">
              <i class="fa-solid fa-trash"></i> Hapus
            </button>
          </td>
        </tr>
      `
      )
      .join('');
  },

  openNewsModal(id = null) {
    const isSuperAdmin = Boolean(
      this.currentUser && (this.currentUser.role === 'SUPER_ADMIN' || this.currentUser.username === 'admin')
    );
    if (!isSuperAdmin) {
      this.showToast('Fitur Kontrol News khusus untuk Super Admin.', 'warning');
      return;
    }

    const modal = document.getElementById('modal-news-editor');
    if (!modal) return;

    const idInput = document.getElementById('news-edit-id');
    const catInput = document.getElementById('news-edit-category');
    const headInput = document.getElementById('news-edit-headline');
    const contentInput = document.getElementById('news-edit-content');
    const activeInput = document.getElementById('news-edit-active');
    const titleEl = document.getElementById('modal-news-title');

    if (id) {
      const newsList = window.FMCUData.getNews(false);
      const item = newsList.find((n) => n.id === id);
      if (item) {
        if (idInput) idInput.value = item.id;
        if (catInput) catInput.value = item.category || 'Panduan Visit';
        if (headInput) headInput.value = item.title || '';
        if (contentInput) contentInput.value = item.content || '';
        if (activeInput) activeInput.checked = item.active !== false;
        if (titleEl) titleEl.textContent = 'Edit Informasi Berita';
      }
    } else {
      if (idInput) idInput.value = '';
      if (catInput) catInput.value = 'Panduan Visit';
      if (headInput) headInput.value = '';
      if (contentInput) contentInput.value = '';
      if (activeInput) activeInput.checked = true;
      if (titleEl) titleEl.textContent = 'Tambah Informasi Berita Baru';
    }

    modal.classList.remove('hidden');
  },

  closeNewsModal() {
    const modal = document.getElementById('modal-news-editor');
    if (modal) modal.classList.add('hidden');
  },

  handleSaveNews(event) {
    if (event) event.preventDefault();
    const id = document.getElementById('news-edit-id')?.value;
    const category = document.getElementById('news-edit-category')?.value || 'Info Visit';
    const title = document.getElementById('news-edit-headline')?.value || '';
    const content = (document.getElementById('news-edit-content')?.value || '').trim();
    const active = document.getElementById('news-edit-active')?.checked ?? true;

    if (!content) {
      this.showToast('Teks informasi tidak boleh kosong!', 'error');
      return;
    }

    const newsList = window.FMCUData.getNews(false);
    if (id) {
      const idx = newsList.findIndex((n) => n.id === id);
      if (idx !== -1) {
        newsList[idx] = {
          ...newsList[idx],
          category,
          title,
          content,
          active,
          updatedAt: new Date().toISOString()
        };
        this.showToast('Informasi berita berhasil diperbarui.', 'success');
      }
    } else {
      newsList.unshift({
        id: 'news-' + Date.now(),
        category,
        title,
        content,
        active,
        createdAt: new Date().toISOString()
      });
      this.showToast('Informasi berita baru berhasil ditambahkan.', 'success');
    }

    window.FMCUData.saveNews(newsList);
    this.closeNewsModal();
    this.renderAdminNewsTable();
    this.renderHomeNewsSlider();
  },

  toggleNewsActive(id) {
    const newsList = window.FMCUData.getNews(false);
    const item = newsList.find((n) => n.id === id);
    if (!item) return;

    item.active = item.active === false ? true : false;
    window.FMCUData.saveNews(newsList);
    this.renderAdminNewsTable();
    this.renderHomeNewsSlider();
    this.showToast(`Status slide untuk "${item.title || item.category}" diperbarui.`, 'info');
  },

  deleteNewsItem(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus informasi berita ini?')) return;
    let newsList = window.FMCUData.getNews(false);
    newsList = newsList.filter((n) => n.id !== id);
    window.FMCUData.saveNews(newsList);
    this.renderAdminNewsTable();
    this.renderHomeNewsSlider();
    this.showToast('Informasi berita berhasil dihapus.', 'info');
  },

  // ==========================================================================
  // POINT 1 - 8: INTERACTIVE MODERN UI/UX ENHANCEMENTS
  // ==========================================================================

  // Point 2: Haptic Feedback Engine
  triggerHaptic(type = 'light') {
    if (!('vibrate' in navigator)) return;
    try {
      if (type === 'light') navigator.vibrate(15);
      else if (type === 'medium') navigator.vibrate(30);
      else if (type === 'success') navigator.vibrate([30, 50, 40]);
      else if (type === 'warning') navigator.vibrate([60, 40, 60]);
      else if (type === 'error') navigator.vibrate([100, 50, 100]);
    } catch (e) {}
  },

  // Point 1: Dynamic Island Floating HUD Controller
  toggleDynamicIsland() {},

  updateDynamicIslandUI() {},

  openActiveStoreInGoogleMaps() {
    this.triggerHaptic('light');
    const active = window.FMCUData.getActiveCheckIn();
    if (!active || !active.storeCode) {
      this.showToast('Belum ada jadwal toko yang sedang aktif di-visit.', 'warning');
      return;
    }
    this.openGoogleMapsRoute(active.storeCode);
  },

  // Point 7: 1-Click Google Maps Turn-by-Turn Route Navigation
  openGoogleMapsRoute(storeCode) {
    this.triggerHaptic('light');
    const stores = window.FMCUData.getStores();
    const st = stores.find((s) => String(s.code || '').toLowerCase() === String(storeCode || '').toLowerCase());
    if (!st || (!st.lat && !st.latitude)) {
      this.showToast(`Koordinat GPS toko ${storeCode} belum tersedia di master toko.`, 'warning');
      return;
    }
    const lat = Number(st.lat || st.latitude);
    const lng = Number(st.lng || st.longitude);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
  },

  // Point 3: Voice-to-Text Speech Recognition (Indonesian ID-ID)
  startVoiceInput(targetId, btn) {
    this.triggerHaptic('medium');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.showToast('Fitur Dikte Suara belum didukung browser ini. Silakan gunakan keyboard.', 'warning');
      return;
    }
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    if (this._activeRecognition) {
      try {
        this._activeRecognition.stop();
      } catch (e) {}
      this._activeRecognition = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'id-ID';
      recognition.continuous = false;
      recognition.interimResults = false;

      const originalHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.classList.add('mic-recording');
        btn.innerHTML = '<i class="fa-solid fa-microphone-lines animate-pulse"></i> Mendengarkan...';
      }
      this.showToast('Mendengarkan... Silakan berbicara sekarang.', 'info');

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          const prev = targetEl.value ? targetEl.value.trim() + ' ' : '';
          targetEl.value = prev + transcript;
          targetEl.dispatchEvent(new Event('input', { bubbles: true }));
          this.triggerHaptic('success');
          this.showToast('Dikte suara berhasil dicatat!', 'success');
          this.updateFormProgress();
        }
      };

      recognition.onerror = (e) => {
        this.showToast('Selesai / tidak ada suara terdeteksi: ' + (e.error || ''), 'info');
      };

      recognition.onend = () => {
        if (btn) {
          btn.classList.remove('mic-recording');
          btn.innerHTML = originalHtml;
        }
        this._activeRecognition = null;
      };

      this._activeRecognition = recognition;
      recognition.start();
    } catch (err) {
      this.showToast('Tidak dapat mengaktifkan mikrofon.', 'error');
    }
  },

  // Point 6: Circular Progress Ring & Audit Completion Calculator
  updateFormProgress() {
    let progress = 0;
    const storeName = document.getElementById('form-store-name')?.value;
    if (storeName && storeName.trim()) progress += 25;

    if (
      this.formObservations &&
      this.formObservations.length > 0 &&
      this.formObservations.some((o) => o.temuan && o.temuan.trim())
    ) {
      progress += 25;
    }

    if (
      this.formEvidencePhotos &&
      this.formEvidencePhotos.length > 0 &&
      this.formEvidencePhotos.some((e) => e.dataUrl || e.driveFileId)
    ) {
      progress += 25;
    }

    if (progress >= 75) {
      progress = 100;
    }

    const circle = document.getElementById('form-progress-ring-circle');
    const text = document.getElementById('form-progress-ring-text');
    if (circle && text) {
      const circumference = 100.53;
      const offset = circumference - (progress / 100) * circumference;
      circle.style.strokeDashoffset = offset;
      text.textContent = `${progress}%`;
    }

    if (typeof this.debounceSaveDraft === 'function') {
      this.debounceSaveDraft();
    }
  },

  // Point 6: Celebration Confetti Particle Burst
  triggerConfetti() {
    this.triggerHaptic('success');
    const canvas = document.createElement('canvas');
    canvas.id = 'fm-confetti-canvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.zIndex = '9999';
    canvas.style.pointerEvents = 'none';
    document.body.appendChild(canvas);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const particles = [];
    const colors = ['#009944', '#0099a6', '#f59e0b', '#3b82f6', '#ec4899', '#10b981'];

    for (let i = 0; i < 90; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        r: Math.random() * 5 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 16 - 3,
        gravity: 0.25,
        alpha: 1,
        decay: Math.random() * 0.015 + 0.012
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.alpha -= p.decay;
        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
      if (alive) {
        requestAnimationFrame(animate);
      } else {
        canvas.remove();
      }
    };
    requestAnimationFrame(animate);
  },

  // Point 8: Shimmer Skeleton Placeholder Generator
  getSkeletonCardHtml(count = 3) {
    return Array(count)
      .fill(0)
      .map(
        () => `
      <div class="fm-card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="w-24 h-4 fm-skeleton"></div>
          <div class="w-20 h-4 fm-skeleton"></div>
        </div>
        <div class="w-48 h-5 fm-skeleton"></div>
        <div class="w-full h-10 fm-skeleton"></div>
      </div>
    `
      )
      .join('');
  },


  // ==========================================================================
  // STANDAR HOLDING TIME RESMI (QC) - USER MODAL & SUPER ADMIN CONTROLLER
  // ==========================================================================
  updateHoldingTimeBadges() {
    const st = window.FMCUData?.getHoldingTimeStandards?.() || window.FMCU_HOLDING_TIME_R23;
    if (!st) return;
    const rev = st.revision || 'R23';
    const headerBadge = document.getElementById('header-holding-badge');
    if (headerBadge) headerBadge.textContent = rev;
    const adminBadge = document.getElementById('admin-holding-version-badge');
    if (adminBadge) adminBadge.textContent = rev;
    const docBadge = document.getElementById('adm-holding-doc-badge');
    if (docBadge) docBadge.textContent = st.version || ('STD/FMI/PD-QC/001/' + rev);
    const modalPill = document.getElementById('modal-holding-version-pill');
    if (modalPill) modalPill.textContent = rev;
    const modalMeta = document.getElementById('modal-holding-meta-text');
    if (modalMeta) modalMeta.textContent = `${st.version || 'STD/FMI/PD-QC/001/' + rev} • Efektif: ${st.effectiveDateFormatted || st.effectiveDate || '-'}`;
  },

  onHoldingTimeStandardsUpdated(data) {
    this.updateHoldingTimeBadges();
    if (!document.getElementById('modal-holding-time')?.classList.contains('hidden')) {
      this.renderHoldingTimeModal();
    }
    if (this.currentView === 'admin' && this.currentAdminTab === 'holding-time') {
      this.renderAdminHoldingTimeView();
    }
  },

  // --------------------------------------------------------------------------
  // USER PANDUAN MODAL (Hanya Tampil Saat Form Visit Store Aktif)
  // --------------------------------------------------------------------------
  openHoldingTimeModal() {
    this.holdingTimeActiveCategory = 'ALL';
    const searchInput = document.getElementById('holding-user-search');
    if (searchInput) searchInput.value = '';
    this.renderHoldingTimeModal();
    const modal = document.getElementById('modal-holding-time');
    if (modal) modal.classList.remove('hidden');
    this.triggerHaptic('light');
  },

  closeHoldingTimeModal() {
    const modal = document.getElementById('modal-holding-time');
    if (modal) modal.classList.add('hidden');
  },

  toggleHoldingRulesAccordion() {
    const body = document.getElementById('holding-rules-body');
    const chevron = document.getElementById('holding-rules-chevron');
    if (body) {
      body.classList.toggle('hidden');
      if (chevron) {
        chevron.classList.toggle('rotate-180', !body.classList.contains('hidden'));
      }
    }
  },

  renderHoldingTimeModal() {
    const standards = window.FMCUData?.getHoldingTimeStandards?.() || window.FMCU_HOLDING_TIME_R23;
    if (!standards) return;

    // Update Header Text
    const versionPill = document.getElementById('modal-holding-version-pill');
    if (versionPill) versionPill.textContent = standards.revision || 'R23';
    const metaText = document.getElementById('modal-holding-meta-text');
    if (metaText) {
      metaText.textContent = `${standards.version || 'STD/FMI/PD-QC/001/R23'} • Efektif: ${standards.effectiveDateFormatted || standards.effectiveDate || '-'}`;
    }

    // Populate Rules Body
    const rulesBody = document.getElementById('holding-rules-body');
    if (rulesBody && standards.generalRules) {
      rulesBody.innerHTML = standards.generalRules.map((r, i) => `
        <div class="flex items-start gap-2">
          <span class="w-4 h-4 rounded-full bg-amber-200 text-amber-900 font-extrabold flex items-center justify-center text-[9px] shrink-0 mt-0.5">${i + 1}</span>
          <p class="flex-1">${r}</p>
        </div>
      `).join('');
    }

    // Populate Category Filter Chips
    const chipsTrack = document.getElementById('holding-category-chips');
    if (chipsTrack) {
      const totalItems = (standards.categories || []).reduce((acc, c) => acc + (c.items ? c.items.length : 0), 0);
      let chipsHtml = `
        <button type="button" onclick="FMCUApp.selectHoldingCategory('ALL')" class="shrink-0 px-3 py-1.5 rounded-full text-xs font-extrabold transition cursor-pointer ${this.holdingTimeActiveCategory === 'ALL' ? 'bg-[#009944] text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}">
          Semua (${totalItems})
        </button>
      `;

      (standards.categories || []).forEach((cat) => {
        const count = (cat.items || []).length;
        const isActive = this.holdingTimeActiveCategory === cat.id;
        const icon = cat.icon || 'fa-utensils';
        chipsHtml += `
          <button type="button" onclick="FMCUApp.selectHoldingCategory('${cat.id}')" class="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${isActive ? 'bg-amber-600 text-white shadow-xs font-extrabold' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}">
            <i class="fa-solid ${icon} text-[11px] ${isActive ? 'text-amber-200' : 'text-amber-500'}"></i>
            <span>${cat.name} (${count})</span>
          </button>
        `;
      });
      chipsTrack.innerHTML = chipsHtml;
    }

    this.filterHoldingTimeModal();
  },

  selectHoldingCategory(catId) {
    this.holdingTimeActiveCategory = catId;
    this.renderHoldingTimeModal();
  },

  filterHoldingTimeModal() {
    const standards = window.FMCUData?.getHoldingTimeStandards?.() || window.FMCU_HOLDING_TIME_R23;
    if (!standards) return;

    const query = (document.getElementById('holding-user-search')?.value || '').trim().toLowerCase();
    const body = document.getElementById('holding-modal-body');
    if (!body) return;

    let matchedProducts = [];

    (standards.categories || []).forEach((cat) => {
      if (this.holdingTimeActiveCategory !== 'ALL' && this.holdingTimeActiveCategory !== cat.id) {
        return;
      }
      (cat.items || []).forEach((item) => {
        if (!query || item.name.toLowerCase().includes(query) || cat.name.toLowerCase().includes(query) || (item.storage && item.storage.toLowerCase().includes(query))) {
          matchedProducts.push({
            ...item,
            categoryName: cat.name,
            categoryId: cat.id,
            machineTemp: cat.machineTemp,
            icon: cat.icon || 'fa-utensils'
          });
        }
      });
    });

    if (matchedProducts.length === 0) {
      body.innerHTML = `
        <div class="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
          <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xl mx-auto">
            <i class="fa-solid fa-magnifying-glass"></i>
          </div>
          <div class="font-bold text-slate-800 text-sm">Produk Tidak Ditemukan</div>
          <p class="text-xs text-slate-500 max-w-sm mx-auto">Tidak ada standar produk yang cocok dengan kata kunci "${query}".</p>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div class="text-[11px] font-bold text-slate-500 mb-1 flex items-center justify-between">
        <span>Menampilkan ${matchedProducts.length} produk standar holding time:</span>
        <span class="text-amber-700 font-mono">STD/FMI/PD-QC/001/${standards.revision || 'R23'}</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${matchedProducts.map((p) => `
          <div class="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-white hover:border-amber-300 hover:shadow-sm transition space-y-2.5">
            <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <span class="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 mb-1">
                  <i class="fa-solid ${p.icon}"></i>
                  <span>${p.categoryName}</span>
                  ${p.machineTemp ? `<span class="text-amber-600 font-mono">(${p.machineTemp})</span>` : ''}
                </span>
                <h4 class="font-extrabold text-sm text-slate-900 leading-snug">${p.name}</h4>
              </div>
            </div>

            <!-- Holding Time Highlight Badge -->
            <div class="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 border border-amber-300/80 flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 text-xs text-amber-900 font-extrabold">
                <i class="fa-solid fa-stopwatch text-amber-600"></i>
                <span>Holding Time:</span>
              </div>
              <div class="text-xs font-black text-amber-800 text-right">
                ${p.holding}
              </div>
            </div>

            <!-- 4 Grid Specs -->
            <div class="grid grid-cols-2 gap-2 text-[11px]">
              <div class="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div class="text-slate-400 font-bold uppercase text-[9px]">Thawing</div>
                <div class="font-semibold text-slate-800 mt-0.5">${p.thawing || '-'}</div>
              </div>
              <div class="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div class="text-slate-400 font-bold uppercase text-[9px]">Umur Chiller</div>
                <div class="font-semibold text-slate-800 mt-0.5">${p.shelfLife || '-'}</div>
              </div>
              <div class="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div class="text-slate-400 font-bold uppercase text-[9px]">Pemanasan</div>
                <div class="font-semibold text-slate-800 mt-0.5">${p.cooking || '-'}</div>
              </div>
              <div class="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div class="text-slate-400 font-bold uppercase text-[9px]">Wadah / Tempat</div>
                <div class="font-semibold text-slate-800 mt-0.5 truncate" title="${p.storage || '-'}">${p.storage || '-'}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // --------------------------------------------------------------------------
  // SUPER ADMIN STANDAR HOLDING TIME VIEW & METADATA EXTRACTOR
  // --------------------------------------------------------------------------
  renderAdminHoldingTimeView() {
    const standards = window.FMCUData?.getHoldingTimeStandards?.() || window.FMCU_HOLDING_TIME_R23;
    if (!standards) return;

    this.adminHoldingDraft = JSON.parse(JSON.stringify(standards));

    // Update Doc Badge & Subtitle
    const badge = document.getElementById('adm-holding-doc-badge');
    if (badge) badge.textContent = this.adminHoldingDraft.version || 'STD/FMI/PD-QC/001/' + (this.adminHoldingDraft.revision || 'R23');
    const sub = document.getElementById('adm-holding-doc-sub');
    if (sub) {
      sub.textContent = `Acuan observasi food safety resmi PT FamilyMart Indonesia • Efektif: ${this.adminHoldingDraft.effectiveDateFormatted || this.adminHoldingDraft.effectiveDate || '-'} • Terhubung langsung ke AI T.A.R.O`;
    }

    // Fill Input Fields
    const inVersion = document.getElementById('adm-holding-input-version');
    if (inVersion) inVersion.value = this.adminHoldingDraft.version || '';
    const inRev = document.getElementById('adm-holding-input-rev');
    if (inRev) inRev.value = this.adminHoldingDraft.revision || '';
    const inDate = document.getElementById('adm-holding-input-date');
    if (inDate) inDate.value = this.adminHoldingDraft.effectiveDateFormatted || this.adminHoldingDraft.effectiveDate || '';
    const inApproved = document.getElementById('adm-holding-input-approved');
    if (inApproved) inApproved.value = this.adminHoldingDraft.approvedBy || '';
    const inCreated = document.getElementById('adm-holding-input-created');
    if (inCreated) inCreated.value = this.adminHoldingDraft.createdBy || '';

    // Update Stats
    const totalCategories = (this.adminHoldingDraft.categories || []).length;
    const totalProducts = (this.adminHoldingDraft.categories || []).reduce((acc, c) => acc + (c.items ? c.items.length : 0), 0);
    const totalRules = (this.adminHoldingDraft.generalRules || []).length;

    const elCatStat = document.getElementById('adm-stat-categories-count');
    if (elCatStat) elCatStat.textContent = totalCategories;
    const elProdStat = document.getElementById('adm-stat-products-count');
    if (elProdStat) elProdStat.textContent = totalProducts;
    const elRuleStat = document.getElementById('adm-stat-rules-count');
    if (elRuleStat) elRuleStat.textContent = totalRules;
    const elRevStat = document.getElementById('adm-stat-rev-code');
    if (elRevStat) elRevStat.textContent = this.adminHoldingDraft.revision || 'R23';

    // Render General Rules Editor List
    this.renderAdminHoldingRulesList();

    // Render Product Table
    this.renderAdminHoldingProductsTable();
  },

  renderAdminHoldingRulesList() {
    const listEl = document.getElementById('adm-holding-rules-list');
    if (!listEl || !this.adminHoldingDraft) return;

    if (!Array.isArray(this.adminHoldingDraft.generalRules) || this.adminHoldingDraft.generalRules.length === 0) {
      listEl.innerHTML = '<div class="text-slate-400 text-xs italic">Belum ada aturan umum QA.</div>';
      return;
    }

    listEl.innerHTML = this.adminHoldingDraft.generalRules.map((rule, idx) => `
      <div class="flex items-center gap-2">
        <span class="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0">${idx + 1}</span>
        <input type="text" value="${rule.replace(/"/g, '&quot;')}" onchange="FMCUApp.updateAdminHoldingRule(${idx}, this.value)" class="fm-input text-xs py-1.5 flex-1" />
        <button type="button" onclick="FMCUApp.deleteAdminHoldingRule(${idx})" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition cursor-pointer" title="Hapus aturan">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `).join('');
  },

  updateAdminHoldingRule(idx, val) {
    if (this.adminHoldingDraft && this.adminHoldingDraft.generalRules && this.adminHoldingDraft.generalRules[idx] !== undefined) {
      this.adminHoldingDraft.generalRules[idx] = val.trim();
    }
  },

  addAdminHoldingRule() {
    if (!this.adminHoldingDraft) return;
    if (!Array.isArray(this.adminHoldingDraft.generalRules)) this.adminHoldingDraft.generalRules = [];
    this.adminHoldingDraft.generalRules.push('Ketentuan QA baru...');
    this.renderAdminHoldingRulesList();
  },

  deleteAdminHoldingRule(idx) {
    if (!this.adminHoldingDraft || !Array.isArray(this.adminHoldingDraft.generalRules)) return;
    this.adminHoldingDraft.generalRules.splice(idx, 1);
    this.renderAdminHoldingRulesList();
  },

  renderAdminHoldingProductsTable() {
    const tbody = document.getElementById('adm-holding-table-body');
    if (!tbody || !this.adminHoldingDraft) return;

    const query = (document.getElementById('adm-holding-search')?.value || '').trim().toLowerCase();
    const filterCat = document.getElementById('adm-holding-category-filter')?.value || 'ALL';

    let rowsHtml = '';
    let totalCount = 0;

    (this.adminHoldingDraft.categories || []).forEach((cat) => {
      if (filterCat !== 'ALL' && filterCat !== cat.id) return;

      (cat.items || []).forEach((item, itemIdx) => {
        if (query && !item.name.toLowerCase().includes(query) && !cat.name.toLowerCase().includes(query) && !(item.storage && item.storage.toLowerCase().includes(query))) {
          return;
        }

        totalCount++;
        rowsHtml += `
          <tr class="hover:bg-slate-50/80 transition">
            <td class="py-2.5 px-3">
              <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap">
                <i class="fa-solid ${cat.icon || 'fa-utensils'} text-amber-600"></i>
                <span>${cat.name}</span>
              </span>
            </td>
            <td class="py-2.5 px-3 font-bold text-slate-900">${item.name}</td>
            <td class="py-2.5 px-3 text-slate-600">${item.thawing || '-'}</td>
            <td class="py-2.5 px-3 text-slate-600">${item.shelfLife || '-'}</td>
            <td class="py-2.5 px-3 text-slate-600">${item.cooking || '-'}</td>
            <td class="py-2.5 px-3 font-extrabold text-amber-700 whitespace-nowrap">${item.holding}</td>
            <td class="py-2.5 px-3 text-slate-500 max-w-xs truncate" title="${item.storage || '-'}">${item.storage || '-'}</td>
            <td class="py-2.5 px-3 text-center whitespace-nowrap">
              <button type="button" onclick="FMCUApp.openEditHoldingProductModal('${cat.id}', ${itemIdx})" class="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition cursor-pointer" title="Edit Produk">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button type="button" onclick="FMCUApp.deleteHoldingProduct('${cat.id}', ${itemIdx})" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition cursor-pointer" title="Hapus Produk">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </td>
          </tr>
        `;
      });
    });

    if (totalCount === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-8 text-slate-400 italic">Tidak ada produk yang sesuai dengan filter atau kata kunci pencarian.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rowsHtml;
  },

  openAddHoldingProductModal() {
    document.getElementById('modal-holding-edit-title').textContent = 'Tambah Produk Standar Holding Time';
    document.getElementById('edit-holding-item-idx').value = '-1';
    document.getElementById('edit-holding-name').value = '';
    document.getElementById('edit-holding-thawing').value = '';
    document.getElementById('edit-holding-shelflife').value = '';
    document.getElementById('edit-holding-cooking').value = '';
    document.getElementById('edit-holding-holding').value = '';
    document.getElementById('edit-holding-storage').value = '';
    document.getElementById('modal-holding-edit-product').classList.remove('hidden');
  },

  openEditHoldingProductModal(catId, itemIdx) {
    if (!this.adminHoldingDraft) return;
    const cat = (this.adminHoldingDraft.categories || []).find((c) => c.id === catId);
    if (!cat || !cat.items || !cat.items[itemIdx]) return;

    const it = cat.items[itemIdx];
    document.getElementById('modal-holding-edit-title').textContent = 'Edit Produk Standar Holding Time';
    document.getElementById('edit-holding-item-idx').value = `${catId}:::${itemIdx}`;
    document.getElementById('edit-holding-category').value = catId;
    document.getElementById('edit-holding-name').value = it.name || '';
    document.getElementById('edit-holding-thawing').value = it.thawing || '';
    document.getElementById('edit-holding-shelflife').value = it.shelfLife || '';
    document.getElementById('edit-holding-cooking').value = it.cooking || '';
    document.getElementById('edit-holding-holding').value = it.holding || '';
    document.getElementById('edit-holding-storage').value = it.storage || '';
    document.getElementById('modal-holding-edit-product').classList.remove('hidden');
  },

  saveHoldingProductFromModal(event) {
    if (event) event.preventDefault();
    if (!this.adminHoldingDraft) return;

    const rawIdx = document.getElementById('edit-holding-item-idx').value;
    const catId = document.getElementById('edit-holding-category').value;
    const name = document.getElementById('edit-holding-name').value.trim();
    const thawing = document.getElementById('edit-holding-thawing').value.trim();
    const shelfLife = document.getElementById('edit-holding-shelflife').value.trim();
    const cooking = document.getElementById('edit-holding-cooking').value.trim();
    const holding = document.getElementById('edit-holding-holding').value.trim();
    const storage = document.getElementById('edit-holding-storage').value.trim();

    if (!name || !holding) {
      this.showToast('Nama Produk dan Batas Holding Time wajib diisi!', 'warning');
      return;
    }

    const itemObj = { name, thawing, shelfLife, cooking, holding, storage };

    let targetCat = (this.adminHoldingDraft.categories || []).find((c) => c.id === catId);
    if (!targetCat) {
      targetCat = { id: catId, name: catId, items: [] };
      this.adminHoldingDraft.categories.push(targetCat);
    }

    if (rawIdx === '-1') {
      // Add new
      if (!Array.isArray(targetCat.items)) targetCat.items = [];
      targetCat.items.push(itemObj);
      this.showToast(`Produk "${name}" berhasil ditambahkan!`, 'success');
    } else {
      // Edit existing
      const [oldCatId, oldIdxStr] = rawIdx.split(':::');
      const oldIdx = parseInt(oldIdxStr, 10);
      if (oldCatId === catId) {
        targetCat.items[oldIdx] = itemObj;
      } else {
        const oldCat = (this.adminHoldingDraft.categories || []).find((c) => c.id === oldCatId);
        if (oldCat && oldCat.items) oldCat.items.splice(oldIdx, 1);
        if (!Array.isArray(targetCat.items)) targetCat.items = [];
        targetCat.items.push(itemObj);
      }
      this.showToast(`Perubahan produk "${name}" berhasil disimpan!`, 'success');
    }

    this.closeModal('modal-holding-edit-product');
    this.renderAdminHoldingProductsTable();
  },

  deleteHoldingProduct(catId, itemIdx) {
    if (!this.adminHoldingDraft) return;
    const cat = (this.adminHoldingDraft.categories || []).find((c) => c.id === catId);
    if (!cat || !cat.items || !cat.items[itemIdx]) return;

    const pName = cat.items[itemIdx].name;
    if (!confirm(`Apakah Anda yakin ingin menghapus "${pName}" dari standar holding time?`)) {
      return;
    }

    cat.items.splice(itemIdx, 1);
    this.renderAdminHoldingProductsTable();
    this.showToast(`Produk "${pName}" berhasil dihapus.`, 'info');
  },

  saveHoldingTimeFromAdmin() {
    if (!this.adminHoldingDraft) return;

    // Read metadata inputs
    this.adminHoldingDraft.version = (document.getElementById('adm-holding-input-version')?.value || '').trim() || this.adminHoldingDraft.version;
    this.adminHoldingDraft.revision = (document.getElementById('adm-holding-input-rev')?.value || '').trim() || this.adminHoldingDraft.revision;
    this.adminHoldingDraft.effectiveDateFormatted = (document.getElementById('adm-holding-input-date')?.value || '').trim() || this.adminHoldingDraft.effectiveDateFormatted;
    this.adminHoldingDraft.approvedBy = (document.getElementById('adm-holding-input-approved')?.value || '').trim() || this.adminHoldingDraft.approvedBy;
    this.adminHoldingDraft.createdBy = (document.getElementById('adm-holding-input-created')?.value || '').trim() || this.adminHoldingDraft.createdBy;

    // Save to FMCUData (local storage + Firestore real-time sync)
    window.FMCUData.saveHoldingTimeStandards(this.adminHoldingDraft);
    this.updateHoldingTimeBadges();

    this.showToast(`Standar Holding Time ${this.adminHoldingDraft.revision} berhasil disimpan & disinkronkan ke AI T.A.R.O!`, 'success');
  },

  resetHoldingTimeToDefault() {
    if (!confirm('Kembalikan Standar Holding Time ke versi awal resmi R23 (STD/FMI/PD-QC/001/R23)? Seluruh perubahan kustom akan direset.')) {
      return;
    }
    const defaultData = window.FMCUData.resetHoldingTimeStandards();
    this.adminHoldingDraft = JSON.parse(JSON.stringify(defaultData));
    this.renderAdminHoldingTimeView();
    this.updateHoldingTimeBadges();
    this.showToast('Standar Holding Time berhasil direset ke R23 Resmi!', 'success');
  },

  exportHoldingTimeJSON() {
    const dataToExport = this.adminHoldingDraft || window.FMCUData.getHoldingTimeStandards() || window.FMCU_HOLDING_TIME_R23;
    const rev = dataToExport.revision || 'R23';
    const jsonStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Standar_Holding_Time_${rev}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast('File JSON Standar Holding Time berhasil diunduh.', 'success');
  },

  async handleHoldingFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const statusBox = document.getElementById('holding-extract-status-box');
    if (statusBox) {
      statusBox.classList.remove('hidden', 'bg-rose-50', 'border-rose-200', 'text-rose-800', 'bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
      statusBox.classList.add('bg-amber-50', 'border-amber-200', 'text-amber-800');
      statusBox.innerHTML = `
        <div class="flex items-center gap-2.5">
          <i class="fa-solid fa-spinner fa-spin text-amber-600 text-lg"></i>
          <div>
            <div class="font-extrabold text-xs text-amber-900">Membaca & Memproses File: ${file.name}...</div>
            <div class="text-[11px] text-amber-700/90 mt-0.5">Sistem sedang memeriksa format dokumen dan mengekstrak tabel holding time...</div>
          </div>
        </div>
      `;
    }

    try {
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed.categories || !Array.isArray(parsed.categories)) {
          throw new Error('File JSON tidak memiliki struktur kategori standar holding time yang valid.');
        }

        this.adminHoldingDraft = parsed;
        window.FMCUData.saveHoldingTimeStandards(parsed);
        this.renderAdminHoldingTimeView();
        this.updateHoldingTimeBadges();

        if (statusBox) {
          statusBox.classList.remove('bg-amber-50', 'border-amber-200', 'text-amber-800');
          statusBox.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
          statusBox.innerHTML = `
            <div class="flex items-center gap-2.5">
              <i class="fa-solid fa-circle-check text-emerald-600 text-lg"></i>
              <div>
                <div class="font-extrabold text-xs text-emerald-900">Berhasil Mengimpor JSON Metadata!</div>
                <div class="text-[11px] text-emerald-700 mt-0.5">Standar holding time versi ${parsed.revision || 'baru'} (${parsed.version || ''}) telah diterapkan ke sistem & observasi AI T.A.R.O.</div>
              </div>
            </div>
          `;
        }
        this.showToast(`Metadata Standar Holding Time ${parsed.revision || ''} berhasil dimuat!`, 'success');
      } else if (file.name.endsWith('.pdf')) {
        if (statusBox) {
          statusBox.innerHTML = `
            <div class="flex items-center gap-2.5">
              <i class="fa-solid fa-spinner fa-spin text-amber-600 text-lg"></i>
              <div>
                <div class="font-extrabold text-xs text-amber-900">Membaca Konten Dokumen PDF: ${file.name}...</div>
                <div class="text-[11px] text-amber-700/90 mt-0.5">Mengekstrak teks halaman & tabel menggunakan PDF.js & OCR engine...</div>
              </div>
            </div>
          `;
        }

        const extractedText = await this.extractPdfTextWithPdfJs(file);
        if (!extractedText || extractedText.length < 50) {
          throw new Error('Teks dari dokumen PDF tidak dapat dibaca atau file kosong.');
        }

        if (statusBox) {
          statusBox.innerHTML = `
            <div class="flex items-center gap-2.5">
              <i class="fa-solid fa-robot text-teal-600 text-lg animate-pulse"></i>
              <div>
                <div class="font-extrabold text-xs text-teal-900">AI T.A.R.O Sedang Mengekstrak Metadata & Tabel Produk...</div>
                <div class="text-[11px] text-teal-700/90 mt-0.5">Memetakan 9 kategori, suhu mesin, thawing, umur chiller, pemanasan, dan batas holding time...</div>
              </div>
            </div>
          `;
        }

        const parsedResult = await this.extractHoldingMetadataViaAI(extractedText);
        if (parsedResult && parsedResult.categories && parsedResult.categories.length > 0) {
          this.adminHoldingDraft = parsedResult;
          this.renderAdminHoldingTimeView();
          this.updateHoldingTimeBadges();

          const prodCount = parsedResult.categories.reduce((acc, c) => acc + (c.items ? c.items.length : 0), 0);

          if (statusBox) {
            statusBox.classList.remove('bg-amber-50', 'border-amber-200', 'text-amber-800');
            statusBox.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
            statusBox.innerHTML = `
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <i class="fa-solid fa-circle-check text-emerald-600 text-lg"></i>
                  <div>
                    <div class="font-extrabold text-xs text-emerald-900">Ekstraksi Dokumen PDF Berhasil!</div>
                    <div class="text-[11px] text-emerald-700 mt-0.5">Ditemukan <strong>${prodCount} produk</strong> dalam <strong>${parsedResult.categories.length} kategori</strong> (${parsedResult.version || ''}). Silakan tinjau tabel di bawah dan klik <strong>Simpan Perubahan</strong>.</div>
                  </div>
                </div>
                <button type="button" onclick="FMCUApp.saveHoldingTimeFromAdmin()" class="px-3.5 py-1.5 rounded-xl bg-[#009944] text-white font-bold text-xs hover:bg-emerald-700 transition cursor-pointer shrink-0">
                  Simpan Standar Sekarang
                </button>
              </div>
            `;
          }
          this.showToast(`Ekstraksi PDF berhasil: ${prodCount} produk terdeteksi!`, 'success');
        } else {
          throw new Error('AI tidak dapat mengonversi teks PDF ke format metadata holding time yang sesuai.');
        }
      } else {
        throw new Error('Format file tidak didukung. Harap unggah file berekstensi .pdf atau .json.');
      }
    } catch (err) {
      console.error('Error handling holding file upload:', err);
      if (statusBox) {
        statusBox.classList.remove('bg-amber-50', 'border-amber-200', 'text-amber-800', 'bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
        statusBox.classList.add('bg-rose-50', 'border-rose-200', 'text-rose-800');
        statusBox.innerHTML = `
          <div class="flex items-center gap-2.5">
            <i class="fa-solid fa-circle-exclamation text-rose-600 text-lg"></i>
            <div>
              <div class="font-extrabold text-xs text-rose-900">Gagal Memproses Dokumen:</div>
              <div class="text-[11px] text-rose-700 mt-0.5">${err.message || 'Terjadi kesalahan saat membaca file.'}</div>
            </div>
          </div>
        `;
      }
      this.showToast(err.message || 'Gagal memproses file dokumen.', 'error');
    } finally {
      event.target.value = '';
    }
  },

  async extractPdfTextWithPdfJs(file) {
    if (!window.pdfjsLib) {
      throw new Error('Library PDF.js belum siap di browser. Harap periksa koneksi internet.');
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      fullText += `--- HALAMAN ${pageNum} ---\n` + pageText + '\n\n';
    }
    return fullText;
  },

  async extractHoldingMetadataViaAI(extractedPdfText) {
    const promptText = `Anda adalah sistem ekstraksi dokumen Quality Assurance (QA) FamilyMart Indonesia.
Ekstrak seluruh teks dokumen Standar Holding Time berikut menjadi JSON murni yang terstruktur persis sesuai skema di bawah.

SKEMA JSON WAJIB:
{
  "version": "STD/FMI/PD-QC/001/R23",
  "revision": "R23",
  "effectiveDate": "2026-09-23",
  "effectiveDateFormatted": "23 September 2026",
  "title": "STANDAR HOLDING TIME",
  "department": "QA & Product Improvement Division",
  "approvedBy": "Nama Approval & Jabatan",
  "createdBy": "Nama Pembuat & Jabatan",
  "generalRules": [
    "1 hari = 24 jam.",
    "Thawing pada suhu ruang HARUS menggunakan timer digital.",
    "Holding time setelah thawing / setelah kemasan dibuka / exp date pada label ROX, TIDAK BOLEH melebihi exp date pada kemasan asli.",
    "Pengisian stiker label ROX dan tabel Holding Time HARUS berdasarkan ketentuan resmi ini.",
    "DILARANG KERAS menyimpan produk yang telah melewati Holding Time ke dalam chiller/freezer untuk dijual lagi esok harinya!",
    "Sisa biang teh (Black Tea / Jasmine Tea) saat closing toko HARUS DIBUANG.",
    "Fresh Milk, Oatside, dan Liquid Ice: holding time 24 jam di chiller berlaku jika ada sisa saat closing saja.",
    "PASTIKAN PENYIMPANAN dalam kemasan asli, box wadah, atau plastik klip SELALU TERTUTUP!"
  ],
  "categories": [
    {
      "id": "fryer",
      "name": "Dimasak di Fryer",
      "machineTemp": "165°C",
      "icon": "fa-fire-burner",
      "items": [
        {
          "name": "Chicken Parting",
          "thawing": "1 hari (Chiller)",
          "shelfLife": "36 jam (Chiller)",
          "cooking": "12 menit (165°C)",
          "holding": "4 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          "storage": "Showcase Warmer"
        }
      ]
    }
  ]
}

ATURAN PENTING:
1. Pastikan setiap baris produk tidak ada yang terlewat.
2. Identifikasi kategori produk dengan tepat (fryer, steamer, sosis, rice_com, oden, microwave_rte, lainnya_cake, dry_condiments, beverages).
3. Kolom holding time harus diekstrak dengan akurat (misal: "4 jam atau closing dibuang", "10 jam", "24 jam di chiller", dll).
4. Kembalikan HANYA JSON murni (boleh diapit \`\`\`json ... \`\`\`), tanpa teks pengantar atau penutup.

TEKS DOKUMEN PDF:
${extractedPdfText}`;

    // 1. Coba Gemini
    try {
      const apiKey = window.FMCUData?.GEMINI_CONFIG?.getApiKey?.();
      const models = ['models/gemini-3.5-flash', 'models/gemini-3-flash-preview'];
      if (apiKey) {
        for (const model of models) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
              })
            });
            if (res.ok) {
              const data = await res.json();
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                const cleaned = text.replace(/^```json/m, '').replace(/^```/m, '').replace(/```$/m, '').trim();
                const parsed = JSON.parse(cleaned);
                if (parsed && Array.isArray(parsed.categories)) return parsed;
              }
            }
          } catch (e) {
            console.warn('Gemini extract attempt error:', e);
          }
        }
      }
    } catch (e) {}

    // 2. Coba Groq Fallback
    try {
      const groqKey = window.FMCUData?.GROQ_CONFIG?.getApiKey?.();
      const groqEndpoint = window.FMCUData?.GROQ_CONFIG?.endpoint || 'https://api.groq.com/openai/v1/chat/completions';
      if (groqKey) {
        const gRes = await fetch(groqEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [
              { role: 'system', content: 'Anda adalah asisten ekstraksi data JSON murni untuk FamilyMart Indonesia.' },
              { role: 'user', content: promptText }
            ],
            temperature: 0.1
          })
        });
        if (gRes.ok) {
          const gData = await gRes.json();
          const text = gData.choices?.[0]?.message?.content;
          if (text) {
            const cleaned = text.replace(/^```json/m, '').replace(/^```/m, '').replace(/```$/m, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed && Array.isArray(parsed.categories)) return parsed;
          }
        }
      }
    } catch (e) {}

    // Fallback default R23 jika offline
    return window.FMCU_HOLDING_TIME_R23 || null;
  },

        // --- Photo Editor Modal (Crop & Marker Temuan) for Section 1 & 3 ---
  photoEditorState: {
    isOpen: false,
    img: null,
    rotation: 0,
    mode: 'crop',
    cropRect: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
    markers: [],
    isDragging: false,
    dragAction: null,
    dragStart: { x: 0, y: 0 },
    currentMarker: null,
    onComplete: null,
    onCancel: null
  },

  promptPhotoEdit(fileOrDataUrl, onApproved, onCancel) {
    if (!fileOrDataUrl) return;

    const modal = document.getElementById('modal-photo-editor');
    if (!modal) {
      if (typeof fileOrDataUrl === 'string') onApproved(fileOrDataUrl);
      else {
        const reader = new FileReader();
        reader.onload = (e) => onApproved(e.target.result);
        reader.readAsDataURL(fileOrDataUrl);
      }
      return;
    }

    const loadImg = (src) => {
      const img = new Image();
      img.onload = () => {
        this.photoEditorState = {
          isOpen: true,
          img,
          rotation: 0,
          mode: 'crop',
          cropRect: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
          markers: [],
          isDragging: false,
          dragAction: null,
          dragStart: { x: 0, y: 0 },
          currentMarker: null,
          onComplete: onApproved,
          onCancel: onCancel
        };
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        this.setPhotoEditorMode('crop');
        this.setupPhotoEditorCanvasEvents();
        setTimeout(() => this.drawPhotoEditorCanvas(), 50);
      };
      img.src = src;
    };

    if (typeof fileOrDataUrl === 'string') {
      loadImg(fileOrDataUrl);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => loadImg(e.target.result);
      reader.readAsDataURL(fileOrDataUrl);
    }
  },

  setPhotoEditorMode(mode) {
    this.photoEditorState.mode = mode;
    const btnCrop = document.getElementById('btn-editor-mode-crop');
    const btnMarker = document.getElementById('btn-editor-mode-marker');

    if (btnCrop) {
      btnCrop.className = mode === 'crop'
        ? 'px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer bg-[#009944] text-white shadow-xs'
        : 'px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white hover:bg-slate-700';
    }
    if (btnMarker) {
      btnMarker.className = mode === 'marker'
        ? 'px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer bg-rose-600 text-white shadow-xs'
        : 'px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white hover:bg-slate-700';
    }
    this.drawPhotoEditorCanvas();
  },

  rotatePhotoEditor(deg = 90) {
    this.photoEditorState.rotation = (this.photoEditorState.rotation + deg) % 360;
    this.photoEditorState.cropRect = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
    this.photoEditorState.markers = [];
    this.drawPhotoEditorCanvas();
  },

  undoPhotoEditorMarker() {
    if (this.photoEditorState.markers.length > 0) {
      this.photoEditorState.markers.pop();
      this.drawPhotoEditorCanvas();
    }
  },

  resetPhotoEditor() {
    this.photoEditorState.rotation = 0;
    this.photoEditorState.mode = 'crop';
    this.photoEditorState.cropRect = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
    this.photoEditorState.markers = [];
    this.setPhotoEditorMode('crop');
    this.drawPhotoEditorCanvas();
  },

  closePhotoEditor(applied = false) {
    const modal = document.getElementById('modal-photo-editor');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
    const wasOpen = this.photoEditorState.isOpen;
    this.photoEditorState.isOpen = false;
    if (!applied && wasOpen && typeof this.photoEditorState.onCancel === 'function') {
      this.photoEditorState.onCancel();
    }
  },

  drawPhotoEditorCanvas() {
    const canvas = document.getElementById('photo-editor-canvas');
    if (!canvas || !this.photoEditorState.img) return;

    const ctx = canvas.getContext('2d');
    const img = this.photoEditorState.img;
    const rot = this.photoEditorState.rotation;

    const isRot90or270 = rot === 90 || rot === 270;
    const srcW = isRot90or270 ? img.height : img.width;
    const srcH = isRot90or270 ? img.width : img.height;

    const maxW = Math.min(window.innerWidth - 32, 900);
    const maxH = Math.min(window.innerHeight - 230, 600);
    const scale = Math.min(maxW / srcW, maxH / srcH, 1);

    const dispW = Math.round(srcW * scale);
    const dispH = Math.round(srcH * scale);

    canvas.width = dispW;
    canvas.height = dispH;
    canvas.style.width = dispW + 'px';
    canvas.style.height = dispH + 'px';

    ctx.save();
    ctx.clearRect(0, 0, dispW, dispH);

    ctx.translate(dispW / 2, dispH / 2);
    ctx.rotate((rot * Math.PI) / 180);
    if (isRot90or270) {
      ctx.drawImage(img, -dispH / 2, -dispW / 2, dispH, dispW);
    } else {
      ctx.drawImage(img, -dispW / 2, -dispH / 2, dispW, dispH);
    }
    ctx.restore();

    const cr = this.photoEditorState.cropRect;
    const cropX = cr.x * dispW;
    const cropY = cr.y * dispH;
    const cropW = cr.w * dispW;
    const cropH = cr.h * dispH;

    if (this.photoEditorState.mode === 'crop') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, dispW, cropY);
      ctx.fillRect(0, cropY + cropH, dispW, dispH - (cropY + cropH));
      ctx.fillRect(0, cropY, cropX, cropH);
      ctx.fillRect(cropX + cropW, cropY, dispW - (cropX + cropW), cropH);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cropX, cropY, cropW, cropH);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cropX + cropW / 3, cropY);
      ctx.lineTo(cropX + cropW / 3, cropY + cropH);
      ctx.moveTo(cropX + (cropW * 2) / 3, cropY);
      ctx.lineTo(cropX + (cropW * 2) / 3, cropY + cropH);
      ctx.moveTo(cropX, cropY + cropH / 3);
      ctx.lineTo(cropX + cropW, cropY + cropH / 3);
      ctx.moveTo(cropX, cropY + (cropH * 2) / 3);
      ctx.lineTo(cropX + cropW, cropY + (cropH * 2) / 3);
      ctx.stroke();

      const handleSize = 14;
      ctx.fillStyle = '#009944';
      ctx.fillRect(cropX - 2, cropY - 2, handleSize, 4);
      ctx.fillRect(cropX - 2, cropY - 2, 4, handleSize);
      ctx.fillRect(cropX + cropW - handleSize + 2, cropY - 2, handleSize, 4);
      ctx.fillRect(cropX + cropW - 2, cropY - 2, 4, handleSize);
      ctx.fillRect(cropX - 2, cropY + cropH - 2, handleSize, 4);
      ctx.fillRect(cropX - 2, cropY + cropH - handleSize + 2, 4, handleSize);
      ctx.fillRect(cropX + cropW - handleSize + 2, cropY + cropH - 2, handleSize, 4);
      ctx.fillRect(cropX + cropW - 2, cropY + cropH - handleSize + 2, 4, handleSize);
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(cropX, cropY, cropW, cropH);
      ctx.setLineDash([]);
    }

    const allMarkers = [...this.photoEditorState.markers];
    if (this.photoEditorState.currentMarker) {
      allMarkers.push(this.photoEditorState.currentMarker);
    }

    allMarkers.forEach((m) => {
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 6;

      const mx = m.x * dispW;
      const my = m.y * dispH;
      const mw = m.w * dispW;
      const mh = m.h * dispH;

      ctx.beginPath();
      ctx.ellipse(mx + mw / 2, my + mh / 2, Math.abs(mw / 2), Math.abs(mh / 2), 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(mx + mw / 2, my + mh / 2 - Math.abs(mh / 2), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  },

  setupPhotoEditorCanvasEvents() {
    const canvas = document.getElementById('photo-editor-canvas');
    if (!canvas || canvas._eventsBound) return;
    canvas._eventsBound = true;

    const getCanvasPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      return {
        x: (clientX - rect.left) / canvas.width,
        y: (clientY - rect.top) / canvas.height
      };
    };

    const onStart = (e) => {
      e.preventDefault();
      const pos = getCanvasPos(e);
      this.photoEditorState.isDragging = true;
      this.photoEditorState.dragStart = pos;

      if (this.photoEditorState.mode === 'crop') {
        this.photoEditorState.dragAction = 'move-crop';
      } else {
        this.photoEditorState.dragAction = 'draw-marker';
        this.photoEditorState.currentMarker = {
          x: pos.x,
          y: pos.y,
          w: 0.01,
          h: 0.01
        };
      }
    };

    const onMove = (e) => {
      if (!this.photoEditorState.isDragging) return;
      e.preventDefault();
      const pos = getCanvasPos(e);

      if (this.photoEditorState.dragAction === 'move-crop') {
        const dx = pos.x - this.photoEditorState.dragStart.x;
        const dy = pos.y - this.photoEditorState.dragStart.y;
        this.photoEditorState.dragStart = pos;

        const cr = this.photoEditorState.cropRect;
        cr.x = Math.max(0, Math.min(1 - cr.w, cr.x + dx));
        cr.y = Math.max(0, Math.min(1 - cr.h, cr.y + dy));
        this.drawPhotoEditorCanvas();
      } else if (this.photoEditorState.dragAction === 'draw-marker') {
        const start = this.photoEditorState.dragStart;
        const minX = Math.min(start.x, pos.x);
        const minY = Math.min(start.y, pos.y);
        const w = Math.max(0.02, Math.abs(pos.x - start.x));
        const h = Math.max(0.02, Math.abs(pos.y - start.y));

        this.photoEditorState.currentMarker = { x: minX, y: minY, w, h };
        this.drawPhotoEditorCanvas();
      }
    };

    const onEnd = (e) => {
      if (!this.photoEditorState.isDragging) return;
      this.photoEditorState.isDragging = false;

      if (this.photoEditorState.dragAction === 'draw-marker' && this.photoEditorState.currentMarker) {
        if (this.photoEditorState.currentMarker.w > 0.03 || this.photoEditorState.currentMarker.h > 0.03) {
          this.photoEditorState.markers.push(this.photoEditorState.currentMarker);
        }
        this.photoEditorState.currentMarker = null;
        this.drawPhotoEditorCanvas();
      }
      this.photoEditorState.dragAction = null;
    };

    canvas.addEventListener('pointerdown', onStart);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  },

  applyPhotoEditor() {
    if (!this.photoEditorState.img) {
      this.closePhotoEditor(false);
      return;
    }

    const img = this.photoEditorState.img;
    const rot = this.photoEditorState.rotation;
    const cr = this.photoEditorState.cropRect;
    const markers = this.photoEditorState.markers;

    const isRot90or270 = rot === 90 || rot === 270;
    const fullW = isRot90or270 ? img.height : img.width;
    const fullH = isRot90or270 ? img.width : img.height;

    const cropX = Math.round(cr.x * fullW);
    const cropY = Math.round(cr.y * fullH);
    const cropW = Math.max(100, Math.round(cr.w * fullW));
    const cropH = Math.max(100, Math.round(cr.h * fullH));

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = cropW;
    exportCanvas.height = cropH;
    const ctx = exportCanvas.getContext('2d');

    ctx.save();
    ctx.translate(-cropX, -cropY);

    ctx.translate(fullW / 2, fullH / 2);
    ctx.rotate((rot * Math.PI) / 180);
    if (isRot90or270) {
      ctx.drawImage(img, -fullH / 2, -fullW / 2, fullH, fullW);
    } else {
      ctx.drawImage(img, -fullW / 2, -fullH / 2, fullW, fullH);
    }
    ctx.restore();

    markers.forEach((m) => {
      const mx = m.x * fullW - cropX;
      const my = m.y * fullH - cropY;
      const mw = m.w * fullW;
      const mh = m.h * fullH;

      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = Math.max(5, Math.round(cropW * 0.008));
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 8;

      ctx.beginPath();
      ctx.ellipse(mx + mw / 2, my + mh / 2, Math.abs(mw / 2), Math.abs(mh / 2), 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(mx + mw / 2, my + mh / 2 - Math.abs(mh / 2), Math.max(8, Math.round(cropW * 0.012)), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    const finalDataUrl = exportCanvas.toDataURL('image/jpeg', 0.88);
    const onComplete = this.photoEditorState.onComplete;
    this.closePhotoEditor(true);

    if (typeof onComplete === 'function') {
      onComplete(finalDataUrl);
    }
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.FMCUApp.init();
});
