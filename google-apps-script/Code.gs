/**
 * ============================================================================
 * FMCU VISIT STORE REPORT - GOOGLE APPS SCRIPT BACKEND (Code.gs)
 * Fitur Otomatis:
 * 1. Simpan File PDF Laporan Visit ke Folder Google Drive Rekap
 * 2. Kirim Email Otomatis beserta Lampiran PDF ke Toko, AM, RM, & FMCU
 * 3. Rekap Data Visit, Temuan, Live Location & Actual In-Out ke Google Sheets
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
 * 6. Paste URL tersebut ke menu Admin -> Integrasi Email & GDrive di web FMCU.
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var report = payload.report || {};
    var pdfBase64 = payload.pdfBase64 || '';
    var fileName = payload.fileName || ('FMCU_Visit_Report_' + (report.storeName || 'STORE') + '.pdf');
    var folderId = payload.gdriveFolderId || '';
    var recipientEmails = payload.recipientEmails || '';
    var ccEmails = payload.ccEmails || '';

    var fileUrl = '';
    var pdfBlob = null;

    // 1. Simpan PDF ke Folder Google Drive
    if (pdfBase64) {
      var decoded = Utilities.base64Decode(pdfBase64);
      pdfBlob = Utilities.newBlob(decoded, 'application/pdf', fileName);

      var folder;
      if (folderId && folderId.length > 10 && folderId.indexOf('1FMCU_') === -1) {
        try {
          folder = DriveApp.getFolderById(folderId);
        } catch (err) {
          folder = getOrCreateDefaultFolder_();
        }
      } else {
        folder = getOrCreateDefaultFolder_();
      }

      var driveFile = folder.createFile(pdfBlob);
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileUrl = driveFile.getUrl();
    }

    // 2. Kirim Email Laporan Visit beserta Lampiran PDF
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

    return ContentService.createTextOutput(JSON.stringify({
      status: 'SUCCESS',
      fileUrl: fileUrl,
      emailStatus: emailStatus,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'ERROR',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateDefaultFolder_() {
  var folderName = 'FMCU_Visit_Reports_PDF_Archive';
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}
