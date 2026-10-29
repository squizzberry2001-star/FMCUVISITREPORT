/**
 * ============================================================================
 * FMCU VISIT STORE REPORT - GOOGLE APPS SCRIPT BACKEND (Code.gs)
 * Arsitektur Penyimpanan Hierarki Folder Google Drive:
 * 1. Root Folder: 15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8
 * 2. Folder Tahun: "01. VISIT BESTIE 2026" (Auto-create tahun berjalan/berikutnya)
 * 3. Folder Visitor: Nama Regional Bestie / Visitor
 * 4. Folder Toko: Kode & Nama Toko yang divisit (contoh: "0449 - PORIS PARADISE")
 * 5. Tiga Lampiran di dalam Folder Toko:
 *    a. PDF Laporan Visit ("Hasil Kunjungan-{Nama Store}-{DD-MM-YYYY}.pdf")
 *    b. Foto Lembar QSC ("Kolase Lembar QSC-{Nama Store}-{DD-MM-YYYY}.pdf") - Vertikal
 *    c. Spreadsheet CA Store Assignment (Auto generate link live online & lock Kolom A-D)
 * ============================================================================
 */

var DEFAULT_ROOT_GDRIVE_ID = "15Nb6vesuhbx5yZCqHekV8Fo5e9kyB0i8";

function doPost(e) {
  try {
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

      var rootFolder = getOrCreateTargetFolder_(payload.gdrivePhotoFolderId || DEFAULT_ROOT_GDRIVE_ID, 'FMCU_Visit_Database');
      var storeFolderName = ((payload.storeCode || 'STORE') + ' - ' + (payload.storeName || 'VISIT')).replace(/[\\/:*?"<>|]/g, ' ').trim();
      var storeFolder = getOrCreateSubFolder_(rootFolder, storeFolderName);

      var photoFile = storeFolder.createFile(photoBlob);
      photoFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
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

    // 1. Root Folder
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
      var b64Pdf = payload.pdfBase64.indexOf(',') !== -1 ? payload.pdfBase64.split(',')[1] : payload.pdfBase64;
      var decodedPdf = Utilities.base64Decode(b64Pdf);
      var pdfBlob = Utilities.newBlob(decodedPdf, 'application/pdf', payload.fileName || pdfFileName);
      pdfFile = storeFolder.createFile(pdfBlob);
      pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      pdfUrl = pdfFile.getUrl();
    }

    // ------------------------------------------------------------------------
    // LAMPIRAN 2: Foto Lembar QSC - Auto Kolase Format PDF Vertikal
    // ------------------------------------------------------------------------
    var qscPdfFile = null;
    var qscPdfUrl = '';
    if (payload.qscPdfBase64) {
      var b64Qsc = payload.qscPdfBase64.indexOf(',') !== -1 ? payload.qscPdfBase64.split(',')[1] : payload.qscPdfBase64;
      var decodedQsc = Utilities.base64Decode(b64Qsc);
      var qscFileName = 'Kolase Lembar QSC-' + storeName + '-' + ddMmYyyy + '.pdf';
      var qscBlob = Utilities.newBlob(decodedQsc, 'application/pdf', qscFileName);
      qscPdfFile = storeFolder.createFile(qscBlob);
      qscPdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      qscPdfUrl = qscPdfFile.getUrl();
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

      // Rows 10+: Temuan Observasi
      var observations = report.observations || [];
      var totalDataRows = Math.max(observations.length, 5);

      for (var oi = 0; oi < totalDataRows; oi++) {
        var rowNum = 10 + oi;
        sheet.setRowHeight(rowNum, 40);

        var cNo = sheet.getRange('A' + rowNum);
        cNo.setValue(oi + 1);
        cNo.setHorizontalAlignment('center');
        cNo.setVerticalAlignment('middle');
        cNo.setFontSize(10);

        var cDesc = sheet.getRange('B' + rowNum + ':D' + rowNum);
        cDesc.merge();
        if (oi < observations.length) {
          var obsItem = observations[oi];
          var descText = obsItem.temuan || obsItem.deskripsi || '';
          if (obsItem.tindakanPerbaikan) {
            descText += '\n(Action: ' + obsItem.tindakanPerbaikan + ')';
          }
          cDesc.setValue(descText);
        }
        cDesc.setWrap(true);
        cDesc.setVerticalAlignment('top');
        cDesc.setFontSize(10);

        var cTgl = sheet.getRange('E' + rowNum);
        cTgl.setHorizontalAlignment('center');
        cTgl.setVerticalAlignment('middle');
        cTgl.setFontSize(10);

        var cBkt = sheet.getRange('F' + rowNum);
        cBkt.setVerticalAlignment('middle');

        sheet.getRange(rowNum, 1, 1, 6).setBorder(true, true, true, true, true, true, '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID);
      }

      // KUNCI / LOCK KOLOM A-D (Toko hanya bisa mengisi Kolom E & F pada data temuan)
      var protection = sheet.protect().setDescription('Kunci Kolom A-D (Form Store CA)');
      var unprotectedRange = sheet.getRange(10, 5, totalDataRows, 2); // Kolom E & F
      protection.setUnprotectedRanges([unprotectedRange]);

      caSpreadsheetUrl = ss.getUrl();
    } catch (eSs) {
      Logger.log('CA Spreadsheet creation error: ' + eSs.toString());
    }

    // ------------------------------------------------------------------------
    // PENGIRIMAN EMAIL OTOMATIS (JIKA EMAIL DIBERIKAN)
    // ------------------------------------------------------------------------
    var recipientEmails = payload.recipientEmails || '';
    var ccEmails = payload.ccEmails || '';
    var emailStatus = 'SKIPPED';

    if (recipientEmails) {
      var subject = '[FMCU VISIT REPORT] ' + storeName + ' (' + (storeCode || '-') + ') - ' + ddMmYyyy;
      var obsHtml = (report.observations || []).map(function(o, i) {
        return '<tr>' +
          '<td style="border:1px solid #cbd5e1;padding:8px;text-align:center;">' + (i + 1) + '</td>' +
          '<td style="border:1px solid #cbd5e1;padding:8px;font-weight:bold;background:#fefce8;">' + (o.temuan || '-') + '</td>' +
          '<td style="border:1px solid #cbd5e1;padding:8px;">' + (o.tindakanPerbaikan || '-') + '</td>' +
          '<td style="border:1px solid #cbd5e1;padding:8px;color:#b91c1c;font-weight:bold;">' + (o.deadlineFormatted || o.deadline || '-') + '</td>' +
          '</tr>';
      }).join('');

      var htmlBody = '<div style="font-family:Arial,sans-serif;max-width:720px;color:#0f172a;">' +
        '<div style="background:linear-gradient(135deg,#009944,#0099a6);padding:20px;color:#ffffff;border-radius:12px 12px 0 0;">' +
        '<h2 style="margin:0;">FMCU Visit Store Report</h2>' +
        '<p style="margin:4px 0 0;opacity:0.9;">Store: ' + storeName + ' (' + (storeCode || '-') + ') | Tanggal: ' + ddMmYyyy + '</p>' +
        '</div>' +
        '<div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 12px 12px;">' +
        '<p>Halo Tim Store <b>' + storeName + '</b>,</p>' +
        '<p>Berikut adalah hasil kunjungan audit FMCU / Regional Bestie:</p>' +
        '<ul>' +
        '<li><b>Visitor / Auditor:</b> ' + visitorName + '</li>' +
        '<li><b>Store Head:</b> ' + (report.storeHead || '-') + '</li>' +
        '<li><b>Area Manager:</b> ' + (report.areaManager || '-') + '</li>' +
        (pdfUrl ? '<li><b>PDF Laporan Google Drive:</b> <a href="' + pdfUrl + '">Download PDF Laporan</a></li>' : '') +
        (qscPdfUrl ? '<li><b>Kolase Foto QSC (Vertikal):</b> <a href="' + qscPdfUrl + '">Lihat Lembar QSC</a></li>' : '') +
        (caSpreadsheetUrl ? '<li><b>Spreadsheet CA Toko (Online):</b> <a href="' + caSpreadsheetUrl + '">Buka & Update CA Store Assignment</a></li>' : '') +
        '</ul>' +
        '<h4>Ringkasan Temuan Observasi (' + (report.observations ? report.observations.length : 0) + ' Temuan):</h4>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="background:#0099a6;color:#fff;">' +
        '<th style="padding:8px;">No</th><th style="padding:8px;">Temuan</th><th style="padding:8px;">Tindakan Perbaikan</th><th style="padding:8px;">Deadline</th>' +
        '</tr></thead><tbody>' + (obsHtml || '<tr><td colspan="4" style="text-align:center;padding:10px;">Tidak ada temuan.</td></tr>') + '</tbody></table>' +
        '</div></div>';

      var attachments = [];
      if (pdfFile) attachments.push(pdfFile.getBlob());
      if (qscPdfFile) attachments.push(qscPdfFile.getBlob());

      var mailOptions = {
        to: recipientEmails,
        subject: subject,
        htmlBody: htmlBody,
        attachments: attachments
      };
      if (ccEmails) mailOptions.cc = ccEmails;

      MailApp.sendEmail(mailOptions);
      emailStatus = 'SENT';
    }

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
  var match = str.match(/[-\\w]{25,}/);
  return match ? match[0] : str;
}

function getOrCreateTargetFolder_(folderIdOrUrl, defaultFolderName) {
  var cleanId = extractDriveFolderId_(folderIdOrUrl);
  if (cleanId && cleanId.length >= 15) {
    try {
      return DriveApp.getFolderById(cleanId);
    } catch (e) {}
  }
  var folders = DriveApp.getFoldersByName(defaultFolderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(defaultFolderName);
}

function getOrCreateSubFolder_(parentFolder, subFolderName) {
  var subFolders = parentFolder.getFoldersByName(subFolderName);
  if (subFolders.hasNext()) {
    return subFolders.next();
  }
  return parentFolder.createFolder(subFolderName);
}
