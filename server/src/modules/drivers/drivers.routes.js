const express = require('express');
const multer = require('multer');
const driversController = require('./drivers.controller');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');

const router = express.Router();

const uploadRegister = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Maks 5 MB per foto sebelum dikompres sharp ke WebP
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype || '')) {
      const err = new Error('File harus berupa gambar.');
      err.statusCode = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

const uploadCondition = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1048576 }, // Maks 1 MB (1.048.576 bytes) per foto kondisi
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype || '')) {
      const err = new Error('File foto kondisi harus berupa gambar.');
      err.statusCode = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

function handleMulterMiddleware(middlewareFn, maxMbLabel) {
  return (req, res, next) => {
    middlewareFn(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `Ukuran file melebihi batas maksimal ${maxMbLabel}.`,
        });
      }
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message || 'Gagal memproses file yang diunggah.',
      });
    });
  };
}

// Pendaftaran & Login Driver (Publik)
router.post(
  '/register',
  handleMulterMiddleware(
    uploadRegister.fields([
      { name: 'simPhoto', maxCount: 1 },
      { name: 'profilePhoto', maxCount: 1 },
    ]),
    '5 MB'
  ),
  driversController.register
);
router.post('/login', driversController.login);

// Endpoint Khusus Driver (Panel Tugas Mobile-First)
router.get('/me', requireAuth, requireRole('DRIVER'), driversController.getMyProfile);
router.get('/me/photo', requireAuth, requireRole('DRIVER'), driversController.getMyPhoto);
router.get('/me/tasks', requireAuth, requireRole('DRIVER'), driversController.getMyTasks);
router.patch('/me/ready', requireAuth, requireRole('DRIVER'), driversController.setReadyStatus);
router.patch('/me/tasks/:orderId/start', requireAuth, requireRole('DRIVER'), driversController.startTask);
router.patch('/me/tasks/:orderId/complete', requireAuth, requireRole('DRIVER'), driversController.completeTask);

// Endpoint 4 Foto Kondisi Mobil (Maks 1 MB per foto)
router.get(
  '/me/tasks/:orderId/condition-photos',
  requireAuth,
  requireRole('DRIVER', 'ADMIN'),
  driversController.getConditionPhotos
);
router.get(
  '/me/tasks/:orderId/condition-photos/:slot',
  requireAuth,
  requireRole('DRIVER', 'ADMIN'),
  driversController.getConditionPhotoFile
);
router.post(
  '/me/tasks/:orderId/condition-photos',
  requireAuth,
  requireRole('DRIVER'),
  handleMulterMiddleware(
    uploadCondition.fields([
      { name: 'frontPhoto', maxCount: 1 },
      { name: 'backPhoto', maxCount: 1 },
      { name: 'leftPhoto', maxCount: 1 },
      { name: 'rightPhoto', maxCount: 1 },
    ]),
    '1 MB'
  ),
  driversController.uploadConditionPhotos
);

// Endpoint Khusus Admin (Manajemen & Persetujuan Pendaftaran Driver)
router.get('/', requireAuth, requireRole('ADMIN'), driversController.listDrivers);
router.patch('/:id/approval', requireAuth, requireRole('ADMIN'), driversController.approveDriver);

module.exports = router;
