// Master data mobil (Dev 1): tipe + harga paket, unit (plat nomor), foto.
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, ImageUp, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { formatIDR } from '../../lib/format';
import { compressImage } from '../../lib/compressImage';
import { Badge, Button, CarImage, ErrorNote, Field, Modal, Segmented, Spinner, toast } from '../../components/ui';
import { PageTitle } from './AdminApp';

const CATEGORIES = ['MPV', 'SUV', 'SEDAN', 'HATCHBACK', 'VAN', 'PREMIUM'];
const PRICE_FIELDS = ['priceDriver4h', 'priceDriver12h', 'priceDaily', 'priceMonthly', 'priceYearly'];
const STATE_TONE = { AVAILABLE: 'brand', RENTED: 'violet', MAINTENANCE: 'amber', INACTIVE: 'slate' };

export default function CarsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('types');
  const [editType, setEditType] = useState(null);
  const [editUnit, setEditUnit] = useState(null);
  const typesQ = useQuery({ queryKey: ['admin-types'], queryFn: () => api('/cars/admin/types') });
  const unitsQ = useQuery({ queryKey: ['admin-units'], queryFn: () => api('/cars/admin/units'), enabled: tab === 'units' });

  return (
    <>
      <PageTitle
        title={t('admin.nav.cars')}
        action={
          <Button onClick={() => (tab === 'types' ? setEditType({}) : setEditUnit({}))}>
            <Plus className="h-4 w-4" /> {tab === 'types' ? t('admin.addType') : t('admin.addUnit')}
          </Button>
        }
      />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'types', label: t('admin.types') }, { value: 'units', label: t('admin.units') }]} />

      {tab === 'types' && (
        <>
          {typesQ.isLoading && <Spinner />}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {typesQ.data?.types.map((ty) => (
              <div key={ty.id} className={`card overflow-hidden ${ty.isActive ? '' : 'opacity-60'}`}>
                <CarImage type={ty} className="aspect-[16/7]" />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-500">{ty.brand} · {t(`category.${ty.category}`)} · {t('car.seats', { count: ty.seats })}</p>
                      <h3 className="font-bold text-slate-900 dark:text-white">{ty.name}</h3>
                    </div>
                    {!ty.isActive && <Badge>{t('admin.inactive')}</Badge>}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {PRICE_FIELDS.map((f) => (
                      <div key={f} className="flex justify-between gap-2">
                        <dt className="text-slate-500">{t(`admin.price.${f}`)}</dt>
                        <dd className="font-semibold">{ty[f] == null ? '-' : formatIDR(ty[f])}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-slate-500">{t('admin.unitCount', { count: ty._count.units })}</p>
                  <Button size="sm" variant="secondary" className="mt-3" onClick={() => setEditType(ty)}><Pencil className="h-3.5 w-3.5" /> {t('common.edit')}</Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'units' && (
        <>
          {unitsQ.isLoading && <Spinner />}
          <div className="card divide-y divide-slate-100 dark:divide-slate-800">
            {unitsQ.data?.units.map((u) => (
              <button key={u.id} onClick={() => setEditUnit(u)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="w-28 shrink-0 rounded-md border-2 border-slate-800 bg-white px-1.5 py-0.5 text-center text-xs font-extrabold tracking-wider text-slate-900 dark:border-slate-300">{u.plate}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{u.carType.brand} {u.carType.name}</p>
                  <p className="text-xs text-slate-500">{u.city} · {u.color} · {u.year} · {u.odometer.toLocaleString('id-ID')} km</p>
                </div>
                <Badge tone={STATE_TONE[u.currentState]}>{t(`unitState.${u.currentState}`)}</Badge>
              </button>
            ))}
          </div>
        </>
      )}

      {editType && <TypeForm type={editType} onClose={() => setEditType(null)} />}
      {editUnit && <UnitForm unit={editUnit} types={typesQ.data?.types || []} onClose={() => setEditUnit(null)} />}
    </>
  );
}

function TypeForm({ type, onClose }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isNew = !type.id;
  const fileRef = useRef(null);
  const [f, setF] = useState({
    name: '', brand: '', category: 'MPV', seats: 7, luggage: 2, transmission: 'AUTOMATIC', fuel: 'Bensin', color: '#0f766e', description: '', isActive: true,
    ...Object.fromEntries(PRICE_FIELDS.map((p) => [p, ''])),
    ...Object.fromEntries(Object.entries(type).map(([k, v]) => [k, v ?? ''])),
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-types'] });
    qc.invalidateQueries({ queryKey: ['types'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name, brand: f.brand, category: f.category, seats: Number(f.seats), luggage: Number(f.luggage), transmission: f.transmission,
        fuel: f.fuel, color: f.color, description: f.description || null, isActive: f.isActive,
        ...Object.fromEntries(PRICE_FIELDS.map((p) => [p, f[p] === '' ? null : Number(f[p])])),
      };
      return isNew ? api('/cars/admin/types', { method: 'POST', body }) : api(`/cars/admin/types/${type.id}`, { method: 'PATCH', body });
    },
    onSuccess: () => {
      refresh();
      toast(t('common.saved'));
      onClose();
    },
  });
  const upload = useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', await compressImage(file, { maxSize: 1400 }));
      return api(`/cars/admin/types/${type.id}/image`, { method: 'POST', body: form });
    },
    onSuccess: () => {
      refresh();
      toast(t('admin.photoUploaded'));
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/cars/admin/types/${type.id}`, { method: 'DELETE' }),
    onSuccess: (r) => {
      refresh();
      toast(r.deactivated ? t('admin.deactivated') : t('admin.deleted'));
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={isNew ? t('admin.addType') : `${t('common.edit')} ${type.name}`}
      footer={
        <>
          {!isNew && <Button variant="ghost" className="text-red-600" loading={remove.isPending} onClick={() => window.confirm(t('admin.confirmDelete')) && remove.mutate()}><Trash2 className="h-4 w-4" /></Button>}
          <Button variant="secondary" className="ml-auto" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="type-form" loading={save.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <form
        id="type-form"
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t('admin.brand')}><input className="input" required value={f.brand} onChange={set('brand')} /></Field>
        <Field label={t('admin.typeName')}><input className="input" required value={f.name} onChange={set('name')} /></Field>
        <Field label={t('admin.category')}>
          <select className="input" value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`category.${c}`)}</option>)}</select>
        </Field>
        <Field label={t('admin.transmission')}>
          <select className="input" value={f.transmission} onChange={set('transmission')}>{['AUTOMATIC', 'MANUAL'].map((c) => <option key={c} value={c}>{t(`transmission.${c}`)}</option>)}</select>
        </Field>
        <Field label={t('admin.seats')}><input className="input" type="number" min={2} max={20} required value={f.seats} onChange={set('seats')} /></Field>
        <Field label={t('admin.luggage')}><input className="input" type="number" min={0} max={10} value={f.luggage} onChange={set('luggage')} /></Field>
        <Field label={t('admin.fuel')}><input className="input" value={f.fuel} onChange={set('fuel')} /></Field>
        <Field label={t('admin.artColor')}><input className="input p-1" type="color" value={f.color} onChange={set('color')} /></Field>
        <p className="col-span-2 mt-2 text-xs font-bold text-slate-500 uppercase">{t('admin.prices')}</p>
        {PRICE_FIELDS.map((p) => (
          <Field key={p} label={t(`admin.price.${p}`)}>
            <input className="input" type="number" min={0} step={1000} placeholder={t('admin.notOffered')} value={f[p]} onChange={set(p)} />
          </Field>
        ))}
        <Field label={t('admin.description')} className="col-span-2"><textarea className="input" rows={2} value={f.description} onChange={set('description')} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.isActive} onChange={set('isActive')} className="h-4 w-4 accent-brand-700" /> {t('admin.showToCustomers')}</label>
        <ErrorNote error={save.error} className="col-span-2" />
      </form>
      {!isNew && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <CarImage type={type} className="h-14 w-24 rounded-lg" />
          <Button size="sm" variant="secondary" loading={upload.isPending} onClick={() => fileRef.current?.click()}><ImageUp className="h-4 w-4" /> {t('admin.uploadPhoto')}</Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
          <ErrorNote error={upload.error} />
        </div>
      )}
    </Modal>
  );
}

function UnitForm({ unit, types, onClose }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isNew = !unit.id;
  const [f, setF] = useState({ carTypeId: unit.carTypeId || types[0]?.id || '', plate: unit.plate || '', year: unit.year || new Date().getFullYear(), color: unit.color || '', city: unit.city || 'Palu', odometer: unit.odometer ?? 0, status: unit.status || 'ACTIVE' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-units'] });
    qc.invalidateQueries({ queryKey: ['admin-types'] });
    qc.invalidateQueries({ queryKey: ['cities'] });
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, carTypeId: Number(f.carTypeId), year: Number(f.year), odometer: Number(f.odometer) };
      return isNew ? api('/cars/admin/units', { method: 'POST', body }) : api(`/cars/admin/units/${unit.id}`, { method: 'PATCH', body });
    },
    onSuccess: () => {
      refresh();
      toast(t('common.saved'));
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/cars/admin/units/${unit.id}`, { method: 'DELETE' }),
    onSuccess: (r) => {
      refresh();
      toast(r.deactivated ? t('admin.deactivated') : t('admin.deleted'));
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t('admin.addUnit') : unit.plate}
      footer={
        <>
          {!isNew && <Button variant="ghost" className="text-red-600" loading={remove.isPending} onClick={() => window.confirm(t('admin.confirmDelete')) && remove.mutate()}><Trash2 className="h-4 w-4" /></Button>}
          <Button variant="secondary" className="ml-auto" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="unit-form" loading={save.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <form
        id="unit-form"
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t('admin.type')} className="col-span-2">
          <select className="input" value={f.carTypeId} onChange={set('carTypeId')} required>{types.map((ty) => <option key={ty.id} value={ty.id}>{ty.brand} {ty.name}</option>)}</select>
        </Field>
        <Field label={t('admin.plate')}><input className="input uppercase" required value={f.plate} onChange={set('plate')} placeholder="AB 1234 XY" /></Field>
        <Field label={t('admin.city')}><input className="input" required value={f.city} onChange={set('city')} /></Field>
        <Field label={t('admin.year')}><input className="input" type="number" required value={f.year} onChange={set('year')} /></Field>
        <Field label={t('admin.color')}><input className="input" required value={f.color} onChange={set('color')} /></Field>
        <Field label={t('admin.odometer')}><input className="input" type="number" min={0} value={f.odometer} onChange={set('odometer')} /></Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={set('status')}><option value="ACTIVE">{t('admin.active')}</option><option value="INACTIVE">{t('admin.inactive')}</option></select>
        </Field>
        <ErrorNote error={save.error} className="col-span-2" />
      </form>
    </Modal>
  );
}
