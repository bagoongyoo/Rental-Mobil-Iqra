import React, { useState } from 'react';
import { registerDriverApi, loginDriverApi } from '../api/driverApi';

/**
 * Halaman Pendaftaran & Login Driver (Mobile-First)
 * - Pendaftaran: data diri, nomor SIM, upload foto SIM & foto profil.
 * - Akun hanya aktif setelah disetujui Admin (jika belum disetujui, login ditolak).
 */
export function DriverRegisterPage({ onLoginSuccess }) {
  const [mode, setMode] = useState('register'); // 'register' | 'login'
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // State form registrasi
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    address: '',
    licenseNumber: '',
  });
  const [simPhoto, setSimPhoto] = useState(null);
  const [profilePhoto, setProfilePhoto] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!simPhoto || !profilePhoto) {
      setErrorMsg('Foto SIM dan Foto Profil wajib diunggah.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('email', form.email);
      formData.append('password', form.password);
      formData.append('phone', form.phone);
      formData.append('address', form.address);
      formData.append('licenseNumber', form.licenseNumber);
      formData.append('simPhoto', simPhoto);
      formData.append('profilePhoto', profilePhoto);

      const res = await registerDriverApi(formData);
      setSuccessMsg(
        res.message ||
          'Pendaftaran berhasil! Akun Anda sedang menunggu persetujuan Admin sebelum dapat digunakan login.'
      );
      setForm({
        name: '',
        email: '',
        password: '',
        phone: '',
        address: '',
        licenseNumber: '',
      });
      setSimPhoto(null);
      setProfilePhoto(null);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await loginDriverApi({
        email: form.email,
        password: form.password,
      });

      if (res.data?.token) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
      }

      if (typeof onLoginSuccess === 'function') {
        onLoginSuccess(res.data);
      } else {
        setSuccessMsg('Login berhasil! Mengalihkan ke Panel Tugas Driver...');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col justify-center py-6 px-4 sm:px-6">
      <div className="max-w-md w-full mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 p-6">
        <div className="text-center mb-6">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 mb-2">
            MITRA DRIVER — RENTAL MOBIL IQRA
          </span>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {mode === 'register' ? 'Pendaftaran Mitra Driver' : 'Masuk Panel Driver'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {mode === 'register'
              ? 'Lengkapi data diri, SIM, dan foto. Akun aktif setelah disetujui Admin.'
              : 'Masuk untuk melihat jadwal tugas hari ini dan mengaktifkan GPS.'}
          </p>
        </div>

        {/* Toggle Tab Daftar / Masuk */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-700 rounded-xl mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-2 text-sm font-medium rounded-lg transition ${
              mode === 'register'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Daftar Driver
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-2 text-sm font-medium rounded-lg transition ${
              mode === 'login'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Login Driver
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
            ✅ {successMsg}
          </div>
        )}

        {mode === 'register' ? (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nama Lengkap (Sesuai KTP/SIM) *
              </label>
              <input
                type="text"
                name="name"
                required
                value={form.name}
                onChange={handleChange}
                placeholder="Contoh: Budi Santoso"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="driver@email.com"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  No. WhatsApp / HP *
                </label>
                <input
                  type="tel"
                  name="phone"
                  required
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="0812xxxxxxxx"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password *
              </label>
              <input
                type="password"
                name="password"
                required
                minLength={6}
                value={form.password}
                onChange={handleChange}
                placeholder="Minimal 6 karakter"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nomor SIM A / B1 *
              </label>
              <input
                type="text"
                name="licenseNumber"
                required
                value={form.licenseNumber}
                onChange={handleChange}
                placeholder="Masukkan nomor SIM aktif"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Alamat Domisili *
              </label>
              <textarea
                name="address"
                rows={2}
                required
                value={form.address}
                onChange={handleChange}
                placeholder="Alamat lengkap saat ini"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Upload Foto SIM *
                </label>
                <input
                  type="file"
                  accept="image/*"
                  required
                  onChange={(e) => setSimPhoto(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Upload Foto Diri *
                </label>
                <input
                  type="file"
                  accept="image/*"
                  required
                  onChange={(e) => setProfilePhoto(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm shadow-sm transition"
            >
              {loading ? 'Mengirim Pendaftaran...' : 'Kirim Pendaftaran Driver'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Driver
              </label>
              <input
                type="email"
                name="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="driver@email.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password
              </label>
              <input
                type="password"
                name="password"
                required
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm shadow-sm transition"
            >
              {loading ? 'Memeriksa Akun...' : 'Masuk ke Panel Driver'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default DriverRegisterPage;
