# MM2100 · Jelajah Kawasan

Aplikasi peta fasilitas dengan React, Vinext/Vite, Tailwind, komponen shadcn/ui, Leaflet, dan MapLibre. Tersedia dua mode: demo Sites statis dengan JSON, serta backend Node.js (Express + MySQL/MariaDB) dengan login admin untuk pengembangan lokal/Azure/cPanel. Node.js >=22.13 diperlukan (Node 22 direkomendasikan untuk build di Windows).

## Admin dan database (lokal / Azure / cPanel)

Lihat [panduan backend dan deployment Azure](deploy/azure/README.md). Halaman `/admin/` pada server Node menyediakan akun email/password, penyimpanan fasilitas langsung, status draft/terbit/arsip, kontrol revisi, dan audit perubahan. Database lokal bernama `mm2100_map`; konfigurasi privat berada di `~/.mm2100/config.local.json` (di luar folder proyek, karena server dev menyajikan seluruh folder proyek secara statis). Situs Sites sebelumnya tetap memakai JSON dan belum terhubung ke backend ini.

Jalankan backend lokal: `npm run dev:backend` (default port 2801). Perintah build admin: `npm run build:admin`. Uji integrasi terisolasi: `npm run test:backend` (memerlukan MySQL/MariaDB lokal). Paket Azure: `npm run package:azure` setelah build frontend dan admin. Pengujian backend membuat lalu menghapus database dan akun khusus dengan nama acak `mm2100_test_*`, tidak memakai data aplikasi.

## Menjalankan

```sh
npm ci
npm run dev -- --hostname 127.0.0.1
npm run editor
```

Buka alamat yang dicetak server. Editor memakai http://127.0.0.1:5174, hanya terikat ke loopback. Jangan membuka editor ke jaringan umum. Gunakan Node yang memenuhi versi minimum; Node bawaan sistem saat pengembangan adalah v20 sehingga pengujian memakai runtime Node 24 yang tersedia.

## Data fasilitas pada mode statis

Dataset publik berada di public/facilities.json. Saat belum ada entri nyata, aplikasi membuka mode demo dengan enam fasilitas ilustrasi. Nama dan koordinat demo bukan data nyata; navigasinya dinonaktifkan. Tombol “Lihat data nyata” menampilkan dataset kosong secara jujur. Titik pusat peta hanya framing awal; bukan titik acuan jarak atau batas resmi kawasan.

1. Jalankan editor dan impor master JSON, atau tambah fasilitas.
2. Isi data bisnis publik. Klik peta atau ketik latitude/longitude; periksa alamat, titik masuk, sumber, dan tanggal. ID tetap stabil.
3. Gunakan draft sampai verifikasi selesai. Terapkan perubahan form sebelum ekspor.
4. Ekspor master untuk menyimpan seluruh data. Simpan master di luar folder public dan jangan commit informasi nonpublik.
5. Ekspor data publik untuk mendapatkan hanya entri published dan field yang diizinkan.
6. Tinjau perubahan, lalu ganti public/facilities.json. Validasi dan build sebelum publikasi ulang.

Ekspor tidak memperbarui server. Semua perubahan editor berada dalam memori sampai JSON diunduh. Unduhan publik tidak menghapus status perubahan master yang belum diekspor. Ukuran impor dibatasi 5 MB.

```sh
npm run validate:data
node tools/validate-data.mjs --export PATH_MASTER PATH_OUTPUT
npm test
npx tsc --noEmit --incremental false
npm run build
```

Kontrak ada di lib/data.mjs. Pemeriksaan meliputi ID unik, kategori/status valid, finite/rentang koordinat, tanggal verifikasi, sumber, URL HTTP/HTTPS, dan pemisahan draft/arsip dari data publik. Kandidat duplikat berdasarkan nama dan kedekatan koordinat diberi peringatan. Build menolak data nonpublik. Data mentah ditampilkan sebagai teks, bukan HTML.

## Jarak, GPS, dan navigasi

Haversine menghasilkan kilometer garis lurus; bukan rute/durasi. Izin lokasi diminta otomatis saat aplikasi dibuka; koordinat hanya digunakan setelah izin diberikan, disimpan di memori sesi, dan dapat dihapus. Izin ditolak, timeout, atau lokasi tidak tersedia tidak mengubah asal yang sudah dipilih. Google Maps menerima tujuan dan, bila dipilih, asal GPS hanya ketika tautan navigasi dibuka. Produksi membutuhkan HTTPS. Titik acuan pintu tol belum diaktifkan karena belum ada koordinat terverifikasi.

## Penyedia peta

Konfigurasi public/map-config.json menggunakan endpoint HTTPS tile OpenStreetMap dengan atribusi terlihat. Browser menangani cache HTTP bawaan. Tidak ada prefetch massal, proxy, service worker, atau unduhan offline. Daftar tetap dapat digunakan saat tile gagal. Penyedia tidak menjamin ketersediaan; pilih penyedia lain sesuai kebutuhan trafik sebelum penggunaan luas. Jangan menghilangkan Referer atau atribusi. Konfigurasi adalah berkas tepercaya yang ditinjau pengelola; atribusi HTML hanya berasal dari konfigurasi, bukan data fasilitas.

Referensi diperiksa 6 September 2026:

- [Leaflet 1.9.4](https://leafletjs.com/reference.html)
- [Kebijakan tile OSM](https://operations.osmfoundation.org/policies/tiles/)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)

## Build dan publikasi

Konfigurasi output export menghasilkan artefak statis. Editor di tools/editor tidak diimpor oleh aplikasi publik dan tidak disertakan pada artefak publik. File master harus disimpan di luar public. Sites menyimpan versi sumber dan artefak; rollback dengan menerbitkan kembali versi yang telah diverifikasi. Untuk hosting statis lain, unggah direktori output publik yang ditunjuk .openai/hosting.json dengan dukungan HTTPS.

## Validasi dan batasan

Tes otomatis mencakup jarak, pencarian/filter, validasi data, isolasi data nonpublik, round trip JSON, dan URL navigasi. Periksa manual GPS di perangkat, keyboard/fokus panel, layar kecil, dan gangguan jaringan sebelum rilis operasional. Tidak ada sesi browser testing otomatis yang diminta pada pembuatan ini.

WebMCP opsional mengekspos search_facilities melalui feature detection. Browser tanpa API tersebut tetap berfungsi. Validasi pada konteks WebMCP yang mendukung belum tersedia, sehingga tidak diklaim terverifikasi.

Belum termasuk data fasilitas nyata, batas resmi kawasan, layanan routing internal, atau admin daring bersama. Untuk admin daring, implementasikan backend, autentikasi dan otorisasi server, audit, backup, serta penanganan konflik sebelum membuka fitur.

### Catatan lingkungan dan dependensi

Build statis berhasil menggunakan Node 22. Node 24 pada mesin ini mengalami crash saat proses prerender ditutup; gunakan Node 22 untuk build. Pemeriksaan audit masih menandai dependensi transitif tooling (termasuk image-size tanpa patch yang tersedia saat pemeriksaan). React dan Vite telah dipatch. Artefak hosting hanya statis, tanpa server functions, image processing, editor, atau runtime backend. Jangan menganggap seluruh dependency tree bebas temuan; evaluasi ulang sebelum menambahkan backend atau membuka server dev ke jaringan.

## Mode 3D

Tombol 2D/3D mempertahankan posisi dan zoom terakhir saat berganti renderer. Peta 2D menggunakan Leaflet sebagai cadangan yang tidak memerlukan WebGL. Mode 3D memuat MapLibre 6.7.0 secara dinamis dan menggunakan style Liberty OpenFreeMap. Worker MapLibre dikemas eksplisit melalui Vite agar tidak merujuk ke path worker yang hilang setelah bundling.

Bangunan menggunakan layer building-3d dan atribut render_height/render_min_height dari penyedia. Tinggi visual mungkin hasil perkiraan, bukan hasil survei; tidak ditampilkan sebagai ukuran terverifikasi. Tidak ada gedung buatan yang ditambahkan. Fokus bangunan tersedia memilih geometri terdekat dari tile yang sudah dimuat, bukan memindai seluruh kawasan. Jika tidak ada bangunan terlihat, pengguna mendapat keterangan untuk memperbesar atau menggeser peta. Jumlah fitur vektor tidak sama dengan jumlah bangunan: sebuah fitur dapat memuat banyak poligon.

Kontrol meliputi zoom, kembali ke kawasan, dan arah utara. Tampilan awal menggunakan 3D dengan kemiringan 45 derajat. Reduced motion meniadakan animasi kamera pemilihan/reset/fokus. Jika inisialisasi WebGL gagal atau konteks grafis hilang, aplikasi kembali ke Leaflet 2D. Kesalahan jaringan dan timeout menyediakan pilihan mencoba lagi atau kembali ke 2D. Editor lokal tetap menggunakan Leaflet.

Sumber: https://openfreemap.org/quick_start/ dan https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/.

Uji fungsional browser menggunakan Edge headless dengan software WebGL pada viewport desktop dan 390×844. Ini memeriksa fungsi render dan tata letak; bukan pengukuran performa GPU/baterai pada ponsel fisik. Data fasilitas masih demonstrasi. Peta 3D belum menyediakan model fotorealistis atau routing internal.

## Lokasi perangkat dan ikon kategori

Aplikasi dibuka dalam 3D 45 derajat. Permintaan geolokasi dilakukan setelah halaman aktif dan tunduk pada izin browser; tidak ada cara melewati izin. Setelah berhasil, peta berpusat pada koordinat perangkat. Penolakan, timeout 10 detik, atau browser tanpa geolokasi tetap menyediakan peta kawasan. Koordinat berada di memori sesi dan dapat dihapus. Ketika pengguna lebih dari 10 km dari pusat kawasan, tombol Ke kawasan MM2100 tersedia. Kembali ke kawasan atau berganti mode tidak langsung dipaksa kembali ke lokasi perangkat; tombol lokasi dapat meminta pemusatan kembali.

Marker menggunakan SVG Lucide bergaya timbul yang tetap menghadap layar di mode 3D: alat makan, kopi (nama/tag kafe), hotel, food court, ATM, medis, dan fasilitas umum. Kategori resto_cafe masih gabungan sesuai kontrak data. Satu record mewakili satu lokasi; food court diwakili satu record dan bukan tenant-tenant fiktif.

Titik dengan jarak layar kurang dari 48 piksel dikelompokkan dan diberi angka. Klik kelompok memperbesar peta; jika tetap bertumpuk pada zoom dekat, popup menyediakan pilihan setiap fasilitas. Filter memengaruhi marker dan kelompok. Pengelompokan hanya untuk keterbacaan, bukan penggabungan record atau perubahan koordinat data asli.

Pengujian browser memakai izin dan koordinat tiruan, termasuk akses luar kawasan, penolakan izin, ikon pada kedua renderer, serta dua lokasi pada koordinat yang sama. Ini bukan pengukuran akurasi GPS perangkat fisik. Data fasilitas produksi tetap kosong dengan mode demonstrasi berlabel jelas.
