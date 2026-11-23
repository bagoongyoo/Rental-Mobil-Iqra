# Rental Mobil Iqra

Website manajemen rental mobil dengan 3 peran: **admin**, **user (pelanggan)**, dan **driver**.
Mobile-first, ringan, dan UI/UX sederhana. Situs acuan: TRAC Astra (car rental).

> Status: kerangka awal (struktur folder + pembagian tugas). Kode aplikasi belum ada.
> Langkah pertama tim ada di bagian [Sprint 0](#sprint-0-urutan-kerja-pertama).

---

## Tech stack

| Bagian | Pilihan |
|---|---|
| Frontend | React + Vite, Tailwind CSS, React Router, TanStack Query, Zustand, React Hook Form + Zod, react-i18next (ID/EN), Leaflet + OpenStreetMap, Recharts |
| Backend | Node.js + Express |
| Database | MySQL 8 + Prisma ORM |
| Realtime | Socket.IO (lokasi live driver, status order) |
| Upload | multer + sharp (foto KTP/SIM dikompres ke WebP, disimpan privat) |
| Auth | JWT, role: `ADMIN`, `CUSTOMER`, `DRIVER` |
| Lainnya | Midtrans Snap (sandbox), Nodemailer, node-cron |

Tidak memakai Next.js dan tidak memakai PostgreSQL.

## Struktur folder

```
Rental-Mobil-Iqra/
├── client/                    # Frontend React + Vite
│   └── src/
│       ├── app/               # router, provider, layout utama        (bersama)
│       ├── components/ui/     # tombol, input, kartu, modal           (bersama)
│       ├── lib/               # api client, helper                    (bersama)
│       ├── locales/id|en/     # file terjemahan                       (Dev 2)
│       └── features/
│           ├── admin/         # halaman admin                         (Dev 1)
│           ├── customer/      # halaman pelanggan                     (Dev 2)
│           └── driver/        # halaman driver                        (Dev 3)
├── server/                    # Backend Express
│   ├── prisma/                # schema.prisma + migrasi               (bersama, lewat PR kecil)
│   └── src/
│       ├── config/ middleware/ utils/                                 (bersama)
│       ├── sockets/           # Socket.IO                             (Dev 3)
│       └── modules/
│           ├── auth/ users/ cars/ finance/ maintenance/               (Dev 1)
│           ├── bookings/ payments/ documents/                         (Dev 2)
│           └── availability/ orders/ drivers/ tracking/               (Dev 3)
├── docs/                      # catatan desain, alur, API
└── tasks/                     # daftar tugas per developer
```

Setiap developer bekerja terutama di folder miliknya, supaya konflik saat merge sedikit.
Folder **bersama** dan `schema.prisma` boleh diubah siapa saja, tapi lewat PR kecil yang terpisah
dan kabari tim dulu.

## Pembagian tim dan branch

| Developer | Branch | Fokus | Daftar tugas |
|---|---|---|---|
| Dev 1 | `dev1-admin` | Auth, panel admin, master data mobil, keuangan, jadwal perawatan | [tasks/TASKS-dev1-admin.md](tasks/TASKS-dev1-admin.md) |
| Dev 2 | `dev2-user` | Alur pelanggan, pemesanan, pembayaran, upload KTP/SIM, i18n, dark mode | [tasks/TASKS-dev2-user.md](tasks/TASKS-dev2-user.md) |
| Dev 3 | `dev3-driver` | Ketersediaan unit, status order, penugasan, panel driver, lokasi live | [tasks/TASKS-dev3-driver.md](tasks/TASKS-dev3-driver.md) |

Nama anggota bisa diisi di sini nanti (misalnya `Dev 1 — Nama (@username-github)`).

---

## Alur kerja Git (wajib dibaca semua anggota)

Tujuannya: **setiap commit tercatat atas nama akun GitHub masing-masing**, jadi kontribusi tiap orang
terlihat jelas di tab *Commits*, *Insights → Contributors*, dan di setiap Pull Request.

### 0. Syarat: jadi collaborator repo

Pemilik repo membuka **Settings → Collaborators → Add people** lalu mengundang username GitHub
setiap anggota. Anggota menerima undangan dari email atau dari
`https://github.com/bagoongyoo/Rental-Mobil-Iqra/invitations`.
Tanpa ini, anggota tidak bisa push ke branch.

### 1. Atur identitas Git di laptop sendiri (sekali saja)

Commit dikaitkan ke akun GitHub berdasarkan **email** commit. Pakai email yang terdaftar di akun
GitHub kamu (atau email `...@users.noreply.github.com` dari **GitHub → Settings → Emails**).

```bash
git config --global user.name  "Nama Kamu"
git config --global user.email "email-yang-terdaftar-di-github@contoh.com"
```

Jangan pakai identitas atau akun orang lain, dan jangan berbagi token/password GitHub.
Kalau email tidak cocok, commit tetap masuk tapi **tidak terhitung** sebagai kontribusi akunmu.

### 2. Clone dan pindah ke branch masing-masing

```bash
git clone https://github.com/bagoongyoo/Rental-Mobil-Iqra.git
cd Rental-Mobil-Iqra

# Dev 1
git switch dev1-admin
# Dev 2
git switch dev2-user
# Dev 3
git switch dev3-driver
```

Saat push pertama, GitHub akan meminta login. Login dengan akun **kamu sendiri**
(lewat browser / Git Credential Manager, atau Personal Access Token milikmu, atau SSH key milikmu).

### 3. Kerja harian

```bash
# ambil perubahan terbaru dari main sebelum mulai kerja
git fetch origin
git merge origin/main          # atau: git rebase origin/main

# ... coding ...

git add .
git commit -m "feat(admin): tambah CRUD tipe mobil"
git push                        # push ke branch kamu sendiri
```

Commit kecil dan sering lebih baik daripada satu commit besar di akhir.

### 4. Gabungkan ke `main` lewat Pull Request

1. Buka repo di GitHub → **Compare & pull request** (atau tab *Pull requests → New*).
2. Base: `main`, compare: branch kamu (misalnya `dev2-user`).
3. Isi deskripsi sesuai template, minta minimal **1 anggota lain** untuk review.
4. Setelah disetujui, merge dengan **Create a merge commit** supaya riwayat commit tiap orang tetap utuh.
5. Setelah merge, anggota lain menjalankan `git fetch origin && git merge origin/main` di branch masing-masing.

Jangan push langsung ke `main`. Disarankan pemilik repo mengaktifkan
**Settings → Branches → Add branch protection rule** untuk `main`
(centang *Require a pull request before merging*).

### Konvensi commit

Format: `tipe(area): deskripsi singkat` dalam bahasa Indonesia atau Inggris, konsisten.

| Tipe | Kapan dipakai |
|---|---|
| `feat` | fitur baru |
| `fix` | perbaikan bug |
| `refactor` | ubah struktur kode tanpa ubah perilaku |
| `style` | tampilan / CSS saja |
| `docs` | dokumentasi |
| `chore` | konfigurasi, dependensi, setup |

Area yang disarankan: `admin`, `finance`, `maintenance`, `customer`, `booking`, `payment`, `docs-upload`,
`i18n`, `driver`, `tracking`, `orders`, `db`, `ui`.

Contoh: `feat(tracking): kirim lokasi driver tiap 10 detik via Socket.IO`

### Kalau terjadi konflik

```bash
git fetch origin
git merge origin/main
# buka file yang konflik, pilih bagian yang benar, hapus tanda <<<<<<< ======= >>>>>>>
git add <file>
git commit
git push
```

Kalau konfliknya di folder milik orang lain atau di `schema.prisma`, tanyakan pemilik foldernya dulu.

---

## Sprint 0: urutan kerja pertama

Supaya tidak bentrok di file konfigurasi, setup awal dibagi begini (langkah 1 dan 2 boleh paralel karena foldernya berbeda):

1. **Dev 1**: inisialisasi `server/` (Express, Prisma, koneksi MySQL, `.env.example`), schema awal
   (`User`, `CarType`, `CarUnit`), auth JWT + middleware role. Buat PR ke `main`.
2. **Dev 2**: inisialisasi `client/` (Vite + React, Tailwind, React Router, react-i18next, toggle tema
   terang/gelap, layout mobile-first, api client di `lib/`). Buat PR ke `main`.
3. **Dev 3**: setelah 1 dan 2 masuk `main`, tambahkan Socket.IO di server dan client, plus model
   `Booking`/`Order` dan status order di schema.

Setelah Sprint 0, ketiga branch berjalan paralel sesuai daftar tugas masing-masing.

## Menjalankan proyek (akan diisi saat Sprint 0)

Rencana perintah setelah kerangka aplikasi ada:

```bash
# backend
cd server
cp .env.example .env      # isi DATABASE_URL MySQL, JWT_SECRET, dll.
npm install
npx prisma migrate dev
npm run dev

# frontend (terminal lain)
cd client
npm install
npm run dev
```

Kebutuhan: Node.js 20 LTS atau lebih baru, MySQL 8, Git.
