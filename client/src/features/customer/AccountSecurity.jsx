// Keamanan akun pelanggan (Dev 2): ganti kata sandi dengan kode verifikasi (email / WhatsApp),
// lupa kata sandi, dan hapus akun.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyRound, Mail, MessageCircle, ShieldAlert, Trash2, FlaskConical } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';
import { Button, ErrorNote, Field, Modal, Segmented, Spinner, toast } from '../../components/ui';

/** Hitung mundur detik (untuk tombol "kirim ulang"). */
function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return [left, setLeft];
}

/** Pilih saluran + tombol kirim kode. `send(channel)` mengembalikan respons server. */
export function OtpSender({ send, disabledWhatsapp, sent, onSent }) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState('EMAIL');
  const [left, setLeft] = useCountdown();
  const m = useMutation({
    mutationFn: () => send(channel),
    onSuccess: (r) => {
      setLeft(r.resendInSec || 60);
      onSent(r);
    },
  });
  const wait = /(\d+) detik/.exec(m.error?.message || '')?.[1];
  useEffect(() => {
    if (wait) setLeft(Number(wait));
  }, [wait, setLeft]);

  return (
    <div className="space-y-2">
      <span className="field-label">{t('security.sendVia')}</span>
      <Segmented
        className="w-full"
        value={channel}
        onChange={setChannel}
        options={[
          { value: 'EMAIL', label: <span className="flex items-center justify-center gap-1.5"><Mail className="h-4 w-4" />Email</span> },
          { value: 'WHATSAPP', label: <span className="flex items-center justify-center gap-1.5"><MessageCircle className="h-4 w-4" />WhatsApp</span> },
        ]}
      />
      {channel === 'WHATSAPP' && disabledWhatsapp && <p className="text-xs text-amber-700 dark:text-amber-300">{t('security.noPhone')}</p>}
      <Button type="button" variant={sent ? 'secondary' : 'primary'} className="w-full" loading={m.isPending} disabled={left > 0 || (channel === 'WHATSAPP' && disabledWhatsapp)} onClick={() => m.mutate()}>
        {left > 0 ? t('security.resendIn', { s: left }) : sent ? t('security.resend') : t('security.sendCode')}
      </Button>
      {!wait && <ErrorNote error={m.error} />}
    </div>
  );
}

/** Info "kode dikirim ke ..." + kode uji saat server dalam mode simulasi. */
export function OtpSentNote({ info }) {
  const { t } = useTranslation();
  if (!info) return null;
  return (
    <div className="space-y-2">
      <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900 dark:bg-brand-950/50 dark:text-brand-200">
        {info.sentTo ? t('security.sentTo', { to: info.sentTo, min: info.expiresInMin }) : t('security.sentGeneric', { min: info.expiresInMin })}
      </p>
      {info.devCode && (
        <p className="flex items-start gap-2 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('security.devCode')} <b className="font-mono text-sm tracking-widest">{info.devCode}</b></span>
        </p>
      )}
    </div>
  );
}

const codeInputProps = { inputMode: 'numeric', autoComplete: 'one-time-code', pattern: '\\d{6}', maxLength: 6, className: 'input font-mono text-lg tracking-[0.4em]', placeholder: '••••••' };

export function ChangePasswordCard() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const [info, setInfo] = useState(null);
  const [f, setF] = useState({ code: '', newPassword: '', confirm: '' });
  const mismatch = f.confirm && f.confirm !== f.newPassword;
  const save = useMutation({
    mutationFn: () => api('/account/password', { method: 'POST', body: { code: f.code, newPassword: f.newPassword } }),
    onSuccess: (r) => {
      login(r.token, user);
      toast(t('security.changed'));
      setInfo(null);
      setF({ code: '', newPassword: '', confirm: '' });
    },
  });
  const err = save.error?.details || {};

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><KeyRound className="h-4 w-4 text-brand-600" />{t('security.changeTitle')}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{t('security.changeText')}</p>
      </div>
      <OtpSender send={(channel) => api('/account/password/otp', { method: 'POST', body: { channel } })} disabledWhatsapp={!user.phone} sent={Boolean(info)} onSent={setInfo} />
      <OtpSentNote info={info} />
      {info && (
        <form
          className="space-y-3 border-t border-dashed border-slate-200 pt-3 dark:border-slate-700"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mismatch) save.mutate();
          }}
        >
          <Field label={t('security.code')} error={err.code}><input {...codeInputProps} required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label={t('security.newPassword')} error={err.newPassword} hint={t('auth.passwordHint')}><input className="input" type="password" autoComplete="new-password" required minLength={6} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
          <Field label={t('security.confirmPassword')} error={mismatch ? t('security.mismatch') : null}><input className="input" type="password" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
          <ErrorNote error={save.error?.details ? null : save.error} />
          <p className="text-xs text-slate-500">{t('security.otherDevices')}</p>
          <Button type="submit" className="w-full" loading={save.isPending} disabled={mismatch}>{t('security.savePassword')}</Button>
        </form>
      )}
    </section>
  );
}

export function DeleteAccountCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section className="card border-red-200 p-4 dark:border-red-900/60">
      <h2 className="flex items-center gap-2 font-bold text-red-700 dark:text-red-400"><Trash2 className="h-4 w-4" />{t('security.deleteTitle')}</h2>
      <p className="mt-0.5 mb-3 text-sm text-slate-500">{t('security.deleteText')}</p>
      <Button variant="secondary" className="!border-red-300 !text-red-700 dark:!border-red-900 dark:!text-red-400" onClick={() => setOpen(true)}>{t('security.deleteButton')}</Button>
      {open && <DeleteAccountModal onClose={() => setOpen(false)} />}
    </section>
  );
}

function DeleteAccountModal({ onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuth((s) => s.logout);
  const [f, setF] = useState({ password: '', confirm: '', reason: '' });
  const checkQ = useQuery({ queryKey: ['delete-check'], queryFn: () => api('/account/delete-check'), staleTime: 0 });
  const del = useMutation({
    mutationFn: () => api('/account', { method: 'DELETE', body: { password: f.password, confirm: f.confirm, reason: f.reason || undefined } }),
    onSuccess: () => {
      logout();
      navigate('/', { replace: true });
      toast(t('security.deleted'));
    },
  });
  const check = checkQ.data;
  const err = del.error?.details || {};
  const ready = f.confirm.trim().toUpperCase() === 'HAPUS' && f.password;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('security.deleteTitle')}
      footer={
        check?.canDelete ? (
          <>
            <Button variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" form="delete-form" variant="danger" className="flex-1" loading={del.isPending} disabled={!ready}>{t('security.deleteConfirmButton')}</Button>
          </>
        ) : (
          <Button variant="secondary" className="ml-auto" onClick={onClose}>{t('common.close')}</Button>
        )
      }
    >
      {checkQ.isLoading && <Spinner />}
      <ErrorNote error={checkQ.error} />
      {check && !check.canDelete && (
        <div className="space-y-3">
          <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <ShieldAlert className="h-5 w-5 shrink-0" />{t('security.blocked')}
          </p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {check.blocking.map((b) => (
              <li key={b.id}>
                <Link to={`/pesanan/${b.id}`} onClick={onClose} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <span>
                    <span className="block font-semibold text-slate-900 dark:text-white">{b.carType.brand} {b.carType.name}</span>
                    <span className="text-xs text-slate-500">{b.code} · {formatDateTime(b.startAt)}</span>
                  </span>
                  <span className="text-xs font-semibold text-brand-700 dark:text-brand-400">{t(`status.${b.status}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {check?.canDelete && (
        <form
          id="delete-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) del.mutate();
          }}
        >
          <ul className="list-disc space-y-1 rounded-xl bg-slate-50 p-3 pl-7 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <li>{t('security.effect1')}</li>
            {check.pendingPayment > 0 && <li>{t('security.effect2', { count: check.pendingPayment })}</li>}
            <li>{t('security.effect3')}</li>
            <li>{t('security.effect4')}</li>
          </ul>
          <Field label={t('security.reason')}><input className="input" maxLength={255} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder={t('security.reasonPlaceholder')} /></Field>
          <Field label={t('auth.password')} error={err.password}><input className="input" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label={t('security.typeDelete')} error={err.confirm}><input className="input uppercase" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} placeholder="HAPUS" autoCapitalize="characters" /></Field>
          <ErrorNote error={del.error?.details ? null : del.error} />
        </form>
      )}
    </Modal>
  );
}

/** Halaman /lupa-sandi: kirim kode ke email/WhatsApp akun, lalu buat kata sandi baru. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [info, setInfo] = useState(null);
  const [f, setF] = useState({ code: '', newPassword: '' });
  const reset = useMutation({
    mutationFn: () => api('/account/forgot-password/reset', { method: 'POST', body: { email, ...f } }),
    onSuccess: (r) => {
      toast(r.message);
      navigate('/masuk', { replace: true });
    },
  });
  const err = reset.error?.details || {};
  const validEmail = /^\S+@\S+\.\S+$/.test(email);

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-8 sm:py-14">
      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t('security.forgotTitle')}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">{t('security.forgotText')}</p>
      <div className="card space-y-3 p-5">
        <Field label="Email"><input className="input" type="email" autoComplete="email" required value={email} disabled={Boolean(info)} onChange={(e) => setEmail(e.target.value)} /></Field>
        {validEmail && (
          <OtpSender send={(channel) => api('/account/forgot-password/otp', { method: 'POST', body: { email, channel } })} sent={Boolean(info)} onSent={setInfo} />
        )}
        <OtpSentNote info={info} />
        {info && (
          <form
            className="space-y-3 border-t border-dashed border-slate-200 pt-3 dark:border-slate-700"
            onSubmit={(e) => {
              e.preventDefault();
              reset.mutate();
            }}
          >
            <Field label={t('security.code')} error={err.code}><input {...codeInputProps} required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label={t('security.newPassword')} error={err.newPassword} hint={t('auth.passwordHint')}><input className="input" type="password" autoComplete="new-password" required minLength={6} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
            <ErrorNote error={reset.error?.details ? null : reset.error} />
            <Button type="submit" size="lg" className="w-full" loading={reset.isPending}>{t('security.savePassword')}</Button>
          </form>
        )}
      </div>
      <p className="mt-5 text-center text-sm text-slate-500"><Link to="/masuk" className="font-bold text-brand-700 dark:text-brand-400">{t('security.backToLogin')}</Link></p>
    </div>
  );
}
