const nodemailer = require('nodemailer');

const STATUS_LABELS = {
  WAITING_PAYMENT: 'Menunggu Pembayaran',
  PAID: 'Sudah Dibayar (Menunggu Konfirmasi & Penugasan)',
  CONFIRMED: 'Dikonfirmasi (Unit & Driver Siap)',
  ONGOING: 'Sedang Berjalan',
  COMPLETED: 'Selesai',
  EXPIRED: 'Kedaluwarsa',
  CANCELLED: 'Dibatalkan',
  REFUNDED: 'Dana Dikembalikan (Refund)',
};

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass || user === 'email@gmail.com') {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * Mengirim email notifikasi perubahan status order ke pelanggan
 */
async function sendOrderStatusEmail(order) {
  try {
    if (!order?.customer?.email) return { sent: false, reason: 'NO_RECIPIENT' };

    const statusLabel = STATUS_LABELS[order.status] || order.status;
    const carName = order.carType?.name || 'Unit Rental';
    const plateNumber = order.carUnit?.plateNumber || '-';
    const driverName = order.driver?.name || (order.serviceType === 'SELF_DRIVE' ? 'Lepas Kunci' : 'Menunggu Penugasan');

    const subject = `[Rental Mobil Iqra] Status Pesanan #${order.orderCode}: ${statusLabel}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #1d4ed8; margin-top: 0;">Rental Mobil Iqra</h2>
        <p>Halo <strong>${order.customer.name}</strong>,</p>
        <p>Status pesanan Anda dengan kode <strong>#${order.orderCode}</strong> telah diperbarui menjadi:</p>
        <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 16px 0;">
          <strong style="font-size: 16px; color: #1e40af;">${statusLabel}</strong>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
          <tr><td style="padding: 6px 0; color: #6b7280;">Mobil</td><td style="padding: 6px 0;"><strong>${carName}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Plat Nomor</td><td style="padding: 6px 0;"><strong>${plateNumber}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Layanan / Driver</td><td style="padding: 6px 0;"><strong>${driverName}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Waktu Mulai</td><td style="padding: 6px 0;">${new Date(order.startTime).toLocaleString('id-ID')}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Waktu Selesai</td><td style="padding: 6px 0;">${new Date(order.endTime).toLocaleString('id-ID')}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Total Harga</td><td style="padding: 6px 0;"><strong>Rp ${Number(order.totalPrice || 0).toLocaleString('id-ID')}</strong></td></tr>
        </table>
        <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">Terima kasih telah menggunakan layanan Rental Mobil Iqra.</p>
      </div>
    `;

    const transporter = createTransporter();
    if (!transporter) {
      console.log(`[Mailer Preview] To: ${order.customer.email} | Subject: ${subject}`);
      return { sent: false, preview: true };
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Rental Mobil Iqra <noreply@rentalmobiliqra.com>',
      to: order.customer.email,
      subject,
      html,
    });

    return { sent: true };
  } catch (error) {
    console.error('[Mailer Error]:', error.message);
    return { sent: false, error: error.message };
  }
}

module.exports = {
  STATUS_LABELS,
  sendOrderStatusEmail,
};
