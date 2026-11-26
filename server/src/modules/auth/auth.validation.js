const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100),
  email: z.string().trim().toLowerCase().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter').max(100),
  phone: z.string().trim().min(8).max(20).optional(),
  // Pendaftaran publik hanya untuk pelanggan dan driver. Akun ADMIN dibuat lewat seed.
  role: z.enum(['CUSTOMER', 'DRIVER']).default('CUSTOMER'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

module.exports = { registerSchema, loginSchema };
