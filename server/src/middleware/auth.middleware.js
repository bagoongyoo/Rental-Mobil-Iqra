const jwt = require('jsonwebtoken');

/**
 * Middleware untuk memverifikasi token JWT dari header Authorization: Bearer <token>
 */
function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak. Token autentikasi tidak ditemukan.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded; // { id, email, role, ... }
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token tidak valid atau sudah kedaluwarsa.',
    });
  }
}

/**
 * Middleware untuk membatasi akses berdasarkan Role (ADMIN, CUSTOMER, DRIVER)
 * Contoh pemakaian: router.get('/admin-only', requireAuth, requireRole('ADMIN'), handler)
 */
function requireRole(...allowedRoles) {
  const roles = allowedRoles.flat();
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Silakan login terlebih dahulu.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki izin untuk mengakses resource ini.',
      });
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
