// Halaman Profil, Login & Pendaftaran Driver (logika Dev 3).
// - Sudah login sebagai driver: profil & kesiapan akun dari API.
// - Belum login: form Masuk & Daftar Mitra Driver (payload API tidak berubah).
// Tampilan memakai komponen & tema yang sama dengan dashboard lain (terang/gelap, ID/EN).
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ListChecks,
  LogOut,
  ShieldCheck,
  Upload,
  UserRound,
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
import { Badge, Button, Field, PhoneInput, Segmented, Spinner } from '../../../components/ui';
import { EMAIL_PATTERN, NAME_PATTERN, cleanEmail, cleanName } from '../../../lib/identity';
import { useDriverLogout } from '../DriverLayout';

function getInitials(name) {
  if (!name || typeof name !== 'string') return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const EMPTY_FORM = { name: '', email: '', password: '', phone: '', address: '', licenseNumber: '' };

/** Pilih foto (SIM / foto diri) dengan tampilan kartu bergaris putus-putus. */
function PhotoPicker({ label, emptyText, file, compressing, compressingText, onPick }) {
  return (
    <label className="flex min-h-[64px] cursor-pointer flex-col justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 transition hover:border-brand-400 dark:border-slate-700 dark:bg-slate-800/50">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
        <Upload className="h-4 w-4 text-brand-600" />
        {label} <span className="text-red-600">*</span>
      </span>
      <span className="truncate text-xs text-slate-500">
        {compressing ? compressingText : file ? `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)` : emptyText}
      </span>
      <input type="file" accept="image/*" required onChange={onPick} className="sr-only" />
    </label>
  );
}

export function DriverRegisterPage({ onLoginSuccess }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const authUser = useAuth((s) => s.user);
  const authToken = useAuth((s) => s.token);
  const setAuthLogin = useAuth((s) => s.login);
  const logout = useDriverLogout();

  const isDriverLoggedIn = Boolean(
    (authToken && authUser?.role === 'DRIVER') ||
      (typeof window !== 'undefined' && localStorage.getItem('token') && (!authUser || authUser.role === 'DRIVER'))
  );

  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [driverProfile, setDriverProfile] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [taskStats, setTaskStats] = useState({ today: 0, active: 0, completed: 0 });
  const [expandedMenu, setExpandedMenu] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const profilePhotoUrlRef = useRef(profilePhotoUrl);
  profilePhotoUrlRef.current = profilePhotoUrl;

  const [form, setForm] = useState(EMPTY_FORM);
  const [simPhoto, setSimPhoto] = useState(null);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [compressingField, setCompressingField] = useState(null);

  useEffect(() => {
    return () => {
      if (profilePhotoUrlRef.current) URL.revokeObjectURL(profilePhotoUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isDriverLoggedIn) {
      setDriverProfile(null);
      setActiveOrder(null);
      setTaskStats({ today: 0, active: 0, completed: 0 });
      return undefined;
    }

    let cancelled = false;
    setProfileLoading(true);
    Promise.all([
      getMyDriverProfileApi(),
      getDriverTasksApi('today').catch(() => ({ data: [] })),
      getDriverTasksApi('active').catch(() => ({ data: [] })),
      getDriverTasksApi('history').catch(() => ({ data: [] })),
    ])
      .then(async ([profRes, todayRes, activeRes, historyRes]) => {
        if (cancelled) return;
        const prof = profRes?.data || null;
        setDriverProfile(prof);
        const todayList = todayRes?.data || [];
        const activeList = activeRes?.data || [];
        const historyList = historyRes?.data || [];

        setActiveOrder(
          activeList.find((o) => o.status === 'ONGOING') || activeList.find((o) => o.status === 'CONFIRMED') || null
        );
        setTaskStats({
          today: todayList.length,
          active: activeList.length,
          completed: historyList.filter((o) => o.status === 'COMPLETED').length,
        });

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
      setErrorMsg(t('driver.account.notImage'));
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
      setErrorMsg(t('driver.account.photosRequired'));
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

      await registerDriverApi(formData);
      setSuccessMsg(t('driver.account.registered'));
      setForm(EMPTY_FORM);
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
      const res = await loginDriverApi({ email: form.email, password: form.password });

      if (res.data?.token) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        setAuthLogin(res.data.token, res.data.user);
      }

      if (typeof onLoginSuccess === 'function') onLoginSuccess(res.data);
      else navigate('/driver');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const showProfileView = isDriverLoggedIn && (profileLoading || driverProfile);

  // ---------- Profil driver (struktur header avatar terpusat + kartu progres & 3 metrik + kartu menu) ----------
  if (showProfileView) {
    const infoRows = [
      [t('driver.account.name'), driverProfile?.name],
      [t('driver.account.email'), driverProfile?.email],
      [t('driver.account.phone'), driverProfile?.phone],
      [t('driver.account.address'), driverProfile?.address],
    ].filter(([, v]) => v);

    const isApproved = Boolean(driverProfile?.isApproved);
    const hasLicense = Boolean(driverProfile?.driverProfile?.licenseNumber);
    const isReady = Boolean(driverProfile?.driverProfile?.isReady);
    const readinessDone = [isApproved, hasLicense, isReady].filter(Boolean).length;
    const readinessPercent = Math.round((readinessDone / 3) * 100);
    const driverCode = driverProfile?.id ? `DRV-${String(driverProfile.id).padStart(4, '0')}` : '-';
    const simNumber = driverProfile?.driverProfile?.licenseNumber || '-';
    const totalTasks = Math.max(1, taskStats.today + taskStats.active + taskStats.completed);

    const toggleSection = (key) => setExpandedMenu((prev) => (prev === key ? null : key));

    return (
      <div className="mx-auto max-w-md md:max-w-lg">
        <div className="overflow-hidden rounded-[28px] border border-brand-700/40 bg-brand-800 px-4 pt-5 pb-5 text-white shadow-sm dark:border-slate-800 dark:bg-brand-950">
          {/* Header judul kiri + subtitle */}
          <header className="px-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              {t('driver.account.profileTitle')}
            </h1>
            <p className="mt-0.5 text-xs text-brand-100/80">{t('driver.account.profileSub')}</p>
          </header>

          {/* Avatar terpusat dengan cincin ganda + nama driver */}
          <div className="mt-5 flex flex-col items-center text-center">
            <div className="rounded-full border-2 border-brand-200/60 p-1.5 dark:border-brand-500/50">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-brand-100 text-2xl font-extrabold text-brand-900 dark:bg-brand-900/90 dark:text-brand-100">
                {profilePhotoUrl ? (
                  <img src={profilePhotoUrl} alt={driverProfile?.name || ''} className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden="true">{getInitials(driverProfile?.name)}</span>
                )}
              </div>
            </div>
            <h2 className="mt-3 text-lg font-bold tracking-tight text-white">
              {driverProfile?.name || t('driver.profile.fallbackName')}
            </h2>
            <p className="mt-0.5 text-xs text-brand-100/80 tabular-nums">
              {driverCode} · {isApproved ? t('driver.account.verified') : t('driver.account.pendingVerify')}
            </p>
          </div>

          {profileLoading && !driverProfile ? (
            <div className="mt-5 rounded-[24px] bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
              <Spinner />
            </div>
          ) : (
            <div className="mt-5 space-y-3.5">
              {/* Kartu 1: Progres Kesiapan & 3 Ringkasan Tugas (struktur Today's Progress + 3 mini tile) */}
              <section
                aria-label={t('driver.account.readiness')}
                className="rounded-[24px] border border-white/10 bg-white p-4 text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                    {t('driver.account.readiness')}
                  </h3>
                  <Badge tone={isApproved ? 'brand' : 'amber'}>
                    {isApproved ? t('driver.account.verified') : t('driver.account.pendingVerify')}
                  </Badge>
                </div>

                {/* Bar progres utama */}
                <div className="mt-3.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-slate-600 dark:text-slate-300">
                      {isReady ? t('driver.gps.state.active') : t('driver.gps.off')}
                    </span>
                    <span className="shrink-0 font-extrabold text-brand-700 tabular-nums dark:text-brand-400">
                      {readinessDone} / 3
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-brand-700 transition-all duration-300 dark:bg-brand-500"
                      style={{ width: `${readinessPercent}%` }}
                    />
                  </div>
                </div>

                {/* 3 Mini Metric Tiles (Hari ini / Aktif / Selesai) */}
                <div className="mt-4 grid grid-cols-3 gap-2.5">
                  {[
                    {
                      label: t('driver.tasks.filter.today'),
                      value: taskStats.today,
                      barWidth: Math.min(100, Math.round((taskStats.today / totalTasks) * 100)),
                      barColor: 'bg-brand-600 dark:bg-brand-500',
                    },
                    {
                      label: t('driver.tasks.filter.active'),
                      value: taskStats.active,
                      barWidth: Math.min(100, Math.round((taskStats.active / totalTasks) * 100)),
                      barColor: 'bg-sky-600 dark:bg-sky-400',
                    },
                    {
                      label: t('status.COMPLETED'),
                      value: taskStats.completed,
                      barWidth: Math.min(100, Math.round((taskStats.completed / totalTasks) * 100)),
                      barColor: 'bg-amber-500 dark:bg-amber-400',
                    },
                  ].map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-2xl border border-slate-200/80 bg-slate-50 px-2.5 py-3 text-center dark:border-slate-800 dark:bg-slate-800/70"
                    >
                      <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{metric.label}</p>
                      <p className="mt-0.5 text-sm font-extrabold text-slate-900 tabular-nums dark:text-white">
                        {metric.value}
                      </p>
                      <div className="mx-auto mt-2 h-1.5 w-10 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className={`h-full rounded-full ${metric.barColor}`}
                          style={{ width: `${metric.value > 0 ? Math.max(25, metric.barWidth) : 15}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Kartu 2: Daftar Menu & Aksi Profil (struktur kartu menu berikon + Logout merah di bawah) */}
              <section
                aria-label={t('driver.account.profileTitle')}
                className="overflow-hidden rounded-[24px] border border-white/10 bg-white text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {/* Baris 1: Buka Dashboard Tugas */}
                  <Link
                    to="/driver"
                    className="flex min-h-14 items-center gap-3.5 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/60"
                  >
                    <ListChecks className="h-5 w-5 shrink-0 text-slate-600 dark:text-slate-300" />
                    <span className="min-w-0 flex-1 truncate">{t('driver.account.openDashboard')}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>

                  {/* Baris 2: Informasi Akun (dapat dibuka/tutup untuk melihat Nama, Email, HP, Alamat) */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleSection('identity')}
                      aria-expanded={expandedMenu === 'identity'}
                      className="flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/60"
                    >
                      <UserRound className="h-5 w-5 shrink-0 text-slate-600 dark:text-slate-300" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{t('driver.account.profileTitle')}</p>
                        <p className="truncate text-xs font-normal text-slate-500 dark:text-slate-400">
                          {driverProfile?.email || '-'}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                          expandedMenu === 'identity' ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {expandedMenu === 'identity' && (
                      <dl className="space-y-2.5 border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                        {infoRows.map(([k, v]) => (
                          <div key={k} className="flex items-start justify-between gap-3">
                            <dt className="shrink-0 text-slate-500 dark:text-slate-400">{k}</dt>
                            <dd className="text-right font-semibold break-words text-slate-900 tabular-nums dark:text-white">
                              {v}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>

                  {/* Baris 3: SIM, ID Driver & Unit Aktif */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleSection('readiness')}
                      aria-expanded={expandedMenu === 'readiness'}
                      className="flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/60"
                    >
                      <ShieldCheck className="h-5 w-5 shrink-0 text-slate-600 dark:text-slate-300" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{t('driver.account.sim')} &amp; {t('driver.account.driverId')}</p>
                        <p className="truncate text-xs font-normal text-slate-500 tabular-nums dark:text-slate-400">
                          {simNumber} · {driverCode}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                          expandedMenu === 'readiness' ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {expandedMenu === 'readiness' && (
                      <dl className="space-y-2.5 border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                        <div className="flex items-start justify-between gap-3">
                          <dt className="shrink-0 text-slate-500 dark:text-slate-400">{t('driver.account.sim')}</dt>
                          <dd className="text-right font-semibold text-slate-900 tabular-nums dark:text-white">
                            {simNumber}
                          </dd>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <dt className="shrink-0 text-slate-500 dark:text-slate-400">{t('driver.account.driverId')}</dt>
                          <dd className="text-right font-semibold text-slate-900 tabular-nums dark:text-white">
                            {driverCode}
                          </dd>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <dt className="shrink-0 text-slate-500 dark:text-slate-400">{t('driver.account.readiness')}</dt>
                          <dd className="text-right font-semibold text-slate-900 dark:text-white">
                            {activeOrder
                              ? `${activeOrder.carType?.name || t('driver.tasks.unitFallback')} · ${activeOrder.carUnit?.plateNumber || '-'}`
                              : t('driver.account.noActiveUnit')}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>

                  {/* Baris 4: Keluar (aksen merah) */}
                  <button
                    type="button"
                    onClick={logout}
                    className="flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50/70 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <LogOut className="h-5 w-5 shrink-0" />
                    <span>{t('driver.nav.logout')}</span>
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- Masuk / daftar ----------
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{mode === 'login' ? t('driver.account.loginTitle') : t('driver.account.registerTitle')}</h1>
          <p className="text-sm text-slate-500">{mode === 'login' ? t('driver.account.loginText') : t('driver.account.registerText')}</p>
        </div>
      </div>

      <Segmented
        className="w-full"
        value={mode}
        onChange={switchMode}
        options={[
          { value: 'login', label: t('driver.account.tabLogin') },
          { value: 'register', label: t('driver.account.tabRegister') },
        ]}
      />

      {errorMsg && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div role="status" className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-900 dark:bg-brand-950/50 dark:text-brand-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="card p-4 sm:p-5">
        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-3">
            <Field label={t('driver.account.email')}>
              <input id="driver-login-email" className="input" type="email" name="email" required autoComplete="email" value={form.email} onChange={handleChange} placeholder="nama@email.com" />
            </Field>
            <Field label={t('auth.password')}>
              <input id="driver-login-password" className="input" type="password" name="password" required autoComplete="current-password" value={form.password} onChange={handleChange} placeholder={t('driver.account.passwordPlaceholder')} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {loading ? t('driver.account.loggingIn') : t('driver.account.loginButton')}
            </Button>
            <p className="pt-1 text-center text-sm text-slate-500">
              {t('driver.account.mainLoginHint')}{' '}
              <Link to="/masuk" className="font-bold text-brand-700 dark:text-brand-400">{t('driver.account.mainLoginLink')}</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <Field label={t('driver.account.nameLabel')} hint={t('auth.nameHint')}>
              <input
                id="reg-name"
                className="input"
                type="text"
                name="name"
                required
                minLength={2}
                maxLength={100}
                pattern={NAME_PATTERN}
                data-guard-pattern={t('validation.name')}
                autoComplete="name"
                value={form.name}
                onChange={handleChange}
                onBlur={() => setForm((prev) => ({ ...prev, name: prev.name.trim() }))}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('driver.account.email')}>
                <input
                  id="reg-email"
                  className="input"
                  type="email"
                  name="email"
                  required
                  pattern={EMAIL_PATTERN}
                  data-guard-pattern={t('validation.emailFull')}
                  autoComplete="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="nama@email.com"
                />
              </Field>
              {/* <div>, bukan <label>: supaya klik teks label tidak membuka daftar negara */}
              <div>
                <label htmlFor="reg-phone" className="field-label">{t('driver.account.phone')}</label>
                <PhoneInput id="reg-phone" required value={form.phone} onChange={(phone) => setForm((prev) => ({ ...prev, phone }))} />
              </div>
            </div>
            <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
              <input id="reg-password" className="input" type="password" name="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={handleChange} />
            </Field>
            <Field label={t('driver.account.license')}>
              <input id="reg-license" className="input tabular-nums" type="text" name="licenseNumber" required minLength={5} maxLength={30} value={form.licenseNumber} onChange={handleChange} placeholder={t('driver.account.licensePlaceholder')} />
            </Field>
            <Field label={t('driver.account.address')}>
              <textarea id="reg-address" className="input" name="address" rows={2} required maxLength={255} value={form.address} onChange={handleChange} placeholder={t('driver.account.addressPlaceholder')} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <PhotoPicker
                label={t('driver.account.simPhoto')}
                emptyText={t('driver.account.simPick')}
                file={simPhoto}
                compressing={compressingField === 'simPhoto'}
                compressingText={t('driver.account.compressing')}
                onPick={(e) => handlePickRegisterPhoto('simPhoto', setSimPhoto, e)}
              />
              <PhotoPicker
                label={t('driver.account.selfPhoto')}
                emptyText={t('driver.account.selfPick')}
                file={profilePhoto}
                compressing={compressingField === 'profilePhoto'}
                compressingText={t('driver.account.compressing')}
                onPick={(e) => handlePickRegisterPhoto('profilePhoto', setProfilePhoto, e)}
              />
            </div>
            <Button type="submit" size="lg" className="w-full" loading={loading} disabled={Boolean(compressingField)}>
              {loading ? t('driver.account.submitting') : t('driver.account.submit')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default DriverRegisterPage;
