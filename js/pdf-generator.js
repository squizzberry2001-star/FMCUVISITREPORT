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

  // Helper to draw watermark in bottom-right corner of every PDF page
  drawPageFooter(doc, footerText) {
    if (!doc) return;
    const PA = window.PDF_ASSETS || {};
    const watermarkSrc = PA.watermark || PA.WTRMRK;

    if (watermarkSrc) {
      try {
        const pageWidth = typeof doc.internal?.pageSize?.getWidth === 'function' ? doc.internal.pageSize.getWidth() : 320;
        const pageHeight = typeof doc.internal?.pageSize?.getHeight === 'function' ? doc.internal.pageSize.getHeight() : 180;

        // Dimensi Watermark WTRMRK dibuat mini / kecil dan proporsional (lebar 14mm untuk landscape 320mm, rasio aspek 1.767)
        const isPortrait = pageHeight > pageWidth;
        const wtrW = isPortrait ? 10 : 14;
        const wtrH = wtrW / 1.767;
        const wtrX = pageWidth - wtrW - 4; // Pojok kanan bawah
        const wtrY = pageHeight - wtrH - 3; // Margin bawah

        // Render semi-transparan halus (opacity 0.60)
        const hasGState = typeof doc.GState === 'function';
        if (hasGState) {
          doc.saveGraphicsState();
          doc.setGState(new doc.GState({ opacity: 0.60 }));
        }

        doc.addImage(watermarkSrc, 'PNG', wtrX, wtrY, wtrW, wtrH, undefined, 'FAST');

        if (hasGState) {
          doc.restoreGraphicsState();
        }
      } catch (errWtr) {
        console.warn('Gagal membubuhkan watermark WTRMRK pada PDF:', errWtr);
      }
    }
  },

  // Helper to render high-DPI elegant minimalist corporate divider slide with vector typography
  drawCorporateDividerSlide(doc, bgImage, sectionTag, title, subtitle, footerText) {
    if (!doc) return;
    doc.addPage([320, 180], 'landscape');
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 320, 180, 'F');

    // 1. Gambar latar belakang divider (ilustrasi di sebelah kanan)
    if (bgImage) {
      try {
        doc.addImage(bgImage, 'JPEG', 0, 0, 320, 180, undefined, 'FAST');
      } catch (e) {
        console.warn('Divider background image error:', e);
      }
    }

    // 2. Masking area teks kiri (0 s.d 146mm) dengan warna putih murni agar teks lama yang pecah/blur tertutup sempurna
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 146, 180, 'F');

    // 3. Render Tipografi Vektor Korporat Elegan & Minimalis
    const leftX = 22;

    // A. Section Pill Tag
    doc.setFillColor(240, 253, 250); // Teal-50
    doc.setDrawColor(153, 246, 228); // Teal-200
    doc.setLineWidth(0.25);
    doc.roundedRect(leftX, 48, 98, 8.5, 4.25, 4.25, 'FD');

    doc.setFillColor(0, 153, 166); // Teal dot
    doc.circle(leftX + 4.5, 52.25, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 118, 110); // Teal-700
    doc.text(sectionTag.toUpperCase(), leftX + 8.5, 54.8);

    // B. Judul Utama (Bold, Modern Corporate)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(15, 23, 42); // Slate-900
    const titleLines = doc.splitTextToSize(title, 118);
    doc.text(titleLines, leftX, 72);

    const afterTitleY = 72 + (titleLines.length - 1) * 11 + 6;

    // C. Garis Aksen FamilyMart Green
    doc.setDrawColor(0, 153, 68); // FamilyMart Green
    doc.setLineWidth(0.8);
    doc.line(leftX, afterTitleY, leftX + 46, afterTitleY);

    // D. Subtitle Deskriptif
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate-500
    const subLines = doc.splitTextToSize(subtitle, 118);
    doc.text(subLines, leftX, afterTitleY + 8);

    // E. Micro Brand Meta
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text('FAMILYMART CENTRAL UNIT • VISIT STORE REPORT', leftX, 162);

    // F. Page Footer & Watermark
    this.drawPageFooter(doc, footerText);
  },

  // Helper to draw image inside a bounding box while preserving natural aspect ratio (mencegah foto & timestamp tertarik)
  drawImageProportional(doc, imgData, boxX, boxY, boxW, boxH, format = 'JPEG', compression = 'FAST') {
    if (!doc || !imgData) return null;
    try {
      let imgW = 0;
      let imgH = 0;
      if (typeof doc.getImageProperties === 'function') {
        const props = doc.getImageProperties(imgData);
        imgW = props.width;
        imgH = props.height;
      }
      if (!imgW || !imgH) {
        imgW = boxW;
        imgH = boxH;
      }

      const imgAspect = imgW / imgH;
      const boxAspect = boxW / boxH;

      let drawW = boxW;
      let drawH = boxH;

      if (imgAspect > boxAspect) {
        // Gambar lebih lebar daripada kotak -> sesuaikan tinggi
        drawH = boxW / imgAspect;
      } else {
        // Gambar lebih tinggi (portrait) daripada kotak -> sesuaikan lebar
        drawW = boxH * imgAspect;
      }

      // Posisi di tengah-tengah kotak (centered)
      const drawX = boxX + (boxW - drawW) / 2;
      const drawY = boxY + (boxH - drawH) / 2;

      doc.addImage(imgData, format, drawX, drawY, drawW, drawH, undefined, compression);
      return { drawX, drawY, drawW, drawH };
    } catch (e) {
      console.warn('drawImageProportional error:', e);
      try {
        doc.addImage(imgData, format, boxX, boxY, boxW, boxH, undefined, compression);
      } catch (err) {}
    }
  },

  // Ambil sumber URL gambar untuk tampilan HTML & Slide Preview (mendukung cache RAM + URL Google Drive)
  getPhotoDisplaySrc(photo) {
    if (!photo) return '';
    if (photo.dataUrl && photo.dataUrl.startsWith('data:image')) {
      return photo.dataUrl;
    }
    // Slot QSC generic kosong tidak boleh mengambil foto cache
    if (photo.id && (photo.id === 'qsc-1' || photo.id === 'qsc-2')) {
      return '';
    }
    if (!photo.dataUrl && !photo.driveFileId && !photo.driveUrl) {
      return '';
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
    if (photo.id && (photo.id === 'qsc-1' || photo.id === 'qsc-2')) {
      return '';
    }
    if (!photo.dataUrl && !photo.driveFileId && !photo.driveUrl) {
      return '';
    }
    if (window.FMCUData && typeof window.FMCUData.getPhotoFromMemory === 'function') {
      const mem = window.FMCUData.getPhotoFromMemory(photo.id, photo.driveFileId);
      if (mem && mem.startsWith('data:image')) return mem;
    }
    if (window.FMCUApp) {
      const liveList = [
        ...(window.FMCUApp.formEvidencePhotos || []),
        ...(window.FMCUApp.formCaPhotos || []),
        ...(window.FMCUApp.formQscPhotos || [])
      ];
      const match = liveList.find(
        (p) => p && ((photo.id && p.id === photo.id && photo.id !== 'qsc-1' && photo.id !== 'qsc-2') || (photo.driveFileId && p.driveFileId === photo.driveFileId))
      );
      if (match && match.dataUrl && match.dataUrl.startsWith('data:image')) {
        return match.dataUrl;
      }
    }
    return '';
  },

  async urlToBase64(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return '';
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.84));
        } catch (e) {
          resolve('');
        }
      };
      img.onerror = () => resolve('');
      img.src = url;
    });
  },

  // Tarik Base64 foto dari IndexedDB, Google Drive, atau URL gambar
  async hydrateReportPhotosFromGDrive(report) {
    if (!report) return report;
    const allPhotos = [
      ...(report.qscPhotos || []),
      ...(report.evidencePhotos || []),
      ...(report.caPhotos || report.correctiveActionPhotos || [])
    ];

    // 1. Ambil dari IndexedDB lokal jika hilang dari memori RAM
    if (window.FMCUData && typeof window.FMCUData.getPhotoFromDb === 'function') {
      for (const p of allPhotos) {
        if (!p) continue;
        if (p.id === 'qsc-1' || p.id === 'qsc-2') continue;
        if (!p.dataUrl && !p.driveFileId && !p.driveUrl) continue;
        if (!this.getPhotoBase64ForPdf(p)) {
          if (p.id) {
            const b64 = await window.FMCUData.getPhotoFromDb(p.id);
            if (b64 && b64.startsWith('data:image')) {
              p.dataUrl = b64;
              window.FMCUData.cachePhotoInMemory(p.id, p.driveFileId, b64);
              continue;
            }
          }
          if (p.driveFileId) {
            const b64 = await window.FMCUData.getPhotoFromDb(p.driveFileId);
            if (b64 && b64.startsWith('data:image')) {
              p.dataUrl = b64;
              window.FMCUData.cachePhotoInMemory(p.id, p.driveFileId, b64);
            }
          }
        }
      }
    }

    // 2. Ambil dari Google Drive via Apps Script jika belum ada di perangkat ini
    if (window.FMCUData && typeof window.FMCUData.fetchDrivePhotosBase64 === 'function') {
      const driveIdsToFetch = [];
      allPhotos.forEach((p) => {
        if (p && p.driveFileId && !this.getPhotoBase64ForPdf(p)) {
          driveIdsToFetch.push(p.driveFileId);
        }
      });
      if (driveIdsToFetch.length > 0) {
        await window.FMCUData.fetchDrivePhotosBase64(driveIdsToFetch);
      }
    }

    // 3. Konversi URL HTTP/Drive langsung ke Base64 via Canvas jika masih belum tersedia
    for (const p of allPhotos) {
      if (!p) continue;
      if (!this.getPhotoBase64ForPdf(p)) {
        const httpUrl =
          (p.dataUrl && /^https?:\/\//i.test(p.dataUrl) ? p.dataUrl : '') ||
          p.driveUrl ||
          (p.driveFileId ? `https://drive.google.com/thumbnail?id=${p.driveFileId}&sz=w1200` : '');
        if (httpUrl) {
          const b64 = await this.urlToBase64(httpUrl);
          if (b64 && b64.startsWith('data:image')) {
            p.dataUrl = b64;
            if (window.FMCUData) {
              window.FMCUData.cachePhotoInMemory(p.id, p.driveFileId, b64);
            }
          }
        }
      }
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
    
    // Resolve store-specific spreadsheet link
    let resolvedCaLink = report.caSpreadsheetUrl || report.caLink || '';
    if (!resolvedCaLink && report.storeCode && window.FMCUData && typeof window.FMCUData.getStores === 'function') {
      const allStores = window.FMCUData.getStores();
      const matchedStore = allStores.find((s) => String(s.code).trim().toLowerCase() === String(report.storeCode).trim().toLowerCase());
      if (matchedStore) {
        resolvedCaLink = matchedStore.caSpreadsheetUrl || matchedStore.caLink || '';
      }
    }
    if (!resolvedCaLink) {
      resolvedCaLink = settings.caLink || 'https://tinyurl.com/store-caassignment';
    }

    const storeInfoTag = (report.storeName && report.storeCode)
      ? `KHUSUS ${report.storeName.toUpperCase()} (${report.storeCode}):`
      : 'HASIL VISIT AUDIT:';

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

    const coverBanner = PA.bannerCover || PA.bannerStorefront || PA.bannerFamilyMart;
    if (coverBanner) {
      try {
        // COVER1.jpg has dimensions 7244x2368 (aspect ratio 3.059:1)
        // 320mm / 104.6mm = 3.059:1 exact natural aspect ratio
        doc.addImage(coverBanner, 'JPEG', 0, 0, 320, 105);
      } catch (e) {
        console.warn('Cover image error:', e);
      }
    }

    // White rectangle covering bottom area (y=104 to 180) so custom title renders cleanly
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 104, 320, 76, 'F');

    // Main Report Title (Corporate Elegant Typography)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(0, 153, 166);
    doc.text(reportTitle, 12, 124);

    // Accent Line Divider
    doc.setDrawColor(0, 153, 68); // FamilyMart Green Accent
    doc.setLineWidth(0.6);
    doc.line(12, 129, 65, 129);

    // Left Metadata (Nama, Store, Store Head)
    const leftRows = [
      { label: 'Nama Visitor', value: report.auditorName || '-', y: 143, size: 11 },
      { label: 'Nama Store', value: report.storeName || '-', y: 152, size: 11 },
      { label: 'Store Head', value: report.storeHead || '-', y: 161, size: 10.5 }
    ];
    leftRows.forEach((row) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(row.size);
      doc.setTextColor(100, 116, 139); // Slate-500
      doc.text(row.label, 12, row.y);
      doc.setTextColor(148, 163, 184);
      doc.text(':', 50, row.y);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // Deep Slate-900
      doc.text(String(row.value), 56, row.y);
    });

    // Right Metadata Card (Clean Minimalist Rounded Card)
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.setLineWidth(0.25);
    doc.roundedRect(180, 133, 130, 42, 3, 3, 'FD');

    const visitDateText = report.visitDateFormatted || this.formatIndonesianDate(report.visitDate, false);
    const rightMeta = [
      { label: 'TANGGAL VISIT', value: visitDateText, x: 188, y: 140.5 },
      { label: 'KODE TOKO', value: report.storeCode || '-', x: 253, y: 140.5 },
      { label: 'TIPE TOKO', value: report.storeType || 'CVS', x: 188, y: 154 },
      { label: 'AREA MANAGER', value: report.areaManager || '-', x: 253, y: 154 },
      { label: 'REGIONAL MANAGER', value: report.regionalManager || '-', x: 188, y: 167.5 }
    ];

    rightMeta.forEach((m) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139); // Slate-500
      doc.text(m.label, m.x, m.y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(15, 23, 42); // Slate-900
      doc.text(String(m.value), m.x, m.y + 4.8);
    });

    this.drawPageFooter(doc, footerText);

    // ========================================================================
    // PAGE 2: QSC / FAMITRACK RESULT (2 photos per page)
    // ========================================================================
    const qscPhotos = (report.qscPhotos && report.qscPhotos.length > 0)
      ? report.qscPhotos
      : [
          { caption: 'Lembar Form QSC / FamiTrack #1 (Wajib)', dataUrl: '' },
          { caption: 'Lembar Form QSC / FamiTrack #2 (Wajib)', dataUrl: '' }
        ];

    for (let i = 0; i < qscPhotos.length; i += 2) {
      doc.addPage([320, 180], 'landscape');
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 320, 180, 'F');

      // Header Minimalist & Corporate
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // Slate-900
      doc.text('QSC / FamiTrack Result', 12, 22);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139); // Slate-500
      doc.text('Form penilaian standar kualitas, kebersihan & layanan operasional toko', 12, 28);

      doc.setDrawColor(0, 153, 166);
      doc.setLineWidth(0.35);
      doc.line(12, 33, 308, 33);

      const pair = qscPhotos.slice(i, i + 2);
      pair.forEach((photo, idx) => {
        const cardX = idx === 0 ? 12 : 164;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240); // Slate-200
        doc.setLineWidth(0.25);
        doc.roundedRect(cardX, 39, 144, 128, 3, 3, 'FD');

        const qscImgBase64 = this.getPhotoBase64ForPdf(photo);
        if (qscImgBase64 && qscImgBase64.startsWith('data:image')) {
          this.drawImageProportional(doc, qscImgBase64, cardX + 3, 43, 138, 112, 'JPEG', 'FAST');
        } else {
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(cardX + 3, 43, 138, 112, 2, 2, 'F');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(148, 163, 184);
          doc.text('Tidak ada foto dilampirkan (Kosong)', cardX + 72, 99, { align: 'center' });
        }

        // Caption Bar
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cardX + 3, 157, 138, 8, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(15, 23, 42);
        doc.text(photo.caption || `Lembar Form QSC / FamiTrack #${i + idx + 1}`, cardX + 6, 162.5);
      });

      this.drawPageFooter(doc, footerText);
    }

    // ========================================================================
    // PAGE 3: GENERAL INFORMATION (Store Crew Table)
    // ========================================================================
    doc.addPage([320, 180], 'landscape');
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 320, 180, 'F');

    // Title & Header Minimalist
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text('General Information (Store Crew)', 12, 23);

    const dayDateText = report.visitDayDateFormatted || this.formatIndonesianDate(report.visitDate, true);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Hari, Tanggal Visit :', 12, 33);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(dayDateText, 48, 33);

    // Accent line
    doc.setDrawColor(0, 153, 166);
    doc.setLineWidth(0.35);
    doc.line(12, 38, 308, 38);

    // Corporate Minimalist Table
    const tableX = 12;
    let tableY = 46;
    const colW1 = 60;
    const colW2 = 186;
    const colW3 = 50;
    const headerH = 11;

    // Header Background
    doc.setFillColor(15, 23, 42); // Corporate Deep Slate
    doc.roundedRect(tableX, tableY, colW1 + colW2 + colW3, headerH, 2, 2, 'F');
    doc.rect(tableX, tableY + 5, colW1 + colW2 + colW3, headerH - 5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text('ROLE / JABATAN', tableX + 6, tableY + 7.2);
    doc.text('NAMA PERSONEL', tableX + colW1 + 6, tableY + 7.2);
    doc.text('JOB LEVEL', tableX + colW1 + colW2 + colW3 / 2, tableY + 7.2, { align: 'center' });

    tableY += headerH;
    const crewRows = (report.crewList && report.crewList.length > 0)
      ? report.crewList
      : [
          { role: 'Store Head', name: report.storeHead || '-', jobLevel: 'NS1' },
          { role: 'Shift Leader', name: '-', jobLevel: 'NS1' },
          { role: 'Crew Store 1', name: '-', jobLevel: 'MG1' },
          { role: 'Crew Store 2', name: '-', jobLevel: 'MG1' }
        ];

    const rowH = 11.5;
    crewRows.forEach((crew, idx) => {
      doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
      doc.rect(tableX, tableY, colW1 + colW2 + colW3, rowH, 'F');

      // Hairline bottom border
      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.setLineWidth(0.2);
      doc.line(tableX, tableY + rowH, tableX + colW1 + colW2 + colW3, tableY + rowH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(String(crew.role || '-'), tableX + 6, tableY + 7.2);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(String(crew.name || '-'), tableX + colW1 + 6, tableY + 7.2);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 153, 166);
      doc.text(String(crew.jobLevel || '-'), tableX + colW1 + colW2 + colW3 / 2, tableY + 7.2, { align: 'center' });

      tableY += rowH;
    });

    this.drawPageFooter(doc, footerText);

    // Helper: Draw observation findings pages (2 findings per page - Corporate Minimalist Layout)
    const drawObservationPages = (obsList, sectionTitle) => {
      const totalObs = obsList.length;
      for (let i = 0; i < totalObs; i += 2) {
        doc.addPage([320, 180], 'landscape');
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, 320, 180, 'F');

        // Top Corporate Header Bar (Deep Emerald / Cyan Tone)
        doc.setFillColor(0, 153, 166);
        doc.rect(0, 0, 320, 15, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(255, 255, 255);
        doc.text(sectionTitle, 12, 10.2);

        // Subtitle
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(100, 116, 139); // Slate-500
        doc.text('Ringkasan observasi dan rencana tindak lanjut perbaikan toko', 12, 21.5);

        const pair = obsList.slice(i, i + 2);
        pair.forEach((obs, idx) => {
          const cardY = idx === 0 ? 25 : 99;
          const cardH = 70;
          const cardX = 10;
          const cardW = 300;

          // Outer Card with Subtle Hairline Border
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(226, 232, 240); // Slate-200
          doc.setLineWidth(0.25);
          doc.roundedRect(cardX, cardY, cardW, cardH, 3, 3, 'FD');

          // Card Header Strip
          doc.setFillColor(248, 250, 252); // Slate-50
          doc.roundedRect(cardX, cardY, cardW, 8.5, 3, 3, 'F');
          doc.rect(cardX, cardY + 4, cardW, 4.5, 'F');

          // Finding Pill Badge
          doc.setFillColor(0, 153, 166);
          doc.roundedRect(cardX + 3, cardY + 1.5, 30, 5.5, 1.5, 1.5, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(255, 255, 255);
          doc.text(`Temuan ${i + idx + 1}/${totalObs}`, cardX + 18, cardY + 5.2, { align: 'center' });

          // Deadline Pill Badge on Right
          const dlText = obs.deadlineFormatted || this.formatIndonesianDate(obs.deadline, false);
          doc.setFillColor(254, 242, 242); // Red-50
          doc.setDrawColor(254, 202, 202); // Red-200
          doc.setLineWidth(0.2);
          doc.roundedRect(cardX + cardW - 65, cardY + 1.4, 62, 5.8, 2.9, 2.9, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(185, 28, 28); // Red-700
          doc.text(`Deadline: ${dlText}`, cardX + cardW - 34, cardY + 5.3, { align: 'center' });

          // 2x3 Grid of Sub-boxes inside Card
          const leftColX = cardX + 3;
          const rightColX = cardX + 151;
          const boxW = 146;

          const row1Y = cardY + 10.5;
          const row1H = 20.5;
          const row2Y = cardY + 32.5;
          const row2H = 17;
          const row3Y = cardY + 51;
          const row3H = 16;

          // Left Row 1: Temuan (Soft Amber Highlight Box)
          doc.setFillColor(254, 243, 199); // Amber-100
          doc.setDrawColor(253, 230, 138); // Amber-200
          doc.setLineWidth(0.2);
          doc.roundedRect(leftColX, row1Y, boxW, row1H, 1.5, 1.5, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(146, 64, 14); // Amber-800
          doc.text('TEMUAN AUDIT', leftColX + 3, row1Y + 4.2);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.2);
          doc.setTextColor(15, 23, 42); // Slate-900
          const temuanLines = doc.splitTextToSize(String(obs.temuan || '-'), boxW - 6);
          doc.text(temuanLines.slice(0, 3), leftColX + 3, row1Y + 8.8);

          // Right Row 1: Dampak
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(rightColX, row1Y, boxW, row1H, 1.5, 1.5, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(0, 153, 166);
          doc.text('DAMPAK OPERASIONAL', rightColX + 3, row1Y + 4.2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          doc.setTextColor(51, 65, 85);
          const dampakLines = doc.splitTextToSize(String(obs.dampak || '-'), boxW - 6);
          doc.text(dampakLines.slice(0, 4), rightColX + 3, row1Y + 8.5);

          // Left Row 2: Kondisi Ideal
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(leftColX, row2Y, boxW, row2H, 1.5, 1.5, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(0, 153, 166);
          doc.text('KONDISI IDEAL / STANDAR', leftColX + 3, row2Y + 4.2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          doc.setTextColor(51, 65, 85);
          const idealLines = doc.splitTextToSize(String(obs.kondisiIdeal || '-'), boxW - 6);
          doc.text(idealLines.slice(0, 3), leftColX + 3, row2Y + 8.5);

          // Right Row 2: Tindakan Perbaikan (Soft Emerald Box)
          doc.setFillColor(236, 253, 245); // Emerald-50
          doc.setDrawColor(167, 243, 208); // Emerald-200
          doc.roundedRect(rightColX, row2Y, boxW, row2H, 1.5, 1.5, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(4, 120, 87); // Emerald-700
          doc.text('TINDAKAN PERBAIKAN (ACTION PLAN)', rightColX + 3, row2Y + 4.2);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.8);
          doc.setTextColor(6, 78, 59); // Emerald-900
          const tindakanLines = doc.splitTextToSize(String(obs.tindakanPerbaikan || '-'), boxW - 6);
          doc.text(tindakanLines.slice(0, 3), rightColX + 3, row2Y + 8.5);

          // Left Row 3: Penyebab
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(leftColX, row3Y, boxW, row3H, 1.5, 1.5, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(0, 153, 166);
          doc.text('PENYEBAB (ROOT CAUSE)', leftColX + 3, row3Y + 4.2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          doc.setTextColor(51, 65, 85);
          const penyebabLines = doc.splitTextToSize(String(obs.penyebab || '-'), boxW - 6);
          doc.text(penyebabLines.slice(0, 3), leftColX + 3, row3Y + 8.5);

          // Right Row 3: Hasil
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(rightColX, row3Y, boxW, row3H, 1.5, 1.5, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(0, 153, 166);
          doc.text('HASIL YANG DIHARAPKAN', rightColX + 3, row3Y + 4.2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          doc.setTextColor(51, 65, 85);
          const hasilLines = doc.splitTextToSize(String(obs.hasil || '-'), boxW - 6);
          doc.text(hasilLines.slice(0, 3), rightColX + 3, row3Y + 8.5);
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
          } else {
            // Placeholder rapi jika binary Base64 belum selesai diunduh dari GDrive
            doc.setFillColor(241, 245, 249);
            doc.roundedRect(imgX, imgY, imgW, imgH, 2, 2, 'F');
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text('Foto Tersimpan', imgX + imgW / 2, imgY + imgH / 2 - 2, { align: 'center' });
            doc.text('(Offline / GDrive)', imgX + imgW / 2, imgY + imgH / 2 + 3, { align: 'center' });
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
      this.drawCorporateDividerSlide(
        doc,
        PA.dividerOpiProjectObservation,
        'SECTION 01 • OPERATIONAL IMPROVEMENT',
        'OPI Project Observation',
        'Operational Performance Initiative, Focus Area & Execution Progress',
        footerText
      );
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
      this.drawCorporateDividerSlide(
        doc,
        PA.dividerQscObservation,
        'SECTION 02 • QUALITY & SERVICE AUDIT',
        'QSC Observation',
        'Quality, Service & Cleanliness Detailed Inspection & Findings',
        footerText
      );
      drawObservationPages(qscObservations, 'QSC Observation');
    }

    // ========================================================================
    // SECTION C: FINDING EVIDENCE PHOTOS
    // ========================================================================
    const evEnabled = report.enableEvidence !== false;
    let rawEvPhotos = (report.evidencePhotos && report.evidencePhotos.length > 0)
      ? report.evidencePhotos
      : [];
    if ((!rawEvPhotos || rawEvPhotos.length === 0) && window.FMCUApp && Array.isArray(window.FMCUApp.formEvidencePhotos) && window.FMCUApp.formEvidencePhotos.length > 0) {
      rawEvPhotos = window.FMCUApp.formEvidencePhotos;
    }
    const evPhotos = evEnabled
      ? rawEvPhotos.filter((p) => p && (p.dataUrl || p.driveFileId || (p.description && p.description.trim()) || (p.id && (window.FMCUData?.getPhotoFromMemory?.(p.id) || ''))))
      : [];

    if (evEnabled && evPhotos.length > 0) {
      this.drawCorporateDividerSlide(
        doc,
        PA.dividerFindingEvidence,
        'SECTION 03 • DOCUMENTATION & EVIDENCE',
        'Finding Evidence',
        'Visual Photographic Evidence of Audit Findings & Non-Compliance Items',
        footerText
      );
      drawEvidencePhotoPages(evPhotos, 'Finding Evidence - Evidence Photos');
    }

    // ========================================================================
    // SECTION D: CORRECTIVE ACTION EVIDENCE & RESULT (CONDET 2 STANDARD)
    // ========================================================================
    const caEnabled = report.enableCa !== false;
    let rawCaPhotos = (report.caPhotos && report.caPhotos.length > 0)
      ? report.caPhotos
      : (report.correctiveActionPhotos && report.correctiveActionPhotos.length > 0 ? report.correctiveActionPhotos : []);
    if ((!rawCaPhotos || rawCaPhotos.length === 0) && window.FMCUApp && Array.isArray(window.FMCUApp.formCaPhotos) && window.FMCUApp.formCaPhotos.length > 0) {
      rawCaPhotos = window.FMCUApp.formCaPhotos;
    }
    const caPhotos = caEnabled
      ? rawCaPhotos.filter((p) => p && (p.dataUrl || p.driveFileId || (p.description && p.description.trim()) || (p.id && (window.FMCUData?.getPhotoFromMemory?.(p.id) || ''))))
      : [];

    if (caEnabled && caPhotos.length > 0) {
      this.drawCorporateDividerSlide(
        doc,
        PA.dividerCorrectiveAction,
        'SECTION 04 • REMEDIATION & RESULTS',
        'Corrective Action',
        'Post-Visit Resolution, Evidence of Action & Improvement Results',
        footerText
      );
      drawEvidencePhotoPages(caPhotos, 'Corrective Action Evidence & Result - Evidence Photos');
    }

    // ========================================================================
    // PAGE 10: SECTION DIVIDER - STORE ASSIGNMENT
    // ========================================================================
    this.drawCorporateDividerSlide(
      doc,
      PA.dividerStoreAssignment,
      'SECTION 05 • FOLLOW-UP & ACTION PLAN',
      'Store Assignment',
      'Action Item Delegation, Responsibility Tracking & Mandatory Deliverables',
      footerText
    );

    // ========================================================================
    // PAGE 11: MEKANISME PELAPORAN (Corporate Minimalist Design)
    // ========================================================================
    doc.addPage([320, 180], 'landscape');
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 320, 180, 'F');

    // Title & Subtitle
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text('Mekanisme Pelaporan & Tindak Lanjut Store', 12, 24);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text('Panduan resmi pengisian form rencana perbaikan (Corrective Action) hasil audit FMCU', 12, 30);

    doc.setDrawColor(0, 153, 166);
    doc.setLineWidth(0.35);
    doc.line(12, 35, 308, 35);

    // Modern CA Link Card
    doc.setFillColor(240, 253, 250); // Teal-50
    doc.setDrawColor(153, 246, 228); // Teal-200
    doc.setLineWidth(0.25);
    doc.roundedRect(12, 41, 296, 23, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 118, 110); // Teal-700
    doc.text(`LINK FILE FORM SPREADSHEET CA ${storeInfoTag}`, 18, 48.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(0, 153, 166); // Teal-600
    const maxLinkWidth = 280;
    let displayLink = resolvedCaLink;
    if (doc.getTextWidth(displayLink) > maxLinkWidth) {
      while (displayLink.length > 10 && doc.getTextWidth(displayLink + '...') > maxLinkWidth) {
        displayLink = displayLink.slice(0, -1);
      }
      displayLink = displayLink + '...';
    }
    doc.textWithLink(displayLink, 18, 57, { url: resolvedCaLink });

    // Corporate Step List Card
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.setLineWidth(0.25);
    doc.roundedRect(12, 69, 296, 95, 3, 3, 'FD');

    const steps = [
      {
        num: '1',
        title: 'Buka & Isi Formulir di Spreadsheet',
        desc: 'Buka dan isi langsung di spreadsheet file formulir perbaikan toko melalui link di atas.'
      },
      {
        num: '2',
        title: 'Isi Rencana & Bukti Perbaikan',
        desc: 'Tim store mengisi form tersebut berdasarkan temuan yang telah ditunjukkan pada file laporan ini.'
      },
      {
        num: '3',
        title: 'Patuhi Batas Waktu (Deadline)',
        desc: 'Tindakan perbaikan WAJIB dilakukan sebelum deadline yang diberikan oleh FMCU / Regional Bestie.'
      },
      {
        num: '4',
        title: 'Validasi & Konfirmasi Tindak Lanjut',
        desc: 'Forward email ini sebagai validasi bahwa sudah melakukan tindak lanjut hasil visit.'
      }
    ];

    steps.forEach((s, idx) => {
      const stepStartY = 74 + idx * 22;
      const circleX = 23;
      const circleY = stepStartY + 4.5;
      const circleRadius = 4.2;

      // Step badge circle
      doc.setFillColor(0, 153, 166);
      doc.circle(circleX, circleY, circleRadius, 'F');

      // Exact centered number
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(s.num, circleX, circleY + 0.25, { align: 'center', baseline: 'middle' });

      // Step Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(s.title, 33, stepStartY + 3.2);

      // Step Description
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(71, 85, 105);
      const descLines = doc.splitTextToSize(s.desc, 268);
      doc.text(descLines, 33, stepStartY + 8.2);

      // Light separator line between steps
      if (idx < steps.length - 1) {
        doc.setDrawColor(241, 245, 249); // Slate-100
        doc.setLineWidth(0.2);
        doc.line(33, stepStartY + 17.5, 302, stepStartY + 17.5);
      }
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
    } else if (
      (report.id === '__LIVE_FORM__' || !report.id || (window.FMCUApp && report.storeCode === document.getElementById('form-store-code')?.value.trim())) &&
      window.FMCUApp && Array.isArray(window.FMCUApp.formQscPhotos) && window.FMCUApp.formQscPhotos.length > 0
    ) {
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
      processedPhotos.push({
        ...p,
        resolvedBase64: base64 || '',
        slotIndex: idx + 1,
        caption: p.caption || `Lembar Form QSC / FamiTrack #${idx + 1}`
      });
    });

    // Filter foto aktif (yang benar-benar memiliki Base64 atau ID Drive)
    const activePhotos = processedPhotos.filter(p => Boolean(p.resolvedBase64 || (p.dataUrl && p.dataUrl.startsWith('data:image')) || p.driveUrl || p.driveFileId));

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
            // Gambar proporsional vertikal di dalam kotak A4 agar checklist & timestamp tidak tertarik
            this.drawImageProportional(doc, imgBase64, boxX + 4, boxY + 12, boxW - 8, boxH - 16, 'JPEG', 'FAST');
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
      this.drawPageFooter(doc, "");
    }

    return doc;
  },

  // Format Nama File Lembar QSC: "Lembar QSC-FAMITRACK-{nama store}-{DD-MM-YYYY}.pdf"
  getVerticalQscFileName(report) {
    if (!report) return 'Lembar QSC-FAMITRACK-STORE.pdf';
    const cleanStore = String(report.storeName || 'STORE').replace(/[/\\:*?"<>|]/g, ' ').trim();
    const dateFormatted = this.formatDateDdMmYyyy(report.visitDate);
    return `Lembar QSC-FAMITRACK-${cleanStore}-${dateFormatted}.pdf`;
  },

  async downloadVerticalQscPdf(report) {
    if (!report) return;
    const isLive = !report.id || report.id === '__LIVE_FORM__' || (window.FMCUApp && report.storeCode === document.getElementById('form-store-code')?.value.trim());
    if (isLive && (!report.qscPhotos || report.qscPhotos.length === 0) && window.FMCUApp?.formQscPhotos?.length > 0) {
      report.qscPhotos = JSON.parse(JSON.stringify(window.FMCUApp.formQscPhotos));
    }
    await this.hydrateReportPhotosFromGDrive(report);
    const doc = this.generateVerticalQscCollagePdf(report);
    if (!doc) return;
    doc.save(this.getVerticalQscFileName(report));
  },

  async getVerticalQscPdfBase64(report) {
    if (!report) return '';
    const isLive = !report.id || report.id === '__LIVE_FORM__' || (window.FMCUApp && report.storeCode === document.getElementById('form-store-code')?.value.trim());
    // Sinkronkan lembar QSC Section 1 dari form jika belum ada di objek report
    if (isLive && (!report.qscPhotos || report.qscPhotos.length === 0) && window.FMCUApp?.formQscPhotos?.length > 0) {
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

    // Resolve store-specific spreadsheet link
    let resolvedCaLink = report.caSpreadsheetUrl || report.caLink || '';
    if (!resolvedCaLink && report.storeCode && window.FMCUData && typeof window.FMCUData.getStores === 'function') {
      const allStores = window.FMCUData.getStores();
      const matchedStore = allStores.find((s) => String(s.code).trim().toLowerCase() === String(report.storeCode).trim().toLowerCase());
      if (matchedStore) {
        resolvedCaLink = matchedStore.caSpreadsheetUrl || matchedStore.caLink || '';
      }
    }
    if (!resolvedCaLink) {
      resolvedCaLink = settings.caLink || 'https://tinyurl.com/store-caassignment';
    }

    const storeInfoTag = (report.storeName && report.storeCode)
      ? `KHUSUS ${report.storeName.toUpperCase()} (${report.storeCode}):`
      : 'HASIL VISIT AUDIT:';

    const buildDividerSlideHtml = (imageSrc, sectionTag, title, subtitle) => `
      <div class="w-full h-full bg-white relative overflow-hidden flex">
        <!-- Left Half: Elegant Minimalist Corporate Typography -->
        <div class="w-[45.8%] h-full flex flex-col justify-between p-[5.5%] z-10 bg-white">
          <div>
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/60 text-[#0099A6] text-[clamp(7px,0.85cqw,12px)] font-extrabold uppercase tracking-widest mb-4">
              <span class="w-1.5 h-1.5 rounded-full bg-[#0099A6]"></span>
              ${sectionTag}
            </div>
            <h1 class="text-slate-900 font-extrabold text-[clamp(16px,2.8cqw,36px)] leading-[1.12] tracking-tight mb-4">
              ${title}
            </h1>
            <div class="w-12 h-1 bg-[#009944] rounded-full mb-4"></div>
            <p class="text-slate-500 font-medium text-[clamp(8px,1.1cqw,15px)] leading-relaxed">
              ${subtitle}
            </p>
          </div>
          <div class="text-[clamp(6.5px,0.75cqw,11px)] font-bold tracking-wider uppercase text-slate-400">
            FamilyMart Central Unit • Visit Store Report
          </div>
        </div>
        <!-- Right Half: Illustration from divider image -->
        <div class="w-[54.2%] h-full relative overflow-hidden bg-white">
          <img src="${imageSrc || ''}" class="absolute right-0 top-0 h-full w-[184%] max-w-none object-cover object-right" alt="${title}" />
        </div>
      </div>
    `;
    const visitDateText = report.visitDateFormatted || this.formatIndonesianDate(report.visitDate, false);
    const dayDateText = report.visitDayDateFormatted || this.formatIndonesianDate(report.visitDate, true);

    const slides = [];

    // 1. Cover Slide
    slides.push({
      title: 'Cover - FMCU Visit Store Report',
      html: `
        <div class="w-full h-full bg-white flex flex-col justify-between relative overflow-hidden">
          <div class="w-full h-[57%] overflow-hidden bg-slate-100">
            <img src="${PA.bannerCover || PA.bannerStorefront || PA.bannerFamilyMart || 'COVER1.jpg'}" class="w-full h-full object-cover object-top" alt="FamilyMart Banner" />
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
      : [
          { caption: 'Lembar Form QSC / FamiTrack #1 (Wajib)', dataUrl: '' },
          { caption: 'Lembar Form QSC / FamiTrack #2 (Wajib)', dataUrl: '' }
        ];

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
                <div class="border ${src ? 'border-slate-300' : 'border-dashed border-slate-300'} rounded-xl p-[1cqw] flex flex-col justify-between bg-white h-full overflow-hidden">
                  <div class="w-full h-[88%] bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center">
                    ${src
                      ? `<img src="${src}" class="w-full h-full object-contain" alt="QSC" />`
                      : `<div class="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                           <i class="fa-solid fa-file-invoice text-3xl mb-1.5 text-slate-300"></i>
                           <span class="text-[clamp(7px,0.9cqw,12px)] font-bold text-slate-600">Foto Lembar QSC #${i + idx + 1}</span>
                           <span class="text-[clamp(6px,0.75cqw,10px)] text-slate-400 mt-0.5">Belum ada foto diunggah (Default Kosong)</span>
                         </div>`}
                  </div>
                  <div class="text-[clamp(6.5px,0.85cqw,11px)] text-slate-700 font-semibold pt-1 truncate">${p.caption || `Lembar Form QSC / FamiTrack #${i + idx + 1}`}</div>
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
        html: buildDividerSlideHtml(
          PA.dividerOpiProjectObservation,
          'SECTION 01 • OPERATIONAL IMPROVEMENT',
          'OPI Project Observation',
          'Operational Performance Initiative, Focus Area & Execution Progress'
        )
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
        html: buildDividerSlideHtml(
          PA.dividerQscObservation,
          'SECTION 02 • QUALITY & SERVICE AUDIT',
          'QSC Observation',
          'Quality, Service & Cleanliness Detailed Inspection & Findings'
        )
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
    let rawEvList = (report.evidencePhotos && report.evidencePhotos.length > 0)
      ? report.evidencePhotos
      : [];
    if ((!rawEvList || rawEvList.length === 0) && window.FMCUApp && Array.isArray(window.FMCUApp.formEvidencePhotos) && window.FMCUApp.formEvidencePhotos.length > 0) {
      rawEvList = window.FMCUApp.formEvidencePhotos;
    }
    const evList = evEnabled
      ? rawEvList.filter((p) => p && (p.dataUrl || p.driveFileId || (p.description && p.description.trim()) || (p.id && (window.FMCUData?.getPhotoFromMemory?.(p.id) || ''))))
      : [];

    if (evEnabled && evList.length > 0) {
      slides.push({
        title: 'Divider - Finding Evidence',
        html: buildDividerSlideHtml(
          PA.dividerFindingEvidence,
          'SECTION 03 • DOCUMENTATION & EVIDENCE',
          'Finding Evidence',
          'Visual Photographic Evidence of Audit Findings & Non-Compliance Items'
        )
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
    let rawCaList = (report.caPhotos && report.caPhotos.length > 0)
      ? report.caPhotos
      : (report.correctiveActionPhotos && report.correctiveActionPhotos.length > 0 ? report.correctiveActionPhotos : []);
    if ((!rawCaList || rawCaList.length === 0) && window.FMCUApp && Array.isArray(window.FMCUApp.formCaPhotos) && window.FMCUApp.formCaPhotos.length > 0) {
      rawCaList = window.FMCUApp.formCaPhotos;
    }
    const caList = caEnabled
      ? rawCaList.filter((p) => p && (p.dataUrl || p.driveFileId || (p.description && p.description.trim()) || (p.id && (window.FMCUData?.getPhotoFromMemory?.(p.id) || ''))))
      : [];

    if (caEnabled && caList.length > 0) {
      slides.push({
        title: 'Divider - Corrective Action Evidence & Result',
        html: buildDividerSlideHtml(
          PA.dividerCorrectiveAction,
          'SECTION 04 • REMEDIATION & RESULTS',
          'Corrective Action',
          'Post-Visit Resolution, Evidence of Action & Improvement Results'
        )
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
      html: buildDividerSlideHtml(
        PA.dividerStoreAssignment,
        'SECTION 05 • FOLLOW-UP & ACTION PLAN',
        'Store Assignment',
        'Action Item Delegation, Responsibility Tracking & Mandatory Deliverables'
      )
    });

    // 11. Mekanisme Pelaporan
    slides.push({
      title: 'Mekanisme Pelaporan',
      html: `
        <div class="w-full h-full bg-white px-[3.5%] py-[3.8%] flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between pb-2 mb-3 border-b border-teal-600/30">
              <div>
                <h2 class="text-slate-900 font-extrabold text-[clamp(11px,1.8cqw,24px)] tracking-tight">
                  Mekanisme Pelaporan & Tindak Lanjut Store
                </h2>
                <p class="text-slate-500 font-medium text-[clamp(7px,0.85cqw,12px)]">
                  Panduan resmi pengisian form rencana perbaikan (Corrective Action) hasil audit FMCU
                </p>
              </div>
              <span class="px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-[#0099A6] text-[clamp(6.5px,0.75cqw,10px)] font-bold uppercase">
                Step by Step
              </span>
            </div>

            <!-- Modern CA Link Card -->
            <div class="bg-teal-50/70 border border-teal-200/80 rounded-xl p-[2%] mb-3.5 flex flex-col justify-center">
              <span class="text-[clamp(6px,0.7cqw,10px)] font-bold text-teal-800 uppercase tracking-wider mb-0.5">
                LINK FILE FORM SPREADSHEET CA ${storeInfoTag}
              </span>
              <a href="${resolvedCaLink}" target="_blank" class="text-[#0099A6] font-extrabold text-[clamp(8px,1.25cqw,17px)] hover:underline break-all truncate">
                ${resolvedCaLink}
              </a>
            </div>

            <!-- Corporate Step List Card -->
            <div class="bg-white border border-slate-200/90 rounded-xl p-[2.5%] space-y-[1.2cqw]">
              <div class="flex items-start gap-3 pb-[1cqw] border-b border-slate-100">
                <div class="w-6 h-6 rounded-full bg-[#0099A6] text-white flex items-center justify-center font-bold text-[clamp(7px,0.9cqw,12px)] shrink-0 shadow-sm">
                  1
                </div>
                <div>
                  <h4 class="font-bold text-slate-900 text-[clamp(7.5px,1cqw,14px)] leading-snug">
                    Buka & Isi Formulir di Spreadsheet
                  </h4>
                  <p class="text-slate-600 text-[clamp(6.5px,0.85cqw,12px)] leading-relaxed mt-0.5">
                    Buka dan isi langsung di spreadsheet file formulir perbaikan toko melalui link di atas.
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-3 pb-[1cqw] border-b border-slate-100">
                <div class="w-6 h-6 rounded-full bg-[#0099A6] text-white flex items-center justify-center font-bold text-[clamp(7px,0.9cqw,12px)] shrink-0 shadow-sm">
                  2
                </div>
                <div>
                  <h4 class="font-bold text-slate-900 text-[clamp(7.5px,1cqw,14px)] leading-snug">
                    Isi Rencana & Bukti Perbaikan
                  </h4>
                  <p class="text-slate-600 text-[clamp(6.5px,0.85cqw,12px)] leading-relaxed mt-0.5">
                    Tim store mengisi form tersebut berdasarkan temuan yang telah ditunjukkan pada file laporan ini.
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-3 pb-[1cqw] border-b border-slate-100">
                <div class="w-6 h-6 rounded-full bg-[#0099A6] text-white flex items-center justify-center font-bold text-[clamp(7px,0.9cqw,12px)] shrink-0 shadow-sm">
                  3
                </div>
                <div>
                  <h4 class="font-bold text-slate-900 text-[clamp(7.5px,1cqw,14px)] leading-snug">
                    Patuhi Batas Waktu (Deadline)
                  </h4>
                  <p class="text-slate-600 text-[clamp(6.5px,0.85cqw,12px)] leading-relaxed mt-0.5">
                    Tindakan perbaikan WAJIB dilakukan sebelum deadline yang diberikan oleh FMCU / Regional Bestie.
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-full bg-[#0099A6] text-white flex items-center justify-center font-bold text-[clamp(7px,0.9cqw,12px)] shrink-0 shadow-sm">
                  4
                </div>
                <div>
                  <h4 class="font-bold text-slate-900 text-[clamp(7.5px,1cqw,14px)] leading-snug">
                    Validasi & Konfirmasi Tindak Lanjut
                  </h4>
                  <p class="text-slate-600 text-[clamp(6.5px,0.85cqw,12px)] leading-relaxed mt-0.5">
                    Forward email ini sebagai validasi bahwa sudah melakukan tindak lanjut hasil visit.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div class="text-[clamp(6px,0.7cqw,10px)] text-slate-400 font-bold uppercase tracking-wider pt-2">
            ${footerText}
          </div>
        </div>
      `
    });

    // Otomatis bubuhkan Watermark WTRMRK di pojok kanan bawah untuk seluruh slide HTML (versi mini kecil)
    const watermarkSnippet = `
      <div class="absolute bottom-[1.2%] right-[1.2%] pointer-events-none select-none z-30 opacity-60" title="WTRMRK">
        <img src="${PA.watermark || PA.WTRMRK || 'WTRMRK_cropped.png'}" class="h-[clamp(8px,1.2cqw,15px)] w-auto object-contain" alt="WTRMRK" />
      </div>
    `;

    slides.forEach((s) => {
      if (s && s.html) {
        const lastDivIdx = s.html.lastIndexOf('</div>');
        if (lastDivIdx !== -1) {
          s.html = s.html.slice(0, lastDivIdx) + watermarkSnippet + s.html.slice(lastDivIdx);
        }
      }
    });

    return slides;
  }
};
