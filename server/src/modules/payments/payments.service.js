// Pembayaran (Dev 2).
// PAYMENT_MODE=simulate : tombol "bayar" palsu untuk development & demo (tanpa uang sungguhan).
// PAYMENT_MODE=midtrans : Midtrans Snap (sandbox/production) + webhook notifikasi.
const crypto = require('crypto');
const cron = require('node-cron');
const prisma = require('../../config/db');
const ordersService = require('../orders/orders.service');

const config = () => ({
  mode: process.env.PAYMENT_MODE === 'midtrans' ? 'midtrans' : 'simulate',
  serverKey: process.env.MIDTRANS_SERVER_KEY || '',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
});

const snapBase = () => (config().isProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com');

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** Order milik pelanggan yang masih menunggu pembayaran dan belum lewat batas waktu. */
async function getPayableOrder(customerId, orderId) {
  const order = await prisma.order.findFirst({
    where: { id: Number(orderId), customerId },
    include: { customer: true, carType: true, payment: true },
  });
  if (!order) throw httpError(404, 'Pesanan tidak ditemukan.');
  if (order.status !== 'WAITING_PAYMENT') throw httpError(400, 'Pesanan ini tidak menunggu pembayaran.');
  if (order.paymentExpiresAt && order.paymentExpiresAt < new Date()) throw httpError(400, 'Batas waktu pembayaran sudah lewat.');
  return order;
}

/** Mulai bayar: mode simulasi cukup memberi tahu client, mode midtrans membuat transaksi Snap. */
async function startPayment(customerId, orderId) {
  const order = await getPayableOrder(customerId, orderId);
  const { mode, serverKey, clientKey, isProduction } = config();
  if (mode !== 'midtrans') return { mode: 'simulate' };
  if (!serverKey) throw httpError(500, 'MIDTRANS_SERVER_KEY belum diisi.');

  if (order.payment?.snapToken && order.payment.status === 'PENDING') {
    return { mode, token: order.payment.snapToken, redirectUrl: order.payment.redirectUrl, clientKey, isProduction };
  }

  const minutesLeft = Math.max(1, Math.round((order.paymentExpiresAt - Date.now()) / 60000));
  const response = await fetch(`${snapBase()}/snap/v1/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: order.orderCode, gross_amount: order.totalPrice },
      item_details: [
        {
          id: String(order.carTypeId),
          name: `${order.carType.name} (${order.packageType})`.slice(0, 50),
          price: order.totalPrice / order.duration,
          quantity: order.duration,
        },
      ],
      customer_details: { first_name: order.customer.name, email: order.customer.email, phone: order.customer.phone || undefined },
      expiry: { unit: 'minutes', duration: minutesLeft },
    }),
  });
  const body = await response.json();
  if (!response.ok) throw httpError(502, body?.error_messages?.join(', ') || 'Gagal membuat transaksi Midtrans.');

  await prisma.payment.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      midtransOrderId: order.orderCode,
      snapToken: body.token,
      redirectUrl: body.redirect_url,
      amount: order.totalPrice,
      expiresAt: order.paymentExpiresAt,
    },
    update: { snapToken: body.token, redirectUrl: body.redirect_url, status: 'PENDING' },
  });

  return { mode, token: body.token, redirectUrl: body.redirect_url, clientKey, isProduction };
}

/**
 * Tandai order lunas: status order → PAID (lewat Dev 3, ikut kirim Socket.IO + email),
 * simpan data Payment, dan catat pemasukan di keuangan (Dev 1). Aman dipanggil berulang.
 */
async function markPaid(orderId, { paymentType = null, reference = null } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
  if (!order) throw httpError(404, 'Pesanan tidak ditemukan.');
  if (order.status !== 'WAITING_PAYMENT') return ordersService.getOrderById(order.id);

  const paidAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        midtransOrderId: reference || order.orderCode,
        amount: order.totalPrice,
        paymentType,
        status: 'PAID',
        paidAt,
        expiresAt: order.paymentExpiresAt,
      },
      update: { status: 'PAID', paidAt, paymentType },
    });

    const recorded = await tx.transaction.count({ where: { orderId: order.id, type: 'INCOME' } });
    if (!recorded) {
      await tx.transaction.create({
        data: {
          type: 'INCOME',
          category: 'Sewa Mobil',
          amount: order.totalPrice,
          description: `Pembayaran pesanan ${order.orderCode}`,
          transactionDate: paidAt,
          orderId: order.id,
        },
      });
    }
  });

  return ordersService.updateOrderStatus(order.id, 'PAID');
}

async function markExpired(orderId) {
  await prisma.payment.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'EXPIRED' } });
  return ordersService.updateOrderStatus(orderId, 'EXPIRED');
}

/** Hanya untuk mode simulasi. */
async function simulateSuccess(customerId, orderId) {
  if (config().mode !== 'simulate') throw httpError(403, 'Mode simulasi tidak aktif.');
  const order = await getPayableOrder(customerId, orderId);
  return markPaid(order.id, { paymentType: 'simulate', reference: `SIM-${order.orderCode}` });
}

/** Webhook Midtrans. Signature dicek sebelum data dipercaya. */
async function handleMidtransNotification(n = {}) {
  const { serverKey } = config();
  const expected = crypto
    .createHash('sha512')
    .update(`${n.order_id}${n.status_code}${n.gross_amount}${serverKey}`)
    .digest('hex');
  if (!serverKey || n.signature_key !== expected) throw httpError(403, 'Signature tidak valid.');

  const order = await prisma.order.findUnique({ where: { orderCode: String(n.order_id) } });
  if (!order) throw httpError(404, 'Pesanan tidak ditemukan.');

  const status = n.transaction_status;
  const paid = status === 'settlement' || (status === 'capture' && n.fraud_status === 'accept');
  if (paid && Number(n.gross_amount) === order.totalPrice) {
    await markPaid(order.id, { paymentType: n.payment_type || null });
  } else if (['expire', 'cancel', 'deny'].includes(status) && order.status === 'WAITING_PAYMENT') {
    await markExpired(order.id);
  }
}

/** Order yang lewat batas bayar otomatis jadi EXPIRED (cek tiap menit). */
let expiryJob = null;
function startExpiryJob() {
  if (expiryJob || process.env.NODE_ENV === 'test') return;
  expiryJob = cron.schedule('* * * * *', async () => {
    try {
      const expired = await ordersService.expireOverdueOrders();
      if (expired.length) {
        await prisma.payment.updateMany({
          where: { orderId: { in: expired.map((o) => o.id) }, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });
      }
    } catch (error) {
      console.error('[Payment Expiry Job]:', error.message);
    }
  });
}

module.exports = {
  config,
  startPayment,
  markPaid,
  markExpired,
  simulateSuccess,
  handleMidtransNotification,
  startExpiryJob,
};
