// Pembayaran (Dev 2).
// PAYMENT_MODE=simulate : tombol "bayar" palsu untuk development & demo (tanpa uang sungguhan).
// PAYMENT_MODE=midtrans : Midtrans Snap (sandbox/production) + webhook notifikasi.
import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { badRequest, forbidden, HttpError, notFound } from '../../utils/http.js';
import * as orders from '../orders/orders.service.js';

const router = Router();
const snapBase = () => (env.midtrans.isProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com');

async function ownPendingBooking(req) {
  const booking = await prisma.booking.findFirst({
    where: { id: Number(req.params.bookingId), customerId: req.user.id },
    include: { customer: true, carType: true },
  });
  if (!booking) throw notFound('Pesanan tidak ditemukan');
  if (booking.status !== 'PENDING_PAYMENT') throw badRequest('Pesanan ini tidak menunggu pembayaran');
  if (booking.expiresAt && booking.expiresAt < new Date()) throw badRequest('Batas waktu pembayaran sudah lewat');
  return booking;
}

router.post('/:bookingId/pay', requireAuth, requireRole('CUSTOMER'), async (req, res) => {
  const booking = await ownPendingBooking(req);
  if (env.paymentMode !== 'midtrans') return res.json({ mode: 'simulate' });
  if (!env.midtrans.serverKey) throw new HttpError(500, 'MIDTRANS_SERVER_KEY belum diisi');
  if (booking.paymentToken) return res.json({ mode: 'midtrans', token: booking.paymentToken, clientKey: env.midtrans.clientKey, isProduction: env.midtrans.isProduction });

  const response = await fetch(`${snapBase()}/snap/v1/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${env.midtrans.serverKey}:`).toString('base64')}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: booking.code, gross_amount: booking.totalPrice },
      item_details: [{ id: String(booking.carTypeId), name: `${booking.carType.name} (${booking.package})`.slice(0, 50), price: booking.unitPrice, quantity: booking.quantity }],
      customer_details: { first_name: booking.customer.name, email: booking.customer.email, phone: booking.customer.phone || undefined },
      expiry: { unit: 'minutes', duration: Math.max(1, Math.round((booking.expiresAt - Date.now()) / 60000)) },
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new HttpError(502, body?.error_messages?.join(', ') || 'Gagal membuat transaksi Midtrans');
  await prisma.booking.update({ where: { id: booking.id }, data: { paymentToken: body.token } });
  res.json({ mode: 'midtrans', token: body.token, clientKey: env.midtrans.clientKey, isProduction: env.midtrans.isProduction });
});

// Hanya aktif di mode simulate.
router.post('/:bookingId/simulate-success', requireAuth, requireRole('CUSTOMER'), async (req, res) => {
  if (env.paymentMode !== 'simulate') throw forbidden('Mode simulasi tidak aktif');
  const booking = await ownPendingBooking(req);
  const updated = await orders.markPaid(booking.id, `SIM-${Date.now()}`);
  res.json({ booking: updated });
});

// Webhook Midtrans: atur URL ini di dashboard Midtrans -> Settings -> Payment -> Notification URL
router.post('/midtrans/notify', async (req, res) => {
  const n = req.body || {};
  const expected = crypto
    .createHash('sha512')
    .update(`${n.order_id}${n.status_code}${n.gross_amount}${env.midtrans.serverKey}`)
    .digest('hex');
  if (!env.midtrans.serverKey || n.signature_key !== expected) return res.status(403).json({ message: 'Signature tidak valid' });

  const booking = await prisma.booking.findUnique({ where: { code: String(n.order_id) } });
  if (!booking) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

  const status = n.transaction_status;
  const paid = status === 'settlement' || (status === 'capture' && n.fraud_status === 'accept');
  if (paid && Number(n.gross_amount) === booking.totalPrice) await orders.markPaid(booking.id, n.transaction_id);
  else if (['expire', 'cancel', 'deny'].includes(status) && booking.status === 'PENDING_PAYMENT') await orders.markExpired(booking);
  res.json({ ok: true });
});

export default router;
