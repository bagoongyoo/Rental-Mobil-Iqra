const ordersService = require('./orders.service');

/**
 * GET /api/orders
 */
async function listOrders(req, res, next) {
  try {
    const { status, customerId, driverId } = req.query;
    const filters = { status, customerId, driverId };

    // Jika yang request adalah CUSTOMER, batasi hanya order miliknya sendiri
    if (req.user?.role === 'CUSTOMER') {
      filters.customerId = req.user.id;
    } else if (req.user?.role === 'DRIVER') {
      filters.driverId = req.user.id;
    }

    const orders = await ordersService.listOrders(filters);
    return res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/orders/:id
 */
async function getOrderDetail(req, res, next) {
  try {
    const order = await ordersService.getOrderById(req.params.id);

    if (req.user?.role === 'CUSTOMER' && order.customerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki akses ke pesanan ini.',
      });
    }

    if (req.user?.role === 'DRIVER' && order.driverId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki akses ke tugas pesanan ini.',
      });
    }

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/orders/:id/status
 * Ubah status order (Menunggu bayar → Dibayar → Dikonfirmasi → Berjalan → Selesai / Kedaluwarsa / Dibatalkan → Refund)
 */
async function updateStatus(req, res, next) {
  try {
    const { status, notes } = req.body;
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Field status wajib diisi.',
      });
    }

    const order = await ordersService.getOrderById(req.params.id);
    const role = req.user?.role;

    if (role === 'CUSTOMER') {
      if (order.customerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Anda tidak memiliki akses ke pesanan ini.',
        });
      }
      if (status !== 'CANCELLED') {
        return res.status(403).json({
          success: false,
          message: 'Pelanggan hanya diizinkan membatalkan pesanan miliknya.',
        });
      }
    } else if (role === 'DRIVER') {
      if (order.driverId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Pesanan ini tidak ditugaskan kepada Anda.',
        });
      }
      if (!['ONGOING', 'COMPLETED'].includes(status)) {
        return res.status(403).json({
          success: false,
          message: 'Driver hanya diizinkan mengubah status menjadi ONGOING atau COMPLETED.',
        });
      }
    } else if (role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki izin mengubah status pesanan.',
      });
    }

    const updated = await ordersService.updateOrderStatus(order.id, status, { notes });
    return res.status(200).json({
      success: true,
      message: `Status order berhasil diubah menjadi ${updated.status}`,
      data: updated,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/orders/:id/assign
 * Admin menugaskan unit mobil (plat nomor) dan driver ke order yang sudah dibayar
 */
async function assignOrder(req, res, next) {
  try {
    const { carUnitId, driverId } = req.body;
    const updated = await ordersService.assignUnitAndDriver(req.params.id, {
      carUnitId,
      driverId,
    });

    return res.status(200).json({
      success: true,
      message: 'Unit mobil dan driver berhasil ditugaskan. Status order kini CONFIRMED.',
      data: updated,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listOrders,
  getOrderDetail,
  updateStatus,
  assignOrder,
};
