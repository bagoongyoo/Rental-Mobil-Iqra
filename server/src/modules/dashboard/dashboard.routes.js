// Ringkasan dashboard admin (Dev 1).
// GET /api/dashboard → angka ringkas, daftar tugas, pesanan terbaru, pengingat servis.
const { Router } = require('express');
const prisma = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');
const finance = require('../finance/finance.service');
const maintenance = require('../maintenance/maintenance.service');

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (req, res) => {
  const { start: todayStart, end: todayEnd } = finance.periodRange('day', finance.todayStr());

  const [ordersToday, ongoing, needAssign, pendingDocs, pendingDrivers, readyDrivers, unitGroups, month, latestOrders, serviceReminders] =
    await Promise.all([
      prisma.order.count({
        where: { startTime: { gte: todayStart, lt: todayEnd }, status: { in: ['PAID', 'CONFIRMED', 'ONGOING', 'COMPLETED'] } },
      }),
      prisma.order.count({ where: { status: 'ONGOING' } }),
      prisma.order.count({ where: { status: 'PAID' } }),
      prisma.userDocument.count({ where: { status: 'PENDING', type: { in: ['KTP', 'SIM'] }, user: { role: 'CUSTOMER' } } }),
      prisma.driverProfile.count({ where: { approvalStatus: 'PENDING' } }),
      prisma.driverProfile.count({ where: { isReady: true, approvalStatus: 'APPROVED', user: { isActive: true } } }),
      prisma.carUnit.groupBy({ by: ['status'], _count: { _all: true } }),
      finance.monthTotals(),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          orderCode: true,
          status: true,
          serviceType: true,
          startTime: true,
          totalPrice: true,
          customer: { select: { name: true } },
          carType: { select: { name: true } },
        },
      }),
      maintenance.upcoming(7),
    ]);

  const units = { total: 0, AVAILABLE: 0, RENTED: 0, MAINTENANCE: 0 };
  for (const g of unitGroups) {
    units[g.status] = g._count._all;
    units.total += g._count._all;
  }

  res.json({
    success: true,
    data: {
      todo: { needAssign, pendingDocs, pendingDrivers },
      stats: { ordersToday, ongoing, readyDrivers, units },
      month,
      latestOrders,
      serviceReminders,
    },
  });
});

module.exports = router;
