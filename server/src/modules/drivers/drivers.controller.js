const driversService = require('./drivers.service');

/**
 * POST /api/drivers/register
 */
async function register(req, res, next) {
  try {
    const driver = await driversService.registerDriver(req.body, req.files);
    return res.status(201).json({
      success: true,
      message: 'Pendaftaran driver berhasil dikirim. Akun Anda akan aktif setelah disetujui oleh Admin.',
      data: driver,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/drivers/login
 */
async function login(req, res, next) {
  try {
    const result = await driversService.loginDriver(req.body);
    return res.status(200).json({
      success: true,
      message: 'Login driver berhasil.',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/drivers
 */
async function listDrivers(req, res, next) {
  try {
    const drivers = await driversService.listAllDrivers(req.query);
    return res.status(200).json({
      success: true,
      data: drivers,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/drivers/:id/approval
 */
async function approveDriver(req, res, next) {
  try {
    const { status, rejectionReason } = req.body;
    const updated = await driversService.updateDriverApproval(req.params.id, {
      status,
      rejectionReason,
    });
    return res.status(200).json({
      success: true,
      message: `Status persetujuan driver berhasil diperbarui menjadi ${status}.`,
      data: updated,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/drivers/me
 */
async function getMyProfile(req, res, next) {
  try {
    const profile = await driversService.getMyDriverProfile(req.user.id);
    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/drivers/me/tasks
 */
async function getMyTasks(req, res, next) {
  try {
    const filter = req.query.filter || 'today';
    const tasks = await driversService.getDriverTasks(req.user.id, filter);
    return res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/drivers/me/ready
 */
async function setReadyStatus(req, res, next) {
  try {
    const profile = await driversService.updateReadyStatus(req.user.id, req.body);
    return res.status(200).json({
      success: true,
      message: profile.isReady ? 'Status driver: Siap Jalan (GPS Aktif)' : 'Status driver: Nonaktif',
      data: profile,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/drivers/me/tasks/:orderId/start
 */
async function startTask(req, res, next) {
  try {
    const updatedOrder = await driversService.startTask(req.user.id, req.params.orderId, req.body);
    return res.status(200).json({
      success: true,
      message: 'Tugas berhasil dimulai. Pengiriman lokasi GPS berkala aktif.',
      data: updatedOrder,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/drivers/me/tasks/:orderId/complete
 */
async function completeTask(req, res, next) {
  try {
    const updatedOrder = await driversService.completeTask(req.user.id, req.params.orderId, req.body);
    return res.status(200).json({
      success: true,
      message: 'Tugas selesai. Terima kasih!',
      data: updatedOrder,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  listDrivers,
  approveDriver,
  getMyProfile,
  getMyTasks,
  setReadyStatus,
  startTask,
  completeTask,
};
