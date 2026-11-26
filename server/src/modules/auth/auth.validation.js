const { z } = require('zod');
const { zName, zEmail, zPhone } = require('../../utils/identity');

const registerSchema = z.object({
  // Nama hanya huruf & spasi, email lengkap, telepon "+62 812 2941 9850" (lihat utils/identity).
  name: zName,
  email: zEmail,
  password: z.string().min(8, 'Password minimal 8 karakter').max(100),
  phone: zPhone.optional(),
  // Pendaftaran publik hanya untuk pelanggan dan driver. Akun ADMIN dibuat lewat seed.
  role: z.enum(['CUSTOMER', 'DRIVER']).default('CUSTOMER'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

module.exports = { registerSchema, loginSchema };
