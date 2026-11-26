// Pengguna: verifikasi KTP/SIM pelanggan, persetujuan driver, daftar pelanggan (blokir/aktifkan).
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, Search, UserPlus, UserRound, Users } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorNote, Field, Modal, Segmented, Spinner, errorText, toast } from '../../components/ui';
import { formatDate, timeAgo } from '../../lib/format';
import * as A from './adminApi';
import { Chips, DocImage, PageHeader } from './ui';

const DOC_TONE = { PENDING: 'amber', APPROVED: 'brand', REJECTED: 'red' };

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'docs';
  const { data: dash } = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: A.getDashboard });
  const todo = dash?.todo || {};
  return (
    <div>
      <PageHeader title={t('admin.nav.users')} subtitle={t('admin.usersSub')} />
      <div className="mb-4">
        <Chips
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
          options={[
            { value: 'docs', label: t('admin.verifyDocs'), count: todo.pendingDocs },
            { value: 'drivers', label: t('admin.drivers'), count: todo.pendingDrivers },
            { value: 'customers', label: t('admin.customers') },
          ]}
        />
      </div>
      {tab === 'docs' ? <DocsTab /> : tab === 'drivers' ? <DriversTab /> : <CustomersTab />}
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['documents', 'drivers', 'users', 'dashboard']) qc.invalidateQueries({ queryKey: ['admin', k] });
  };
}

/** Dialog alasan penolakan (wajib diisi, akan dilihat pengguna). */
function RejectDialog({ title, onSubmit, onClose, loading }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" className="flex-1" type="submit" form="reject-form" loading={loading}>
            {t('admin.reject')}
          </Button>
        </>
      }
    >
      <form
        id="reject-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim().length >= 3) onSubmit(reason.trim());
        }}
      >
        <Field label={t('admin.rejectReason')} hint={t('admin.rejectHint')}>
          <textarea className="input" rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('admin.rejectPlaceholder')} required minLength={3} maxLength={255} />
        </Field>
      </form>
    </Modal>
  );
}

// ---------------- Verifikasi KTP/SIM ----------------

function DocsTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('PENDING');
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'documents', status], queryFn: () => A.listDocuments(status) });

  return (
    <>
      <Segmented
        className="mb-4 w-full sm:w-auto"
        value={status}
        onChange={setStatus}
        options={['PENDING', 'APPROVED', 'REJECTED'].map((s) => ({ value: s, label: t(`admin.docTab.${s}`) }))}
      />
      {status === 'PENDING' && <p className="mb-3 text-sm text-slate-500">{t('admin.docsHint')}</p>}
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : data.length === 0 ? (
        <div className="card"><EmptyState icon={FileCheck2} title={status === 'PENDING' ? t('admin.noPendingDocs') : t('admin.noDocs')} /></div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((d) => <DocCard key={d.id} doc={d} />)}
        </ul>
      )}
    </>
  );
}

function DocCard({ doc }) {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const [rejecting, setRejecting] = useState(false);
  const review = useMutation({
    mutationFn: (body) => A.reviewDocument(doc.id, body),
    onSuccess: (_, body) => {
      refresh();
      setRejecting(false);
      toast(body.status === 'APPROVED' ? t('admin.docApproved') : t('admin.docRejected'));
    },
    onError: (e) => toast(errorText(e, t), 'error'),
  });

  return (
    <li className="card p-3.5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-white">{doc.user.name}</p>
          <p className="truncate text-xs text-slate-500">{doc.user.email}{doc.user.phone && ` · ${doc.user.phone}`}</p>
        </div>
        <Badge tone="blue">{doc.type}</Badge>
      </div>
      <DocImage id={doc.id} alt={`${doc.type} ${doc.user.name}`} />
      <p className="mt-2 text-xs text-slate-500">{t('admin.uploaded')} {timeAgo(doc.updatedAt)}</p>
      {doc.status === 'PENDING' ? (
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" className="flex-1 text-red-600" onClick={() => setRejecting(true)}>{t('admin.reject')}</Button>
          <Button className="flex-1" loading={review.isPending && review.variables?.status === 'APPROVED'} onClick={() => review.mutate({ status: 'APPROVED' })}>{t('admin.approve')}</Button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <Badge tone={DOC_TONE[doc.status]}>{t(`docStatus.${doc.status}`)}</Badge>
          {doc.rejectionReason && <span className="truncate text-slate-500">{doc.rejectionReason}</span>}
        </div>
      )}
      {rejecting && (
        <RejectDialog
          title={`${t('admin.reject')} ${doc.type} · ${doc.user.name}`}
          loading={review.isPending}
          onClose={() => setRejecting(false)}
          onSubmit={(rejectionReason) => review.mutate({ status: 'REJECTED', rejectionReason })}
        />
      )}
    </li>
  );
}

// ---------------- Driver ----------------

function DriversTab() {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'drivers'], queryFn: A.listDrivers });

  const addButton = (
    <Button size="sm" onClick={() => setAdding(true)}>
      <UserPlus className="h-4 w-4" />
      {t('admin.addDriver')}
    </Button>
  );
  const order = { PENDING: 0, APPROVED: 1, REJECTED: 2 };
  const sorted = data ? [...data].sort((a, b) => (order[a.driverProfile?.approvalStatus] ?? 3) - (order[b.driverProfile?.approvalStatus] ?? 3)) : [];

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('admin.addDriverHint')}</p>
        {addButton}
      </div>
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : sorted.length === 0 ? (
        <div className="card"><EmptyState icon={UserRound} title={t('admin.noDrivers')} /></div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((d) => <DriverCard key={d.id} driver={d} />)}
        </ul>
      )}
      {adding && <AddDriverDialog onClose={() => setAdding(false)} />}
    </>
  );
}

const EMPTY_DRIVER = { name: '', email: '', phone: '', licenseNumber: '', password: '' };

/** Form admin membuat akun driver. Akun langsung disetujui, lalu data masuknya ditampilkan untuk dibagikan. */
function AddDriverDialog({ onClose }) {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const [form, setForm] = useState(EMPTY_DRIVER);
  const [created, setCreated] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => A.createDriver(form),
    onSuccess: (driver) => {
      refresh();
      setCreated({ email: driver.email, password: form.password, name: driver.name });
      toast(t('admin.driverCreated'));
    },
  });

  const valid = form.name.trim().length >= 2 && form.email.includes('@') && form.phone.trim().length >= 9 && form.licenseNumber.trim().length >= 5 && form.password.length >= 8;

  if (created) {
    return (
      <Modal open onClose={onClose} title={t('admin.driverCreated')} footer={<Button className="flex-1" onClick={onClose}>{t('common.close')}</Button>}>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{t('admin.driverCreatedHint', { name: created.name })}</p>
        <dl className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          <div className="flex justify-between gap-3 py-1"><dt className="text-slate-500">Email</dt><dd className="font-mono font-semibold break-all">{created.email}</dd></div>
          <div className="flex justify-between gap-3 py-1"><dt className="text-slate-500">{t('auth.password')}</dt><dd className="font-mono font-semibold break-all">{created.password}</dd></div>
        </dl>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.addDriver')}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button className="flex-1" type="submit" form="add-driver-form" loading={save.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <form
        id="add-driver-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <Field label={t('auth.name')}>
          <input className="input" value={form.name} onChange={set('name')} autoComplete="off" required minLength={2} maxLength={100} autoFocus />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="off" inputMode="email" required />
        </Field>
        <Field label={t('auth.phone')}>
          <input className="input" type="tel" value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="081234567890" required minLength={9} maxLength={16} />
        </Field>
        <Field label={t('admin.simNumber')}>
          <input className="input font-mono" value={form.licenseNumber} onChange={set('licenseNumber')} autoComplete="off" required minLength={5} maxLength={30} />
        </Field>
        <Field label={t('auth.password')} hint={t('admin.driverPasswordHint')}>
          <input className="input" type="text" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={8} maxLength={100} />
        </Field>
        <ErrorNote error={save.error} />
      </form>
    </Modal>
  );
}

function DriverCard({ driver: d }) {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const [rejecting, setRejecting] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const status = d.driverProfile?.approvalStatus || 'PENDING';
  const docs = (d.documents || []).filter((x) => x.type === 'SIM' || x.type === 'PHOTO');

  const review = useMutation({
    mutationFn: (body) => A.reviewDriver(d.id, body),
    onSuccess: (_, body) => {
      refresh();
      setRejecting(false);
      toast(body.status === 'APPROVED' ? t('admin.driverApproved') : t('admin.driverRejected'));
    },
    onError: (e) => toast(errorText(e, t), 'error'),
  });
  const block = useBlock(d);

  return (
    <li className="card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{d.name[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900 dark:text-white">{d.name}</p>
          <p className="truncate text-xs text-slate-500">{d.email}{d.phone && ` · ${d.phone}`}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {t('admin.simNumber')}: <span className="font-mono">{d.driverProfile?.licenseNumber || '-'}</span> · {t('admin.registered')} {formatDate(d.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={DOC_TONE[status]}>{status === 'PENDING' ? t('admin.waitingApproval') : t(`docStatus.${status}`)}</Badge>
          {!d.isActive && <Badge tone="red">{t('admin.blocked')}</Badge>}
          {status === 'APPROVED' && d.isActive && d.driverProfile?.isReady && <Badge tone="brand">{t('admin.ready')}</Badge>}
        </div>
      </div>

      {docs.length > 0 && (
        <>
          <button className="mt-2 text-sm font-semibold text-brand-700 dark:text-brand-400" onClick={() => setShowDocs((v) => !v)}>
            {showDocs ? t('admin.hideDocs') : t('admin.showDocs', { count: docs.length })}
          </button>
          {showDocs && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {docs.map((x) => (
                <div key={x.id}>
                  <p className="mb-1 text-xs font-semibold text-slate-500">{x.type === 'SIM' ? 'SIM' : t('admin.profilePhoto')}</p>
                  <DocImage id={x.id} alt={`${x.type} ${d.name}`} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-3 flex gap-2">
        {status !== 'APPROVED' && (
          <Button size="sm" className="flex-1" loading={review.isPending && review.variables?.status === 'APPROVED'} onClick={() => review.mutate({ status: 'APPROVED' })}>
            {t('admin.approve')}
          </Button>
        )}
        {status === 'PENDING' && (
          <Button size="sm" variant="secondary" className="flex-1 text-red-600" onClick={() => setRejecting(true)}>{t('admin.reject')}</Button>
        )}
        {status === 'APPROVED' && <BlockButton user={d} block={block} />}
      </div>
      {rejecting && (
        <RejectDialog title={`${t('admin.reject')} · ${d.name}`} loading={review.isPending} onClose={() => setRejecting(false)} onSubmit={(rejectionReason) => review.mutate({ status: 'REJECTED', rejectionReason })} />
      )}
    </li>
  );
}

// ---------------- Pelanggan ----------------

function useBlock(user) {
  const { t } = useTranslation();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: () => A.setUserActive(user.id, !user.isActive),
    onSuccess: (res) => {
      refresh();
      toast(res.isActive ? t('admin.unblocked') : t('admin.blockedToast'));
    },
    onError: (e) => toast(errorText(e, t), 'error'),
  });
}

function BlockButton({ user, block }) {
  const { t } = useTranslation();
  return user.isActive ? (
    <Button size="sm" variant="ghost" className="flex-1 text-red-600" loading={block.isPending} onClick={() => window.confirm(t('admin.confirmBlock')) && block.mutate()}>
      {t('admin.block')}
    </Button>
  ) : (
    <Button size="sm" variant="soft" className="flex-1" loading={block.isPending} onClick={() => block.mutate()}>
      {t('admin.unblock')}
    </Button>
  );
}

function CustomersTab() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'users', 'CUSTOMER', search], queryFn: () => A.listUsers({ role: 'CUSTOMER', q: search || undefined }) });

  return (
    <>
      <form
        className="relative mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" type="search" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setSearch(q.trim())} placeholder={t('admin.searchUser')} aria-label={t('admin.searchUser')} />
      </form>
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : data.length === 0 ? (
        <div className="card"><EmptyState icon={Users} title={t('admin.noCustomers')} /></div>
      ) : (
        <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
          {data.map((u) => <CustomerRow key={u.id} user={u} />)}
        </ul>
      )}
    </>
  );
}

function CustomerRow({ user: u }) {
  const { t } = useTranslation();
  const block = useBlock(u);
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">{u.name[0]}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
          {u.name} {!u.isActive && <Badge tone="red">{t('admin.blocked')}</Badge>}
        </p>
        <p className="truncate text-xs text-slate-500">{u.email}{u.phone && ` · ${u.phone}`}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge>{t('admin.orderCount', { count: u.orderCount })}</Badge>
          {u.documents.map((d) => (
            <Badge key={d.id} tone={DOC_TONE[d.status]}>{d.type}: {t(`docStatus.${d.status}`)}</Badge>
          ))}
        </div>
      </div>
      <div className="w-28">
        <BlockButton user={u} block={block} />
      </div>
    </li>
  );
}
