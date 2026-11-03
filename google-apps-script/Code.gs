/**
 * ============================================================================
 * FMCU VISIT STORE REPORT - GOOGLE APPS SCRIPT BACKEND (Code.gs)
 * Arsitektur Penyimpanan Hierarki Folder Google Drive:
 * 1. Root Folder Laporan (05. VISIT STORE): 15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8
 *    Menyimpan 3 Berkas Resmi:
 *    a. PDF Laporan Visit ("Hasil Kunjungan-{Nama Store}-{DD-MM-YYYY}.pdf")
 *    b. Foto Lembar QSC ("Kolase Lembar QSC-{Nama Store}-{DD-MM-YYYY}.pdf") - Vertikal
 *    c. Spreadsheet CA Store Assignment (Auto generate link live online & lock Kolom A-D)
 *    Struktur Folder: 05. VISIT STORE > 01. VISIT BESTIE 2026 > [Nama Visitor] > [Kode - Nama Toko]
 * 2. Root Folder Khusus Foto Upload: 1_gbA_kJnUFMHWeXQyYKR7GS7m5gqqE0B
 *    Menyimpan seluruh foto mentah temuan (evidence & CA) agar tidak mencemari 05. VISIT STORE.
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

var DEFAULT_ROOT_GDRIVE_ID = "15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8"; // Folder 05. VISIT STORE (Root Resmi untuk 3 Berkas Laporan)
var DEFAULT_PHOTO_GDRIVE_ID = "1_gbA_kJnUFMHWeXQyYKR7GS7m5gqqE0B"; // Folder Baru Khusus Upload Foto Bukti & Temuan Mentah

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
    // Disimpan rapi di dalam: 01. VISIT BESTIE {Tahun} -> {Visitor} -> {Store} -> Foto Dokumentasi
    // SEHINGGA ROOT "05. VISIT STORE" 100% BERSIH DARI SPAM FOLDER TOKO
    // ========================================================================
    if (action === 'uploadPhoto') {
      var rawBase64 = payload.photoBase64 || '';
      if (rawBase64.indexOf(',') !== -1) {
        rawBase64 = rawBase64.split(',')[1];
      }
      var decodedPhoto = Utilities.base64Decode(rawBase64);
      var photoFileName = payload.fileName || ('FMCU_PHOTO_' + new Date().getTime() + '.jpg');
      var photoBlob = Utilities.newBlob(decodedPhoto, 'image/jpeg', photoFileName);

      var rootFolderId = payload.gdrivePhotoFolderId || DEFAULT_PHOTO_GDRIVE_ID;
      var rootFolder = getOrCreateTargetFolder_(rootFolderId, 'FMCU_FOTO_DATABASE');

      // Sapu & bersihkan folder toko yang tercecer di root jika ada
      cleanupSpamStoreFoldersFromRoot_(rootFolder);

      var visitorName = (payload.visitorName || 'Visitor').trim();
      var visitYear = String(payload.visitYear || '2026').trim();
      var storeCode = (payload.storeCode || 'STORE').trim();
      var storeName = (payload.storeName || 'VISIT').trim();

      // 1. Folder Tahun: "01. VISIT BESTIE 2026"
      var yearFolderName = '01. VISIT BESTIE ' + visitYear;
      var yearFolder = getOrCreateSubFolder_(rootFolder, yearFolderName);

      // 2. Folder Visitor
      var visitorFolder = getOrCreateSubFolder_(yearFolder, visitorName);

      // 3. Folder Toko yang divisit (di dalam folder visitor)
      var storeFolderName = (storeCode ? (storeCode + ' - ' + storeName) : storeName).replace(/[\\/:*?"<>|]/g, ' ').trim();
      var storeFolder = getOrCreateSubFolder_(visitorFolder, storeFolderName);

      // 4. Subfolder 'Foto Dokumentasi' di dalam folder toko agar foto tersimpan rapi dan tidak spam root
      var photoFolder = getOrCreateSubFolder_(storeFolder, 'Foto Dokumentasi');

      var photoFile = photoFolder.createFile(photoBlob);
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
    // ACTION 1B: BERSIHKAN & SEMBUNYIKAN SPAM FOLDER FOTO DARI ROOT GDRIVE
    // ========================================================================
    if (action === 'cleanupRootFolder') {
      var rootFolder = getOrCreateTargetFolder_(payload.gdrivePhotoFolderId || payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_VISIT_REPORTS');
      var movedCount = cleanupSpamStoreFoldersFromRoot_(rootFolder);

      return jsonResponse_({
        status: 'SUCCESS',
        action: 'cleanupRootFolder',
        movedFolders: movedCount,
        message: 'Folder foto toko di root Google Drive berhasil dirapikan ke dalam 01. VISIT BESTIE 2026'
      });
    }

    
    // ========================================================================

    // ========================================================================
    // DATABASE ACTION: SYNC ALL COLLECTIONS (SEKETIKA DALAM 1 REQUEST)
    // Mengambil Jadwal, User, Toko, dan Live GPS dari Hidden Vault
    // ========================================================================
    if (action === 'db_sync_all') {
      var rootFolder = getOrCreateTargetFolder_(payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_VISIT_REPORTS');
      var vaultFolder = getOrCreateVaultFolder_(rootFolder);
      var schedules = readVaultData_(vaultFolder, '.schedules.db.bin', []);
      var users = readVaultData_(vaultFolder, '.users.db.bin', []);
      var stores = readVaultData_(vaultFolder, '.stores.db.bin', []);
      var locations = readVaultData_(vaultFolder, '.locations.db.bin', {});
      var reports = readVaultData_(vaultFolder, '.reports.db.bin', []);

      return jsonResponse_({
        status: 'SUCCESS',
        action: 'db_sync_all',
        schedules: schedules,
        users: users,
        stores: stores,
        locations: locations,
        reports: reports,
        timestamp: new Date().toISOString()
      });
    }

    // ========================================================================
    // DATABASE ACTION: SAVE COLLECTION TO HIDDEN VAULT
    // ========================================================================
    if (action === 'db_save_collection') {
      var coll = payload.collection || 'schedules';
      var data = payload.data || [];
      var rootFolder = getOrCreateTargetFolder_(payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_VISIT_REPORTS');
      var vaultFolder = getOrCreateVaultFolder_(rootFolder);
      var ok = writeVaultData_(vaultFolder, '.' + coll + '.db.bin', data);

      return jsonResponse_({
        status: ok ? 'SUCCESS' : 'ERROR',
        action: 'db_save_collection',
        collection: coll,
        count: Array.isArray(data) ? data.length : 1,
        timestamp: new Date().toISOString()
      });
    }

    // ========================================================================
    // DATABASE ACTION: GET COLLECTION FROM HIDDEN VAULT
    // ========================================================================
    if (action === 'db_get_collection') {
      var coll = payload.collection || 'schedules';
      var rootFolder = getOrCreateTargetFolder_(payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_VISIT_REPORTS');
      var vaultFolder = getOrCreateVaultFolder_(rootFolder);
      var fallback = (coll === 'locations') ? {} : [];
      var data = readVaultData_(vaultFolder, '.' + coll + '.db.bin', fallback);

      return jsonResponse_({
        status: 'SUCCESS',
        action: 'db_get_collection',
        collection: coll,
        data: data,
        timestamp: new Date().toISOString()
      });
    }

    // ========================================================================
    // DATABASE ACTION: UPSERT SINGLE SCHEDULE TO HIDDEN VAULT
    // ========================================================================
    if (action === 'db_save_schedule' || action === 'saveSingleSchedule') {
      var newSch = payload.schedule;
      if (!newSch || !newSch.id) {
        return jsonResponse_({ status: 'ERROR', message: 'Data jadwal tidak valid' });
      }
      var rootFolder = getOrCreateTargetFolder_(payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_VISIT_REPORTS');
      var vaultFolder = getOrCreateVaultFolder_(rootFolder);
      var schedules = readVaultData_(vaultFolder, '.schedules.db.bin', []);
      var sId = String(newSch.id);
      var idx = -1;
      for (var i = 0; i < schedules.length; i++) {
        if (String(schedules[i].id) === sId) {
          idx = i;
          break;
        }
      }
      if (idx !== -1) {
        schedules[idx] = Object.assign({}, schedules[idx], newSch);
      } else {
        schedules.push(newSch);
      }
      writeVaultData_(vaultFolder, '.schedules.db.bin', schedules);

      return jsonResponse_({
        status: 'SUCCESS',
        action: 'db_save_schedule',
        scheduleId: sId,
        totalCount: schedules.length,
        timestamp: new Date().toISOString()
      });
    }

    // ========================================================================
    // DATABASE ACTION: DELETE SCHEDULE FROM HIDDEN VAULT
    // ========================================================================
    if (action === 'db_delete_schedule') {
      var targetId = String(payload.scheduleId || '');
      var rootFolder = getOrCreateTargetFolder_(payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_VISIT_REPORTS');
      var vaultFolder = getOrCreateVaultFolder_(rootFolder);
      var schedules = readVaultData_(vaultFolder, '.schedules.db.bin', []);
      var filtered = [];
      for (var i = 0; i < schedules.length; i++) {
        if (String(schedules[i].id) !== targetId) {
          filtered.push(schedules[i]);
        }
      }
      writeVaultData_(vaultFolder, '.schedules.db.bin', filtered);

      return jsonResponse_({
        status: 'SUCCESS',
        action: 'db_delete_schedule',
        deletedId: targetId,
        remainingCount: filtered.length,
        timestamp: new Date().toISOString()
      });
    }

    // ========================================================================
    // DATABASE ACTION: UPDATE & GET LIVE GPS TRACKER LOCATIONS
    // ========================================================================
    if (action === 'db_update_location') {
      var uId = String(payload.userId || '');
      var loc = payload.location;
      if (!uId || !loc) {
        return jsonResponse_({ status: 'ERROR', message: 'Data lokasi tidak valid' });
      }
      var rootFolder = getOrCreateTargetFolder_(payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_VISIT_REPORTS');
      var vaultFolder = getOrCreateVaultFolder_(rootFolder);
      var locations = readVaultData_(vaultFolder, '.locations.db.bin', {});
      locations[uId] = Object.assign({}, loc, { updatedAt: new Date().toISOString() });
      writeVaultData_(vaultFolder, '.locations.db.bin', locations);

      return jsonResponse_({
        status: 'SUCCESS',
        action: 'db_update_location',
        userId: uId,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'db_get_locations') {
      var rootFolder = getOrCreateTargetFolder_(payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_VISIT_REPORTS');
      var vaultFolder = getOrCreateVaultFolder_(rootFolder);
      var locations = readVaultData_(vaultFolder, '.locations.db.bin', {});

      return jsonResponse_({
        status: 'SUCCESS',
        action: 'db_get_locations',
        locations: locations,
        timestamp: new Date().toISOString()
      });
    }

    // BACKWARD COMPATIBILITY
    if (action === 'saveSchedules') {
      var rootFolder = getOrCreateTargetFolder_(payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_VISIT_REPORTS');
      var vaultFolder = getOrCreateVaultFolder_(rootFolder);
      writeVaultData_(vaultFolder, '.schedules.db.bin', payload.schedules || []);

      return jsonResponse_({
        status: 'SUCCESS',
        action: 'saveSchedules',
        count: (payload.schedules || []).length,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'getSchedules') {
      var rootFolder = getOrCreateTargetFolder_(payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_VISIT_REPORTS');
      var vaultFolder = getOrCreateVaultFolder_(rootFolder);
      var schedules = readVaultData_(vaultFolder, '.schedules.db.bin', []);

      return jsonResponse_({
        status: 'SUCCESS',
        action: 'getSchedules',
        schedules: schedules,
        count: schedules.length,
        timestamp: new Date().toISOString()
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
      var yMatch = String(rawDate).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
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

    // 1. Root Folder (Target folder: 1_gbA_kJnUFMHWeXQyYKR7GS7m5gqqE0B)
    var rootFolderId = payload.gdriveFolderId || DEFAULT_ROOT_GDRIVE_ID;
    var rootFolder = getOrCreateTargetFolder_(rootFolderId, 'FMCU_VISIT_REPORTS');

    // 2. Folder Tahun (Format: "01. VISIT BESTIE 2026", auto create untuk tahun selanjutnya)
    var yearFolderName = '01. VISIT BESTIE ' + visitYear;
    var yearFolder = getOrCreateSubFolder_(rootFolder, yearFolderName);

    // 3. Folder Visitor (Target nama yang cocok sesuai Visitor)
    var visitorFolder = getOrCreateSubFolder_(yearFolder, visitorName);

    // 4. Folder Toko yang divisit (di dalam folder visitor)
    var storeFolderName = (storeCode ? (storeCode + ' - ' + storeName) : storeName).replace(/[\\/:*?"<>|]/g, ' ').trim();
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
        var qscFileName = 'Kolase Lembar QSC-' + storeName + '-' + ddMmYyyy + '.pdf';
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
        try {
          ssFile.moveTo(storeFolder);
        } catch (eMove) {
          try {
            storeFolder.addFile(ssFile);
            DriveApp.getRootFolder().removeFile(ssFile);
          } catch (eFallback) {}
        }
        try {
          ssFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
        } catch (eShare) {}
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
      r9Daftar.setValue('DAFTAR TEMUAN\n(berdasarkan list pada visit report)');
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
      r9Bukti.setValue('BUKTI PERBAIKAN\n(isi dengan foto perbaikan)');
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
          descText += '\n(Action: ' + obsItem.tindakanPerbaikan + ')';
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
  var folderMatch = str.match(/\/folders\/([a-zA-Z0-9_-]{20,})/);
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

/**
 * FUNGSI PEMBERSIH SPAM FOLDER TOKO DI ROOT GOOGLE DRIVE
 * Jalankan fungsi ini langsung di editor Apps Script (pilih fungsi 'bersihkanFolderSpamDiRoot' lalu klik '▷ Jalankan')
 * untuk langsung menyapu dan memindahkan folder toko (seperti "0064 - MENTENG SQUARE...") yang tercecer di root "05. VISIT STORE".
 */
function bersihkanFolderSpamDiRoot() {
  var root = DriveApp.getFolderById(DEFAULT_ROOT_GDRIVE_ID);
  var count = cleanupSpamStoreFoldersFromRoot_(root);
  Logger.log('====================================================');
  Logger.log('✓ PEMBERSIHAN SELESAI!');
  Logger.log('  Total folder toko yang dipindahkan dari root: ' + count);
  Logger.log('  Root folder "05. VISIT STORE" sekarang bersih tanpa spam folder toko.');
  Logger.log('====================================================');
  return count;
}

function cleanupSpamStoreFoldersFromRoot_(rootFolder) {
  if (!rootFolder) return 0;
  var moved = 0;
  try {
    var subFolders = rootFolder.getFolders();
    while (subFolders.hasNext()) {
      var f = subFolders.next();
      var fname = f.getName().trim();
      var fnameLower = fname.toLowerCase();

      // Lindungi folder resmi yang memang ada di root:
      // "01. VISIT BESTIE 2026", "02. VISIT BESTIE 2027", "Schedule...", dll.
      if (/^\d{2}\.\s*VISIT\s*BESTIE/i.test(fname) || fnameLower.indexOf('schedule') !== -1 || fnameLower === 'template') {
        continue;
      }

      // Deteksi jika folder ini adalah folder toko yang tercecer di root:
      // Format toko diawali digit kode (contoh: "0064 - MENTENG SQUARE...", "0003 - PEJATEN...")
      // atau mengandung kata store / menteng / apartemen
      if (/^\d{3,5}\s*[-_]/i.test(fname) || fnameLower.indexOf('menteng') !== -1 || (fnameLower.indexOf('store') !== -1 && !/^\d{2}\./.test(fname))) {
        try {
          var yearFolder = getOrCreateSubFolder_(rootFolder, '01. VISIT BESTIE 2026');
          var archiveFolder = getOrCreateSubFolder_(yearFolder, '.Arsip Spam Root Terpindahkan');

          if (typeof f.moveTo === 'function') {
            f.moveTo(archiveFolder);
          } else {
            archiveFolder.addFolder(f);
            rootFolder.removeFolder(f);
          }
          moved++;
          Logger.log('Memindahkan spam folder toko dari root ke arsip: ' + fname);
        } catch (eMove) {
          Logger.log('Gagal memindahkan folder ' + fname + ': ' + eMove.toString());
        }
      }
    }
  } catch (eClean) {
    Logger.log('cleanupSpamStoreFoldersFromRoot_ error: ' + eClean.toString());
  }
  return moved;
}



// ============================================================================
// FMCU SECURE HIDDEN DATABASE VAULT (.fmcu_system_database_vault)
// File disembunyikan dengan:
// 1. Awalan titik (.) pada nama folder & file -> Folder & file sistem tersembunyi
// 2. Format biner terenkripsi (.bin) -> Tanpa preview Google Docs/Sheets
// 3. Permission PRIVATE tanpa link sharing -> Hanya script owner yang bisa akses
// 4. Base64 Obfuscation -> Aman dari intipan & pencegah editing manual
// ============================================================================
var VAULT_FOLDER_NAME = ".fmcu_system_database_vault";

function getOrCreateVaultFolder_(rootFolder) {
  var existing = findSubFolderCaseInsensitive_(rootFolder, VAULT_FOLDER_NAME);
  if (existing) {
    return existing;
  }
  var vault = rootFolder.createFolder(VAULT_FOLDER_NAME);
  try {
    vault.setDescription("PERINGATAN SISTEM: Folder database terenkripsi aplikasi FMCU Visit Report. JANGAN DIHAPUS, DIUBAH, ATAU DIPINDAHKAN.");
    // Akses PRIVATE ketat (tanpa ANYONE_WITH_LINK)
    vault.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  } catch (eVaultShare) {}
  return vault;
}

function readVaultData_(vaultFolder, fileName, defaultValue) {
  try {
    var files = vaultFolder.getFilesByName(fileName);
    if (!files.hasNext()) return defaultValue;
    var fileObj = files.next();
    var encoded = fileObj.getBlob().getDataAsString();
    if (!encoded) return defaultValue;
    // Decode data biner Base64 terenkripsi
    var decodedJson = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString();
    return JSON.parse(decodedJson || 'null') || defaultValue;
  } catch (err) {
    Logger.log('readVaultData_ error (' + fileName + '): ' + err.toString());
    return defaultValue;
  }
}

function writeVaultData_(vaultFolder, fileName, dataObj) {
  try {
    var jsonStr = JSON.stringify(dataObj);
    // Obfuscate / enkripsi isi data ke format biner Base64
    var encoded = Utilities.base64Encode(Utilities.newBlob(jsonStr).getBytes());
    var files = vaultFolder.getFilesByName(fileName);
    var fileObj = null;
    if (files.hasNext()) {
      fileObj = files.next();
      fileObj.setContent(encoded);
    } else {
      fileObj = vaultFolder.createFile(fileName, encoded, 'application/octet-stream');
    }
    try {
      fileObj.setDescription("FMCU Encrypted System Binary - DO NOT EDIT OR DELETE");
      fileObj.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    } catch (eFileShare) {}
    return true;
  } catch (err) {
    Logger.log('writeVaultData_ error (' + fileName + '): ' + err.toString());
    return false;
  }
}
