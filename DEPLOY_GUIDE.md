# Panduan Deployment Website ke Vercel

Setelah menyelesaikan inisialisasi database Supabase Anda, ikuti langkah-langkah di bawah ini untuk menerbitkan (deploy) website Dusun Dangkel Kulon secara gratis di Vercel.

---

## Langkah 1: Hubungkan Supabase ke Kode Produksi (Opsional tapi Direkomendasikan)
Agar pengunjung tidak perlu memasukkan URL dan API Key secara manual melalui panel bawah di web, Anda dapat menuliskannya langsung ke dalam kode di file `app.js` sebagai default:

1. Buka file [app.js](file:///c:/Garrent/Coding/Job/Web%20Dusun%20Dangkel%20Kulon/app.js).
2. Temukan baris ke-6 dan ke-7:
   ```javascript
   let SUPABASE_URL = localStorage.getItem('SB_URL') || '';
   let SUPABASE_KEY = localStorage.getItem('SB_KEY') || '';
   ```
3. Ganti string kosong `''` dengan URL dan Anon Key asli milik Supabase Anda:
   ```javascript
   let SUPABASE_URL = localStorage.getItem('SB_URL') || 'https://xxxxxx.supabase.co';
   let SUPABASE_KEY = localStorage.getItem('SB_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
   ```
   > [!NOTE]
   > Kunci `anon` Supabase didesain aman untuk dipublikasikan di sisi klien (frontend) selama Anda telah mengaktifkan Row Level Security (RLS) pada tabel, seperti yang dijelaskan dalam panduan `DATABASE_SETUP.md`.

---

## Langkah 2: Unggah Kode ke GitHub
1. Buat repositori baru di akun [GitHub](https://github.com/) Anda (bisa berupa repositori *public* atau *private*).
2. Unggah semua file berikut dari direktori lokal Anda ke repositori GitHub tersebut:
   - `index.html`
   - `dashboard.html`
   - `style.css`
   - `app.js`
   - `DATABASE_SETUP.md`
   - `DEPLOY_GUIDE.md`

---

## Langkah 3: Deploy Proyek di Vercel
1. Masuk ke dashboard [Vercel](https://vercel.com/) (menggunakan akun GitHub Anda).
2. Klik tombol **Add New** di pojok kanan atas, lalu pilih **Project**.
3. Cari repositori GitHub yang baru saja Anda buat dan klik **Import**.
4. Di bagian **Configure Project**:
   - **Framework Preset**: Biarkan berisi **Other** atau **HTML** (karena ini adalah proyek HTML statis murni).
   - **Root Directory**: Biarkan `./`.
5. Klik tombol **Deploy**.
6. Tunggu sekitar 10-30 detik hingga proses deployment selesai. Vercel akan memberikan tautan domain gratis berakhiran `.vercel.app` (misal: `web-dusun-dangkel.vercel.app`).

---

## Langkah 4: Sesuaikan URL Redirect Google Auth di Supabase
Setelah website Anda berhasil terbit di Vercel dan mendapatkan domain produksi, Anda harus mendaftarkan URL produksi tersebut di Supabase agar login Google dapat mengalihkan kembali pengguna ke dashboard yang benar:

1. Salin domain website dari Vercel Anda (misalnya: `https://web-dusun-dangkel.vercel.app`).
2. Masuk ke dashboard **Supabase > Authentication > Providers > Google**.
3. Di bagian konfigurasi Google, pastikan Anda juga menambahkan/menyesuaikan URL redirect jika diperlukan.
4. Masuk ke **Supabase > Authentication > URL Configuration**:
   - Ganti **Site URL** menjadi domain Vercel Anda (misal: `https://web-dusun-dangkel.vercel.app`).
   - Pada bagian **Redirect URLs**, tambahkan `https://web-dusun-dangkel.vercel.app/dashboard.html`.
5. Simpan perubahan.

Sekarang, sistem login Google Auth, registrasi, dashboard persetujuan Kepala Dusun, dan pengelolaan UMKM/Berita telah siap digunakan secara penuh di internet!
