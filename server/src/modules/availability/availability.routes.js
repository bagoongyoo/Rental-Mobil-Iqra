const express = require('express');
const availabilityController = require('./availability.controller');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');

const router = express.Router();

// Endpoint publik untuk halaman pelanggan mencari ketersediaan mobil (dipakai Dev 2)
router.get('/', availabilityController.checkAvailability);

// Endpoint untuk Admin mencari unit plat nomor & driver bebas saat penugasan order
router.get('/resources', requireAuth, requireRole('ADMIN'), availabilityController.getAssignableResources);

module.exports = router;
