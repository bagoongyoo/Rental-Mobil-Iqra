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
| GET | `/dashboard` | admin | ringkasan dashboard |
| GET | `/users?role&q`, PATCH `/users/:id/status` | admin | daftar pengguna, blokir/aktifkan |
| GET/POST/PATCH/DELETE | `/cars/admin/types[/:id]` | admin | CRUD tipe (hapus = nonaktif jika ada riwayat) |
| POST | `/cars/admin/types/:id/image` | admin | foto tipe (WebP), menggantikan foto lama |
| DELETE | `/cars/admin/types/:id/image` | admin | hapus foto tipe (kembali ke foto contoh/ilustrasi) |
| GET/PUT | `/cars/admin/fees` | admin | lihat/ubah biaya layanan & biaya antar unit (berlaku untuk pesanan baru) |
| GET/POST/PATCH/DELETE | `/cars/admin/units[/:id]` | admin | CRUD unit |
| GET | `/orders?status&q`, `/orders/:id` | admin | daftar & detail + opsi unit/driver yang bebas |
| POST | `/orders/:id/assign` | admin | `{ unitId, driverId }` → Dikonfirmasi |
| POST | `/orders/:id/start` / `complete` / `cancel` / `refund` | admin | ubah status |
| GET | `/finance/summary?period&date&type` | admin | total, grafik, per kategori, transaksi |
| GET | `/finance/export?period&date&type` | admin | file CSV |
| GET | `/finance/categories` | admin | daftar kategori |
| POST/DELETE | `/finance/transactions[/:id]` | admin | transaksi manual |
| GET/POST/PATCH | `/maintenance[/:id]` | admin | jadwal perawatan |
| POST | `/maintenance/:id/complete` / `cancel` | admin | selesai (biaya → pengeluaran) / batal |
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
