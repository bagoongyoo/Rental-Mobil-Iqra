import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Navigation,
  User,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Upload,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import {
  MAX_CONDITION_PHOTO_BYTES,
  compressImageUnderLimit,
  fetchAuthorizedAsset,
  registerDriverApi,
  loginDriverApi,
  getMyDriverProfileApi,
  getDriverTasksApi,
} from '../api/driverApi';
import { useAuth } from '../../../lib/auth';
import { PhoneInput } from '../../../components/ui';
import { EMAIL_PATTERN, NAME_PATTERN, cleanEmail, cleanName } from '../../../lib/identity';
import { disconnectSocket } from '../../../lib/socket';

function getInitials(name) {
  if (!name || typeof name !== 'string') return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Halaman Profil, Login & Pendaftaran Driver (Mobile-First, High-Contrast Logistics UI)
 * - Ketika driver sudah login: menampilkan Profil & Kesiapan Akun Driver asli dari API.
 * - Ketika belum login: menampilkan form Masuk & Daftar Mitra Driver tanpa mengubah payload API.
 */
export function DriverRegisterPage({ onLoginSuccess }) {
  const navigate = useNavigate();
  const authUser = useAuth((s) => s.user);
  const authToken = useAuth((s) => s.token);
  const setAuthLogin = useAuth((s) => s.login);
  const setAuthLogout = useAuth((s) => s.logout);

  const isDriverLoggedIn = Boolean(
    (authToken && authUser?.role === 'DRIVER') ||
      (typeof window !== 'undefined' &&
        localStorage.getItem('token') &&
        (!authUser || authUser.role === 'DRIVER'))
  );

  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [driverProfile, setDriverProfile] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const profilePhotoUrlRef = useRef(profilePhotoUrl);
  profilePhotoUrlRef.current = profilePhotoUrl;

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
  const [compressingField, setCompressingField] = useState(null);

  useEffect(() => {
    return () => {
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDriverLoggedIn) {
      setDriverProfile(null);
      setActiveOrder(null);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    Promise.all([
      getMyDriverProfileApi(),
      getDriverTasksApi('active').catch(() => ({ data: [] })),
    ])
      .then(async ([profRes, tasksRes]) => {
        if (cancelled) return;
        const prof = profRes?.data || null;
        setDriverProfile(prof);
        const list = tasksRes?.data || [];
        setActiveOrder(
          list.find((o) => o.status === 'ONGOING') ||
            list.find((o) => o.status === 'CONFIRMED') ||
            null
        );

        if (prof?.driverProfile?.photoFilePath) {
          const asset = await fetchAuthorizedAsset('/drivers/me/photo');
          if (!cancelled && asset?.previewUrl) {
            setProfilePhotoUrl((prevUrl) => {
              if (prevUrl) URL.revokeObjectURL(prevUrl);
              return asset.previewUrl;
            });
          } else if (asset?.previewUrl) {
            URL.revokeObjectURL(asset.previewUrl);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setDriverProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isDriverLoggedIn]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Nama hanya huruf & spasi, email tanpa spasi + huruf kecil (lib/identity).
    const clean = name === 'name' ? cleanName(value) : name === 'email' ? cleanEmail(value) : value;
    setForm((prev) => ({ ...prev, [name]: clean }));
  };

  const handlePickRegisterPhoto = async (field, setter, event) => {
    const rawFile = event.target.files?.[0];
    if (!rawFile) return;

    setErrorMsg('');
    if (!rawFile.type.startsWith('image/')) {
      setErrorMsg('File yang dipilih harus berupa gambar.');
      event.target.value = '';
      return;
    }

    if (rawFile.size <= MAX_CONDITION_PHOTO_BYTES) {
      setter(rawFile);
      return;
    }

    // Kompres otomatis foto kamera di browser agar aman di bawah batas server
    setCompressingField(field);
    try {
      const compressed = await compressImageUnderLimit(rawFile, MAX_CONDITION_PHOTO_BYTES);
      setter(compressed);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setCompressingField(null);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!simPhoto || !profilePhoto) {
      setErrorMsg('Foto SIM dan Foto Diri wajib diunggah.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', form.name.trim());
      formData.append('email', form.email.trim().toLowerCase());
      formData.append('password', form.password);
      formData.append('phone', form.phone.trim());
      formData.append('address', form.address.trim());
      formData.append('licenseNumber', form.licenseNumber.trim());
      formData.append('simPhoto', simPhoto);
      formData.append('profilePhoto', profilePhoto);

      const res = await registerDriverApi(formData);
      setSuccessMsg(
        res.message ||
          'Pendaftaran berhasil dikirim! Akun Anda aktif setelah disetujui oleh Admin.'
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
      setMode('login');
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
        setAuthLogin(res.data.token, res.data.user);
      }

      if (typeof onLoginSuccess === 'function') {
        onLoginSuccess(res.data);
      } else {
        navigate('/driver');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    disconnectSocket();
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch {
      // Abaikan jika storage diblokir
    }
    setAuthLogout();
    setDriverProfile(null);
    setActiveOrder(null);
    setMode('login');
  };

  const showProfileView = isDriverLoggedIn && (profileLoading || driverProfile);

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#F3F3F2] font-sans text-[#1C1D1C]">
      <div className="w-full max-w-[440px] mx-auto px-4 pt-5 pb-28 space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-extrabold text-[#1C1D1C] leading-tight">
              {showProfileView ? 'Profil Driver' : 'Akun Mitra Driver'}
            </h1>
            <p className="text-xs text-[#575753] mt-0.5">
              {showProfileView
                ? 'Identitas operasional dan kesiapan akun kendaraan'
                : 'Masuk panel tugas atau registrasi mitra driver baru'}
            </p>
          </div>

          <div className="w-12 h-12 rounded-full bg-[#1C1D1C] text-white flex items-center justify-center font-extrabold text-sm shrink-0 overflow-hidden border border-[#E6E6E4]">
            {showProfileView && profilePhotoUrl ? (
              <img
                src={profilePhotoUrl}
                alt={driverProfile?.name || 'Foto Driver'}
                className="w-full h-full object-cover"
              />
            ) : showProfileView ? (
              <span aria-hidden="true">{getInitials(driverProfile?.name)}</span>
            ) : (
              <ShieldCheck className="w-5 h-5 text-[#C4F135]" aria-hidden="true" />
            )}
          </div>
        </header>

        {showProfileView ? (
          <div className="space-y-4">
            <section className="bg-[#1C1D1C] text-white rounded-[24px] p-5 space-y-4 shadow-[0_12px_28px_rgba(28,29,28,0.14)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9E9E99]">
                  STATUS KESIAPAN UNIT
                </span>
                <span className="px-3 py-1 rounded-full bg-[#2A2B2A] border border-[#3A3B3A] text-[#C4F135] text-xs font-extrabold">
                  {driverProfile?.isApproved ? 'Terverifikasi' : 'Menunggu Verifikasi'}
                </span>
              </div>

              {profileLoading && !driverProfile ? (
                <div className="h-6 w-48 bg-[#2E2F2E] rounded animate-pulse" />
              ) : (
                <h2 className="text-[17px] font-extrabold text-white leading-snug">
                  {activeOrder
                    ? `${activeOrder.carType?.name || 'Unit Rental'} • ${
                        activeOrder.carUnit?.plateNumber || '-'
                      }`
                    : 'Belum Ada Unit Aktif Ditugaskan'}
                </h2>
              )}

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#2E2F2E] text-xs">
                <div>
                  <p className="text-[#9E9E99] text-[11px]">Nomor SIM Aktif</p>
                  <p className="font-extrabold text-white tabular-nums mt-0.5 truncate">
                    {driverProfile?.driverProfile?.licenseNumber || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-[#9E9E99] text-[11px]">ID Driver</p>
                  <p className="font-extrabold text-white tabular-nums mt-0.5">
                    {driverProfile?.id
                      ? `DRV-${String(driverProfile.id).padStart(4, '0')}`
                      : '-'}
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-white border border-[#E6E6E4] rounded-[20px] p-5 space-y-3.5">
              <div>
                <p className="text-xs font-bold text-[#1C1D1C] mb-1.5">Nama Lengkap Driver</p>
                <div className="min-h-[44px] px-3.5 rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] flex items-center text-sm font-semibold text-[#1C1D1C]">
                  {driverProfile?.name || '-'}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-[#1C1D1C] mb-1.5">Email Akun</p>
                <div className="min-h-[44px] px-3.5 rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] flex items-center text-sm font-medium text-[#1C1D1C] break-all">
                  {driverProfile?.email || '-'}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-[#1C1D1C] mb-1.5">
                  Nomor Telepon / WhatsApp
                </p>
                <div className="min-h-[44px] px-3.5 rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] flex items-center text-sm font-semibold text-[#1C1D1C] tabular-nums">
                  {driverProfile?.phone || '-'}
                </div>
              </div>

              {driverProfile?.address && (
                <div>
                  <p className="text-xs font-bold text-[#1C1D1C] mb-1.5">Alamat Domisili</p>
                  <div className="min-h-[44px] py-2.5 px-3.5 rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] flex items-center text-xs font-medium text-[#1C1D1C]">
                    {driverProfile.address}
                  </div>
                </div>
              )}

              <div className="pt-2 space-y-2.5">
                <Link
                  to="/driver"
                  className="min-h-[48px] w-full px-4 rounded-[14px] bg-[#C4F135] hover:bg-[#b8e629] text-[#1C1D1C] text-sm font-extrabold inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                >
                  <span>Buka Dashboard Operasional</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="min-h-[44px] w-full px-4 rounded-[14px] bg-[#1C1D1C] hover:bg-[#2E2F2E] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  <span>Keluar dari Akun Driver</span>
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-[#1C1D1C] text-white rounded-[24px] p-5 space-y-1.5">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#C4F135] text-[#1C1D1C] text-[11px] font-extrabold uppercase tracking-wider">
                Operasional Driver
              </span>
              <h2 className="text-[18px] font-extrabold text-white pt-1">
                {mode === 'login' ? 'Masuk ke Panel Tugas & GPS' : 'Daftar Mitra Driver Baru'}
              </h2>
              <p className="text-xs text-[#A3A39E] leading-relaxed">
                {mode === 'login'
                  ? 'Gunakan email dan kata sandi driver yang telah disetujui oleh Admin.'
                  : 'Unggah data diri, nomor SIM, foto SIM, dan foto profil. Akun aktif setelah verifikasi Admin.'}
              </p>
            </div>

            <div className="bg-white border border-[#E6E6E4] rounded-[20px] p-1.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`min-h-[48px] rounded-[14px] text-xs font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C] ${
                  mode === 'login'
                    ? 'bg-[#1C1D1C] text-white'
                    : 'bg-transparent text-[#575753] hover:text-[#1C1D1C]'
                }`}
              >
                Login Driver
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`min-h-[48px] rounded-[14px] text-xs font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C] ${
                  mode === 'register'
                    ? 'bg-[#1C1D1C] text-white'
                    : 'bg-transparent text-[#575753] hover:text-[#1C1D1C]'
                }`}
              >
                Daftar Driver
              </button>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="rounded-[20px] p-4 bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] text-xs font-semibold flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                className="rounded-[20px] p-4 bg-white border border-[#1C1D1C] text-[#1C1D1C] text-xs font-semibold flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="bg-white border border-[#E6E6E4] rounded-[20px] p-5">
              {mode === 'login' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="driver-login-email"
                      className="block text-xs font-extrabold text-[#1C1D1C] mb-1.5"
                    >
                      Email Driver
                    </label>
                    <input
                      id="driver-login-email"
                      type="email"
                      name="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="nama@email.com"
                      className="min-h-[44px] w-full px-3.5 rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] text-sm text-[#1C1D1C] placeholder:text-[#787873] focus:bg-white focus:border-[#1C1D1C] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="driver-login-password"
                      className="block text-xs font-extrabold text-[#1C1D1C] mb-1.5"
                    >
                      Kata Sandi
                    </label>
                    <input
                      id="driver-login-password"
                      type="password"
                      name="password"
                      required
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Masukkan kata sandi"
                      className="min-h-[44px] w-full px-3.5 rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] text-sm text-[#1C1D1C] placeholder:text-[#787873] focus:bg-white focus:border-[#1C1D1C] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="min-h-[48px] w-full px-4 rounded-[14px] bg-[#C4F135] hover:bg-[#b8e629] disabled:opacity-60 text-[#1C1D1C] text-sm font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                  >
                    {loading ? 'Memeriksa Akun Driver...' : 'Masuk ke Panel Driver'}
                  </button>

                  <p className="text-center text-xs text-[#575753] pt-1">
                    Akun driver dari Admin juga dapat masuk lewat{' '}
                    <Link
                      to="/masuk"
                      className="font-extrabold text-[#1C1D1C] underline underline-offset-2"
                    >
                      Halaman Masuk Utama
                    </Link>
                    .
                  </p>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <div>
                    <label
                      htmlFor="reg-name"
                      className="block text-xs font-extrabold text-[#1C1D1C] mb-1.5"
                    >
                      Nama Lengkap Driver (Sesuai KTP/SIM) *
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      name="name"
                      required
                      minLength={2}
                      maxLength={100}
                      pattern={NAME_PATTERN}
                      data-guard-pattern="Nama hanya boleh berisi huruf dan spasi."
                      autoComplete="name"
                      value={form.name}
                      onChange={handleChange}
                      onBlur={() => setForm((prev) => ({ ...prev, name: prev.name.trim() }))}
                      placeholder="Masukkan nama lengkap"
                      className="min-h-[44px] w-full px-3.5 rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] text-sm text-[#1C1D1C] placeholder:text-[#787873] focus:bg-white focus:border-[#1C1D1C] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="reg-email"
                        className="block text-xs font-extrabold text-[#1C1D1C] mb-1.5"
                      >
                        Email *
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        name="email"
                        required
                        pattern={EMAIL_PATTERN}
                        data-guard-pattern="Email belum lengkap (contoh: nama@email.com)."
                        autoComplete="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="driver@email.com"
                        className="min-h-[44px] w-full px-3.5 rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] text-sm text-[#1C1D1C] placeholder:text-[#787873] focus:bg-white focus:border-[#1C1D1C] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="reg-phone"
                        className="block text-xs font-extrabold text-[#1C1D1C] mb-1.5"
                      >
                        Nomor Telepon / WhatsApp *
                      </label>
                      {/* Kode negara + bendera (default +62), hasil "+62 812 2941 9850" */}
                      <PhoneInput
                        id="reg-phone"
                        required
                        value={form.phone}
                        onChange={(phone) => setForm((prev) => ({ ...prev, phone }))}
                        boxClassName="h-11 w-full flex items-center rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] text-sm text-[#1C1D1C] focus-within:bg-white focus-within:border-[#1C1D1C]"
                        inputClassName="placeholder:text-[#787873]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-password"
                      className="block text-xs font-extrabold text-[#1C1D1C] mb-1.5"
                    >
                      Kata Sandi *
                    </label>
                    <input
                      id="reg-password"
                      type="password"
                      name="password"
                      required
                      minLength={8}
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Minimal 8 karakter"
                      className="min-h-[44px] w-full px-3.5 rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] text-sm text-[#1C1D1C] placeholder:text-[#787873] focus:bg-white focus:border-[#1C1D1C] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reg-license"
                      className="block text-xs font-extrabold text-[#1C1D1C] mb-1.5"
                    >
                      Nomor SIM A / B1 Aktif *
                    </label>
                    <input
                      id="reg-license"
                      type="text"
                      name="licenseNumber"
                      required
                      value={form.licenseNumber}
                      onChange={handleChange}
                      placeholder="Masukkan nomor SIM"
                      className="min-h-[44px] w-full px-3.5 rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] text-sm text-[#1C1D1C] tabular-nums placeholder:text-[#787873] focus:bg-white focus:border-[#1C1D1C] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reg-address"
                      className="block text-xs font-extrabold text-[#1C1D1C] mb-1.5"
                    >
                      Alamat Domisili *
                    </label>
                    <textarea
                      id="reg-address"
                      name="address"
                      rows={2}
                      required
                      value={form.address}
                      onChange={handleChange}
                      placeholder="Alamat tempat tinggal saat ini"
                      className="w-full py-2.5 px-3.5 rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] text-sm text-[#1C1D1C] placeholder:text-[#787873] focus:bg-white focus:border-[#1C1D1C] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <label className="min-h-[44px] rounded-[14px] border border-dashed border-[#B8B8B2] bg-[#F7F7F6] hover:bg-[#EFEFED] p-3 cursor-pointer flex flex-col justify-center gap-1 transition">
                      <span className="text-xs font-extrabold text-[#1C1D1C] inline-flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Foto SIM *</span>
                      </span>
                      <span className="text-[11px] text-[#575753] truncate">
                        {compressingField === 'simPhoto'
                          ? 'Mengompres foto...'
                          : simPhoto
                          ? `${simPhoto.name} (${Math.max(1, Math.round(simPhoto.size / 1024))} KB)`
                          : 'Pilih foto SIM aktif'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        required
                        onChange={(e) => handlePickRegisterPhoto('simPhoto', setSimPhoto, e)}
                        className="sr-only"
                      />
                    </label>

                    <label className="min-h-[44px] rounded-[14px] border border-dashed border-[#B8B8B2] bg-[#F7F7F6] hover:bg-[#EFEFED] p-3 cursor-pointer flex flex-col justify-center gap-1 transition">
                      <span className="text-xs font-extrabold text-[#1C1D1C] inline-flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Foto Diri *</span>
                      </span>
                      <span className="text-[11px] text-[#575753] truncate">
                        {compressingField === 'profilePhoto'
                          ? 'Mengompres foto...'
                          : profilePhoto
                          ? `${profilePhoto.name} (${Math.max(1, Math.round(profilePhoto.size / 1024))} KB)`
                          : 'Pilih foto profil driver'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        required
                        onChange={(e) =>
                          handlePickRegisterPhoto('profilePhoto', setProfilePhoto, e)
                        }
                        className="sr-only"
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || Boolean(compressingField)}
                    className="min-h-[48px] w-full px-4 rounded-[14px] bg-[#C4F135] hover:bg-[#b8e629] disabled:opacity-60 text-[#1C1D1C] text-sm font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                  >
                    {loading ? 'Mengirim Pendaftaran...' : 'Kirim Pendaftaran Driver'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Navigation */}
      <div className="fixed bottom-4 inset-x-0 z-40 pointer-events-none px-4">
        <nav
          aria-label="Navigasi utama driver"
          className="pointer-events-auto max-w-[300px] mx-auto bg-[#1C1D1C] p-1.5 rounded-full shadow-[0_12px_30px_rgba(28,29,28,0.28)] border border-[#2E2F2E] grid grid-cols-2 gap-1.5"
        >
          <Link
            to="/driver"
            className="min-h-[44px] px-4 rounded-full text-[#D4D4CF] hover:text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4F135]"
          >
            <Navigation className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Dashboard</span>
          </Link>

          <Link
            to="/driver/daftar"
            aria-current="page"
            className="min-h-[44px] px-4 rounded-full bg-[#C4F135] text-[#1C1D1C] text-xs font-extrabold inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4F135]"
          >
            <User className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Profil</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}

export default DriverRegisterPage;
