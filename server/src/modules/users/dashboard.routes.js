// Ringkasan dashboard admin (Dev 1).
import { Router } from 'express';
import { prisma } from '../../config/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { addDays, periodRange, toDateStrWIB } from '../../utils/dates.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (_req, res) => {
  const now = new Date();
  const today = toDateStrWIB(now);
  const day = periodRange('day', today);
  const month = periodRange('month', today);
  const [ordersToday, needAssign, ongoing, unitsTotal, pendingDocs, pendingDrivers, incomeMonth, expenseMonth, upcomingMaintenance, readyDrivers] = await Promise.all([
    prisma.booking.count({ where: { startAt: { gte: day.from, lt: day.to }, status: { in: ['PAID', 'CONFIRMED', 'ONGOING', 'COMPLETED'] } } }),
    prisma.booking.count({ where: { status: 'PAID' } }),
    prisma.booking.count({ where: { status: 'ONGOING' } }),
    prisma.carUnit.count({ where: { status: 'ACTIVE' } }),
    prisma.document.count({ where: { status: 'PENDING', user: { status: { not: 'DELETED' } } } }),
    prisma.user.count({ where: { role: 'DRIVER', status: 'PENDING' } }),
    prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: 'INCOME', date: { gte: month.from, lt: month.to } } }),
    prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: 'EXPENSE', date: { gte: month.from, lt: month.to } } }),
    // Pengingat servis: jadwal 7 hari ke depan + yang sudah lewat tapi belum ditandai selesai.
    prisma.maintenance.findMany({
      where: { status: 'SCHEDULED', startDate: { lt: addDays(now, 7) } },
      include: { unit: { select: { plate: true, carType: { select: { name: true } } } } },
      orderBy: { startDate: 'asc' },
      take: 8,
    }),
    prisma.driverProfile.count({ where: { isReady: true, user: { status: 'ACTIVE' } } }),
  ]);
  const latest = await prisma.booking.findMany({
    orderBy: { createdAt: 'desc' },
    take: 6,
    include: { customer: { select: { name: true } }, carType: { select: { name: true } } },
  });
  res.json({
    ordersToday,
    needAssign,
    ongoing,
    unitsTotal,
    pendingDocs,
    pendingDrivers,
    readyDrivers,
    incomeMonth: incomeMonth._sum.amount || 0,
    expenseMonth: expenseMonth._sum.amount || 0,
    upcomingMaintenance,
    latest,
  });
});

export default router;
