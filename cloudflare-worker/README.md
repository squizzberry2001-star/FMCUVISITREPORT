# Panduan Migrasi Database ke Cloudflare D1 (Serverless Edge SQLite)
Aplikasi: **FMCU Visit Store Report**  
Kecepatan: **Ekstrem Cepat (~20–50ms latensi di Indonesia)**  
Kuota Gratis (*Free Tier*): **5.000.000 Read/hari, 100.000 Write/hari, 5 GB Storage**

---

## Opsi 1: Deploy Lewat Cloudflare Dashboard Web (Paling Mudah, Tanpa Terminal / CLI)

Waktu pengerjaan: **~2 menit**.

### Langkah 1: Buat Database D1 di Cloudflare
1. Buka [dash.cloudflare.com](https://dash.cloudflare.com/) dan login/daftar akun Cloudflare gratis.
2. Di sidebar kiri, klik **Storage & Databases** (atau **Workers & Pages**) > **D1 SQL Database**.
3. Klik tombol **Create Database**.
4. Masukkan nama database: `fmcu-database`.
5. Klik **Create**.

### Langkah 2: Buat Worker Baru
1. Di sidebar kiri, klik **Compute (Workers)** (atau **Workers & Pages**) > **Overview**.
2. Klik tombol **Create Application** (atau **Create Worker**).
3. Beri nama worker: `fmcu-edge-database` (atau sesuai keinginan).
4. Klik **Deploy**.

### Langkah 3: Hubungkan Database D1 ke Worker (Binding)
1. Di halaman Worker yang baru dibuat, klik tab **Settings**.
2. Scroll ke bagian **Bindings** (atau **Variables and Secrets** > **Bindings**) > klik **Add**.
3. Pilih tipe: **D1 Database**.
4. Pada kolom **Variable name**, ketik persis: `DB` *(Wajib huruf besar)*.
5. Pada dropdown **D1 database**, pilih: `fmcu-database`.
6. Klik **Save and deploy**.

### Langkah 4: Masukkan Kode Script Worker
1. Kembali ke halaman Worker, klik tombol **Edit Code** (atau **Quick Edit**).
2. Hapus seluruh kode bawaan yang ada di editor.
3. Salin seluruh isi file [`cloudflare-worker/worker.js`](./worker.js) lalu tempelkan (*paste*) ke editor.
4. Klik tombol **Deploy** di pojok kanan atas.

### Langkah 5: Hubungkan ke Web App FMCU
1. Salin URL Worker Anda (contoh: `https://fmcu-edge-database.username.workers.dev`).
2. Buka web app FMCU Visit Report.
3. Masuk ke menu **Admin** > **Pengaturan Integrasi**.
4. Tempelkan URL tersebut ke kolom **"Cloudflare D1 Worker Edge API URL"**.
5. Klik **Simpan Pengaturan**.
6. **Selesai!** Indikator database di aplikasi akan seketika berubah menjadi:  
   `⚡ Database: Cloudflare D1 Edge SQLite (⚡ 20ms • 5 Juta Kuota)`

---

## Opsi 2: Deploy Otomatis Menggunakan Wrangler CLI (Untuk Developer)

Jika Anda memiliki Node.js dan ingin mendeploy via terminal:

1. Masuk ke direktori `cloudflare-worker`:
   ```bash
   cd cloudflare-worker
   ```
2. Login ke akun Cloudflare:
   ```bash
   npx wrangler login
   ```
3. Buat database D1:
   ```bash
   npx wrangler d1 create fmcu-database
   ```
4. Salin `database_id` yang muncul di terminal dan tempelkan ke file `wrangler.toml`:
   ```toml
   database_id = "paste-database-id-disini"
   ```
5. Deploy worker:
   ```bash
   npx wrangler deploy
   ```
6. Salin URL output worker ke Pengaturan Web App FMCU.
