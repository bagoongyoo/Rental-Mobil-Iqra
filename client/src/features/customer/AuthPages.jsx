import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { homeFor, useAuth } from '../../lib/auth';
import { Button, ErrorNote, Field } from '../../components/ui';

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-8 sm:py-14">
      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{title}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">{subtitle}</p>
      <div className="card p-5">{children}</div>
      {footer && <div className="mt-5 text-center text-sm text-slate-500">{footer}</div>}
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, login } = useAuth();
  const [alreadyIn] = useState(() => Boolean(user)); // hanya alihkan jika sudah login sebelum membuka halaman ini
  const [form, setForm] = useState({ email: '', password: '' });
  const next = params.get('next');
  const m = useMutation({
    mutationFn: () => api('/auth/login', { method: 'POST', body: form }),
    onSuccess: ({ token, user: u }) => {
      login(token, u);
      navigate(next && u.role === 'CUSTOMER' ? next : homeFor(u.role), { replace: true });
    },
  });
  if (alreadyIn && user) return <Navigate to={homeFor(user.role)} replace />;

  return (
    <AuthShell
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={<>{t('auth.noAccount')} <Link to={`/daftar${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-bold text-brand-700 dark:text-brand-400">{t('auth.registerLink')}</Link></>}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Email"><input className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label={t('auth.password')}><input className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <p className="-mt-1 text-right text-sm"><Link to="/lupa-sandi" className="font-semibold text-brand-700 dark:text-brand-400">{t('security.forgotLink')}</Link></p>
        <ErrorNote error={m.error} />
        <Button type="submit" size="lg" className="w-full" loading={m.isPending}>{t('nav.login')}</Button>
      </form>
      <p className="mt-4 text-center text-xs text-slate-500">{t('auth.roleHint')}</p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useAuth((s) => s.login);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const m = useMutation({
    mutationFn: () => api('/auth/register', { method: 'POST', body: form }),
    onSuccess: ({ token, user }) => {
      login(token, user);
      navigate(params.get('next') || '/dasbor', { replace: true });
    },
  });
  const err = m.error?.details || {};
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthShell
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={<>{t('auth.haveAccount')} <Link to="/masuk" className="font-bold text-brand-700 dark:text-brand-400">{t('nav.login')}</Link></>}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label={t('auth.name')} error={err.name}><input className="input" autoComplete="name" required value={form.name} onChange={set('name')} /></Field>
        <Field label="Email" error={err.email}><input className="input" type="email" autoComplete="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label={t('auth.phone')} error={err.phone}><input className="input" type="tel" autoComplete="tel" required value={form.phone} onChange={set('phone')} placeholder="08xxxxxxxxxx" /></Field>
        <Field label={t('auth.password')} error={err.password} hint={t('auth.passwordHint')}><input className="input" type="password" autoComplete="new-password" required minLength={6} value={form.password} onChange={set('password')} /></Field>
        <ErrorNote error={m.error?.details ? null : m.error} />
        <Button type="submit" size="lg" className="w-full" loading={m.isPending}>{t('auth.registerButton')}</Button>
      </form>
    </AuthShell>
  );
}
