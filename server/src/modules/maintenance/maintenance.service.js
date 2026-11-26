// Jadwal perawatan mobil (Dev 1).
// Alur: SCHEDULED (terjadwal) → IN_PROGRESS (sedang diservis) → COMPLETED (selesai)  /  CANCELLED (batal)
// - Unit yang punya jadwal di suatu tanggal otomatis tidak bisa dipesan di tanggal itu (availability.service, Dev 3).
// - Saat servis dimulai, status unit jadi MAINTENANCE; saat selesai/batal kembali AVAILABLE.
// - Saat selesai, biaya otomatis dicatat sebagai pengeluaran kategori "Perawatan" di keuangan.
// - Servis berkala: saat menyelesaikan, admin bisa langsung menjadwalkan servis berikutnya (N bulan lagi).
const prisma = require('../../config/db');

const TZ_OFFSET_MS = 8 * 60 * 60 * 1000; // WITA
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = ['SCHEDULED', 'IN_PROGRESS'];

const INCLUDE = {
  carUnit: { select: { id: true, plateNumber: true, status: true, color: true, year: true, carType: { select: { id: true, name: true } } } },
  transactions: { select: { id: true, amount: true, transactionDate: true } },
};

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function toId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'ID jadwal tidak valid.');
  return id;
}

/** Tanggal "YYYY-MM-DD" disimpan pukul 12:00 WITA, supaya tetap di hari yang sama di zona waktu mana pun. */
function dateAtNoon(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12) - TZ_OFFSET_MS);
}

function todayStartUtc() {
  const local = new Date(Date.now() + TZ_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TZ_OFFSET_MS);
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function withFlags(m) {
  return { ...m, isOverdue: m.status === 'SCHEDULED' && m.scheduledDate < todayStartUtc() };
}

async function getOrFail(id, client = prisma) {
  const m = await client.maintenance.findUnique({ where: { id: toId(id) }, include: INCLUDE });
  if (!m) throw httpError(404, 'Jadwal perawatan tidak ditemukan.');
  return m;
}

async function list({ status, carUnitId } = {}) {
  const items = await prisma.maintenance.findMany({
    where: { ...(status && { status }), ...(carUnitId && { carUnitId }) },
    include: INCLUDE,
    // Yang masih terbuka diurutkan dari jadwal terdekat; riwayat dari yang terbaru.
    orderBy: [{ scheduledDate: status && !OPEN_STATUSES.includes(status) ? 'desc' : 'asc' }],
  });
  return items.map(withFlags);
}

async function getById(id) {
  return withFlags(await getOrFail(id));
}

/** Jadwal terbuka dalam N hari ke depan, termasuk yang sudah lewat jadwal (untuk pengingat di dashboard). */
async function upcoming(days = 7) {
  const items = await prisma.maintenance.findMany({
    where: { status: { in: OPEN_STATUSES }, scheduledDate: { lt: new Date(todayStartUtc().getTime() + (days + 1) * DAY_MS) } },
    include: INCLUDE,
    orderBy: { scheduledDate: 'asc' },
  });
  return items.map(withFlags);
}

/** Unit tidak boleh dijadwalkan servis di hari ketika sudah ditugaskan ke pesanan yang dikonfirmasi/berjalan. */
async function assertNoOrderConflict(carUnitId, scheduledDate) {
  const dayStart = new Date(scheduledDate.getTime() - 12 * 60 * 60 * 1000);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const order = await prisma.order.findFirst({
    where: {
      carUnitId,
      status: { in: ['PAID', 'CONFIRMED', 'ONGOING'] },
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
    },
    select: { orderCode: true },
  });
  if (order) throw httpError(409, `Unit sudah ditugaskan ke pesanan ${order.orderCode} di tanggal itu. Pilih tanggal lain.`);
}

async function create(data) {
  const unit = await prisma.carUnit.findUnique({ where: { id: data.carUnitId }, select: { id: true } });
  if (!unit) throw httpError(400, 'Unit mobil tidak ditemukan.');
  const scheduledDate = dateAtNoon(data.scheduledDate);
  await assertNoOrderConflict(unit.id, scheduledDate);

  const created = await prisma.maintenance.create({
    data: {
      carUnitId: unit.id,
      serviceType: data.serviceType,
      scheduledDate,
      cost: data.cost ?? 0,
      notes: data.notes || null,
    },
    include: INCLUDE,
  });
  return withFlags(created);
}

async function update(id, data) {
  const m = await getOrFail(id);
  if (!OPEN_STATUSES.includes(m.status)) throw httpError(409, 'Jadwal yang sudah selesai atau batal tidak bisa diubah.');

  const next = {};
  if (data.serviceType !== undefined) next.serviceType = data.serviceType;
  if (data.cost !== undefined) next.cost = data.cost;
  if (data.notes !== undefined) next.notes = data.notes || null;
  if (data.carUnitId !== undefined && data.carUnitId !== m.carUnitId) {
    if (m.status === 'IN_PROGRESS') throw httpError(409, 'Unit tidak bisa diganti saat servis sedang berjalan.');
    const unit = await prisma.carUnit.findUnique({ where: { id: data.carUnitId }, select: { id: true } });
    if (!unit) throw httpError(400, 'Unit mobil tidak ditemukan.');
    next.carUnitId = unit.id;
  }
  if (data.scheduledDate !== undefined) next.scheduledDate = dateAtNoon(data.scheduledDate);
  if (next.scheduledDate || next.carUnitId) {
    await assertNoOrderConflict(next.carUnitId || m.carUnitId, next.scheduledDate || m.scheduledDate);
  }

  return withFlags(await prisma.maintenance.update({ where: { id: m.id }, data: next, include: INCLUDE }));
}

async function start(id) {
  const m = await getOrFail(id);
  if (m.status !== 'SCHEDULED') throw httpError(409, 'Hanya jadwal berstatus terjadwal yang bisa dimulai.');
  if (m.carUnit.status === 'RENTED') throw httpError(409, 'Unit sedang disewa. Mulai servis setelah mobil kembali.');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.carUnit.update({ where: { id: m.carUnitId }, data: { status: 'MAINTENANCE' } });
    return tx.maintenance.update({ where: { id: m.id }, data: { status: 'IN_PROGRESS' }, include: INCLUDE });
  });
  return withFlags(updated);
}

/** Kembalikan unit ke AVAILABLE jika tidak ada servis lain yang sedang berjalan untuk unit itu. */
async function releaseUnit(tx, maintenance) {
  if (maintenance.carUnit.status !== 'MAINTENANCE') return;
  const others = await tx.maintenance.count({
    where: { carUnitId: maintenance.carUnitId, status: 'IN_PROGRESS', id: { not: maintenance.id } },
  });
  if (!others) await tx.carUnit.update({ where: { id: maintenance.carUnitId }, data: { status: 'AVAILABLE' } });
}

async function complete(id, { cost, completedDate, notes, nextInMonths }) {
  const m = await getOrFail(id);
  if (!OPEN_STATUSES.includes(m.status)) throw httpError(409, 'Jadwal ini sudah selesai atau dibatalkan.');
  const doneAt = completedDate ? dateAtNoon(completedDate) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const done = await tx.maintenance.update({
      where: { id: m.id },
      data: { status: 'COMPLETED', cost, completedDate: doneAt, ...(notes !== undefined && { notes: notes || null }) },
      include: INCLUDE,
    });

    if (cost > 0) {
      await tx.transaction.create({
        data: {
          type: 'EXPENSE',
          category: 'Perawatan',
          amount: cost,
          description: `${m.serviceType} · ${m.carUnit.plateNumber} (${m.carUnit.carType.name})`,
          transactionDate: doneAt,
          maintenanceId: m.id,
        },
      });
    }

    await releaseUnit(tx, m);

    let nextSchedule = null;
    if (nextInMonths) {
      nextSchedule = await tx.maintenance.create({
        data: {
          carUnitId: m.carUnitId,
          serviceType: m.serviceType,
          scheduledDate: addMonths(dateAtNoon(new Date(doneAt.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10)), nextInMonths),
          notes: `Servis berkala tiap ${nextInMonths} bulan`,
        },
        include: INCLUDE,
      });
    }

    return { done, nextSchedule };
  });

  return { maintenance: withFlags(result.done), nextSchedule: result.nextSchedule && withFlags(result.nextSchedule) };
}

async function cancel(id) {
  const m = await getOrFail(id);
  if (!OPEN_STATUSES.includes(m.status)) throw httpError(409, 'Jadwal ini sudah selesai atau dibatalkan.');
  const updated = await prisma.$transaction(async (tx) => {
    await releaseUnit(tx, m);
    return tx.maintenance.update({ where: { id: m.id }, data: { status: 'CANCELLED' }, include: INCLUDE });
  });
  return withFlags(updated);
}

module.exports = { list, getById, upcoming, create, update, start, complete, cancel };
