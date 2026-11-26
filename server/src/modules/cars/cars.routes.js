// Master data mobil (Dev 1).
// Publik : GET /types, GET /types/:id, GET /photos/:file
// Admin  : CRUD tipe, foto tipe, CRUD unit, ubah status unit
const { Router } = require('express');
const multer = require('multer');
const controller = require('./cars.controller');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');

const router = Router();
const adminOnly = [requireAuth, requireRole('ADMIN')];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // maks. 5 MB sebelum diubah ke WebP
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// ---------- Publik ----------
router.get('/types', controller.listTypes);
router.get('/types/:id', controller.getType);
router.get('/photos/:file', controller.getPhoto);

// ---------- Admin: tipe ----------
router.post('/types', adminOnly, controller.createType);
router.put('/types/:id', adminOnly, controller.updateType);
router.delete('/types/:id', adminOnly, controller.deleteType);
router.post('/types/:id/photo', adminOnly, upload.single('photo'), controller.uploadTypePhoto);
router.delete('/types/:id/photo', adminOnly, controller.deleteTypePhoto);

// ---------- Admin: unit ----------
router.get('/units', adminOnly, controller.listUnits);
router.get('/units/:id', adminOnly, controller.getUnit);
router.post('/units', adminOnly, controller.createUnit);
router.put('/units/:id', adminOnly, controller.updateUnit);
router.patch('/units/:id/status', adminOnly, controller.setUnitStatus);
router.delete('/units/:id', adminOnly, controller.deleteUnit);

module.exports = router;
