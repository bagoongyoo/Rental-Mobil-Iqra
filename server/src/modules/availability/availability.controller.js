const availabilityService = require('./availability.service');

/**
 * GET /api/availability
 * Cari ketersediaan tipe mobil beserta stok unit di rentang tanggal (dipakai halaman pelanggan Dev 2)
 */
async function checkAvailability(req, res, next) {
  try {
    const { startTime, endTime, carTypeId, transmission, minCapacity, serviceType } = req.query;

    const results = await availabilityService.searchAvailableCarTypes({
      startTime,
      endTime,
      carTypeId,
      transmission,
      minCapacity,
      serviceType,
    });

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/availability/resources
 * Ambil daftar unit (plat nomor) dan driver yang bebas pada rentang tanggal untuk penugasan Admin
 */
async function getAssignableResources(req, res, next) {
  try {
    const { carTypeId, startTime, endTime, excludeOrderId } = req.query;

    if (!carTypeId) {
      return res.status(400).json({
        success: false,
        message: 'Parameter carTypeId wajib diisi.',
      });
    }

    const [freeUnits, freeDrivers] = await Promise.all([
      availabilityService.getFreeUnitsByCarType(carTypeId, startTime, endTime, excludeOrderId),
      availabilityService.getFreeDrivers(startTime, endTime, excludeOrderId),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        freeUnits,
        freeDrivers,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  checkAvailability,
  getAssignableResources,
};
