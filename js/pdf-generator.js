// ============================================================================
// FMCU VISIT STORE REPORT - Pixel-Perfect 16:9 PDF Generator & Slide Previewer
// Matches Regional_Bestie_Visit_Report_TAMAN_KOTA.pdf layout with FMCU branding
// ============================================================================

window.FMCUPdf = {
  lastBlobUrl: null,

  // Format date helper (YYYY-MM-DD -> "16 Okt 2026" & "Jumat, 16 Okt 2026")
  formatIndonesianDate(dateStr, includeDay = false) {
    if (!dateStr) return '-';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const formatted = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    return includeDay ? `${days[d.getDay()]}, ${formatted}` : formatted;
  },

  // Compress & Stamp Uploaded Photo with Store + Timestamp + Live GPS Watermark
  async processAndStampImage(fileOrDataUrl, options = {}) {
    const {
      storeName = 'STORE VISIT',
      gpsLat = null,
      gpsLng = null,
      applyWatermark = true,
      maxDimension = 1100
    } = options;

    return new Promise((resolve, reject) => {
      const renderOnCanvas = (src) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxDimension || h > maxDimension) {
            if (w > h) {
              h = Math.round((h * maxDimension) / w);
              w = maxDimension;
            } else {
              w = Math.round((w * maxDimension) / h);
              h = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          if (applyWatermark) {
            const barH = Math.max(46, Math.round(h * 0.095));
            ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
            ctx.fillRect(0, h - barH, w, barH);

            // Green accent bar on left
            ctx.fillStyle = '#009944';
            ctx.fillRect(0, h - barH, Math.max(6, Math.round(w * 0.012)), barH);

            const padLeft = Math.max(14, Math.round(w * 0.025));
            const titleFontSize = Math.max(12, Math.round(barH * 0.36));
            const subFontSize = Math.max(10, Math.round(barH * 0.27));

            ctx.fillStyle = '#FFFFFF';
            ctx.font = `bold ${titleFontSize}px sans-serif`;
            ctx.fillText(`${storeName.toUpperCase()} (FMI)`, padLeft, h - barH + titleFontSize + 5);

            const now = new Date();
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            const timeStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
            const gpsStr = (gpsLat && gpsLng)
              ? `GPS: ${Number(gpsLat).toFixed(5)}, ${Number(gpsLng).toFixed(5)}`
              : 'GPS: Live Location Verified';

            ctx.fillStyle = '#CBD5E1';
            ctx.font = `${subFontSize}px sans-serif`;
            ctx.fillText(`${timeStr} • ${gpsStr}`, padLeft, h - 7);
          }

          resolve(canvas.toDataURL('image/jpeg', 0.84));
        };
        img.onerror = (err) => reject(err);
        img.src = src;
      };

      if (!fileOrDataUrl) {
        reject(new Error('Sumber foto kosong.'));
        return;
      }

      if (typeof fileOrDataUrl === 'string') {
        renderOnCanvas(fileOrDataUrl);
      } else if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => renderOnCanvas(e.target.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(fileOrDataUrl);
      } else {
        reject(new Error('Format foto tidak valid.'));
      }
    });
  },

  // Helper to draw footer on every PDF page (Watermark text omitted per user request)
  drawPageFooter(doc, footerText) {
    // Watermark / footer text intentionally omitted per user request
  },

  // Ambil sumber URL gambar untuk tampilan HTML & Slide Preview (mendukung cache RAM + URL Google Drive)
  getPhotoDisplaySrc(photo) {
    if (!photo) return '';
    if (photo.dataUrl && photo.dataUrl.startsWith('data:image')) {
      return photo.dataUrl;
    }
    if (window.FMCUData && typeof window.FMCUData.getPhotoFromMemory === 'function') {
      const mem = window.FMCUData.getPhotoFromMemory(photo.id, photo.driveFileId);
      if (mem) return mem;
    }
    if (photo.driveUrl) return photo.driveUrl;
    if (photo.driveFileId) return `https://drive.google.com/thumbnail?id=${photo.driveFileId}&sz=w1200`;
    return photo.dataUrl || '';
  },

  // Ambil sumber Base64 gambar khusus untuk cetak PDF (jsPDF)
  getPhotoBase64ForPdf(photo) {
    if (!photo) return '';
    if (photo.dataUrl && photo.dataUrl.startsWith('data:image')) {
      return photo.dataUrl;
    }
    if (window.FMCUData && typeof window.FMCUData.getPhotoFromMemory === 'function') {
      return window.FMCUData.getPhotoFromMemory(photo.id, photo.driveFileId) || '';
    }
    return '';
  },

  // Tarik Base64 foto dari Google Drive (via Google Apps Script) apabila dibuka dari perangkat lain
  async hydrateReportPhotosFromGDrive(report) {
    if (!report || !window.FMCUData || typeof window.FMCUData.fetchDrivePhotosBase64 !== 'function') {
      return report;
    }
    const driveIdsToFetch = [];
    const allPhotos = [...(report.qscPhotos || []), ...(report.evidencePhotos || []), ...(report.caPhotos || report.correctiveActionPhotos || [])];
    allPhotos.forEach((p) => {
      if (p && p.driveFileId && !this.getPhotoBase64ForPdf(p)) {
        driveIdsToFetch.push(p.driveFileId);
      }
    });
    if (driveIdsToFetch.length > 0) {
      await window.FMCUData.fetchDrivePhotosBase64(driveIdsToFetch);
    }
    return report;
  },

  // Generate jsPDF Document instance for a report
  generatePdfDoc(report) {
    const { jsPDF } = window.jspdf;
    const settings = window.FMCUData ? window.FMCUData.getSettings() : {};
    const PA = window.PDF_ASSETS || {};

    const reportTitle = report.reportTitle || settings.reportTitle || 'FMCU Visit Store Report';
    const footerText = settings.footerText || 'GENERATED BY FMCU VISIT WEB REPORT';
    const caLink = report.caLink || settings.caLink || 'https://tinyurl.com/store-caassignment';

    // Exact 16:9 widescreen dimensions used in reference PDF: 320mm x 180mm
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [320, 180],
      compress: true
    });

    // ========================================================================
    // PAGE 1: COVER SLIDE
    // ========================================================================
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 320, 180, 'F');

    if (PA.bannerFamilyMart) {
      try {
        doc.addImage(PA.bannerFamilyMart, 'JPEG', 0, 0, 320, 180);
      } catch (e) {
        console.warn('Cover image error:', e);
      }
    }

    // White rectangle covering bottom area (y=103 to 180) so custom title renders cleanly
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 103, 320, 77, 'F');

    // Main Report Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(0, 153, 166);
    doc.text(reportTitle, 12, 126);

    // Left Metadata (Nama, Store, Store Head)
    const leftRows = [
      { label: 'Nama', value: report.auditorName || '-', y: 144, size: 12.5 },
      { label: 'Store', value: report.storeName || '-', y: 153, size: 12.5 },
      { label: 'Store Head', value: report.storeHead || '-', y: 162, size: 11.5 }
    ];
    leftRows.forEach((row) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(row.size);
      doc.setTextColor(82, 82, 91);
      doc.text(row.label, 12, row.y);
      doc.text(':', 51, row.y);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(39, 39, 42);
      doc.text(String(row.value), 57, row.y);
    });

    // Right Metadata Card
    doc.setFillColor(247, 250, 252);
    doc.setDrawColor(227, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(180, 134, 130, 41, 3, 3, 'FD');

    const visitDateText = report.visitDateFormatted || this.formatIndonesianDate(report.visitDate, false);
    const rightMeta = [
      { label: 'TANGGAL VISIT', value: visitDateText, x: 188, y: 141.5 },
      { label: 'KODE TOKO', value: report.storeCode || '-', x: 253, y: 141.5 },
      { label: 'TIPE TOKO', value: report.storeType || 'CVS', x: 188, y: 155 },
      { label: 'AREA MANAGER', value: report.areaManager || '-', x: 253, y: 155 },
      { label: 'REGIONAL MANAGER', value: report.regionalManager || '-', x: 188, y: 168 }
    ];

    rightMeta.forEach((m) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(m.label, m.x, m.y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(39, 39, 42);
      doc.text(String(m.value), m.x, m.y + 4.8);
    });

    this.drawPageFooter(doc, footerText);

    // ========================================================================
    // PAGE 2: QSC / FAMITRACK RESULT (2 photos per page)
    // ========================================================================
    const qscPhotos = (report.qscPhotos && report.qscPhotos.length > 0)
      ? report.qscPhotos
      : [
          { caption: 'Foto QSC / Famitrack 1', dataUrl: '' },
          { caption: 'Foto QSC / Famitrack 2', dataUrl: '' }
        ];

    for (let i = 0; i < qscPhotos.length; i += 2) {
      doc.addPage([320, 180], 'landscape');
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 320, 180, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.setTextColor(0, 153, 166);
      doc.text('QSC/ Famitrack Result', 10, 24);

      doc.setDrawColor(0, 153, 166);
      doc.setLineWidth(0.4);
      doc.line(10, 37, 310, 37);

      const pair = qscPhotos.slice(i, i + 2);
      pair.forEach((photo, idx) => {
        const cardX = idx === 0 ? 10 : 165;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(204, 214, 224);
        doc.setLineWidth(0.35);
        doc.roundedRect(cardX, 42, 145, 119, 4, 4, 'FD');

        const qscImgBase64 = this.getPhotoBase64ForPdf(photo);
        if (qscImgBase64) {
          try {
            doc.addImage(qscImgBase64, 'JPEG', cardX + 3, 45, 139, 104);
          } catch (e) {
            console.warn('QSC photo draw error:', e);
          }
        } else {
          doc.setFillColor(248, 250, 252);
          doc.rect(cardX + 3, 45, 139, 104, 'F');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(148, 163, 184);
          doc.text('Tidak ada foto dilampirkan', cardX + 72.5, 97, { align: 'center' });
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(photo.caption || `Foto QSC / Famitrack ${i + idx + 1}`, cardX + 5, 155);
      });

      this.drawPageFooter(doc, footerText);
    }

    // ========================================================================
    // PAGE 3: GENERAL INFORMATION (Store Crew Table)
    // ========================================================================
    doc.addPage([320, 180], 'landscape');
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 320, 180, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(39, 39, 42);
    doc.text('General Information', 10, 25);

    const dayDateText = report.visitDayDateFormatted || this.formatIndonesianDate(report.visitDate, true);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12.5);
    doc.setTextColor(82, 82, 91);
    doc.text('Hari, Tanggal', 10, 42);
    doc.text(':', 46, 42);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(39, 39, 42);
    doc.text(dayDateText, 52, 42);

    // Table Header
    const tableX = 10;
    let tableY = 52;
    const colW1 = 58;
    const colW2 = 192;
    const colW3 = 50;
    const headerH = 12;

    doc.setFillColor(0, 153, 166);
    doc.rect(tableX, tableY, colW1 + colW2 + colW3, headerH, 'F');

    doc.setDrawColor(204, 214, 224);
    doc.setLineWidth(0.25);
    doc.rect(tableX, tableY, colW1, headerH, 'S');
    doc.rect(tableX + colW1, tableY, colW2, headerH, 'S');
    doc.rect(tableX + colW1 + colW2, tableY, colW3, headerH, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Role', tableX + colW1 / 2, tableY + 7.8, { align: 'center' });
    doc.text('Nama', tableX + colW1 + colW2 / 2, tableY + 7.8, { align: 'center' });
    doc.text('Job Level', tableX + colW1 + colW2 + colW3 / 2, tableY + 7.8, { align: 'center' });

    tableY += headerH;
    const crewRows = (report.crewList && report.crewList.length > 0)
      ? report.crewList
      : [
          { role: 'Store Head', name: report.storeHead || '-', jobLevel: 'NS1' },
          { role: 'Shift Leader', name: '-', jobLevel: 'NS1' },
          { role: 'Crew Store 1', name: '-', jobLevel: 'MG1' },
          { role: 'Crew Store 2', name: '-', jobLevel: 'MG1' }
        ];

    const rowH = 11;
    crewRows.forEach((crew, idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(247, 250, 252);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(tableX, tableY, colW1 + colW2 + colW3, rowH, 'F');
      doc.setDrawColor(204, 214, 224);
      doc.rect(tableX, tableY, colW1, rowH, 'S');
      doc.rect(tableX + colW1, tableY, colW2, rowH, 'S');
      doc.rect(tableX + colW1 + colW2, tableY, colW3, rowH, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(39, 39, 42);
      doc.text(String(crew.role || '-'), tableX + 5, tableY + 7.2);

      doc.setFont('helvetica', 'normal');
      doc.text(String(crew.name || '-'), tableX + colW1 + 5, tableY + 7.2);
      doc.text(String(crew.jobLevel || '-'), tableX + colW1 + colW2 + colW3 / 2, tableY + 7.2, { align: 'center' });

      tableY += rowH;
    });

    this.drawPageFooter(doc, footerText);

    // Helper: Draw observation findings pages (2 findings per page)
    const drawObservationPages = (obsList, sectionTitle) => {
      const totalObs = obsList.length;
      for (let i = 0; i < totalObs; i += 2) {
        doc.addPage([320, 180], 'landscape');
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, 320, 180, 'F');

        // Top Teal Header Bar
        doc.setFillColor(0, 153, 166);
        doc.rect(0, 0, 320, 18, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12.5);
        doc.setTextColor(255, 255, 255);
        doc.text(sectionTitle, 12, 11.8);

        // Subtitle
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.8);
        doc.setTextColor(100, 116, 139);
        doc.text('Ringkasan observasi - beberapa temuan per halaman', 12, 23.5);

        const pair = obsList.slice(i, i + 2);
        pair.forEach((obs, idx) => {
          const cardY = idx === 0 ? 27 : 98;
          const cardH = 66;
          const cardX = 8;
          const cardW = 304;

          // Outer Card
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.3);
          doc.roundedRect(cardX, cardY, cardW, cardH, 2.5, 2.5, 'FD');

          // Card Top Header Strip (Teal)
          doc.setFillColor(0, 153, 166);
          doc.roundedRect(cardX, cardY, cardW, 8.5, 2.5, 2.5, 'F');
          doc.rect(cardX, cardY + 4, cardW, 4.5, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(255, 255, 255);
          doc.text(`Temuan ${i + idx + 1}/${totalObs}`, cardX + 3.5, cardY + 5.8);

          // Deadline Pill Badge on Right
          const dlText = obs.deadlineFormatted || this.formatIndonesianDate(obs.deadline, false);
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(cardX + cardW - 62, cardY + 1.4, 58, 5.6, 2.8, 2.8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(185, 28, 28);
          doc.text(`Deadline Perbaikan: ${dlText}`, cardX + cardW - 33, cardY + 5.2, { align: 'center' });

          // 2x3 Grid of Sub-boxes inside Card
          const leftColX = cardX + 2.5;
          const rightColX = cardX + 153;
          const boxW = 148.5;

          const row1Y = cardY + 10.5;
          const row1H = 19.5;
          const row2Y = cardY + 31.5;
          const row2H = 16;
          const row3Y = cardY + 49;
          const row3H = 15;

          // Left Row 1: Temuan (Yellow Highlight Box)
          doc.setFillColor(254, 252, 232);
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.25);
          doc.roundedRect(leftColX, row1Y, boxW, row1H, 1.2, 1.2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.8);
          doc.setTextColor(180, 83, 9);
          doc.text('Temuan', leftColX + 2.2, row1Y + 4.2);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.8);
          doc.setTextColor(24, 24, 27);
          const temuanLines = doc.splitTextToSize(String(obs.temuan || '-'), boxW - 4.5);
          doc.text(temuanLines.slice(0, 3), leftColX + 2.2, row1Y + 8.5);

          // Right Row 1: Dampak
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(rightColX, row1Y, boxW, row1H, 1.2, 1.2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.8);
          doc.setTextColor(0, 130, 145);
          doc.text('Dampak', rightColX + 2.2, row1Y + 4.2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          doc.setTextColor(24, 24, 27);
          const dampakLines = doc.splitTextToSize(String(obs.dampak || '-'), boxW - 4.5);
          doc.text(dampakLines.slice(0, 4), rightColX + 2.2, row1Y + 8.2);

          // Left Row 2: Kondisi Ideal
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(leftColX, row2Y, boxW, row2H, 1.2, 1.2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.8);
          doc.setTextColor(0, 130, 145);
          doc.text('Kondisi Ideal', leftColX + 2.2, row2Y + 4.2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          doc.setTextColor(24, 24, 27);
          const idealLines = doc.splitTextToSize(String(obs.kondisiIdeal || '-'), boxW - 4.5);
          doc.text(idealLines.slice(0, 3), leftColX + 2.2, row2Y + 8.2);

          // Right Row 2: Tindakan Perbaikan
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(rightColX, row2Y, boxW, row2H, 1.2, 1.2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.8);
          doc.setTextColor(0, 130, 145);
          doc.text('Tindakan Perbaikan', rightColX + 2.2, row2Y + 4.2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          doc.setTextColor(24, 24, 27);
          const tindakanLines = doc.splitTextToSize(String(obs.tindakanPerbaikan || '-'), boxW - 4.5);
          doc.text(tindakanLines.slice(0, 3), rightColX + 2.2, row2Y + 8.2);

          // Left Row 3: Penyebab
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(leftColX, row3Y, boxW, row3H, 1.2, 1.2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.8);
          doc.setTextColor(0, 130, 145);
          doc.text('Penyebab', leftColX + 2.2, row3Y + 4.2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          doc.setTextColor(24, 24, 27);
          const penyebabLines = doc.splitTextToSize(String(obs.penyebab || '-'), boxW - 4.5);
          doc.text(penyebabLines.slice(0, 3), leftColX + 2.2, row3Y + 8.2);

          // Right Row 3: Hasil
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(rightColX, row3Y, boxW, row3H, 1.2, 1.2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.8);
          doc.setTextColor(0, 130, 145);
          doc.text('Hasil', rightColX + 2.2, row3Y + 4.2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          doc.setTextColor(24, 24, 27);
          const hasilLines = doc.splitTextToSize(String(obs.hasil || '-'), boxW - 4.5);
          doc.text(hasilLines.slice(0, 3), rightColX + 2.2, row3Y + 8.2);
        });

        this.drawPageFooter(doc, footerText);
      }
    };

    // Helper: Draw evidence photos pages (6 photos per page in 3x2 grid)
    const drawEvidencePhotoPages = (photosList, sectionTitle) => {
      if (!photosList || photosList.length === 0) return;
      for (let i = 0; i < photosList.length; i += 6) {
        doc.addPage([320, 180], 'landscape');
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, 320, 180, 'F');

        // Top Teal Bar
        doc.setFillColor(0, 153, 166);
        doc.rect(0, 0, 320, 18, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12.5);
        doc.setTextColor(255, 255, 255);
        doc.text(sectionTitle, 12, 11.8);

        const chunk = photosList.slice(i, i + 6);
        const colXs = [10, 111.2, 212.4];
        const rowYs = [22, 97.5];
        const cardW = 97.6;
        const cardH = 72.7;

        chunk.forEach((ev, idx) => {
          const col = idx % 3;
          const row = Math.floor(idx / 3);
          const cx = colXs[col];
          const cy = rowYs[row];

          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.25);
          doc.roundedRect(cx, cy, cardW, cardH, 3, 3, 'FD');

          // Photo slot on left half of card
          const imgX = cx + 2.5;
          const imgY = cy + 3;
          const imgW = 44.5;
          const imgH = 66.7;

          doc.setFillColor(247, 250, 252);
          doc.roundedRect(imgX, imgY, imgW, imgH, 2, 2, 'F');

          const evImgBase64 = this.getPhotoBase64ForPdf(ev);
          if (evImgBase64) {
            try {
              doc.addImage(evImgBase64, 'JPEG', imgX, imgY, imgW, imgH);
            } catch (e) {
              console.warn('Photo draw error:', e);
            }
          }

          // Description text on right half of card
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.8);
          doc.setTextColor(24, 24, 27);
          const descLines = doc.splitTextToSize(String(ev.description || '-'), 45);
          doc.text(descLines.slice(0, 10), cx + 50, cy + 10);
        });

        this.drawPageFooter(doc, footerText);
      }
    };

    // ========================================================================
    // SECTION A: OPI PROJECT OBSERVATION (CONDET 2 STANDARD)
    // ========================================================================
    const opiEnabled = report.enableOpi !== false;
    const opiObservations = (opiEnabled && report.opiObservations && report.opiObservations.length > 0)
      ? report.opiObservations.filter((o) => o && o.temuan && o.temuan.trim() !== '')
      : [];

    if (opiEnabled && opiObservations.length > 0) {
      doc.addPage([320, 180], 'landscape');
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 320, 180, 'F');
      if (PA.dividerOpiProjectObservation) {
        try {
          doc.addImage(PA.dividerOpiProjectObservation, 'JPEG', 0, 0, 320, 180);
        } catch (e) {
          console.warn('Divider OPI image error:', e);
        }
      }
      this.drawPageFooter(doc, footerText);

      drawObservationPages(opiObservations, 'OPI Project Observation');
    }

    // ========================================================================
    // SECTION B: QSC OBSERVATION
    // ========================================================================
    const qscEnabled = report.enableQsc !== false;
    const rawQscObs = (report.qscObservations && report.qscObservations.length > 0)
      ? report.qscObservations
      : (report.observations && report.observations.length > 0 ? report.observations : []);
    const qscObservations = qscEnabled ? rawQscObs.filter((o) => o && o.temuan && o.temuan.trim() !== '') : [];

    if (qscEnabled && qscObservations.length > 0) {
      doc.addPage([320, 180], 'landscape');
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 320, 180, 'F');
      if (PA.dividerQscObservation) {
        try {
          doc.addImage(PA.dividerQscObservation, 'JPEG', 0, 0, 320, 180);
        } catch (e) {
          console.warn('Divider QSC image error:', e);
        }
      }
      this.drawPageFooter(doc, footerText);
      drawObservationPages(qscObservations, 'QSC Observation');
    }

    // ========================================================================
    // SECTION C: FINDING EVIDENCE PHOTOS
    // ========================================================================
    const evEnabled = report.enableEvidence !== false;
    const evPhotos = (evEnabled && report.evidencePhotos && report.evidencePhotos.length > 0)
      ? report.evidencePhotos
      : [];

    if (evEnabled && evPhotos.length > 0) {
      doc.addPage([320, 180], 'landscape');
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 320, 180, 'F');
      if (PA.dividerFindingEvidence) {
        try {
          doc.addImage(PA.dividerFindingEvidence, 'JPEG', 0, 0, 320, 180);
        } catch (e) {
          console.warn('Divider Finding Evidence image error:', e);
        }
      }
      this.drawPageFooter(doc, footerText);
      drawEvidencePhotoPages(evPhotos, 'Finding Evidence - Evidence Photos');
    }

    // ========================================================================
    // SECTION D: CORRECTIVE ACTION EVIDENCE & RESULT (CONDET 2 STANDARD)
    // ========================================================================
    const caEnabled = report.enableCa !== false;
    const rawCaPhotos = (report.caPhotos && report.caPhotos.length > 0)
      ? report.caPhotos
      : (report.correctiveActionPhotos && report.correctiveActionPhotos.length > 0 ? report.correctiveActionPhotos : []);
    const caPhotos = caEnabled ? rawCaPhotos : [];

    if (caEnabled && caPhotos.length > 0) {
      doc.addPage([320, 180], 'landscape');
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 320, 180, 'F');
      if (PA.dividerCorrectiveAction) {
        try {
          doc.addImage(PA.dividerCorrectiveAction, 'JPEG', 0, 0, 320, 180);
        } catch (e) {
          console.warn('Divider Corrective Action image error:', e);
        }
      }
      this.drawPageFooter(doc, footerText);

      drawEvidencePhotoPages(caPhotos, 'Corrective Action Evidence & Result - Evidence Photos');
    }

    // ========================================================================
    // PAGE 10: SECTION DIVIDER - STORE ASSIGNMENT
    // ========================================================================
    doc.addPage([320, 180], 'landscape');
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 320, 180, 'F');
    if (PA.dividerStoreAssignment) {
      try {
        doc.addImage(PA.dividerStoreAssignment, 'JPEG', 0, 0, 320, 180);
      } catch (e) {
        console.warn('Divider Store Assignment image error:', e);
      }
    }
    this.drawPageFooter(doc, footerText);

    // ========================================================================
    // PAGE 11: MEKANISME PELAPORAN
    // ========================================================================
    doc.addPage([320, 180], 'landscape');
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 320, 180, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(39, 39, 42);
    doc.text('Mekanisme pelaporan', 10, 30);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 153, 166);
    doc.text(caLink, 10, 47);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12.5);
    doc.setTextColor(39, 39, 42);
    const rules = [
      '1. Unduh file pada link di atas.',
      '2. Tim store mengisi form tersebut berdasarkan temuan yang telah ditunjukkan pada file laporan ini.',
      '3. Tindakan perbaikan WAJIB dilakukan sebelum deadline yang diberikan oleh FMCU / Regional Bestie.',
      '4. Form tindakan perbaikan yang telah dibuat WAJIB dikirimkan kembali via email dengan terusan: Regional Manager, Area Manager, Regional Bestie,\ndan FMCU.'
    ];
    let ruleY = 64;
    rules.forEach((r) => {
      const lines = doc.splitTextToSize(r, 295);
      doc.text(lines, 10, ruleY);
      ruleY += lines.length * 6.5 + 4.7;
    });

    this.drawPageFooter(doc, footerText);

    return doc;
  },

  formatDateDdMmYyyy(dateStr) {
    if (!dateStr) {
      const now = new Date();
      return `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const m = String(dateStr).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (m) return `${String(m[3]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}-${m[1]}`;
      return String(dateStr).replace(/[/\\:*?"<>|]/g, '-');
    }
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  },

  // Get Filename for PDF Download (Standard: Hasil Kunjungan-{Nama Store}-{DD-MM-YYYY}.pdf)
  getFileName(report) {
    const cleanStore = String(report.storeName || 'STORE').replace(/[/\\:*?"<>|]/g, ' ').trim();
    const dateFormatted = this.formatDateDdMmYyyy(report.visitDate);
    return `Hasil Kunjungan-${cleanStore}-${dateFormatted}.pdf`;
  },

  // Generate Vertical Collage PDF for QSC Inspection Photos (Portrait A4)
  generateVerticalQscCollagePdf(report) {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) return null;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const cleanStore = String(report.storeName || 'STORE').trim();
    const dateFormatted = this.formatDateDdMmYyyy(report.visitDate);

    // Ambil foto lembar QSC dari Section 1 Form Visit (report.qscPhotos atau formQscPhotos live)
    let rawQscPhotos = [];
    if (Array.isArray(report.qscPhotos) && report.qscPhotos.length > 0) {
      rawQscPhotos = report.qscPhotos;
    } else if (window.FMCUApp && Array.isArray(window.FMCUApp.formQscPhotos) && window.FMCUApp.formQscPhotos.length > 0) {
      rawQscPhotos = window.FMCUApp.formQscPhotos;
    }

    // Resolusi Base64 untuk masing-masing foto Lembar QSC Section 1
    const processedPhotos = [];
    rawQscPhotos.forEach((p, idx) => {
      if (!p) return;
      let base64 = this.getPhotoBase64ForPdf(p);
      if (!base64 && p.dataUrl && p.dataUrl.startsWith('data:image')) {
        base64 = p.dataUrl;
      }
      if (!base64 && window.FMCUApp?.formQscPhotos?.[idx]?.dataUrl?.startsWith('data:image')) {
        base64 = window.FMCUApp.formQscPhotos[idx].dataUrl;
      }
      if (!base64 && window.FMCUData && typeof window.FMCUData.getPhotoFromMemory === 'function') {
        base64 = window.FMCUData.getPhotoFromMemory(p.id, p.driveFileId);
      }
      processedPhotos.push({
        ...p,
        resolvedBase64: base64 || '',
        slotIndex: idx + 1,
        caption: p.caption || `Lembar Form QSC / FamiTrack #${idx + 1}`
      });
    });

    // Filter foto aktif (yang memiliki Base64 atau ID Drive)
    const activePhotos = processedPhotos.filter(p => Boolean(p.resolvedBase64 || p.dataUrl || p.driveUrl || p.driveFileId));

    if (activePhotos.length === 0) {
      // Empty state single page
      doc.setFillColor(0, 153, 68);
      doc.rect(0, 0, pageWidth, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('KOLASE LEMBAR QSC (SECTION 1 FORM VISIT)', pageWidth / 2, 14, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`${cleanStore.toUpperCase()} (${report.storeCode || '-'}) • ${dateFormatted}`, pageWidth / 2, 22, { align: 'center' });

      doc.setTextColor(100, 116, 139);
      doc.setFontSize(11);
      doc.text('Belum ada foto lembar QSC yang diunggah pada Section 1 Form Visit.', pageWidth / 2, 120, { align: 'center' });
      return doc;
    }

    // Two vertical photos per page (Format Vertikal)
    const photosPerPage = 2;
    const totalPages = Math.ceil(activePhotos.length / photosPerPage);

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      if (pIdx > 0) doc.addPage();

      // Header Banner FamilyMart
      doc.setFillColor(0, 153, 68);
      doc.rect(0, 0, pageWidth, 24, 'F');
      doc.setFillColor(0, 153, 166);
      doc.rect(0, 24, pageWidth, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('KOLASE LEMBAR QSC (SECTION 1 FORM VISIT)', 12, 11);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Store: ${cleanStore} (${report.storeCode || '-'}) | Auditor: ${report.auditorName || '-'} | Tanggal: ${dateFormatted} | Hal ${pIdx + 1}/${totalPages}`, 12, 18);

      const startPhotoIdx = pIdx * photosPerPage;
      const pagePhotos = activePhotos.slice(startPhotoIdx, startPhotoIdx + photosPerPage);

      pagePhotos.forEach((photo, subIdx) => {
        const photoNum = photo.slotIndex || (startPhotoIdx + subIdx + 1);
        const boxY = 32 + (subIdx * 125);
        const boxH = 118;
        const boxW = 186;
        const boxX = 12;

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(boxX, boxY, boxW, boxH, 3, 3, 'FD');

        // Photo Label
        doc.setFillColor(0, 153, 166);
        doc.roundedRect(boxX + 4, boxY + 4, 75, 6.5, 1.5, 1.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`Lembar QSC / FamiTrack #${photoNum} (Section 1)`, boxX + 6, boxY + 8.5);

        const imgBase64 = photo.resolvedBase64 || (photo.dataUrl && photo.dataUrl.startsWith('data:image') ? photo.dataUrl : '');
        if (imgBase64) {
          try {
            doc.addImage(imgBase64, 'JPEG', boxX + 4, boxY + 12, boxW - 8, boxH - 16, undefined, 'FAST');
          } catch (e) {
            console.warn('QSC photo draw error:', e);
            doc.setTextColor(148, 163, 184);
            doc.setFontSize(9);
            doc.text('[Foto QSC Section 1 tersimpan di Google Drive]', boxX + 20, boxY + 50);
          }
        } else {
          doc.setTextColor(148, 163, 184);
          doc.setFontSize(9);
          doc.text('[Foto Lembar QSC Section 1 tersimpan di Google Drive]', boxX + 20, boxY + 50);
        }
      });

      // Footer
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(8);
      doc.text(`PT FamilyMart Indonesia • FMCU Regional Bestie Visit Report • ${dateFormatted}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
    }

    return doc;
  },

  async downloadVerticalQscPdf(report) {
    if (!report) return;
    if ((!report.qscPhotos || report.qscPhotos.length === 0) && window.FMCUApp?.formQscPhotos?.length > 0) {
      report.qscPhotos = JSON.parse(JSON.stringify(window.FMCUApp.formQscPhotos));
    }
    await this.hydrateReportPhotosFromGDrive(report);
    const doc = this.generateVerticalQscCollagePdf(report);
    if (!doc) return;
    const cleanStore = String(report.storeName || 'STORE').replace(/[/\\:*?"<>|]/g, ' ').trim();
    const dateFormatted = this.formatDateDdMmYyyy(report.visitDate);
    doc.save(`Kolase Lembar QSC-${cleanStore}-${dateFormatted}.pdf`);
  },

  async getVerticalQscPdfBase64(report) {
    if (!report) return '';
    // Sinkronkan lembar QSC Section 1 dari form jika belum ada di objek report
    if ((!report.qscPhotos || report.qscPhotos.length === 0) && window.FMCUApp?.formQscPhotos?.length > 0) {
      report.qscPhotos = JSON.parse(JSON.stringify(window.FMCUApp.formQscPhotos));
    }
    await this.hydrateReportPhotosFromGDrive(report);
    const doc = this.generateVerticalQscCollagePdf(report);
    if (!doc) return '';
    const dataUri = doc.output('datauristring');
    return dataUri.split(',')[1] || '';
  },

  // Generate CA Store Assignment Workbook (.xlsx) matching CA_Store_Assignment.xlsx with locked columns A-E
  generateCaStoreAssignmentWorkbook(report) {
    if (typeof XLSX === 'undefined') return null;

    const cleanStore = String(report.storeName || 'STORE').replace(/[/\\:*?"<>|]/g, ' ').trim();
    const storeCode = String(report.storeCode || '').trim();
    const visitorName = String(report.auditorName || 'Visitor').trim();
    const visitDate = report.visitDateFormatted || this.formatDateDdMmYyyy(report.visitDate);
    const picStore = String(report.storeHead || 'PIC Store').trim();

    const wb = XLSX.utils.book_new();

    // Build raw cell matrix
    const data = [
      ['FORM DIISI OLEH TIM OPERASIONAL TOKO', '', '', '', '', ''], // Row 1 (index 0)
      ['', '', '', '', '', ''], // Row 2
      ['Kode Toko', '', '', storeCode, '', ''], // Row 3
      ['Nama Store', '', '', cleanStore, '', ''], // Row 4
      ['Nama Visitor', '', '', visitorName, '', ''], // Row 5
      ['Tanggal Visit', '', '', visitDate, '', ''], // Row 6
      ['PIC Store', '', '', picStore, '', ''], // Row 7
      ['', '', '', '', '', ''], // Row 8
      ['NO', 'DAFTAR TEMUAN\n(berdasarkan list pada visit report)', '', '', 'TANGGAL PERBAIKAN', 'BUKTI PERBAIKAN\n(isi dengan foto perbaikan)'] // Row 9
    ];

    let observations = [];
    if (Array.isArray(report.opiObservations) && report.opiObservations.length > 0) {
      observations = observations.concat(report.opiObservations.filter((o) => o && (o.temuan || o.deskripsi)));
    }
    const qscObs = report.qscObservations || report.observations || [];
    if (Array.isArray(qscObs) && qscObs.length > 0) {
      observations = observations.concat(qscObs.filter((o) => o && (o.temuan || o.deskripsi)));
    }
    if (observations.length === 0 && Array.isArray(report.observations)) {
      observations = report.observations;
    }
    const totalDataRows = Math.max(observations.length, 5);

    for (let i = 0; i < totalDataRows; i++) {
      let findingText = '';
      if (i < observations.length) {
        const obs = observations[i];
        findingText = obs.temuan || obs.deskripsi || '';
        if (obs.tindakanPerbaikan) {
          findingText += ' \n(Action: ' + obs.tindakanPerbaikan + ')';
        }
      }
      data.push([i + 1, findingText, '', '', '', '']);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Apply exact Merges from CA_Store_Assignment.xlsx
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // A1:F1
      { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } }, // A3:C3
      { s: { r: 2, c: 3 }, e: { r: 2, c: 4 } }, // D3:E3
      { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } }, // A4:C4
      { s: { r: 3, c: 3 }, e: { r: 3, c: 4 } }, // D4:E4
      { s: { r: 4, c: 0 }, e: { r: 4, c: 2 } }, // A5:C5
      { s: { r: 4, c: 3 }, e: { r: 4, c: 4 } }, // D5:E5
      { s: { r: 5, c: 0 }, e: { r: 5, c: 2 } }, // A6:C6
      { s: { r: 5, c: 3 }, e: { r: 5, c: 4 } }, // D6:E6
      { s: { r: 6, c: 0 }, e: { r: 6, c: 2 } }, // A7:C7
      { s: { r: 6, c: 3 }, e: { r: 6, c: 4 } }, // D7:E7
      { s: { r: 8, c: 1 }, e: { r: 8, c: 3 } }  // B9:D9
    ];

    for (let i = 0; i < totalDataRows; i++) {
      const rowIdx = 9 + i;
      ws['!merges'].push({ s: { r: rowIdx, c: 1 }, e: { r: rowIdx, c: 3 } }); // B:D
    }

    // Set Column Widths (matching CA_Store_Assignment.xlsx)
    ws['!cols'] = [
      { wch: 6 },   // A: NO
      { wch: 5 },   // B: DAFTAR TEMUAN (part 1)
      { wch: 14 },  // C: (part 2)
      { wch: 24 },  // D: (part 3)
      { wch: 22 },  // E: TANGGAL PERBAIKAN
      { wch: 65 }   // F: BUKTI PERBAIKAN
    ];

    // Sheet Protection: Lock columns A-E, keep Column F & E for input
    ws['!protect'] = {
      password: 'fmcu',
      sheet: true,
      selectLockedCells: true,
      selectUnlockedCells: true
    };

    XLSX.utils.book_append_sheet(wb, ws, 'ISI LANGSUNG PADA SPREADSHEET');
    return wb;
  },

  downloadCaStoreAssignmentExcel(report) {
    if (typeof XLSX === 'undefined') {
      alert('Library XLSX belum selesai dimuat.');
      return;
    }
    const wb = this.generateCaStoreAssignmentWorkbook(report);
    if (!wb) return;
    const cleanStore = String(report.storeName || 'STORE').replace(/[/\\:*?"<>|]/g, ' ').trim();
    const dateFormatted = this.formatDateDdMmYyyy(report.visitDate);
    XLSX.writeFile(wb, `CA_Store_Assignment_${cleanStore}_${dateFormatted}.xlsx`);
  },

  // Download PDF Directly (Menarik foto dari Google Drive terlebih dahulu jika dibuka dari perangkat lain)
  async downloadReportPdf(report) {
    await this.hydrateReportPhotosFromGDrive(report);
    const doc = this.generatePdfDoc(report);
    doc.save(this.getFileName(report));
  },

  // Get Base64 String of PDF (for Google Apps Script GDrive Upload & Email Attachment)
  async getPdfBase64(report) {
    await this.hydrateReportPhotosFromGDrive(report);
    const doc = this.generatePdfDoc(report);
    const dataUri = doc.output('datauristring');
    return dataUri.split(',')[1] || '';
  },

  // Build Visual 16:9 HTML Slides for Interactive Preview Page
  buildHtmlSlides(report) {
    const settings = window.FMCUData ? window.FMCUData.getSettings() : {};
    const PA = window.PDF_ASSETS || {};
    const reportTitle = report.reportTitle || settings.reportTitle || 'FMCU Visit Store Report';
    const footerText = settings.footerText || 'GENERATED BY FMCU VISIT WEB REPORT';
    const caLink = report.caLink || settings.caLink || 'https://tinyurl.com/store-caassignment';
    const visitDateText = report.visitDateFormatted || this.formatIndonesianDate(report.visitDate, false);
    const dayDateText = report.visitDayDateFormatted || this.formatIndonesianDate(report.visitDate, true);

    const slides = [];

    // 1. Cover Slide
    slides.push({
      title: 'Cover - FMCU Visit Store Report',
      html: `
        <div class="w-full h-full bg-white flex flex-col justify-between relative overflow-hidden">
          <div class="w-full h-[57%] overflow-hidden bg-slate-100">
            <img src="${PA.bannerStorefront || PA.bannerFamilyMart || ''}" class="w-full h-full object-cover object-top" alt="FamilyMart Banner" />
          </div>
          <div class="w-full h-[43%] px-[3.8%] pt-[1.8%] pb-[3%] flex flex-col justify-between bg-white">
            <h1 class="text-[#0099A6] font-extrabold text-[clamp(11px,2.7cqw,32px)] tracking-tight">${reportTitle}</h1>
            <div class="grid grid-cols-12 gap-4 items-center my-auto">
              <div class="col-span-6 space-y-[0.8cqw] text-[clamp(7.5px,1.15cqw,15px)]">
                <div class="grid grid-cols-12">
                  <span class="col-span-4 text-slate-600">Nama</span>
                  <span class="col-span-1 text-slate-600">:</span>
                  <span class="col-span-7 font-bold text-slate-900">${report.auditorName || '-'}</span>
                </div>
                <div class="grid grid-cols-12">
                  <span class="col-span-4 text-slate-600">Store</span>
                  <span class="col-span-1 text-slate-600">:</span>
                  <span class="col-span-7 font-bold text-slate-900">${report.storeName || '-'}</span>
                </div>
                <div class="grid grid-cols-12">
                  <span class="col-span-4 text-slate-600">Store Head</span>
                  <span class="col-span-1 text-slate-600">:</span>
                  <span class="col-span-7 font-bold text-slate-900">${report.storeHead || '-'}</span>
                </div>
              </div>
              <div class="col-span-6 bg-[#F7FAFC] border border-slate-200 rounded-xl p-[1.2cqw] grid grid-cols-2 gap-y-[0.6cqw] gap-x-3 text-[clamp(6px,0.85cqw,12px)]">
                <div>
                  <div class="text-slate-500 font-bold uppercase text-[0.72cqw]">TANGGAL VISIT</div>
                  <div class="text-slate-900 font-semibold mt-0.5">${visitDateText}</div>
                </div>
                <div>
                  <div class="text-slate-500 font-bold uppercase text-[0.72cqw]">KODE TOKO</div>
                  <div class="text-slate-900 font-semibold mt-0.5">${report.storeCode || '-'}</div>
                </div>
                <div>
                  <div class="text-slate-500 font-bold uppercase text-[0.72cqw]">TIPE TOKO</div>
                  <div class="text-slate-900 font-semibold mt-0.5">${report.storeType || 'CVS'}</div>
                </div>
                <div>
                  <div class="text-slate-500 font-bold uppercase text-[0.72cqw]">AREA MANAGER</div>
                  <div class="text-slate-900 font-semibold mt-0.5">${report.areaManager || '-'}</div>
                </div>
                <div class="col-span-2">
                  <div class="text-slate-500 font-bold uppercase text-[0.72cqw]">REGIONAL MANAGER</div>
                  <div class="text-slate-900 font-semibold mt-0.5">${report.regionalManager || '-'}</div>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      `
    });

    // 2. QSC / Famitrack Result
    const qscPhotos = (report.qscPhotos && report.qscPhotos.length > 0)
      ? report.qscPhotos
      : [{ caption: 'Foto QSC / Famitrack 1', dataUrl: '' }, { caption: 'Foto QSC / Famitrack 2', dataUrl: '' }];

    for (let i = 0; i < qscPhotos.length; i += 2) {
      const pair = qscPhotos.slice(i, i + 2);
      slides.push({
        title: `QSC / Famitrack Result (${i + 1}-${Math.min(i + 2, qscPhotos.length)})`,
        html: `
          <div class="w-full h-full bg-white px-[3.2%] py-[2.8%] flex flex-col justify-between">
            <div>
              <h2 class="text-[#0099A6] font-extrabold text-[clamp(10px,2.2cqw,26px)]">QSC/ Famitrack Result</h2>
              <div class="w-full h-[2px] bg-[#0099A6] mt-[1cqw]"></div>
            </div>
            <div class="grid grid-cols-2 gap-[3cqw] my-auto h-[68%]">
              ${pair.map((p, idx) => {
                const src = this.getPhotoDisplaySrc(p);
                return `
                <div class="border border-slate-300 rounded-xl p-[1cqw] flex flex-col justify-between bg-white h-full overflow-hidden">
                  <div class="w-full h-[88%] bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center">
                    ${src
                      ? `<img src="${src}" class="w-full h-full object-cover" alt="QSC" />`
                      : `<span class="text-slate-400 text-xs">Tidak ada foto</span>`}
                  </div>
                  <div class="text-[clamp(6.5px,0.85cqw,11px)] text-slate-800 pt-1">${p.caption || `Foto QSC / Famitrack ${i + idx + 1}`}</div>
                </div>
              `;
              }).join('')}
            </div>
            
          </div>
        `
      });
    }

    // 3. General Information
    const crewRows = report.crewList || [];
    slides.push({
      title: 'General Information (Crew Store)',
      html: `
        <div class="w-full h-full bg-white px-[3.2%] py-[3%] flex flex-col justify-between">
          <div>
            <h2 class="text-slate-800 font-extrabold text-[clamp(10px,1.9cqw,24px)]">General Information</h2>
            <div class="mt-[1.4cqw] text-[clamp(7.5px,1.15cqw,15px)] text-slate-700">
              <span>Hari, Tanggal</span>
              <span class="mx-4">:</span>
              <strong class="text-slate-900">${dayDateText}</strong>
            </div>
            <div class="mt-[1.8cqw] overflow-hidden border border-slate-300">
              <table class="w-full border-collapse text-[clamp(6.5px,1.05cqw,13px)]">
                <thead>
                  <tr class="bg-[#0099A6] text-white font-bold">
                    <th class="border border-slate-300 py-[0.8cqw] px-3 w-[20%] text-center">Role</th>
                    <th class="border border-slate-300 py-[0.8cqw] px-3 w-[63%] text-center">Nama</th>
                    <th class="border border-slate-300 py-[0.8cqw] px-3 w-[17%] text-center">Job Level</th>
                  </tr>
                </thead>
                <tbody>
                  ${crewRows.map((c, idx) => `
                    <tr class="${idx % 2 === 0 ? 'bg-slate-50/80' : 'bg-white'}">
                      <td class="border border-slate-300 py-[0.7cqw] px-3 font-bold text-slate-800">${c.role || '-'}</td>
                      <td class="border border-slate-300 py-[0.7cqw] px-3 text-slate-800">${c.name || '-'}</td>
                      <td class="border border-slate-300 py-[0.7cqw] px-3 text-center text-slate-800">${c.jobLevel || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      `
    });

    // Helper for HTML Observation Slide
    const buildObsSlideHtml = (titleText, pair, startIdx, totalCount) => `
      <div class="w-full h-full bg-white flex flex-col justify-between">
        <div class="bg-[#0099A6] text-white px-[3.5%] py-[0.8cqw] font-bold text-[clamp(8px,1.2cqw,15px)]">
          ${titleText}
        </div>
        <div class="px-[2.6%] pt-[0.5cqw] pb-[0.5cqw] flex-1 flex flex-col justify-start gap-[1.1cqw]">
          <div class="text-[clamp(6px,0.85cqw,11px)] text-slate-500">Ringkasan observasi - beberapa temuan per halaman</div>
          ${pair.map((obs, idx) => {
            const dl = obs.deadlineFormatted || this.formatIndonesianDate(obs.deadline, false);
            return `
              <div class="border border-slate-400 rounded-lg overflow-hidden bg-white shadow-sm">
                <div class="bg-[#0099A6] text-white px-3 py-[0.35cqw] flex items-center justify-between">
                  <span class="font-bold text-[clamp(6.5px,0.95cqw,12px)]">Temuan ${startIdx + idx + 1}/${totalCount}</span>
                  <span class="bg-white text-red-700 font-bold text-[clamp(5.5px,0.72cqw,9px)] px-2 py-0.5 rounded-full">
                    Deadline Perbaikan: ${dl}
                  </span>
                </div>
                <div class="p-[0.6cqw] grid grid-cols-2 gap-[0.55cqw] text-[clamp(5.5px,0.78cqw,10px)] leading-tight">
                  <div class="bg-[#FEFCE8] border border-slate-300 rounded p-[0.5cqw]">
                    <div class="font-bold text-amber-700">Temuan</div>
                    <div class="font-bold text-slate-900 mt-0.5 whitespace-pre-line">${obs.temuan || '-'}</div>
                  </div>
                  <div class="bg-white border border-slate-300 rounded p-[0.5cqw]">
                    <div class="font-bold text-[#008291]">Dampak</div>
                    <div class="text-slate-800 mt-0.5 whitespace-pre-line">${obs.dampak || '-'}</div>
                  </div>
                  <div class="bg-white border border-slate-300 rounded p-[0.5cqw]">
                    <div class="font-bold text-[#008291]">Kondisi Ideal</div>
                    <div class="text-slate-800 mt-0.5 whitespace-pre-line">${obs.kondisiIdeal || '-'}</div>
                  </div>
                  <div class="bg-white border border-slate-300 rounded p-[0.5cqw]">
                    <div class="font-bold text-[#008291]">Tindakan Perbaikan</div>
                    <div class="text-slate-800 mt-0.5 whitespace-pre-line">${obs.tindakanPerbaikan || '-'}</div>
                  </div>
                  <div class="bg-white border border-slate-300 rounded p-[0.5cqw]">
                    <div class="font-bold text-[#008291]">Penyebab</div>
                    <div class="text-slate-800 mt-0.5 whitespace-pre-line">${obs.penyebab || '-'}</div>
                  </div>
                  <div class="bg-white border border-slate-300 rounded p-[0.5cqw]">
                    <div class="font-bold text-[#008291]">Hasil</div>
                    <div class="text-slate-800 mt-0.5 whitespace-pre-line">${obs.hasil || '-'}</div>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
      </div>
    `;

    // Helper for HTML Photo Grid Slide
    const buildPhotoGridSlideHtml = (titleText, chunk) => `
      <div class="w-full h-full bg-white flex flex-col justify-between">
        <div class="bg-[#0099A6] text-white px-[3.5%] py-[1cqw] font-bold text-[clamp(10px,1.2cqw,16px)]">
          ${titleText}
        </div>
        <div class="px-[3%] py-[1.2cqw] flex-1 grid grid-cols-3 grid-rows-2 gap-[1.2cqw]">
          ${chunk.map((ev) => {
            const src = this.getPhotoDisplaySrc(ev);
            return `
            <div class="border border-slate-400 rounded-xl p-[0.7cqw] grid grid-cols-12 gap-[0.8cqw] bg-white overflow-hidden">
              <div class="col-span-6 bg-slate-100 rounded-lg overflow-hidden h-full">
                ${src ? `<img src="${src}" class="w-full h-full object-cover" alt="Evidence" />` : ''}
              </div>
              <div class="col-span-6 text-[clamp(6px,0.82cqw,11px)] text-slate-900 pt-1 leading-snug overflow-hidden">
                ${ev.description || '-'}
              </div>
            </div>
          `;
          }).join('')}
        </div>
        
      </div>
    `;

    // 4. OPI Project Observation Slides (CONDET 2 Standard)
    const opiEnabled = report.enableOpi !== false;
    const opiList = (opiEnabled && report.opiObservations && report.opiObservations.length > 0)
      ? report.opiObservations.filter((o) => o && o.temuan && o.temuan.trim() !== '')
      : [];

    if (opiEnabled && opiList.length > 0) {
      slides.push({
        title: 'Divider - OPI Project Observation',
        html: `
          <div class="w-full h-full bg-white relative overflow-hidden">
            <img src="${PA.dividerOpiProjectObservation || ''}" class="w-full h-full object-cover" alt="OPI Project Observation" />
            
          </div>
        `
      });

      for (let i = 0; i < opiList.length; i += 2) {
        const pair = opiList.slice(i, i + 2);
        slides.push({
          title: `OPI Project Obs (Temuan ${i + 1}-${Math.min(i + 2, opiList.length)})`,
          html: buildObsSlideHtml('OPI Project Observation', pair, i, opiList.length)
        });
      }
    }

    // 5. QSC Observation (Divider & Content ONLY if enabled and has findings)
    const qscEnabled = report.enableQsc !== false;
    const rawQscList = (report.qscObservations && report.qscObservations.length > 0)
      ? report.qscObservations
      : (report.observations && report.observations.length > 0 ? report.observations : []);
    const qscList = qscEnabled ? rawQscList.filter((o) => o && o.temuan && o.temuan.trim() !== '') : [];

    if (qscEnabled && qscList.length > 0) {
      slides.push({
        title: 'Divider - QSC Observation',
        html: `
          <div class="w-full h-full bg-white relative overflow-hidden">
            <img src="${PA.dividerQscObservation || ''}" class="w-full h-full object-cover" alt="QSC Observation" />
            
          </div>
        `
      });

      for (let i = 0; i < qscList.length; i += 2) {
        const pair = qscList.slice(i, i + 2);
        slides.push({
          title: `QSC Observation (Temuan ${i + 1}-${Math.min(i + 2, qscList.length)})`,
          html: buildObsSlideHtml('QSC Observation', pair, i, qscList.length)
        });
      }
    }

    // 6. Finding Evidence (Divider & Content ONLY if enabled and has photos)
    const evEnabled = report.enableEvidence !== false;
    const evList = (evEnabled && report.evidencePhotos && report.evidencePhotos.length > 0)
      ? report.evidencePhotos
      : [];

    if (evEnabled && evList.length > 0) {
      slides.push({
        title: 'Divider - Finding Evidence',
        html: `
          <div class="w-full h-full bg-white relative overflow-hidden">
            <img src="${PA.dividerFindingEvidence || ''}" class="w-full h-full object-cover" alt="Finding Evidence" />
            
          </div>
        `
      });

      for (let i = 0; i < evList.length; i += 6) {
        const chunk = evList.slice(i, i + 6);
        slides.push({
          title: `Finding Evidence Photos (${i + 1}-${Math.min(i + 6, evList.length)})`,
          html: buildPhotoGridSlideHtml('Finding Evidence - Evidence Photos', chunk)
        });
      }
    }

    // 7. Corrective Action Evidence & Result (Divider & Content ONLY if enabled and has photos)
    const caEnabled = report.enableCa !== false;
    const rawCaList = (report.caPhotos && report.caPhotos.length > 0)
      ? report.caPhotos
      : (report.correctiveActionPhotos && report.correctiveActionPhotos.length > 0 ? report.correctiveActionPhotos : []);
    const caList = caEnabled ? rawCaList : [];

    if (caEnabled && caList.length > 0) {
      slides.push({
        title: 'Divider - Corrective Action Evidence & Result',
        html: `
          <div class="w-full h-full bg-white relative overflow-hidden">
            <img src="${PA.dividerCorrectiveAction || ''}" class="w-full h-full object-cover" alt="Corrective Action Evidence & Result" />
            
          </div>
        `
      });

      for (let i = 0; i < caList.length; i += 6) {
        const chunk = caList.slice(i, i + 6);
        slides.push({
          title: `CA Evidence & Result (${i + 1}-${Math.min(i + 6, caList.length)})`,
          html: buildPhotoGridSlideHtml('Corrective Action Evidence & Result - Evidence Photos', chunk)
        });
      }
    }

    // 10. Divider: Store Assignment
    slides.push({
      title: 'Divider - Store Assignment',
      html: `
        <div class="w-full h-full bg-white relative overflow-hidden">
          <img src="${PA.dividerStoreAssignment || ''}" class="w-full h-full object-cover" alt="Store Assignment" />
          
        </div>
      `
    });

    // 11. Mekanisme Pelaporan
    slides.push({
      title: 'Mekanisme Pelaporan',
      html: `
        <div class="w-full h-full bg-white px-[3.2%] py-[4.5%] flex flex-col justify-between">
          <div class="space-y-[1.8cqw]">
            <h2 class="text-slate-900 font-extrabold text-[clamp(10px,1.8cqw,24px)]">Mekanisme pelaporan</h2>
            <div>
              <a href="${caLink}" target="_blank" class="text-[#0099A6] font-extrabold text-[clamp(8.5px,1.4cqw,18px)] hover:underline">${caLink}</a>
            </div>
            <ol class="space-y-[1.2cqw] text-[clamp(7.5px,1.15cqw,15px)] text-slate-800 pt-2">
              <li>1. Unduh file pada link di atas.</li>
              <li>2. Tim store mengisi form tersebut berdasarkan temuan yang telah ditunjukkan pada file laporan ini.</li>
              <li>3. Tindakan perbaikan WAJIB dilakukan sebelum deadline yang diberikan oleh FMCU / Regional Bestie.</li>
              <li>4. Form tindakan perbaikan yang telah dibuat WAJIB dikirimkan kembali via email dengan terusan: Regional Manager, Area Manager, Regional Bestie, dan FMCU.</li>
            </ol>
          </div>
          
        </div>
      `
    });

    return slides;
  }
};
