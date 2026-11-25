# Tugas Dev 2 — Pelanggan, pemesanan, pembayaran

Branch: `dev2-user`
Folder utama: `client/src/features/customer/`, `client/src/locales/`, `server/src/modules/{bookings,payments,documents}/`

Centang `[x]` saat selesai dan ikutkan perubahan file ini di commit kamu.

## Sprint 0 (paralel dengan Dev 1, PR ke `main`)
- [ ] Inisialisasi `client/`: Vite + React, Tailwind, React Router, TanStack Query, Zustand
- [ ] Layout mobile-first (header + bottom navigation), komponen dasar di `components/ui/`
- [ ] react-i18next: bahasa Indonesia (default) dan Inggris, tombol ganti bahasa
- [ ] Tema terang/gelap (Tailwind `dark:`), disimpan di localStorage, ikut preferensi sistem
- [ ] API client di `lib/` (base URL dari env, sisipkan token JWT)

## Akun pelanggan
- [ ] Halaman daftar dan masuk (pakai API auth Dev 1)
- [ ] Profil: nama, no. HP, alamat
- [ ] Upload KTP dan SIM: kompres di browser sebelum kirim, server ubah ke WebP (sharp), simpan privat, path di DB
- [ ] Status verifikasi dokumen: menunggu / disetujui / ditolak (+ alasan), disetujui oleh admin

## Pemesanan
- [ ] Beranda: pilih layanan **dengan driver** (paket 4 / 12 jam) atau **lepas kunci** (harian / bulanan / tahunan)
- [ ] Form cari: kota/lokasi jemput, tanggal & jam mulai, durasi
- [ ] Daftar tipe mobil yang tersedia + harga (pakai API availability Dev 3)
- [ ] Detail & checkout: ringkasan harga, data pemesan, catatan
- [ ] Lepas kunci hanya bisa dipesan jika KTP + SIM sudah disetujui admin
- [ ] Riwayat pesanan + detail status (status dari Dev 3)
- [ ] Batalkan pesanan sesuai aturan

## Pembayaran
- [ ] Midtrans Snap (sandbox): buat transaksi, buka popup bayar
- [ ] Webhook notifikasi Midtrans: ubah status jadi Dibayar, catat pemasukan (koordinasi Dev 1)
- [ ] Batas waktu bayar, order kedaluwarsa otomatis
- [ ] Halaman sukses / gagal / menunggu pembayaran

## Bergantung pada tim lain
- Auth dan model user dari Dev 1
- Ketersediaan unit dan status order dari Dev 3
- Semua teks UI masuk file `locales/` (tim lain menambah key, kamu yang merapikan)

## Dashboard pelanggan (`/dasbor`)
- [x] API ringkasan `GET /api/bookings/dashboard` (sewa berjalan, jadwal terdekat, tagihan, dokumen, statistik)
- [x] Halaman dashboard: sapaan, statistik, tagihan + hitung mundur, sewa berjalan (progres, driver, lacak), jadwal berikutnya
- [x] Pesan cepat (dengan driver / lepas kunci, pesan lagi mobil terakhir), pesanan terakhir
- [x] Status verifikasi KTP/SIM, kelengkapan profil, tombol WhatsApp admin
- [x] Menu Dasbor di navigasi, pelanggan diarahkan ke `/dasbor` setelah masuk/daftar
- [x] Lokasi Palu, Sulawesi Tengah: kota default, titik jemput populer di checkout, teks beranda, zona waktu WITA

## Foto mobil & lokasi akurat
- [x] Foto contoh bawaan per model (Wikimedia Commons, WebP 800/400 px) di `client/public/cars/`, halaman `/kredit-foto`
- [x] Checkout: lokasi akurat (GPS "Gunakan lokasi saya" + pin di peta yang bisa digeser) atau alamat manual
- [x] Alamat terisi otomatis dari titik peta (OpenStreetMap Nominatim), tetap bisa diedit + patokan
- [x] Simpan `pickupLat`/`pickupLng` di pesanan, validasi area layanan Palu (maks. 150 km)
- [x] Tampilkan titik di detail pesanan pelanggan, admin (link Google Maps), driver (navigasi ke koordinat)
