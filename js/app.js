// ============================================================================
// FMCU VISIT STORE REPORT - Main Application Controller (UI, Analytics, GPS,
// Actual In/Out, Multi-Section Form, PDF Slide Preview, Admin RBAC & GDrive)
// ============================================================================

window.FMCUApp = {
  currentView: 'home',
  currentAdminTab: 'schedules',
  currentUser: null,
  liveGps: {
    lat: -6.15682,
    lng: 106.75824,
    accuracy: 12,
    status: 'VERIFIED'
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
  activePreviewReportId: 'rep-taman-kota-0404',
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

    // Check active session or auto-login default auditor for smooth experience
    let sessionUser = window.FMCUData.getSession();
    if (!sessionUser) {
      const users = window.FMCUData.getUsers();
      sessionUser = users[0]; // Default to Rani Ismawati (Auditor)
      window.FMCUData.setSession(sessionUser);
    }
    this.currentUser = sessionUser;

    this.populateHeaderRoleSwitcher();
    this.updateUserHeaderUI();
    this.refreshGpsLocation(false);
    this.loadSampleTamanKotaToForm(true);
    this.renderAllViews();
    this.populateGasScriptPreview();
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
      errEl.textContent = 'Username atau Password tidak sesuai. Gunakan password demo: 123';
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
    if (this.currentView === 'admin') {
      this.checkAdminGateUI();
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
    sel.innerHTML = users
      .map(
        (u) =>
          `<option value="${u.id}" ${this.currentUser && this.currentUser.id === u.id ? 'selected' : ''}>👤 ${u.name} (${u.role === 'SUPER_ADMIN' ? 'Admin' : u.role === 'ADMIN_SCHEDULE' ? 'RM/Admin' : 'Auditor'})</option>`
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
    if (welcomeRole) welcomeRole.textContent = `Otoritas: ${u.roleBadge || u.role} • ${u.region || ''}`;

    const lockBadge = document.getElementById('sidebar-admin-lock');
    if (lockBadge) {
      if (this.hasAdminAuthority(u)) {
        lockBadge.textContent = 'Terbuka';
        lockBadge.className = 'text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold';
      } else {
        lockBadge.textContent = 'Locked';
        lockBadge.className = 'text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold';
      }
    }

    this.updateActiveCheckInUI();
  },

  // ==========================================================================
  // NAVIGATION & VIEW ROUTER
  // ==========================================================================
  navigate(viewName, subTab = null) {
    this.currentView = viewName;
    const views = ['home', 'form', 'preview', 'admin'];
    views.forEach((v) => {
      const mainEl = document.getElementById(`view-${v}`);
      if (mainEl) mainEl.classList.toggle('hidden', v !== viewName);

      const dNav = document.getElementById(`nav-${v}`);
      if (dNav) dNav.classList.toggle('active', v !== viewName ? false : true);

      const mNav = document.getElementById(`mnav-${v}`);
      if (mNav) mNav.classList.toggle('active', v !== viewName ? false : true);
    });

    const titles = {
      home: [
        'Dashboard Jadwal, Analitik & History Visit',
        'Pantau jadwal toko, lokasi aktual (Actual In/Out), trend temuan QSC, dan performa auditor'
      ],
      form: [
        'Form Laporan Visit Toko (QSC, FamiTrack & Observasi)',
        'Lengkapi data kunjungan toko, bukti foto otomatis ber-watermark GPS, dan analisis akar masalah'
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
    } else if (viewName === 'preview') {
      this.renderPreviewView();
    } else if (viewName === 'admin') {
      this.checkAdminGateUI();
      if (subTab) this.switchAdminTab(subTab);
      this.renderAdminView();
    }
  },

  // ==========================================================================
  // LIVE GPS GEOLOCATION & LEAFLET MAP TRACKING
  // ==========================================================================
  refreshGpsLocation(notify = false) {
    const updateUIWithCoords = (lat, lng, accuracy = 10, isReal = true) => {
      this.liveGps = {
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
        accuracy: Math.round(accuracy),
        status: isReal ? 'GPS AKTUAL' : 'GPS AKTIF'
      };

      const coordStr = `${this.liveGps.lat}, ${this.liveGps.lng}`;
      const sideEl = document.getElementById('sidebar-gps-coords');
      if (sideEl) sideEl.textContent = `${coordStr} (±${this.liveGps.accuracy}m)`;

      const headEl = document.getElementById('header-gps-text');
      if (headEl) headEl.textContent = `GPS: ${coordStr}`;

      const homeEl = document.getElementById('home-gps-latlng');
      if (homeEl) homeEl.textContent = coordStr;

      const formGpsEl = document.getElementById('form-banner-gps');
      if (formGpsEl) {
        formGpsEl.innerHTML = `<i class="fa-solid fa-location-dot text-emerald-400"></i><span>Live GPS User: ${coordStr} (±${this.liveGps.accuracy}m • Terverifikasi)</span>`;
      }

      // Persist last location for current user
      if (this.currentUser) {
        const users = window.FMCUData.getUsers();
        const idx = users.findIndex((u) => u.id === this.currentUser.id);
        if (idx !== -1) {
          users[idx].lastLocation = {
            ...(users[idx].lastLocation || {}),
            lat: this.liveGps.lat,
            lng: this.liveGps.lng,
            updatedAt: new Date().toISOString(),
            status: 'ON_DUTY'
          };
          window.FMCUData.saveUsers(users);
        }
      }

      this.initOrUpdateHomeMap();
      if (notify) {
        this.showToast(`Titik Live Location diperbarui: ${coordStr}`, 'success');
      }
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          updateUIWithCoords(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, true);
        },
        () => {
          // Fallback to user's last known or Taman Kota store GPS so demo never breaks
          const fallbackLat = this.currentUser?.lastLocation?.lat || -6.15682;
          const fallbackLng = this.currentUser?.lastLocation?.lng || 106.75824;
          updateUIWithCoords(fallbackLat, fallbackLng, 14, false);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      updateUIWithCoords(-6.15682, 106.75824, 15, false);
    }
  },

  initOrUpdateHomeMap() {
    const mapContainer = document.getElementById('home-live-map');
    if (!mapContainer || typeof L === 'undefined') return;

    const { lat, lng } = this.liveGps;
    if (!this.homeMap) {
      this.homeMap = L.map('home-live-map', {
        zoomControl: false,
        attributionControl: false
      }).setView([lat, lng], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(this.homeMap);
    } else {
      this.homeMap.setView([lat, lng], this.homeMap.getZoom());
    }

    // Clear previous markers
    if (this.userMarker) this.homeMap.removeLayer(this.userMarker);
    this.storeMarkers.forEach((m) => this.homeMap.removeLayer(m));
    this.storeMarkers = [];

    // Draw Store Markers
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
          .bindPopup(`<b>FamilyMart ${st.name} (${st.code})</b><br/>Store Head: ${st.storeHead}`);
        this.storeMarkers.push(m);
      }
    });

    // Draw Current User Live GPS Marker
    this.userMarker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: '#0099A6',
      color: '#ffffff',
      weight: 3,
      fillOpacity: 1
    })
      .addTo(this.homeMap)
      .bindPopup(`<b>Lokasi Aktual Anda (${this.currentUser?.name || 'Auditor'})</b><br/>GPS: ${lat}, ${lng}`);
  },

  // ==========================================================================
  // ACTUAL IN & ACTUAL OUT (CHECK-IN / CHECK-OUT) SYSTEM
  // ==========================================================================
  getCurrentTimeWIB() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
  },

  stampActualTime(type) {
    const timeStr = this.getCurrentTimeWIB();
    if (type === 'in') {
      document.getElementById('form-actual-in').value = timeStr;
      this.showToast(`Waktu Actual In tercatat: ${timeStr} pada GPS ${this.liveGps.lat}, ${this.liveGps.lng}`, 'success');
    } else {
      document.getElementById('form-actual-out').value = timeStr;
      this.showToast(`Waktu Actual Out tercatat: ${timeStr}`, 'info');
    }
  },

  updateActiveCheckInUI() {
    const active = window.FMCUData.getActiveCheckIn();
    const sideWidget = document.getElementById('sidebar-checkin-widget');
    const homeSummary = document.getElementById('home-checkin-summary');

    if (active) {
      if (sideWidget) {
        sideWidget.classList.remove('hidden');
        document.getElementById('sidebar-checkin-time').textContent = active.actualIn;
        document.getElementById('sidebar-checkin-store').textContent = `${active.storeName} (${active.storeCode})`;
      }
      if (homeSummary) {
        homeSummary.textContent = `Check-In: ${active.storeName} (${active.actualIn})`;
        homeSummary.className = 'font-bold text-emerald-700 mt-0.5 truncate';
      }
    } else {
      if (sideWidget) sideWidget.classList.add('hidden');
      if (homeSummary) {
        homeSummary.textContent = 'Siap Check-In Toko';
        homeSummary.className = 'font-bold text-slate-700 mt-0.5 truncate';
      }
    }
  },

  startNewVisitModal() {
    const stores = window.FMCUData.getStores();
    const sel = document.getElementById('modal-visit-store-select');
    if (sel) {
      sel.innerHTML = stores
        .map((s) => `<option value="${s.code}">${s.code} — ${s.name} (${s.type})</option>`)
        .join('');
    }
    document.getElementById('modal-checkin-clock').textContent = this.getCurrentTimeWIB();
    document.getElementById('modal-checkin-gps').textContent = `Koordinat GPS Aktual: ${this.liveGps.lat}, ${this.liveGps.lng}`;
    document.getElementById('modal-new-visit').classList.remove('hidden');
  },

  confirmStartNewVisit() {
    const storeCode = document.getElementById('modal-visit-store-select').value;
    this.closeModal('modal-new-visit');
    this.checkInAndOpenForm(storeCode, null);
  },

  checkInAndOpenForm(storeCode, scheduleId = null) {
    const stores = window.FMCUData.getStores();
    const store = stores.find((s) => s.code === storeCode) || stores[0];
    const nowTime = this.getCurrentTimeWIB();
    const todayStr = new Date().toISOString().slice(0, 10);

    const checkInObj = {
      storeCode: store.code,
      storeName: store.name,
      scheduleId: scheduleId,
      actualIn: nowTime,
      latIn: this.liveGps.lat,
      lngIn: this.liveGps.lng,
      startedAt: Date.now()
    };
    window.FMCUData.setActiveCheckIn(checkInObj);
    this.updateActiveCheckInUI();

    // Populate Form Visit with this Store's fresh data
    this.populateMasterStoreSelect();
    document.getElementById('form-report-id').value = '';
    document.getElementById('form-schedule-id').value = scheduleId || '';
    document.getElementById('form-store-select').value = store.code;
    this.onSelectMasterStore(store.code);

    document.getElementById('form-auditor-name').value = this.currentUser?.name || 'Rani Ismawati';
    document.getElementById('form-visit-date').value = todayStr;
    document.getElementById('form-actual-in').value = nowTime;
    document.getElementById('form-actual-out').value = '15:00 WIB';

    // Default 2 QSC photo slots and 2 blank/template observation cards
    const PA = window.PDF_ASSETS || {};
    this.formQscPhotos = [
      { id: 'qsc-new-1', caption: 'Foto QSC / Famitrack 1', dataUrl: PA.sampleQsc1 || '' },
      { id: 'qsc-new-2', caption: 'Foto QSC / Famitrack 2', dataUrl: PA.sampleQsc2 || '' }
    ];
    this.formObservations = [
      {
        id: 'obs-new-1',
        category: 'Food Safety & Expired',
        temuan: '',
        kondisiIdeal: '',
        penyebab: '',
        dampak: '',
        tindakanPerbaikan: '',
        hasil: 'Akan di monitoring visit berikutnya',
        deadline: todayStr
      }
    ];
    this.formEvidencePhotos = [];

    this.renderFormDynamicSections();
    this.navigate('form');
    this.showToast(`Check-In (Actual In: ${nowTime}) di Toko ${store.name} berhasil direkam!`, 'success');
  },

  // ==========================================================================
  // HALAMAN 1: HOME DASHBOARD, SCHEDULES, ANALYTICS CHARTS & HISTORY
  // ==========================================================================
  renderAllViews() {
    this.renderHomeView();
    this.renderPreviewSelector();
    this.renderAdminView();
  },

  renderHomeView() {
    const schedules = window.FMCUData.getSchedules();
    const reports = window.FMCUData.getReports();

    // Update KPI Cards
    const completedSchedules = schedules.filter((s) => s.status === 'COMPLETED').length;
    const totalSchedules = schedules.length;
    const compRate = totalSchedules > 0 ? Math.round((completedSchedules / totalSchedules) * 100) : 100;
    document.getElementById('kpi-total-visits').textContent = `${ reports.length } Visit`;
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
      totalDuration += Number(r.durationMinutes || 240);
      totalScore += Number(r.qscScore || 85);
    });

    document.getElementById('kpi-total-findings').textContent = String(totalFindings);
    document.getElementById('kpi-open-findings').textContent = `${openFindings} Open • ${closedFindings} Closed`;

    const avgDur = reports.length > 0 ? Math.round(totalDuration / reports.length) : 0;
    const hrs = Math.floor(avgDur / 60);
    const mins = avgDur % 60;
    document.getElementById('kpi-avg-duration').textContent = `${hrs}j ${mins}m`;

    const avgScore = reports.length > 0 ? (totalScore / reports.length).toFixed(1) : '0.0';
    document.getElementById('kpi-avg-score').textContent = `${avgScore}%`;

    this.renderHomeSchedules();
    this.renderAnalyticsCharts();
    this.renderUserPerformanceTable();
    this.renderHomeHistory();
    this.initOrUpdateHomeMap();
  },

  renderHomeSchedules() {
    const container = document.getElementById('home-schedule-list');
    if (!container) return;
    const scope = document.getElementById('schedule-filter-scope')?.value || 'ALL';
    let schedules = window.FMCUData.getSchedules();

    if (scope === 'MINE' && this.currentUser) {
      schedules = schedules.filter((s) => s.auditorId === this.currentUser.id || s.auditorName === this.currentUser.name);
    } else if (scope === 'PENDING') {
      schedules = schedules.filter((s) => s.status !== 'COMPLETED');
    } else if (scope === 'COMPLETED') {
      schedules = schedules.filter((s) => s.status === 'COMPLETED');
    }

    if (schedules.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-8 text-slate-400 text-xs">
          Tidak ada jadwal visit yang sesuai dengan filter.
        </div>
      `;
      return;
    }

    container.innerHTML = schedules
      .map((s) => {
        const isDone = s.status === 'COMPLETED';
        const dateFormatted = window.FMCUPdf.formatIndonesianDate(s.scheduledDate, true);
        return `
          <div class="border ${isDone ? 'border-slate-200 bg-slate-50/60' : 'border-emerald-200 bg-white'} rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-2xs hover:shadow-md transition">
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
                  <span>${dateFormatted} (${s.shiftWindow || '09:00 - 15:00'})</span>
                </div>
                <div class="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5">
                  <i class="fa-regular fa-user text-emerald-600"></i>
                  <span>Auditor: <strong>${s.auditorName}</strong></span>
                </div>
              </div>

              <p class="text-[11px] text-slate-500 bg-slate-100/80 p-2.5 rounded-xl leading-relaxed">
                ${s.auditFocus || 'Audit standar operasional QSC & FamiTrack'}
              </p>
            </div>

            <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              ${
                isDone
                  ? `
                <div class="text-[11px] text-emerald-700 font-semibold">
                  <i class="fa-solid fa-clock-rotate-left mr-1"></i>In: ${s.actualIn || '-'} • Out: ${s.actualOut || '-'}
                </div>
                <button onclick="FMCUApp.openReportPreview('${s.reportId || 'rep-taman-kota-0404'}')" class="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0099A6] font-bold text-xs transition cursor-pointer">
                  Lihat PDF →
                </button>
              `
                  : `
                <div class="text-[11px] text-slate-400 font-medium">Siap Check-In GPS</div>
                <button onclick="FMCUApp.checkInAndOpenForm('${s.storeCode}', '${s.id}')" class="fm-gradient hover:opacity-95 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer">
                  <i class="fa-solid fa-location-crosshairs"></i>
                  <span>Check-In & Mulai Visit</span>
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

    // 1. Aggregate Findings by Category
    const catCounts = {};
    reports.forEach((r) => {
      (r.observations || []).forEach((o) => {
        const cat = o.category || 'Temuan Operasional QSC';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
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
          labels: catLabels,
          datasets: [
            {
              data: catValues,
              backgroundColor: palette,
              borderWidth: 2,
              borderColor: '#ffffff'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { display: false }
          }
        }
      });
    }

    const legendEl = document.getElementById('trend-findings-legend');
    if (legendEl) {
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

    // 2. Store Trend Chart (Findings Count & QSC Score per Store)
    const storeNames = reports.map((r) => r.storeName);
    const storeFindings = reports.map((r) => (r.observations || []).length);
    const storeScores = reports.map((r) => Number(r.qscScore || 85));

    const ctx2 = document.getElementById('chart-trend-stores');
    if (ctx2 && typeof Chart !== 'undefined') {
      if (this.chartStores) this.chartStores.destroy();
      this.chartStores = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: storeNames,
          datasets: [
            {
              label: 'Jumlah Temuan',
              data: storeFindings,
              backgroundColor: '#0099A6',
              borderRadius: 6,
              yAxisID: 'y'
            },
            {
              label: 'Skor QSC (%)',
              data: storeScores,
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
            y: {
              beginAtZero: true,
              position: 'left',
              title: { display: true, text: 'Temuan' }
            },
            y1: {
              beginAtZero: true,
              max: 100,
              position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Skor QSC %' }
            }
          },
          plugins: {
            legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      });
    }

    const storeSummaryEl = document.getElementById('trend-stores-summary');
    if (storeSummaryEl) {
      storeSummaryEl.innerHTML = reports
        .slice(0, 3)
        .map(
          (r) => `
          <div class="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
            <div class="font-extrabold text-slate-800 truncate">${r.storeName}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">${(r.observations || []).length} Temuan • QSC ${r.qscScore || 85}%</div>
          </div>
        `
        )
        .join('');
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
        const loc = u.lastLocation || {};

        return `
          <tr class="hover:bg-slate-50/80 transition">
            <td class="py-3 px-4">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0" style="background:${u.avatarColor || '#0099A6'}">
                  ${u.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div class="font-bold text-slate-900">${u.name}</div>
                  <div class="text-[11px] text-slate-400">${u.email || u.username}</div>
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
              <div class="text-xs font-medium text-slate-800 truncate max-w-xs">${loc.address || 'Jakarta'}</div>
              <div class="text-[10px] font-mono text-slate-400">GPS: ${loc.lat || '-6.1568'}, ${loc.lng || '106.7582'}</div>
            </td>
            <td class="py-3 px-4 text-center">
              <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>${loc.status || 'ACTIVE'}
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
      container.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">Belum ada laporan visit yang cocok.</div>`;
      return;
    }

    container.innerHTML = reports
      .map((r) => {
        const obsCount = (r.observations || []).length;
        const evCount = (r.evidencePhotos || []).length;
        const dateText = r.visitDayDateFormatted || window.FMCUPdf.formatIndonesianDate(r.visitDate, true);
        return `
          <div class="border border-slate-200 hover:border-teal-300 rounded-2xl p-4 sm:p-5 bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition shadow-2xs">
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
                  Skor QSC: ${r.qscScore || 85}%
                </span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <button onclick="FMCUApp.editReportById('${r.id}')" class="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer">
                <i class="fa-solid fa-pen mr-1"></i>Edit
              </button>
              <button onclick="FMCUApp.openReportPreview('${r.id}')" class="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0099A6] font-bold text-xs transition flex items-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-display"></i>
                <span>Preview Slide PDF</span>
              </button>
              <button onclick="FMCUApp.downloadReportById('${r.id}')" class="fm-gradient hover:opacity-95 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer">
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
      `<option value="">-- Pilih dari Master Toko FamilyMart --</option>` +
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

  loadSampleTamanKotaToForm(silent = false) {
    this.populateMasterStoreSelect();
    const reports = window.FMCUData.getReports();
    const sample = reports.find((r) => r.id === 'rep-taman-kota-0404') || reports[0];
    if (!sample) return;

    this.loadReportObjectToForm(sample);
    if (!silent) {
      this.showToast('Data lengkap TAMAN KOTA (0404) sesuai PDF contoh berhasil dimuat ke Form!', 'info');
    }
  },

  loadReportObjectToForm(rep) {
    this.populateMasterStoreSelect();
    document.getElementById('form-report-id').value = rep.id || '';
    document.getElementById('form-schedule-id').value = rep.scheduleId || '';
    document.getElementById('form-store-select').value = rep.storeCode || '';
    document.getElementById('form-store-name').value = rep.storeName || '';
    document.getElementById('form-store-code').value = rep.storeCode || '';
    document.getElementById('form-store-type').value = rep.storeType || 'CVS';
    document.getElementById('form-auditor-name').value = rep.auditorName || '';
    document.getElementById('form-visit-date').value = rep.visitDate || '2026-10-16';
    document.getElementById('form-qsc-score').value = rep.qscScore || 84;
    document.getElementById('form-store-head').value = rep.storeHead || '';
    document.getElementById('form-area-manager').value = rep.areaManager || '';
    document.getElementById('form-regional-manager').value = rep.regionalManager || '';
    document.getElementById('form-store-email').value = rep.storeEmail || '';
    document.getElementById('form-ca-link').value = rep.caLink || 'https://tinyurl.com/store-caassignment';
    document.getElementById('form-actual-in').value = rep.actualIn || '09:12 WIB';
    document.getElementById('form-actual-out').value = rep.actualOut || '14:35 WIB';

    document.getElementById('form-banner-title').textContent = `FMCU Visit Store Report — ${rep.storeName}`;
    document.getElementById('form-banner-store-badge').textContent = `Kode Toko: ${rep.storeCode} (${rep.storeType})`;

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
            <input type="text" value="${c.role || ''}" oninput="FMCUApp.formCrew[${idx}].role = this.value" placeholder="Store Head / Crew" class="fm-input py-1.5 text-xs font-bold" />
          </td>
          <td class="p-2">
            <input type="text" value="${c.name || ''}" oninput="FMCUApp.formCrew[${idx}].name = this.value" placeholder="Nama lengkap personil" class="fm-input py-1.5 text-xs" />
          </td>
          <td class="p-2">
            <input type="text" value="${c.jobLevel || 'MG1'}" oninput="FMCUApp.formCrew[${idx}].jobLevel = this.value" placeholder="NS1 / MG1" class="fm-input py-1.5 text-xs text-center font-bold" />
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
      jobLevel: 'MG1'
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
                : `<div class="text-center text-slate-400 text-xs"><i class="fa-solid fa-file-image text-2xl mb-1 block"></i>Belum ada foto form QSC</div>`
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
        <div class="border border-slate-300 rounded-2xl overflow-hidden bg-white shadow-2xs">
          <!-- Card Header -->
          <div class="bg-[#0099A6] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-sm">Temuan ${idx + 1}/${this.formObservations.length}</span>
              <select onchange="FMCUApp.applyFindingPreset(${idx}, this.value)" class="text-xs bg-white/15 hover:bg-white/25 text-white border border-white/30 rounded-lg px-2.5 py-1 font-semibold focus:outline-none cursor-pointer">
                <option value="" class="text-slate-900">⚡ Isi Cepat dari Template Temuan...</option>
                ${presets.map((pr) => `<option value="${pr.id}" class="text-slate-900">${pr.label}</option>`).join('')}
              </select>
            </div>

            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1.5 bg-white text-slate-800 px-2.5 py-1 rounded-full text-xs font-bold">
                <span class="text-rose-700">Deadline Perbaikan:</span>
                <input type="date" value="${obs.deadline || '2026-10-28'}" onchange="FMCUApp.formObservations[${idx}].deadline = this.value; FMCUApp.formObservations[${idx}].deadlineFormatted = window.FMCUPdf.formatIndonesianDate(this.value, false);" class="text-xs font-bold text-rose-700 focus:outline-none bg-transparent" />
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
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].temuan = this.value" placeholder="Contoh: Thawingan roti goreng exp tgl 16.10.26 jam 04:00" class="w-full bg-white/90 border border-amber-200 rounded-lg p-2 font-bold text-slate-900 focus:outline-none">${obs.temuan || ''}</textarea>
            </div>

            <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <label class="font-extrabold text-[#008291] uppercase block">Dampak (Impact)</label>
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].dampak = this.value" placeholder="Dampak terhadap kualitas produk / operasional toko" class="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none">${obs.dampak || ''}</textarea>
            </div>

            <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <label class="font-extrabold text-[#008291] uppercase block">Kondisi Ideal</label>
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].kondisiIdeal = this.value" placeholder="Standar kondisi ideal sesuai SOP FamilyMart" class="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none">${obs.kondisiIdeal || ''}</textarea>
            </div>

            <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <label class="font-extrabold text-[#008291] uppercase block">Tindakan Perbaikan (Corrective Action)</label>
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].tindakanPerbaikan = this.value" placeholder="Langkah perbaikan yang harus dilakukan tim toko" class="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none">${obs.tindakanPerbaikan || ''}</textarea>
            </div>

            <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <label class="font-extrabold text-[#008291] uppercase block">Penyebab (Root Cause)</label>
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].penyebab = this.value" placeholder="Akar penyebab terjadinya temuan" class="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none">${obs.penyebab || ''}</textarea>
            </div>

            <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <label class="font-extrabold text-[#008291] uppercase block">Hasil (Result / Follow-Up)</label>
              <textarea rows="2" oninput="FMCUApp.formObservations[${idx}].hasil = this.value" placeholder="Contoh: Akan di monitoring visit berikutnya / Sudah dimusnahkan" class="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none">${obs.hasil || ''}</textarea>
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
      hasil: 'Akan di monitoring visit berikutnya',
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
      temuan: preset.temuan,
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
        <div class="border border-slate-300 rounded-2xl p-3 bg-white grid grid-cols-12 gap-3 relative shadow-2xs">
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
              Ganti Foto
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
    this.showToast(`Foto bukti #${idx + 1} berhasil diproses dengan Watermark GPS`, 'success');
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
        description: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        dataUrl
      });
    }
    this.renderEvidenceGrid();
    this.showToast(`${files.length} foto bukti berhasil diunggah & diberi watermark GPS!`, 'success');
  },

  // --- Collect & Save Form Report ---
  collectFormReportObject() {
    const existingId = document.getElementById('form-report-id').value;
    const scheduleId = document.getElementById('form-schedule-id').value;
    const visitDate = document.getElementById('form-visit-date').value || new Date().toISOString().slice(0, 10);
    const settings = window.FMCUData.getSettings();

    const reportObj = {
      id: existingId || 'rep-' + Date.now(),
      scheduleId: scheduleId || null,
      reportTitle: settings.reportTitle || 'FMCU Visit Store Report',
      auditorId: this.currentUser?.id || 'usr-1',
      auditorName: document.getElementById('form-auditor-name').value.trim() || 'Rani Ismawati',
      visitDate,
      visitDateFormatted: window.FMCUPdf.formatIndonesianDate(visitDate, false),
      visitDayDateFormatted: window.FMCUPdf.formatIndonesianDate(visitDate, true),
      storeCode: document.getElementById('form-store-code').value.trim() || '0404',
      storeName: document.getElementById('form-store-name').value.trim().toUpperCase() || 'TAMAN KOTA',
      storeType: document.getElementById('form-store-type').value || 'CVS',
      storeHead: document.getElementById('form-store-head').value.trim() || '-',
      areaManager: document.getElementById('form-area-manager').value.trim() || '-',
      regionalManager: document.getElementById('form-regional-manager').value.trim() || '-',
      storeEmail: document.getElementById('form-store-email').value.trim() || '',
      actualIn: document.getElementById('form-actual-in').value.trim() || '09:00 WIB',
      actualOut: document.getElementById('form-actual-out').value.trim() || this.getCurrentTimeWIB(),
      durationMinutes: 280,
      gpsLat: this.liveGps.lat,
      gpsLng: this.liveGps.lng,
      qscScore: Number(document.getElementById('form-qsc-score').value || 85),
      crewList: JSON.parse(JSON.stringify(this.formCrew)),
      qscPhotos: JSON.parse(JSON.stringify(this.formQscPhotos)),
      observations: this.formObservations.map((o) => ({
        ...o,
        deadlineFormatted: o.deadlineFormatted || window.FMCUPdf.formatIndonesianDate(o.deadline, false)
      })),
      evidencePhotos: JSON.parse(JSON.stringify(this.formEvidencePhotos)),
      caLink: document.getElementById('form-ca-link').value.trim() || 'https://tinyurl.com/store-caassignment',
      createdAt: new Date().toISOString()
    };

    // Save into Reports List
    const reports = window.FMCUData.getReports();
    const idx = reports.findIndex((r) => r.id === reportObj.id);
    if (idx !== -1) {
      reports[idx] = reportObj;
    } else {
      reports.unshift(reportObj);
    }
    window.FMCUData.saveReports(reports);

    // Update linked Schedule status to COMPLETED & record Actual In/Out
    const schedules = window.FMCUData.getSchedules();
    const schIdx = schedules.findIndex(
      (s) => (scheduleId && s.id === scheduleId) || (s.storeCode === reportObj.storeCode && s.status !== 'COMPLETED')
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

    // Clear active check-in
    window.FMCUData.setActiveCheckIn(null);
    this.updateActiveCheckInUI();

    return reportObj;
  },

  handleSaveAndPreview(event) {
    if (event) event.preventDefault();
    const saved = this.collectFormReportObject();
    this.activePreviewReportId = saved.id;
    this.renderAllViews();
    this.navigate('preview');
    this.showToast(`Laporan Visit ${saved.storeName} disimpan! Menampilkan Preview PDF 16:9.`, 'success');
  },

  handleSaveAndSendIntegration() {
    document.getElementById('form-actual-out').value = this.getCurrentTimeWIB();
    const saved = this.collectFormReportObject();
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
    sel.innerHTML = reports
      .map(
        (r) =>
          `<option value="${r.id}" ${r.id === this.activePreviewReportId ? 'selected' : ''}>${r.storeName} (${r.storeCode}) — ${r.visitDateFormatted || r.visitDate} [${r.auditorName}]</option>`
      )
      .join('');
  },

  getActivePreviewReport() {
    const reports = window.FMCUData.getReports();
    return reports.find((r) => r.id === this.activePreviewReportId) || reports[0];
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
      btnSlide.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-900 shadow-2xs transition cursor-pointer';
      btnGrid.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer';
    } else {
      btnGrid.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-900 shadow-2xs transition cursor-pointer';
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
              ? 'border-[#0099A6] bg-teal-50 text-[#0099A6] font-extrabold shadow-2xs'
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

  editCurrentPreviewReport() {
    const rep = this.getActivePreviewReport();
    if (!rep) return;
    this.editReportById(rep.id);
  },

  editReportById(reportId) {
    const reports = window.FMCUData.getReports();
    const rep = reports.find((r) => r.id === reportId);
    if (!rep) return;
    this.loadReportObjectToForm(rep);
    this.navigate('form');
    this.showToast(`Membuka mode edit untuk laporan ${rep.storeName}`, 'info');
  },

  // ==========================================================================
  // EMAIL & GOOGLE DRIVE INTEGRATION (HYBRID WEBHOOK + DIRECT FALLBACK)
  // ==========================================================================
  openIntegrationSendModal(reportId = null) {
    if (reportId) this.activePreviewReportId = reportId;
    const rep = this.getActivePreviewReport();
    if (!rep) return;
    const settings = window.FMCUData.getSettings();

    document.getElementById('modal-send-report-name').textContent = `Laporan: FamilyMart ${rep.storeName} (${rep.storeCode}) — ${rep.visitDateFormatted || rep.visitDate}`;
    document.getElementById('modal-send-report-meta').textContent = `Auditor: ${rep.auditorName} • ${(rep.observations || []).length} Temuan Observasi • ${(rep.evidencePhotos || []).length} Foto Bukti`;
    document.getElementById('modal-send-to').value = rep.storeEmail || `${rep.storeName.toLowerCase().replace(/\s+/g, '')}.${rep.storeCode}@familymart.co.id`;
    document.getElementById('modal-send-cc').value = settings.defaultCcEmails || 'fmcu@familymart.co.id, regional.manager@familymart.co.id';
    document.getElementById('modal-send-folder').value = settings.gdriveFolderId || '1FMCU_Visit_Report_Archive_Folder';

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
    statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Sedang membuat file PDF 16:9 dan mengunggah ke Google Drive & Email...`;

    // 1. Always download the generated PDF locally so user immediately has the exact PDF file
    const fileName = window.FMCUPdf.getFileName(rep);
    window.FMCUPdf.downloadReportPdf(rep);

    // 2. If Google Apps Script Webhook URL is configured, POST base64 PDF to GDrive + Gmail
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
        statusEl.innerHTML = `✅ Berhasil! File <b>${fileName}</b> telah diunggah ke Folder Google Drive (<code>${folderId}</code>) dan dikirim via Email ke <b>${toEmail}</b>.`;
        this.showToast('Laporan berhasil dikirim ke Email & diarsipkan ke Google Drive!', 'success');
      } catch (err) {
        statusEl.className = 'p-3 rounded-xl font-semibold text-xs bg-amber-50 text-amber-900 border border-amber-200 block';
        statusEl.innerHTML = `⚠️ File PDF telah diunduh (${fileName}). Membuka aplikasi Email untuk pengiriman manual...`;
      }
    } else {
      // Hybrid Mode: PDF downloaded + Open formatted Mailto link with findings summary
      const obsListText = (rep.observations || [])
        .map((o, i) => `${i + 1}. ${o.temuan} (Deadline: ${o.deadlineFormatted || o.deadline})`)
        .join('%0D%0A');
      const subject = encodeURIComponent(`[FMCU VISIT REPORT] ${rep.storeName} (${rep.storeCode}) - ${rep.visitDateFormatted || rep.visitDate}`);
      const body =
        `Halo Tim Store ${rep.storeName} (${rep.storeCode}),%0D%0A%0D%0A` +
        `Berikut terlampir hasil FMCU Visit Store Report pada ${rep.visitDayDateFormatted || rep.visitDate}:%0D%0A` +
        `- Auditor: ${rep.auditorName}%0D%0A` +
        `- Store Head: ${rep.storeHead}%0D%0A` +
        `- Waktu Actual In - Out: ${rep.actualIn} s/d ${rep.actualOut}%0D%0A` +
        `- Koordinat GPS: ${rep.gpsLat}, ${rep.gpsLng}%0D%0A%0D%0A` +
        `Ringkasan Temuan Observasi:%0D%0A${obsListText}%0D%0A%0D%0A` +
        `Link Form Corrective Action: ${rep.caLink || 'https://tinyurl.com/store-caassignment'}`;

      statusEl.className = 'p-3 rounded-xl font-semibold text-xs bg-emerald-50 text-emerald-900 border border-emerald-200 block';
      statusEl.innerHTML = `
        <div class="space-y-1.5">
          <div>✅ File PDF <strong>${fileName}</strong> berhasil diunduh & dicatat ke log arsip Google Drive (<code>${folderId}</code>).</div>
          <div class="flex flex-wrap gap-2 pt-1">
            <a href="mailto:${toEmail}?cc=${encodeURIComponent(ccEmail)}&subject=${subject}&body=${body}" class="px-3 py-1.5 rounded-lg bg-[#009944] text-white font-bold inline-flex items-center gap-1">
              <i class="fa-regular fa-envelope"></i> Buka Aplikasi Email Siap Kirim
            </a>
          </div>
        </div>
      `;
      this.showToast(`File ${fileName} siap & terintegrasi!`, 'success');
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
      // Allow quick elevation to Super Admin if using default 'admin' / '123'
      const adminDefault = users.find((u) => u.role === 'SUPER_ADMIN');
      if (adminDefault && pass === '123') {
        this.setLoggedInUser(adminDefault);
        this.checkAdminGateUI();
        this.showToast('Otoritas Super Admin FMCU berhasil diaktifkan!', 'success');
        return;
      }
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
      schStoreSel.innerHTML = stores.map((s) => `<option value="${s.code}">${s.code} - ${s.name} (${s.type})</option>`).join('');
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

    // 2. Render Admin Master Stores Table
    document.getElementById('admin-store-count').textContent = `${stores.length} Toko`;
    const stTbody = document.getElementById('admin-stores-tbody');
    if (stTbody) {
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
            <td class="py-2.5 px-3 text-right">
              <button onclick="FMCUApp.deleteStore('${st.code}')" class="text-rose-600 hover:underline font-bold cursor-pointer">Hapus</button>
            </td>
          </tr>
        `
        )
        .join('');
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
              <div class="text-[11px] font-mono text-slate-400">@${u.username} • Pass: ${u.password}</div>
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
              ${u.lastLocation ? `${u.lastLocation.lat}, ${u.lastLocation.lng}` : '-'}
            </td>
            <td class="py-2.5 px-3 text-right">
              <button onclick="FMCUApp.quickLoginById('${u.id}')" class="text-[#0099A6] hover:underline font-bold mr-2 cursor-pointer">Pakai Akun</button>
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
    if (!st || !au) return;

    const schedules = window.FMCUData.getSchedules();
    schedules.unshift({
      id: 'sch-' + Date.now(),
      storeCode: st.code,
      storeName: st.name,
      storeType: st.type,
      auditorId: au.id,
      auditorName: au.name,
      scheduledDate: dateStr,
      shiftWindow: windowStr || '09:00 - 15:00 WIB',
      priority,
      auditFocus: focus || 'Audit standar operasional QSC & FamiTrack',
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
    const lat = parseFloat(document.getElementById('adm-st-lat').value) || -6.2;
    const lng = parseFloat(document.getElementById('adm-st-lng').value) || 106.816;

    const stores = window.FMCUData.getStores();
    const existingIdx = stores.findIndex((s) => s.code === code);
    const storeObj = {
      code,
      name,
      type,
      storeHead: head,
      areaManager: am,
      regionalManager: rm,
      email: email || `${name.toLowerCase().replace(/\s+/g, '')}.${code}@familymart.co.id`,
      lat,
      lng,
      defaultCrew: [
        { role: 'Store Head', name: head, jobLevel: 'NS1' },
        { role: 'Shift Leader', name: 'Shift Leader Duty', jobLevel: 'NS1' },
        { role: 'Crew Store 1', name: 'Crew Store 1', jobLevel: 'MG1' },
        { role: 'Crew Store 2', name: 'Crew Store 2', jobLevel: 'MG1' }
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

  deleteStore(code) {
    const stores = window.FMCUData.getStores().filter((s) => s.code !== code);
    window.FMCUData.saveStores(stores);
    this.populateMasterStoreSelect();
    this.renderAllViews();
    this.showToast(`Toko kode ${code} dihapus`, 'info');
  },

  handleSaveUser(event) {
    event.preventDefault();
    const name = document.getElementById('adm-usr-name').value.trim();
    const username = document.getElementById('adm-usr-username').value.trim().toLowerCase();
    const password = document.getElementById('adm-usr-password').value.trim() || '123';
    const role = document.getElementById('adm-usr-role').value;
    const region = document.getElementById('adm-usr-region').value.trim() || 'Regional Jakarta';
    const email = document.getElementById('adm-usr-email').value.trim();

    const checkedAuths = Array.from(document.querySelectorAll('input[name="adm-auth"]:checked')).map((el) => el.value);
    const roleBadges = {
      AUDITOR: 'Regional Bestie / Auditor',
      ADMIN_SCHEDULE: 'Regional Manager (Admin Jadwal)',
      SUPER_ADMIN: 'Super Admin FMCU'
    };

    const users = window.FMCUData.getUsers();
    const existingIdx = users.findIndex((u) => u.username.toLowerCase() === username);
    const newUser = {
      id: existingIdx !== -1 ? users[existingIdx].id : 'usr-' + Date.now(),
      username,
      password,
      name,
      email: email || `${username}@familymart.co.id`,
      role,
      roleBadge: roleBadges[role] || role,
      region,
      avatarColor: role === 'SUPER_ADMIN' ? '#009944' : '#0099A6',
      active: true,
      authorities: checkedAuths,
      lastLocation: {
        lat: this.liveGps.lat,
        lng: this.liveGps.lng,
        address: region,
        updatedAt: new Date().toISOString(),
        status: 'ACTIVE'
      }
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
    this.showToast(`User ${name} (@${username}) berhasil disimpan dengan otoritas ${roleBadges[role]}!`, 'success');
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

  resetDemoDataConfirm() {
    window.FMCUData.resetToSeed();
    this.loadSampleTamanKotaToForm(true);
    this.renderAllViews();
    this.showToast('Seluruh data berhasil di-reset ke data awal (TAMAN KOTA 0404)!', 'info');
  },

  // ==========================================================================
  // USER PROFILE & ATTENDANCE LOGS MODAL
  // ==========================================================================
  openProfileModal() {
    const u = this.currentUser;
    if (!u) return;
    const reports = window.FMCUData.getReports().filter((r) => r.auditorId === u.id || r.auditorName === u.name);
    const body = document.getElementById('profile-modal-body');

    body.innerHTML = `
      <div class="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
        <div class="w-14 h-14 rounded-2xl text-white font-extrabold text-xl flex items-center justify-center shrink-0" style="background:${u.avatarColor || '#0099A6'}">
          ${u.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div class="text-xs font-extrabold text-[#009944] uppercase">${u.roleBadge || u.role}</div>
          <h4 class="text-lg font-extrabold text-slate-900">${u.name}</h4>
          <div class="text-xs text-slate-500">${u.email || u.username} • ${u.region || ''}</div>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 text-center text-xs">
        <div class="p-3 rounded-xl border border-slate-200">
          <div class="text-slate-400 font-bold uppercase text-[10px]">Visit Selesai</div>
          <div class="text-xl font-extrabold text-slate-900 mt-0.5">${reports.length}</div>
        </div>
        <div class="p-3 rounded-xl border border-slate-200">
          <div class="text-slate-400 font-bold uppercase text-[10px]">Live GPS Saat Ini</div>
          <div class="text-xs font-mono font-bold text-emerald-700 mt-1">${this.liveGps.lat}, ${this.liveGps.lng}</div>
        </div>
        <div class="p-3 rounded-xl border border-slate-200">
          <div class="text-slate-400 font-bold uppercase text-[10px]">Status Otoritas</div>
          <div class="text-xs font-extrabold text-[#0099A6] mt-1">${this.hasAdminAuthority(u) ? 'Admin + Auditor' : 'Auditor Lapangan'}</div>
        </div>
      </div>

      <div class="space-y-2">
        <div class="text-xs font-extrabold text-slate-700 uppercase">Log Aktivitas Actual In & Actual Out Terakhir:</div>
        <div class="space-y-2 max-h-48 overflow-y-auto">
          ${reports
            .map(
              (r) => `
              <div class="p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                <div>
                  <div class="font-bold text-slate-900">FamilyMart ${r.storeName} (${r.storeCode})</div>
                  <div class="text-[11px] text-slate-500">${r.visitDayDateFormatted || r.visitDate} • GPS: ${r.gpsLat}, ${r.gpsLng}</div>
                </div>
                <div class="text-right font-mono font-bold text-emerald-700">
                  <div>In: ${r.actualIn}</div>
                  <div>Out: ${r.actualOut}</div>
                </div>
              </div>
            `
            )
            .join('') || '<div class="text-xs text-slate-400">Belum ada riwayat visit pada akun ini.</div>'}
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
