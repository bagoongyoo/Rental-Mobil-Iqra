// Manajemen keuangan (Dev 1): pemasukan & pengeluaran, laporan per periode, ekspor CSV.
// Sumber transaksi:
//   - otomatis: pembayaran pesanan (payments.service → INCOME "Sewa Mobil"),
//               perawatan selesai (maintenance.service → EXPENSE "Perawatan"),
//               dana dikembalikan (orders.service → EXPENSE "Refund")
//   - manual  : dicatat admin (BBM, gaji driver, pajak, dll.)
const prisma = require('../../config/db');

// Rental beroperasi di Palu (WITA, UTC+8, tanpa daylight saving), jadi batas hari dihitung di WITA.
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const CATEGORIES = {
  INCOME: ['Sewa Mobil', 'Denda', 'Lainnya'],
  EXPENSE: ['BBM', 'Gaji Driver', 'Perawatan', 'Pajak & STNK', 'Asuransi', 'Cuci Mobil', 'Operasional', 'Refund', 'Lainnya'],
};

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ---------- Tanggal (WITA) ----------

/** "YYYY-MM-DD" hari ini menurut WITA. */
function todayStr() {
  return new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Awal hari (00:00 WITA) dari tanggal lokal y-m-d, sebagai Date UTC. */
function localMidnight(y, m, d) {
  return new Date(Date.UTC(y, m, d) - TZ_OFFSET_MS);
}

/** Komponen tanggal lokal WITA dari sebuah Date. */
function localParts(date) {
  const l = new Date(date.getTime() + TZ_OFFSET_MS);
  return { y: l.getUTCFullYear(), m: l.getUTCMonth(), d: l.getUTCDate(), h: l.getUTCHours(), dow: l.getUTCDay() };
}

/**
 * Rentang periode + daftar "ember" untuk grafik.
 * day   : 00:00–24:00, per 3 jam (8 batang, muat di layar HP)
 * week  : Senin–Minggu, per hari
 * month : tanggal 1–akhir bulan, per hari
 * year  : Januari–Desember, per bulan
 */
function periodRange(period, dateStr) {
  const [y, m, d] = String(dateStr || todayStr()).split('-').map(Number);
  if (!y || !m || !d) throw httpError(400, 'Format tanggal harus YYYY-MM-DD.');
  const m0 = m - 1;

  if (period === 'day') {
    const start = localMidnight(y, m0, d);
    const buckets = Array.from({ length: 8 }, (_, i) => ({
      key: i,
      label: `${String(i * 3).padStart(2, '0')}:00`,
    }));
    return { start, end: new Date(start.getTime() + DAY_MS), buckets, bucketOf: (p) => Math.floor(p.h / 3) };
  }

  if (period === 'week') {
    const ref = localMidnight(y, m0, d);
    const dow = localParts(ref).dow; // 0 = Minggu
    const start = new Date(ref.getTime() - ((dow + 6) % 7) * DAY_MS); // mundur ke Senin
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const p = localParts(new Date(start.getTime() + i * DAY_MS));
      return { key: i, label: `${p.d}/${p.m + 1}` };
    });
    return {
      start,
      end: new Date(start.getTime() + 7 * DAY_MS),
      buckets,
      bucketOf: (p) => Math.floor((localMidnight(p.y, p.m, p.d) - start) / DAY_MS),
    };
  }

  if (period === 'month') {
    const start = localMidnight(y, m0, 1);
    const end = localMidnight(y, m0 + 1, 1);
    const days = Math.round((end - start) / DAY_MS);
    const buckets = Array.from({ length: days }, (_, i) => ({ key: i, label: String(i + 1) }));
    return { start, end, buckets, bucketOf: (p) => p.d - 1 };
  }

  if (period === 'year') {
    const buckets = Array.from({ length: 12 }, (_, i) => ({ key: i, label: String(i + 1) }));
    return { start: localMidnight(y, 0, 1), end: localMidnight(y + 1, 0, 1), buckets, bucketOf: (p) => p.m };
  }

  throw httpError(400, 'Periode harus day, week, month, atau year.');
}

// ---------- Laporan ----------

const TXN_INCLUDE = {
  order: { select: { id: true, orderCode: true } },
  maintenance: { select: { id: true, serviceType: true, carUnit: { select: { plateNumber: true } } } },
};

function findTransactions({ start, end, type }) {
  return prisma.transaction.findMany({
    where: { transactionDate: { gte: start, lt: end }, ...(type && { type }) },
    include: TXN_INCLUDE,
    orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
  });
}

/** Ringkasan periode: total, data grafik, per kategori, dan daftar transaksi. */
async function getSummary({ period = 'month', date, type } = {}) {
  const range = periodRange(period, date);
  const transactions = await findTransactions({ ...range, type });

  const chart = range.buckets.map((b) => ({ label: b.label, income: 0, expense: 0 }));
  const categories = new Map();
  const totals = { income: 0, expense: 0, profit: 0, count: transactions.length };

  for (const t of transactions) {
    const key = t.type === 'INCOME' ? 'income' : 'expense';
    totals[key] += t.amount;
    const bucket = chart[range.bucketOf(localParts(t.transactionDate))];
    if (bucket) bucket[key] += t.amount;

    const catKey = `${t.type}|${t.category}`;
    const cat = categories.get(catKey) || { type: t.type, category: t.category, total: 0, count: 0 };
    cat.total += t.amount;
    cat.count += 1;
    categories.set(catKey, cat);
  }
  totals.profit = totals.income - totals.expense;

  return {
    period,
    range: { start: range.start, end: range.end },
    totals,
    chart,
    byCategory: [...categories.values()].sort((a, b) => b.total - a.total),
    transactions: transactions.map(toPublicTransaction),
  };
}

function toPublicTransaction(t) {
  return {
    id: t.id,
    type: t.type,
    category: t.category,
    amount: t.amount,
    description: t.description,
    transactionDate: t.transactionDate,
    source: t.orderId ? 'ORDER' : t.maintenanceId ? 'MAINTENANCE' : 'MANUAL',
    order: t.order,
    maintenance: t.maintenance,
  };
}

// ---------- Ekspor CSV ----------

function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatLocal(date) {
  const l = new Date(date.getTime() + TZ_OFFSET_MS).toISOString();
  return `${l.slice(0, 10)} ${l.slice(11, 16)}`;
}

/** File CSV (UTF-8 + BOM supaya rapi saat dibuka di Excel). */
async function exportCsv(filters = {}) {
  const period = filters.period || 'month';
  const range = periodRange(period, filters.date);
  const transactions = await findTransactions({ ...range, type: filters.type });

  const header = ['Tanggal (WITA)', 'Jenis', 'Kategori', 'Keterangan', 'Sumber', 'Referensi', 'Nominal (Rp)'];
  const rows = transactions.map((t) => {
    const p = toPublicTransaction(t);
    const ref = p.order?.orderCode || (p.maintenance ? `Servis #${p.maintenance.id} ${p.maintenance.carUnit?.plateNumber || ''}`.trim() : '');
    const source = { ORDER: 'Otomatis (pesanan)', MAINTENANCE: 'Otomatis (perawatan)', MANUAL: 'Manual' }[p.source];
    return [formatLocal(t.transactionDate), t.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran', t.category, t.description || '', source, ref, t.amount];
  });

  const income = transactions.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
  rows.push([], ['', '', '', 'Total pemasukan', '', '', income], ['', '', '', 'Total pengeluaran', '', '', expense], ['', '', '', 'Laba bersih', '', '', income - expense]);

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const startLabel = formatLocal(range.start).slice(0, 10);
  return { fileName: `keuangan-${period}-${startLabel}.csv`, content: `﻿${csv}\r\n` };
}

// ---------- Transaksi manual ----------

async function createTransaction(data) {
  const created = await prisma.transaction.create({
    data: {
      type: data.type,
      category: data.category,
      amount: data.amount,
      description: data.description || null,
      transactionDate: data.transactionDate ? new Date(data.transactionDate) : new Date(),
    },
    include: TXN_INCLUDE,
  });
  return toPublicTransaction(created);
}

async function deleteTransaction(idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'ID transaksi tidak valid.');
  const t = await prisma.transaction.findUnique({ where: { id } });
  if (!t) throw httpError(404, 'Transaksi tidak ditemukan.');
  // Transaksi otomatis terikat ke pesanan/perawatan, jadi tidak dihapus dari sini supaya laporan tetap jujur.
  if (t.orderId || t.maintenanceId) {
    throw httpError(409, 'Transaksi otomatis dari pesanan atau perawatan tidak bisa dihapus.');
  }
  await prisma.transaction.delete({ where: { id } });
}

/** Total pemasukan & pengeluaran bulan berjalan (dipakai dashboard admin). */
async function monthTotals() {
  const { start, end } = periodRange('month', todayStr());
  const grouped = await prisma.transaction.groupBy({
    by: ['type'],
    where: { transactionDate: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  const sum = (type) => grouped.find((g) => g.type === type)?._sum.amount || 0;
  const income = sum('INCOME');
  const expense = sum('EXPENSE');
  return { income, expense, profit: income - expense };
}

/**
 * Catat pengembalian dana sebagai pengeluaran (dipanggil di dalam transaksi Prisma saat order → REFUNDED).
 * Aman dipanggil berulang: hanya dicatat sekali per pesanan, dan hanya jika pesanan pernah dibayar.
 */
async function recordRefund(tx, order) {
  const paid = await tx.transaction.findFirst({ where: { orderId: order.id, type: 'INCOME' } });
  if (!paid) return;
  const already = await tx.transaction.count({ where: { orderId: order.id, type: 'EXPENSE', category: 'Refund' } });
  if (already) return;
  await tx.transaction.create({
    data: {
      type: 'EXPENSE',
      category: 'Refund',
      amount: paid.amount,
      description: `Pengembalian dana pesanan ${order.orderCode}`,
      orderId: order.id,
    },
  });
}

module.exports = {
  CATEGORIES,
  todayStr,
  periodRange,
  getSummary,
  exportCsv,
  createTransaction,
  deleteTransaction,
  monthTotals,
  recordRefund,
};
