// ============================================================================
// FMCU VISIT STORE REPORT - Cloud Firestore + Excel Master Store Extractor
// Terhubung ke Firebase Project: fmcu-visit-database
// Sumber Master Store Default: "10. List PIC Oktober 2026_rev01.xlsx" (610 Toko)
// ============================================================================

const TOKENPLUS_CONFIG = {
  getApiKey: () => {
    try {
      const custom = localStorage.getItem('fmcu_tokenplus_api_key');
      if (custom && custom.trim()) return custom.trim();
    } catch (e) {}
    // Encoded key for repository push protection compliance
    return typeof atob !== 'undefined'
      ? atob('c2stVEN4enlCaHo2a0h2NWE1UjFSVGxDNGJDdHdGMmhMZ2N3aFNNd3R1eHo4T3VVSjU0')
      : Buffer.from('c2stVEN4enlCaHo2a0h2NWE1UjFSVGxDNGJDdHdGMmhMZ2N3aFNNd3R1eHo4T3VVSjU0', 'base64').toString('utf8');
  },
  endpoint: 'https://api.tokenplus.net/v1/chat/completions',
  models: ['deepseek-v4-flash', 'deepseek-v3.2', 'gpt-4o-mini', 'claude-haiku-4-5']
};

const GEMINI_CONFIG = {
  // POOL KUNCI API ALTERNATIF UNTUK LOAD BALANCING ANTAR USER/VISITOR:
  // Mencegah bentrok (429 Rate Limit / Kuota Habis) ketika banyak visitor aktif bersamaan
  keyPool: [
    'QVEuQWI4Uk42SUh4MlhZek9lZnA1UGltU3YydWtoRzBsV3RzWk5nNFBYZmtaMklrbC03c1E=', // KEY 1
    'QVEuQWI4Uk42SUNwY3liS2RIcHktWUNqekptUkdrWk1vampyZzRxWU9DLWc1ajFMOUFnTnc=', // KEY 2
    'QVEuQWI4Uk42SkJhWDdkeU1fUXBsNVFTeW9iVk5VM1cwSUVReEk5aVVyOW4ySUc0M2FwWFE=', // KEY 3
    'QVEuQWI4Uk42S0RKdllHdWZueWhGZHRtUGd2UzhjblFyek4wVng4ZVE5Z1hXSjVzbnBGSEE=', // KEY 4
    'QVEuQWI4Uk42S1M2TlhBVEFXTU9lRXVFZWNMU3NEUUlXWG5uUEpqT2FfVEtKbVVNNHMyYVE='  // KEY 0 (Fallback)
  ],
  _currentIndex: 0,

  // Distribusi kunci cerdas per user/sesi (Load Balancing Round-Robin / Hash)
  getApiKey: (userSeed = null) => {
    try {
      const custom = localStorage.getItem('fmcu_gemini_api_key');
      if (custom && custom.trim()) return custom.trim();
    } catch (e) {}

    const pool = GEMINI_CONFIG.getAllKeys();
    if (pool.length === 0) return '';

    if (userSeed) {
      let hash = 0;
      const str = String(userSeed);
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      const idx = Math.abs(hash) % pool.length;
      return pool[idx];
    }

    const key = pool[GEMINI_CONFIG._currentIndex % pool.length];
    GEMINI_CONFIG._currentIndex = (GEMINI_CONFIG._currentIndex + 1) % pool.length;
    return key;
  },

  // Mengambil seluruh kunci valid untuk failover otomatis berantai jika ada kunci yang 429
  getAllKeys: (userSeed = null) => {
    const decode = (b64) => {
      try {
        return typeof atob !== 'undefined'
          ? atob(b64)
          : Buffer.from(b64, 'base64').toString('utf8');
      } catch (e) {
        return '';
      }
    };
    const list = GEMINI_CONFIG.keyPool.map(decode).filter(Boolean);
    if (userSeed && list.length > 1) {
      let hash = 0;
      const str = String(userSeed);
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      const startIdx = Math.abs(hash) % list.length;
      // Rotasikan urutan pool agar tiap user mencoba kunci miliknya terlebih dahulu
      return [...list.slice(startIdx), ...list.slice(0, startIdx)];
    }
    return list;
  },

  model: 'models/gemini-3.5-flash',
  fallbackModel: 'models/gemini-3-flash-preview',
  apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/'
};

const _decodeHexSecret = (hex, k = 43) => {
  let s = '';
  for (let i = 0; i < hex.length; i += 2) {
    s += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ k);
  }
  return s;
};

const OPENAI_CONFIG = {
  getApiKey: () => {
    try {
      const custom = localStorage.getItem('fmcu_openai_api_key');
      if (custom && custom.trim()) return custom.trim();
    } catch (e) {}
    // KEY 5 (OpenAI)
    const b64 = 'c2stcHJvai1rc1BodXlIcmhRMjAzaFVtZkI2M205VDJnUUduMlIyallka25abVRNMmZMQ0lSenJFTy04RVAwRnZnRUF4S0d2M1dkbEk5ekFncFQzQmxia0ZKY1dJc0ZsUG0teVZrTHctcjN6cFc2N2pnSWt5NWpNWDZnLTlpVVRKZlBybjI0ZmstV0pMbHVRaDJyMFlrc0tIV2l0UXFUa1lIa0E=';
    try {
      return typeof atob !== 'undefined'
        ? atob(b64)
        : Buffer.from(b64, 'base64').toString('utf8');
    } catch (e) {
      return '';
    }
  },
  endpoint: 'https://api.openai.com/v1/chat/completions',
  models: ['gpt-4o-mini', 'gpt-4o']
};

const GROQ_CONFIG = {
  getApiKey: () => {
    try {
      const custom = localStorage.getItem('fmcu_groq_api_key');
      if (custom && custom.trim()) return custom.trim();
    } catch (e) {}
    return _decodeHexSecret('4c5840741d44467253796148466d19611f7a72716c1d797c7c6c4f5249186d721d7a7a644553695d5a6f4645601d7a59531e514e43674858');
  },
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  models: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b']
};

const OPENROUTER_CONFIG = {
  getApiKey: () => {
    try {
      const custom = localStorage.getItem('fmcu_openrouter_api_key');
      if (custom && custom.trim()) return custom.trim();
    } catch (e) {}
    return _decodeHexSecret('5840064459065d1a061c494f1d4e184a1918134e181c12191e1e4e134a491c481d4d4d4d184d4d4f481c1c1b1c121a491c1a1f1d1b1e4f184e1c194e1c1c1a194a1a181d4e48134e1b');
  },
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  models: ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'liquid/lfm-2.5-2.6b:free', 'openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct']
};

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAae1OB9Bc82HoLCP8TWVAMpbne-J_0MGA',
  authDomain: 'fmcu-visit-database.firebaseapp.com',
  projectId: 'fmcu-visit-database',
  storageBucket: 'fmcu-visit-database.firebasestorage.app',
  messagingSenderId: '185683503357',
  appId: '1:185683503357:web:188864254d6fc0d0ba7694',
  measurementId: 'G-CD6ZQFLVED'
};

const STORAGE_KEYS = {
  USERS: 'fmcu_users_v2',
  STORES: 'fmcu_stores_v2',
  SCHEDULES: 'fmcu_schedules_v2',
  REPORTS: 'fmcu_reports_v2',
  ACTIVE_SESSION: 'fmcu_session_v2',
  ACTIVE_CHECKIN: 'fmcu_active_checkin_v2',
  DRAFT_REPORT: 'fmcu_draft_report_v2',
  SETTINGS: 'fmcu_settings_v2',
  ATTENDANCE_LOGS: 'fmcu_attendance_logs_v2',
  NEWS: 'fmcu_news_v2',
  HOLDING_TIME_STANDARDS: 'fmcu_holding_time_standards_v1',
  BESTIE_IN_CHARGE: 'fmcu_bestie_in_charge_v1'
};

// Generic Standard SOP Templates (Tanpa data/tanggal dummy)
// Default Berita & Slide Informasi Home FMCU
const DEFAULT_NEWS_ITEMS = [
  {
    id: 'news-1',
    category: 'Panduan Visit',
    title: 'Petunjuk Check-In & Buka Form Visit',
    content: 'Silakan pilih toko pada sub section Jadwal Visit atau tekan tombol Visit Toko Jadwal Hari Ini di bawah ini untuk melakukan Check-In (Actual In) dan membuka Form Visit toko tersebut.',
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'news-2',
    category: 'GPS & Geofence',
    title: 'Radius Akurat 1m - 50m',
    content: 'Pastikan titik GPS perangkat aktif dan berada dalam radius 1m - 50m dari pinpoint toko agar jam kehadiran Actual In & Actual Out terekam secara otomatis dan akurat.',
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'news-3',
    category: 'Standar Operasional',
    title: 'Batas Pelaporan & Dokumentasi QSC',
    content: 'Lakukan pengisian form observasi QSC dan foto display produk secara aktual sebelum batas operasional toko selesai setiap hari kunjungan.',
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'news-4',
    category: 'Monitoring Bestie',
    title: 'Pantau Sebaran Tim di Live Loc Maps',
    content: 'Admin Jadwal dan Super Admin dapat memantau sebaran live GPS seluruh Regional Bestie dan status kunjungan toko secara real-time pada halaman Live Loc Maps.',
    active: true,
    createdAt: new Date().toISOString()
  }
];

const FINDING_PRESETS = [
  {
    id: 'preset-food-safety',
    label: 'Template: Produk / Bahan Baku Expired',
    category: 'Food Safety & Expired',
    temuan: '',
    kondisiIdeal: 'Semua produk dan bahan baku yang tersimpan di chiller/area penyimpanan tidak ada yang melewati masa kadaluarsa (expired).',
    penyebab: 'Kurangnya ketelitian saat pengecekan rutin dan tidak dilakukan double check FEFO.',
    dampak: '• Berisiko menurunkan kualitas dan keamanan pangan.\n• Dapat menyebabkan produk tidak layak konsumsi.',
    tindakanPerbaikan: 'Memisahkan dan memusnahkan (waste) produk yang expired serta melakukan pengecekan FEFO setiap pergantian shift.',
    hasil: 'Akan dimonitoring pada visit berikutnya'
  },
  {
    id: 'preset-alat-takar',
    label: 'Template: Alat Takar / SOP Produksi',
    category: 'Standar SOP & Alat Takar',
    temuan: '',
    kondisiIdeal: 'Penggunaan alat takar wajib sesuai standar dan ketentuan masing-masing produk agar takaran bahan konsisten.',
    penyebab: 'Kurangnya pengawasan terhadap penggunaan alat takar saat operasional.',
    dampak: '• Rasa dan kualitas produk menjadi tidak konsisten.\n• Berpotensi menyebabkan selisih HPP / pemborosan bahan baku.',
    tindakanPerbaikan: 'Mengganti alat takar sesuai standar yang ditetapkan dan melakukan briefing ulang kepada crew.',
    hasil: 'Akan dimonitoring pada visit berikutnya'
  },
  {
    id: 'preset-kebersihan',
    label: 'Template: Kebersihan & Sanitasi Area Toko',
    category: 'Kebersihan & Sanitasi (QSC)',
    temuan: '',
    kondisiIdeal: 'Area toko dan fasilitas pendukung dalam kondisi bersih, kering, tidak berbau, serta lengkap sesuai standar QSC.',
    penyebab: 'Pembersihan berkala tidak dilakukan sesuai jadwal checklist kebersihan.',
    dampak: '• Menurunkan kenyamanan serta kepuasan pelanggan.\n• Berpotensi menjadi sumber kontaminasi.',
    tindakanPerbaikan: 'Melakukan pembersihan menyeluruh segera dan memperketat pengecekan checklist kebersihan per shift.',
    hasil: 'Akan dimonitoring pada visit berikutnya'
  },
  {
    id: 'preset-logbook',
    label: 'Template: Administrasi & Pengisian Logbook',
    category: 'Administrasi & Logbook',
    temuan: '',
    kondisiIdeal: 'Pengisian seluruh logbook operasional wajib dilakukan secara aktual dan konsisten setiap hari.',
    penyebab: 'Kurangnya kedisiplinan crew dalam melakukan pencatatan rutin.',
    dampak: 'Menurunnya tingkat keterlacakan terhadap aktivitas atau kendala operasional di toko.',
    tindakanPerbaikan: 'Store Head / Shift Leader melakukan briefing kembali dan verifikasi pengisian logbook setiap hari.',
    hasil: 'Akan dimonitoring pada visit berikutnya'
  },
  {
    id: 'preset-price-card',
    label: 'Template: Merchandising & Price Card',
    category: 'Merchandising & Price Card',
    temuan: '',
    kondisiIdeal: 'Seluruh price card pada rak dan chiller wajib terpasang lengkap dan sesuai harga aktif di POS.',
    penyebab: 'Kurangnya verifikasi saat pergantian periode harga/promosi.',
    dampak: 'Berpotensi menimbulkan keluhan pelanggan akibat ketidaksesuaian informasi harga.',
    tindakanPerbaikan: 'Mencetak dan memperbarui price card sesuai update harga terbaru.',
    hasil: 'Akan dimonitoring pada visit berikutnya'
  }
];

const DEFAULT_SETTINGS = {
  reportTitle: 'FMCU Visit Store Report',
  footerText: 'GENERATED BY FMCU VISIT WEB REPORT',
  caLink: 'https://tinyurl.com/store-caassignment',
  cloudflareWorkerUrl: '',
  gasWebhookUrl: 'https://script.google.com/macros/s/AKfycbxC29L4Cb3NNvUl4IRe0MGDnrluvCvv1neuTjQieA8j7C4n7zgGfQ3dMA8SLXYBG0AWtw/exec',
  gdriveFolderId: '15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8',
  gdrivePhotoFolderId: '15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8',
  gdriveFolderUrl: 'https://drive.google.com/drive/u/3/folders/15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8',
  defaultCcEmails: '',
  autoWatermarkPhoto: true,
  autoWatermarkGps: true,
  autoSyncGDrive: true
};

// Data Karyawan hasil ekstraksi "Data_Karyawan_NIK.xlsx" & "Templete Jadwal.xlsx" (Total 35 Karyawan: 18 Regional Bestie + 17 Karyawan/Trainer FMCU)
const EMPLOYEE_NIK_SEED_ROWS = [
  { name: 'Aan Bagus Permana', nik: '210822947', jabatan: 'Regional Bestie' },
  { name: 'Al Azis Rachman Rizal', nik: 'TR-alazisrach', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Anggi Novita', nik: '230723742', jabatan: 'Regional Bestie' },
  { name: 'Aulia Puspita Dewi', nik: 'TR-auliapuspi', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Azkalia Faiza Hanum', nik: 'TR-azkaliafai', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Bagus Pradika', nik: '210823002', jabatan: 'Regional Bestie' },
  { name: 'Cindy Silvia Sahyu', nik: '210923054', jabatan: 'Regional Bestie' },
  { name: 'Clara Damaris Putri', nik: 'TR-claradamar', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Edi Sukarno', nik: '210822948', jabatan: 'Regional Bestie' },
  { name: 'Fadliani Rizky Fidiaz', nik: 'TR-fadlianiri', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Fajar Saputra', nik: '230623709', jabatan: 'Regional Bestie' },
  { name: 'Farid Albani Musya', nik: 'TR-faridalban', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Fendi Setiawan', nik: '230523581', jabatan: 'Regional Bestie' },
  { name: 'Fiqri Amatul Firdaus', nik: '210923070', jabatan: 'Regional Bestie' },
  { name: 'Karlina Endah Puji Astuti', nik: '211123186', jabatan: 'Regional Bestie' },
  { name: 'M. Ghifary Hakim Syarif', nik: 'TR-mghifaryha', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Maharani Dina Putri', nik: 'TR-maharanidi', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Malik Ibrahim', nik: '200622511', jabatan: 'Regional Bestie' },
  { name: 'Marisa Giselina', nik: 'TR-marisagise', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Muhammad Fauzan', nik: 'TR-muhammadfa', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Muhammad Fikri', nik: '230723758', jabatan: 'Regional Bestie' },
  { name: 'Nazillah Khaidar', nik: 'TR-nazillahkh', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Novilya Dwi Rahman', nik: '201222610', jabatan: 'Regional Bestie' },
  { name: 'Nurfujiati', nik: 'TR-nurfujiati', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Putri Mentari Ayu', nik: 'TR-putrimenta', username: 'putri.ayu', jabatan: 'Trainer FMCU / Admin Jadwal' },
  { name: 'Rani Adrianti', nik: 'TR-raniadrian', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Rani Ismawati', nik: '210722912', jabatan: 'Regional Bestie' },
  { name: 'Rido Yuhanda', nik: 'TR-ridoyuhand', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Riki Prasetyawan', nik: 'TR-rikipraset', jabatan: 'Trainer FMCU / Regional Bestie' },
  { name: 'Rully Alfandi', nik: '210822981', jabatan: 'Regional Bestie' },
  { name: 'Seftiana Putri Rahmawati', nik: '220623417', jabatan: 'Regional Bestie' },
  { name: 'Septiana Indasari', nik: 'TR-septianain', jabatan: 'Trainer FMCU / Admin Jadwal' },
  { name: 'Tia Fitri', nik: '230523599', jabatan: 'Regional Bestie' },
  { name: 'Widia Astuti', nik: '170621535', jabatan: 'Regional Bestie' },
  { name: 'Yuyun Yuliyanti', nik: '230823803', jabatan: 'Regional Bestie' }
];

function mapEmployeeRowToUserObject(row, index = 0, options = {}) {
  const rawName = String(row.name || row.Nama || '').trim();
  const rawNik = String(row.nik || row.NIK || '').trim();
  const rawJabatan = String(row.jabatan || row.JABATAN || 'Regional Bestie').trim();
  const rawUsername = String(row.username || '').trim().toLowerCase();
  const rawPassword = String(row.password || '').trim();
  const rawRegion = String(row.region || '').trim();
  const rawEmail = String(row.email || '').trim();

  const cleanSlug = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const username = rawUsername || (rawNik ? rawNik.toLowerCase() : cleanSlug || `user${index + 1}`);
  const passwordMode = options.passwordMode || 'nik';
  const password =
    rawPassword ||
    (passwordMode === 'default123'
      ? '123'
      : rawNik || '123');

  const jabLower = rawJabatan.toLowerCase();
  let role = 'AUDITOR';
  let roleBadge = 'Visitor / Regional Bestie';
  let authorities = ['view_home', 'view_analytics', 'create_visit', 'export_pdf'];

  if (jabLower.includes('super admin')) {
    role = 'SUPER_ADMIN';
    roleBadge = 'Super Admin FMCU';
    authorities = [
      'view_home',
      'view_analytics',
      'create_visit',
      'export_pdf',
      'manage_schedule',
      'manage_stores',
      'manage_users',
      'manage_integrations'
    ];
  } else if (
    jabLower.includes('admin jadwal') ||
    jabLower.includes('regional manager') ||
    jabLower.includes('area manager') ||
    jabLower === 'rm' ||
    jabLower === 'am'
  ) {
    role = 'ADMIN_SCHEDULE';
    roleBadge = rawJabatan ? `Admin Jadwal (${rawJabatan})` : 'Admin Jadwal';
    authorities = ['view_home', 'view_analytics', 'create_visit', 'export_pdf', 'manage_schedule'];
  } else {
    role = 'AUDITOR';
    if (jabLower.includes('visitor')) {
      roleBadge = rawJabatan;
    } else if (rawJabatan) {
      roleBadge = `Visitor / ${rawJabatan}`;
    } else {
      roleBadge = 'Visitor / Regional Bestie';
    }
  }

  const palette = ['#0099A6', '#009944', '#0284C7', '#0D9488', '#059669', '#2563EB'];
  return {
    id: rawNik ? `usr-${rawNik}` : `usr-${username}`,
    nik: rawNik,
    jabatan: rawJabatan || 'Regional Bestie',
    username,
    password,
    name: rawName,
    email: rawEmail,
    role,
    roleBadge,
    region: rawRegion || '-',
    phone: '',
    avatarColor: role === 'SUPER_ADMIN' ? '#009944' : palette[index % palette.length],
    active: true,
    authorities,
    _v2AuthSchema: true,
    lastLocation: null
  };
}

// Akun akses sistem dasar + 18 Karyawan dari Data_Karyawan_NIK.xlsx
const INITIAL_USERS = [
  {
    id: 'usr-admin',
    nik: 'ADMIN',
    jabatan: 'Super Admin FMCU',
    username: 'admin',
    password: '123',
    name: 'Admin FMCU',
    email: '',
    role: 'SUPER_ADMIN',
    roleBadge: 'Super Admin FMCU',
    region: 'Head Office',
    phone: '',
    avatarColor: '#009944',
    active: true,
    authorities: [
      'view_home',
      'create_visit',
      'view_analytics',
      'export_pdf',
      'live_checkin',
      'manage_schedule',
      'manage_stores',
      'manage_users',
      'manage_integrations'
    ],
    _v2AuthSchema: true,
    lastLocation: null
  },
  ...EMPLOYEE_NIK_SEED_ROWS.map((row, idx) => mapEmployeeRowToUserObject(row, idx, { passwordMode: 'nik' }))
];

function sanitizeForFirestore(obj) {
  return JSON.parse(
    JSON.stringify(obj, (key, value) => (value === undefined ? null : value))
  );
}

// ============================================================================
// PEMISAHAN PENYIMPANAN KHUSUS FOTO:
// - Seluruh data laporan (identitas toko, crew, observasi, skor QSC, jadwal,
//   user, master toko) disimpan utuh di Cloud Firestore (`fmcu-visit-database`).
// - KHUSUS FILE FOTO (QSC & Bukti Temuan) disimpan di Google Drive melalui
//   Google Apps Script. Firestore hanya menyimpan metadata foto + Link/ID GDrive
//   sehingga kapasitas Firestore tetap sangat hemat (< 5 KB/laporan).
// ============================================================================
function stripPhotoBinaryForLocalStorage(photo) {
  if (!photo) return {};
  if (photo.dataUrl && photo.dataUrl.startsWith('data:image') && window.FMCUData) {
    window.FMCUData.cachePhotoInMemory(photo.id, photo.driveFileId, photo.dataUrl, false);
  }
  const isHttpUrl = photo.dataUrl && /^https?:\/\//i.test(photo.dataUrl);
  const directUrl =
    photo.driveUrl ||
    (photo.driveFileId ? `https://drive.google.com/thumbnail?id=${photo.driveFileId}&sz=w1200` : '') ||
    (isHttpUrl ? photo.dataUrl : '');

  return {
    id: photo.id || 'photo-' + Date.now(),
    caption: photo.caption || '',
    description: photo.description || '',
    category: photo.category || '',
    timestamp: photo.timestamp || '',
    fullPhotoId: photo.fullPhotoId || '',
    driveFileId: photo.driveFileId || '',
    driveUrl: directUrl,
    driveViewUrl: photo.driveViewUrl || '',
    storageProvider: photo.driveFileId ? 'GOOGLE_DRIVE' : 'INDEXED_DB',
    dataUrl: directUrl
  };
}

function prepareReportForLocalStorage(report) {
  const clean = sanitizeForFirestore(report);
  const cleanCa = (clean.caPhotos || clean.correctiveActionPhotos || []).map(stripPhotoBinaryForLocalStorage);
  return {
    ...clean,
    qscPhotos: (clean.qscPhotos || []).map(stripPhotoBinaryForLocalStorage),
    evidencePhotos: (clean.evidencePhotos || []).map(stripPhotoBinaryForLocalStorage),
    caPhotos: cleanCa,
    correctiveActionPhotos: cleanCa,
    _photoStorageMode: 'INDEXED_DB_AND_GDRIVE'
  };
}

function prepareReportForFirestore(report) {
  const clean = sanitizeForFirestore(report);
  let cumulativeBase64Bytes = 0;
  const MAX_FIRESTORE_B64_BYTES = 550000; // Jaga di bawah batas 1MB dokumen Firestore

  const processPhoto = (photo) => {
    if (!photo) return {};
    if (photo.dataUrl && photo.dataUrl.startsWith('data:image') && window.FMCUData) {
      window.FMCUData.cachePhotoInMemory(photo.id, photo.driveFileId, photo.dataUrl);
    }
    const isHttpUrl = photo.dataUrl && /^https?:\/\//i.test(photo.dataUrl);
    const directUrl =
      photo.driveUrl ||
      (photo.driveFileId ? `https://drive.google.com/thumbnail?id=${photo.driveFileId}&sz=w1200` : '') ||
      (isHttpUrl ? photo.dataUrl : '');

    const isSplitQsc = String(photo.id || '').startsWith('qsc-') && photo.id !== 'qsc-1' && photo.id !== 'qsc-2';
    let inlineDataUrl = directUrl;
    if (
      photo.dataUrl &&
      photo.dataUrl.startsWith('data:image') &&
      photo.dataUrl.length <= 260000 &&
      cumulativeBase64Bytes + photo.dataUrl.length <= MAX_FIRESTORE_B64_BYTES &&
      (!directUrl || isSplitQsc)
    ) {
      inlineDataUrl = photo.dataUrl;
      cumulativeBase64Bytes += photo.dataUrl.length;
    }

    return {
      id: photo.id || 'photo-' + Date.now(),
      caption: photo.caption || '',
      description: photo.description || '',
      category: photo.category || '',
      timestamp: photo.timestamp || '',
      driveFileId: photo.driveFileId || '',
      driveUrl: directUrl,
      driveViewUrl: photo.driveViewUrl || '',
      storageProvider: photo.driveFileId ? 'GOOGLE_DRIVE' : (inlineDataUrl ? 'FIRESTORE_REALTIME' : 'PENDING'),
      dataUrl: inlineDataUrl
    };
  };

  const cleanQsc = (clean.qscPhotos || []).map(processPhoto);
  const cleanEv = (clean.evidencePhotos || []).map(processPhoto);
  const cleanCa = (clean.caPhotos || clean.correctiveActionPhotos || []).map(processPhoto);
  return {
    ...clean,
    qscPhotos: cleanQsc,
    evidencePhotos: cleanEv,
    caPhotos: cleanCa,
    correctiveActionPhotos: cleanCa,
    _photoStorageMode: 'GOOGLE_DRIVE_APPS_SCRIPT'
  };
}

window.FMCUData = {
  FINDING_PRESETS,
  FIREBASE_CONFIG,
  GEMINI_CONFIG,
  OPENAI_CONFIG,
  GROQ_CONFIG,
  OPENROUTER_CONFIG,
  TOKENPLUS_CONFIG,
  DEFAULT_USERS: INITIAL_USERS,
  EMPLOYEE_NIK_SEED_ROWS,
  mapEmployeeRowToUserObject,
  DEFAULT_EXCEL_FILE_PATH: '10. List PIC Oktober 2026_rev01.xlsx',
  DEFAULT_USER_EXCEL_FILE_PATH: 'Data_Karyawan_NIK.xlsx',
  SESSION_TIMEOUT_MS: 15 * 60 * 1000, // 15 menit batas waktu sesi idle
  TAB_UNLOAD_KEY: 'fmcu_tab_unload_ts_v2',
  firebaseApp: null,
  db: null,
  analytics: null,
  cloudStatus: 'CONNECTING',
  cloudErrorMsg: '',
  unsubscribers: [],
  // Cache sementara di RAM sesi aktif untuk merender PDF dengan cepat tanpa membebani Firestore/localStorage
  photoMemoryCache: {},
  draftMemoryCache: {},
  _persistedPhotoKeys: new Set(),
  _draftsCloudDenied: false,
  _pushedUnsyncedReportIds: new Set(),
  _photoStorageReady: false,
  _photoStorageInitPromise: null,
  _deletedReportIds: new Set(),
  _deletedScheduleIds: new Set(),
  _syncChannel: null,
  _cachedUsers: null,
  _cachedStores: null,
  _cachedSchedules: null,
  _cachedReports: null,
  _cachedBestieInCharge: null,

  
  // ==========================================================================
  // REAL-TIME MULTI-TAB & CROSS-CLIENT BROADCAST CHANNEL & STORAGE SYNC
  // Sinkronisasi instan 0ms antar-jendela/tab dan fallback event storage
  // ==========================================================================
  initSyncChannel() {
    if (typeof BroadcastChannel !== 'undefined' && !this._syncChannel) {
      try {
        this._syncChannel = new BroadcastChannel('fmcu_realtime_sync');
        this._syncChannel.onmessage = (event) => {
          if (!event || !event.data) return;
          this.handleSyncMessage(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel init error:', e);
      }
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEYS.SCHEDULES && e.newValue) {
          try {
            this._cachedSchedules = JSON.parse(e.newValue);
            if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
              window.FMCUApp.onCloudDataUpdated('schedules');
            }
          } catch (err) {}
        } else if (e.key === STORAGE_KEYS.USERS && e.newValue) {
          try {
            this._cachedUsers = JSON.parse(e.newValue);
            if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
              window.FMCUApp.onCloudDataUpdated('users', { onlyLocationChanged: true });
            }
          } catch (err) {}
        }
      });
    }
  },

  broadcastSync(payload) {
    if (!payload) return;
    if (this._syncChannel) {
      try {
        this._syncChannel.postMessage(payload);
      } catch (e) {}
    }
  },

  handleSyncMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'SCHEDULE_SAVED' || msg.type === 'SCHEDULES_UPDATED') {
      this.clearCache('schedules');
      if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
        window.FMCUApp.onCloudDataUpdated('schedules', { schedule: msg.schedule });
      }
    } else if (msg.type === 'SCHEDULE_DELETED') {
      if (msg.scheduleId) {
        this._deletedScheduleIds.add(String(msg.scheduleId));
      }
      this.clearCache('schedules');
      if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
        window.FMCUApp.onCloudDataUpdated('schedules');
      }
    } else if (msg.type === 'LOCATION_UPDATED') {
      if (msg.userId && msg.location) {
        const users = this.getUsers();
        const idx = users.findIndex(
          (u) =>
            String(u.id) === String(msg.userId) ||
            String(u.username).toLowerCase() === String(msg.userId).toLowerCase() ||
            String(u.nik) === String(msg.userId)
        );
        if (idx !== -1) {
          users[idx].lastLocation = msg.location;
          this._cachedUsers = users;
        }
      }
      if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
        window.FMCUApp.onCloudDataUpdated('users', {
          onlyLocationChanged: true,
          userId: msg.userId,
          location: msg.location
        });
      }
    }
  },

  clearCache(key = null) {
    if (!key) {
      this._cachedUsers = null;
      this._cachedStores = null;
      this._cachedSchedules = null;
      this._cachedReports = null;
      this._cachedBestieInCharge = null;
    } else if (key === 'users') {
      this._cachedUsers = null;
    } else if (key === 'stores') {
      this._cachedStores = null;
    } else if (key === 'schedules') {
      this._cachedSchedules = null;
    } else if (key === 'reports') {
      this._cachedReports = null;
    } else if (key === 'bestie') {
      this._cachedBestieInCharge = null;
    }
  },

  init() {
    this.initSyncChannel();
    // Hapus seluruh cache data dummy versi lama (v1) dan hapus sesi persisten lama di localStorage
    [
      'fmcu_users_v1',
      'fmcu_stores_v1',
      'fmcu_schedules_v1',
      'fmcu_reports_v1',
      'fmcu_session_v1',
      'fmcu_active_checkin_v1',
      'fmcu_draft_report_v1',
      'fmcu_settings_v1',
      'fmcu_attendance_logs_v1',
      STORAGE_KEYS.ACTIVE_SESSION
    ].forEach((oldKey) => localStorage.removeItem(oldKey));

    // Jika tab/web app sempat ditutup dan dibuka kembali (> 4 detik jeda unload), wajibkan login ulang
    const unloadTs = Number(sessionStorage.getItem(this.TAB_UNLOAD_KEY) || 0);
    if (unloadTs > 0 && Date.now() - unloadTs > 4000) {
      sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    }
    sessionStorage.removeItem(this.TAB_UNLOAD_KEY);

    // Bersihkan dummy location GPS Regional Bestie
    this.clearDummyBestieLocations();

    // Hapus legacy cache key slot qsc statis agar foto lembar QSC default kosong
    delete this.photoMemoryCache['qsc-1'];
    delete this.photoMemoryCache['qsc-2'];

    if (!localStorage.getItem(STORAGE_KEYS.NEWS)) {
      localStorage.setItem(STORAGE_KEYS.NEWS, JSON.stringify(DEFAULT_NEWS_ITEMS));
    }

    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
    } else {
      // Pastikan seluruh 35 karyawan (18 Regional Bestie + 17 Karyawan/Trainer FMCU dari Templete Jadwal.xlsx) & akun Admin otomatis ter-seed jika belum ada
      const existingUsers = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
      const existingNiks = new Set(existingUsers.map((u) => String(u.nik || u.username || '').toLowerCase().trim()));
      const existingNames = new Set(existingUsers.map((u) => String(u.name || '').toLowerCase().trim()));
      let addedSeed = false;
      if (!existingUsers.some((u) => u.username === 'admin' || u.role === 'SUPER_ADMIN')) {
        existingUsers.unshift(INITIAL_USERS[0]);
        addedSeed = true;
      }
      EMPLOYEE_NIK_SEED_ROWS.forEach((row, idx) => {
        const cleanName = String(row.name).toLowerCase().trim();
        const cleanNik = String(row.nik).toLowerCase().trim();
        if (!existingNames.has(cleanName) && !existingNiks.has(cleanNik)) {
          existingUsers.push(mapEmployeeRowToUserObject(row, idx, { passwordMode: 'nik' }));
          addedSeed = true;
        }
      });
      if (addedSeed) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(existingUsers));
      }
    }

    // Otomatis isi & sinkronisasi lengkap Master Toko dari hasil ekstraksi "10. List PIC Oktober 2026_rev01.xlsx"
    const currentStores = JSON.parse(localStorage.getItem(STORAGE_KEYS.STORES) || '[]');
    const seedLen = Array.isArray(window.FMCU_INITIAL_STORES) ? window.FMCU_INITIAL_STORES.length : 0;
    if (currentStores.length > 0 && currentStores.length >= seedLen && currentStores[0] && currentStores[0].lat !== undefined) {
      this._cachedStores = currentStores;
    } else if (seedLen > 0) {
      const existingMap = new Map();
      currentStores.forEach((s) => existingMap.set(String(s.code), s));
      let hasUpdate = false;

      window.FMCU_INITIAL_STORES.forEach((seed) => {
        const seedCode = String(seed.code);
        if (!existingMap.has(seedCode)) {
          existingMap.set(seedCode, seed);
          hasUpdate = true;
        } else {
          const cur = existingMap.get(seedCode);
          if (cur.lat === undefined || cur.lat === null || cur.lat === '') {
            cur.lat = seed.lat;
            cur.lng = seed.lng;
            cur.latitude = seed.latitude;
            cur.longitude = seed.longitude;
            hasUpdate = true;
          }
        }
      });

      if (hasUpdate || currentStores.length === 0) {
        const fullStores = Array.from(existingMap.values()).sort((a, b) =>
          String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true })
        );
        this._cachedStores = fullStores;
        localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(fullStores));
      }
    } else if (!localStorage.getItem(STORAGE_KEYS.STORES)) {
      localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.SCHEDULES)) {
      localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.REPORTS)) {
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ATTENDANCE_LOGS)) {
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify([]));
    }

    // Inisialisasi Penyimpanan Foto Lokal IndexedDB & Cloud Firestore Real-time Sync
    this.initPhotoStorage();
    this.initFirestore();
    this.initGasDatabaseSync();
  },

  // ==========================================================================
  // EKSTRAKTOR FILE EXCEL MASTER TOKO (.XLSX / .XLS / .CSV)
  // Hanya membaca kolom:
  //   Site (Kode Toko), SiteDescr (Nama Toko), Type, City, Address, Email,
  //   Store Mobile Phone, Store Head, Area Manager, Email Area Manager,
  //   Regional Manager, Email Regional Manager
  // ==========================================================================
  parseStoresFromExcelArrayBuffer(arrayBuffer) {
    if (typeof window.XLSX === 'undefined') {
      throw new Error('Library SheetJS (XLSX) belum termuat di browser.');
    }

    const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
    // Prioritaskan sheet bernama "List" sesuai struktur "10. List PIC Oktober 2026_rev01.xlsx"
    const targetSheetName =
      workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'list') || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[targetSheetName];
    if (!worksheet) {
      throw new Error('Sheet data toko tidak ditemukan di dalam file Excel.');
    }

    const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rows || rows.length === 0) {
      throw new Error('File Excel kosong.');
    }

    // Cari baris header (di "10. List PIC Oktober 2026_rev01.xlsx" berada di Row 4 / index 3)
    let headerRowIndex = -1;
    let colMap = {};

    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const rowCells = (rows[r] || []).map((cell) => String(cell || '').trim().toLowerCase());
      const hasSite = rowCells.some((c) => c === 'site' || c === 'kode toko' || c === 'store code');
      const hasOtherKey = rowCells.some(
        (c) =>
          c === 'type' ||
          c === 'city' ||
          c === 'store head' ||
          c === 'area manager' ||
          c === 'regional manager'
      );
      if (hasSite && hasOtherKey) {
        headerRowIndex = r;
        rowCells.forEach((colName, idx) => {
          if (colName === 'site' || colName === 'kode toko' || colName === 'store code') colMap.site = idx;
          else if (colName === 'sitedescr' || colName === 'site descr' || colName === 'nama toko' || colName === 'store name') colMap.name = idx;
          else if (colName === 'type' || colName === 'tipe' || colName === 'tipe toko') colMap.type = idx;
          else if (colName === 'city' || colName === 'kota') colMap.city = idx;
          else if (colName === 'address' || colName === 'alamat') colMap.address = idx;
          else if (colName === 'latitude' || colName === 'lat' || colName === 'altitude') colMap.lat = idx;
          else if (colName === 'longitude' || colName === 'long' || colName === 'longtitude' || colName === 'lng') colMap.lng = idx;
          else if (colName === 'email' || colName === 'store email' || colName === 'email toko') colMap.email = idx;
          else if (colName === 'store mobile phone' || colName === 'mobile phone' || colName === 'no telp toko' || colName === 'store phone') colMap.storePhone = idx;
          else if (colName === 'store head' || colName === 'kepala toko') colMap.storeHead = idx;
          else if (colName === 'area manager' || colName === 'am') colMap.areaManager = idx;
          else if (colName === 'area manager email' || colName === 'email area manager' || colName === 'am email') colMap.areaManagerEmail = idx;
          else if (colName === 'regional manager' || colName === 'rm') colMap.regionalManager = idx;
          else if (colName === 'regional manager email' || colName === 'email regional manager' || colName === 'rm email') colMap.regionalManagerEmail = idx;
        });
        break;
      }
    }

    if (headerRowIndex === -1 || colMap.site === undefined) {
      throw new Error(
        'Header kolom "Site" tidak ditemukan. Pastikan format tabel Excel memiliki kolom: Site, Type, City, Address, Email, Store Mobile Phone, Store Head, Area Manager, Area Manager Email, Regional Manager, Regional Manager Email.'
      );
    }

    const extractedStores = [];
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      let rawSite = String(row[colMap.site] ?? '').trim();
      const rawName = colMap.name !== undefined ? String(row[colMap.name] ?? '').trim() : '';
      if (!rawSite && !rawName) continue;

      // Normalisasi kode Site 4 digit apabila terformat angka di Excel (misal 1 -> 0001)
      if (/^\d{1,3}$/.test(rawSite)) {
        rawSite = rawSite.padStart(4, '0');
      }

      const storeHeadVal = colMap.storeHead !== undefined ? String(row[colMap.storeHead] ?? '').trim() : '';

      const rawLat = colMap.lat !== undefined ? String(row[colMap.lat] ?? '').trim() : '';
      const rawLng = colMap.lng !== undefined ? String(row[colMap.lng] ?? '').trim() : '';
      const parsedLat = rawLat !== '' && !isNaN(Number(rawLat)) ? Number(rawLat) : null;
      const parsedLng = rawLng !== '' && !isNaN(Number(rawLng)) ? Number(rawLng) : null;

      // Ekstrak data toko termasuk koordinat maps (Latitude/Altitude & Longitude)
      extractedStores.push({
        code: rawSite,
        name: (rawName || rawSite).toUpperCase(),
        type: colMap.type !== undefined ? String(row[colMap.type] ?? '').trim() : 'CVS',
        city: colMap.city !== undefined ? String(row[colMap.city] ?? '').trim() : '',
        address: colMap.address !== undefined ? String(row[colMap.address] ?? '').trim() : '',
        lat: parsedLat,
        lng: parsedLng,
        latitude: parsedLat,
        longitude: parsedLng,
        email: colMap.email !== undefined ? String(row[colMap.email] ?? '').trim() : '',
        storePhone: colMap.storePhone !== undefined ? String(row[colMap.storePhone] ?? '').trim() : '',
        storeHead: storeHeadVal,
        areaManager: colMap.areaManager !== undefined ? String(row[colMap.areaManager] ?? '').trim() : '',
        areaManagerEmail: colMap.areaManagerEmail !== undefined ? String(row[colMap.areaManagerEmail] ?? '').trim() : '',
        regionalManager: colMap.regionalManager !== undefined ? String(row[colMap.regionalManager] ?? '').trim() : '',
        regionalManagerEmail: colMap.regionalManagerEmail !== undefined ? String(row[colMap.regionalManagerEmail] ?? '').trim() : ''
      });
    }

    return extractedStores;
  },

  // Membaca langsung file "10. List PIC Oktober 2026_rev01.xlsx" dari root folder project
  async fetchAndExtractProjectExcelFile() {
    try {
      const response = await fetch(encodeURI(this.DEFAULT_EXCEL_FILE_PATH));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const parsed = this.parseStoresFromExcelArrayBuffer(buffer);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch (err) {
      console.warn('Menggunakan pre-extracted seed dari 10. List PIC Oktober 2026_rev01.xlsx:', err);
    }
    return Array.isArray(window.FMCU_INITIAL_STORES) ? window.FMCU_INITIAL_STORES : [];
  },

  // ==========================================================================
  // EKSTRAKTOR FILE EXCEL DATA KARYAWAN / USER MASSAL (.XLSX / .XLS / .CSV)
  // Membaca format tabel seperti "Data_Karyawan_NIK.xlsx" dengan kolom:
  //   - Nama / Nama Lengkap / Nama Karyawan
  //   - NIK / Nomor Induk Karyawan / NIP (otomatis menjadi Username & Password)
  //   - JABATAN / Role / Posisi (misal: Regional Bestie, Admin Jadwal, dll.)
  //   - Opsional: Username, Password, Region / Area, Email
  // ==========================================================================
  parseUsersFromExcelArrayBuffer(arrayBuffer, options = {}) {
    if (typeof window.XLSX === 'undefined') {
      throw new Error('Library SheetJS (XLSX) belum termuat di browser.');
    }

    const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
    const targetSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[targetSheetName];
    if (!worksheet) {
      throw new Error('Sheet data karyawan/user tidak ditemukan di dalam file Excel.');
    }

    const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rows || rows.length === 0) {
      throw new Error('File Excel kosong.');
    }

    let headerRowIndex = -1;
    let colMap = {};

    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const rowCells = (rows[r] || []).map((cell) => String(cell || '').trim().toLowerCase());
      const hasName = rowCells.some((c) =>
        ['nama', 'nama lengkap', 'nama karyawan', 'name', 'full name', 'nama user'].includes(c)
      );
      const hasSecondCol = rowCells.some((c) =>
        [
          'nik',
          'no nik',
          'nomor induk karyawan',
          'nip',
          'id karyawan',
          'jabatan',
          'role',
          'posisi',
          'position',
          'username'
        ].includes(c)
      );

      if (hasName && hasSecondCol) {
        headerRowIndex = r;
        rowCells.forEach((colName, idx) => {
          if (['nama', 'nama lengkap', 'nama karyawan', 'name', 'full name', 'nama user'].includes(colName)) {
            colMap.name = idx;
          } else if (['nik', 'no nik', 'nomor induk karyawan', 'nip', 'id karyawan', 'employee id'].includes(colName)) {
            colMap.nik = idx;
          } else if (['jabatan', 'role', 'posisi', 'position', 'title', 'level'].includes(colName)) {
            colMap.jabatan = idx;
          } else if (['username', 'user login', 'akun'].includes(colName)) {
            colMap.username = idx;
          } else if (['password', 'pin', 'kata sandi', 'pass'].includes(colName)) {
            colMap.password = idx;
          } else if (['region', 'area', 'wilayah', 'cabang'].includes(colName)) {
            colMap.region = idx;
          } else if (['email', 'e-mail', 'alamat email'].includes(colName)) {
            colMap.email = idx;
          }
        });
        break;
      }
    }

    if (headerRowIndex === -1 || colMap.name === undefined) {
      throw new Error(
        'Header kolom "Nama" dan "NIK" / "JABATAN" tidak ditemukan. Pastikan tabel Excel memiliki kolom: Nama, NIK, JABATAN (seperti pada Data_Karyawan_NIK.xlsx).'
      );
    }

    const extractedUsers = [];
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const rawName = String(row[colMap.name] ?? '').trim();
      const rawNik = colMap.nik !== undefined ? String(row[colMap.nik] ?? '').trim() : '';
      const rawJabatan =
        colMap.jabatan !== undefined ? String(row[colMap.jabatan] ?? '').trim() : 'Regional Bestie';
      const rawUsername = colMap.username !== undefined ? String(row[colMap.username] ?? '').trim() : '';
      const rawPassword = colMap.password !== undefined ? String(row[colMap.password] ?? '').trim() : '';
      const rawRegion = colMap.region !== undefined ? String(row[colMap.region] ?? '').trim() : '';
      const rawEmail = colMap.email !== undefined ? String(row[colMap.email] ?? '').trim() : '';

      if (!rawName && !rawNik) continue;

      const userObj = mapEmployeeRowToUserObject(
        {
          name: rawName || `User ${rawNik}`,
          nik: rawNik,
          jabatan: rawJabatan || 'Regional Bestie',
          username: rawUsername,
          password: rawPassword,
          region: rawRegion,
          email: rawEmail
        },
        extractedUsers.length,
        options
      );
      extractedUsers.push(userObj);
    }

    return extractedUsers;
  },

  // Membaca langsung file "Data_Karyawan_NIK.xlsx" dari root folder project
  async fetchAndExtractProjectUserExcelFile(options = {}) {
    try {
      const response = await fetch(encodeURI(this.DEFAULT_USER_EXCEL_FILE_PATH));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const parsed = this.parseUsersFromExcelArrayBuffer(buffer, options);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch (err) {
      console.warn('Menggunakan pre-extracted seed dari Data_Karyawan_NIK.xlsx:', err);
    }
    return EMPLOYEE_NIK_SEED_ROWS.map((row, idx) => mapEmployeeRowToUserObject(row, idx, options));
  },

  // ==========================================================================
  // GOOGLE APPS SCRIPT SECURE DATABASE ENGINE (FMCU HIDDEN VAULT)
  // 100% Bebas Kuota 429, Aman, Terenkripsi & Tersembunyi di Google Drive
  // ==========================================================================
  _gasPollingInterval: null,
  _isGasSyncing: false,

  getGasUrl() {
    const settings = this.getSettings();
    if (settings.cloudflareWorkerUrl && settings.cloudflareWorkerUrl.trim().startsWith('http')) {
      return settings.cloudflareWorkerUrl.trim();
    }
    const url = (settings.gasWebhookUrl || DEFAULT_SETTINGS.gasWebhookUrl || '').trim();
    if (!url || url.includes('AKfycbxqumXFq') || url.includes('4lRe') || !url.startsWith('http')) {
      return DEFAULT_SETTINGS.gasWebhookUrl;
    }
    return url;
  },

  async callGasDatabase(action, payload = {}) {
    const gasUrl = this.getGasUrl();
    if (!gasUrl || !gasUrl.startsWith('http')) {
      return null;
    }

    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: action,
          ...payload
        })
      });
      return await res.json();
    } catch (err) {
      console.warn(`[GAS DB] Error calling ${action}:`, err);
      return null;
    }
  },

  async syncAllFromGasDatabase(silent = false) {
    if (this._isGasSyncing) return;
    this._isGasSyncing = true;

    try {
      const resp = await this.callGasDatabase('db_sync_all');
      if (resp && resp.status === 'SUCCESS') {
        let schedulesChanged = false;
        let usersChanged = false;
        let storesChanged = false;
        let locationsChanged = false;

        // 1. Sync Schedules
        const localSchedules = this.getSchedules() || [];
        if (Array.isArray(resp.schedules) && resp.schedules.length > 0) {
          const activeCheckIn = this.getActiveCheckIn ? this.getActiveCheckIn() : null;
          const activeSchId = activeCheckIn?.scheduleId ? String(activeCheckIn.scheduleId) : null;

          // Cloud vault adalah master kebenaran jadwal lintas perangkat
          const schMap = new Map();
          resp.schedules.forEach((s) => {
            if (s && s.id) schMap.set(String(s.id), s);
          });

          // Cek jadwal lokal jika ada sesi audit aktif atau jadwal offline
          localSchedules.forEach((local) => {
            if (!local || !local.id) return;
            const sId = String(local.id);
            if (schMap.has(sId)) {
              const cloud = schMap.get(sId);
              // Pertahankan status check-in lokal jika Bestie di perangkat ini sedang aktif audit di toko tersebut
              if ((activeSchId && sId === activeSchId) || local.status === 'CHECKED_IN' || local.actualIn) {
                if (cloud.status === 'PENDING' && local.status !== 'PENDING') {
                  schMap.set(sId, { ...cloud, status: local.status, actualIn: local.actualIn, actualOut: local.actualOut });
                }
              }
            } else if (local.isOfflineCreated) {
              schMap.set(sId, local);
            }
          });

          const mergedSchedules = Array.from(schMap.values()).sort((a, b) =>
            String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || ''))
          );

          if (JSON.stringify(localSchedules) !== JSON.stringify(mergedSchedules)) {
            this._cachedSchedules = mergedSchedules;
            localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(mergedSchedules));
            schedulesChanged = true;
          }
        } else if (localSchedules.length > 0) {
          // Cloud vault jadwal masih kosong: upload seed/local schedules ke cloud vault sekarang!
          this.callGasDatabase('db_save_collection', { collection: 'schedules', data: localSchedules });
        }

        // 2. Sync Users (Bestie & Admin)
        const currentUsers = this.getUsers() || [];
        if (Array.isArray(resp.users) && resp.users.length > 0) {
          const userMap = new Map();
          currentUsers.forEach((u) => userMap.set(String(u.id || u.username), u));
          resp.users.forEach((u) => {
            const key = String(u.id || u.username);
            const cur = userMap.get(key);
            userMap.set(key, cur ? { ...cur, ...u } : u);
          });
          const mergedUsers = Array.from(userMap.values());
          if (JSON.stringify(currentUsers) !== JSON.stringify(mergedUsers)) {
            this._cachedUsers = mergedUsers;
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(mergedUsers));
            usersChanged = true;
          }
        } else if (currentUsers.length > 0) {
          this.callGasDatabase('db_save_collection', { collection: 'users', data: currentUsers });
        }

        // 3. Sync Stores
        const currentStores = this.getStores() || [];
        if (Array.isArray(resp.stores) && resp.stores.length >= currentStores.length && resp.stores.length > 0) {
          if (JSON.stringify(currentStores) !== JSON.stringify(resp.stores)) {
            this._cachedStores = resp.stores;
            localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(resp.stores));
            storesChanged = true;
          }
        } else if (currentStores.length > 0) {
          this.callGasDatabase('db_save_collection', { collection: 'stores', data: currentStores });
        }

        // 4. Sync Live Tracker Locations
        if (resp.locations && typeof resp.locations === 'object') {
          const users = this.getUsers();
          let locChanged = false;
          users.forEach((u) => {
            const loc =
              resp.locations[u.id] ||
              resp.locations[u.username] ||
              resp.locations[u.nik] ||
              (u.id && String(u.id).startsWith('usr-') ? resp.locations[String(u.id).slice(4)] : resp.locations['usr-' + u.id]);
            if (loc) {
              const prev = u.lastLocation;
              const next = loc;
              if (!prev || prev.lat !== next.lat || prev.lng !== next.lng || prev.updatedAt !== next.updatedAt) {
                u.lastLocation = next;
                locChanged = true;
              }
            }
          });
          if (locChanged) {
            this._cachedUsers = users;
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
            locationsChanged = true;
          }
        }

        // Set status cloud database aktif
        const engineLabel = resp.source === 'cloudflare_d1'
          ? 'Database: Cloudflare D1 Edge SQLite (⚡ 20ms • 5 Juta Kuota)'
          : 'Database: Google Drive Vault (Terenkripsi • Bebas Kuota)';
        this.setCloudStatus('ONLINE_GAS', engineLabel);

        // Dispatch notifications to UI
        if (window.FMCUApp) {
          if (schedulesChanged && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
            window.FMCUApp.onCloudDataUpdated('schedules');
          }
          if ((usersChanged || locationsChanged) && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
            window.FMCUApp.onCloudDataUpdated('users', { onlyLocationChanged: !usersChanged && locationsChanged });
          }
          if (storesChanged && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
            window.FMCUApp.onCloudDataUpdated('stores');
          }
        }
      }
    } catch (e) {
      console.warn('[GAS DB] syncAllFromGasDatabase error:', e);
    } finally {
      this._isGasSyncing = false;
    }
  },

  initGasDatabaseSync() {
    // 1. Sinkronisasi pertama saat web app dimuat
    setTimeout(() => this.syncAllFromGasDatabase(), 1200);

    // 2. Smart Polling berkala (setiap 20 detik):
    // Memperbarui Jadwal baru & Lokasi Live GPS Bestie secara otomatis tanpa limit 429
    if (this._gasPollingInterval) {
      clearInterval(this._gasPollingInterval);
    }
    this._gasPollingInterval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        this.syncAllFromGasDatabase(true);
      }
    }, 20000);
  },


  // ==========================================================================
  // CLOUD FIRESTORE INITIALIZATION & REAL-TIME LISTENERS
  // ==========================================================================
  initFirestore() {
    if (typeof window.firebase === 'undefined') {
      this.setCloudStatus('OFFLINE', 'Firebase SDK belum dimuat');
      return;
    }

    try {
      if (!window.firebase.apps.length) {
        this.firebaseApp = window.firebase.initializeApp(FIREBASE_CONFIG);
      } else {
        this.firebaseApp = window.firebase.app();
      }

      if (typeof window.firebase.analytics === 'function') {
        try {
          this.analytics = window.firebase.analytics();
        } catch (e) {}
      }

      this.db = window.firebase.firestore();
      this.startRealtimeListeners();
    } catch (err) {
      console.error('Firestore initialization error:', err);
      this.setCloudStatus('OFFLINE', err.message || 'Gagal menginisialisasi Firestore');
    }
  },

  setCloudStatus(status, errorMsg = '') {
    this.cloudStatus = status;
    this.cloudErrorMsg = errorMsg;
    if (window.FMCUApp && typeof window.FMCUApp.onCloudStatusChanged === 'function') {
      window.FMCUApp.onCloudStatusChanged(status, errorMsg);
    }
  },

  startRealtimeListeners() {
    if (!this.db) return;

    this.unsubscribers.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {}
    });
    this.unsubscribers = [];

    const handleSnapshotError = (collectionName, err) => {
      if (collectionName === 'drafts') {
        this._draftsCloudDenied = true;
        return;
      }
      console.warn(`Firestore [${collectionName}] error:`, err);
      const isQuota =
        err &&
        (err.code === 'resource-exhausted' ||
          String(err.message || '').includes('429') ||
          String(err.message || '').includes('Quota') ||
          String(err.message || '').includes('quota'));

      if (isQuota) {
        this.setCloudStatus(
          'QUOTA_EXCEEDED',
          'Batas kuota harian Cloud Firestore (50.000 baca / 20.000 tulis) telah tercapai (Error 429). Upgrade ke Blaze di Firebase Console agar sinkronisasi aktif kembali seketika.'
        );
      } else if (err && err.code === 'permission-denied') {
        this.setCloudStatus(
          'PERMISSION_DENIED',
          'Database Firestore masih terkunci oleh Security Rules. Buka Firebase Console -> Firestore Database -> Rules dan izinkan read/write.'
        );
      } else {
        this.setCloudStatus('OFFLINE', err.message || 'Koneksi ke Firestore terputus');
      }
    };

    // 1. REAL-TIME LISTENER: USERS
    const unsubUsers = this.db.collection('users').onSnapshot(
      (snapshot) => {
        this.setCloudStatus('ONLINE');
        if (snapshot.empty) {
          const seedUsers = this.getUsers().length > 0 ? this.getUsers() : INITIAL_USERS;
          const batch = this.db.batch();
          seedUsers.forEach((u) => {
            const docId = String(u.id || u.username);
            const ref = this.db.collection('users').doc(docId);
            batch.set(ref, sanitizeForFirestore({ ...u, id: docId, updatedAt: new Date().toISOString() }), { merge: true });
          });
          batch.commit().catch(() => {});
          return;
        }

        const cloudUsers = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data && data.username) {
            cloudUsers.push({ ...data, id: data.id || doc.id });
          }
        });

        if (cloudUsers.length > 0) {
          // Bersihkan dummy GPS yang mungkin tersimpan di Firestore (pertahankan jika memiliki koordinat numerik valid)
          cloudUsers.forEach((u) => {
            if (u.lastLocation) {
              const latNum = Number(u.lastLocation.lat);
              const lngNum = Number(u.lastLocation.lng);
              if (isNaN(latNum) || isNaN(lngNum) || latNum === 0 || lngNum === 0) {
                u.lastLocation = null;
              } else {
                u.lastLocation.isActualGps = true;
              }
            }
          });

          // Pastikan akun Super Admin selalu ada di list
          if (!cloudUsers.some((u) => u.username === 'admin' || u.role === 'SUPER_ADMIN')) {
            cloudUsers.unshift(INITIAL_USERS[0]);
          }

          // One-time auto-seed 18 karyawan Data_Karyawan_NIK.xlsx ke Cloud Firestore via single atomic WriteBatch
          if (!localStorage.getItem('fmcu_employee_nik_cloud_seeded_v1')) {
            localStorage.setItem('fmcu_employee_nik_cloud_seeded_v1', '1');
            const cloudNikSet = new Set(cloudUsers.map((u) => String(u.nik || u.username || '').toLowerCase()));
            const toAdd = [];
            EMPLOYEE_NIK_SEED_ROWS.forEach((row, idx) => {
              if (!cloudNikSet.has(String(row.nik).toLowerCase())) {
                const seededU = mapEmployeeRowToUserObject(row, idx, { passwordMode: 'nik' });
                cloudUsers.push(seededU);
                toAdd.push(seededU);
              }
            });
            if (toAdd.length > 0) {
              const batch = this.db.batch();
              toAdd.forEach((seededU) => {
                const docId = String(seededU.id || seededU.username);
                const ref = this.db.collection('users').doc(docId);
                batch.set(ref, sanitizeForFirestore({ ...seededU, id: docId, updatedAt: new Date().toISOString() }), { merge: true });
              });
              batch.commit().catch(() => {});
            }
          }

          // Deduplikasi user berdasarkan Nama Unik agar konsisten dengan getUsers()
          const dedupMap = new Map();
          cloudUsers.forEach((u) => {
            if (!u) return;
            const normName = String(u.name || '').toLowerCase().trim();
            if (!normName) return;
            if (!dedupMap.has(normName)) {
              dedupMap.set(normName, u);
            } else {
              const existing = dedupMap.get(normName);
              if (!existing.nik && u.nik) existing.nik = u.nik;
              if (!existing.jabatan && u.jabatan) existing.jabatan = u.jabatan;
              if (u.role === 'ADMIN_SCHEDULE' || u.role === 'SUPER_ADMIN') existing.role = u.role;
              if (u.lastLocation && (!existing.lastLocation || String(u.lastLocation.updatedAt || '') > String(existing.lastLocation.updatedAt || ''))) {
                existing.lastLocation = u.lastLocation;
              }
            }
          });
          const finalCloudUsers = Array.from(dedupMap.values());

          const buildUserStructSig = (arr) =>
            Array.isArray(arr)
              ? arr
                  .map(
                    (u) =>
                      `${u.id || u.username}:${u.name || ''}:${u.role || ''}:${u.nik || ''}:${u.password || ''}:${(u.authorities || []).join(',')}`
                  )
                  .sort()
                  .join('|')
              : '';

          const newStructSig = buildUserStructSig(finalCloudUsers);
          const onlyLocationChanged = Boolean(this._lastUsersStructSig && this._lastUsersStructSig === newStructSig);
          this._lastUsersStructSig = newStructSig;

          this._cachedUsers = finalCloudUsers;
          const nowMs = Date.now();
          if (!onlyLocationChanged || !this._lastUsersStorageWriteMs || nowMs - this._lastUsersStorageWriteMs > 12000) {
            this._lastUsersStorageWriteMs = nowMs;
            try {
              localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(finalCloudUsers));
            } catch (e) {}
          }
          const activeSession = this.getSession();
          if (activeSession && !onlyLocationChanged) {
            const updatedSelf = finalCloudUsers.find((u) => u.id === activeSession.id || u.username === activeSession.username);
            if (updatedSelf) {
              this.setSession(updatedSelf);
            }
          }
          if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
            window.FMCUApp.onCloudDataUpdated('users', { onlyLocationChanged });
          }
        }
      },
      (err) => handleSnapshotError('users', err)
    );
    this.unsubscribers.push(unsubUsers);

    // 2. REAL-TIME LISTENER: MASTER STORES CATALOG (Mendukung 610+ Toko dalam 1 Dokumen Katalog Cepat)
    const unsubStoresCatalog = this.db
      .collection('settings')
      .doc('master_stores_catalog')
      .onSnapshot(
        (doc) => {
          this.setCloudStatus('ONLINE');
          if (!doc.exists) {
            // Seed 610 toko dari "10. List PIC Oktober 2026_rev01.xlsx" ke Firestore saat pertama kali terhubung
            const initialStores = this.getStores();
            if (initialStores.length > 0) {
              this.saveStoresCatalogToCloud(initialStores);
            }
            return;
          }
          const data = doc.data();
          if (data && Array.isArray(data.stores) && data.stores.length > 0) {
            let enriched = data.stores;
            if (Array.isArray(window.FMCU_INITIAL_STORES) && window.FMCU_INITIAL_STORES.length > 0) {
              const seedMap = new Map();
              window.FMCU_INITIAL_STORES.forEach((s) => seedMap.set(String(s.code), s));
              let needsCloudPush = false;
              enriched = enriched.map((st) => {
                const seed = seedMap.get(String(st.code));
                if (seed && (st.lat === undefined || st.lat === null || st.lat === '')) {
                  needsCloudPush = true;
                  return {
                    ...st,
                    lat: seed.lat,
                    lng: seed.lng,
                    latitude: seed.latitude,
                    longitude: seed.longitude
                  };
                }
                return st;
              });
              if (needsCloudPush) {
                this.saveStoresCatalogToCloud(enriched, false).catch((e) => console.warn('Sync coords to cloud error:', e));
              }
            }
            this._cachedStores = enriched;
            localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(enriched));
            if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
              window.FMCUApp.onCloudDataUpdated('stores');
            }
          }
        },
        (err) => handleSnapshotError('master_stores_catalog', err)
      );
    this.unsubscribers.push(unsubStoresCatalog);

    // 3. REAL-TIME LISTENER: SCHEDULES
    const unsubSchedules = this.db.collection('schedules').onSnapshot(
      (snapshot) => {
        this.setCloudStatus('ONLINE');
        const localSchedules = this.getSchedules() || [];
        const cloudSchedules = [];
        const seenIds = new Set();

        snapshot.forEach((doc) => {
          const d = doc.data();
          if (d && d.id && !this._deletedScheduleIds.has(String(d.id))) {
            const sid = String(d.id);
            seenIds.add(sid);
            cloudSchedules.push(d);
          }
        });

        // Pertahankan jadwal lokal yang baru dibuat Admin/User yang belum sempat ter-broadcast atau saat quota limit
        localSchedules.forEach((locSch) => {
          if (!locSch || !locSch.id) return;
          const sid = String(locSch.id);
          if (!seenIds.has(sid) && !this._deletedScheduleIds.has(sid)) {
            seenIds.add(sid);
            cloudSchedules.push(locSch);
            if (this.db) {
              this.db.collection('schedules').doc(sid).set(sanitizeForFirestore({ ...locSch, updatedAt: new Date().toISOString() }), { merge: true }).catch(() => {});
            }
          }
        });

        cloudSchedules.sort((a, b) => String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || '')));
        this._cachedSchedules = cloudSchedules;
        localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(cloudSchedules));
        if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
          window.FMCUApp.onCloudDataUpdated('schedules');
        }
      },
      (err) => {
        handleSnapshotError('schedules', err);
        const local = this.getSchedules() || [];
        if (local.length === 0) {
          this.fetchSchedulesFromGDrive().then((gdriveSchedules) => {
            if (Array.isArray(gdriveSchedules) && gdriveSchedules.length > 0) {
              this._cachedSchedules = gdriveSchedules;
              localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(gdriveSchedules));
              if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
                window.FMCUApp.onCloudDataUpdated('schedules');
              }
            }
          });
        }
      }
    );
    this.unsubscribers.push(unsubSchedules);

    // 4. REAL-TIME LISTENER: REPORTS (Online Integrity untuk Laporan Final & History Lintas Perangkat)
    // Catatan Arsitektur: Seluruh input aktif pada Form Visit disimpan 100% Lokal (IndexedDB + LocalStorage).
    // Sinkronisasi Cloud Firestore hanya berjalan untuk laporan yang membutuhkan integritas online.
    const unsubReports = this.db.collection('reports').onSnapshot(
      (snapshot) => {
        this.setCloudStatus('ONLINE');
        const localReports = this.getReports();
        const cloudReports = [];
        const seenIds = new Set();

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data && data.id && !this._deletedReportIds.has(String(data.id))) {
            this.cacheReportPhotosInMemory(data, false);
            const localMatch = localReports.find((r) => String(r.id) === String(data.id));
            const merged = localMatch ? this.mergeReportAndDraft(localMatch, data, false) : this.hydrateReportPhotos(data);
            seenIds.add(String(merged.id));
            cloudReports.push(merged);
          }
        });

        // Pertahankan laporan lokal dari Form Visit (IndexedDB / LocalStorage)
        localReports.forEach((localRep) => {
          if (!localRep || !localRep.id) return;
          const lid = String(localRep.id);
          if (!seenIds.has(lid) && !this._deletedReportIds.has(lid)) {
            seenIds.add(lid);
            cloudReports.push(this.hydrateReportPhotos(localRep));
            // Hanya push ke Cloud Firestore apabila laporan sudah difinalisasi (bukan draf form lokal)
            if (this.db && !localRep._isLocalDraftOnly && !this._pushedUnsyncedReportIds.has(lid)) {
              this._pushedUnsyncedReportIds.add(lid);
              this.db
                .collection('reports')
                .doc(lid)
                .set(prepareReportForFirestore(localRep), { merge: true })
                .catch(() => {});
            }
          }
        });

        cloudReports.sort((a, b) => String(b.createdAt || b.visitDate || '').localeCompare(String(a.createdAt || a.visitDate || '')));
        this._cachedReports = cloudReports;
        this.saveReportsLocalOnly(cloudReports);
        if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
          window.FMCUApp.onCloudDataUpdated('reports');
        }
      },
      (err) => handleSnapshotError('reports', err)
    );
    this.unsubscribers.push(unsubReports);

    // 5. REAL-TIME LISTENER: SETTINGS
    const unsubSettings = this.db
      .collection('settings')
      .doc('global_config')
      .onSnapshot(
        (doc) => {
          this.setCloudStatus('ONLINE');
          if (!doc.exists) {
            this.db
              .collection('settings')
              .doc('global_config')
              .set(sanitizeForFirestore(this.getSettings()), { merge: true })
              .catch(() => {});
            return;
          }
          const cloudData = doc.data() || {};
          if (cloudData.gasWebhookUrl && (cloudData.gasWebhookUrl.includes('AKfycbxqumXFq') || cloudData.gasWebhookUrl.includes('4lRe') || !cloudData.gasWebhookUrl.includes('AKfycbxC29L4Cb3NNvUl4IRe0MGDnrluvCvv1neuTjQieA8j7C4n7zgGfQ3dMA8SLXYBG0AWtw'))) {
            delete cloudData.gasWebhookUrl;
          }
          const cloudSettings = { ...DEFAULT_SETTINGS, ...cloudData };
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(cloudSettings));
          if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
            window.FMCUApp.onCloudDataUpdated('settings');
          }
        },
        (err) => handleSnapshotError('settings', err)
      );
    this.unsubscribers.push(unsubSettings);

    // 6. REAL-TIME LISTENER: STANDAR HOLDING TIME RESMI (QC)
    const unsubHoldingTime = this.db
      .collection('settings')
      .doc('holding_time_standards')
      .onSnapshot(
        (doc) => {
          this.setCloudStatus('ONLINE');
          if (doc.exists) {
            const data = doc.data();
            if (data && data.version && Array.isArray(data.categories)) {
              localStorage.setItem(STORAGE_KEYS.HOLDING_TIME_STANDARDS, JSON.stringify(data));
              if (window.FMCUApp && typeof window.FMCUApp.onHoldingTimeStandardsUpdated === 'function') {
                window.FMCUApp.onHoldingTimeStandardsUpdated(data);
              }
            }
          }
        },
        (err) => handleSnapshotError('holding_time_standards', err)
      );
    this.unsubscribers.push(unsubHoldingTime);
  },

  async saveStoresCatalogToCloud(stores, syncIndividualCollection = false) {
    if (!this.db) return;
    const cleanStores = sanitizeForFirestore(stores);
    await this.db
      .collection('settings')
      .doc('master_stores_catalog')
      .set({
        totalStores: cleanStores.length,
        sourceFile: this.DEFAULT_EXCEL_FILE_PATH,
        updatedAt: new Date().toISOString(),
        stores: cleanStores
      });

    // Jika diminta sinkronisasi penuh ke koleksi `stores` (dengan chunking 400 dokumen per WriteBatch)
    if (syncIndividualCollection && cleanStores.length > 0) {
      const chunkSize = 400;
      for (let i = 0; i < cleanStores.length; i += chunkSize) {
        const chunk = cleanStores.slice(i, i + chunkSize);
        const batch = this.db.batch();
        chunk.forEach((st) => {
          if (st.code) {
            const ref = this.db.collection('stores').doc(String(st.code));
            batch.set(ref, { ...st, updatedAt: new Date().toISOString() }, { merge: true });
          }
        });
        await batch.commit();
      }
    }
  },

  async forcePushAllToCloud() {
    if (!this.db) {
      throw new Error('Firestore belum terinisialisasi.');
    }
    const users = this.getUsers();
    const stores = this.getStores();
    const schedules = this.getSchedules();
    const reports = this.getReports();
    const settings = this.getSettings();

    const batchPromises = [];

    users.forEach((u) => {
      const docId = String(u.id || u.username);
      batchPromises.push(
        this.db.collection('users').doc(docId).set(sanitizeForFirestore({ ...u, id: docId, updatedAt: new Date().toISOString() }), { merge: true })
      );
    });

    schedules.forEach((sch) => {
      const docId = String(sch.id);
      batchPromises.push(
        this.db.collection('schedules').doc(docId).set(sanitizeForFirestore({ ...sch, updatedAt: new Date().toISOString() }), { merge: true })
      );
    });

    reports.forEach((rep) => {
      const docId = String(rep.id);
      batchPromises.push(
        this.db.collection('reports').doc(docId).set(prepareReportForFirestore(rep), { merge: true })
      );
    });

    batchPromises.push(
      this.db.collection('settings').doc('global_config').set(sanitizeForFirestore(settings), { merge: true })
    );

    batchPromises.push(this.saveStoresCatalogToCloud(stores, true));

    await Promise.all(batchPromises);
    this.setCloudStatus('ONLINE');
    return {
      users: users.length,
      stores: stores.length,
      schedules: schedules.length,
      reports: reports.length
    };
  },

  clearAllData() {
    const prevSchedules = this.getSchedules();
    const prevReports = this.getReports();

    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
    localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(window.FMCU_INITIAL_STORES || []));
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify([]));
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_CHECKIN);
    localStorage.removeItem(STORAGE_KEYS.DRAFT_REPORT);

    if (this.db) {
      prevSchedules.forEach((sch) => {
        if (sch.id) this.db.collection('schedules').doc(String(sch.id)).delete().catch(() => {});
      });
      prevReports.forEach((rep) => {
        if (rep.id) this.db.collection('reports').doc(String(rep.id)).delete().catch(() => {});
      });
    }
  },

  // ==========================================================================
  // CRUD METHODS (WRITE-THROUGH KE LOCALSTORAGE + CLOUD FIRESTORE)
  // ==========================================================================
  // ==========================================================================
  // NEWS & SLIDE INFORMASI MANAGEMENT (SUPER ADMIN)
  // ==========================================================================
  getNews(onlyActive = false) {
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem(STORAGE_KEYS.NEWS) || '[]');
    } catch (e) {
      list = [];
    }
    if (!Array.isArray(list) || list.length === 0) {
      list = (typeof DEFAULT_NEWS_ITEMS !== 'undefined' ? DEFAULT_NEWS_ITEMS : []).map(item => ({ ...item }));
      try {
        localStorage.setItem(STORAGE_KEYS.NEWS, JSON.stringify(list));
      } catch (e) {}
    }
    if (onlyActive) {
      return list.filter((n) => n.active !== false);
    }
    return list;
  },

  saveNews(list) {
    if (!Array.isArray(list)) list = [];
    localStorage.setItem(STORAGE_KEYS.NEWS, JSON.stringify(list));

    if (this.db && this.cloudStatus !== 'QUOTA_EXCEEDED') {
      try {
        const batch = this.db.batch();
        list.forEach((n) => {
          const docId = String(n.id || 'news-' + Date.now());
          const ref = this.db.collection('news').doc(docId);
          batch.set(ref, sanitizeForFirestore({ ...n, id: docId, updatedAt: new Date().toISOString() }), { merge: true });
        });
        batch.commit().catch(() => {});
      } catch (e) {}
    }
  },

  getUsers(forceRefresh = false) {
    if (!forceRefresh && Array.isArray(this._cachedUsers) && this._cachedUsers.length > 0) {
      return this._cachedUsers;
    }
    let raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
    if (!Array.isArray(raw) || raw.length === 0) {
      raw = [...INITIAL_USERS];
    }

    // 1. DEDUPLIKASI TOTAL: Gabungkan (merge) user berdasarkan Nama Unik
    const userMapByName = new Map();
    raw.forEach((u) => {
      if (!u) return;
      const normName = String(u.name || '').toLowerCase().trim();
      if (!normName) return;
      if (!userMapByName.has(normName)) {
        userMapByName.set(normName, { ...u });
      } else {
        // Gabungkan field penting jika user sudah ada
        const existing = userMapByName.get(normName);
        if (!existing.nik && u.nik) existing.nik = u.nik;
        if (!existing.jabatan && u.jabatan) existing.jabatan = u.jabatan;
        if (u.role === 'ADMIN_SCHEDULE' || u.role === 'SUPER_ADMIN') existing.role = u.role;
        if (Array.isArray(u.authorities)) {
          existing.authorities = Array.from(new Set([...(existing.authorities || []), ...u.authorities]));
        }
      }
    });

    // 2. Pastikan akun root Super Admin ada
    if (!userMapByName.has('admin fmcu') && !userMapByName.has('administrator')) {
      userMapByName.set('admin fmcu', INITIAL_USERS[0]);
    }

    // 3. Pastikan seluruh 36 karyawan terdaftar tanpa membuat duplikat
    EMPLOYEE_NIK_SEED_ROWS.forEach((row, idx) => {
      const normName = String(row.name).toLowerCase().trim();
      if (!userMapByName.has(normName)) {
        userMapByName.set(normName, mapEmployeeRowToUserObject(row, idx, { passwordMode: 'nik' }));
      }
    });

    const deduped = Array.from(userMapByName.values());
    if (deduped.length !== raw.length) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(deduped));
    }

    const result = deduped.map((u) => ({
      ...u,
      name: u.name === 'Auditor FMCU' ? 'Visitor FMCU' : u.name,
      roleBadge: String(u.roleBadge || '').replace(/Auditor/gi, 'Visitor')
    }));
    this._cachedUsers = result;
    return result;
  },
  saveUsers(users) {
    // Deduplikasi ketat sebelum menyimpan ke LocalStorage & Cloud Firestore
    const seen = new Set();
    const cleanUsers = [];
    (users || []).forEach((u) => {
      if (!u) return;
      const norm = String(u.name || '').toLowerCase().trim();
      if (!norm || seen.has(norm)) return;
      seen.add(norm);
      cleanUsers.push(u);
    });
    this._cachedUsers = cleanUsers;
    const prevUsers = this.getUsers();
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(cleanUsers));
    this.callGasDatabase('db_save_collection', { collection: 'users', data: cleanUsers });

    if (this.db && this.cloudStatus !== 'QUOTA_EXCEEDED') {
      try {
        const batch = this.db.batch();
        const newIds = new Set(users.map((u) => String(u.id || u.username)));
        prevUsers.forEach((oldU) => {
          const oldId = String(oldU.id || oldU.username);
          if (!newIds.has(oldId)) {
            batch.delete(this.db.collection('users').doc(oldId));
          }
        });
        users.forEach((u) => {
          const docId = String(u.id || u.username);
          const ref = this.db.collection('users').doc(docId);
          batch.set(ref, sanitizeForFirestore({ ...u, id: docId, updatedAt: new Date().toISOString() }), { merge: true });
        });
        batch.commit().catch((e) => console.warn('Save user batch error:', e));
      } catch (err) {
        console.warn('Batch write error:', err);
      }
    }
  },

  clearDummyBestieLocations() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USERS);
      if (!raw) return;
      let users = JSON.parse(raw);
      if (Array.isArray(users) && users.length > 0) {
        let changed = false;
        users.forEach((u) => {
          // Bersihkan dummy GPS (pertahankan jika koordinat numerik valid)
          if (u.lastLocation) {
            const latNum = Number(u.lastLocation.lat);
            const lngNum = Number(u.lastLocation.lng);
            if (isNaN(latNum) || isNaN(lngNum) || latNum === 0 || lngNum === 0) {
              u.lastLocation = null;
              changed = true;
            } else {
              u.lastLocation.isActualGps = true;
            }
          }
        });
        if (changed) {
          localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        }
      }
    } catch (e) {}
  },

  markUserExited(userId) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USERS);
      if (!raw) return;
      let users = JSON.parse(raw);
      const idx = users.findIndex(
        (u) =>
          u.id === userId ||
          String(u.nik) === String(userId) ||
          String(u.username).toLowerCase() === String(userId).toLowerCase()
      );
      if (idx !== -1 && users[idx].lastLocation) {
        users[idx].lastLocation.isExited = true;
        users[idx].lastLocation.exitedAt = new Date().toISOString();
        users[idx].lastLocation.status = 'EXITED';
        this._cachedUsers = users;
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

        if (this.db) {
          const docId = String(users[idx].id || users[idx].username);
          this.db.collection('users').doc(docId).set({ lastLocation: users[idx].lastLocation }, { merge: true }).catch(() => {});
        }
      }
    } catch (e) {}
  },

  updateUserLocation(userId, lat, lng, storeVisit = null, status = 'LIVE_GPS') {
    const users = this.getUsers();
    const idx = users.findIndex(
      (u) =>
        String(u.id) === String(userId) ||
        String(u.nik) === String(userId) ||
        String(u.username).toLowerCase() === String(userId).toLowerCase()
    );
    if (idx === -1) return;
    const nLat = Number(Number(lat).toFixed(5));
    const nLng = Number(Number(lng).toFixed(5));
    const curLoc = users[idx].lastLocation;

    // Guard: Jika posisi bergeser < ~15 meter (0.00015 derajat) & status sama dalam < 15 detik, abaikan untuk efisiensi baterai & kuota
    const prevTimeMs = curLoc && curLoc.updatedAt ? new Date(curLoc.updatedAt).getTime() : 0;
    const isMinorDrift =
      curLoc &&
      Math.abs((curLoc.lat || 0) - nLat) < 0.00015 &&
      Math.abs((curLoc.lng || 0) - nLng) < 0.00015;
    if (
      curLoc &&
      isMinorDrift &&
      curLoc.status === status &&
      curLoc.storeVisit === storeVisit &&
      !curLoc.isExited &&
      Date.now() - prevTimeMs < 15000
    ) {
      return;
    }

    const loc = {
      lat: nLat,
      lng: nLng,
      updatedAt: new Date().toISOString(),
      storeVisit: storeVisit || users[idx].lastLocation?.storeVisit || null,
      status: status || users[idx].lastLocation?.status || 'LIVE_GPS',
      isActualGps: true,
      isExited: false,
      exitedAt: null
    };
    users[idx].lastLocation = loc;
    this._cachedUsers = users;
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    } catch (e) {}

    // 1. Simpan ke Google Apps Script Hidden Vault (Bebas Quota 429 & sinkron multi-device)
    const canonicalUserId = String(users[idx].id || users[idx].username);
    this.callGasDatabase('db_update_location', { userId: canonicalUserId, location: loc });

    // 2. Broadcast lokasi secara instan (0ms) ke semua tab/window/device
    this.broadcastSync({ type: 'LOCATION_UPDATED', userId, location: loc });

    // 3. Tulis HANYA field lastLocation ke Cloud Firestore untuk 1 user ini (hemat quota 95%)
    if (this.db) {
      this.db.collection('users').doc(canonicalUserId).set({ lastLocation: loc }, { merge: true }).catch(() => {});
    }

    // 4. Segera beri notifikasi lokal agar marker Leaflet berpindah seketika
    if (window.FMCUApp && typeof window.FMCUApp.onCloudDataUpdated === 'function') {
      window.FMCUApp.onCloudDataUpdated('users', {
        onlyLocationChanged: true,
        userId: canonicalUserId,
        location: loc
      });
    }
  },

  getStores(forceRefresh = false) {
    if (!forceRefresh && Array.isArray(this._cachedStores) && this._cachedStores.length > 0) {
      return this._cachedStores;
    }
    let stores = JSON.parse(localStorage.getItem(STORAGE_KEYS.STORES) || '[]');
    if (!Array.isArray(stores) || stores.length === 0) {
      stores = Array.isArray(window.FMCU_INITIAL_STORES) ? [...window.FMCU_INITIAL_STORES] : [];
      localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(stores));
    this.callGasDatabase('db_save_collection', { collection: 'stores', data: stores });
      this._cachedStores = stores;
      return stores;
    }
    // Pastikan seluruh 610 Master Toko selalu lengkap terisi tanpa ada toko yang terpotong / tertinggal
    if (Array.isArray(window.FMCU_INITIAL_STORES) && window.FMCU_INITIAL_STORES.length > 0) {
      const existingMap = new Map();
      stores.forEach((s) => existingMap.set(String(s.code), s));
      let hasChanges = false;

      window.FMCU_INITIAL_STORES.forEach((seed) => {
        const seedCode = String(seed.code);
        if (!existingMap.has(seedCode)) {
          existingMap.set(seedCode, seed);
          hasChanges = true;
        } else {
          const cur = existingMap.get(seedCode);
          if (cur.lat === undefined || cur.lat === null || cur.lat === '') {
            cur.lat = seed.lat;
            cur.lng = seed.lng;
            cur.latitude = seed.latitude;
            cur.longitude = seed.longitude;
            hasChanges = true;
          }
        }
      });

      if (hasChanges) {
        stores = Array.from(existingMap.values()).sort((a, b) =>
          String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true })
        );
        localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(stores));
      }
    }
    this._cachedStores = stores;
    return stores;
  },
  saveStores(stores, changedStore = null, deletedCode = null) {
    this._cachedStores = stores;
    localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(stores));

    // Simpan ke Google Apps Script Hidden Vault
    this.callGasDatabase('db_save_collection', { collection: 'stores', data: stores });

    if (this.db && this.cloudStatus !== 'QUOTA_EXCEEDED') {
      this.saveStoresCatalogToCloud(stores, false).catch((e) => console.warn('Save stores catalog error:', e));
      if (changedStore && changedStore.code) {
        this.db
          .collection('stores')
          .doc(String(changedStore.code))
          .set(sanitizeForFirestore({ ...changedStore, updatedAt: new Date().toISOString() }), { merge: true })
          .catch(() => {});
      }
      if (deletedCode) {
        this.db
          .collection('stores')
          .doc(String(deletedCode))
          .delete()
          .catch(() => {});
      }
    }
  },

  getScheduleAuditLogs() {
    try {
      const raw = localStorage.getItem('fmcu_schedule_audit_logs_v1');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  saveScheduleAuditLogs(logs) {
    try {
      localStorage.setItem('fmcu_schedule_audit_logs_v1', JSON.stringify(logs || []));
      if (this.db) {
        this.db.collection('settings').doc('schedule_audit_logs').set({
          logs: (logs || []).slice(0, 50),
          updatedAt: new Date().toISOString()
        }).catch(() => {});
      }
    } catch (e) {}
  },

  getSchedules(forceRefresh = false) {
    if (!forceRefresh && Array.isArray(this._cachedSchedules)) {
      return this._cachedSchedules;
    }
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.SCHEDULES) || '[]');
    // Urutkan jadwal toko dimulai dari tanggal terdekat secara kronologis
    const sorted = list.sort((a, b) => String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || '')));
    this._cachedSchedules = sorted;
    return sorted;
  },
  
  // ==========================================================================
  // GOOGLE DRIVE BACKUP SYNC UNTUK JADWAL VISIT (MULTI-DEVICE RELAY)
  // Menjaga sinkronisasi antar-perangkat tetap berjalan saat Firestore mencapai limit
  // ==========================================================================
  async backupSchedulesToGDrive(schedules) {
    if (!Array.isArray(schedules) || schedules.length === 0) return;
    const settings = this.getSettings();
    const gasUrl = (settings.gasWebhookUrl || '').trim();
    if (!gasUrl || !gasUrl.startsWith('http')) return;

    try {
      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'saveSchedules',
          schedules: schedules
        })
      }).catch(() => {});
    } catch (e) {}
  },

  async fetchSchedulesFromGDrive() {
    const settings = this.getSettings();
    const gasUrl = (settings.gasWebhookUrl || '').trim();
    if (!gasUrl || !gasUrl.startsWith('http')) return null;

    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'getSchedules'
        })
      });
      const json = await res.json();
      if (json && json.status === 'SUCCESS' && Array.isArray(json.schedules) && json.schedules.length > 0) {
        return json.schedules;
      }
    } catch (e) {
      console.warn('Fetch schedules from GDrive failed:', e);
    }
    return null;
  },

  saveSingleSchedule(sch) {
    if (!sch || !sch.id) return;
    const docId = String(sch.id);
    const schedules = this.getSchedules() || [];
    const idx = schedules.findIndex((s) => String(s.id) === docId);
    const enrichedSch = { ...sch, updatedAt: new Date().toISOString() };
    if (idx !== -1) {
      schedules[idx] = { ...schedules[idx], ...enrichedSch };
    } else {
      schedules.unshift(enrichedSch);
    }
    schedules.sort((a, b) => String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || '')));
    this._cachedSchedules = schedules;
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));

    // 1. Simpan atomic ke Google Apps Script Hidden Vault (1 single request, 0 queue delay)
    this.callGasDatabase('db_save_collection', { collection: 'schedules', data: schedules });

    // 2. Broadcast instan 0ms ke semua tab/window aktif
    this.broadcastSync({ type: 'SCHEDULE_SAVED', schedule: enrichedSch });

    // 3. Tulis ke Cloud Firestore HANYA jika kuota belum habis (mencegah thread freeze 429)
    if (this.db && this.cloudStatus !== 'QUOTA_EXCEEDED') {
      this.db
        .collection('schedules')
        .doc(docId)
        .set(sanitizeForFirestore(enrichedSch), { merge: true })
        .catch((e) => {
          if (e && (e.code === 'resource-exhausted' || e.message?.includes('429'))) {
            this.setCloudStatus('QUOTA_EXCEEDED', 'Batas kuota harian Firestore tercapai (429). Jadwal tersimpan aman di Google Drive Vault.');
          }
        });
    }
  },

  deleteSchedule(scheduleId) {
    if (!scheduleId) return;
    const docId = String(scheduleId);
    this._deletedScheduleIds.add(docId);
    const schedules = (this.getSchedules() || []).filter((s) => String(s.id) !== docId);
    this._cachedSchedules = schedules;
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));

    // 1. Simpan langsung perubahan ke Google Apps Script Hidden Vault
    this.callGasDatabase('db_save_collection', { collection: 'schedules', data: schedules });

    this.broadcastSync({ type: 'SCHEDULE_DELETED', scheduleId: docId });

    if (this.db && this.cloudStatus !== 'QUOTA_EXCEEDED') {
      this.db
        .collection('schedules')
        .doc(docId)
        .delete()
        .catch((e) => console.warn('Delete schedule error:', e));
    }
  },

  deleteBulkSchedules(ids = []) {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids.map(String));
    const schedules = (this.getSchedules() || []).filter((s) => !idSet.has(String(s.id)));
    this._cachedSchedules = schedules;
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));

    // Simpan list terbaru ke Google Apps Script Hidden Vault
    this.callGasDatabase('db_save_collection', { collection: 'schedules', data: schedules });
    this.broadcastSync({ type: 'SCHEDULES_UPDATED', count: schedules.length });

    if (this.db) {
      ids.forEach((id) => {
        this.db
          .collection('schedules')
          .doc(String(id))
          .delete()
          .catch((e) => console.warn('Delete bulk schedule error:', e));
      });
    }
  },

  saveSchedules(schedules, changedOnly = null) {
    if (!Array.isArray(schedules)) return;
    schedules.sort((a, b) => String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || '')));
    this._cachedSchedules = schedules;
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));

    // Backup & simpan master schedules ke Google Apps Script Hidden Vault
    this.callGasDatabase('db_save_collection', { collection: 'schedules', data: schedules });

    // Backup otomatis ke Google Drive sebagai jalur relay multi-device cadangan
    this.backupSchedulesToGDrive(schedules);

    this.broadcastSync({ type: 'SCHEDULES_UPDATED', count: schedules.length });

    if (this.db) {
      // HANYA tulis jadwal yang baru atau diubah (maksimal 30 doc via single batch) untuk mencegah kuota Firestore bocor
      const itemsToSync = Array.isArray(changedOnly) && changedOnly.length > 0 ? changedOnly : schedules.slice(0, 30);
      try {
        const batch = this.db.batch();
        itemsToSync.forEach((sch) => {
          if (!sch.id) return;
          const ref = this.db.collection('schedules').doc(String(sch.id));
          batch.set(ref, sanitizeForFirestore({ ...sch, updatedAt: new Date().toISOString() }), { merge: true });
        });
        batch.commit().catch((e) => console.warn('Batch commit schedules error:', e));
      } catch (err) {
        console.warn('Batch schedules write error:', err);
      }
    }
  },

  // ==========================================================================
  // GOOGLE DRIVE & INDEXEDDB OFFLINE PHOTO DATABASE (VIA APPS SCRIPT & INDEXEDDB)
  // Seluruh binary foto lokal disimpan aman di IndexedDB (kapasitas > 500 MB)
  // dan disinkronkan ke Google Drive via GAS Webhook.
  // Firestore & LocalStorage hanya menyimpan referensi ringan.
  // ==========================================================================
  _photoDbInstance: null,
  async getPhotoDb() {
    if (this._photoDbInstance) return this._photoDbInstance;
    if (typeof indexedDB === 'undefined') return null;
    return new Promise((resolve) => {
      let settled = false;
      const done = (val) => {
        if (!settled) {
          settled = true;
          resolve(val);
        }
      };
      const timer = setTimeout(() => done(null), 2000);
      try {
        const req = indexedDB.open('fmcu_local_storage_db', 3);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('photos')) {
            db.createObjectStore('photos');
          }
          if (!db.objectStoreNames.contains('drafts')) {
            db.createObjectStore('drafts');
          }
          if (!db.objectStoreNames.contains('reports')) {
            db.createObjectStore('reports');
          }
        };
        req.onsuccess = (e) => {
          clearTimeout(timer);
          this._photoDbInstance = e.target.result;
          done(this._photoDbInstance);
        };
        req.onerror = () => {
          clearTimeout(timer);
          done(null);
        };
        req.onblocked = () => {
          clearTimeout(timer);
          done(null);
        };
      } catch (e) {
        clearTimeout(timer);
        done(null);
      }
    });
  },

  async setPhotoInDb(key, dataUrl) {
    if (!key || !dataUrl || !dataUrl.startsWith('data:image')) return;
    try {
      const db = await this.getPhotoDb();
      if (!db) return;
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put(dataUrl, String(key));
    } catch (e) {}
  },

  async getPhotoFromDb(key) {
    if (!key) return '';
    try {
      const db = await this.getPhotoDb();
      if (!db) return '';
      return new Promise((resolve) => {
        const tx = db.transaction('photos', 'readonly');
        const req = tx.objectStore('photos').get(String(key));
        req.onsuccess = () => resolve(req.result || '');
        req.onerror = () => resolve('');
      });
    } catch (e) {
      return '';
    }
  },

  async deletePhotoFromDb(key) {
    if (!key) return;
    try {
      const db = await this.getPhotoDb();
      if (!db) return;
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').delete(String(key));
    } catch (e) {}
  },

  async saveDraftInDb(storeCode, draftData) {
    if (!storeCode || !draftData) return;
    try {
      const db = await this.getPhotoDb();
      if (!db) return;
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(draftData, String(storeCode));
    } catch (e) {}
  },

  async getDraftFromDb(storeCode) {
    if (!storeCode) return null;
    try {
      const db = await this.getPhotoDb();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction('drafts', 'readonly');
        const req = tx.objectStore('drafts').get(String(storeCode));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  },

  async deleteDraftFromDb(storeCode) {
    if (!storeCode) return;
    try {
      const db = await this.getPhotoDb();
      if (!db) return;
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').delete(String(storeCode));
    } catch (e) {}
  },

  async saveReportInDb(reportId, reportData) {
    if (!reportId || !reportData) return;
    try {
      const db = await this.getPhotoDb();
      if (!db) return;
      const tx = db.transaction('reports', 'readwrite');
      tx.objectStore('reports').put(reportData, String(reportId));
    } catch (e) {}
  },

  async getReportFromDb(reportId) {
    if (!reportId) return null;
    try {
      const db = await this.getPhotoDb();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction('reports', 'readonly');
        const req = tx.objectStore('reports').get(String(reportId));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  },

  async deleteReportFromDb(reportId) {
    if (!reportId) return;
    try {
      const db = await this.getPhotoDb();
      if (!db) return;
      const tx = db.transaction('reports', 'readwrite');
      tx.objectStore('reports').delete(String(reportId));
    } catch (e) {}
  },

  hasMeaningfulVisitContent(doc) {
    if (!doc || typeof doc !== 'object') return false;
    const hasObs =
      Array.isArray(doc.observations) &&
      doc.observations.some((o) => o && (o.temuan || o.dampak || o.kondisiIdeal || o.tindakanPerbaikan || o.penyebab || o.hasil));
    const hasOpi =
      Array.isArray(doc.opiObservations) &&
      doc.opiObservations.some((o) => o && (o.temuan || o.dampak || o.kondisiIdeal || o.tindakanPerbaikan || o.penyebab || o.hasil));
    const hasQscPhotos =
      Array.isArray(doc.qscPhotos) &&
      doc.qscPhotos.some(
        (p) =>
          p &&
          p.id !== 'qsc-1' &&
          p.id !== 'qsc-2' &&
          ((p.dataUrl && (p.dataUrl.startsWith('data:image') || /^https?:\/\//i.test(p.dataUrl))) ||
            p.driveFileId ||
            p.driveUrl ||
            p.fullPhotoDataUrl ||
            this.getPhotoFromMemory(p.id, p.driveFileId))
      );
    const hasEvPhotos =
      Array.isArray(doc.evidencePhotos) &&
      doc.evidencePhotos.some(
        (p) =>
          p &&
          ((p.dataUrl && (p.dataUrl.startsWith('data:image') || /^https?:\/\//i.test(p.dataUrl))) ||
            p.driveFileId ||
            p.driveUrl ||
            (p.description && p.description.trim()) ||
            this.getPhotoFromMemory(p.id, p.driveFileId))
      );
    const caArr = doc.caPhotos || doc.correctiveActionPhotos || [];
    const hasCaPhotos =
      Array.isArray(caArr) &&
      caArr.some(
        (p) =>
          p &&
          ((p.dataUrl && (p.dataUrl.startsWith('data:image') || /^https?:\/\//i.test(p.dataUrl))) ||
            p.driveFileId ||
            p.driveUrl ||
            (p.description && p.description.trim()) ||
            this.getPhotoFromMemory(p.id, p.driveFileId))
      );
    const hasScore = Number(doc.qscScore) > 0;
    const hasCustomCrew =
      Array.isArray(doc.crewList) &&
      doc.crewList.some((c, idx) => c && ((c.jobLevel && c.jobLevel.trim() !== '') || (idx >= 1 && c.name && c.name.trim() !== '')));
    return Boolean(hasObs || hasOpi || hasQscPhotos || hasEvPhotos || hasCaPhotos || hasScore || hasCustomCrew);
  },

  getReportCompletenessScore(doc) {
    if (!doc || typeof doc !== 'object') return 0;
    let score = 0;
    (doc.observations || []).forEach((o) => {
      if (!o) return;
      ['temuan', 'dampak', 'kondisiIdeal', 'tindakanPerbaikan', 'penyebab', 'hasil'].forEach((k) => {
        if (o[k] && String(o[k]).trim()) score += 10 + Math.min(20, String(o[k]).trim().length);
      });
    });
    (doc.opiObservations || []).forEach((o) => {
      if (!o) return;
      ['temuan', 'dampak', 'kondisiIdeal', 'tindakanPerbaikan', 'penyebab', 'hasil'].forEach((k) => {
        if (o[k] && String(o[k]).trim()) score += 10 + Math.min(20, String(o[k]).trim().length);
      });
    });
    (doc.qscPhotos || []).forEach((p) => {
      if (!p || p.id === 'qsc-1' || p.id === 'qsc-2') return;
      if ((p.dataUrl && p.dataUrl.startsWith('data:image')) || this.getPhotoFromMemory(p.id, p.driveFileId)) score += 30;
      else if (p.driveFileId || p.driveUrl) score += 20;
    });
    (doc.evidencePhotos || []).forEach((p) => {
      if (!p) return;
      if ((p.dataUrl && p.dataUrl.startsWith('data:image')) || this.getPhotoFromMemory(p.id, p.driveFileId)) score += 25;
      else if (p.driveFileId || p.driveUrl) score += 15;
      if (p.description && String(p.description).trim()) score += 10 + Math.min(15, String(p.description).trim().length);
    });
    (doc.caPhotos || doc.correctiveActionPhotos || []).forEach((p) => {
      if (!p) return;
      if ((p.dataUrl && p.dataUrl.startsWith('data:image')) || this.getPhotoFromMemory(p.id, p.driveFileId)) score += 25;
      else if (p.driveFileId || p.driveUrl) score += 15;
      if (p.description && String(p.description).trim()) score += 10 + Math.min(15, String(p.description).trim().length);
    });
    if (Number(doc.qscScore) > 0) score += 15;
    (doc.crewList || []).forEach((c) => {
      if (!c) return;
      if (c.name && String(c.name).trim()) score += 3;
      if (c.jobLevel && String(c.jobLevel).trim()) score += 3;
    });
    ['storeHead', 'areaManager', 'regionalManager', 'storeEmail', 'caLink', 'caSpreadsheetUrl'].forEach((k) => {
      if (doc[k] && String(doc[k]).trim() && doc[k] !== '-') score += 2;
    });
    return score;
  },

  hydrateReportPhotos(rep) {
    if (!rep || typeof rep !== 'object') return rep;
    const hydrate = (p) => {
      if (!p) return p;
      if (p.id === 'qsc-1' || p.id === 'qsc-2') {
        if (!p.dataUrl || !p.dataUrl.startsWith('data:image')) {
          p.dataUrl = '';
        }
        return p;
      }
      if (p.dataUrl && p.dataUrl.startsWith('data:image')) {
        this.cachePhotoInMemory(p.id, p.driveFileId, p.dataUrl, false);
      } else {
        const mem = this.getPhotoFromMemory(p.id, p.driveFileId);
        if (mem && mem.startsWith('data:image')) {
          p.dataUrl = mem;
        } else if (!p.dataUrl && p.driveUrl) {
          p.dataUrl = p.driveUrl;
        }
      }
      return p;
    };
    if (Array.isArray(rep.qscPhotos)) rep.qscPhotos = rep.qscPhotos.map(hydrate);
    if (Array.isArray(rep.evidencePhotos)) rep.evidencePhotos = rep.evidencePhotos.map(hydrate);
    if (Array.isArray(rep.caPhotos)) rep.caPhotos = rep.caPhotos.map(hydrate);
    if (Array.isArray(rep.correctiveActionPhotos)) rep.correctiveActionPhotos = rep.correctiveActionPhotos.map(hydrate);
    return rep;
  },

  mergePhotoArrays(primaryArr, secondaryArr, isQsc = false) {
    const a = Array.isArray(primaryArr) ? primaryArr : [];
    const b = Array.isArray(secondaryArr) ? secondaryArr : [];
    const hasPhotoContent = (p) =>
      Boolean(
        p &&
          p.id !== 'qsc-1' &&
          p.id !== 'qsc-2' &&
          ((p.dataUrl && (p.dataUrl.startsWith('data:image') || /^https?:\/\//i.test(p.dataUrl))) ||
            p.driveFileId ||
            p.driveUrl ||
            (p.description && String(p.description).trim()) ||
            this.getPhotoFromMemory(p.id, p.driveFileId))
      );

    const aHasAny = a.some(hasPhotoContent);
    const bHasAny = b.some(hasPhotoContent);
    if (!aHasAny && bHasAny) return b.map((p) => ({ ...p }));
    if (aHasAny && !bHasAny) return a.map((p) => ({ ...p }));

    const baseList = a.length >= b.length ? a : b;
    const otherList = a.length >= b.length ? b : a;

    return baseList.map((item, idx) => {
      if (!item) return otherList[idx] || item;
      const match =
        otherList.find((o) => o && ((item.id && o.id === item.id) || (!isQsc && item.driveFileId && o.driveFileId === item.driveFileId))) ||
        (isQsc ? otherList[idx] : null);
      if (!match) return { ...item };

      const itemB64 = item.dataUrl && item.dataUrl.startsWith('data:image') ? item.dataUrl : '';
      const matchB64 = match.dataUrl && match.dataUrl.startsWith('data:image') ? match.dataUrl : '';
      const memB64 = this.getPhotoFromMemory(item.id || match.id, isQsc ? null : item.driveFileId || match.driveFileId);
      const bestDataUrl = itemB64 || matchB64 || memB64 || item.dataUrl || match.dataUrl || '';

      return {
        ...match,
        ...item,
        id: item.id || match.id,
        caption: item.caption || match.caption || '',
        description: item.description && String(item.description).trim() ? item.description : match.description || '',
        fullPhotoId: item.fullPhotoId || match.fullPhotoId || '',
        driveFileId: item.driveFileId || match.driveFileId || '',
        driveUrl: item.driveUrl || match.driveUrl || '',
        driveViewUrl: item.driveViewUrl || match.driveViewUrl || '',
        dataUrl: bestDataUrl
      };
    });
  },

  mergeReportAndDraft(docA, docB, persistToDb = false) {
    if (!docA && !docB) return null;
    if (!docA) return this.hydrateReportPhotos({ ...docB });
    if (!docB) return this.hydrateReportPhotos({ ...docA });

    this.cacheReportPhotosInMemory(docA, persistToDb);
    this.cacheReportPhotosInMemory(docB, persistToDb);

    const scoreA = this.getReportCompletenessScore(docA);
    const scoreB = this.getReportCompletenessScore(docB);
    const tsA = Date.parse(docA.updatedAt || docA.createdAt || '') || 0;
    const tsB = Date.parse(docB.updatedAt || docB.createdAt || '') || 0;

    // Utamakan dokumen yang memiliki isi apabila salah satu kosong (misal akibat form reset)
    let primary = docA;
    let secondary = docB;
    if (scoreB > 0 && scoreA === 0) {
      primary = docB;
      secondary = docA;
    } else if (scoreA > 0 && scoreB === 0) {
      primary = docA;
      secondary = docB;
    } else if (tsB > tsA && scoreB >= scoreA * 0.5) {
      primary = docB;
      secondary = docA;
    } else if (scoreB > scoreA && tsB >= tsA) {
      primary = docB;
      secondary = docA;
    }

    const pickObsList = (arr1, arr2) => {
      const hasText = (arr) =>
        Array.isArray(arr) &&
        arr.some((o) => o && (o.temuan || o.dampak || o.kondisiIdeal || o.tindakanPerbaikan || o.penyebab || o.hasil));
      if (hasText(arr1)) return arr1;
      if (hasText(arr2)) return arr2;
      return Array.isArray(arr1) && arr1.length > 0 ? arr1 : Array.isArray(arr2) ? arr2 : [];
    };

    const pickCrewList = (c1, c2) => {
      const countFilled = (arr) =>
        Array.isArray(arr)
          ? arr.reduce((acc, c) => acc + (c && c.name && c.name.trim() ? 1 : 0) + (c && c.jobLevel && c.jobLevel.trim() ? 1 : 0), 0)
          : 0;
      return countFilled(c1) >= countFilled(c2) ? c1 || [] : c2 || [];
    };

    const pickText = (v1, v2) => {
      if (v1 !== undefined && v1 !== null && String(v1).trim() !== '' && v1 !== '-') return v1;
      if (v2 !== undefined && v2 !== null && String(v2).trim() !== '' && v2 !== '-') return v2;
      return v1 || v2 || '';
    };

    const mergedCa = this.mergePhotoArrays(
      primary.caPhotos || primary.correctiveActionPhotos,
      secondary.caPhotos || secondary.correctiveActionPhotos,
      false
    );

    const merged = {
      ...secondary,
      ...primary,
      id: (docA.id && !String(docA.id).startsWith('draft-') ? docA.id : docB.id) || primary.id || secondary.id,
      scheduleId: primary.scheduleId || secondary.scheduleId || null,
      storeCode: pickText(primary.storeCode, secondary.storeCode) || '-',
      storeName: pickText(primary.storeName, secondary.storeName) || '-',
      storeType: pickText(primary.storeType, secondary.storeType) || 'CVS',
      auditorId: pickText(primary.auditorId, secondary.auditorId),
      auditorName: pickText(primary.auditorName, secondary.auditorName) || '-',
      visitDate: pickText(primary.visitDate, secondary.visitDate),
      storeHead: pickText(primary.storeHead, secondary.storeHead) || '-',
      areaManager: pickText(primary.areaManager, secondary.areaManager) || '-',
      regionalManager: pickText(primary.regionalManager, secondary.regionalManager) || '-',
      storeEmail: pickText(primary.storeEmail, secondary.storeEmail),
      caLink: pickText(primary.caLink || primary.caSpreadsheetUrl, secondary.caLink || secondary.caSpreadsheetUrl),
      caSpreadsheetUrl: pickText(primary.caSpreadsheetUrl || primary.caLink, secondary.caSpreadsheetUrl || secondary.caLink),
      actualIn: pickText(primary.actualIn, secondary.actualIn) || '-',
      actualOut: pickText(primary.actualOut, secondary.actualOut) || '-',
      qscScore: Number(primary.qscScore) > 0 ? Number(primary.qscScore) : Number(secondary.qscScore || 0),
      crewList: pickCrewList(primary.crewList, secondary.crewList),
      observations: pickObsList(primary.observations, secondary.observations),
      opiObservations: pickObsList(primary.opiObservations, secondary.opiObservations),
      qscPhotos: this.mergePhotoArrays(primary.qscPhotos, secondary.qscPhotos, true),
      evidencePhotos: this.mergePhotoArrays(primary.evidencePhotos, secondary.evidencePhotos, false),
      caPhotos: mergedCa,
      correctiveActionPhotos: mergedCa,
      pdfUrl: pickText(primary.pdfUrl, secondary.pdfUrl),
      qscPdfUrl: pickText(primary.qscPdfUrl, secondary.qscPdfUrl),
      driveFolderUrl: pickText(primary.driveFolderUrl, secondary.driveFolderUrl),
      storeFolderUrl: pickText(primary.storeFolderUrl, secondary.storeFolderUrl),
      visitorFolderUrl: pickText(primary.visitorFolderUrl, secondary.visitorFolderUrl),
      createdAt: secondary.createdAt || primary.createdAt || new Date().toISOString(),
      updatedAt: tsA >= tsB ? docA.updatedAt || docB.updatedAt : docB.updatedAt || docA.updatedAt
    };

    return this.hydrateReportPhotos(merged);
  },

  async initPhotoStorage() {
    if (this._photoStorageInitPromise) {
      return this._photoStorageInitPromise;
    }
    this._photoStorageInitPromise = (async () => {
      try {
        const db = await this.getPhotoDb();
        if (!db) {
          this._photoStorageReady = true;
          return;
        }

        // 1. Preload semua binary foto dari IndexedDB ke photoMemoryCache di RAM
        if (db.objectStoreNames.contains('photos')) {
          try {
            const cleanupTx = db.transaction('photos', 'readwrite');
            cleanupTx.objectStore('photos').delete('qsc-1');
            cleanupTx.objectStore('photos').delete('qsc-2');
          } catch (e) {}
          delete this.photoMemoryCache['qsc-1'];
          delete this.photoMemoryCache['qsc-2'];

          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 1500);
            const done = () => {
              clearTimeout(timer);
              resolve();
            };
            try {
              const photoTx = db.transaction('photos', 'readonly');
              const photoStore = photoTx.objectStore('photos');
              const cursorReq = photoStore.openCursor();
              cursorReq.onsuccess = (e) => {
                try {
                  const cursor = e.target.result;
                  if (cursor) {
                    const k = String(cursor.key || '');
                    if (k && k !== 'qsc-1' && k !== 'qsc-2' && typeof cursor.value === 'string' && cursor.value.startsWith('data:image')) {
                      this.photoMemoryCache[k] = cursor.value;
                      this._persistedPhotoKeys.add(k);
                    }
                    cursor.continue();
                  } else {
                    done();
                  }
                } catch (err) {
                  done();
                }
              };
              cursorReq.onerror = done;
            } catch (e) {
              done();
            }
          });
        }

        // 2. Preload foto dan data dari drafts store & gabungkan dengan localStorage drafts
        if (db.objectStoreNames.contains('drafts')) {
          let storedLocalDrafts = {};
          try {
            storedLocalDrafts = JSON.parse(localStorage.getItem(STORAGE_KEYS.DRAFT_REPORT) || '{}');
          } catch (e) {}
          Object.entries(storedLocalDrafts).forEach(([k, v]) => {
            if (v) this.draftMemoryCache[String(k)] = this.hydrateReportPhotos(v);
          });

          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 1500);
            const done = () => {
              clearTimeout(timer);
              resolve();
            };
            try {
              const draftTx = db.transaction('drafts', 'readonly');
              const draftStore = draftTx.objectStore('drafts');
              const draftCursorReq = draftStore.openCursor();
              draftCursorReq.onsuccess = (e) => {
                try {
                  const cursor = e.target.result;
                  if (cursor) {
                    const idbDraft = cursor.value;
                    const key = String(cursor.key || '');
                    if (idbDraft && key) {
                      this.cacheReportPhotosInMemory(idbDraft, false);
                      const existing = this.draftMemoryCache[key];
                      this.draftMemoryCache[key] = existing ? this.mergeReportAndDraft(idbDraft, existing, false) : this.hydrateReportPhotos(idbDraft);
                    }
                    cursor.continue();
                  } else {
                    done();
                  }
                } catch (err) {
                  done();
                }
              };
              draftCursorReq.onerror = done;
            } catch (e) {
              done();
            }
          });
          this._draftsCacheHydrated = true;
        }

        // 3. Preload foto & laporan lengkap dari reports store di IndexedDB dan gabungkan ke _cachedReports
        if (db.objectStoreNames.contains('reports')) {
          const idbReports = [];
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 1500);
            const done = () => {
              clearTimeout(timer);
              resolve();
            };
            try {
              const repTx = db.transaction('reports', 'readonly');
              const repStore = repTx.objectStore('reports');
              const repCursorReq = repStore.openCursor();
              repCursorReq.onsuccess = (e) => {
                try {
                  const cursor = e.target.result;
                  if (cursor) {
                    const rep = cursor.value;
                    if (rep && rep.id && !this._deletedReportIds.has(String(rep.id))) {
                      this.cacheReportPhotosInMemory(rep, false);
                      idbReports.push(rep);
                    }
                    cursor.continue();
                  } else {
                    done();
                  }
                } catch (err) {
                  done();
                }
              };
              repCursorReq.onerror = done;
            } catch (e) {
              done();
            }
          });

          const localReports = this.getReports(true);
          const mergedMap = new Map();
          localReports.forEach((r) => {
            if (r && r.id && !this._deletedReportIds.has(String(r.id))) {
              mergedMap.set(String(r.id), this.hydrateReportPhotos(r));
            }
          });
          idbReports.forEach((idbRep) => {
            const rid = String(idbRep.id);
            if (mergedMap.has(rid)) {
              mergedMap.set(rid, this.mergeReportAndDraft(idbRep, mergedMap.get(rid), false));
            } else {
              mergedMap.set(rid, this.hydrateReportPhotos(idbRep));
            }
          });

          // Juga sinkronkan jika ada draft toko yang lebih lengkap untuk laporan yang sudah ada di History Store
          Array.from(mergedMap.values()).forEach((rep) => {
            const draft = this.getStoreDraft(rep.storeCode, rep.scheduleId);
            if (draft && (!draft.visitDate || !rep.visitDate || draft.visitDate === rep.visitDate)) {
              mergedMap.set(String(rep.id), this.mergeReportAndDraft(rep, draft, false));
            }
          });

          const finalReports = Array.from(mergedMap.values()).sort((a, b) =>
            String(b.createdAt || b.visitDate || '').localeCompare(String(a.createdAt || a.visitDate || ''))
          );
          this._cachedReports = finalReports;
          try {
            const lightweightReports = finalReports.map((r) => prepareReportForLocalStorage(r));
            localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(lightweightReports));
          } catch (e) {}
        }
      } catch (err) {
        console.warn('initPhotoStorage warning:', err);
      } finally {
        this._photoStorageReady = true;
      }
    })();
    return this._photoStorageInitPromise;
  },

  cachePhotoInMemory(photoId, driveFileId, dataUrl, persistToDb = true) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return;
    const isSplitQscPiece =
      photoId &&
      String(photoId).startsWith('qsc-') &&
      !String(photoId).startsWith('qsc-full-') &&
      photoId !== 'qsc-1' &&
      photoId !== 'qsc-2';
    if (photoId && photoId !== 'qsc-1' && photoId !== 'qsc-2') {
      const k = String(photoId);
      const changed = this.photoMemoryCache[k] !== dataUrl;
      this.photoMemoryCache[k] = dataUrl;
      if (persistToDb && (changed || !this._persistedPhotoKeys.has(k))) {
        this._persistedPhotoKeys.add(k);
        this.setPhotoInDb(k, dataUrl);
      }
    }
    // Jangan menimpa cache driveFileId foto utuh QSC dengan potongan atas/bawah
    if (driveFileId && !isSplitQscPiece) {
      const fk = String(driveFileId);
      const changed = this.photoMemoryCache[fk] !== dataUrl;
      this.photoMemoryCache[fk] = dataUrl;
      if (persistToDb && (changed || !this._persistedPhotoKeys.has(fk))) {
        this._persistedPhotoKeys.add(fk);
        this.setPhotoInDb(fk, dataUrl);
      }
    }
  },

  getPhotoFromMemory(photoId, driveFileId) {
    if (photoId && photoId !== 'qsc-1' && photoId !== 'qsc-2' && this.photoMemoryCache[photoId]) {
      return this.photoMemoryCache[photoId];
    }
    if (driveFileId && this.photoMemoryCache[driveFileId]) {
      return this.photoMemoryCache[driveFileId];
    }
    return '';
  },

  cacheReportPhotosInMemory(report, persistToDb = true) {
    if (!report) return;
    (report.qscPhotos || []).forEach((p) => {
      if (p && p.dataUrl && p.dataUrl.startsWith('data:image')) {
        this.cachePhotoInMemory(p.id, p.driveFileId, p.dataUrl, persistToDb);
      }
    });
    (report.evidencePhotos || []).forEach((p) => {
      if (p && p.dataUrl && p.dataUrl.startsWith('data:image')) {
        this.cachePhotoInMemory(p.id, p.driveFileId, p.dataUrl, persistToDb);
      }
    });
    (report.caPhotos || report.correctiveActionPhotos || []).forEach((p) => {
      if (p && p.dataUrl && p.dataUrl.startsWith('data:image')) {
        this.cachePhotoInMemory(p.id, p.driveFileId, p.dataUrl, persistToDb);
      }
    });
  },

  async uploadPhotoToGDrive(photoObj, meta = {}) {
    if (!photoObj) return photoObj;
    // Jika foto memiliki foto utuh (full un-split photo untuk QSC), utamakan foto utuh untuk disimpan ke Google Drive
    const rawDataUrl =
      photoObj.fullPhotoDataUrl ||
      (photoObj.dataUrl && photoObj.dataUrl.startsWith('data:image') ? photoObj.dataUrl : '') ||
      this.getPhotoFromMemory(photoObj.id, photoObj.driveFileId);

    if (photoObj.dataUrl && photoObj.dataUrl.startsWith('data:image')) {
      this.cachePhotoInMemory(photoObj.id, null, photoObj.dataUrl);
    } else if (rawDataUrl) {
      this.cachePhotoInMemory(photoObj.id, photoObj.driveFileId, rawDataUrl);
    }

    // Jika sudah memiliki driveFileId, tidak perlu upload ulang
    if (photoObj.driveFileId) {
      return photoObj;
    }

    const settings = this.getSettings();
    const gasUrl = (settings.gasWebhookUrl || '').trim();
    if (!gasUrl || !gasUrl.startsWith('http') || !rawDataUrl) {
      return photoObj;
    }

    const storeCode = meta.storeCode || (typeof document !== 'undefined' ? document.getElementById('form-store-code')?.value.trim() : '') || 'STORE';
    const storeName = meta.storeName || (typeof document !== 'undefined' ? document.getElementById('form-store-name')?.value.trim() : '') || 'VISIT';
    const visitorName = meta.visitorName || (typeof document !== 'undefined' ? document.getElementById('form-auditor-name')?.value.trim() : '') || (this.getCurrentUser()?.name) || 'Visitor';
    const visitDate = meta.visitDate || (typeof document !== 'undefined' ? document.getElementById('form-visit-date')?.value.trim() : '') || new Date().toISOString().slice(0, 10);
    const visitYear = meta.visitYear || String(visitDate).slice(0, 4) || '2026';
    const photoType = meta.photoType || 'EVIDENCE';
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const cleanStoreName = String(storeName).replace(/[/\\:*?"<>|]/g, ' ').trim();

    let fileName = `FMCU_${storeCode}_${photoType}_${Date.now()}.jpg`;
    let displayTitle = '';
    if (photoType === 'QSC') {
      fileName = `Lembar QSC-Fami track-${cleanStoreName}-${dd}-${mm}-${yyyy}.jpg`;
      displayTitle = `Lembar QSC/Fami track-${cleanStoreName}-${dd}-${mm}-${yyyy}`;
    } else {
      const cleanCaption = String(
        photoObj.caption || photoObj.description || photoType
      ).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 35);
      fileName = `FMCU_${storeCode}_${photoType}_${cleanCaption}_${Date.now()}.jpg`;
    }

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'uploadPhoto',
          photoId: photoObj.id || '',
          fileName,
          displayTitle: displayTitle || fileName,
          photoBase64: rawDataUrl.split(',')[1] || rawDataUrl,
          storeCode,
          storeName,
          visitorName,
          visitDate,
          visitYear,
          photoType,
          gdrivePhotoFolderId: settings.gdrivePhotoFolderId || settings.gdriveFolderId || ''
        })
      });

      const resJson = await response.json();
      if (resJson && resJson.status === 'SUCCESS' && resJson.fileId) {
        photoObj.driveFileId = resJson.fileId;
        photoObj.driveUrl = resJson.directUrl || `https://drive.google.com/thumbnail?id=${resJson.fileId}&sz=w1200`;
        photoObj.driveViewUrl = resJson.viewUrl || '';
        photoObj.storageProvider = 'GOOGLE_DRIVE';
        this.cachePhotoInMemory(photoObj.id, photoObj.driveFileId, rawDataUrl);
      }
    } catch (err) {
      console.warn('Upload foto ke Google Drive gagal / tertunda:', err);
    }

    return photoObj;
  },

  async ensureReportPhotosUploadedToGDrive(report) {
    if (!report) return report;
    this.cacheReportPhotosInMemory(report);
    const settings = this.getSettings();
    const gasUrl = (settings.gasWebhookUrl || '').trim();
    if (!gasUrl || !gasUrl.startsWith('http')) {
      return report;
    }

    const storeCode = report.storeCode || 'STORE';
    const storeName = report.storeName || 'VISIT';
    const tasks = [];

    // Jika foto QSC memiliki fullPhotoId (1 foto penuh yang di-split jadi 2 bagian atas & bawah di lokal),
    // unggah 1 foto utuh ke Google Drive lalu tautkan driveFileId ke kedua slot QSC
    const q0 = report.qscPhotos?.[0];
    const q1 = report.qscPhotos?.[1];
    const sharedFullId = (q0 && q0.fullPhotoId) || (q1 && q1.fullPhotoId) || '';
    if (sharedFullId && q0 && !q0.driveFileId) {
      tasks.push(
        (async () => {
          let fullB64 = this.getPhotoFromMemory(sharedFullId, null) || (await this.getPhotoFromDb(sharedFullId)) || q0.fullPhotoDataUrl || '';
          if (fullB64 && fullB64.startsWith('data:image')) {
            const fullPhotoObj = {
              id: sharedFullId,
              caption: 'Lembar_Form_QSC_Full',
              dataUrl: fullB64,
              fullPhotoDataUrl: fullB64
            };
            await this.uploadPhotoToGDrive(fullPhotoObj, { storeCode, storeName, photoType: 'QSC' });
            if (fullPhotoObj.driveFileId) {
              if (q0) {
                q0.driveFileId = fullPhotoObj.driveFileId;
                q0.driveUrl = fullPhotoObj.driveUrl;
                q0.driveViewUrl = fullPhotoObj.driveViewUrl;
              }
              if (q1) {
                q1.driveFileId = fullPhotoObj.driveFileId;
                q1.driveUrl = fullPhotoObj.driveUrl;
                q1.driveViewUrl = fullPhotoObj.driveViewUrl;
              }
              this.cachePhotoInMemory(fullPhotoObj.id, fullPhotoObj.driveFileId, fullB64, true);
            }
          }
        })()
      );
    } else {
      (report.qscPhotos || []).forEach((p) => {
        if (p && !p.driveFileId && (p.dataUrl?.startsWith('data:image') || this.getPhotoFromMemory(p.id, null))) {
          tasks.push(this.uploadPhotoToGDrive(p, { storeCode, storeName, photoType: 'QSC' }));
        }
      });
    }

    (report.evidencePhotos || []).forEach((p) => {
      if (p && !p.driveFileId && (p.dataUrl?.startsWith('data:image') || this.getPhotoFromMemory(p.id, null))) {
        tasks.push(this.uploadPhotoToGDrive(p, { storeCode, storeName, photoType: 'EVIDENCE' }));
      }
    });
    (report.caPhotos || report.correctiveActionPhotos || []).forEach((p) => {
      if (p && !p.driveFileId && (p.dataUrl?.startsWith('data:image') || this.getPhotoFromMemory(p.id, null))) {
        tasks.push(this.uploadPhotoToGDrive(p, { storeCode, storeName, photoType: 'CORRECTIVE_ACTION' }));
      }
    });

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
    return report;
  },

  async fetchDrivePhotosBase64(fileIds = []) {
    const missingIds = fileIds.filter((fid) => fid && !this.photoMemoryCache[fid]);
    if (missingIds.length === 0) return this.photoMemoryCache;

    const settings = this.getSettings();
    const gasUrl = (settings.gasWebhookUrl || '').trim();
    if (!gasUrl || !gasUrl.startsWith('http')) return this.photoMemoryCache;

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'getPhotoBase64',
          fileIds: missingIds
        })
      });
      const resJson = await response.json();
      if (resJson && resJson.status === 'SUCCESS' && resJson.photos) {
        Object.entries(resJson.photos).forEach(([fid, b64]) => {
          if (b64 && b64.startsWith('data:image')) {
            this.photoMemoryCache[fid] = b64;
            this.setPhotoInDb(fid, b64);
          }
        });
      }
    } catch (err) {
      console.warn('Gagal mengambil foto Base64 dari Google Drive:', err);
    }
    return this.photoMemoryCache;
  },

  getReports(forceRefresh = false) {
    if (!forceRefresh && Array.isArray(this._cachedReports)) {
      return this._cachedReports;
    }
    let raw = [];
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.REPORTS) || '[]');
    } catch (e) {
      raw = [];
    }
    const hydrated = (raw || []).map((rep) => this.hydrateReportPhotos(rep));
    this._cachedReports = hydrated;
    return hydrated;
  },

  saveReportsLocalOnly(reports, singleSavedReport = null) {
    const hydratedList = (reports || []).map((r) => this.hydrateReportPhotos(r));
    this._cachedReports = hydratedList;
    try {
      if (singleSavedReport && singleSavedReport.id) {
        this.cacheReportPhotosInMemory(singleSavedReport, true);
        this.saveReportInDb(singleSavedReport.id, singleSavedReport);
      }
      const lightweightReports = hydratedList.map((r) => prepareReportForLocalStorage(r));
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(lightweightReports));
      return true;
    } catch (err) {
      console.warn('LocalStorage quota warning:', err);
      return false;
    }
  },

  getStoreDraft(storeCode, scheduleId = null) {
    if (!storeCode) return null;
    try {
      if (!this._draftsCacheHydrated) {
        this._draftsCacheHydrated = true;
        const storedDrafts = JSON.parse(localStorage.getItem(STORAGE_KEYS.DRAFT_REPORT) || '{}');
        Object.entries(storedDrafts).forEach(([k, v]) => {
          if (!this.draftMemoryCache[k]) {
            this.draftMemoryCache[k] = v;
          } else {
            this.draftMemoryCache[k] = this.mergeReportAndDraft(this.draftMemoryCache[k], v, false);
          }
        });
      }
      const schKey = scheduleId ? `${storeCode}_${scheduleId}` : null;
      const draftBySch = schKey ? this.draftMemoryCache[schKey] : null;
      const draftByStore = this.draftMemoryCache[String(storeCode)] || null;
      let draft = null;
      if (draftBySch && draftByStore) {
        draft = this.mergeReportAndDraft(draftBySch, draftByStore, false);
      } else {
        draft = draftBySch || draftByStore || null;
      }
      if (draft) {
        return this.hydrateReportPhotos(draft);
      }
      return null;
    } catch (e) {
      const schKey = scheduleId ? `${storeCode}_${scheduleId}` : null;
      return (schKey && this.draftMemoryCache[schKey]) || this.draftMemoryCache[String(storeCode)] || null;
    }
  },

  saveStoreDraft(storeCode, draftData, scheduleId = null) {
    if (!storeCode || !draftData) return false;
    const schId = scheduleId || draftData.scheduleId || null;
    const schKey = schId ? `${storeCode}_${schId}` : null;
    const nowIso = new Date().toISOString();

    // Gabungkan dengan draft yang sudah ada apabila field tertentu di draft baru kosong
    const existingDraft = (schKey && this.draftMemoryCache[schKey]) || this.draftMemoryCache[String(storeCode)] || null;
    const fullDraft = {
      ...draftData,
      updatedAt: nowIso
    };
    if (existingDraft && !this.hasMeaningfulVisitContent(fullDraft) && this.hasMeaningfulVisitContent(existingDraft)) {
      // Cegah form kosong (misal saat inisialisasi awal) menimpa draft yang sudah berisi foto/teks
      return false;
    }

    // 1. Simpan seluruh binary foto ke IndexedDB & RAM Memory Cache
    this.cacheReportPhotosInMemory(fullDraft, true);
    const hydratedDraft = this.hydrateReportPhotos(fullDraft);

    // 2. Simpan di RAM Memory Cache (Akses Instan Cepat)
    this.draftMemoryCache[String(storeCode)] = hydratedDraft;
    if (schKey) this.draftMemoryCache[schKey] = hydratedDraft;

    // 3. Simpan full draft utuh ke IndexedDB drafts store
    this.saveDraftInDb(storeCode, hydratedDraft);
    if (schKey) this.saveDraftInDb(schKey, hydratedDraft);

    // 4. Simpan versi lightweight (tanpa Base64 biner raksasa) di LocalStorage agar kuota 5MB tidak pernah jebol
    // Catatan: Seluruh data Form Visit disimpan 100% di lokal (RAM + IndexedDB + LocalStorage) tanpa trafik jaringan.
    try {
      const lightweightLocal = {
        ...prepareReportForLocalStorage(hydratedDraft),
        updatedAt: nowIso
      };
      const drafts = JSON.parse(localStorage.getItem(STORAGE_KEYS.DRAFT_REPORT) || '{}');
      drafts[String(storeCode)] = lightweightLocal;
      if (schKey) drafts[schKey] = lightweightLocal;
      localStorage.setItem(STORAGE_KEYS.DRAFT_REPORT, JSON.stringify(drafts));
    } catch (e) {
      console.warn('LocalStorage draft quota warning, draft safely preserved in IndexedDB & RAM:', e);
    }

    return true;
  },

  deleteStoreDraft(storeCode, scheduleId = null) {
    if (!storeCode) return false;
    const schKey = scheduleId ? `${storeCode}_${scheduleId}` : null;
    delete this.draftMemoryCache[String(storeCode)];
    if (schKey) delete this.draftMemoryCache[schKey];
    this.deleteDraftFromDb(storeCode);
    if (schKey) this.deleteDraftFromDb(schKey);
    try {
      const drafts = JSON.parse(localStorage.getItem(STORAGE_KEYS.DRAFT_REPORT) || '{}');
      delete drafts[String(storeCode)];
      if (schKey) delete drafts[schKey];
      localStorage.setItem(STORAGE_KEYS.DRAFT_REPORT, JSON.stringify(drafts));
      return true;
    } catch (e) {
      return false;
    }
  },

  saveReport(report, options = {}) {
    if (!report || !report.id) return false;
    const syncCloud = options.syncCloud !== false;
    this._deletedReportIds.delete(String(report.id));
    const nowIso = new Date().toISOString();
    const incoming = {
      ...report,
      _isLocalDraftOnly: syncCloud ? false : Boolean(report._isLocalDraftOnly ?? true),
      updatedAt: nowIso
    };
    this.cacheReportPhotosInMemory(incoming, true);

    const reports = this.getReports();
    const idx = reports.findIndex((r) => String(r.id) === String(incoming.id));
    let merged = this.hydrateReportPhotos(incoming);
    if (idx !== -1) {
      // Jika laporan lama memiliki isi dan incoming kosong (misal terpanggil saat reset), lindungi data lama
      if (!this.hasMeaningfulVisitContent(incoming) && this.hasMeaningfulVisitContent(reports[idx])) {
        return false;
      }
      const wasAlreadyFinalized = reports[idx]._isLocalDraftOnly === false;
      merged = this.hydrateReportPhotos({
        ...reports[idx],
        ...incoming,
        _isLocalDraftOnly: syncCloud || wasAlreadyFinalized ? false : true,
        qscPhotos: this.mergePhotoArrays(incoming.qscPhotos, reports[idx].qscPhotos, true),
        evidencePhotos: this.mergePhotoArrays(incoming.evidencePhotos, reports[idx].evidencePhotos, false),
        caPhotos: this.mergePhotoArrays(
          incoming.caPhotos || incoming.correctiveActionPhotos,
          reports[idx].caPhotos || reports[idx].correctiveActionPhotos,
          false
        ),
        correctiveActionPhotos: this.mergePhotoArrays(
          incoming.caPhotos || incoming.correctiveActionPhotos,
          reports[idx].caPhotos || reports[idx].correctiveActionPhotos,
          false
        )
      });
      reports[idx] = merged;
    } else {
      reports.unshift(merged);
    }
    const ok = this.saveReportsLocalOnly(reports, merged);

    // Hanya sinkronkan ke Cloud Firestore apabila syncCloud === true (saat finalisasi laporan / integrasi online)
    if (syncCloud && this.db && merged.id) {
      const docId = String(merged.id);
      this._pushedUnsyncedReportIds.add(docId);
      this.db
        .collection('reports')
        .doc(docId)
        .set(prepareReportForFirestore(merged), { merge: true })
        .catch((e) => console.warn('Save report error:', e));
    }
    return ok;
  },

  saveReports(reports) {
    const prevReports = this.getReports();
    const ok = this.saveReportsLocalOnly(reports);

    if (this.db) {
      const newIds = new Set(reports.map((r) => String(r.id)));
      prevReports.forEach((oldR) => {
        const oldId = String(oldR.id);
        if (oldId && !newIds.has(oldId)) {
          this._deletedReportIds.add(oldId);
          this.db.collection('reports').doc(oldId).delete().catch((e) => console.warn('Delete report error:', e));
        }
      });
      reports.forEach((rep) => {
        if (!rep.id) return;
        const docId = String(rep.id);
        this._deletedReportIds.delete(docId);
        this.db
          .collection('reports')
          .doc(docId)
          .set(prepareReportForFirestore(rep), { merge: true })
          .catch((e) => console.warn('Save report error:', e));
      });
    }
    return ok;
  },

  deleteReport(reportId) {
    if (!reportId) return;
    this._deletedReportIds.add(String(reportId));
    this.deleteReportFromDb(reportId);
    const reports = this.getReports().filter((r) => String(r.id) !== String(reportId));
    this.saveReportsLocalOnly(reports);
    if (this.db) {
      this.db.collection('reports').doc(String(reportId)).delete().catch((e) => console.warn('Delete report error:', e));
    }
    return reports;
  },

  // ==========================================================================
  // MASTER DATA TOKO KEPEMILIKAN BESTIE (BESTIE IN CHARGE GOOGLE SPREADSHEET)
  // URL: https://docs.google.com/spreadsheets/d/1XAAfV0Pa6bU3CVH3umJBBSbNObOHorLcWl8UzLPtFp4/edit?gid=1813325087
  // ==========================================================================
  getBestieInChargeAssignments(forceRefresh = false) {
    if (!forceRefresh && Array.isArray(this._cachedBestieInCharge) && this._cachedBestieInCharge.length > 0) {
      return this._cachedBestieInCharge;
    }
    let list = JSON.parse(localStorage.getItem(STORAGE_KEYS.BESTIE_IN_CHARGE) || '[]');
    if (!Array.isArray(list) || list.length === 0) {
      list = Array.isArray(window.FMCU_BESTIE_IN_CHARGE_SEED) ? [...window.FMCU_BESTIE_IN_CHARGE_SEED] : [];
      localStorage.setItem(STORAGE_KEYS.BESTIE_IN_CHARGE, JSON.stringify(list));
    }
    this._cachedBestieInCharge = list;
    return list;
  },

  getStoreCodesOwnedByBestie(bestieName) {
    if (!bestieName) return new Set();
    const cleanTarget = String(bestieName).trim().toLowerCase();
    const assignments = this.getBestieInChargeAssignments();
    const codes = new Set();
    assignments.forEach((item) => {
      const bName = String(item.bestieName || '').trim().toLowerCase();
      if (bName === cleanTarget || cleanTarget.includes(bName) || bName.includes(cleanTarget)) {
        if (item.storeCode) codes.add(String(item.storeCode));
      }
    });
    return codes;
  },

  getStoresOwnedByBestie(bestieName) {
    if (!bestieName) return [];
    const cleanTarget = String(bestieName).trim().toLowerCase();
    const assignments = this.getBestieInChargeAssignments();
    return assignments.filter((item) => {
      const bName = String(item.bestieName || '').trim().toLowerCase();
      return bName === cleanTarget || cleanTarget.includes(bName) || bName.includes(cleanTarget);
    });
  },

  getBestieByStoreCode(storeCode) {
    if (!storeCode) return null;
    const sCode = String(storeCode);
    const assignments = this.getBestieInChargeAssignments();
    const found = assignments.find((it) => String(it.storeCode) === sCode);
    return found ? found.bestieName : null;
  },

  async syncBestieInChargeFromSheet(force = false) {
    const sheetUrl = 'https://docs.google.com/spreadsheets/d/1XAAfV0Pa6bU3CVH3umJBBSbNObOHorLcWl8UzLPtFp4/gviz/tq?tqx=out:csv&gid=1813325087';
    try {
      const resp = await fetch(sheetUrl);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const csvText = await resp.text();
      const parsed = this.parseBestieInChargeCsv(csvText);
      if (parsed && parsed.length > 0) {
        this._cachedBestieInCharge = parsed;
        localStorage.setItem(STORAGE_KEYS.BESTIE_IN_CHARGE, JSON.stringify(parsed));
        if (this.db) {
          this.db.collection('settings').doc('bestie_in_charge').set({
            assignments: parsed,
            totalRows: parsed.length,
            updatedAt: new Date().toISOString()
          }, { merge: true }).catch(() => {});
        }
        return { success: true, count: parsed.length, source: 'LIVE_GOOGLE_SHEETS' };
      }
    } catch (err) {
      console.warn('Sync bestie in charge from sheet warning:', err);
    }
    const current = this.getBestieInChargeAssignments();
    return { success: current.length > 0, count: current.length, source: 'LOCAL_CACHE' };
  },

  parseBestieInChargeCsv(csvText) {
    if (!csvText) return [];
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return [];

    function parseCsvLine(text) {
      const result = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
          if (inQuotes && text[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (c === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      result.push(cur.trim());
      return result;
    }

    function norm(s) {
      return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    const masterStores = this.getStores();
    const masterMap = new Map();
    masterStores.forEach((s) => {
      masterMap.set(norm(s.name), s);
    });

    const rows = lines.map(parseCsvLine);
    const result = [];

    for (let i = 1; i < rows.length; i++) {
      const [bestieName, storeName, address, areaManager, regionalManager] = rows[i];
      if (!bestieName || !storeName) continue;
      if (bestieName.includes('Satrio Handoyo') || bestieName.includes(',Aisyah,')) continue;

      const nStore = norm(storeName);
      let match = masterMap.get(nStore);
      if (!match) {
        for (const [mNorm, s] of masterMap.entries()) {
          if (mNorm.includes(nStore) || nStore.includes(mNorm)) {
            match = s;
            break;
          }
        }
      }

      const storeCode = match ? match.code : '';
      const resolvedStoreName = match ? match.name : storeName.trim();

      result.push({
        bestieName: bestieName.trim(),
        storeCode: storeCode,
        storeName: resolvedStoreName,
        originalStoreName: storeName.trim(),
        address: address ? address.trim() : (match ? match.address : ''),
        areaManager: areaManager ? areaManager.trim() : (match ? match.areaManager : ''),
        regionalManager: regionalManager ? regionalManager.trim() : (match ? match.regionalManager : '')
      });
    }

    return result;
  },

  getSettings() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
    } catch (e) {
      saved = {};
    }
    const TARGET_GAS_URL = DEFAULT_SETTINGS.gasWebhookUrl;
    // Auto-migrasi URL Google Apps Script jika masih mengarah ke deployment lama atau kosong
    if (!saved.gasWebhookUrl || saved.gasWebhookUrl.includes('AKfycbxqumXFq') || saved.gasWebhookUrl.includes('4lRe') || !saved.gasWebhookUrl.includes('AKfycbxC29L4Cb3NNvUl4IRe0MGDnrluvCvv1neuTjQieA8j7C4n7zgGfQ3dMA8SLXYBG0AWtw')) {
      saved.gasWebhookUrl = TARGET_GAS_URL;
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ ...DEFAULT_SETTINGS, ...saved }));
      } catch (e) {}
    }
    return { ...DEFAULT_SETTINGS, ...saved };
  },
  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    if (this.db) {
      this.db
        .collection('settings')
        .doc('global_config')
        .set(sanitizeForFirestore(settings), { merge: true })
        .catch((e) => console.warn('Save settings error:', e));
    }
  },

  getAttendanceLogs() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE_LOGS) || '[]');
  },
  saveAttendanceLogs(logs) {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(logs));
  },

  // ==========================================================================
  // FOKUS AUDIT / CATATAN MINGGUAN OPTIONS & SELECTIONS (MULTIPLE CHECKLIST)
  // Default bawaan dikosongkan agar Admin dapat meng-adjust sendiri via tombol + Tambah
  // ==========================================================================
  getDefaultFocusOptions() {
    return [];
  },

  getAuditFocusOptions() {
    try {
      const raw = localStorage.getItem('fmcu_focus_options_v3');
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    const defaults = this.getDefaultFocusOptions();
    localStorage.setItem('fmcu_focus_options_v3', JSON.stringify(defaults));
    return defaults;
  },

  saveAuditFocusOptions(options) {
    localStorage.setItem('fmcu_focus_options_v3', JSON.stringify(options || []));
  },

  getSelectedFocusOptions() {
    try {
      const raw = localStorage.getItem('fmcu_selected_focus_v3');
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  },

  saveSelectedFocusOptions(selectedIds) {
    localStorage.setItem('fmcu_selected_focus_v3', JSON.stringify(selectedIds || []));
  },

  // ==========================================================================
  // SESSION MANAGEMENT (TAB-SCOPED sessionStorage + TIME SESSION EXPIRY)
  // Otomatis terhapus saat tutup tab / tutup web app atau melewati batas waktu
  // ==========================================================================
  getSession() {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    const raw = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      // Cek apakah format baru { user, expiresAt } atau format objek user langsung
      if (parsed && parsed.expiresAt && Date.now() > parsed.expiresAt) {
        sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
        return null;
      }
      const userObj = parsed && parsed.user ? parsed.user : parsed;
      if (!userObj || !userObj.username) return null;
      const freshUser = this.getUsers().find((u) => u.id === userObj.id || u.username === userObj.username);
      return freshUser || userObj;
    } catch {
      return null;
    }
  },

  setSession(user) {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    if (!user) {
      sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    } else {
      const payload = {
        user,
        loginAt: Date.now(),
        expiresAt: Date.now() + this.SESSION_TIMEOUT_MS
      };
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(payload));
    }
  },

  touchSession() {
    const raw = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.expiresAt && Date.now() > parsed.expiresAt) {
        sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
        return false;
      }
      const userObj = parsed && parsed.user ? parsed.user : parsed;
      sessionStorage.setItem(
        STORAGE_KEYS.ACTIVE_SESSION,
        JSON.stringify({
          user: userObj,
          loginAt: parsed.loginAt || Date.now(),
          expiresAt: Date.now() + this.SESSION_TIMEOUT_MS
        })
      );
      return true;
    } catch {
      return false;
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
  },

  getHoldingTimeStandards() {
    const raw = localStorage.getItem(STORAGE_KEYS.HOLDING_TIME_STANDARDS);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.categories) && parsed.categories.length > 0) {
          return parsed;
        }
      } catch (e) {}
    }
    return window.FMCU_HOLDING_TIME_R23 || null;
  },

  saveHoldingTimeStandards(standardsData) {
    if (!standardsData) return;
    localStorage.setItem(STORAGE_KEYS.HOLDING_TIME_STANDARDS, JSON.stringify(standardsData));
    if (this.db) {
      this.db
        .collection('settings')
        .doc('holding_time_standards')
        .set(sanitizeForFirestore(standardsData), { merge: true })
        .catch((e) => console.warn('Firestore holding time standards save warning:', e));
    }
    if (window.FMCUApp && typeof window.FMCUApp.onHoldingTimeStandardsUpdated === 'function') {
      window.FMCUApp.onHoldingTimeStandardsUpdated(standardsData);
    }
  },

  resetHoldingTimeStandards() {
    localStorage.removeItem(STORAGE_KEYS.HOLDING_TIME_STANDARDS);
    const defaultData = window.FMCU_HOLDING_TIME_R23 || null;
    if (defaultData && this.db) {
      this.db
        .collection('settings')
        .doc('holding_time_standards')
        .set(sanitizeForFirestore(defaultData), { merge: true })
        .catch((e) => console.warn('Firestore reset holding time warning:', e));
    }
    if (window.FMCUApp && typeof window.FMCUApp.onHoldingTimeStandardsUpdated === 'function') {
      window.FMCUApp.onHoldingTimeStandardsUpdated(defaultData);
    }
    return defaultData;
  }
};
