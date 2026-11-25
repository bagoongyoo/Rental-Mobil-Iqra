const trackingService = require('./tracking.service');

/**
 * POST /api/tracking/location
 * Fallback HTTP endpoint bagi driver untuk mengirim lokasi GPS berkala
 */
async function updateLocation(req, res, next) {
  try {
    const { orderId, lat, lng } = req.body;
    const result = await trackingService.recordDriverLocation(req.user.id, {
      orderId,
      lat,
      lng,
    });

    return res.status(200).json({
      success: true,
      data: result.locationUpdate,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/tracking/drivers
 * Ambil lokasi semua driver aktif untuk peta Leaflet di dashboard Admin
 */
async function getActiveDrivers(req, res, next) {
  try {
    const drivers = await trackingService.getActiveDriversForAdminMap();
    return res.status(200).json({
      success: true,
      data: drivers,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/tracking/orders/:orderId
 * Ambil posisi live driver & riwayat rute ringkas untuk 1 order (Admin / Pelanggan pemilik order)
 */
async function getOrderTracking(req, res, next) {
  try {
    const data = await trackingService.getOrderTracking(req.params.orderId, req.user);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  updateLocation,
  getActiveDrivers,
  getOrderTracking,
};
