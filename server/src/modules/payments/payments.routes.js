// Pembayaran (Dev 2): mulai bayar, simulasi lunas, webhook Midtrans.
const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');
const paymentsService = require('./payments.service');

const router = express.Router();

// Order kedaluwarsa otomatis jalan begitu modul pembayaran aktif.
paymentsService.startExpiryJob();

// GET /api/payments/config — client perlu tahu mode bayar dan client key Midtrans
router.get('/config', (req, res) => {
  const { mode, clientKey, isProduction } = paymentsService.config();
  res.json({ success: true, data: { mode, clientKey, isProduction } });
});

// POST /api/payments/:orderId/pay
router.post('/:orderId/pay', requireAuth, requireRole('CUSTOMER'), async (req, res) => {
  res.json({ success: true, data: await paymentsService.startPayment(req.user.id, req.params.orderId) });
});

// POST /api/payments/:orderId/simulate-success (hanya PAYMENT_MODE=simulate)
router.post('/:orderId/simulate-success', requireAuth, requireRole('CUSTOMER'), async (req, res) => {
  res.json({ success: true, data: await paymentsService.simulateSuccess(req.user.id, req.params.orderId) });
});

// POST /api/payments/midtrans/notify
// Atur di dashboard Midtrans: Settings → Payment → Notification URL
router.post('/midtrans/notify', async (req, res) => {
  await paymentsService.handleMidtransNotification(req.body);
  res.json({ success: true });
});

module.exports = router;
