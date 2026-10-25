// ============================================================================
// FMCU VISIT STORE REPORT - Data Store, Seed Data, RBAC & Integration Config
// ============================================================================

const STORAGE_KEYS = {
  USERS: 'fmcu_users_v1',
  STORES: 'fmcu_stores_v1',
  SCHEDULES: 'fmcu_schedules_v1',
  REPORTS: 'fmcu_reports_v1',
  ACTIVE_SESSION: 'fmcu_session_v1',
  ACTIVE_CHECKIN: 'fmcu_active_checkin_v1',
  DRAFT_REPORT: 'fmcu_draft_report_v1',
  SETTINGS: 'fmcu_settings_v1',
  ATTENDANCE_LOGS: 'fmcu_attendance_logs_v1'
};

// Standard Observation Finding Presets for Quick-Fill in Field Audit
const FINDING_PRESETS = [
  {
    id: 'preset-thawing-exp',
    label: 'Produk Thawing / Bahan Baku Expired',
    category: 'Food Safety & Expired',
    temuan: 'Thawingan roti goreng exp tgl 16.10.26 jam 04:00',
    kondisiIdeal: 'Semua produk thawingan yang tersimpan di chiller tidak ada yang expired',
    penyebab: 'Kurangnya ketelitian dan tidak ada double cek',
    dampak: '• Berisiko menurunkan kualitas dan keamanan pangan.\n• Dapat menyebabkan produk tidak layak konsumsi.\n• Berpotensi menimbulkan keluhan pelanggan dan kerugian operasional.',
    tindakanPerbaikan: 'Produk thawing yang exp di waste',
    hasil: 'Thawingan roti exp sudah di musnahkan'
  },
  {
    id: 'preset-sendok-takar',
    label: 'Sendok Takar / Alat Ukur Salah',
    category: 'Standar SOP & Alat Takar',
    temuan: 'Sendok takar salah (BBQ, crunchy choco)',
    kondisiIdeal: 'Penggunaan sendok takar harus sesuai dengan standar dan ketentuan masing-masing produk agar takaran bahan konsisten serta kualitas produk tetap terjaga.',
    penyebab: '• Sendok takar tidak sesuai dengan ketentuan yang berlaku.\n• Kurangnya pengawasan terhadap penggunaan alat takar saat operasional.',
    dampak: '• Rasa dan kualitas produk menjadi tidak konsisten.\n• Berpotensi menyebabkan pemborosan bahan baku dan kerugian operasional.',
    tindakanPerbaikan: '• Mengganti sendok takar BBQ dan Crunchy Choco sesuai standar yang ditetapkan.\n• Memberikan briefing kepada crew mengenai penggunaan sendok takar yang benar.\n• Melakukan pengecekan kesesuaian alat takar secara berkala.',
    hasil: 'Akan di monitoring visit berikutnya'
  },
  {
    id: 'preset-toilet-kotor',
    label: 'Kebersihan Toilet / Area Toko Kurang',
    category: 'Kebersihan & Sanitasi (QSC)',
    temuan: 'Toilet kotor',
    kondisiIdeal: 'Toilet bersih, kering, tidak berbau, serta dilengkapi dengan fasilitas pendukung (air bersih, sabun cuci tangan, tisu, dan tempat sampah)',
    penyebab: '• Pembersihan toilet tidak dilakukan sesuai jadwal.\n• Crew kurang konsisten dalam menjaga kebersihan toilet.\n• Kurangnya pengawasan dan pengecekan kebersihan secara berkala.',
    dampak: '• Menurunnya kenyamanan serta kepuasan pengguna\n• Menimbulkan bau tidak sedap dan ketidaknyamanan.\n• Berpotensi menjadi sumber penyebaran kuman dan bakteri.',
    tindakanPerbaikan: '• Segera membersihkan toilet, termasuk kloset, wastafel, lantai, dan area sekitarnya.\n• Melakukan pengecekan kebersihan toilet secara berkala sesuai jadwal.',
    hasil: 'Akan di monitoring visit berikutnya'
  },
  {
    id: 'preset-logbook',
    label: 'Pengisian Logbook Tidak Konsisten',
    category: 'Administrasi & Logbook',
    temuan: 'Logbook tidak konsisten',
    kondisiIdeal: 'Pengisian logbook wajib secara actual',
    penyebab: 'Kurangnya kedisiplinan atau kelalaian crew dalam melakukan pencatatan secara rutin',
    dampak: 'Menurunnya tingkat keterlacakan terhadap aktivitas atau kendala operasional yang terjadi',
    tindakanPerbaikan: 'Store leader briefing kembali mengenai pengisian logbook keseluruh crew terutama shift leader',
    hasil: 'Akan di monitoring visit berikutnya'
  },
  {
    id: 'preset-price-card',
    label: 'Price Card Belum Update',
    category: 'Merchandising & Price Card',
    temuan: 'Price card beverage / gondola belum update',
    kondisiIdeal: 'Seluruh price card pada rak dan chiller wajib sesuai dengan harga promo/reguler aktif di POS',
    penyebab: 'Kurangnya pengecekan pergantian periode promosi oleh shift leader',
    dampak: '• Potensi komplain pelanggan akibat selisih harga rak dan kasir.\n• Menurunkan kepercayaan konsumen terhadap toko.',
    tindakanPerbaikan: 'Cetak dan pasang price card terbaru serta lakukan verifikasi per lorong',
    hasil: 'Price card sudah diperbarui saat visit berlangsung'
  },
  {
    id: 'preset-rox',
    label: 'Penulisan Label ROX / Expired Salah',
    category: 'Food Safety & Expired',
    temuan: 'Penulisan ROX bahan baku / thawingan salah',
    kondisiIdeal: 'Label ROX wajib mencantumkan tanggal & jam buka, tanggal & jam expired sesuai umur simpan standar produk, serta paraf crew',
    penyebab: 'Crew belum memahami tabel shelf-life ROX dan kurang supervisi dari Store Leader',
    dampak: '• Risiko penggunaan bahan baku melewati masa layak pakai.\n• Kesalahan kontrol kualitas produk F&B.',
    tindakanPerbaikan: 'Mengganti label ROX sesuai tabel umur simpan standar dan melakukan refresh training ke crew',
    hasil: 'Label ROX telah diperbaiki'
  }
];

const DEFAULT_SETTINGS = {
  reportTitle: 'FMCU Visit Store Report',
  footerText: 'GENERATED BY FMCU VISIT WEB REPORT',
  caLink: 'https://tinyurl.com/store-caassignment',
  gasWebhookUrl: '',
  gdriveFolderId: '1FMCU_Visit_Report_Archive_Folder',
  gdriveFolderUrl: 'https://drive.google.com/drive/folders/1FMCU_Visit_Report_Archive_Folder',
  defaultCcEmails: 'fmcu@familymart.co.id, regional.manager@familymart.co.id, area.manager@familymart.co.id',
  autoWatermarkPhoto: true,
  autoSyncGDrive: false
};

const SEED_USERS = [
  {
    id: 'usr-1',
    username: 'rani',
    password: '123',
    name: 'Rani Ismawati',
    email: 'rani.ismawati@familymart.co.id',
    role: 'AUDITOR',
    roleBadge: 'Regional Bestie / Auditor',
    region: 'Regional 1 - Jakarta Barat & Pusat',
    phone: '0812-8890-4412',
    avatarColor: '#0099A6',
    active: true,
    authorities: ['create_visit', 'view_analytics', 'export_pdf', 'live_checkin'],
    lastLocation: {
      lat: -6.15682,
      lng: 106.75824,
      address: 'FamilyMart Taman Kota (0404), Kembangan, Jakarta Barat',
      updatedAt: '2026-10-25T14:20:00+07:00',
      status: 'ON_DUTY'
    }
  },
  {
    id: 'usr-2',
    username: 'admin',
    password: '123',
    name: 'Admin FMCU Center',
    email: 'admin.fmcu@familymart.co.id',
    role: 'SUPER_ADMIN',
    roleBadge: 'Super Admin FMCU',
    region: 'Head Office - National FMCU',
    phone: '0811-9000-1122',
    avatarColor: '#009944',
    active: true,
    authorities: [
      'create_visit',
      'view_analytics',
      'export_pdf',
      'live_checkin',
      'manage_schedule',
      'manage_stores',
      'manage_users',
      'manage_integrations'
    ],
    lastLocation: {
      lat: -6.22451,
      lng: 106.82942,
      address: 'FMCU Head Office, Kuningan, Jakarta Selatan',
      updatedAt: '2026-10-25T14:15:00+07:00',
      status: 'ONLINE'
    }
  },
  {
    id: 'usr-3',
    username: 'budi',
    password: '123',
    name: 'Budi Santoso',
    email: 'budi.santoso@familymart.co.id',
    role: 'AUDITOR',
    roleBadge: 'FMCU Senior Auditor',
    region: 'Regional 2 - Jakarta Selatan',
    phone: '0813-7712-9034',
    avatarColor: '#0284C7',
    active: true,
    authorities: ['create_visit', 'view_analytics', 'export_pdf', 'live_checkin'],
    lastLocation: {
      lat: -6.24124,
      lng: 106.79651,
      address: 'FamilyMart Bulungan (0215), Kebayoran Baru, Jakarta Selatan',
      updatedAt: '2026-10-25T13:50:00+07:00',
      status: 'ON_DUTY'
    }
  },
  {
    id: 'usr-4',
    username: 'siti',
    password: '123',
    name: 'Siti Rahmawati',
    email: 'siti.rahmawati@familymart.co.id',
    role: 'AUDITOR',
    roleBadge: 'Regional Bestie / Auditor',
    region: 'Regional 3 - Tangerang & BSD',
    phone: '0812-3344-5566',
    avatarColor: '#7C3AED',
    active: true,
    authorities: ['create_visit', 'view_analytics', 'export_pdf', 'live_checkin'],
    lastLocation: {
      lat: -6.30162,
      lng: 106.65314,
      address: 'FamilyMart BSD Green Office (0609), Tangerang Selatan',
      updatedAt: '2026-10-25T12:40:00+07:00',
      status: 'ONLINE'
    }
  },
  {
    id: 'usr-5',
    username: 'variz',
    password: '123',
    name: 'Variz Nurhalifah',
    email: 'variz.nurhalifah@familymart.co.id',
    role: 'ADMIN_SCHEDULE',
    roleBadge: 'Regional Manager (Admin Jadwal)',
    region: 'Regional 1 & 2 - Greater Jakarta',
    phone: '0811-2233-8899',
    avatarColor: '#D97706',
    active: true,
    authorities: ['view_analytics', 'export_pdf', 'manage_schedule', 'manage_stores'],
    lastLocation: {
      lat: -6.19502,
      lng: 106.82081,
      address: 'FamilyMart Grand Indonesia (0512), Jakarta Pusat',
      updatedAt: '2026-10-25T11:30:00+07:00',
      status: 'ONLINE'
    }
  }
];

const SEED_STORES = [
  {
    code: '0404',
    name: 'TAMAN KOTA',
    type: 'CVS',
    storeHead: 'Fauzan Muhammad Alvizan',
    areaManager: 'Muhamad Ismail',
    regionalManager: 'Variz Nurhalifah',
    email: 'tamankota.0404@familymart.co.id',
    address: 'Jl. Taman Kota Raya No. 4, Kembangan, Jakarta Barat',
    lat: -6.1568,
    lng: 106.7582,
    defaultCrew: [
      { role: 'Store Head', name: 'Fauzan Muhammad Alvizan', jobLevel: 'NS1' },
      { role: 'Shift Leader', name: 'Putra Prayoga', jobLevel: 'NS1' },
      { role: 'Crew Store 1', name: 'Aisyah', jobLevel: 'MG1' },
      { role: 'Crew Store 2', name: 'Nadira Rizky ananda', jobLevel: 'MG3' }
    ]
  },
  {
    code: '0215',
    name: 'BULUNGAN',
    type: 'CVS',
    storeHead: 'Hendra Wijaya',
    areaManager: 'Dedi Kurniawan',
    regionalManager: 'Variz Nurhalifah',
    email: 'bulungan.0215@familymart.co.id',
    address: 'Jl. Bulungan No. 18, Kebayoran Baru, Jakarta Selatan',
    lat: -6.2412,
    lng: 106.7965,
    defaultCrew: [
      { role: 'Store Head', name: 'Hendra Wijaya', jobLevel: 'NS2' },
      { role: 'Shift Leader', name: 'Rian Hidayat', jobLevel: 'NS1' },
      { role: 'Crew Store 1', name: 'Dewi Sartika', jobLevel: 'MG2' },
      { role: 'Crew Store 2', name: 'Fajar Ramadhan', jobLevel: 'MG1' }
    ]
  },
  {
    code: '0318',
    name: 'SUDIRMAN PARK',
    type: 'CVS',
    storeHead: 'Rizky Pratama',
    areaManager: 'Muhamad Ismail',
    regionalManager: 'Variz Nurhalifah',
    email: 'sudirmanpark.0318@familymart.co.id',
    address: 'Kawasan Rasuna / KH Mas Mansyur, Tanah Abang, Jakarta Pusat',
    lat: -6.2054,
    lng: 106.8172,
    defaultCrew: [
      { role: 'Store Head', name: 'Rizky Pratama', jobLevel: 'NS2' },
      { role: 'Shift Leader', name: 'Bagas Adi', jobLevel: 'NS1' },
      { role: 'Crew Store 1', name: 'Sinta Bella', jobLevel: 'MG2' },
      { role: 'Crew Store 2', name: 'Reza Pahlevi', jobLevel: 'MG1' }
    ]
  },
  {
    code: '0512',
    name: 'GRAND INDONESIA',
    type: 'CVS',
    storeHead: 'Lestari Putri',
    areaManager: 'Muhamad Ismail',
    regionalManager: 'Variz Nurhalifah',
    email: 'grandindonesia.0512@familymart.co.id',
    address: 'Jl. M.H. Thamrin No. 1, Menteng, Jakarta Pusat',
    lat: -6.1950,
    lng: 106.8208,
    defaultCrew: [
      { role: 'Store Head', name: 'Lestari Putri', jobLevel: 'NS2' },
      { role: 'Shift Leader', name: 'Aldi Taher', jobLevel: 'NS1' },
      { role: 'Crew Store 1', name: 'Nabila Putri', jobLevel: 'MG2' },
      { role: 'Crew Store 2', name: 'Ilham Saputra', jobLevel: 'MG1' }
    ]
  },
  {
    code: '0609',
    name: 'BSD GREEN OFFICE',
    type: 'FC',
    storeHead: 'Dimas Saputra',
    areaManager: 'Andi Hakim',
    regionalManager: 'Bambang Suryono',
    email: 'bsdgreen.0609@familymart.co.id',
    address: 'BSD Green Office Park, Cisauk, Tangerang Selatan',
    lat: -6.3016,
    lng: 106.6531,
    defaultCrew: [
      { role: 'Store Head', name: 'Dimas Saputra', jobLevel: 'NS2' },
      { role: 'Shift Leader', name: 'Yusuf Maulana', jobLevel: 'NS1' },
      { role: 'Crew Store 1', name: 'Tiara Andini', jobLevel: 'MG1' },
      { role: 'Crew Store 2', name: 'Wahyu Setiawan', jobLevel: 'MG2' }
    ]
  },
  {
    code: '0488',
    name: 'KELAPA GADING BOULEVARD',
    type: 'CVS',
    storeHead: 'Nadia Kusuma',
    areaManager: 'Dedi Kurniawan',
    regionalManager: 'Bambang Suryono',
    email: 'kgb.0488@familymart.co.id',
    address: 'Jl. Boulevard Raya Kelapa Gading, Jakarta Utara',
    lat: -6.1574,
    lng: 106.9082,
    defaultCrew: [
      { role: 'Store Head', name: 'Nadia Kusuma', jobLevel: 'NS1' },
      { role: 'Shift Leader', name: 'Kevin Sanjaya', jobLevel: 'NS1' },
      { role: 'Crew Store 1', name: 'Melati Daeva', jobLevel: 'MG2' },
      { role: 'Crew Store 2', name: 'Arif Budiman', jobLevel: 'MG1' }
    ]
  },
  {
    code: '0701',
    name: 'CIPETE RAYA',
    type: 'CVS',
    storeHead: 'Agus Setiawan',
    areaManager: 'Dedi Kurniawan',
    regionalManager: 'Variz Nurhalifah',
    email: 'cipete.0701@familymart.co.id',
    address: 'Jl. Cipete Raya No. 22, Cilandak, Jakarta Selatan',
    lat: -6.2768,
    lng: 106.8051,
    defaultCrew: [
      { role: 'Store Head', name: 'Agus Setiawan', jobLevel: 'NS1' },
      { role: 'Shift Leader', name: 'Gilang Dirga', jobLevel: 'NS1' },
      { role: 'Crew Store 1', name: 'Citra Kirana', jobLevel: 'MG1' },
      { role: 'Crew Store 2', name: 'Doni Tata', jobLevel: 'MG1' }
    ]
  }
];

const SEED_SCHEDULES = [
  {
    id: 'sch-101',
    storeCode: '0404',
    storeName: 'TAMAN KOTA',
    storeType: 'CVS',
    auditorId: 'usr-1',
    auditorName: 'Rani Ismawati',
    scheduledDate: '2026-10-16',
    shiftWindow: '09:00 - 15:00 WIB',
    priority: 'HIGH',
    auditFocus: 'Full QSC & FamiTrack Audit + Pengecekan Thawing & ROX',
    status: 'COMPLETED',
    actualIn: '09:12 WIB',
    actualOut: '14:35 WIB',
    actualLat: -6.15682,
    actualLng: 106.75824,
    reportId: 'rep-taman-kota-0404',
    assignedBy: 'Admin FMCU Center'
  },
  {
    id: 'sch-102',
    storeCode: '0318',
    storeName: 'SUDIRMAN PARK',
    storeType: 'CVS',
    auditorId: 'usr-1',
    auditorName: 'Rani Ismawati',
    scheduledDate: '2026-10-25',
    shiftWindow: '10:00 - 16:00 WIB',
    priority: 'HIGH',
    auditFocus: 'Audit Rutin Bulanan QSC, FamiTrack & Kebersihan Area FamiCafe',
    status: 'PENDING',
    actualIn: null,
    actualOut: null,
    actualLat: null,
    actualLng: null,
    reportId: null,
    assignedBy: 'Variz Nurhalifah'
  },
  {
    id: 'sch-103',
    storeCode: '0512',
    storeName: 'GRAND INDONESIA',
    storeType: 'CVS',
    auditorId: 'usr-1',
    auditorName: 'Rani Ismawati',
    scheduledDate: '2026-10-26',
    shiftWindow: '09:00 - 14:00 WIB',
    priority: 'NORMAL',
    auditFocus: 'Verifikasi Price Card Promo & Standar Alat Takar Beverage',
    status: 'PENDING',
    actualIn: null,
    actualOut: null,
    actualLat: null,
    actualLng: null,
    reportId: null,
    assignedBy: 'Admin FMCU Center'
  },
  {
    id: 'sch-104',
    storeCode: '0215',
    storeName: 'BULUNGAN',
    storeType: 'CVS',
    auditorId: 'usr-3',
    auditorName: 'Budi Santoso',
    scheduledDate: '2026-10-20',
    shiftWindow: '08:30 - 13:30 WIB',
    priority: 'HIGH',
    auditFocus: 'Audit QSC & Follow-up Corrective Action Temuan Minggu Lalu',
    status: 'COMPLETED',
    actualIn: '08:40 WIB',
    actualOut: '13:15 WIB',
    actualLat: -6.24124,
    actualLng: 106.79651,
    reportId: 'rep-bulungan-0215',
    assignedBy: 'Admin FMCU Center'
  },
  {
    id: 'sch-105',
    storeCode: '0609',
    storeName: 'BSD GREEN OFFICE',
    storeType: 'FC',
    auditorId: 'usr-4',
    auditorName: 'Siti Rahmawati',
    scheduledDate: '2026-10-22',
    shiftWindow: '09:30 - 15:00 WIB',
    priority: 'NORMAL',
    auditFocus: 'Inspeksi Food Safety, Chiller Logbook & Grooming Crew',
    status: 'COMPLETED',
    actualIn: '09:28 WIB',
    actualOut: '14:10 WIB',
    actualLat: -6.30162,
    actualLng: 106.65314,
    reportId: 'rep-bsd-0609',
    assignedBy: 'Admin FMCU Center'
  },
  {
    id: 'sch-106',
    storeCode: '0701',
    storeName: 'CIPETE RAYA',
    storeType: 'CVS',
    auditorId: 'usr-3',
    auditorName: 'Budi Santoso',
    scheduledDate: '2026-10-25',
    shiftWindow: '13:00 - 17:00 WIB',
    priority: 'NORMAL',
    auditFocus: 'Kunjungan QSC & Evaluasi SOP FamiCafe',
    status: 'PENDING',
    actualIn: null,
    actualOut: null,
    actualLat: null,
    actualLng: null,
    reportId: null,
    assignedBy: 'Variz Nurhalifah'
  }
];

function buildSeedReports() {
  const PA = window.PDF_ASSETS || {};
  return [
    {
      id: 'rep-taman-kota-0404',
      scheduleId: 'sch-101',
      reportTitle: 'FMCU Visit Store Report',
      auditorId: 'usr-1',
      auditorName: 'Rani Ismawati',
      visitDate: '2026-10-16',
      visitDateFormatted: '16 Okt 2026',
      visitDayDateFormatted: 'Jumat, 16 Okt 2026',
      storeCode: '0404',
      storeName: 'TAMAN KOTA',
      storeType: 'CVS',
      storeHead: 'Fauzan Muhammad Alvizan',
      areaManager: 'Muhamad Ismail',
      regionalManager: 'Variz Nurhalifah',
      storeEmail: 'tamankota.0404@familymart.co.id',
      actualIn: '09:12 WIB',
      actualOut: '14:35 WIB',
      durationMinutes: 323,
      gpsLat: -6.15682,
      gpsLng: 106.75824,
      gpsAddress: 'TAMAN KOTA (FMI) - Kembangan, Jakarta Barat',
      qscScore: 84,
      emailSent: true,
      gdriveSynced: true,
      crewList: [
        { role: 'Store Head', name: 'Fauzan Muhammad Alvizan', jobLevel: 'NS1' },
        { role: 'Shift Leader', name: 'Putra Prayoga', jobLevel: 'NS1' },
        { role: 'Crew Store 1', name: 'Aisyah', jobLevel: 'MG1' },
        { role: 'Crew Store 2', name: 'Nadira Rizky ananda', jobLevel: 'MG3' }
      ],
      qscPhotos: [
        {
          id: 'qsc-1',
          caption: 'Foto QSC / Famitrack 1',
          dataUrl: PA.sampleQsc1 || ''
        },
        {
          id: 'qsc-2',
          caption: 'Foto QSC / Famitrack 2',
          dataUrl: PA.sampleQsc2 || ''
        }
      ],
      observations: [
        {
          id: 'obs-1',
          category: 'Food Safety & Expired',
          temuan: 'Thawingan roti goreng exp tgl 16.10.26 jam 04:00',
          kondisiIdeal: 'Semua produk thawingan yang tersimpan di chiller tidak ada yang expired',
          penyebab: 'Kurangnya ketelitian dan tidak ada double cek',
          dampak: '• Berisiko menurunkan kualitas dan keamanan pangan.\n• Dapat menyebabkan produk tidak layak konsumsi.\n• Berpotensi menimbulkan keluhan pelanggan dan kerugian operasional.',
          tindakanPerbaikan: 'Produk thawing yang exp di waste',
          hasil: 'Thawingan roti exp sudah di musnahkan',
          deadline: '2026-10-16',
          deadlineFormatted: '16 Okt 2026',
          status: 'CLOSED'
        },
        {
          id: 'obs-2',
          category: 'Standar SOP & Alat Takar',
          temuan: 'Sendok takar salah (BBQ, crunchy choco)',
          kondisiIdeal: 'Penggunaan sendok takar harus sesuai dengan standar dan ketentuan masing-masing produk agar takaran bahan konsisten serta kualitas produk tetap terjaga.',
          penyebab: '• Sendok takar tidak sesuai dengan ketentuan yang berlaku.\n• Kurangnya pengawasan terhadap penggunaan alat takar saat operasional.',
          dampak: '• Rasa dan kualitas produk menjadi tidak konsisten.\n• Berpotensi menyebabkan pemborosan bahan baku dan kerugian operasional.',
          tindakanPerbaikan: '• Mengganti sendok takar BBQ dan Crunchy Choco sesuai standar yang ditetapkan.\n• Memberikan briefing kepada crew mengenai penggunaan sendok takar yang benar.\n• Melakukan pengecekan kesesuaian alat takar secara berkala.',
          hasil: 'Akan di monitoring visit berikutnya',
          deadline: '2026-10-28',
          deadlineFormatted: '28 Okt 2026',
          status: 'OPEN'
        },
        {
          id: 'obs-3',
          category: 'Kebersihan & Sanitasi (QSC)',
          temuan: 'Toilet kotor',
          kondisiIdeal: 'Toilet bersih, kering, tidak berbau, serta dilengkapi dengan fasilitas pendukung (air bersih, sabun cuci tangan, tisu, dan tempat sampah)',
          penyebab: '• Pembersihan toilet tidak dilakukan sesuai jadwal.\n• Crew kurang konsisten dalam menjaga kebersihan toilet.\n• Kurangnya pengawasan dan pengecekan kebersihan secara berkala.',
          dampak: '• Menurunnya kenyamanan serta kepuasan pengguna\n• Menimbulkan bau tidak sedap dan ketidaknyamanan.\n• Berpotensi menjadi sumber penyebaran kuman dan bakteri.',
          tindakanPerbaikan: '• Segera membersihkan toilet, termasuk kloset, wastafel, lantai, dan area sekitarnya.\n• Melakukan pengecekan kebersihan toilet secara berkala sesuai jadwal.',
          hasil: 'Akan di monitoring visit berikutnya',
          deadline: '2026-10-28',
          deadlineFormatted: '28 Okt 2026',
          status: 'OPEN'
        },
        {
          id: 'obs-4',
          category: 'Administrasi & Logbook',
          temuan: 'Logbook tidak konsisten',
          kondisiIdeal: 'Pengisian logbook wajib secara actual',
          penyebab: 'Kurangnya kedisiplinan atau kelalaian crew dalam melakukan pencatatan secara rutin',
          dampak: 'Menurunnya tingkat keterlacakan terhadap aktivitas atau kendala operasional yang terjad',
          tindakanPerbaikan: 'Store leader brifing kembali mengenai pengisian logbook keseluruh crew terutama shift leader',
          hasil: 'Akan di monitoring visit berikutnya',
          deadline: '2026-10-28',
          deadlineFormatted: '28 Okt 2026',
          status: 'OPEN'
        }
      ],
      evidencePhotos: [
        {
          id: 'ev-1',
          description: 'Measuring yang sudah di gunakan tidak langsung di cuci ketika tidak ada pembelian berikutnya',
          dataUrl: PA.sampleEv1 || ''
        },
        {
          id: 'ev-2',
          description: 'Logbook tidak konsisten',
          dataUrl: PA.sampleEv2 || ''
        },
        {
          id: 'ev-3',
          description: 'Price card belum update',
          dataUrl: PA.sampleEv3 || ''
        },
        {
          id: 'ev-4',
          description: 'Toilet kotor',
          dataUrl: PA.sampleEv4 || ''
        },
        {
          id: 'ev-5',
          description: 'Penulisan rox salah',
          dataUrl: PA.sampleEv5 || ''
        },
        {
          id: 'ev-6',
          description: 'Thawingan roti goreng exp tgl 16.10.26 jam 04:00',
          dataUrl: PA.sampleEv6 || ''
        },
        {
          id: 'ev-7',
          description: 'Sendok takar bubuk BBQ salah',
          dataUrl: PA.sampleEv7 || ''
        },
        {
          id: 'ev-8',
          description: 'Choco crunchy exp tgl 13.10.26 jam 13:15',
          dataUrl: PA.sampleEv8 || ''
        },
        {
          id: 'ev-9',
          description: 'Sendok takar crunchy choco salah',
          dataUrl: PA.sampleEv9 || ''
        },
        {
          id: 'ev-10',
          description: 'Penulisan rox thawingan cheesebokki salah',
          dataUrl: PA.sampleEv10 || ''
        }
      ],
      caLink: 'https://tinyurl.com/store-caassignment',
      createdAt: '2026-10-16T14:35:00+07:00'
    },
    {
      id: 'rep-bulungan-0215',
      scheduleId: 'sch-104',
      reportTitle: 'FMCU Visit Store Report',
      auditorId: 'usr-3',
      auditorName: 'Budi Santoso',
      visitDate: '2026-10-20',
      visitDateFormatted: '20 Okt 2026',
      visitDayDateFormatted: 'Selasa, 20 Okt 2026',
      storeCode: '0215',
      storeName: 'BULUNGAN',
      storeType: 'CVS',
      storeHead: 'Hendra Wijaya',
      areaManager: 'Dedi Kurniawan',
      regionalManager: 'Variz Nurhalifah',
      storeEmail: 'bulungan.0215@familymart.co.id',
      actualIn: '08:40 WIB',
      actualOut: '13:15 WIB',
      durationMinutes: 275,
      gpsLat: -6.24124,
      gpsLng: 106.79651,
      gpsAddress: 'BULUNGAN (FMI) - Kebayoran Baru, Jakarta Selatan',
      qscScore: 89,
      emailSent: true,
      gdriveSynced: true,
      crewList: [
        { role: 'Store Head', name: 'Hendra Wijaya', jobLevel: 'NS2' },
        { role: 'Shift Leader', name: 'Rian Hidayat', jobLevel: 'NS1' },
        { role: 'Crew Store 1', name: 'Dewi Sartika', jobLevel: 'MG2' },
        { role: 'Crew Store 2', name: 'Fajar Ramadhan', jobLevel: 'MG1' }
      ],
      qscPhotos: [
        { id: 'qsc-b1', caption: 'Foto QSC / Famitrack 1', dataUrl: PA.sampleQsc1 || '' },
        { id: 'qsc-b2', caption: 'Foto QSC / Famitrack 2', dataUrl: PA.sampleQsc2 || '' }
      ],
      observations: [
        {
          id: 'obs-b1',
          category: 'Merchandising & Price Card',
          temuan: 'Price card minuman chiller pintu 2 belum diupdate sesuai harga promo',
          kondisiIdeal: 'Seluruh price card sesuai dengan harga promo aktif di sistem POS',
          penyebab: 'Terlewat saat pergantian materi promosi mingguan',
          dampak: '• Potensi komplain pelanggan saat transaksi di kasir.',
          tindakanPerbaikan: 'Mencetak dan memasang price card terbaru pada chiller pintu 2',
          hasil: 'Sudah diperbaiki langsung saat visit',
          deadline: '2026-10-22',
          deadlineFormatted: '22 Okt 2026',
          status: 'CLOSED'
        },
        {
          id: 'obs-b2',
          category: 'Administrasi & Logbook',
          temuan: 'Pencatatan suhu showcase FamiCafe shift pagi belum terisi',
          kondisiIdeal: 'Logbook suhu wajib diisi secara aktual setiap pergantian shift',
          penyebab: 'Crew sibuk melayani antrean pagi dan lupa mencatat',
          dampak: '• Keterlacakan histori suhu penyimpanan tidak lengkap.',
          tindakanPerbaikan: 'Shift leader melakukan pengecekan logbook setiap jam 10:00 dan 16:00',
          hasil: 'Akan di monitoring visit berikutnya',
          deadline: '2026-10-27',
          deadlineFormatted: '27 Okt 2026',
          status: 'OPEN'
        }
      ],
      evidencePhotos: [
        { id: 'ev-b1', description: 'Price card belum update pada rak promosi', dataUrl: PA.sampleEv3 || '' },
        { id: 'ev-b2', description: 'Logbook suhu belum diisi pada shift pagi', dataUrl: PA.sampleEv2 || '' }
      ],
      caLink: 'https://tinyurl.com/store-caassignment',
      createdAt: '2026-10-20T13:15:00+07:00'
    },
    {
      id: 'rep-bsd-0609',
      scheduleId: 'sch-105',
      reportTitle: 'FMCU Visit Store Report',
      auditorId: 'usr-4',
      auditorName: 'Siti Rahmawati',
      visitDate: '2026-10-22',
      visitDateFormatted: '22 Okt 2026',
      visitDayDateFormatted: 'Kamis, 22 Okt 2026',
      storeCode: '0609',
      storeName: 'BSD GREEN OFFICE',
      storeType: 'FC',
      storeHead: 'Dimas Saputra',
      areaManager: 'Andi Hakim',
      regionalManager: 'Bambang Suryono',
      storeEmail: 'bsdgreen.0609@familymart.co.id',
      actualIn: '09:28 WIB',
      actualOut: '14:10 WIB',
      durationMinutes: 282,
      gpsLat: -6.30162,
      gpsLng: 106.65314,
      gpsAddress: 'BSD GREEN OFFICE (FMI) - Cisauk, Tangerang Selatan',
      qscScore: 86,
      emailSent: true,
      gdriveSynced: true,
      crewList: [
        { role: 'Store Head', name: 'Dimas Saputra', jobLevel: 'NS2' },
        { role: 'Shift Leader', name: 'Yusuf Maulana', jobLevel: 'NS1' },
        { role: 'Crew Store 1', name: 'Tiara Andini', jobLevel: 'MG1' },
        { role: 'Crew Store 2', name: 'Wahyu Setiawan', jobLevel: 'MG2' }
      ],
      qscPhotos: [
        { id: 'qsc-c1', caption: 'Foto QSC / Famitrack 1', dataUrl: PA.sampleQsc1 || '' },
        { id: 'qsc-c2', caption: 'Foto QSC / Famitrack 2', dataUrl: PA.sampleQsc2 || '' }
      ],
      observations: [
        {
          id: 'obs-c1',
          category: 'Food Safety & Expired',
          temuan: 'Penulisan ROX saus keju tidak mencantumkan jam buka',
          kondisiIdeal: 'Label ROX wajib mencantumkan tanggal & jam buka serta tanggal & jam expired dengan lengkap',
          penyebab: 'Kurang ketelitian crew saat persiapan bahan pagi hari',
          dampak: '• Sulit memverifikasi jam kadaluarsa bahan baku secara akurat.',
          tindakanPerbaikan: 'Memperbarui label ROX dan briefing ulang seluruh crew F&B',
          hasil: 'Label ROX sudah diganti saat visit',
          deadline: '2026-10-25',
          deadlineFormatted: '25 Okt 2026',
          status: 'CLOSED'
        },
        {
          id: 'obs-c2',
          category: 'Standar SOP & Alat Takar',
          temuan: 'Gelas ukur (measuring glass) tidak langsung dicuci setelah digunakan',
          kondisiIdeal: 'Peralatan racik minuman wajib dibilas dan bersih setelah digunakan',
          penyebab: 'Crew menunda pencucian alat setelah jam sibuk makan siang',
          dampak: '• Risiko kontaminasi silang rasa antar minuman dan kesan kurang higienis.',
          tindakanPerbaikan: 'Menerapkan aturan clean-as-you-go di area bar FamiCafe',
          hasil: 'Akan di monitoring visit berikutnya',
          deadline: '2026-10-29',
          deadlineFormatted: '29 Okt 2026',
          status: 'OPEN'
        },
        {
          id: 'obs-c3',
          category: 'Kebersihan & Sanitasi (QSC)',
          temuan: 'Area wastafel dan tisu toilet kehabisan stok saat jam makan siang',
          kondisiIdeal: 'Sabun cuci tangan dan tisu wajib selalu tersedia dan dicek setiap 2 jam',
          penyebab: 'Checklist pemeriksaan toilet belum dijalankan tepat waktu',
          dampak: '• Menurunkan kenyamanan pelanggan yang berkunjung.',
          tindakanPerbaikan: 'Refill tisu & sabun segera serta disiplin cek checklist kebersihan',
          hasil: 'Sudah direfill saat visit',
          deadline: '2026-10-26',
          deadlineFormatted: '26 Okt 2026',
          status: 'CLOSED'
        }
      ],
      evidencePhotos: [
        { id: 'ev-c1', description: 'Measuring yang sudah digunakan tidak langsung dicuci', dataUrl: PA.sampleEv1 || '' },
        { id: 'ev-c2', description: 'Penulisan ROX tidak mencantumkan jam buka', dataUrl: PA.sampleEv5 || '' }
      ],
      caLink: 'https://tinyurl.com/store-caassignment',
      createdAt: '2026-10-22T14:10:00+07:00'
    }
  ];
}

const SEED_ATTENDANCE_LOGS = [
  {
    id: 'att-1',
    userId: 'usr-1',
    userName: 'Rani Ismawati',
    storeCode: '0404',
    storeName: 'TAMAN KOTA',
    date: '2026-10-16',
    actualIn: '09:12 WIB',
    actualOut: '14:35 WIB',
    latIn: -6.15682,
    lngIn: 106.75824,
    latOut: -6.15679,
    lngOut: 106.75828,
    distanceMeters: 14,
    status: 'CHECKED_OUT'
  },
  {
    id: 'att-2',
    userId: 'usr-3',
    userName: 'Budi Santoso',
    storeCode: '0215',
    storeName: 'BULUNGAN',
    date: '2026-10-20',
    actualIn: '08:40 WIB',
    actualOut: '13:15 WIB',
    latIn: -6.24124,
    lngIn: 106.79651,
    latOut: -6.24121,
    lngOut: 106.79649,
    distanceMeters: 9,
    status: 'CHECKED_OUT'
  },
  {
    id: 'att-3',
    userId: 'usr-4',
    userName: 'Siti Rahmawati',
    storeCode: '0609',
    storeName: 'BSD GREEN OFFICE',
    date: '2026-10-22',
    actualIn: '09:28 WIB',
    actualOut: '14:10 WIB',
    latIn: -6.30162,
    lngIn: 106.65314,
    latOut: -6.30160,
    lngOut: 106.65318,
    distanceMeters: 11,
    status: 'CHECKED_OUT'
  }
];

// Data Store Helper Object
window.FMCUData = {
  FINDING_PRESETS,

  init() {
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(SEED_USERS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.STORES)) {
      localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(SEED_STORES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SCHEDULES)) {
      localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(SEED_SCHEDULES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.REPORTS)) {
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(buildSeedReports()));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ATTENDANCE_LOGS)) {
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(SEED_ATTENDANCE_LOGS));
    }
  },

  resetToSeed() {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(SEED_USERS));
    localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(SEED_STORES));
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(SEED_SCHEDULES));
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(buildSeedReports()));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(SEED_ATTENDANCE_LOGS));
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_CHECKIN);
    localStorage.removeItem(STORAGE_KEYS.DRAFT_REPORT);
  },

  getUsers() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  },
  saveUsers(users) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  },

  getStores() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.STORES) || '[]');
  },
  saveStores(stores) {
    localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(stores));
  },

  getSchedules() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SCHEDULES) || '[]');
  },
  saveSchedules(schedules) {
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
  },

  getReports() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.REPORTS) || '[]');
  },
  saveReports(reports) {
    try {
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
      return true;
    } catch (err) {
      console.warn('LocalStorage quota warning, trimming old base64 images if needed:', err);
      return false;
    }
  },

  getSettings() {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}') };
  },
  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  getAttendanceLogs() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE_LOGS) || '[]');
  },
  saveAttendanceLogs(logs) {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(logs));
  },

  getSession() {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const freshUser = this.getUsers().find(u => u.id === parsed.id);
      return freshUser || parsed;
    } catch {
      return null;
    }
  },
  setSession(user) {
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    } else {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(user));
    }
  },

  getActiveCheckIn() {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_CHECKIN);
    return raw ? JSON.parse(raw) : null;
  },
  setActiveCheckIn(checkInData) {
    if (!checkInData) {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_CHECKIN);
    } else {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CHECKIN, JSON.stringify(checkInData));
    }
  }
};
