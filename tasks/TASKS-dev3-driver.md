# Tugas Dev 3 — Ketersediaan, status order, driver, lokasi live

Branch: `dev3-driver`
Folder utama: `client/src/features/driver/`, `server/src/modules/{availability,orders,drivers,tracking}/`, `server/src/sockets/`

Centang `[x]` saat selesai dan ikutkan perubahan file ini di commit kamu.

## Sprint 0 (setelah PR Dev 1 dan Dev 2 masuk `main`)
- [ ] Socket.IO di server (autentikasi pakai JWT) dan client
- [x] Model `Booking`/`Order` dan enum status di `schema.prisma`

## Ketersediaan & order
- [ ] Engine ketersediaan: stok = jumlah unit tipe X yang bebas di rentang tanggal (tidak disewa, tidak perawatan)
- [ ] API cari ketersediaan untuk halaman pelanggan (dipakai Dev 2)
- [ ] Status order: Menunggu bayar → Dibayar → Dikonfirmasi → Berjalan → Selesai; cabang Kedaluwarsa, Dibatalkan → Refund
- [ ] Admin menugaskan unit (plat) dan driver ke order yang sudah dibayar (halaman di panel admin, koordinasi Dev 1)
- [ ] Notifikasi email perubahan status (Nodemailer)
- [ ] Update status realtime ke pelanggan via Socket.IO

## Driver
- [ ] Pendaftaran driver: data diri, SIM, foto; akun aktif hanya setelah disetujui admin
- [ ] Login driver ditolak jika belum disetujui
- [ ] Panel driver (mobile-first): daftar tugas hari ini, detail tugas, tombol Mulai / Selesai
- [ ] Cek koneksi internet sebelum mulai tugas, tampilkan peringatan jika offline

## Lokasi live
- [ ] Driver wajib izinkan lokasi (Geolocation API) sebelum status "siap jalan"; jika ditolak, tidak bisa mulai tugas
- [ ] Kirim lokasi berkala (mis. tiap 10 detik) via Socket.IO selama tugas berjalan
- [ ] Simpan lokasi terakhir per driver (dan riwayat ringkas per order)
- [ ] Komponen peta Leaflet + OpenStreetMap untuk admin: semua driver aktif, update realtime
- [ ] (Opsional) Pelanggan bisa melihat posisi driver untuk ordernya

## Bergantung pada tim lain
- Model `CarUnit` dan status perawatan dari Dev 1
- Checkout dan pembayaran dari Dev 2 (order masuk status Dibayar)
