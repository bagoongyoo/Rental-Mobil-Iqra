const express = require('express');
const ordersController = require('./orders.controller');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');

const router = express.Router();

// Semua endpoint order memerlukan autentikasi JWT
router.use(requireAuth);

// Daftar order (Admin melihat semua, Customer melihat miliknya, Driver melihat tugasnya)
router.get('/', ordersController.listOrders);

// Detail order
router.get('/:id', ordersController.getOrderDetail);

// Ubah status order (Admin, Driver untuk tugasnya, atau Customer untuk batal)
router.patch('/:id/status', ordersController.updateStatus);

// Admin menugaskan plat unit & driver ke order yang sudah dibayar
router.patch('/:id/assign', requireRole('ADMIN'), ordersController.assignOrder);

module.exports = router;
