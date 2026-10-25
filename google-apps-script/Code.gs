/**
 * ============================================================================
 * FMCU VISIT STORE REPORT - GOOGLE APPS SCRIPT BACKEND (Code.gs)
 * Arsitektur Penyimpanan:
 * - Data User, Master Toko, Jadwal & Teks Laporan -> Cloud Firestore
 * - KHUSUS FILE FOTO (QSC & Bukti Temuan)         -> Google Drive (via Script ini)
 * - Arsip File PDF (16:9) & Pengiriman Email      -> Google Drive & MailApp
 * ============================================================================
 *
 * CARA DEPLOY (1 MENIT):
 * 1. Buka https://script.google.com -> Buat Project Baru
 * 2. Paste seluruh kode ini ke dalam file Code.gs
 * 3. Klik tombol "Deploy" -> "New deployment"
 * 4. Pilih type: "Web app"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 5. Salin Web App URL (https://script.google.com/macros/s/.../exec)
 * 6. Paste URL tersebut ke menu Portal Admin -> Integrasi Email & GDrive di web FMCU.
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || 'sendReport';

    // ========================================================================
    // ACTION 1: UPLOAD FOTO KE DATABASE FOLDER GOOGLE DRIVE
    // (Dipanggil otomatis saat Auditor mengunggah foto QSC / Bukti Temuan)
    // ========================================================================
    if (action === 'uploadPhoto') {
      var rawBase64 = payload.photoBase64 || '';
      if (rawBase64.indexOf(',') !== -1) {
        rawBase64 = rawBase64.split(',')[1];
      }
      var decodedPhoto = Utilities.base64Decode(rawBase64);
      var photoFileName = payload.fileName || ('FMCU_PHOTO_' + new Date().getTime() + '.jpg');
      var photoBlob = Utilities.newBlob(decodedPhoto, 'image/jpeg', photoFileName);

      var rootPhotoFolder = getOrCreateTargetFolder_(
        payload.gdrivePhotoFolderId,
        'FMCU_Visit_Photos_Database'
      );

      // Buat subfolder rapi per Toko (contoh: "0001 - TAMAN KOTA")
      var storeFolderName = ((payload.storeCode || 'STORE') + ' - ' + (payload.storeName || 'VISIT')).replace(/[\\/:*?"<>|]/g, '_');
      var storeFolder = getOrCreateSubFolder_(rootPhotoFolder, storeFolderName);

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
    // (Dipanggil otomatis saat perangkat lain ingin membuat/mengunduh file PDF)
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
    // ACTION 3: SIMPAN PDF LAPORAN VISIT KE GOOGLE DRIVE & KIRIM EMAIL
    // ========================================================================
    var report = payload.report || {};
    var pdfBase64 = payload.pdfBase64 || '';
    var fileName = payload.fileName || ('FMCU_Visit_Report_' + (report.storeName || 'STORE') + '.pdf');
    var folderId = payload.gdriveFolderId || '';
    var recipientEmails = payload.recipientEmails || '';
    var ccEmails = payload.ccEmails || '';

    var fileUrl = '';
    var pdfBlob = null;

    if (pdfBase64) {
      if (pdfBase64.indexOf(',') !== -1) {
        pdfBase64 = pdfBase64.split(',')[1];
      }
      var decoded = Utilities.base64Decode(pdfBase64);
      pdfBlob = Utilities.newBlob(decoded, 'application/pdf', fileName);

      var folder = getOrCreateTargetFolder_(folderId, 'FMCU_Visit_Reports_PDF_Archive');
      var driveFile = folder.createFile(pdfBlob);
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileUrl = driveFile.getUrl();
    }

    var emailStatus = 'SKIPPED';
    if (recipientEmails) {
      var subject = '[FMCU VISIT REPORT] ' + (report.storeName || '') + ' (' + (report.storeCode || '') + ') - ' + (report.visitDateFormatted || report.visitDate || '');
      var obsHtml = (report.observations || []).map(function(o, i) {
        return '<tr>' +
          '<td style="border:1px solid #cbd5e1;padding:8px;text-align:center;">' + (i + 1) + '</td>' +
          '<td style="border:1px solid #cbd5e1;padding:8px;font-weight:bold;background:#fefce8;">' + (o.temuan || '-') + '</td>' +
          '<td style="border:1px solid #cbd5e1;padding:8px;">' + (o.tindakanPerbaikan || '-') + '</td>' +
          '<td style="border:1px solid #cbd5e1;padding:8px;color:#b91c1c;font-weight:bold;">' + (o.deadlineFormatted || o.deadline || '-') + '</td>' +
          '</tr>';
      }).join('');

      var htmlBody = '<div style="font-family:Arial,sans-serif;max-width:700px;color:#0f172a;">' +
        '<div style="background:linear-gradient(135deg,#009944,#0099a6);padding:20px;color:#ffffff;border-radius:8px 8px 0 0;">' +
        '<h2 style="margin:0;">FMCU Visit Store Report</h2>' +
        '<p style="margin:4px 0 0;opacity:0.9;">Store: ' + (report.storeName || '-') + ' (' + (report.storeCode || '-') + ') | Tanggal: ' + (report.visitDateFormatted || '-') + '</p>' +
        '</div>' +
        '<div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 8px 8px;">' +
        '<p>Halo Tim Store <b>' + (report.storeName || '-') + '</b>,</p>' +
        '<p>Berikut adalah hasil kunjungan audit FMCU / Regional Bestie:</p>' +
        '<ul>' +
        '<li><b>Auditor:</b> ' + (report.auditorName || '-') + '</li>' +
        '<li><b>Store Head:</b> ' + (report.storeHead || '-') + '</li>' +
        '<li><b>Area Manager:</b> ' + (report.areaManager || '-') + '</li>' +
        '<li><b>Regional Manager:</b> ' + (report.regionalManager || '-') + '</li>' +
        '<li><b>Actual In - Out:</b> ' + (report.actualIn || '-') + ' s/d ' + (report.actualOut || '-') + '</li>' +
        '<li><b>Koordinat GPS Live:</b> ' + (report.gpsLat || '-') + ', ' + (report.gpsLng || '-') + '</li>' +
        (fileUrl ? '<li><b>Link Arsip PDF Google Drive:</b> <a href="' + fileUrl + '">' + fileUrl + '</a></li>' : '') +
        '</ul>' +
        '<h4>Ringkasan Temuan Observasi (' + (report.observations ? report.observations.length : 0) + ' Temuan):</h4>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="background:#0099a6;color:#fff;">' +
        '<th style="padding:8px;">No</th><th style="padding:8px;">Temuan</th><th style="padding:8px;">Tindakan Perbaikan</th><th style="padding:8px;">Deadline</th>' +
        '</tr></thead><tbody>' + obsHtml + '</tbody></table>' +
        '<p style="margin-top:16px;">Silakan unduh form Corrective Action pada link: <a href="' + (report.caLink || 'https://tinyurl.com/store-caassignment') + '">' + (report.caLink || 'https://tinyurl.com/store-caassignment') + '</a></p>' +
        '</div></div>';

      var mailOptions = {
        to: recipientEmails,
        subject: subject,
        htmlBody: htmlBody
      };
      if (ccEmails) mailOptions.cc = ccEmails;
      if (pdfBlob) mailOptions.attachments = [pdfBlob];

      MailApp.sendEmail(mailOptions);
      emailStatus = 'SENT';
    }

    return jsonResponse_({
      status: 'SUCCESS',
      fileUrl: fileUrl,
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
  var match = str.match(/[-\w]{25,}/);
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
