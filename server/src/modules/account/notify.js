// Pengirim kode verifikasi (Dev 2). Saluran bisa diganti lewat .env tanpa mengubah kode:
//   OTP_EMAIL_MODE    = simulate | smtp     (smtp: Gmail atau penyedia SMTP lain, pakai nodemailer)
//   OTP_WHATSAPP_MODE = simulate | fonnte   (fonnte.com: gateway WhatsApp Indonesia)
// Mode simulate tidak mengirim apa-apa: kode dicetak di log server (dan ditampilkan di layar saat development).
const isProd = process.env.NODE_ENV === 'production';

export const otpModes = () => ({
  EMAIL: process.env.OTP_EMAIL_MODE || 'simulate',
  WHATSAPP: process.env.OTP_WHATSAPP_MODE || 'simulate',
});

/** true jika kode boleh ikut dikirim ke browser (hanya simulasi di luar production). */
export const exposeDevCode = (channel) => !isProd && otpModes()[channel] === 'simulate';

let transporter;
async function smtp() {
  if (!transporter) {
    const { default: nodemailer } = await import('nodemailer');
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

/** Nomor HP Indonesia ke format 62xxxxxxxxxx. */
export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

export async function sendOtp({ channel, to, code, purpose, name }) {
  const what = purpose === 'RESET_PASSWORD' ? 'atur ulang kata sandi' : 'ganti kata sandi';
  const text = `Halo ${name || ''}, kode verifikasi Rental Mobil Iqra untuk ${what}: ${code}. Berlaku 10 menit. Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku admin.`;
  const mode = otpModes()[channel];

  if (mode === 'simulate') {
    console.log(`[OTP simulasi] ${channel} ke ${to}: ${code} (${purpose})`);
    return;
  }
  if (channel === 'EMAIL' && mode === 'smtp') {
    const tx = await smtp();
    await tx.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `Kode verifikasi ${code} - Rental Mobil Iqra`,
      text,
      html: `<p>Halo ${escapeHtml(name || '')},</p><p>Kode verifikasi untuk ${what}:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>Berlaku 10 menit. Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku admin.</p><p>Rental Mobil Iqra, Palu</p>`,
    });
    return;
  }
  if (channel === 'WHATSAPP' && mode === 'fonnte') {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: process.env.FONNTE_TOKEN || '' },
      body: new URLSearchParams({ target: normalizePhone(to), message: text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === false) throw new Error(`Fonnte gagal: ${data.reason || res.status}`);
    return;
  }
  throw new Error(`Mode OTP tidak dikenal: ${channel}=${mode}`);
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
