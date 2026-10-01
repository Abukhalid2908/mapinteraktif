# Backend Node.js dan database

Target deployment baru adalah Azure atau hosting Node.js lain (mis. cPanel Node.js App). Situs Sites sebelumnya tetap demo statis dan tidak mengakses database lokal.

## Lokal

- Database aplikasi: `mm2100_map` pada MySQL/MariaDB `127.0.0.1:3306`.
- Konfigurasi privat: `~/.mm2100/config.local.json` (di luar folder proyek, bukan `backend/config.local.json`). Ini disengaja: server dev (`npm run dev`) menyajikan seluruh folder proyek secara statis, sehingga file apa pun di dalam repo bisa diakses lewat HTTP terlepas dari pemeriksaan aplikasi. Jangan pernah menaruh kredensial di dalam folder proyek. Template ada di `backend/config.example.json` — salin ke `~/.mm2100/config.local.json` dan isi manual, atau biarkan `npm run setup:db` membuatkannya otomatis. Variabel lingkungan (`DB_HOST`, dst.) selalu diprioritaskan di atas file ini.
- Aplikasi memakai akun database khusus `mm2100_app`, bukan root.
- Tabel: `admins`, `app_sessions`, `facilities`, `plots`, `infrastructure`, `infrastructure_categories`, `login_limits`, `audit_log`, `categories`.
- `facilities.payload` berisi data fasilitas tervalidasi; publik hanya menerima status `published`.
- `admins.password_hash` menyimpan hash bcrypt, bukan password asli.
- Perubahan fasilitas tersimpan langsung; muat ulang peta untuk mengambil data terbaru. Arsip menyembunyikan fasilitas tanpa menghapus riwayat.

Untuk instalasi baru yang masih memakai akun root lokal tanpa password, jalankan sekali `npm run setup:db`. Skrip menolak jika database atau akun sudah ada. Jangan gunakan skrip tersebut untuk provisioning Azure.

Build admin: `npm run build:admin`.
Build peta: `npm run build` dengan Node 22.
Jalankan `npm run dev:backend` dari root proyek (default port 2801, bisa diubah lewat env `PORT`/`HOST`).
Buka `http://127.0.0.1:2801/admin/` untuk membuat admin pertama dengan email/password Anda. Setup hanya tersedia pada loopback, origin lokal yang dikonfigurasi, dan ketika belum ada admin. Setelah akun dibuat, halaman berubah menjadi login biasa. Tidak ada registrasi publik.

Server Node ini (`backend/server.mjs`) melayani API (`/api/index.php`, `/facilities.json`) sekaligus file statis `/admin/*` dan `dist/client` — cocok untuk pengembangan maupun sebagai proses production tunggal di hosting Node.

## Kelola kategori

Di `/admin/`, klik **Kelola kategori** lalu **Kategori baru**. Isi nama dan pilih ikon dari pustaka yang tersedia. Nama dan ikon dapat diedit; ID tetap stabil agar hubungan fasilitas tidak rusak. Nonaktifkan kategori yang tidak dibutuhkan. Kategori yang masih dipakai fasilitas (termasuk draft/arsip) tidak dapat dinonaktifkan sebelum fasilitas dipindahkan ke kategori lain. Tidak ada penghapusan permanen kategori.

Daftar kategori publik dikirim bersama `/facilities.json`; muat ulang halaman peta setelah mengubah kategori. Data disimpan di tabel `categories`. Untuk upgrade instalasi yang sudah ada, jalankan `backend/categories.sql` dengan akun migrasi sebelum memasang versi aplikasi baru (atau `npm run migrate:schema` yang menjalankan `backend/schema.sql` secara idempoten). Skrip ini hanya membuat tabel dan menambahkan kategori bawaan yang belum ada; tidak menghapus data.

## Lokasi induk dan tenant

1. Tambah lokasi induk dengan kategori **Food Court**, isi alamat dan koordinat pintu masuk, lalu simpan. Terbitkan setelah diverifikasi.
2. Tambah nama resto/kantin dengan kategori **Resto & Cafe**. Pilih **Food court induk**, isi **Nomor kios / unit**, menu, kontak, sumber dan tanggal verifikasi.
3. Alamat dan koordinat tenant mengikuti induk; kolom tersebut tidak dapat diedit saat tenant terhubung. Perubahan koordinat induk langsung berlaku pada pembacaan peta tenant. Nomor kios membantu navigasi di dalam area.
4. Tenant hanya dapat diterbitkan jika induknya sudah terbit. Arsipkan tenant terbit terlebih dahulu sebelum mengarsipkan induk. Kategori food court tidak dapat diubah selama masih memiliki tenant.
5. Peta menampilkan satu ikon per food court dengan jumlah tenant terbit; klik induk untuk daftar tenant. Pencarian nama/menu/kios tenant tetap menemukan tenant dan menampilkan food court-nya. Resto mandiri menggunakan pilihan induk kosong.

Hubungan disimpan sebagai `parent_id` dan `unit_number` dalam payload fasilitas yang sudah ada; tidak memerlukan penghapusan tabel atau migrasi data lama. Editor JSON offline lama bukan editor hubungan tenant; gunakan `/admin/` untuk mengelola hierarki.

## Deployment Azure (App Service, Node runtime)

1. Buat App Service Linux dengan runtime Node.js (22 LTS) dan MySQL Flexible Server. Belum ada resource Azure dibuat oleh proyek ini.
2. Buat database khusus dan jalankan `backend/schema.sql` melalui koneksi administrator/migrasi. Beri akun runtime hanya SELECT, INSERT, UPDATE, DELETE pada database aplikasi. Jangan gunakan akun administrator MySQL untuk aplikasi.
3. Atur environment App Service: `DB_HOST`, `DB_PORT=3306`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL_CA` (path CA bundle tepercaya), `APP_ORIGIN=https://domain-aplikasi`, `ALLOW_LOCAL_SETUP=0`. Azure App Service menyuntikkan `PORT` sendiri; `backend/server.mjs` membacanya otomatis (`process.env.PORT`). Aktifkan HTTPS Only. `APP_ORIGIN` tanpa trailing slash, harus sama dengan origin browser admin. Jangan percaya header proxy kiriman klien untuk mengubah origin atau cookie.
4. Pastikan MySQL dapat dijangkau dari App Service melalui konfigurasi jaringan Azure dan TLS dengan verifikasi sertifikat. Jangan menonaktifkan verifikasi sertifikat.
5. Setelah build peta dan admin berhasil, jalankan `node tools/package-azure.mjs`. Skrip menghasilkan folder unik `outputs/azure-...` berisi `dist/client`, `admin-dist`, `backend`, `tools`, dan `package.json` minimal (dependencies: express, mysql2, bcryptjs). Paket tidak membawa kredensial lokal. Zip ISI folder itu, bukan folder induknya, lalu deploy melalui ZIP Deploy Azure (Oryx akan menjalankan `npm install` otomatis saat build).
6. Atur Startup Command ke `npm start` (menjalankan `node backend/server.mjs`, yang melayani API dan file statis dari satu proses — tidak perlu nginx atau PHP-FPM terpisah).
7. Buat admin pertama melalui console server (SSH/Kudu): masukkan `ADMIN_EMAIL` dan `ADMIN_PASSWORD` sebagai environment sesi shell yang tidak dicatat history (password gunakan input tersembunyi), jalankan `node tools/admin-account.mjs create`, lalu hapus kedua variabel. Jangan menyimpan password bootstrap sebagai App Setting permanen atau memasukkannya ke Git. Mode `reset` mengganti password dan mencabut semua sesi admin tersebut.
   Untuk membuat akun pengguna internal yang hanya dapat membuka Bidang Kawasan dan Infrastruktur di halaman depan, gunakan variabel yang sama lalu jalankan `node tools/admin-account.mjs create-user`. Akun dengan peran `internal` ditolak oleh API pengelolaan admin.
   Pada instalasi lama, jalankan `backend/access-roles.sql` sekali dengan akun migrasi sebelum memasang versi ini.
8. Periksa login benar/salah, CRUD melalui status draft/terbit/arsip, izin API, koneksi TLS, dan peta pada URL Azure sebelum mengganti domain. Paket ini belum diuji di Azure karena akun/resource Azure belum diberikan.

## Deployment cPanel (Setup Node.js App)

1. Di cPanel, buat "Setup Node.js App" dengan application root berisi hasil `tools/package-azure.mjs` (atau struktur setara: `dist/client`, `admin-dist`, `backend`, `tools`, `package.json`), Node version 22, application startup file `backend/server.mjs`.
2. Isi environment variables yang sama seperti poin 3 Azure di atas. cPanel biasanya menyuntikkan `PORT` sendiri via Passenger; jangan hardcode port.
3. Jalankan "NPM Install" dari panel Node.js App, lalu start/restart aplikasi.
4. Buat admin pertama via terminal cPanel dengan `node tools/admin-account.mjs create`, mengikuti langkah keamanan yang sama seperti poin 7 Azure di atas.

Session disimpan dalam database (masa berlaku 8 jam), cookie HttpOnly/SameSite Strict dan Secure pada HTTPS; token di database di-hash. Permintaan perubahan memerlukan origin cocok dan token CSRF. Login dibatasi 10 percobaan per email dan IP dalam 15 menit. Simpan database lewat backup layanan hosting; atur retensi sesuai kebutuhan. Jadwalkan penghapusan baris `app_sessions` dan `login_limits` dengan `expires_at < UNIX_TIMESTAMP()` menggunakan pekerjaan pemeliharaan database. Riwayat audit menyimpan aktor, aksi, waktu, ID fasilitas; belum menyimpan snapshot versi lama.

Referensi: https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs
