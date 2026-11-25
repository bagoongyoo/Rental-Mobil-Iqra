// Pengguna (Dev 1): verifikasi KTP/SIM, persetujuan driver, daftar pelanggan, akun yang dihapus pelanggan.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileCheck2, UserCheck, Check, X, Ban, RotateCcw, UserX, History } from 'lucide-react';
import { api, apiBlob } from '../../lib/api';
import { formatDate, timeAgo } from '../../lib/format';
import { Badge, Button, EmptyState, ErrorNote, Field, Modal, Segmented, Spinner, toast } from '../../components/ui';
import { PageTitle } from './AdminApp';

export default function UsersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'docs';
  return (
    <>
      <PageTitle title={t('admin.nav.users')} />
      <Segmented
        className="mb-4"
        value={tab}
        onChange={(v) => setParams({ tab: v })}
        options={[
          { value: 'docs', label: t('admin.verifyDocs') },
          { value: 'drivers', label: t('admin.drivers') },
          { value: 'customers', label: t('admin.customers') },
          { value: 'deleted', label: t('admin.deletedAccounts') },
        ]}
      />
      {tab === 'docs' && <DocsTab />}
      {tab === 'drivers' && <DriversTab />}
      {tab === 'customers' && <CustomersTab />}
      {tab === 'deleted' && <DeletedTab />}
    </>
  );
}

function DocsTab() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-docs'], queryFn: () => api('/documents', { query: { status: 'PENDING' } }) });
  if (isLoading) return <Spinner />;
  return (
    <>
      <ErrorNote error={error} />
      {data?.documents.length === 0 && <EmptyState icon={FileCheck2} title={t('admin.noPendingDocs')} />}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {data?.documents.map((d) => (
          <button key={d.id} onClick={() => setOpen(d)} className="card flex items-center gap-3 p-3 text-left hover:shadow-md">
            <Badge tone="amber">{d.type}</Badge>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900 dark:text-white">{d.user.name}</p>
              <p className="truncate text-xs text-slate-500">{d.user.email} · {timeAgo(d.updatedAt)}</p>
            </div>
          </button>
        ))}
      </div>
      {open && <DocReview doc={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function DocReview({ doc, onClose }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [src, setSrc] = useState(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    let url;
    // Gambar privat diambil dengan token, lalu ditampilkan sebagai blob URL.
    apiBlob(`/documents/${doc.id}/file`).then((b) => setSrc((url = URL.createObjectURL(b))));
    return () => url && URL.revokeObjectURL(url);
  }, [doc.id]);
  const review = useMutation({
    mutationFn: (status) => api(`/documents/${doc.id}/review`, { method: 'PATCH', body: { status, rejectReason: reason || undefined } }),
    onSuccess: (_r, status) => {
      toast(status === 'APPROVED' ? t('admin.docApproved') : t('admin.docRejected'));
      qc.invalidateQueries({ queryKey: ['admin-docs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`${doc.type} · ${doc.user.name}`}
      footer={
        <>
          <Button variant="secondary" className="flex-1 text-red-600" loading={review.isPending && review.variables === 'REJECTED'} onClick={() => review.mutate('REJECTED')}><X className="h-4 w-4" />{t('admin.reject')}</Button>
          <Button className="flex-1" loading={review.isPending && review.variables === 'APPROVED'} onClick={() => review.mutate('APPROVED')}><Check className="h-4 w-4" />{t('admin.approve')}</Button>
        </>
      }
    >
      <div className="mb-3 grid aspect-[16/10] place-items-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
        {src ? <img src={src} alt={doc.type} className="h-full w-full object-contain" /> : <Spinner />}
      </div>
      <p className="mb-3 text-sm text-slate-500">{doc.user.email} · {doc.user.phone}</p>
      <Field label={t('admin.rejectReason')} hint={t('admin.rejectHint')}>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('admin.rejectPlaceholder')} />
      </Field>
      <ErrorNote className="mt-3" error={review.error} />
    </Modal>
  );
}

function DriversTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-drivers'], queryFn: () => api('/drivers') });
  const act = useMutation({
    mutationFn: ({ id, path, method = 'POST', body }) => api(path.replace(':id', id), { method, body }),
    onSuccess: () => {
      toast(t('common.saved'));
      qc.invalidateQueries({ queryKey: ['admin-drivers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  if (isLoading) return <Spinner />;
  if (!data?.drivers.length) return <EmptyState icon={UserCheck} title={t('admin.noDrivers')} />;
  return (
    <div className="card divide-y divide-slate-100 dark:divide-slate-800">
      {data.drivers.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 dark:text-white">{d.name} {d.status === 'PENDING' && <Badge tone="amber">{t('admin.waitingApproval')}</Badge>} {d.status === 'BLOCKED' && <Badge tone="red">{t('admin.blocked')}</Badge>} {d.driverProfile?.isReady && <Badge tone="brand">{t('driver.ready')}</Badge>}</p>
            <p className="text-xs text-slate-500">{d.email} · {d.phone} · {d.driverProfile?.licenseNumber}</p>
            <p className="text-xs text-slate-400">{t('admin.registered')} {formatDate(d.createdAt)}{d.driverProfile?.lastSeenAt ? ` · ${t('admin.lastLocation')} ${timeAgo(d.driverProfile.lastSeenAt)}` : ''}</p>
          </div>
          {d.status === 'PENDING' ? (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => window.confirm(t('admin.confirmRejectDriver')) && act.mutate({ id: d.id, path: '/drivers/:id/reject' })}>{t('admin.reject')}</Button>
              <Button size="sm" onClick={() => act.mutate({ id: d.id, path: '/drivers/:id/approve' })}><Check className="h-4 w-4" />{t('admin.approve')}</Button>
            </div>
          ) : (
            <BlockButton user={d} onToggle={(status) => act.mutate({ id: d.id, path: '/users/:id/status', method: 'PATCH', body: { status } })} />
          )}
        </div>
      ))}
    </div>
  );
}

function BlockButton({ user, onToggle }) {
  const { t } = useTranslation();
  return user.status === 'BLOCKED' ? (
    <Button size="sm" variant="secondary" onClick={() => onToggle('ACTIVE')}><RotateCcw className="h-4 w-4" />{t('admin.unblock')}</Button>
  ) : (
    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => window.confirm(t('admin.confirmBlock')) && onToggle('BLOCKED')}><Ban className="h-4 w-4" />{t('admin.block')}</Button>
  );
}

function CustomersTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['admin-customers', q], queryFn: () => api('/users', { query: { role: 'CUSTOMER', q } }) });
  const toggle = useMutation({
    mutationFn: ({ id, status }) => api(`/users/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-customers'] }),
  });
  const docTone = { APPROVED: 'brand', PENDING: 'amber', REJECTED: 'red' };
  return (
    <>
      <input className="input mb-3 sm:w-72" placeholder={t('admin.searchUser')} value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading && <Spinner />}
      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {data?.users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                {u.name} {u.status === 'BLOCKED' && <Badge tone="red">{t('admin.blocked')}</Badge>}{' '}
                {u.previousDeletedId && <span title={t('admin.previouslyDeletedHint')}><Badge tone="amber"><History className="mr-0.5 inline h-3 w-3" />{t('admin.previouslyDeleted')}</Badge></span>}
              </p>
              <p className="text-xs text-slate-500">{u.email} · {u.phone} · {t('admin.orderCount', { count: u._count.bookings })}</p>
              <div className="mt-1 flex gap-1">
                {u.documents.map((d) => <Badge key={d.id} tone={docTone[d.status]}>{d.type}: {t(`docStatus.${d.status}`)}</Badge>)}
              </div>
            </div>
            <BlockButton user={u} onToggle={(status) => toggle.mutate({ id: u.id, status })} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Akun yang dihapus pelanggan: tidak bisa masuk lagi, tetapi data & riwayat tetap tersimpan untuk admin. */
function DeletedTab() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['admin-deleted', q], queryFn: () => api('/users', { query: { role: 'CUSTOMER', deleted: 1, q } }) });
  const docTone = { APPROVED: 'brand', PENDING: 'amber', REJECTED: 'red' };
  return (
    <>
      <p className="mb-3 text-sm text-slate-500">{t('admin.deletedNote')}</p>
      <input className="input mb-3 sm:w-72" placeholder={t('admin.searchUser')} value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading && <Spinner />}
      {data?.users.length === 0 && <EmptyState icon={UserX} title={t('admin.noDeleted')} />}
      {data?.users.length > 0 && (
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {data.users.map((u) => (
            <div key={u.id} className="p-3">
              <p className="font-semibold text-slate-900 dark:text-white">{u.name} <Badge>{t('admin.deletedAt')} {formatDate(u.deletedAt)}</Badge></p>
              <p className="text-xs text-slate-500">{t('admin.originalEmail')}: {u.deletedEmail} · {u.phone || '-'}</p>
              <p className="text-xs text-slate-500">{t('admin.registered')} {formatDate(u.createdAt)} · {t('admin.orderCount', { count: u._count.bookings })} · {t('admin.docCount', { count: u.documents.length })}</p>
              {u.deleteReason && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{t('admin.deleteReason')}: “{u.deleteReason}”</p>}
              {u.documents.length > 0 && (
                <div className="mt-1 flex gap-1">{u.documents.map((d) => <Badge key={d.id} tone={docTone[d.status]}>{d.type}: {t(`docStatus.${d.status}`)}</Badge>)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
