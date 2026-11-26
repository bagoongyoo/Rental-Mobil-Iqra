const { z } = require('zod');

const price = z.coerce.number().int('Harga harus bilangan bulat').min(0, 'Harga tidak boleh negatif').max(2_000_000_000);
const thisYear = new Date().getFullYear();

// Field tanpa default dipakai untuk edit, supaya field yang tidak dikirim tidak ikut ter-reset.
const carTypeFields = {
  name: z.string().trim().min(2, 'Nama tipe minimal 2 karakter').max(100),
  capacity: z.coerce.number().int().min(1, 'Kapasitas minimal 1').max(60),
  transmission: z.enum(['MANUAL', 'AUTOMATIC']),
  description: z.string().trim().max(2000).optional().nullable(),
  price4HoursDriver: price,
  price12HoursDriver: price,
  priceDailySelfDrive: price,
  priceMonthlySelfDrive: price,
  priceYearlySelfDrive: price,
};

const carTypeSchema = z.object({
  ...carTypeFields,
  transmission: carTypeFields.transmission.default('AUTOMATIC'),
  price4HoursDriver: price.default(0),
  price12HoursDriver: price.default(0),
  priceDailySelfDrive: price.default(0),
  priceMonthlySelfDrive: price.default(0),
  priceYearlySelfDrive: price.default(0),
});

const carTypeUpdateSchema = z
  .object(carTypeFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada data yang diubah' });

const plateNumber = z
  .string()
  .trim()
  .toUpperCase()
  // Aturan TNKB: 1–2 huruf wilayah, 1–4 angka, 0–3 huruf seri. Spasi dirapikan otomatis
  // ("DN1234AB" / "DN  1234 AB" → "DN 1234 AB"); format lain tetap ditolak regex di bawah.
  .transform((v) => {
    const m = v.replace(/\s+/g, '').match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
    return m ? [m[1], m[2], m[3]].filter(Boolean).join(' ') : v.replace(/\s+/g, ' ');
  })
  .pipe(z.string().regex(/^[A-Z]{1,2} \d{1,4}( [A-Z]{1,3})?$/, 'Format plat nomor tidak valid (contoh: DN 1234 AB)'));

const unitStatus = z.enum(['AVAILABLE', 'RENTED', 'MAINTENANCE']);

const carUnitFields = {
  plateNumber,
  carTypeId: z.coerce.number().int().positive('Tipe mobil wajib dipilih'),
  year: z.coerce.number().int().min(1990, 'Tahun minimal 1990').max(thisYear + 1, `Tahun maksimal ${thisYear + 1}`),
  color: z.string().trim().min(2, 'Warna minimal 2 karakter').max(30),
  status: unitStatus,
};

const carUnitSchema = z.object({ ...carUnitFields, status: unitStatus.default('AVAILABLE') });

const carUnitUpdateSchema = z
  .object(carUnitFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada data yang diubah' });

const unitStatusSchema = z.object({ status: unitStatus });

const unitListQuerySchema = z.object({
  carTypeId: z.coerce.number().int().positive().optional(),
  status: unitStatus.optional(),
  q: z.string().trim().max(20).optional(),
});

module.exports = {
  carTypeSchema,
  carTypeUpdateSchema,
  carUnitSchema,
  carUnitUpdateSchema,
  unitStatusSchema,
  unitListQuerySchema,
};
