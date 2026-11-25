const express = require('express');
const trackingController = require('./tracking.controller');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

// Driver mengirim titik GPS terbaru
router.post('/location', requireRole('DRIVER'), trackingController.updateLocation);

// Admin melihat semua driver aktif di peta Leaflet
router.get('/drivers', requireRole('ADMIN'), trackingController.getActiveDrivers);

// Pelanggan / Admin / Driver melihat posisi driver untuk order tertentu
router.get('/orders/:orderId', trackingController.getOrderTracking);

module.exports = router;
