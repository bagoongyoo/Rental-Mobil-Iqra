// Dokumen KTP/SIM pelanggan (Dev 2).
// File dikompres di browser, lalu di server diubah ke WebP (sharp) dan disimpan privat di storage/.
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');
const prisma = require('../../config/db');

const DOC_DIR = path.join(__dirname, '../../../storage/documents');
const PUBLIC_FIELDS = { id: true, type: true, status: true, rejectionReason: true, verifiedAt: true, updatedAt: true };

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function listMine(userId) {
  return prisma.userDocument.findMany({
    where: { userId, type: { in: ['KTP', 'SIM'] } },
    select: PUBLIC_FIELDS,
  });
}

async function upload(userId, type, buffer) {
  if (!buffer) throw httpError(400, 'Foto dokumen wajib diisi.');
  const existing = await prisma.userDocument.findFirst({ where: { userId, type }, orderBy: { id: 'desc' } });
  if (existing?.status === 'APPROVED') throw httpError(400, 'Dokumen ini sudah disetujui.');

  await fs.mkdir(DOC_DIR, { recursive: true });
  const fileName = `${userId}-${type.toLowerCase()}-${Date.now()}.webp`;
  try {
    await sharp(buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toFile(path.join(DOC_DIR, fileName));
  } catch {
    throw httpError(400, 'File bukan gambar yang valid.');
  }

  const data = { filePath: fileName, status: 'PENDING', rejectionReason: null, verifiedAt: null };
  const document = existing
    ? await prisma.userDocument.update({ where: { id: existing.id }, data, select: PUBLIC_FIELDS })
    : await prisma.userDocument.create({ data: { userId, type, ...data }, select: PUBLIC_FIELDS });

  if (existing?.filePath) await fs.rm(path.join(DOC_DIR, path.basename(existing.filePath)), { force: true });
  return document;
}

/** Path file di disk. Hanya pemilik dokumen atau admin yang boleh melihat. */
async function getFilePath(user, id) {
  const doc = await prisma.userDocument.findUnique({ where: { id: Number(id) } });
  if (!doc) throw httpError(404, 'Dokumen tidak ditemukan.');
  if (user.role !== 'ADMIN' && doc.userId !== user.id) throw httpError(403, 'Anda tidak memiliki akses ke dokumen ini.');
  return path.join(DOC_DIR, path.basename(doc.filePath));
}

// ---------- Admin (halaman verifikasi dibuat Dev 1) ----------

function listForAdmin(status = 'PENDING') {
  return prisma.userDocument.findMany({
    where: { type: { in: ['KTP', 'SIM'] }, ...(status === 'ALL' ? {} : { status }) },
    select: { ...PUBLIC_FIELDS, user: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { updatedAt: 'asc' },
  });
}

function review(id, { status, rejectionReason }) {
  return prisma.userDocument.update({
    where: { id: Number(id) },
    data: {
      status,
      rejectionReason: status === 'REJECTED' ? rejectionReason : null,
      verifiedAt: new Date(),
    },
    select: { ...PUBLIC_FIELDS, userId: true },
  });
}

module.exports = { listMine, upload, getFilePath, listForAdmin, review };
