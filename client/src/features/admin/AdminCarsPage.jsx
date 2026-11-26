// Master data mobil: tipe + harga sewa per paket, foto, dan unit (plat nomor).
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CarFront, ImagePlus, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { Badge, Button, CarImage, EmptyState, ErrorNote, Field, Modal, Segmented, Select, Spinner, errorText, stockPhotoFor, toast } from '../../components/ui';
import { formatIDR } from '../../lib/format';
import { PLATE_PATTERN, PLATE_REGEX, formatPlate } from '../../lib/plate';
import { toCarType } from '../../lib/adapters';
import { compressImage } from '../../lib/compressImage';
import * as A from './adminApi';
import { Group, MoneyInput, PageHeader } from './ui';

const PRICE_FIELDS = [
  { key: 'price4HoursDriver', label: 'priceDriver4h', group: 'WITH_DRIVER' },
  { key: 'price12HoursDriver', label: 'priceDriver12h', group: 'WITH_DRIVER' },
  { key: 'priceDailySelfDrive', label: 'priceDaily', group: 'SELF_DRIVE' },
  { key: 'priceMonthlySelfDrive', label: 'priceMonthly', group: 'SELF_DRIVE' },
  { key: 'priceYearlySelfDrive', label: 'priceYearly', group: 'SELF_DRIVE' },
];
const UNIT_TONE = { AVAILABLE: 'brand', RENTED: 'violet', MAINTENANCE: 'amber' };

export function AdminCarsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'units' ? 'units' : 'types';
  return (
    <div>
      <PageHeader title={t('admin.nav.cars')} subtitle={t('admin.carsSub')} />
      <Segmented
        className="mb-4 w-full sm:w-auto"
        value={tab}
        onChange={(v) => setParams(v === 'units' ? { tab: 'units' } : {}, { replace: true })}
        options={[
          { value: 'types', label: t('admin.types') },
          { value: 'units', label: t('admin.units') },
        ]}
      />
      {tab === 'types' ? <TypesTab /> : <UnitsTab />}
    </div>
  );
}

// ---------------- Tipe & harga ----------------

function TypesTab() {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(null); // null | {} (baru) | tipe
  const { data: types, isLoading, error } = useQuery({ queryKey: ['admin', 'types'], queryFn: A.listTypes });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorNote error={error} />;

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setEditing({})}>
          <Plus className="h-4 w-4" /> {t('admin.addType')}
        </Button>
      </div>
      {types.length === 0 ? (
        <div className="card">
          <EmptyState icon={CarFront} title={t('admin.noTypes')} action={<Button onClick={() => setEditing({})}>{t('admin.addType')}</Button>}>
            {t('admin.noTypesHint')}
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((type) => (
            <button key={type.id} onClick={() => setEditing(type)} className="card overflow-hidden text-left transition hover:border-brand-400">
              <CarImage type={toCarType(type)} className="aspect-[16/9]" sizes="(min-width: 640px) 320px, 100vw" />
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-900 dark:text-white">{type.name}</p>
                  <Badge>{t('admin.unitCount', { count: type.unitCount.total })}</Badge>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" /> {type.capacity} · {t(`transmission.${type.transmission}`)}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {PRICE_FIELDS.map((p) => (
                    <div key={p.key} className="flex justify-between gap-2">
                      <dt className="text-slate-500">{t(`admin.price.${p.label}`)}</dt>
                      <dd className={`font-semibold ${type[p.key] ? '' : 'text-slate-400'}`}>{type[p.key] ? formatIDR(type[p.key]) : '–'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </button>
          ))}
        </div>
      )}
      {editing && <TypeForm type={editing} onClose={() => setEditing(null)} onSaved={setEditing} />}
    </>
  );
}

const emptyType = { name: '', capacity: 7, transmission: 'AUTOMATIC', description: '', price4HoursDriver: '', price12HoursDriver: '', priceDailySelfDrive: '', priceMonthlySelfDrive: '', priceYearlySelfDrive: '' };

function TypeForm({ type, onClose, onSaved }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isNew = !type.id;
  const [form, setForm] = useState(() => {
    const f = { ...emptyType };
    for (const k of Object.keys(emptyType)) if (type[k] != null) f[k] = type[k] === 0 && k.startsWith('price') ? '' : type[k];
    return f;
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'types'] });

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, capacity: Number(form.capacity), description: form.description || null };
      for (const p of PRICE_FIELDS) body[p.key] = form[p.key] === '' ? 0 : form[p.key];
      return A.saveType(type.id, body);
    },
    onSuccess: (saved) => {
      refresh();
      toast(t('common.saved'));
      // Tipe baru: form tetap terbuka supaya foto bisa langsung diunggah.
      if (isNew) onSaved({ ...saved, unitCount: { total: 0 } });
      else onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => A.deleteType(type.id),
    onSuccess: () => {
      refresh();
      toast(t('admin.deleted'));
      onClose();
    },
    onError: (e) => toast(errorText(e, t), 'error'),
  });
  const noPrice = PRICE_FIELDS.every((p) => !form[p.key]);

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={isNew ? t('admin.addType') : t('admin.editType')}
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" className="text-red-600" loading={remove.isPending} onClick={() => window.confirm(t('admin.confirmDeleteType')) && remove.mutate()} aria-label={t('common.delete')}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="secondary" className="ml-auto" onClick={onClose}>{t('common.cancel')}</Button>
          <Button form="type-form" type="submit" loading={save.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <form
        id="type-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.name.trim() && !noPrice) save.mutate();
        }}
      >
        <ErrorNote error={save.error} />
        <Field label={t('admin.typeName')}>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Toyota Avanza" required maxLength={100} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('admin.seats')}>
            <input className="input" type="number" inputMode="numeric" min={1} max={60} value={form.capacity} onChange={set('capacity')} required />
          </Field>
          <Group label={t('admin.transmission')}>
            <Select value={form.transmission} onChange={set('transmission')} options={['AUTOMATIC', 'MANUAL'].map((v) => ({ value: v, label: t(`transmission.${v}`) }))} aria-label={t('admin.transmission')} />
          </Group>
        </div>

        <fieldset data-guard-anchor className="relative rounded-xl">
          <legend className="field-label">{t('admin.prices')} <span className="text-red-600">*</span></legend>
          {/* Minimal satu harga wajib diisi (lihat FormGuard). */}
          <input
            data-guard-proxy
            data-guard-message={t('admin.needOnePrice')}
            required
            tabIndex={-1}
            aria-hidden="true"
            value={noPrice ? '' : '1'}
            onChange={() => {}}
            className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
          />
          {['WITH_DRIVER', 'SELF_DRIVE'].map((g) => (
            <div key={g} className="mt-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="mb-2 text-sm font-bold">{t(`service.${g}`)}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {PRICE_FIELDS.filter((p) => p.group === g).map((p) => (
                  <Field key={p.key} label={t(`admin.price.${p.label}`)}>
                    <MoneyInput value={form[p.key]} onChange={set(p.key)} placeholder={t('admin.notOffered')} aria-label={t(`admin.price.${p.label}`)} />
                  </Field>
                ))}
              </div>
            </div>
          ))}
          {noPrice && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{t('admin.needOnePrice')}</p>}
        </fieldset>

        <Field label={t('admin.description')}>
          <textarea className="input" rows={2} value={form.description || ''} onChange={set('description')} maxLength={2000} />
        </Field>
      </form>

      <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
        <p className="field-label">{t('admin.photo')}</p>
        {isNew ? <p className="text-sm text-slate-500">{t('admin.photoAfterSave')}</p> : <TypePhoto type={type} onChanged={(next) => onSaved({ ...type, ...next })} />}
      </div>
    </Modal>
  );
}

function TypePhoto({ type, onChanged }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const input = useRef(null);
  const view = toCarType(type);
  const hint = type.photoUrl ? t('admin.photoOwnHint') : stockPhotoFor(view) ? t('admin.photoStockHint') : t('admin.photoNoneHint');

  const done = (msg) => (next) => {
    qc.invalidateQueries({ queryKey: ['admin', 'types'] });
    onChanged(next);
    toast(msg);
  };
  const upload = useMutation({
    mutationFn: async (file) => A.uploadTypePhoto(type.id, await compressImage(file, { maxSize: 1400 })),
    onSuccess: done(t('admin.photoUploaded')),
    onError: (e) => toast(errorText(e, t), 'error'),
  });
  const remove = useMutation({ mutationFn: () => A.deleteTypePhoto(type.id), onSuccess: done(t('admin.photoRemoved')) });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <CarImage type={view} className="aspect-[16/9] w-full rounded-xl sm:w-48" />
      <div className="flex-1">
        <p className="text-sm text-slate-500">{hint}</p>
        <div className="mt-2 flex gap-2">
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && upload.mutate(e.target.files[0])} />
          <Button size="sm" variant="soft" loading={upload.isPending} onClick={() => input.current.click()}>
            <ImagePlus className="h-4 w-4" /> {type.photoUrl ? t('admin.replacePhoto') : t('admin.uploadPhoto')}
          </Button>
          {type.photoUrl && (
            <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => window.confirm(t('admin.confirmRemovePhoto')) && remove.mutate()}>
              {t('admin.removePhoto')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Unit (plat) ----------------

function UnitsTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const types = useQuery({ queryKey: ['admin', 'types'], queryFn: A.listTypes });
  const units = useQuery({ queryKey: ['admin', 'units'], queryFn: () => A.listUnits() });

  if (units.isLoading || types.isLoading) return <Spinner />;
  if (units.error || types.error) return <ErrorNote error={units.error || types.error} />;

  const query = q.trim().toUpperCase().replace(/\s+/g, '');
  const shown = units.data.filter((u) => (!status || u.status === status) && (!query || u.plateNumber.replace(/\s+/g, '').includes(query) || u.carType.name.toUpperCase().includes(query)));
  const count = (s) => units.data.filter((u) => u.status === s).length;

  return (
    <>
      <div className="mb-3 flex gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.searchUnit')} aria-label={t('admin.searchUnit')} />
        </label>
        <Button onClick={() => setEditing({})} disabled={types.data.length === 0}>
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">{t('admin.addUnit')}</span>
        </Button>
      </div>
      <div className="mb-3">
        <Segmented
          value={status}
          onChange={setStatus}
          className="w-full sm:w-auto"
          options={[{ value: '', label: `${t('admin.all')} ${units.data.length}` }, ...['AVAILABLE', 'RENTED', 'MAINTENANCE'].map((s) => ({ value: s, label: `${t(`unitState.${s}`)} ${count(s)}` }))]}
        />
      </div>

      {types.data.length === 0 ? (
        <div className="card"><EmptyState icon={CarFront} title={t('admin.addTypeFirst')} /></div>
      ) : shown.length === 0 ? (
        <div className="card"><EmptyState icon={CarFront} title={t('admin.noUnits')} action={!units.data.length && <Button onClick={() => setEditing({})}>{t('admin.addUnit')}</Button>} /></div>
      ) : (
        <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
          {shown.map((u) => (
            <li key={u.id}>
              <button onClick={() => setEditing(u)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="rounded-md border-2 border-slate-800 bg-white px-2 py-0.5 font-mono text-sm font-bold tracking-wider text-slate-900 dark:border-slate-300 dark:bg-slate-950 dark:text-white">{u.plateNumber}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{u.carType.name}</span>
                  <span className="block truncate text-xs text-slate-500">{u.year} · {u.color}</span>
                </span>
                <Badge tone={UNIT_TONE[u.status]}>{t(`unitState.${u.status}`)}</Badge>
                <Pencil className="h-4 w-4 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <UnitForm unit={editing} types={types.data} onClose={() => setEditing(null)} />}
    </>
  );
}

function UnitForm({ unit, types, onClose }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isNew = !unit.id;
  const [form, setForm] = useState({
    plateNumber: unit.plateNumber || '',
    carTypeId: unit.carTypeId || types[0]?.id,
    year: unit.year || new Date().getFullYear(),
    color: unit.color || '',
    status: unit.status || 'AVAILABLE',
  });
  useEffect(() => setForm((f) => ({ ...f, carTypeId: f.carTypeId || types[0]?.id })), [types]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'units'] });
    qc.invalidateQueries({ queryKey: ['admin', 'types'] });
    qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  };
  const save = useMutation({
    mutationFn: () => A.saveUnit(unit.id, { ...form, year: Number(form.year) }),
    onSuccess: () => {
      refresh();
      toast(t('common.saved'));
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => A.deleteUnit(unit.id),
    onSuccess: () => {
      refresh();
      toast(t('admin.deleted'));
      onClose();
    },
    onError: (e) => toast(errorText(e, t), 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t('admin.addUnit') : t('admin.editUnit')}
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" className="text-red-600" loading={remove.isPending} onClick={() => window.confirm(t('admin.confirmDeleteUnit')) && remove.mutate()} aria-label={t('common.delete')}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="secondary" className="ml-auto" onClick={onClose}>{t('common.cancel')}</Button>
          <Button form="unit-form" type="submit" loading={save.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <form
        id="unit-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (PLATE_REGEX.test(form.plateNumber)) save.mutate();
        }}
      >
        <ErrorNote error={save.error} />
        <Field label={t('admin.plate')} hint={t('admin.plateHint')}>
          {/* Aturan TNKB: 1–2 huruf wilayah, 1–4 angka, 0–3 huruf seri (lihat lib/plate.js) */}
          <input
            className="input font-mono uppercase"
            value={form.plateNumber}
            onChange={(e) => set('plateNumber')(formatPlate(e.target.value))}
            placeholder="DN 1234 AB"
            required
            pattern={PLATE_PATTERN}
            data-guard-pattern={t('admin.platePattern')}
            maxLength={11}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Group label={t('admin.type')}>
          <Select value={form.carTypeId} onChange={set('carTypeId')} options={types.map((ty) => ({ value: ty.id, label: ty.name }))} aria-label={t('admin.type')} />
        </Group>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('admin.year')}>
            <input className="input" type="number" inputMode="numeric" min={1990} max={new Date().getFullYear() + 1} value={form.year} onChange={set('year')} required />
          </Field>
          <Field label={t('admin.color')}>
            <input className="input" value={form.color} onChange={set('color')} placeholder="Putih" required maxLength={30} />
          </Field>
        </div>
        <Group label={t('admin.unitStatus')} hint={t('admin.unitStatusHint')}>
          <Segmented value={form.status} onChange={set('status')} className="w-full" options={['AVAILABLE', 'RENTED', 'MAINTENANCE'].map((s) => ({ value: s, label: t(`unitState.${s}`) }))} />
        </Group>
      </form>
    </Modal>
  );
}
