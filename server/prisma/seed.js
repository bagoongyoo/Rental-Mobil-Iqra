// Seed akun awal (Dev 1): admin pertama + satu akun driver contoh untuk pengembangan modul driver (Dev 3).
// Jalankan: npm run seed (atau npx prisma db seed)
// Kredensial bisa diatur lewat .env:
//   SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
//   SEED_DRIVER_NAME, SEED_DRIVER_EMAIL, SEED_DRIVER_PASSWORD, SEED_DRIVER_PHONE, SEED_DRIVER_LICENSE
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedAdmin() {
  const name = process.env.SEED_ADMIN_NAME || 'Admin Iqra';
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@rentalmobiliqra.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin12345';

  // upsert: aman dijalankan berulang, tidak membuat admin ganda dan tidak menimpa password lama.
  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', isActive: true, isApproved: true },
    create: {
      name,
      email,
      password: await bcrypt.hash(password, 10),
      role: 'ADMIN',
      isActive: true,
      isApproved: true,
    },
  });

  console.log(`✔ Akun admin siap: ${admin.email} (id ${admin.id})`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log('  Password default dipakai (admin12345). Ganti lewat SEED_ADMIN_PASSWORD di .env.');
  }
}

// Driver contoh yang sudah disetujui, supaya Dev 3 bisa langsung login di /driver
// tanpa menunggu halaman persetujuan driver di panel admin.
async function seedDriver() {
  const name = process.env.SEED_DRIVER_NAME || 'Driver Contoh';
  const email = (process.env.SEED_DRIVER_EMAIL || 'driver@rentalmobiliqra.com').toLowerCase();
  const password = process.env.SEED_DRIVER_PASSWORD || 'driver12345';
  const phone = process.env.SEED_DRIVER_PHONE || '081200000001';
  const licenseNumber = process.env.SEED_DRIVER_LICENSE || 'SIM-A-0000000001';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== 'DRIVER') {
    console.log(`! Email ${email} sudah dipakai akun ${existing.role}, seed driver dilewati.`);
    return;
  }

  // upsert: aman dijalankan berulang, password lama tidak ditimpa.
  const driver = await prisma.user.upsert({
    where: { email },
    update: {
      isActive: true,
      isApproved: true,
      driverProfile: {
        upsert: {
          create: { licenseNumber, approvalStatus: 'APPROVED' },
          update: { approvalStatus: 'APPROVED' },
        },
      },
    },
    create: {
      name,
      email,
      phone,
      password: await bcrypt.hash(password, 10),
      role: 'DRIVER',
      isActive: true,
      isApproved: true,
      driverProfile: { create: { licenseNumber, approvalStatus: 'APPROVED' } },
    },
  });

  console.log(`✔ Akun driver contoh siap: ${driver.email} (id ${driver.id})`);
  if (!process.env.SEED_DRIVER_PASSWORD) {
    console.log('  Password default dipakai (driver12345). Ganti lewat SEED_DRIVER_PASSWORD di .env.');
  }
}

async function main() {
  await seedAdmin();
  await seedDriver();
}

main()
  .catch((err) => {
    console.error('Seed gagal:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
