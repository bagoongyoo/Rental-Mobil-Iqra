// Dashboard driver (logika Dev 3): GPS & Siap Jalan, daftar tugas, 4 foto kondisi mobil.
// Tampilan memakai komponen & tema yang sama dengan dashboard lain (terang/gelap, ID/EN).
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Camera,
  Car,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  ImagePlus,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  Play,
  Power,
  Radio,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  WifiOff,
} from 'lucide-react';
import {
  MAX_CONDITION_PHOTO_BYTES,
  compressImageUnderLimit,
  fetchAuthorizedAsset,
  getMyDriverProfileApi,
  getDriverTasksApi,
  setDriverReadyApi,
  startDriverTaskApi,
  completeDriverTaskApi,
  getDriverConditionPhotosApi,
  uploadDriverConditionPhotosApi,
} from '../api/driverApi';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useDriverLiveLocation } from '../hooks/useDriverLiveLocation';
import { connectSocket } from '../../../lib/socket';
import { useAuth } from '../../../lib/auth';
import { formatDateTime } from '../../../lib/format';
import { Badge, Button, EmptyState, Modal, Segmented, Select, Spinner } from '../../../components/ui';
import { useDriverLogout } from '../DriverLayout';

const PHOTO_SLOTS = [
  { key: 'front', formField: 'frontPhoto' },
  { key: 'back', formField: 'backPhoto' },
  { key: 'left', formField: 'leftPhoto' },
  { key: 'right', formField: 'rightPhoto' },
];

const STATUS_TONE = { CONFIRMED: 'blue', ONGOING: 'brand', COMPLETED: 'slate', CANCELLED: 'red' };

function getDriverInitials(name) {
  if (!name || typeof name !== 'string') return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '0 KB';
  if (bytes >= MAX_CONDITION_PHOTO_BYTES) return `${(bytes / MAX_CONDITION_PHOTO_BYTES).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function extractPickupMeta(task) {
  if (!task) return { hasPin: false, lat: null, lng: null, cleanNotes: '' };
  const notesText = task.notes || '';
  const match = notesText.match(/https:\/\/maps\.google\.com\/\?q=(-?[\d.]+),(-?[\d.]+)/);
  const lat = task.pickupLat != null ? Number(task.pickupLat) : match ? Number(match[1]) : null;
  const lng = task.pickupLng != null ? Number(task.pickupLng) : match ? Number(match[2]) : null;
  const hasPin = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const cleanNotes = notesText.replace(/\n?Titik lokasi: \S+/g, '').trim();
  return { hasPin, lat, lng, cleanNotes };
}

function buildPickupMapsUrl(task) {
  const { hasPin, lat, lng } = extractPickupMeta(task);
  if (hasPin) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const query = [task?.pickupAddress, task?.pickupCity].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query || 'Palu')}`;
}

function createEmptySlots() {
  return { front: null, back: null, left: null, right: null };
}

/** Kotak pesan sukses / gagal. */
function Notice({ type = 'error', children, action }) {
  const ok = type === 'success';
  return (
    <div
      role={ok ? 'status' : 'alert'}
      className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm ${ok ? 'bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-200' : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'}`}
    >
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}

export function DriverDashboardPage() {
  const { t, i18n } = useTranslation();
  const authToken = useAuth((s) => s.token);
  const authUser = useAuth((s) => s.user);
  const setAuthUser = useAuth((s) => s.setUser);
  const logout = useDriverLogout();

  const [mainTab, setMainTab] = useState('gps');

  const [profile, setProfile] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [activeTasksPool, setActiveTasksPool] = useState([]);
  const [taskFilter, setTaskFilter] = useState('today');
  const [selectedTask, setSelectedTask] = useState(null);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [accountBlockedError, setAccountBlockedError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  // Foto kondisi mobil disimpan per orderId
  const [conditionOrderId, setConditionOrderId] = useState(null);
  const [slotsByOrder, setSlotsByOrder] = useState({});
  const [notesByOrder, setNotesByOrder] = useState({});
  const [savedMetaByOrder, setSavedMetaByOrder] = useState({});
  const [loadingConditionOrderId, setLoadingConditionOrderId] = useState(null);
  const [compressingSlot, setCompressingSlot] = useState(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState(null);

  const fileInputRefs = useRef({});
  const slotsByOrderRef = useRef(slotsByOrder);
  slotsByOrderRef.current = slotsByOrder;
  const profilePhotoUrlRef = useRef(profilePhotoUrl);
  profilePhotoUrlRef.current = profilePhotoUrl;

  const { isOnline, isChecking, verifyConnectionBeforeAction } = useNetworkStatus();

  const ongoingOrder =
    activeTasksPool.find((x) => x.status === 'ONGOING') || tasks.find((x) => x.status === 'ONGOING') || null;

  const { permissionStatus, isGpsGranted, coords, gpsError, lastSentAt, lastRefreshAt, requestLocationPermission } =
    useDriverLiveLocation({
      activeOrderId: ongoingOrder?.id || null,
      isTaskOngoing: Boolean(ongoingOrder),
      intervalMs: 10000,
      // Siap Jalan → lokasi disegarkan & dikirim tiap 5 menit walau belum ada tugas.
      shareLocation: Boolean(profile?.driverProfile?.isReady),
    });

  const timeFmt = (iso) => {
    if (!iso) return '--:--';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString(i18n.language === 'en' ? 'en-GB' : 'id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };
  const slotName = (key) => t(`driver.photos.slot.${key}.title`);

  // Cleanup seluruh ObjectURL saat unmount
  useEffect(() => {
    return () => {
      if (profilePhotoUrlRef.current) URL.revokeObjectURL(profilePhotoUrlRef.current);
      Object.values(slotsByOrderRef.current).forEach((orderSlots) => {
        Object.values(orderSlots || {}).forEach((entry) => {
          if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        });
      });
    };
  }, []);

  const loadData = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      setFetchError('');
      setAccountBlockedError('');
      try {
        const [profileRes, tasksRes, activeRes] = await Promise.all([
          getMyDriverProfileApi(),
          getDriverTasksApi(taskFilter),
          taskFilter === 'active' ? Promise.resolve(null) : getDriverTasksApi('active'),
        ]);

        const nextProfile = profileRes?.data || null;
        const nextTasks = tasksRes?.data || [];
        const nextActive = taskFilter === 'active' ? nextTasks : activeRes?.data || [];

        setProfile(nextProfile);
        if (nextProfile) setAuthUser(nextProfile);
        setTasks(nextTasks);
        setActiveTasksPool(nextActive);

        // Muat foto profil asli driver bila ada di server
        if (nextProfile?.driverProfile?.photoFilePath && !profilePhotoUrlRef.current) {
          fetchAuthorizedAsset('/drivers/me/photo').then((asset) => {
            if (asset?.previewUrl) {
              setProfilePhotoUrl((prevUrl) => {
                if (prevUrl) URL.revokeObjectURL(prevUrl);
                return asset.previewUrl;
              });
            }
          });
        }

        setConditionOrderId((prevId) => {
          if (prevId && nextActive.some((o) => o.id === prevId)) return prevId;
          const ongoing = nextActive.find((o) => o.status === 'ONGOING');
          if (ongoing) return ongoing.id;
          const confirmed = nextActive.find((o) => o.status === 'CONFIRMED');
          return confirmed ? confirmed.id : null;
        });

        setSelectedTask((prevSelected) => {
          if (!prevSelected) return null;
          return nextTasks.find((x) => x.id === prevSelected.id) || prevSelected;
        });
      } catch (err) {
        if (err?.status === 403) setAccountBlockedError(err.message || t('driver.blocked.default'));
        setFetchError(err.message || t('driver.msg.loadFail'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [taskFilter, setAuthUser]
  );

  useEffect(() => {
    loadData();
    const socket = connectSocket(authToken);
    if (socket) {
      const handleOrderUpdate = () => loadData({ silent: true });
      socket.on('order:status:update', handleOrderUpdate);
      socket.on('booking:updated', handleOrderUpdate);
      return () => {
        socket.off('order:status:update', handleOrderUpdate);
        socket.off('booking:updated', handleOrderUpdate);
      };
    }
    return undefined;
  }, [loadData, authToken]);

  // Muat status foto kondisi yang sudah tersimpan di server saat activeConditionOrder berubah
  const activeConditionOrder = activeTasksPool.find((o) => o.id === Number(conditionOrderId)) || activeTasksPool[0] || null;

  useEffect(() => {
    const orderId = activeConditionOrder?.id;
    if (!orderId) return undefined;
    if (savedMetaByOrder[orderId] !== undefined) return undefined;

    let cancelled = false;
    setLoadingConditionOrderId(orderId);

    getDriverConditionPhotosApi(orderId)
      .then(async (res) => {
        if (cancelled) return;
        const meta = res?.data;
        setSavedMetaByOrder((prev) => ({ ...prev, [orderId]: meta || { uploaded: false } }));

        if (meta?.uploaded && meta.photos) {
          setNotesByOrder((prev) => ({ ...prev, [orderId]: prev[orderId] !== undefined ? prev[orderId] : meta.notes || '' }));

          const loadedSlots = {};
          await Promise.all(
            PHOTO_SLOTS.map(async (slot) => {
              const info = meta.photos[slot.key];
              if (!info) return;
              const asset = await fetchAuthorizedAsset(`/drivers/me/tasks/${orderId}/condition-photos/${slot.key}`);
              if (!cancelled && asset?.blob) {
                const fileFromServer = new File([asset.blob], info.fileName || `${slot.key}.webp`, { type: asset.blob.type || 'image/webp' });
                loadedSlots[slot.key] = {
                  file: fileFromServer,
                  previewUrl: asset.previewUrl,
                  size: info.size || asset.blob.size,
                  isOverLimit: (info.size || asset.blob.size) > MAX_CONDITION_PHOTO_BYTES,
                  isSavedOnServer: true,
                };
              } else if (asset?.previewUrl) {
                URL.revokeObjectURL(asset.previewUrl);
              }
            })
          );

          if (!cancelled && Object.keys(loadedSlots).length > 0) {
            setSlotsByOrder((prev) => {
              const existing = prev[orderId] || createEmptySlots();
              const merged = { ...existing };
              PHOTO_SLOTS.forEach((slot) => {
                if (!merged[slot.key] && loadedSlots[slot.key]) merged[slot.key] = loadedSlots[slot.key];
                else if (loadedSlots[slot.key]?.previewUrl) URL.revokeObjectURL(loadedSlots[slot.key].previewUrl);
              });
              return { ...prev, [orderId]: merged };
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setSavedMetaByOrder((prev) => ({ ...prev, [orderId]: { uploaded: false } }));
      })
      .finally(() => {
        if (!cancelled) setLoadingConditionOrderId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeConditionOrder?.id, savedMetaByOrder]);

  const handleManualRefresh = async () => {
    setAlertMsg(null);
    await verifyConnectionBeforeAction();
    if (activeConditionOrder?.id) {
      setSavedMetaByOrder((prev) => {
        const next = { ...prev };
        delete next[activeConditionOrder.id];
        return next;
      });
    }
    await loadData();
  };

  const handleToggleReady = async () => {
    setAlertMsg(null);
    const currentlyReady = Boolean(profile?.driverProfile?.isReady) && isGpsGranted;
    const nextReady = !currentlyReady;

    const online = await verifyConnectionBeforeAction();
    if (nextReady && !online) {
      setAlertMsg({ type: 'error', text: t('driver.msg.offlineReady') });
      return;
    }

    setActionLoading(true);
    try {
      let currentCoords = coords;
      if (nextReady) currentCoords = await requestLocationPermission();

      const res = await setDriverReadyApi({
        isReady: nextReady,
        gpsGranted: nextReady ? true : isGpsGranted,
        lat: currentCoords?.lat,
        lng: currentCoords?.lng,
      });

      setProfile((prev) => (prev ? { ...prev, driverProfile: res.data } : prev));
      setAlertMsg({ type: 'success', text: nextReady ? t('driver.msg.readyOn') : t('driver.msg.readyOff') });
    } catch (err) {
      setAlertMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshGpsSignal = async () => {
    setAlertMsg(null);
    try {
      await requestLocationPermission();
    } catch (err) {
      setAlertMsg({ type: 'error', text: err.message });
    }
  };

  const handleStartTask = async (task) => {
    setAlertMsg(null);
    const online = await verifyConnectionBeforeAction();
    if (!online) {
      setAlertMsg({ type: 'error', text: t('driver.msg.offlineStart') });
      return;
    }

    setActionLoading(true);
    try {
      const currentCoords = await requestLocationPermission();
      const res = await startDriverTaskApi(task.id, { gpsGranted: true, lat: currentCoords.lat, lng: currentCoords.lng });
      setAlertMsg({ type: 'success', text: t('driver.msg.started', { code: task.orderCode }) });
      setSelectedTask(null);
      await loadData();
      if (res?.data?.id) setConditionOrderId(res.data.id);
    } catch (err) {
      setAlertMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteTask = async (task) => {
    setAlertMsg(null);
    const online = await verifyConnectionBeforeAction();
    if (!online) {
      setAlertMsg({ type: 'error', text: t('driver.msg.offlineComplete') });
      return;
    }

    setActionLoading(true);
    try {
      await completeDriverTaskApi(task.id, { lat: coords?.lat, lng: coords?.lng });
      setAlertMsg({ type: 'success', text: t('driver.msg.completed', { code: task.orderCode }) });
      setSelectedTask(null);
      await loadData();
    } catch (err) {
      setAlertMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const currentOrderSlots = (activeConditionOrder?.id && slotsByOrder[activeConditionOrder.id]) || createEmptySlots();
  const currentConditionNote = (activeConditionOrder?.id && notesByOrder[activeConditionOrder.id]) || '';

  const handleSelectPhoto = (slotKey, event) => {
    const orderId = activeConditionOrder?.id;
    const file = event.target.files?.[0];
    if (!file || !orderId) return;

    setPhotoFeedback(null);
    if (!file.type.startsWith('image/')) {
      setPhotoFeedback({ type: 'error', text: t('driver.msg.badFormat') });
      event.target.value = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setSlotsByOrder((prev) => {
      const orderSlots = prev[orderId] || createEmptySlots();
      if (orderSlots[slotKey]?.previewUrl) URL.revokeObjectURL(orderSlots[slotKey].previewUrl);
      return {
        ...prev,
        [orderId]: {
          ...orderSlots,
          [slotKey]: { file, previewUrl, size: file.size, isOverLimit: file.size > MAX_CONDITION_PHOTO_BYTES, isSavedOnServer: false },
        },
      };
    });
    event.target.value = '';
  };

  const handleRemovePhoto = (slotKey) => {
    const orderId = activeConditionOrder?.id;
    if (!orderId) return;
    setPhotoFeedback(null);
    setSlotsByOrder((prev) => {
      const orderSlots = prev[orderId] || createEmptySlots();
      if (orderSlots[slotKey]?.previewUrl) URL.revokeObjectURL(orderSlots[slotKey].previewUrl);
      return { ...prev, [orderId]: { ...orderSlots, [slotKey]: null } };
    });
  };

  const handleAutoCompressSlot = async (slotKey) => {
    const orderId = activeConditionOrder?.id;
    const currentSlot = currentOrderSlots[slotKey];
    if (!orderId || !currentSlot?.file) return;

    setPhotoFeedback(null);
    setCompressingSlot(slotKey);
    try {
      const compressedFile = await compressImageUnderLimit(currentSlot.file, MAX_CONDITION_PHOTO_BYTES);
      const nextPreviewUrl = URL.createObjectURL(compressedFile);

      setSlotsByOrder((prev) => {
        const orderSlots = prev[orderId] || createEmptySlots();
        if (orderSlots[slotKey]?.previewUrl) URL.revokeObjectURL(orderSlots[slotKey].previewUrl);
        return {
          ...prev,
          [orderId]: {
            ...orderSlots,
            [slotKey]: {
              file: compressedFile,
              previewUrl: nextPreviewUrl,
              size: compressedFile.size,
              isOverLimit: compressedFile.size > MAX_CONDITION_PHOTO_BYTES,
              isSavedOnServer: false,
            },
          },
        };
      });

      setPhotoFeedback({ type: 'success', text: t('driver.msg.compressed', { size: formatBytes(compressedFile.size) }) });
    } catch (err) {
      setPhotoFeedback({ type: 'error', text: err.message || t('driver.msg.compressFail') });
    } finally {
      setCompressingSlot(null);
    }
  };

  const validPhotosCount = PHOTO_SLOTS.filter((s) => currentOrderSlots[s.key]?.file && !currentOrderSlots[s.key]?.isOverLimit).length;
  const hasAnyOverLimitPhoto = PHOTO_SLOTS.some((s) => currentOrderSlots[s.key]?.isOverLimit);
  const canSubmitPhotos = Boolean(activeConditionOrder) && validPhotosCount === 4 && !hasAnyOverLimitPhoto && !uploadingPhotos;

  const handleUploadConditionPhotos = async (e) => {
    e.preventDefault();
    if (!activeConditionOrder || !canSubmitPhotos) return;

    const orderId = activeConditionOrder.id;
    setPhotoFeedback(null);
    const online = await verifyConnectionBeforeAction();
    if (!online) {
      setPhotoFeedback({ type: 'error', text: t('driver.msg.offlineUpload') });
      return;
    }

    setUploadingPhotos(true);
    try {
      const formData = new FormData();
      PHOTO_SLOTS.forEach((slot) => {
        const entry = currentOrderSlots[slot.key];
        if (entry?.file) formData.append(slot.formField, entry.file);
      });
      if (currentConditionNote.trim()) formData.append('notes', currentConditionNote.trim());

      const res = await uploadDriverConditionPhotosApi(orderId, formData);
      const savedMeta = res?.data;

      setSavedMetaByOrder((prev) => ({ ...prev, [orderId]: savedMeta || { uploaded: true } }));
      setSlotsByOrder((prev) => {
        const orderSlots = prev[orderId] || createEmptySlots();
        const updatedSlots = { ...orderSlots };
        PHOTO_SLOTS.forEach((slot) => {
          if (updatedSlots[slot.key]) {
            updatedSlots[slot.key] = {
              ...updatedSlots[slot.key],
              size: savedMeta?.photos?.[slot.key]?.size || updatedSlots[slot.key].size,
              isSavedOnServer: true,
            };
          }
        });
        return { ...prev, [orderId]: updatedSlots };
      });

      setPhotoFeedback({ type: 'success', text: t('driver.msg.uploaded', { code: activeConditionOrder.orderCode }) });
    } catch (err) {
      setPhotoFeedback({ type: 'error', text: err.message || t('driver.msg.uploadFail') });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const displayProfile = profile || (authUser?.role === 'DRIVER' ? authUser : null);
  const isReady = Boolean(displayProfile?.driverProfile?.isReady);
  const isGpsActiveReady = isReady && isGpsGranted;
  const lastUpdatedTime = timeFmt(lastSentAt || coords?.timestamp);
  const currentSavedMeta = activeConditionOrder?.id ? savedMetaByOrder[activeConditionOrder.id] : null;

  const gpsState = isGpsActiveReady ? 'active' : permissionStatus === 'denied' ? 'denied' : isGpsGranted ? 'standby' : 'off';
  const gpsTone = {
    active: 'bg-brand-600 text-white',
    standby: 'bg-amber-500 text-white',
    denied: 'bg-red-600 text-white',
    off: 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  }[gpsState];

  return (
    <div className="space-y-4">
      {/* Peringatan offline */}
      {!isOnline && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-red-600 px-4 py-3 text-white">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <WifiOff className="h-4 w-4 shrink-0" />
            {t('driver.offline.banner')}
          </span>
          <Button size="sm" variant="secondary" onClick={handleManualRefresh} disabled={isChecking}>
            {isChecking ? t('driver.offline.checking') : t('driver.offline.recheck')}
          </Button>
        </div>
      )}

      {/* Akun diblokir / belum disetujui admin */}
      {accountBlockedError && (
        <Notice
          action={
            <Button size="sm" variant="secondary" onClick={logout}>
              <LogOut className="h-4 w-4" /> {t('driver.blocked.logout')}
            </Button>
          }
        >
          {accountBlockedError}
        </Notice>
      )}

      {/* Profil singkat + segarkan */}
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-100 text-sm font-bold text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
          {profilePhotoUrl ? (
            <img src={profilePhotoUrl} alt={displayProfile?.name || ''} className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true">{getDriverInitials(displayProfile?.name)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {loading && !displayProfile ? (
            <div className="mb-1 h-5 w-36 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          ) : (
            <h1 className="truncate text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">{displayProfile?.name || t('driver.profile.fallbackName')}</h1>
          )}
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className={`h-2 w-2 rounded-full ${isChecking ? 'animate-pulse bg-amber-500' : isOnline ? 'bg-brand-500' : 'bg-red-600'}`} />
              {isChecking ? t('driver.profile.checking') : isOnline ? t('driver.profile.online') : t('driver.profile.offline')}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate tabular-nums">
              {t('driver.profile.sim')}: {displayProfile?.driverProfile?.licenseNumber || t('driver.profile.simNone')}
            </span>
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleManualRefresh} disabled={loading || isChecking} aria-label={t('driver.profile.refresh')}>
          <RefreshCw className={`h-4 w-4 ${loading || isChecking ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('driver.profile.refresh')}</span>
        </Button>
      </div>

      {/* Tab utama */}
      <Segmented
        className="w-full"
        value={mainTab}
        onChange={setMainTab}
        options={[
          {
            value: 'gps',
            label: (
              <span className="flex items-center justify-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${isGpsActiveReady ? 'bg-brand-500' : isGpsGranted ? 'bg-amber-500' : 'bg-slate-400'}`} />
                {t('driver.tabs.gps')}
              </span>
            ),
          },
          {
            value: 'photos',
            label: (
              <span className="flex items-center justify-center gap-1.5">
                {t('driver.tabs.photos')}
                <span className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${validPhotosCount === 4 ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>{validPhotosCount}/4</span>
              </span>
            ),
          },
        ]}
      />

      {mainTab === 'gps' ? (
        <div className="space-y-4">
          {/* Kartu GPS & Siap Jalan */}
          <section aria-label={t('driver.gps.title')} className="card space-y-4 p-4">
            <div className="flex items-start gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${gpsTone}`}>
                <LocateFixed className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t('driver.gps.title')}</p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t(`driver.gps.state.${gpsState}`)}</h2>
              </div>
              <Badge tone={coords ? (coords.accuracy > 100 ? 'amber' : 'brand') : 'slate'} className="tabular-nums">
                {coords?.accuracy != null ? `±${Math.round(coords.accuracy)} m` : t('driver.gps.off')}
              </Badge>
            </div>

            {ongoingOrder && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm dark:bg-brand-950/50">
                <span className="flex min-w-0 items-start gap-2 leading-snug font-semibold text-brand-800 dark:text-brand-200">
                  <Radio className="mt-0.5 h-4 w-4 shrink-0 animate-pulse" />
                  <span>{t('driver.gps.live', { code: ongoingOrder.orderCode })}</span>
                </span>
                <Badge tone="brand">LIVE</Badge>
              </div>
            )}

            <dl className="grid grid-cols-3 gap-2">
              <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
                <dt className="text-xs text-slate-500">{t('driver.gps.coords')}</dt>
                <dd className="truncate text-sm font-bold text-slate-900 tabular-nums dark:text-white">
                  {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : t('driver.gps.notLocked')}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
                <dt className="text-xs text-slate-500">{t('driver.gps.lastUpdate')}</dt>
                <dd className="text-sm font-bold text-slate-900 tabular-nums dark:text-white">{lastUpdatedTime}</dd>
              </div>
            </dl>

            <div className="space-y-1 text-xs text-slate-500">
              {isGpsGranted && (
                <p>
                  {t('driver.gps.refreshEvery')}
                  {lastRefreshAt ? ` · ${t('driver.gps.lastRefresh', { time: timeFmt(lastRefreshAt) })}` : ''}
                  {coords?.accuracy > 100 ? ` · ${t('driver.gps.weak')}` : ''}
                </p>
              )}
              {!isGpsGranted && <p>{t('driver.gps.enableHint')}</p>}
              <p className="flex items-center justify-between">
                <span>{t('driver.gps.connection')}</span>
                <span className={`font-semibold ${isOnline ? 'text-brand-700 dark:text-brand-400' : 'text-red-600'}`}>
                  {isOnline ? t('driver.gps.connected') : t('driver.gps.disconnected')}
                </span>
              </p>
            </div>

            <div className="flex gap-2">
              {isGpsGranted && coords && (
                <Button
                  as="a"
                  variant="secondary"
                  size="sm"
                  href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=16/${coords.lat}/${coords.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1"
                >
                  <ExternalLink className="h-4 w-4" /> {t('driver.gps.openMap')}
                </Button>
              )}
              <Button variant="secondary" size="sm" className="flex-1" onClick={handleRefreshGpsSignal}>
                <RefreshCw className="h-4 w-4" /> {t('driver.gps.refreshGps')}
              </Button>
            </div>

            <Button className="w-full" variant={isGpsActiveReady ? 'secondary' : 'primary'} size="lg" loading={actionLoading} onClick={handleToggleReady}>
              {!actionLoading && <Power className="h-4 w-4" />}
              {actionLoading ? t('driver.gps.processing') : isGpsActiveReady ? t('driver.gps.readyOff') : t('driver.gps.readyOn')}
            </Button>
          </section>

          {/* Pesan hasil aksi / izin GPS */}
          {(permissionStatus === 'denied' || gpsError || alertMsg) && (
            <Notice
              type={alertMsg?.type === 'success' && !gpsError && permissionStatus !== 'denied' ? 'success' : 'error'}
              action={
                permissionStatus === 'denied' && (
                  <Button size="sm" variant="secondary" onClick={handleRefreshGpsSignal}>
                    {t('driver.gps.retryPermission')}
                  </Button>
                )
              }
            >
              {alertMsg?.text || gpsError || t('driver.gps.deniedDefault')}
            </Notice>
          )}

          {/* Daftar tugas */}
          <section aria-label={t('driver.tasks.title')} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('driver.tasks.title')}</h2>
              <span className="text-sm text-slate-500 tabular-nums">{t('driver.tasks.count', { count: tasks.length })}</span>
            </div>

            <Segmented
              className="w-full"
              value={taskFilter}
              onChange={setTaskFilter}
              options={['today', 'active', 'history'].map((id) => ({ value: id, label: t(`driver.tasks.filter.${id}`) }))}
            />

            {loading ? (
              <div className="card">
                <Spinner />
              </div>
            ) : fetchError ? (
              <div className="card">
                <EmptyState
                  icon={AlertTriangle}
                  title={t('driver.tasks.errorTitle')}
                  action={
                    <Button variant="secondary" size="sm" onClick={handleManualRefresh}>
                      <RefreshCw className="h-4 w-4" /> {t('driver.tasks.retry')}
                    </Button>
                  }
                >
                  {fetchError}
                </EmptyState>
              </div>
            ) : tasks.length === 0 ? (
              <div className="card">
                <EmptyState icon={Car} title={t('driver.tasks.emptyTitle')}>
                  {t('driver.tasks.emptyText')}
                </EmptyState>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => {
                  const isActiveOrder = ['CONFIRMED', 'ONGOING'].includes(task.status);
                  const { hasPin } = extractPickupMeta(task);
                  const orderPhotoSlots = slotsByOrder[task.id] || {};
                  const taskPhotoCount = PHOTO_SLOTS.filter((s) => orderPhotoSlots[s.key]?.file && !orderPhotoSlots[s.key]?.isOverLimit).length;

                  return (
                    <article key={task.id} className="card space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-semibold text-slate-500">#{task.orderCode}</p>
                          <h3 className="truncate font-bold text-slate-900 dark:text-white">
                            {task.carType?.name || t('driver.tasks.unitFallback')}
                            <span className="text-slate-400"> · </span>
                            <span className="font-mono tabular-nums">{task.carUnit?.plateNumber || t('driver.tasks.plateNone')}</span>
                          </h3>
                        </div>
                        <Badge tone={STATUS_TONE[task.status] || 'slate'}>{t(`status.${task.status}`, task.status)}</Badge>
                      </div>

                      <div className="grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2 dark:bg-slate-800/60">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            <MapPin className="h-3.5 w-3.5" /> {t('driver.tasks.pickup')}
                            {hasPin && (
                              <Badge tone="brand" className="!px-1.5 !py-0 text-[10px]">
                                <LocateFixed className="h-3 w-3" /> {t('driver.tasks.pinAccurate')}
                              </Badge>
                            )}
                          </p>
                          <p className="font-semibold text-slate-900 dark:text-white">{task.pickupCity || '-'}</p>
                          <p className="line-clamp-2 text-xs text-slate-500">{task.pickupAddress || '-'}</p>
                        </div>
                        <div>
                          <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Clock className="h-3.5 w-3.5" /> {t('driver.tasks.schedule')}
                          </p>
                          <p className="font-semibold text-slate-900 tabular-nums dark:text-white">{formatDateTime(task.startTime)}</p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            {t('driver.tasks.until')} {formatDateTime(task.endTime)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-sm">
                        <p className="min-w-0 truncate">
                          <span className="text-slate-500">{t('driver.tasks.customer')}: </span>
                          <span className="font-semibold text-slate-900 dark:text-white">{task.customer?.name || '-'}</span>
                        </p>
                        {task.customer?.phone ? (
                          <a href={`tel:${task.customer.phone}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-semibold text-brand-700 tabular-nums hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/50">
                            <Phone className="h-3.5 w-3.5" /> {task.customer.phone}
                          </a>
                        ) : (
                          <span className="text-slate-500">{t('driver.tasks.phoneNone')}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button as="a" href={buildPickupMapsUrl(task)} target="_blank" rel="noreferrer" variant="secondary" size="sm">
                          <Navigation className="h-4 w-4" /> {t('driver.tasks.openMaps')}
                        </Button>
                        {isActiveOrder ? (
                          <Button
                            variant="soft"
                            size="sm"
                            onClick={() => {
                              setConditionOrderId(task.id);
                              setMainTab('photos');
                            }}
                          >
                            <Camera className="h-4 w-4" /> {t('driver.tasks.photosBtn', { n: taskPhotoCount > 0 ? taskPhotoCount : validPhotosCount })}
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => setSelectedTask(task)}>
                            {t('driver.tasks.detail')}
                          </Button>
                        )}
                      </div>

                      {task.status === 'CONFIRMED' && (
                        <Button className="w-full" disabled={actionLoading || !isOnline || permissionStatus === 'denied'} onClick={() => handleStartTask(task)}>
                          <Play className="h-4 w-4 fill-current" /> {t('driver.tasks.start')}
                        </Button>
                      )}
                      {task.status === 'ONGOING' && (
                        <Button className="w-full" disabled={actionLoading || !isOnline} onClick={() => handleCompleteTask(task)}>
                          <Check className="h-4 w-4" /> {t('driver.tasks.finish')}
                        </Button>
                      )}
                      {isActiveOrder && (
                        <Button variant="ghost" size="sm" className="w-full" onClick={() => setSelectedTask(task)}>
                          {t('driver.tasks.fullDetail')}
                        </Button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      ) : (
        /* Tab foto kondisi mobil: 4 foto wajib, maks 1 MB per foto */
        <section aria-label={t('driver.photos.title')} className="space-y-4">
          {!activeConditionOrder ? (
            <div className="card">
              <EmptyState
                icon={Camera}
                title={t('driver.photos.noOrderTitle')}
                action={
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setMainTab('gps')}>{t('driver.photos.seeTasks')}</Button>
                    <Button size="sm" variant="secondary" onClick={handleManualRefresh}>{t('driver.photos.reload')}</Button>
                  </div>
                }
              >
                {t('driver.photos.noOrderText')}
              </EmptyState>
            </div>
          ) : (
            <form onSubmit={handleUploadConditionPhotos} className="space-y-4">
              <div className="card space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('driver.photos.title')}</h2>
                    <p className="text-sm text-slate-500">{t('driver.photos.subtitle')}</p>
                  </div>
                  <Badge tone={validPhotosCount === 4 ? 'brand' : 'slate'} className="tabular-nums">
                    {t('driver.photos.count', { n: validPhotosCount })}
                  </Badge>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full bg-brand-600 transition-all duration-300" style={{ width: `${(validPhotosCount / 4) * 100}%` }} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      {t('driver.photos.activeOrder')}
                      {currentSavedMeta?.uploaded && <span className="font-semibold text-brand-700 dark:text-brand-400"> · {t('driver.photos.savedOnServer')}</span>}
                    </p>
                    <p className="truncate font-semibold text-slate-900 dark:text-white">
                      #{activeConditionOrder.orderCode} · {activeConditionOrder.carType?.name || t('driver.tasks.unitFallback')} ({activeConditionOrder.carUnit?.plateNumber || '-'})
                    </p>
                  </div>
                  {activeTasksPool.length > 1 && (
                    <Select
                      size="sm"
                      align="right"
                      className="w-40"
                      aria-label={t('driver.photos.chooseOrder')}
                      value={activeConditionOrder.id}
                      onChange={(v) => setConditionOrderId(Number(v))}
                      options={activeTasksPool.map((ord) => ({ value: ord.id, label: `#${ord.orderCode}` }))}
                    />
                  )}
                </div>
              </div>

              {loadingConditionOrderId === activeConditionOrder.id && <p className="text-center text-sm text-slate-500">{t('driver.photos.checking')}</p>}
              {photoFeedback && <Notice type={photoFeedback.type}>{photoFeedback.text}</Notice>}

              {/* 4 slot foto wajib */}
              <div className="grid grid-cols-2 gap-3">
                {PHOTO_SLOTS.map((slot) => {
                  const entry = currentOrderSlots[slot.key];
                  const isCompressing = compressingSlot === slot.key;
                  return (
                    <div
                      key={slot.key}
                      data-guard-anchor
                      className={`card relative flex flex-col gap-2.5 p-3 ${entry?.isOverLimit ? '!border-red-500' : entry ? '!border-brand-500' : ''}`}
                    >
                      <input
                        ref={(el) => {
                          fileInputRefs.current[slot.key] = el;
                        }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleSelectPhoto(slot.key, e)}
                        className="sr-only"
                        id={`driver-photo-${slot.key}`}
                      />
                      {/* Foto wajib: ikut validasi form, peringatan ditampilkan FormGuard. */}
                      <input
                        data-guard-proxy
                        data-guard-message={entry?.isOverLimit ? t('driver.photos.tooBig', { name: slotName(slot.key) }) : t('driver.photos.required', { name: slotName(slot.key) })}
                        required
                        tabIndex={-1}
                        aria-hidden="true"
                        value={entry?.file && !entry.isOverLimit ? '1' : ''}
                        onChange={() => {}}
                        className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
                      />

                      {!entry ? (
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[slot.key]?.click()}
                          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-slate-500 transition hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:text-brand-300"
                        >
                          <ImagePlus className="h-5 w-5" />
                          <span className="text-xs font-semibold">{t('driver.photos.take')}</span>
                          <span className="text-[11px]">{t('driver.photos.max')}</span>
                        </button>
                      ) : (
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-900">
                          <img src={entry.previewUrl} alt={slotName(slot.key)} className="h-full w-full object-cover" />
                          <span className={`absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${entry.isOverLimit ? 'bg-red-600 text-white' : 'bg-white/90 text-slate-900'}`}>
                            {formatBytes(entry.size)}
                          </span>
                          {entry.isSavedOnServer && !entry.isOverLimit && (
                            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">{t('driver.photos.saved')}</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(slot.key)}
                            aria-label={t('driver.photos.remove', { name: slotName(slot.key) })}
                            className="absolute top-1 right-1 grid h-9 w-9 place-items-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}

                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{slotName(slot.key)}</h3>
                        <p className="text-xs text-slate-500">{t(`driver.photos.slot.${slot.key}.hint`)}</p>
                      </div>

                      {entry?.isOverLimit ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-red-600 tabular-nums">{t('driver.photos.overLimit', { size: formatBytes(entry.size) })}</p>
                          <Button type="button" size="sm" variant="soft" className="w-full" loading={isCompressing} onClick={() => handleAutoCompressSlot(slot.key)}>
                            {!isCompressing && <Sparkles className="h-4 w-4" />}
                            {isCompressing ? t('driver.photos.compressing') : t('driver.photos.compress')}
                          </Button>
                        </div>
                      ) : (
                        <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => fileInputRefs.current[slot.key]?.click()}>
                          {entry ? t('driver.photos.replace') : t('driver.photos.upload')}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="card space-y-3 p-4">
                <label className="block">
                  <span className="field-label">{t('driver.photos.notesLabel')}</span>
                  <input
                    className="input"
                    value={currentConditionNote}
                    onChange={(e) => setNotesByOrder((prev) => ({ ...prev, [activeConditionOrder.id]: e.target.value }))}
                    placeholder={t('driver.photos.notesPlaceholder')}
                    maxLength={500}
                  />
                </label>
                <Button type="submit" size="lg" className="w-full" loading={uploadingPhotos}>
                  {!uploadingPhotos && <Upload className="h-4 w-4" />}
                  {uploadingPhotos ? t('driver.photos.uploading') : currentSavedMeta?.uploaded ? t('driver.photos.update') : t('driver.photos.submit')}
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Rincian tugas */}
      <Modal
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        title={selectedTask ? t('driver.modal.title', { code: selectedTask.orderCode }) : ''}
        footer={
          selectedTask && (
            <>
              {selectedTask.status === 'CONFIRMED' && (
                <Button className="flex-1" disabled={actionLoading || !isOnline || permissionStatus === 'denied'} onClick={() => handleStartTask(selectedTask)}>
                  <Play className="h-4 w-4 fill-current" /> {t('driver.tasks.start')}
                </Button>
              )}
              {selectedTask.status === 'ONGOING' && (
                <Button className="flex-1" disabled={actionLoading || !isOnline} onClick={() => handleCompleteTask(selectedTask)}>
                  <Check className="h-4 w-4" /> {t('driver.modal.markDone')}
                </Button>
              )}
              <Button variant="secondary" className={selectedTask.status === 'CONFIRMED' || selectedTask.status === 'ONGOING' ? '' : 'flex-1'} onClick={() => setSelectedTask(null)}>
                {t('common.close')}
              </Button>
            </>
          )
        }
      >
        {selectedTask && (
          <div className="space-y-3 text-sm">
            <Badge tone={STATUS_TONE[selectedTask.status] || 'slate'}>{t(`status.${selectedTask.status}`, selectedTask.status)}</Badge>
            <dl className="space-y-1.5 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              {[
                [t('driver.modal.car'), selectedTask.carType?.name || '-'],
                [t('driver.modal.plate'), selectedTask.carUnit?.plateNumber || '-'],
                [t('driver.modal.colorYear'), `${selectedTask.carUnit?.color || '-'} / ${selectedTask.carUnit?.year || '-'}`],
                [t('driver.modal.package'), `${t(`package.${selectedTask.packageType}`, selectedTask.packageType)} · ${t(`service.${selectedTask.serviceType}`, selectedTask.serviceType)}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-semibold text-slate-900 dark:text-white">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <p className="flex items-center gap-2">
                <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="font-semibold text-slate-900 dark:text-white">{selectedTask.customer?.name || '-'}</span>
              </p>
              <p className="flex items-center gap-2 tabular-nums">
                <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                {selectedTask.customer?.phone ? (
                  <a href={`tel:${selectedTask.customer.phone}`} className="font-semibold text-brand-700 dark:text-brand-400">{selectedTask.customer.phone}</a>
                ) : (
                  '-'
                )}
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{selectedTask.pickupCity}:</span> {selectedTask.pickupAddress}
                </span>
              </p>
              <p className="flex items-center gap-2 tabular-nums">
                <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                {formatDateTime(selectedTask.startTime)} {t('driver.tasks.until')} {formatDateTime(selectedTask.endTime)}
              </p>
              {extractPickupMeta(selectedTask).cleanNotes && (
                <p className="border-t border-slate-200 pt-2 dark:border-slate-700">
                  <span className="text-slate-500">{t('driver.modal.notes')}:</span> {extractPickupMeta(selectedTask).cleanNotes}
                </p>
              )}
            </div>
            <Button as="a" href={buildPickupMapsUrl(selectedTask)} target="_blank" rel="noreferrer" variant="secondary" size="sm" className="w-full">
              <Navigation className="h-4 w-4" /> {t('driver.tasks.openMaps')}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default DriverDashboardPage;
