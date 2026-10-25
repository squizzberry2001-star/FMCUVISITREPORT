# FMCU VISIT STORE REPORT

Platform Web App Audit Kunjungan Toko (**FamilyMart Indonesia - FMCU**), dilengkapi dengan Analitik Performa & Aktivitas Auditor, Trend Temuan & Trend Toko, Manajemen Jadwal Visit, Kontrol Otoritas Login (RBAC), Pemantauan **Live Location GPS**, Perekaman **Actual In & Actual Out**, serta Generator Laporan **PDF 16:9 Landscape** otomatis yang terintegrasi ke **Email & Folder Google Drive**.

---

## Fitur Utama

1. **Halaman 1: Home, Live Location & Analitik Dashboard**
   - **Live GPS Location & Peta Interaktif**: Validasi posisi aktual auditor beserta pin lokasi toko FamilyMart.
   - **Actual In & Actual Out Recorder**: Mencatat jam kedatangan (*Actual In*) dan jam selesai (*Actual Out*) beserta titik koordinat GPS aktual.
   - **Jadwal Toko yang Diminta Visit (Schedule Visit)**: Daftar tugas kunjungan toko dengan tombol *Check-In & Mulai Visit*.
   - **Analitik Dashboard**:
     - Grafik **Trend Temuan Observasi** (Food Safety & Expired, Standar SOP & Alat Takar, Kebersihan & Sanitasi, Administrasi & Logbook, Merchandising & Price Card).
     - Grafik **Trend Toko** (Perbandingan jumlah temuan & skor QSC antar toko).
     - Tabel **Analitik Performa & Aktivitas User** (Target jadwal, realisasi visit, jumlah temuan, dan titik Live GPS terakhir).
   - **History Visit**: Arsip seluruh laporan kunjungan dengan akses langsung ke *Preview Slide 16:9*, *Download PDF*, dan *Kirim Ulang Email/Google Drive*.

2. **Halaman 2: Form Visit Store (Multi-Section)**
   - **Section 1 — General Information**: Identitas toko (otomatis terisi dari Master Toko atau input manual), nama auditor, tanggal visit, skor QSC, serta tabel dinamis **Tim Store Bertugas** (`Store Head`, `Shift Leader`, `Crew Store`, beserta `Job Level`).
   - **Section 2 — Evidence Form QSC / FamiTrack Result**: Upload foto lembar form penilaian fisik QSC / FamiTrack.
   - **Section 3 — QSC Observation (Findings & Root Cause Analysis)**: Kartu temuan dinamis berisi *Temuan*, *Kondisi Ideal*, *Penyebab*, *Dampak*, *Tindakan Perbaikan*, *Hasil*, dan *Deadline Perbaikan*.
   - **Section 4 — Finding Evidence Photos**: Upload banyak foto bukti temuan sekaligus dengan fitur **Auto-Watermark Stamp** (`NAMA TOKO (FMI) | Tanggal & Jam WIB | GPS: Lat, Lng`).
   - **Section 5 — Store Assignment & Integrasi**: Pengaturan link form Corrective Action (`https://tinyurl.com/store-caassignment`) dan pengiriman ke Email & Google Drive.

3. **Halaman 3: Preview Hasil PDF (Slide 16:9) & Download PDF**
   - Mode **Slide Interaktif 16:9** & **Semua Halaman Grid** yang menampilkan seluruh halaman laporan (Cover, QSC/Famitrack Result, General Information, QSC Observation, Finding Evidence, Store Assignment, & Mekanisme Pelaporan) persis seperti output PDF.
   - Generator PDF vektor + gambar resolusi tinggi (`320mm x 180mm` Landscape) berjudul **FMCU Visit Store Report**.

4. **Halaman 4: Portal Khusus Otoritas Admin**
   - Dilindungi oleh sistem verifikasi otoritas (`Super Admin FMCU` & `Admin Jadwal`).
   - **Atur Jadwal Visit**: Assign toko ke auditor, tentukan tanggal & fokus audit, serta pantau realisasi *Actual In / Out*.
   - **Master Data Toko**: Kelola database toko FamilyMart (`CVS`, `FC`, `KIOSK`), Store Head, Area Manager, Regional Manager, dan koordinat GPS.
   - **User Management & Otoritas Login**: Kelola akun user, password, role, dan hak akses otoritas spesifik.
   - **Integrasi Email & Google Drive**: Konfigurasi Folder ID Google Drive & Webhook Google Apps Script ([`google-apps-script/Code.gs`](./google-apps-script/Code.gs)).

---

## Akun Akses Awal Sistem

| Role / Otoritas | Username | Password |
| :--- | :--- | :--- |
| **Super Admin FMCU** | `admin` | `123` |
| **Auditor FMCU** | `auditor` | `123` |
