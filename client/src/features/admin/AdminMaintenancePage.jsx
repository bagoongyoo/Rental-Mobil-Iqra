// Jadwal perawatan mobil: servis berkala per unit. Biaya servis yang selesai otomatis masuk ke pengeluaran.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Plus, Wrench, XCircle } from 'lucide-react';
import { Badge, Button, DatePicker, EmptyState, ErrorNote, Field, Modal, Segmented, Select, Spinner, errorText, toast } from '../../components/ui';
import { dateStrWIB, formatDate, formatIDR } from '../../lib/format';
import * as A from './adminApi';
import { Group, MoneyInput, PageHeader, toDateStr } from './ui';

const SERVICE_PRESETS = ['Servis berkala', 'Ganti oli', 'Ganti ban', 'Tune up', 'Rem', 'AC', 'Aki', 'Cuci & detailing'];
const NEXT_OPTIONS = [0, 1, 3, 6, 12];

export function AdminMaintenancePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('open');
  const [editing, setEditing] = useState(null);
  const [completing, setCompleting] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'maintenance'], queryFn: () => A.listMaintenance() });

  const open = (data || []).filter((m) => m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS');
  const history = (data || []).filter((m) => m.status === 'COMPLETED' || m.status === 'CANCELLED').sort((a, b) => new Date(b.completedDate || b.updatedAt) - new Date(a.completedDate || a.updatedAt));
  const overdue = open.filter((m) => m.isOverdue).length;
  const spent = history.filter((m) => m.status === 'COMPLETED').reduce((s, m) => s + m.cost, 0);

  return (
    <div>
      <PageHeader
        title={t('admin.nav.maintenance')}
        subtitle={t('admin.maintenanceHint')}
        action={
          <Button onClick={() => setEditing({})}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">{t('admin.addSchedule')}</span>
          </Button>
        }
      />
      <Segmented
        className="mb-4 w-full sm:w-auto"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'open', label: `${t('admin.upcomingTab')} ${open.length}` },
          { value: 'history', label: t('admin.historyTab') },
        ]}
      />

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : tab === 'open' ? (
        <>
          {overdue > 0 && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">{t('admin.overdueCount', { count: overdue })}</p>}
          {open.length === 0 ? (
            <div className="card">
              <EmptyState icon={CalendarClock} title={t('admin.noSchedule')} action={<Button onClick={() => setEditing({})}>{t('admin.addSchedule')}</Button>}>
                {t('admin.noScheduleHint')}
              </EmptyState>
            </div>
          ) : (
            <ul className="space-y-3">
              {open.map((m) => (
                <ScheduleCard key={m.id} m={m} onEdit={() => setEditing(m)} onComplete={() => setCompleting(m)} />
              ))}
            </ul>
          )}
        </>
      ) : history.length === 0 ? (
        <div className="card"><EmptyState icon={Wrench} title={t('admin.noHistory')} /></div>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">{t('admin.totalSpent', { amount: formatIDR(spent) })}</p>
          <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                {m.status === 'COMPLETED' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-600" /> : <XCircle className="h-5 w-5 shrink-0 text-slate-400" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.carUnit.plateNumber} · {m.serviceType}</p>
                  <p className="truncate text-xs text-slate-500">
                    {m.carUnit.carType.name} · {formatDate(m.completedDate || m.scheduledDate)}
                  </p>
                </div>
                {m.status === 'COMPLETED' ? <span className="text-sm font-bold">{formatIDR(m.cost)}</span> : <Badge>{t('mStatus.CANCELLED')}</Badge>}
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && <ScheduleForm item={editing} onClose={() => setEditing(null)} />}
      {completing && <CompleteForm item={completing} onClose={() => setCompleting(null)} />}
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['maintenance', 'dashboard', 'units', 'types', 'finance']) qc.invalidateQueries({ queryKey: ['admin', k] });
  };
}

function ScheduleCard({ m, onEdit, onComplete }) {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const act = useMutation({
    mutationFn: (action) => A.maintenanceAction(m.id, action),
    onSuccess: (_, action) => {
      refresh();
      toast(action === 'start' ? t('admin.serviceStarted') : t('admin.scheduleCancelled'));
    },
    onError: (e) => toast(errorText(e, t), 'error'),
  });
  const inProgress = m.status === 'IN_PROGRESS';

  return (
    <li className={`card p-4 ${m.isOverdue ? 'border-red-300 dark:border-red-900' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${inProgress ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200' : m.isOverdue ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200' : 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'}`}>
          <Wrench className="h-5 w-5" />
        </span>
        <button onClick={onEdit} className="min-w-0 flex-1 text-left">
          <p className="font-bold text-slate-900 dark:text-white">{m.serviceType}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            <span className="font-mono font-semibold">{m.carUnit.plateNumber}</span> · {m.carUnit.carType.name}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(m.scheduledDate, { weekday: 'short' })}
            {m.cost > 0 && ` · ${t('admin.estimatedCost')} ${formatIDR(m.cost)}`}
          </p>
          {m.notes && <p className="mt-1 text-xs text-slate-500 italic">{m.notes}</p>}
        </button>
        {inProgress ? <Badge tone="violet">{t('admin.inProgress')}</Badge> : m.isOverdue ? <Badge tone="red">{t('admin.overdue')}</Badge> : <Badge tone="brand">{t('mStatus.SCHEDULED')}</Badge>}
      </div>
      <div className="mt-3 flex gap-2">
        {!inProgress && (
          <Button size="sm" variant="secondary" className="flex-1" loading={act.isPending && act.variables === 'start'} onClick={() => act.mutate('start')}>
            {t('admin.startService')}
          </Button>
        )}
        <Button size="sm" className="flex-1" onClick={onComplete}>
          {t('admin.markDone')}
        </Button>
        <Button size="sm" variant="ghost" loading={act.isPending && act.variables === 'cancel'} onClick={() => window.confirm(t('admin.confirmCancelSchedule')) && act.mutate('cancel')} aria-label={t('common.cancel')}>
          <XCircle className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function ScheduleForm({ item, onClose }) {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const today = dateStrWIB();
  const isNew = !item.id;
  const units = useQuery({ queryKey: ['admin', 'units'], queryFn: () => A.listUnits() });
  const [form, setForm] = useState({
    carUnitId: item.carUnitId || '',
    serviceType: item.serviceType || SERVICE_PRESETS[0],
    scheduledDate: item.scheduledDate ? toDateStr(item.scheduledDate) : today,
    cost: item.cost || '',
    notes: item.notes || '',
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const unitId = form.carUnitId || units.data?.[0]?.id;

  const save = useMutation({
    mutationFn: () => A.saveMaintenance(item.id, { ...form, carUnitId: unitId, cost: form.cost || 0, notes: form.notes || null }),
    onSuccess: () => {
      refresh();
      toast(t('common.saved'));
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t('admin.addSchedule') : t('admin.editSchedule')}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button form="mt-form" type="submit" className="flex-1" loading={save.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      {units.isLoading ? (
        <Spinner />
      ) : units.data?.length === 0 ? (
        <EmptyState icon={Wrench} title={t('admin.addUnitFirst')} />
      ) : (
        <form
          id="mt-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <ErrorNote error={save.error} />
          <Group label={t('admin.unit')}>
            <Select
              required
              value={unitId}
              onChange={set('carUnitId')}
              options={(units.data || []).map((u) => ({ value: u.id, label: `${u.plateNumber} · ${u.carType.name}` }))}
              aria-label={t('admin.unit')}
            />
          </Group>
          <Field label={t('admin.serviceType')}>
            <input className="input" list="service-presets" value={form.serviceType} onChange={set('serviceType')} required maxLength={100} />
            <datalist id="service-presets">
              {SERVICE_PRESETS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </Field>
          <div className="no-scrollbar -mt-2 flex gap-1.5 overflow-x-auto">
            {SERVICE_PRESETS.map((s) => (
              <button key={s} type="button" onClick={() => set('serviceType')(s)} className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${form.serviceType === s ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'}`}>
                {s}
              </button>
            ))}
          </div>
          <Group label={t('admin.schedule')} hint={t('admin.blockNoteDay')}>
            <DatePicker value={form.scheduledDate} today={today} min={isNew ? today : undefined} onChange={set('scheduledDate')} />
          </Group>
          <Field label={t('admin.estimatedCost')}>
            <MoneyInput value={form.cost} onChange={set('cost')} />
          </Field>
          <Field label={t('admin.note')}>
            <input className="input" value={form.notes} onChange={set('notes')} placeholder={t('admin.maintenanceNotePlaceholder')} maxLength={1000} />
          </Field>
        </form>
      )}
    </Modal>
  );
}

function CompleteForm({ item, onClose }) {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const today = dateStrWIB();
  const [cost, setCost] = useState(item.cost || '');
  const [date, setDate] = useState(today);
  const [next, setNext] = useState(0);
  const [notes, setNotes] = useState(item.notes || '');

  const save = useMutation({
    mutationFn: () => A.maintenanceAction(item.id, 'complete', { cost: cost || 0, completedDate: date, notes: notes || null, nextInMonths: next || null }),
    onSuccess: (res) => {
      refresh();
      toast(res.nextSchedule ? t('admin.maintenanceDoneNext', { date: formatDate(res.nextSchedule.scheduledDate) }) : t('admin.maintenanceDone'));
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.markDone')}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button form="done-form" type="submit" className="flex-1" loading={save.isPending}>{t('admin.markDone')}</Button>
        </>
      }
    >
      <form
        id="done-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-800/60">
          <span className="font-semibold">{item.serviceType}</span> · <span className="font-mono">{item.carUnit.plateNumber}</span> ({item.carUnit.carType.name})
        </p>
        <ErrorNote error={save.error} />
        <Field label={t('admin.actualCost')} hint={t('admin.autoExpenseHint')}>
          <MoneyInput value={cost} onChange={setCost} autoFocus />
        </Field>
        <Group label={t('admin.doneDate')}>
          <DatePicker value={date} today={today} max={today} min={toDateStr(item.scheduledDate) < today ? toDateStr(item.scheduledDate) : undefined} onChange={setDate} />
        </Group>
        <Group label={t('admin.nextService')} hint={t('admin.nextServiceHint')}>
          <Segmented
            className="w-full"
            value={next}
            onChange={setNext}
            options={NEXT_OPTIONS.map((n) => ({ value: n, label: n ? t('admin.inMonths', { count: n }) : t('admin.none') }))}
          />
        </Group>
        <Field label={t('admin.note')}>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('admin.workshopPlaceholder')} maxLength={1000} />
        </Field>
      </form>
    </Modal>
  );
}
