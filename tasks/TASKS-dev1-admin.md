# Tugas Dev 1 — Admin, master data, keuangan

Branch: `dev1-admin`
Folder utama: `client/src/features/admin/`, `server/src/modules/{auth,users,cars,finance,maintenance}/`

Centang `[x]` saat selesai dan ikutkan perubahan file ini di commit kamu.

## Sprint 0 (dikerjakan pertama, PR ke `main`)
- [x] Inisialisasi `server/`: Express, struktur `src/`, `npm run dev` (nodemon), `.env.example` (dikerjakan Dev 3, PR #2)
- [x] Prisma + MySQL: koneksi, schema awal `User` (role `ADMIN`/`CUSTOMER`/`DRIVER`), `CarType`, `CarUnit` (schema dari Dev 3, migrasi `init` oleh Dev 1)
- [x] Auth: register, login, JWT, middleware `requireAuth` + `requireRole` (middleware dari Dev 3)
- [x] Seed akun admin pertama (`npm run seed`)

## Panel admin
- [ ] Layout admin (sidebar/bottom-nav untuk HP), dashboard ringkas: order hari ini, unit tersedia, pemasukan bulan ini
- [ ] CRUD tipe mobil (nama, kapasitas, transmisi, foto, harga per paket: 4 jam / 12 jam dengan driver, harian / bulanan / tahunan lepas kunci) — API selesai (`/api/cars/types`), halaman admin menyusul
- [ ] CRUD unit mobil (plat nomor, tipe, tahun, warna, status: tersedia / disewa / perawatan) — API selesai (`/api/cars/units`), halaman admin menyusul
- [x] Biaya tambahan diatur admin: biaya layanan (semua pesanan) + biaya antar unit (lepas kunci), `GET/PUT /api/cars/admin/fees`
- [x] Ganti / hapus foto tipe, lanjut unggah foto setelah tipe baru disimpan, label "Foto contoh"
- [ ] Manajemen pengguna: daftar pelanggan dan driver, blokir/aktifkan akun
- [x] Tab "Akun terhapus" (email asli, alasan, jumlah pesanan/dokumen) + tanda "Pernah hapus akun" pada pelanggan dengan email/HP sama

## Keuangan
- [ ] Model `Transaction` (jenis: pemasukan / pengeluaran, kategori, nominal, tanggal, relasi ke order atau perawatan)
- [ ] Pemasukan otomatis tercatat saat pembayaran order berhasil (koordinasi dengan Dev 2)
- [ ] Input pengeluaran manual (BBM, gaji driver, pajak, dll.)
- [ ] Laporan per hari / minggu / bulan / tahun, grafik (Recharts) + total laba
- [ ] Ekspor CSV sesuai filter periode

## Jadwal perawatan mobil
- [ ] Model `Maintenance` (unit, jenis servis, tanggal jadwal, biaya, status)
- [ ] Kalender/daftar jadwal perawatan per unit
- [ ] Saat perawatan ditandai selesai, biaya otomatis masuk sebagai pengeluaran di keuangan
- [ ] Unit yang sedang perawatan tidak bisa dipesan (koordinasi dengan Dev 3 di availability)
- [ ] Pengingat jadwal servis (node-cron) di dashboard admin

## Bergantung pada tim lain
- Verifikasi KTP/SIM dan persetujuan driver: halaman admin-nya kamu, API dokumen dari Dev 2, API driver dari Dev 3
- Peta live driver di admin: komponen dari Dev 3, ditempel di dashboard admin
