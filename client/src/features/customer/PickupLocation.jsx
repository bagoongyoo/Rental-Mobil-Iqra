// Lokasi jemput (dengan driver) / antar unit (lepas kunci) di checkout (Dev 2).
// Dua cara: lokasi akurat (GPS atau pin di peta) + detail alamat, atau alamat manual saja.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crosshair, LocateFixed, MapPin, PencilLine, TriangleAlert, X } from 'lucide-react';
import { Button, Field, Segmented, Spinner } from '../../components/ui';
import { distanceFromPaluKm, FAR_FROM_PALU_KM, PICKUP_POINTS, reverseGeocode } from './palu';
import { LOW_ACCURACY_M, getPreciseLocation } from '../../lib/preciseLocation';

const PickupMap = lazy(() => import('./PickupMap'));

export const emptyLocation = () => ({ mode: 'pin', address: '', lat: null, lng: null, accuracy: null, autoAddress: false });

/** value = { mode, address, lat, lng, accuracy, autoAddress } */
export function PickupLocation({ service, city, value, onChange, error }) {
  const { t, i18n } = useTranslation();
  const [locating, setLocating] = useState(false);
  const [liveAccuracy, setLiveAccuracy] = useState(null); // akurasi titik terbaik selama mencari
  const [gpsError, setGpsError] = useState(null);
  const [geocoding, setGeocoding] = useState(false);
  const latest = useRef(value);
  latest.current = value;
  const set = (patch) => onChange({ ...latest.current, ...patch });
  const hasPin = value.lat != null && value.lng != null;
  const far = hasPin ? distanceFromPaluKm(value.lat, value.lng) : 0;
  const isDriver = service === 'WITH_DRIVER';

  // Isi alamat otomatis dari titik pin (hanya jika kolom alamat kosong atau sebelumnya juga otomatis).
  useEffect(() => {
    if (!hasPin) return;
    if (value.address && !value.autoAddress) return;
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setGeocoding(true);
      const addr = await reverseGeocode(value.lat, value.lng, i18n.language, ctrl.signal);
      setGeocoding(false);
      if (addr && (!latest.current.address || latest.current.autoAddress)) set({ address: addr, autoAddress: true });
    }, 700);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.lat, value.lng]);

  // GPS seakurat mungkin: pin langsung ditaruh di titik pertama, lalu dipertajam
  // setiap ada titik yang lebih akurat sampai ≤ 20 m atau 20 detik (lib/preciseLocation).
  const locate = async () => {
    setGpsError(null);
    if (!('geolocation' in navigator)) return setGpsError(t('pickup.gpsUnsupported'));
    setLocating(true);
    try {
      const fix = await getPreciseLocation({
        onProgress: (f) => {
          setLiveAccuracy(Math.round(f.accuracy));
          set({ lat: f.lat, lng: f.lng, accuracy: Math.round(f.accuracy) });
        },
      });
      set({ lat: fix.lat, lng: fix.lng, accuracy: Math.round(fix.accuracy) });
    } catch (err) {
      setGpsError(err.code === 1 ? t('pickup.gpsDenied') : t('pickup.gpsFailed'));
    } finally {
      setLocating(false);
      setLiveAccuracy(null);
    }
  };

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
          <MapPin className="h-4 w-4 text-brand-600" />
          {isDriver ? t('checkout.pickup') : t('checkout.delivery')}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">{isDriver ? t('pickup.driverHint') : t('pickup.deliveryHint')}</p>
      </div>

      <Segmented
        className="w-full"
        value={value.mode}
        onChange={(mode) => set(mode === 'manual' ? { mode, lat: null, lng: null, accuracy: null } : { mode })}
        options={[
          { value: 'pin', label: <span className="flex items-center justify-center gap-1.5"><LocateFixed className="h-4 w-4" />{t('pickup.modePin')}</span> },
          { value: 'manual', label: <span className="flex items-center justify-center gap-1.5"><PencilLine className="h-4 w-4" />{t('pickup.modeManual')}</span> },
        ]}
      />

      {value.mode === 'pin' && (
        <div className="space-y-2">
          <Button type="button" variant="soft" className="w-full" loading={locating} onClick={locate}>
            {!locating && <Crosshair className="h-4 w-4" />}{' '}
            {locating ? (liveAccuracy ? t('pickup.sharpening', { m: liveAccuracy }) : t('pickup.locating')) : t('pickup.useMyLocation')}
          </Button>
          {/* Akurasi masih rendah (mis. di dalam gedung) → minta geser pin manual */}
          {!locating && hasPin && value.accuracy > LOW_ACCURACY_M && (
            <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="h-4 w-4 shrink-0" />{t('pickup.lowAccuracy', { m: value.accuracy })}
            </p>
          )}
          {gpsError &&<p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{gpsError}</p>}

          <Suspense fallback={<div className="grid h-56 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800"><Spinner className="py-0" /></div>}>
            <PickupMap lat={value.lat} lng={value.lng} onPick={(lat, lng) => set({ lat, lng, accuracy: null })} />
          </Suspense>

          {hasPin ? (
            <div className="flex items-start justify-between gap-2 text-xs">
              <p className="text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-brand-700 dark:text-brand-400">{t('pickup.pinSet')}</span>
                {value.accuracy ? ` · ${t('pickup.accuracy', { m: value.accuracy })}` : ''}
                <span className="block font-mono text-[11px] text-slate-400">{value.lat.toFixed(6)}, {value.lng.toFixed(6)}</span>
              </p>
              <button type="button" onClick={() => set({ lat: null, lng: null, accuracy: null })} className="flex shrink-0 items-center gap-1 font-semibold text-slate-500 hover:text-red-600">
                <X className="h-3.5 w-3.5" />{t('pickup.clearPin')}
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t('pickup.tapMap')}</p>
          )}

          {far > FAR_FROM_PALU_KM && (
            <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="h-4 w-4 shrink-0" />{t('pickup.farWarning', { km: Math.round(far) })}
            </p>
          )}
        </div>
      )}

      <Field
        label={value.mode === 'pin' ? t('pickup.addressDetail') : t('checkout.address')}
        error={error}
        hint={geocoding ? t('pickup.findingAddress') : value.mode === 'pin' ? t('pickup.addressDetailHint') : undefined}
      >
        <textarea
          className="input"
          rows={2}
          required
          minLength={5}
          maxLength={255}
          placeholder={t('checkout.addressPlaceholder', { city })}
          value={value.address}
          onChange={(e) => set({ address: e.target.value, autoAddress: false })}
        />
      </Field>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-500">{t('checkout.popularPoints')}</p>
        <div className="flex flex-wrap gap-2">
          {PICKUP_POINTS.map((p) => (
            <button
              type="button"
              key={p}
              // Titik populer hanya mengisi alamat; pin dihapus supaya alamat dan titik tidak saling bertentangan.
              onClick={() => set({ address: p, autoAddress: false, lat: null, lng: null, accuracy: null })}
              aria-pressed={value.address === p}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${value.address === p ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-500 dark:bg-brand-950/60 dark:text-brand-200' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}`}
            >
              {p.split(',')[0]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
