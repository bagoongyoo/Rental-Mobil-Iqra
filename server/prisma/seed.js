// Data contoh untuk development. Jalankan: npm run db:seed  (aman diulang: data lama dihapus dulu)
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { PRIVATE_STORAGE } from '../src/config/paths.js';
import { generateBookingCode } from '../src/utils/bookingCode.js';
import { computeEndAt, unitPriceFor } from '../src/utils/pricing.js';

const prisma = new PrismaClient();
const DAY = 86400000;
const hash = (p) => bcrypt.hash(p, 10);

/** Jam tertentu (WITA, waktu Palu) pada n hari dari hari ini. */
function atWIB(dayOffset, hour) {
  const now = new Date();
  const wib = new Date(now.getTime() + 8 * 3600000);
  const base = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate(), hour) - 8 * 3600000;
  return new Date(base + dayOffset * DAY);
}

async function placeholderDoc(name, label) {
  const file = `${name}.webp`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="856" height="540"><rect width="100%" height="100%" rx="24" fill="#dbeafe"/><text x="40" y="90" font-size="48" font-family="sans-serif" fill="#1e3a8a">${label}</text><text x="40" y="160" font-size="28" font-family="sans-serif" fill="#334155">CONTOH - BUKAN DOKUMEN ASLI</text><rect x="600" y="200" width="200" height="260" rx="12" fill="#93c5fd"/></svg>`;
  const info = await sharp(Buffer.from(svg)).webp({ quality: 70 }).toFile(path.join(PRIVATE_STORAGE, 'documents', file));
  return { filePath: file, fileSize: info.size };
}

async function main() {
  console.log('Menghapus data lama...');
  await prisma.locationLog.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.maintenance.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.carUnit.deleteMany();
  await prisma.carType.deleteMany();
  await prisma.document.deleteMany();
  await prisma.driverProfile.deleteMany();
  await prisma.user.deleteMany();

  console.log('Membuat akun...');
  const admin = await prisma.user.create({
    data: { name: 'Admin Iqra', email: process.env.SEED_ADMIN_EMAIL || 'admin@iqra.test', phone: '081200000001', passwordHash: await hash(process.env.SEED_ADMIN_PASSWORD || 'admin123'), role: 'ADMIN' },
  });
  const budi = await prisma.user.create({
    data: { name: 'Budi Santoso', email: 'budi@contoh.test', phone: '081234567890', address: 'Jl. Sam Ratulangi No. 12, Besusu Barat, Palu Timur', passwordHash: await hash('user123'), role: 'CUSTOMER' },
  });
  const sari = await prisma.user.create({
    data: { name: 'Sari Wulandari', email: 'sari@contoh.test', phone: '081398765432', passwordHash: await hash('user123'), role: 'CUSTOMER' },
  });
  for (const type of ['KTP', 'SIM']) {
    await prisma.document.create({ data: { userId: budi.id, type, ...(await placeholderDoc(`seed-budi-${type.toLowerCase()}`, `${type} Budi Santoso`)), status: 'APPROVED', reviewedById: admin.id, reviewedAt: new Date() } });
  }
  await prisma.document.create({ data: { userId: sari.id, type: 'KTP', ...(await placeholderDoc('seed-sari-ktp', 'KTP Sari Wulandari')), status: 'PENDING' } });
  await prisma.document.create({ data: { userId: sari.id, type: 'SIM', ...(await placeholderDoc('seed-sari-sim', 'SIM Sari Wulandari')), status: 'PENDING' } });

  const mkDriver = (name, email, lic, status, lat, lng) =>
    prisma.user.create({
      data: {
        name, email, phone: '0857' + Math.floor(10000000 + Math.random() * 89999999), passwordHash: '', role: 'DRIVER', status,
        driverProfile: { create: { licenseNumber: lic, approvedAt: status === 'ACTIVE' ? new Date() : null, lastLat: lat, lastLng: lng, lastSeenAt: lat ? new Date() : null } },
      },
    });
  const pw = await hash('driver123');
  const joko = await mkDriver('Joko Prasetyo', 'joko@contoh.test', 'SIM-A 1234-5678-9012', 'ACTIVE', -0.9003, 119.8779);
  await prisma.driverProfile.update({ where: { userId: joko.id }, data: { isReady: true } }); // sedang bertugas
  const rudi = await mkDriver('Rudi Hartono', 'rudi@contoh.test', 'SIM-A 2345-6789-0123', 'ACTIVE', null, null);
  await mkDriver('Agus Setiawan', 'agus@contoh.test', 'SIM-A 3456-7890-1234', 'PENDING', null, null);
  await prisma.user.updateMany({ where: { role: 'DRIVER' }, data: { passwordHash: pw } });

  console.log('Membuat tipe & unit mobil...');
  const types = [
    { name: 'Avanza 1.5 G', brand: 'Toyota', category: 'MPV', seats: 7, luggage: 2, transmission: 'MANUAL', color: '#94a3b8', priceDriver4h: 350000, priceDriver12h: 550000, priceDaily: 350000, priceMonthly: 7500000, priceYearly: 78000000, description: 'MPV keluarga paling populer, irit dan lega untuk 7 orang.' },
    { name: 'Xpander Ultimate', brand: 'Mitsubishi', category: 'MPV', seats: 7, luggage: 3, transmission: 'AUTOMATIC', color: '#475569', priceDriver4h: 400000, priceDriver12h: 650000, priceDaily: 425000, priceMonthly: 8500000, priceYearly: 90000000, description: 'MPV modern bertransmisi otomatis, kabin senyap dan nyaman.' },
    { name: 'Innova Zenix', brand: 'Toyota', category: 'MPV', seats: 7, luggage: 3, transmission: 'AUTOMATIC', color: '#1e293b', priceDriver4h: 550000, priceDriver12h: 850000, priceDaily: 650000, priceMonthly: 13500000, priceYearly: 145000000, description: 'Pilihan favorit untuk perjalanan bisnis dan keluarga besar.' },
    { name: 'Brio Satya', brand: 'Honda', category: 'HATCHBACK', seats: 5, luggage: 1, transmission: 'AUTOMATIC', color: '#dc2626', priceDriver4h: 275000, priceDriver12h: 425000, priceDaily: 275000, priceMonthly: 5800000, priceYearly: 60000000, description: 'Mungil, lincah di jalan kota, dan hemat bahan bakar.' },
    { name: 'Rush GR Sport', brand: 'Toyota', category: 'SUV', seats: 7, luggage: 2, transmission: 'AUTOMATIC', color: '#f8fafc', priceDriver4h: 450000, priceDriver12h: 700000, priceDaily: 500000, priceMonthly: 10000000, priceYearly: 105000000, description: 'SUV tangguh dengan ground clearance tinggi untuk jalan wisata.' },
    { name: 'Fortuner VRZ', brand: 'Toyota', category: 'SUV', seats: 7, luggage: 3, transmission: 'AUTOMATIC', color: '#0f172a', priceDriver4h: 900000, priceDriver12h: 1400000, priceDaily: 1200000, priceMonthly: null, priceYearly: null, description: 'SUV premium bertenaga diesel, gagah untuk acara penting.' },
    { name: 'Hiace Premio', brand: 'Toyota', category: 'VAN', seats: 14, luggage: 6, transmission: 'MANUAL', color: '#e2e8f0', priceDriver4h: 1100000, priceDriver12h: 1600000, priceDaily: null, priceMonthly: null, priceYearly: null, description: 'Van 14 kursi untuk rombongan, hanya tersedia dengan driver.' },
    { name: 'Alphard 2.5 G', brand: 'Toyota', category: 'PREMIUM', seats: 6, luggage: 3, transmission: 'AUTOMATIC', color: '#111827', priceDriver4h: 1800000, priceDriver12h: 2800000, priceDaily: null, priceMonthly: null, priceYearly: null, description: 'Kenyamanan kelas eksekutif dengan captain seat, khusus dengan driver.' },
  ];
  const createdTypes = [];
  for (const t of types) createdTypes.push(await prisma.carType.create({ data: t }));

  // Semua unit berada di pool Palu, Sulawesi Tengah (plat DN).
  const cities = ['Palu'];
  const colors = ['Putih', 'Hitam', 'Silver', 'Abu-abu'];
  const prefix = { Palu: 'DN' };
  const units = [];
  let n = 1000;
  for (const t of createdTypes) {
    const count = t.category === 'PREMIUM' || t.category === 'VAN' ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const city = cities[i % cities.length];
      n += 37;
      units.push(await prisma.carUnit.create({
        data: { carTypeId: t.id, plate: `${prefix[city]} ${n} ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(75 + (n % 10))}`, year: 2021 + (i % 4), color: colors[i % colors.length], city, odometer: 12000 + n * 9 },
      }));
    }
  }

  console.log('Membuat pesanan contoh...');
  const avanza = createdTypes[0];
  const innova = createdTypes[2];
  const brio = createdTypes[3];
  const unitOf = (type, city) => units.find((u) => u.carTypeId === type.id && u.city === city);
  async function booking(customer, type, pkg, qty, startAt, status, extra = {}) {
    const unitPrice = unitPriceFor(type, pkg);
    const service = pkg.startsWith('HOURS') ? 'WITH_DRIVER' : 'SELF_DRIVE';
    return prisma.booking.create({
      data: {
        code: generateBookingCode(), customerId: customer.id, carTypeId: type.id, service, package: pkg, quantity: qty, city: 'Palu',
        pickupAddress: 'Bandara Mutiara SIS Al-Jufri, Palu', startAt, endAt: computeEndAt(pkg, startAt, qty), unitPrice, totalPrice: unitPrice * qty, status,
        paidAt: ['PAID', 'CONFIRMED', 'ONGOING', 'COMPLETED'].includes(status) ? new Date(startAt.getTime() - 2 * DAY) : null,
        expiresAt: new Date(Date.now() + 3600000),
        ...extra,
      },
    });
  }
  const b1 = await booking(budi, innova, 'HOURS_12', 2, atWIB(-1, 8), 'ONGOING', { unitId: unitOf(innova, 'Palu').id, driverId: joko.id, startedAt: atWIB(-1, 8) });
  const b2 = await booking(budi, avanza, 'DAILY', 3, atWIB(3, 9), 'PAID');
  const b3 = await booking(sari, avanza, 'HOURS_4', 1, atWIB(2, 13), 'CONFIRMED', { unitId: units.filter((u) => u.carTypeId === avanza.id && u.city === 'Palu')[1].id, driverId: rudi.id });
  await booking(sari, brio, 'HOURS_12', 1, atWIB(5, 7), 'PENDING_PAYMENT');
  const done = await booking(budi, brio, 'DAILY', 2, atWIB(-10, 9), 'COMPLETED', { unitId: unitOf(brio, 'Palu').id, completedAt: atWIB(-8, 9) });

  console.log('Membuat transaksi keuangan 12 bulan terakhir...');
  const txns = [];
  for (const b of [b1, b2, b3, done]) {
    txns.push({ type: 'INCOME', category: b.service === 'WITH_DRIVER' ? 'Sewa dengan driver' : 'Sewa lepas kunci', amount: b.totalPrice, date: b.paidAt, note: `Pembayaran ${b.code}`, bookingId: b.id, isAuto: true });
  }
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let d = 365; d >= 1; d--) {
    const date = atWIB(-d, 10);
    const orders = Math.floor(rand() * 4);
    for (let i = 0; i < orders; i++) {
      const withDriver = rand() > 0.45;
      txns.push({ type: 'INCOME', category: withDriver ? 'Sewa dengan driver' : 'Sewa lepas kunci', amount: Math.round((300000 + rand() * 1500000) / 25000) * 25000, date, note: 'Data contoh', isAuto: false, createdById: admin.id });
    }
    if (rand() > 0.55) txns.push({ type: 'EXPENSE', category: 'BBM', amount: Math.round((100000 + rand() * 400000) / 5000) * 5000, date, note: 'Data contoh', createdById: admin.id });
    if (date.getUTCDate() === 25) txns.push({ type: 'EXPENSE', category: 'Gaji driver', amount: 9000000, date, note: 'Gaji bulanan driver', createdById: admin.id });
    if (rand() > 0.93) txns.push({ type: 'EXPENSE', category: 'Cuci mobil', amount: 150000, date, createdById: admin.id });
  }
  await prisma.transaction.createMany({ data: txns });

  console.log('Membuat jadwal perawatan...');
  const m1 = await prisma.maintenance.create({
    data: { unitId: units[1].id, serviceType: 'Servis berkala 40.000 km', startDate: atWIB(-20, 0), endDate: atWIB(-19, 0), estimatedCost: 1500000, actualCost: 1350000, workshop: 'Bengkel Resmi Palu', status: 'DONE', doneAt: atWIB(-19, 0) },
  });
  await prisma.transaction.create({ data: { type: 'EXPENSE', category: 'Perawatan', amount: 1350000, date: atWIB(-19, 10), note: `Servis berkala 40.000 km - ${units[1].plate}`, maintenanceId: m1.id, isAuto: true, createdById: admin.id } });
  await prisma.maintenance.create({ data: { unitId: units[5].id, serviceType: 'Ganti oli & filter', startDate: atWIB(1, 0), endDate: atWIB(2, 0), estimatedCost: 650000, workshop: 'Bengkel Resmi Palu' } });
  await prisma.maintenance.create({ data: { unitId: units[9].id, serviceType: 'Ganti ban 4 roda', startDate: atWIB(4, 0), endDate: atWIB(5, 0), estimatedCost: 3200000 } });

  console.log('\nSelesai. Akun contoh:');
  console.log('  admin  : admin@iqra.test / admin123');
  console.log('  user   : budi@contoh.test / user123 (KTP+SIM disetujui), sari@contoh.test / user123 (dokumen menunggu)');
  console.log('  driver : joko@contoh.test / driver123, rudi@contoh.test / driver123, agus@contoh.test (belum disetujui)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
