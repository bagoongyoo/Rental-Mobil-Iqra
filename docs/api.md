# Daftar endpoint API

Base URL: `/api`. Auth memakai header `Authorization: Bearer <token>` (dari `/auth/login`).
Error selalu berbentuk `{ "message": "...", "details": { "field": "pesan" } }`.

| Method | Path | Peran | Keterangan |
|---|---|---|---|
| GET | `/health` | publik | cek koneksi (dipakai panel driver) |
| POST | `/auth/register` | publik | daftar pelanggan |
| POST | `/auth/register-driver` | publik | daftar driver (status PENDING) |
| POST | `/auth/login` | publik | `{ email, password }` → `{ token, user }` |
| GET/PATCH | `/auth/me` | login | profil sendiri |
| GET | `/cars/cities` | publik | kota yang punya unit aktif |
| GET | `/cars/types`, `/cars/types/:id` | publik | tipe mobil aktif + harga |
| GET | `/cars/fees` | publik | biaya tambahan `{ serviceFee, deliveryFee }` (antar unit hanya lepas kunci) |
| GET | `/availability/search?service&package&city&startAt&quantity` | publik | stok per tipe di jadwal itu |
| POST | `/bookings` | pelanggan | buat pesanan (cek stok, cek KTP/SIM untuk lepas kunci). Opsional `pickupLat`/`pickupLng` (titik akurat, maks. 150 km dari Palu) |
| GET | `/bookings`, `/bookings/:id` | pelanggan | pesanan sendiri |
| GET | `/bookings/dashboard` | pelanggan | ringkasan dashboard: sewa berjalan, jadwal terdekat, tagihan, dokumen, statistik |
| POST | `/bookings/:id/cancel` | pelanggan | batalkan |
| POST | `/payments/:bookingId/pay` | pelanggan | simulasi atau token Midtrans Snap |
| POST | `/payments/:bookingId/simulate-success` | pelanggan | hanya `PAYMENT_MODE=simulate` |
| POST | `/payments/midtrans/notify` | Midtrans | webhook (cek signature SHA512) |
| GET | `/documents/mine` | login | status KTP/SIM sendiri |
| POST | `/documents` | login | multipart `type`, `file` → WebP privat |
| GET | `/documents/:id/file` | pemilik/admin | gambar dokumen |
| GET | `/documents?status=PENDING` | admin | antrian verifikasi |
| PATCH | `/documents/:id/review` | admin | `{ status: APPROVED/REJECTED, rejectReason }` |
| GET | `/dashboard` | admin | ringkasan: `todo` (perlu ditugaskan, dokumen, driver), `stats`, `month` (pemasukan/pengeluaran/laba), `latestOrders`, `serviceReminders` |
| GET | `/users?role=CUSTOMER\|DRIVER&q` | admin | daftar pengguna + status dokumen + jumlah pesanan |
| PATCH | `/users/:id/status` | admin | `{ isActive }` blokir/aktifkan (admin tidak bisa diblokir) |
| POST/PUT/DELETE | `/cars/types[/:id]` | admin | CRUD tipe + harga per paket (hapus ditolak jika masih punya unit/riwayat pesanan) |
| POST/DELETE | `/cars/types/:id/photo` | admin | multipart `photo` → WebP, menggantikan foto lama / hapus foto |
| GET/POST/PUT/DELETE | `/cars/units[/:id]` | admin | CRUD unit (plat `DN 1234 AB`), `?carTypeId&status&q` |
| PATCH | `/cars/units/:id/status` | admin | `{ status: AVAILABLE\|RENTED\|MAINTENANCE }` |
| GET | `/orders?status&q`, `/orders/:id` | admin | daftar & detail + opsi unit/driver yang bebas |
| POST | `/orders/:id/assign` | admin | `{ unitId, driverId }` → Dikonfirmasi |
| POST | `/orders/:id/start` / `complete` / `cancel` / `refund` | admin | ubah status |
| GET | `/finance/summary?period=day\|week\|month\|year&date=YYYY-MM-DD&type` | admin | total, data grafik (per 3 jam / hari / bulan), per kategori, transaksi. Batas hari memakai WITA |
| GET | `/finance/export?period&date&type` | admin | file CSV (UTF-8 + BOM, ada baris total) |
| GET | `/finance/categories` | admin | `{ INCOME: [...], EXPENSE: [...] }` |
| POST | `/finance/transactions` | admin | `{ type, category, amount, description?, transactionDate? }` transaksi manual |
| DELETE | `/finance/transactions/:id` | admin | hanya transaksi manual (otomatis dari pesanan/perawatan ditolak) |
| GET | `/maintenance?status&carUnitId`, `/maintenance/upcoming?days=7`, `/maintenance/:id` | admin | jadwal servis (+ `isOverdue`) |
| POST | `/maintenance` | admin | `{ carUnitId, serviceType, scheduledDate: YYYY-MM-DD, cost?, notes? }` (ditolak jika unit sudah ditugaskan ke pesanan di tanggal itu) |
| PATCH | `/maintenance/:id` | admin | ubah jadwal yang masih terbuka |
| POST | `/maintenance/:id/start` | admin | mulai servis → unit `MAINTENANCE` |
| POST | `/maintenance/:id/complete` | admin | `{ cost, completedDate?, notes?, nextInMonths? }` → biaya dicatat pengeluaran "Perawatan", unit kembali `AVAILABLE`, opsional buat jadwal berkala berikutnya |
| POST | `/maintenance/:id/cancel` | admin | batal |
| GET | `/drivers` | admin | semua driver |
| POST | `/drivers/:id/approve` / `reject` | admin | persetujuan driver |
| GET | `/drivers/me` | driver | profil, tugas aktif, riwayat |
| POST | `/drivers/me/ready` | driver | `{ ready, lat, lng }` (lat/lng wajib saat ready) |
| POST | `/drivers/me/tasks/:id/start` / `finish` | driver | mulai / selesai tugas |
| GET | `/tracking/drivers` | admin | posisi terakhir semua driver |
| GET | `/tracking/bookings/:id` | admin/pemilik | posisi driver + jejak order |

## Socket.IO

Koneksi: `io(URL, { auth: { token } })`.

| Event | Arah | Isi |
|---|---|---|
| `driver:location` | driver → server | `{ lat, lng, accuracy }` (tiap 10 detik) |
| `driver:location` | server → admin, pelanggan order itu | `{ driverId, name, lat, lng, at, booking }` |
| `driver:status` | server → admin | driver mengubah status siap jalan |
| `driver:offline` | server → admin | koneksi driver putus |
| `booking:updated` | server → pelanggan, driver, admin | `{ id, code, status }` |

## Alur status order

```
PENDING_PAYMENT -> PAID -> CONFIRMED -> ONGOING -> COMPLETED
      |              |          |
      v              v          v
   EXPIRED       CANCELLED -> REFUNDED
   CANCELLED
```
Semua perubahan status lewat `server/src/modules/orders/orders.service.js`.

Keuangan otomatis: pembayaran lunas → pemasukan "Sewa Mobil"; status `REFUNDED` → pengeluaran "Refund" (sekali per pesanan); perawatan selesai → pengeluaran "Perawatan".

## Akun pelanggan (`/api/account`, Dev 2)

| Metode | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/account/otp-channels` | publik | mode saluran kode (simulasi atau asli) |
| POST | `/account/forgot-password/otp` | publik | `{ email, channel: EMAIL\|WHATSAPP }`, jawaban selalu sama agar email tidak bisa ditebak |
| POST | `/account/forgot-password/reset` | publik | `{ email, code, newPassword }` |
| POST | `/account/password/otp` | login | kirim kode ganti kata sandi `{ channel }` |
| POST | `/account/password` | login | `{ code, newPassword }`, balas token baru (token lama di perangkat lain tidak berlaku) |
| GET | `/account/delete-check` | pelanggan | `{ canDelete, blocking[], pendingPayment }` |
| DELETE | `/account` | pelanggan | `{ password, confirm: "HAPUS", reason? }`, soft delete |

Admin: `GET /api/users?role=CUSTOMER&deleted=1` daftar akun terhapus; daftar biasa berisi `previousDeletedId` jika email/HP sama dengan akun yang pernah dihapus.
Kode: 6 angka, berlaku 10 menit, maks. 5x salah, kirim ulang tiap 60 detik, maks. 5 kode per jam. Saat mode simulasi (di luar production) respons berisi `devCode`.
