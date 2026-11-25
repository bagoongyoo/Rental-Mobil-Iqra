const authService = require('./auth.service');
const { registerSchema, loginSchema } = require('./auth.validation');

function validate(schema, body, res) {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({
      success: false,
      message: 'Data tidak valid.',
      errors: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return null;
  }
  return result.data;
}

// Express 5 meneruskan error dari handler async ke global error handler di app.js.
async function register(req, res) {
  const data = validate(registerSchema, req.body, res);
  if (!data) return;

  const { user, token } = await authService.register(data);
  res.status(201).json({
    success: true,
    message: token
      ? 'Registrasi berhasil.'
      : 'Registrasi berhasil. Akun driver menunggu persetujuan admin.',
    data: { user, token },
  });
}

async function login(req, res) {
  const data = validate(loginSchema, req.body, res);
  if (!data) return;

  const { user, token } = await authService.login(data);
  res.json({ success: true, message: 'Login berhasil.', data: { user, token } });
}

async function me(req, res) {
  const user = await authService.getMe(req.user.id);
  res.json({ success: true, data: { user } });
}

module.exports = { register, login, me };
