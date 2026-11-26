// Master data mobil (Dev 1): tipe mobil, foto tipe, dan unit fisik.
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');
const prisma = require('../../config/db');

// Foto tipe mobil bersifat publik, disimpan di storage/cars (folder storage/ tidak di-commit).
const PHOTO_DIR = path.join(__dirname, '../../../storage/cars');
const PHOTO_URL_PREFIX = '/api/cars/photos/';

// Order yang masih berjalan: unit/tipe tidak boleh dihapus atau diubah sembarangan.
const ACTIVE_ORDER_STATUSES = ['WAITING_PAYMENT', 'PAID', 'CONFIRMED', 'ONGOING'];

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function toId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, `ID ${label} tidak valid.`);
  return id;
}

function isUniqueError(err) {
  return err?.code === 'P2002';
}

// ---------- Tipe mobil ----------

/** Daftar tipe beserta jumlah unit per status. */
async function listCarTypes() {
  const [types, counts] = await Promise.all([
    prisma.carType.findMany({ orderBy: { name: 'asc' } }),
    prisma.carUnit.groupBy({ by: ['carTypeId', 'status'], _count: { _all: true } }),
  ]);

  return types.map((t) => {
    const unitCount = { total: 0, AVAILABLE: 0, RENTED: 0, MAINTENANCE: 0 };
    for (const c of counts) {
      if (c.carTypeId !== t.id) continue;
      unitCount[c.status] = c._count._all;
      unitCount.total += c._count._all;
    }
    return { ...t, unitCount };
  });
}

async function getCarType(idParam) {
  const id = toId(idParam, 'tipe');
  const type = await prisma.carType.findUnique({
    where: { id },
    include: { units: { orderBy: { plateNumber: 'asc' } } },
  });
  if (!type) throw httpError(404, 'Tipe mobil tidak ditemukan.');
  return type;
}

function createCarType(data) {
  return prisma.carType.create({ data });
}

async function updateCarType(idParam, data) {
  const id = toId(idParam, 'tipe');
  await getCarType(id);
  return prisma.carType.update({ where: { id }, data });
}

async function deleteCarType(idParam) {
  const id = toId(idParam, 'tipe');
  const type = await getCarType(id);

  // Riwayat order harus tetap utuh untuk laporan keuangan, jadi tipe yang pernah dipesan tidak dihapus.
  const orderCount = await prisma.order.count({ where: { carTypeId: id } });
  if (orderCount > 0) {
    throw httpError(409, `Tipe ini sudah dipakai di ${orderCount} pesanan, tidak bisa dihapus.`);
  }
  if (type.units.length > 0) {
    throw httpError(409, `Hapus dulu ${type.units.length} unit milik tipe ini.`);
  }

  await prisma.carType.delete({ where: { id } });
  await removePhotoFile(type.photoUrl);
}

// ---------- Foto tipe ----------

async function removePhotoFile(photoUrl) {
  if (!photoUrl || !photoUrl.startsWith(PHOTO_URL_PREFIX)) return;
  await fs.rm(path.join(PHOTO_DIR, path.basename(photoUrl)), { force: true });
}

async function setCarTypePhoto(idParam, buffer) {
  const id = toId(idParam, 'tipe');
  if (!buffer) throw httpError(400, 'File foto wajib diisi (gambar, maks. 5 MB).');
  const type = await getCarType(id);

  await fs.mkdir(PHOTO_DIR, { recursive: true });
  const fileName = `type-${id}-${Date.now()}.webp`;
  try {
    await sharp(buffer)
      .rotate()
      .resize({ width: 1200, height: 800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(path.join(PHOTO_DIR, fileName));
  } catch {
    throw httpError(400, 'File bukan gambar yang valid.');
  }

  const updated = await prisma.carType.update({
    where: { id },
    data: { photoUrl: PHOTO_URL_PREFIX + fileName },
  });
  await removePhotoFile(type.photoUrl);
  return updated;
}

async function deleteCarTypePhoto(idParam) {
  const id = toId(idParam, 'tipe');
  const type = await getCarType(id);
  const updated = await prisma.carType.update({ where: { id }, data: { photoUrl: null } });
  await removePhotoFile(type.photoUrl);
  return updated;
}

/** Path file foto di disk, untuk GET /api/cars/photos/:file. */
async function getPhotoPath(fileParam) {
  const fileName = path.basename(String(fileParam));
  if (!/^type-\d+-\d+\.webp$/.test(fileName)) throw httpError(404, 'Foto tidak ditemukan.');
  const filePath = path.join(PHOTO_DIR, fileName);
  try {
    await fs.access(filePath);
  } catch {
    throw httpError(404, 'Foto tidak ditemukan.');
  }
  return filePath;
}

// ---------- Unit mobil ----------

const UNIT_INCLUDE = { carType: { select: { id: true, name: true, transmission: true, capacity: true } } };

function listCarUnits({ carTypeId, status, q } = {}) {
  return prisma.carUnit.findMany({
    where: {
      ...(carTypeId && { carTypeId }),
      ...(status && { status }),
      ...(q && { plateNumber: { contains: q.toUpperCase() } }),
    },
    include: UNIT_INCLUDE,
    orderBy: [{ carTypeId: 'asc' }, { plateNumber: 'asc' }],
  });
}

async function getCarUnit(idParam) {
  const id = toId(idParam, 'unit');
  const unit = await prisma.carUnit.findUnique({ where: { id }, include: UNIT_INCLUDE });
  if (!unit) throw httpError(404, 'Unit mobil tidak ditemukan.');
  return unit;
}

async function assertCarTypeExists(carTypeId) {
  const exists = await prisma.carType.findUnique({ where: { id: carTypeId }, select: { id: true } });
  if (!exists) throw httpError(400, 'Tipe mobil tidak ditemukan.');
}

async function activeOrderCount(carUnitId) {
  return prisma.order.count({ where: { carUnitId, status: { in: ACTIVE_ORDER_STATUSES } } });
}

async function createCarUnit(data) {
  await assertCarTypeExists(data.carTypeId);
  try {
    return await prisma.carUnit.create({ data, include: UNIT_INCLUDE });
  } catch (err) {
    if (isUniqueError(err)) throw httpError(409, `Plat nomor ${data.plateNumber} sudah terdaftar.`);
    throw err;
  }
}

async function updateCarUnit(idParam, data) {
  const unit = await getCarUnit(idParam);
  if (data.carTypeId && data.carTypeId !== unit.carTypeId) {
    await assertCarTypeExists(data.carTypeId);
    if (await activeOrderCount(unit.id)) {
      throw httpError(409, 'Unit sedang dipakai pesanan aktif, tipe tidak bisa diganti.');
    }
  }
  if (data.status) await assertStatusChangeAllowed(unit, data.status);

  try {
    return await prisma.carUnit.update({ where: { id: unit.id }, data, include: UNIT_INCLUDE });
  } catch (err) {
    if (isUniqueError(err)) throw httpError(409, `Plat nomor ${data.plateNumber} sudah terdaftar.`);
    throw err;
  }
}

/** Unit yang sedang dipakai pesanan berjalan tidak boleh diubah ke perawatan/tersedia secara manual. */
async function assertStatusChangeAllowed(unit, nextStatus) {
  if (unit.status === nextStatus) return;
  const ongoing = await prisma.order.count({ where: { carUnitId: unit.id, status: 'ONGOING' } });
  if (ongoing > 0) {
    throw httpError(409, 'Unit sedang disewa (pesanan berjalan). Status akan berubah otomatis setelah pesanan selesai.');
  }
}

async function setCarUnitStatus(idParam, status) {
  const unit = await getCarUnit(idParam);
  await assertStatusChangeAllowed(unit, status);
  return prisma.carUnit.update({ where: { id: unit.id }, data: { status }, include: UNIT_INCLUDE });
}

async function deleteCarUnit(idParam) {
  const unit = await getCarUnit(idParam);
  const active = await activeOrderCount(unit.id);
  if (active > 0) throw httpError(409, `Unit masih dipakai ${active} pesanan aktif, tidak bisa dihapus.`);
  // Order lama tetap tersimpan (carUnitId jadi null lewat onDelete: SetNull).
  await prisma.carUnit.delete({ where: { id: unit.id } });
}

module.exports = {
  listCarTypes,
  getCarType,
  createCarType,
  updateCarType,
  deleteCarType,
  setCarTypePhoto,
  deleteCarTypePhoto,
  getPhotoPath,
  listCarUnits,
  getCarUnit,
  createCarUnit,
  updateCarUnit,
  setCarUnitStatus,
  deleteCarUnit,
};
