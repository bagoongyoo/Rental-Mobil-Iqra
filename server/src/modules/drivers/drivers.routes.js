const express = require('express');
const multer = require('multer');
const driversController = require('./drivers.controller');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Maks 5 MB per foto sebelum dikompres sharp ke WebP
});

// Pendaftaran & Login Driver (Publik)
router.post(
  '/register',
  upload.fields([
    { name: 'simPhoto', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 },
  ]),
  driversController.register
);
router.post('/login', driversController.login);

// Endpoint Khusus Driver (Panel Tugas Mobile-First)
router.get('/me', requireAuth, requireRole('DRIVER'), driversController.getMyProfile);
router.get('/me/tasks', requireAuth, requireRole('DRIVER'), driversController.getMyTasks);
router.patch('/me/ready', requireAuth, requireRole('DRIVER'), driversController.setReadyStatus);
router.patch('/me/tasks/:orderId/start', requireAuth, requireRole('DRIVER'), driversController.startTask);
router.patch('/me/tasks/:orderId/complete', requireAuth, requireRole('DRIVER'), driversController.completeTask);

// Endpoint Khusus Admin (Manajemen & Persetujuan Pendaftaran Driver)
router.get('/', requireAuth, requireRole('ADMIN'), driversController.listDrivers);
router.patch('/:id/approval', requireAuth, requireRole('ADMIN'), driversController.approveDriver);

module.exports = router;
