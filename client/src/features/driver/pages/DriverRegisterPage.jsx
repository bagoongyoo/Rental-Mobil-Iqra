// Halaman Profil, Login & Pendaftaran Driver (logika Dev 3).
// - Sudah login sebagai driver: profil & kesiapan akun dari API.
// - Belum login: form Masuk & Daftar Mitra Driver (payload API tidak berubah).
// Tampilan memakai komponen & tema yang sama dengan dashboard lain (terang/gelap, ID/EN).
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, CheckCircle2, LogOut, ShieldCheck, Upload } from 'lucide-react';
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
      return undefined;
    }

    let cancelled = false;
    setProfileLoading(true);
    Promise.all([getMyDriverProfileApi(), getDriverTasksApi('active').catch(() => ({ data: [] }))])
      .then(async ([profRes, tasksRes]) => {
        if (cancelled) return;
        const prof = profRes?.data || null;
        setDriverProfile(prof);
        const list = tasksRes?.data || [];
        setActiveOrder(list.find((o) => o.status === 'ONGOING') || list.find((o) => o.status === 'CONFIRMED') || null);

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

  // ---------- Profil driver ----------
  if (showProfileView) {
    const rows = [
      [t('driver.account.name'), driverProfile?.name],
      [t('driver.account.email'), driverProfile?.email],
      [t('driver.account.phone'), driverProfile?.phone],
      [t('driver.account.address'), driverProfile?.address],
    ].filter(([, v]) => v);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-100 text-base font-bold text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
            {profilePhotoUrl ? <img src={profilePhotoUrl} alt={driverProfile?.name || ''} className="h-full w-full object-cover" /> : <span aria-hidden="true">{getInitials(driverProfile?.name)}</span>}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('driver.account.profileTitle')}</h1>
            <p className="text-sm text-slate-500">{t('driver.account.profileSub')}</p>
          </div>
        </div>

        {profileLoading && !driverProfile ? (
          <div className="card">
            <Spinner />
          </div>
        ) : (
          <>
            <section className="card space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t('driver.account.readiness')}</span>
                <Badge tone={driverProfile?.isApproved ? 'brand' : 'amber'}>
                  {driverProfile?.isApproved ? t('driver.account.verified') : t('driver.account.pendingVerify')}
                </Badge>
              </div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {activeOrder ? `${activeOrder.carType?.name || t('driver.tasks.unitFallback')} · ${activeOrder.carUnit?.plateNumber || '-'}` : t('driver.account.noActiveUnit')}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
                  <dt className="text-xs text-slate-500">{t('driver.account.sim')}</dt>
                  <dd className="truncate font-semibold text-slate-900 tabular-nums dark:text-white">{driverProfile?.driverProfile?.licenseNumber || '-'}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
                  <dt className="text-xs text-slate-500">{t('driver.account.driverId')}</dt>
                  <dd className="font-semibold text-slate-900 tabular-nums dark:text-white">{driverProfile?.id ? `DRV-${String(driverProfile.id).padStart(4, '0')}` : '-'}</dd>
                </div>
              </dl>
            </section>

            <section className="card divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(([k, v]) => (
                <div key={k} className="px-4 py-3">
                  <p className="text-xs text-slate-500">{k}</p>
                  <p className="font-semibold break-words text-slate-900 dark:text-white">{v}</p>
                </div>
              ))}
            </section>

            <div className="space-y-2">
              <Button as={Link} to="/driver" size="lg" className="w-full">
                {t('driver.account.openDashboard')} <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="secondary" className="w-full text-red-600 dark:text-red-400" onClick={logout}>
                <LogOut className="h-4 w-4" /> {t('driver.nav.logout')}
              </Button>
            </div>
          </>
        )}
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
