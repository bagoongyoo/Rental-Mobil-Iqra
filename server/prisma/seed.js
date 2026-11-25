// Seed akun admin pertama (Dev 1).
// Jalankan: npx prisma db seed
// Kredensial bisa diatur lewat .env: SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
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

main()
  .catch((err) => {
    console.error('Seed gagal:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
