const carsService = require('./cars.service');
const v = require('./cars.validation');

function validate(schema, input, res) {
  const result = schema.safeParse(input || {});
  if (!result.success) {
    res.status(400).json({
      success: false,
      message: result.error.issues[0]?.message || 'Data tidak valid.',
      errors: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return null;
  }
  return result.data;
}

// Express 5 meneruskan error dari handler async ke global error handler di app.js.

// ---------- Tipe mobil ----------

async function listTypes(req, res) {
  res.json({ success: true, data: await carsService.listCarTypes() });
}

async function getType(req, res) {
  res.json({ success: true, data: await carsService.getCarType(req.params.id) });
}

async function createType(req, res) {
  const data = validate(v.carTypeSchema, req.body, res);
  if (!data) return;
  const type = await carsService.createCarType(data);
  res.status(201).json({ success: true, message: 'Tipe mobil ditambahkan.', data: type });
}

async function updateType(req, res) {
  const data = validate(v.carTypeUpdateSchema, req.body, res);
  if (!data) return;
  const type = await carsService.updateCarType(req.params.id, data);
  res.json({ success: true, message: 'Tipe mobil diperbarui.', data: type });
}

async function deleteType(req, res) {
  await carsService.deleteCarType(req.params.id);
  res.json({ success: true, message: 'Tipe mobil dihapus.' });
}

async function uploadTypePhoto(req, res) {
  const type = await carsService.setCarTypePhoto(req.params.id, req.file?.buffer);
  res.json({ success: true, message: 'Foto tipe diperbarui.', data: type });
}

async function deleteTypePhoto(req, res) {
  const type = await carsService.deleteCarTypePhoto(req.params.id);
  res.json({ success: true, message: 'Foto tipe dihapus.', data: type });
}

async function getPhoto(req, res) {
  const filePath = await carsService.getPhotoPath(req.params.file);
  res.set('Cache-Control', 'public, max-age=604800, immutable');
  res.type('image/webp').sendFile(filePath);
}

// ---------- Unit mobil ----------

async function listUnits(req, res) {
  const query = validate(v.unitListQuerySchema, req.query, res);
  if (!query) return;
  res.json({ success: true, data: await carsService.listCarUnits(query) });
}

async function getUnit(req, res) {
  res.json({ success: true, data: await carsService.getCarUnit(req.params.id) });
}

async function createUnit(req, res) {
  const data = validate(v.carUnitSchema, req.body, res);
  if (!data) return;
  const unit = await carsService.createCarUnit(data);
  res.status(201).json({ success: true, message: 'Unit mobil ditambahkan.', data: unit });
}

async function updateUnit(req, res) {
  const data = validate(v.carUnitUpdateSchema, req.body, res);
  if (!data) return;
  const unit = await carsService.updateCarUnit(req.params.id, data);
  res.json({ success: true, message: 'Unit mobil diperbarui.', data: unit });
}

async function setUnitStatus(req, res) {
  const data = validate(v.unitStatusSchema, req.body, res);
  if (!data) return;
  const unit = await carsService.setCarUnitStatus(req.params.id, data.status);
  res.json({ success: true, message: 'Status unit diperbarui.', data: unit });
}

async function deleteUnit(req, res) {
  await carsService.deleteCarUnit(req.params.id);
  res.json({ success: true, message: 'Unit mobil dihapus.' });
}

module.exports = {
  listTypes,
  getType,
  createType,
  updateType,
  deleteType,
  uploadTypePhoto,
  deleteTypePhoto,
  getPhoto,
  listUnits,
  getUnit,
  createUnit,
  updateUnit,
  setUnitStatus,
  deleteUnit,
};
