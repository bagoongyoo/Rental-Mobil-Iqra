// Dashboard driver (logika Dev 3): GPS & Siap Jalan, daftar tugas, 4 foto kondisi mobil.
// Struktur tata letak: top identity bar + hero accent card berprogres + main sheet (3 quick actions & daftar tugas; 4 foto kondisi khusus di tab Foto kondisi).
// Warna tetap mempertahankan palet asli Rental Mobil Iqra (brand emerald & slate terang/gelap).
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
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

function sanitizeUiError(message, fallback) {
  if (!message || typeof message !== 'string') return fallback;
  if (/Invalid `prisma\.|Can't reach database server|ECONNREFUSED/i.test(message)) {
    return fallback;
  }
  return message;
}

function extractPickupMeta(task) {
  if (!task) return { hasPin: false, lat: null, lng: null, cleanNotes: '' };
  const notesText = task.notes || '';
  const urlMatch = notesText.match(/https:\/\/maps\.google\.com\/\?q=(-?[\d.]+),(-?[\d.]+)/);
  const pinMatch = notesText.match(/Pin Akurat:\s*(-?[\d.]+),\s*(-?[\d.]+)/i);
  const lat =
    task.pickupLat != null
      ? Number(task.pickupLat)
      : urlMatch
        ? Number(urlMatch[1])
        : pinMatch
          ? Number(pinMatch[1])
          : null;
  const lng =
    task.pickupLng != null
      ? Number(task.pickupLng)
      : urlMatch
        ? Number(urlMatch[2])
        : pinMatch
          ? Number(pinMatch[2])
          : null;
  const hasPin = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const cleanNotes = notesText
    .replace(/\n?Titik lokasi: \S+/g, '')
    .replace(/\s*\|\s*Pin Akurat:\s*-?[\d.]+,\s*-?[\d.]+/gi, '')
    .trim();
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
      className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm ${
        ok
          ? 'bg-brand-50 text-brand-900 dark:bg-brand-950/60 dark:text-brand-200'
          : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
      }`}
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
  const tasksSectionRef = useRef(null);
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
      shareLocation: Boolean(profile?.driverProfile?.isReady),
    });

  const timeFmt = (iso) => {
    if (!iso) return '--:--';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString(i18n.language === 'en' ? 'en-GB' : 'id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
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
        if (err?.status === 403) {
          setAccountBlockedError(sanitizeUiError(err.message, t('driver.blocked.default')));
        }
        setFetchError(sanitizeUiError(err.message, t('driver.msg.loadFail')));
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

  const activeConditionOrder =
    activeTasksPool.find((o) => o.id === Number(conditionOrderId)) || activeTasksPool[0] || null;

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
          setNotesByOrder((prev) => ({
            ...prev,
            [orderId]: prev[orderId] !== undefined ? prev[orderId] : meta.notes || '',
          }));

          const loadedSlots = {};
          await Promise.all(
            PHOTO_SLOTS.map(async (slot) => {
              const info = meta.photos[slot.key];
              if (!info) return;
              const asset = await fetchAuthorizedAsset(`/drivers/me/tasks/${orderId}/condition-photos/${slot.key}`);
              if (!cancelled && asset?.blob) {
                const fileFromServer = new File([asset.blob], info.fileName || `${slot.key}.webp`, {
                  type: asset.blob.type || 'image/webp',
                });
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
      setAlertMsg({ type: 'error', text: sanitizeUiError(err.message, t('driver.gpsError.failed')) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshGpsSignal = async () => {
    setAlertMsg(null);
    try {
      await requestLocationPermission();
    } catch (err) {
      setAlertMsg({ type: 'error', text: sanitizeUiError(err.message, t('driver.gpsError.failed')) });
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
      const res = await startDriverTaskApi(task.id, {
        gpsGranted: true,
        lat: currentCoords.lat,
        lng: currentCoords.lng,
      });
      setAlertMsg({ type: 'success', text: t('driver.msg.started', { code: task.orderCode }) });
      setSelectedTask(null);
      await loadData();
      if (res?.data?.id) setConditionOrderId(res.data.id);
    } catch (err) {
      setAlertMsg({ type: 'error', text: sanitizeUiError(err.message, t('driver.msg.loadFail')) });
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
      setAlertMsg({ type: 'error', text: sanitizeUiError(err.message, t('driver.msg.loadFail')) });
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
          [slotKey]: {
            file,
            previewUrl,
            size: file.size,
            isOverLimit: file.size > MAX_CONDITION_PHOTO_BYTES,
            isSavedOnServer: false,
          },
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

      setPhotoFeedback({
        type: 'success',
        text: t('driver.msg.compressed', { size: formatBytes(compressedFile.size) }),
      });
    } catch (err) {
      setPhotoFeedback({ type: 'error', text: err.message || t('driver.msg.compressFail') });
    } finally {
      setCompressingSlot(null);
    }
  };

  const validPhotosCount = PHOTO_SLOTS.filter(
    (s) => currentOrderSlots[s.key]?.file && !currentOrderSlots[s.key]?.isOverLimit
  ).length;
  const hasAnyOverLimitPhoto = PHOTO_SLOTS.some((s) => currentOrderSlots[s.key]?.isOverLimit);
  const canSubmitPhotos =
    Boolean(activeConditionOrder) && validPhotosCount === 4 && !hasAnyOverLimitPhoto && !uploadingPhotos;

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
      setPhotoFeedback({ type: 'error', text: sanitizeUiError(err.message, t('driver.msg.uploadFail')) });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const displayProfile = profile || (authUser?.role === 'DRIVER' ? authUser : null);
  const isReady = Boolean(displayProfile?.driverProfile?.isReady);
  const isGpsActiveReady = isReady && isGpsGranted;
  const lastUpdatedTime = timeFmt(lastSentAt || coords?.timestamp);
  const currentSavedMeta = activeConditionOrder?.id ? savedMetaByOrder[activeConditionOrder.id] : null;
  const featuredOrder = ongoingOrder || activeConditionOrder || null;
  const photosReady = validPhotosCount === 4 || Boolean(currentSavedMeta?.uploaded);

  const gpsState = isGpsActiveReady
    ? 'active'
    : permissionStatus === 'denied'
      ? 'denied'
      : isGpsGranted
        ? 'standby'
        : 'off';

  const handleHeroQuickAction = () => {
    if (featuredOrder) {
      setSelectedTask(featuredOrder);
      return;
    }
    handleToggleReady();
  };

  const handleCycleTaskFilter = () => {
    const nextFilter = taskFilter === 'today' ? 'active' : taskFilter === 'active' ? 'history' : 'today';
    setTaskFilter(nextFilter);
    tasksSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div className="mx-auto max-w-md space-y-3.5 md:max-w-2xl">
      {/* Banner peringatan offline */}
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

      {/* SHELL UTAMA: Top Identity Bar + Hero Accent Card + Nested Sheet */}
      <div className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-slate-900 p-2 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {/* 1. Top Identity Bar (mengikuti ritme [Tombol Bulat] [Badge Tengah] [Avatar Kanan]) */}
        <div className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-3">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={loading || isChecking}
            aria-label={t('driver.profile.refresh')}
            title={t('driver.profile.refresh')}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-700/80 bg-slate-800/80 text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading || isChecking ? 'animate-spin' : ''}`} />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-brand-700/90 px-3.5 py-1 text-xs font-extrabold tracking-tight text-white">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  isChecking ? 'animate-pulse bg-amber-300' : isOnline ? 'bg-brand-200' : 'bg-red-400'
                }`}
              />
              <span className="truncate">
                {loading && !displayProfile
                  ? '...'
                  : displayProfile?.name || t('driver.profile.fallbackName')}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-400 tabular-nums">
              {isChecking
                ? t('driver.profile.checking')
                : isOnline
                  ? t('driver.profile.online')
                  : t('driver.profile.offline')}
              {' · '}
              {t('driver.profile.sim')}: {displayProfile?.driverProfile?.licenseNumber || t('driver.profile.simNone')}
            </p>
          </div>

          <Link
            to="/driver/daftar"
            aria-label={t('driver.nav.profile')}
            title={t('driver.nav.profile')}
            className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-brand-500/40 bg-brand-900/70 text-xs font-bold text-brand-100 transition hover:border-brand-400"
          >
            {profilePhotoUrl ? (
              <img src={profilePhotoUrl} alt={displayProfile?.name || ''} className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden="true">{getDriverInitials(displayProfile?.name)}</span>
            )}
          </Link>
        </div>

        {/* 2. Hero Focal Card (struktur banner pengiriman aktif dengan warna brand hijau lama) */}
        <section
          aria-label={t('driver.gps.title')}
          className="rounded-[24px] border border-brand-600/40 bg-brand-700 p-5 text-white dark:border-brand-700/60 dark:bg-brand-800"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-brand-100/90">
                <span>
                  {featuredOrder
                    ? `${t(`status.${featuredOrder.status}`, featuredOrder.status)} · ${featuredOrder.carType?.name || t('driver.tasks.unitFallback')}`
                    : `${t('driver.gps.title')} · ${isOnline ? t('driver.gps.connected') : t('driver.gps.disconnected')}`}
                </span>
                {ongoingOrder && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/40 px-2 py-0.5 text-[10px] font-bold tracking-wide text-brand-100 uppercase">
                    <Radio className="h-3 w-3 animate-pulse" /> LIVE
                  </span>
                )}
              </p>
              <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight text-white tabular-nums">
                {featuredOrder ? `#${featuredOrder.orderCode}` : t(`driver.gps.state.${gpsState}`)}
              </h1>
            </div>

            <button
              type="button"
              onClick={handleHeroQuickAction}
              disabled={!featuredOrder && actionLoading}
              aria-label={featuredOrder ? t('driver.tasks.detail') : isGpsActiveReady ? t('driver.gps.readyOff') : t('driver.gps.readyOn')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-brand-900 shadow-sm transition hover:bg-brand-50 disabled:opacity-60"
            >
              <ArrowUpRight className="h-5 w-5" />
            </button>
          </div>

          {/* Baris jadwal / koordinat kiri-kanan */}
          <div className="mt-4 flex items-center justify-between gap-3 text-xs font-medium text-brand-100/90 tabular-nums">
            <span className="truncate">
              {featuredOrder
                ? formatDateTime(featuredOrder.startTime)
                : coords
                  ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                  : t('driver.gps.notLocked')}
            </span>
            <span className="shrink-0">
              {featuredOrder
                ? `${t('driver.tasks.until')} ${formatDateTime(featuredOrder.endTime)}`
                : `${coords?.accuracy != null ? `±${Math.round(coords.accuracy)} m · ` : ''}${lastUpdatedTime}`}
            </span>
          </div>

          {/* Track progres 4 titik + ikon kendaraan */}
          <div className="mt-3 flex items-center" role="list" aria-label={t('driver.gps.title')}>
            <span
              role="listitem"
              title={t('driver.tabs.gps')}
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                isGpsActiveReady
                  ? 'bg-slate-950 text-brand-200'
                  : 'border border-brand-300/50 bg-brand-900/50 text-brand-200'
              }`}
            >
              {isGpsActiveReady ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : <LocateFixed className="h-3.5 w-3.5" />}
            </span>
            <span
              aria-hidden="true"
              className={`mx-1.5 flex-1 border-t-2 border-dashed ${
                isGpsActiveReady ? 'border-brand-100/80' : 'border-brand-300/35'
              }`}
            />
            <span
              role="listitem"
              title={t('driver.tabs.photos')}
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                photosReady
                  ? 'bg-slate-950 text-brand-200'
                  : 'border border-brand-300/50 bg-brand-900/50 text-brand-200'
              }`}
            >
              {photosReady ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : <Camera className="h-3.5 w-3.5" />}
            </span>
            <span
              aria-hidden="true"
              className={`mx-1.5 flex-1 border-t-2 border-dashed ${
                ongoingOrder ? 'border-brand-100/80' : 'border-brand-300/35'
              }`}
            />
            <span
              role="listitem"
              title={t('driver.tasks.title')}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                ongoingOrder
                  ? 'bg-white text-brand-900 shadow-sm'
                  : featuredOrder
                    ? 'bg-slate-950 text-brand-200 ring-2 ring-brand-200/40'
                    : 'border border-brand-300/50 bg-brand-900/50 text-brand-200'
              }`}
            >
              <Car className="h-4 w-4" />
            </span>
            <span aria-hidden="true" className="mx-1.5 flex-1 border-t-2 border-dashed border-brand-300/35" />
            <span
              role="listitem"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-brand-200/70 bg-brand-900/40"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  featuredOrder?.status === 'COMPLETED' ? 'bg-white' : 'bg-brand-200/70'
                }`}
              />
            </span>
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-brand-100/80 tabular-nums">
            <span>GPS</span>
            <span>{t('driver.tabs.photos')} ({validPhotosCount}/4)</span>
            <span>{ongoingOrder ? t('status.ONGOING') : t('driver.nav.tasks')}</span>
            <span>{t('status.COMPLETED')}</span>
          </div>

          {/* Aksi utama Siap Jalan di dalam kartu hero agar tetap 1-sentuh */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleReady}
              disabled={actionLoading}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:opacity-60 ${
                isGpsActiveReady
                  ? 'border border-white/20 bg-brand-950/55 text-white hover:bg-brand-950/75'
                  : 'bg-slate-950 text-white hover:bg-slate-900'
              }`}
            >
              <Power className="h-4 w-4" />
              {actionLoading
                ? t('driver.gps.processing')
                : isGpsActiveReady
                  ? t('driver.gps.readyOff')
                  : t('driver.gps.readyOn')}
            </button>

            {isGpsGranted && coords && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=16/${coords.lat}/${coords.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-brand-950/40 px-3.5 text-xs font-semibold text-white transition hover:bg-brand-950/65"
              >
                <ExternalLink className="h-4 w-4" />
                {t('driver.gps.openMap')}
              </a>
            )}
          </div>
        </section>

        {/* 3. Main Sheet (Lapis konten utama di bawah hero card) */}
        <div className="mt-2 space-y-5 rounded-[24px] bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
          {/* Baris 3 Ubin Aksi Cepat (mengikuti struktur 3 kotak [Create] [Calculate] [Receipts]) */}
          <div className="grid grid-cols-3 gap-2.5" role="group" aria-label={t('driver.nav.tasks')}>
            <button
              type="button"
              onClick={() => setMainTab('gps')}
              aria-pressed={mainTab === 'gps'}
              className={`flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border p-2.5 text-center transition ${
                mainTab === 'gps'
                  ? 'border-brand-500/60 bg-brand-50 text-brand-900 dark:border-brand-500/50 dark:bg-brand-950/50 dark:text-brand-100'
                  : 'border-slate-200/80 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white dark:bg-slate-950">
                <LocateFixed className="h-5 w-5" />
                <span
                  className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                    isGpsActiveReady ? 'bg-brand-500' : isGpsGranted ? 'bg-amber-500' : 'bg-slate-400'
                  }`}
                />
              </span>
              <span className="line-clamp-1 text-xs font-bold">{t('driver.tabs.gps')}</span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('photos')}
              aria-pressed={mainTab === 'photos'}
              className={`flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border p-2.5 text-center transition ${
                mainTab === 'photos'
                  ? 'border-brand-500/60 bg-brand-50 text-brand-900 dark:border-brand-500/50 dark:bg-brand-950/50 dark:text-brand-100'
                  : 'border-slate-200/80 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white dark:bg-slate-950">
                <Camera className="h-5 w-5" />
                <span
                  className={`absolute -top-1 -right-2 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums ${
                    validPhotosCount === 4
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100'
                  }`}
                >
                  {validPhotosCount}/4
                </span>
              </span>
              <span className="line-clamp-1 text-xs font-bold">{t('driver.tabs.photos')}</span>
            </button>

            <button
              type="button"
              onClick={handleRefreshGpsSignal}
              className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50 p-2.5 text-center text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white dark:bg-slate-950">
                <RefreshCw className="h-5 w-5" />
              </span>
              <span className="line-clamp-1 text-xs font-bold">{t('driver.gps.refreshGps')}</span>
            </button>
          </div>

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

          {mainTab === 'gps' ? (
            <div className="space-y-5">
              {/* Ringkasan Telemetri GPS Kompak */}
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="col-span-2 min-w-0">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('driver.gps.coords')}</p>
                  <p className="truncate text-sm font-bold text-slate-900 tabular-nums dark:text-white">
                    {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : t('driver.gps.notLocked')}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {isGpsGranted
                      ? `${t('driver.gps.refreshEvery')}${lastRefreshAt ? ` · ${t('driver.gps.lastRefresh', { time: timeFmt(lastRefreshAt) })}` : ''}`
                      : t('driver.gps.enableHint')}
                  </p>
                </div>
                <div className="border-l border-slate-200/80 pl-2.5 dark:border-slate-700/80">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('driver.gps.lastUpdate')}</p>
                  <p className="text-sm font-bold text-slate-900 tabular-nums dark:text-white">{lastUpdatedTime}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-brand-700 tabular-nums dark:text-brand-400">
                    {coords?.accuracy != null ? `±${Math.round(coords.accuracy)} m` : t('driver.gps.off')}
                  </p>
                </div>
              </div>

              {/* Seksi 1: Daftar Tugas (mengikuti anatomi Active Shipments + View all) */}
              <section ref={tasksSectionRef} aria-label={t('driver.tasks.title')} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                      {t('driver.tasks.title')}
                    </h2>
                    <span className="text-xs font-semibold text-slate-500 tabular-nums">
                      ({t('driver.tasks.count', { count: tasks.length })})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCycleTaskFilter}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    {t('common.seeAll')}
                  </button>
                </div>

                <Segmented
                  className="w-full"
                  value={taskFilter}
                  onChange={setTaskFilter}
                  options={['today', 'active', 'history'].map((id) => ({
                    value: id,
                    label: t(`driver.tasks.filter.${id}`),
                  }))}
                />

                {loading ? (
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40">
                    <Spinner />
                  </div>
                ) : fetchError ? (
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40">
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
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40">
                    <EmptyState icon={Car} title={t('driver.tasks.emptyTitle')}>
                      {t('driver.tasks.emptyText')}
                    </EmptyState>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {tasks.map((task) => {
                      const isActiveOrder = ['CONFIRMED', 'ONGOING'].includes(task.status);
                      const { hasPin } = extractPickupMeta(task);
                      const orderPhotoSlots = slotsByOrder[task.id] || {};
                      const taskPhotoCount = PHOTO_SLOTS.filter(
                        (s) => orderPhotoSlots[s.key]?.file && !orderPhotoSlots[s.key]?.isOverLimit
                      ).length;

                      return (
                        <article
                          key={task.id}
                          className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-slate-800/60"
                        >
                          <div className="space-y-2.5">
                            {/* Baris atas kartu: dua lingkaran ikon bertumpuk + pill status */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center">
                                <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-white ring-2 ring-white dark:bg-slate-950 dark:ring-slate-800">
                                  <MapPin className="h-3.5 w-3.5" />
                                </span>
                                <span className="-ml-2 grid h-8 w-8 place-items-center rounded-full bg-brand-700 text-white ring-2 ring-white dark:bg-brand-600 dark:ring-slate-800">
                                  <Car className="h-3.5 w-3.5" />
                                </span>
                                {hasPin && (
                                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-800 dark:bg-brand-950 dark:text-brand-200">
                                    <LocateFixed className="h-2.5 w-2.5" />
                                    {t('driver.tasks.pinAccurate')}
                                  </span>
                                )}
                              </div>
                              <Badge tone={STATUS_TONE[task.status] || 'slate'}>
                                {t(`status.${task.status}`, task.status)}
                              </Badge>
                            </div>

                            {/* Rute & Unit */}
                            <div>
                              <h3 className="flex items-center gap-1.5 truncate text-sm font-extrabold text-slate-900 dark:text-white">
                                <span className="truncate">{task.pickupCity || 'Palu'}</span>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                <span className="truncate font-mono tabular-nums">
                                  {task.carUnit?.plateNumber || task.carType?.name || t('driver.tasks.unitFallback')}
                                </span>
                              </h3>
                              <p className="mt-0.5 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                                {task.carType?.name || t('driver.tasks.unitFallback')} · {task.pickupAddress || '-'}
                              </p>
                              <p className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                                #{task.orderCode} · {formatDateTime(task.startTime)}
                              </p>
                            </div>

                            {/* Info pelanggan */}
                            <div className="flex items-center justify-between gap-2 border-t border-slate-200/80 pt-2 text-xs dark:border-slate-700/70">
                              <span className="truncate font-semibold text-slate-700 dark:text-slate-200">
                                {task.customer?.name || '-'}
                              </span>
                              {task.customer?.phone ? (
                                <a
                                  href={`tel:${task.customer.phone}`}
                                  className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 font-semibold text-brand-700 tabular-nums hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/50"
                                >
                                  <Phone className="h-3.5 w-3.5" /> {task.customer.phone}
                                </a>
                              ) : (
                                <span className="text-slate-400">{t('driver.tasks.phoneNone')}</span>
                              )}
                            </div>
                          </div>

                          {/* Tombol aksi tugas */}
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                as="a"
                                href={buildPickupMapsUrl(task)}
                                target="_blank"
                                rel="noreferrer"
                                variant="secondary"
                                size="sm"
                                className="min-h-11"
                              >
                                <Navigation className="h-4 w-4" /> {t('driver.tasks.openMaps')}
                              </Button>
                              {isActiveOrder ? (
                                <Button
                                  variant="soft"
                                  size="sm"
                                  className="min-h-11"
                                  onClick={() => {
                                    setConditionOrderId(task.id);
                                    setMainTab('photos');
                                  }}
                                >
                                  <Camera className="h-4 w-4" />
                                  <span className="tabular-nums">
                                    {taskPhotoCount > 0 ? taskPhotoCount : validPhotosCount}/4
                                  </span>
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="min-h-11"
                                  onClick={() => setSelectedTask(task)}
                                >
                                  {t('driver.tasks.detail')}
                                </Button>
                              )}
                            </div>

                            {task.status === 'CONFIRMED' && (
                              <Button
                                className="min-h-11 w-full"
                                disabled={actionLoading || !isOnline || permissionStatus === 'denied'}
                                onClick={() => handleStartTask(task)}
                              >
                                <Play className="h-4 w-4 fill-current" /> {t('driver.tasks.start')}
                              </Button>
                            )}
                            {task.status === 'ONGOING' && (
                              <Button
                                className="min-h-11 w-full"
                                disabled={actionLoading || !isOnline}
                                onClick={() => handleCompleteTask(task)}
                              >
                                <Check className="h-4 w-4" /> {t('driver.tasks.finish')}
                              </Button>
                            )}
                            {isActiveOrder && (
                              <button
                                type="button"
                                onClick={() => setSelectedTask(task)}
                                className="flex min-h-9 w-full items-center justify-center rounded-lg text-xs font-semibold text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                              >
                                {t('driver.tasks.fullDetail')}
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : (
            /* Tampilan Penuh Unggah 4 Foto Kondisi Mobil (maks 1 MB per foto) */
            <section aria-label={t('driver.photos.title')} className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Button variant="secondary" size="sm" onClick={() => setMainTab('gps')}>
                  <ArrowLeft className="h-4 w-4" /> {t('driver.tabs.gps')}
                </Button>
                <Badge tone={validPhotosCount === 4 ? 'brand' : 'slate'} className="tabular-nums">
                  {t('driver.photos.count', { n: validPhotosCount })}
                </Badge>
              </div>

              {!activeConditionOrder ? (
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40">
                  <EmptyState
                    icon={Camera}
                    title={t('driver.photos.noOrderTitle')}
                    action={
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setMainTab('gps')}>
                          {t('driver.photos.seeTasks')}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={handleManualRefresh}>
                          {t('driver.photos.reload')}
                        </Button>
                      </div>
                    }
                  >
                    {t('driver.photos.noOrderText')}
                  </EmptyState>
                </div>
              ) : (
                <form onSubmit={handleUploadConditionPhotos} className="space-y-4">
                  <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-slate-800/60">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                        {t('driver.photos.title')}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('driver.photos.subtitle')}</p>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-900">
                      <div
                        className="h-full bg-brand-600 transition-all duration-300"
                        style={{ width: `${(validPhotosCount / 4) * 100}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t('driver.photos.activeOrder')}
                          {currentSavedMeta?.uploaded && (
                            <span className="font-semibold text-brand-700 dark:text-brand-400">
                              {' · '}
                              {t('driver.photos.savedOnServer')}
                            </span>
                          )}
                        </p>
                        <p className="truncate font-semibold text-slate-900 dark:text-white">
                          #{activeConditionOrder.orderCode} ·{' '}
                          {activeConditionOrder.carType?.name || t('driver.tasks.unitFallback')} (
                          {activeConditionOrder.carUnit?.plateNumber || '-'})
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

                  {loadingConditionOrderId === activeConditionOrder.id && (
                    <p className="text-center text-sm text-slate-500">{t('driver.photos.checking')}</p>
                  )}
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
                          className={`relative flex flex-col gap-2.5 rounded-2xl border p-3 ${
                            entry?.isOverLimit
                              ? 'border-red-500 bg-red-50/30 dark:bg-red-950/20'
                              : entry
                                ? 'border-brand-500 bg-brand-50/20 dark:bg-brand-950/20'
                                : 'border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/50'
                          }`}
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
                          <input
                            data-guard-proxy
                            data-guard-message={
                              entry?.isOverLimit
                                ? t('driver.photos.tooBig', { name: slotName(slot.key) })
                                : t('driver.photos.required', { name: slotName(slot.key) })
                            }
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
                              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-white text-center text-slate-500 transition hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:text-brand-300"
                            >
                              <ImagePlus className="h-5 w-5" />
                              <span className="text-xs font-semibold">{t('driver.photos.take')}</span>
                              <span className="text-[11px]">{t('driver.photos.max')}</span>
                            </button>
                          ) : (
                            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-900">
                              <img
                                src={entry.previewUrl}
                                alt={slotName(slot.key)}
                                className="h-full w-full object-cover"
                              />
                              <span
                                className={`absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                                  entry.isOverLimit ? 'bg-red-600 text-white' : 'bg-white/90 text-slate-900'
                                }`}
                              >
                                {formatBytes(entry.size)}
                              </span>
                              {entry.isSavedOnServer && !entry.isOverLimit && (
                                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                  {t('driver.photos.saved')}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(slot.key)}
                                aria-label={t('driver.photos.remove', { name: slotName(slot.key) })}
                                className="absolute top-1 right-1 grid h-11 w-11 place-items-center rounded-full bg-slate-950/75 text-white hover:bg-slate-950"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}

                          <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                              {slotName(slot.key)}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t(`driver.photos.slot.${slot.key}.hint`)}
                            </p>
                          </div>

                          {entry?.isOverLimit ? (
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-red-600 tabular-nums">
                                {t('driver.photos.overLimit', { size: formatBytes(entry.size) })}
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="soft"
                                className="min-h-11 w-full"
                                loading={isCompressing}
                                onClick={() => handleAutoCompressSlot(slot.key)}
                              >
                                {!isCompressing && <Sparkles className="h-4 w-4" />}
                                {isCompressing ? t('driver.photos.compressing') : t('driver.photos.compress')}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="min-h-11 w-full"
                              onClick={() => fileInputRefs.current[slot.key]?.click()}
                            >
                              {entry ? t('driver.photos.replace') : t('driver.photos.upload')}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-slate-800/60">
                    <label className="block">
                      <span className="field-label">{t('driver.photos.notesLabel')}</span>
                      <input
                        className="input"
                        value={currentConditionNote}
                        onChange={(e) =>
                          setNotesByOrder((prev) => ({ ...prev, [activeConditionOrder.id]: e.target.value }))
                        }
                        placeholder={t('driver.photos.notesPlaceholder')}
                        maxLength={500}
                      />
                    </label>
                    <Button type="submit" size="lg" className="w-full" loading={uploadingPhotos}>
                      {!uploadingPhotos && <Upload className="h-4 w-4" />}
                      {uploadingPhotos
                        ? t('driver.photos.uploading')
                        : currentSavedMeta?.uploaded
                          ? t('driver.photos.update')
                          : t('driver.photos.submit')}
                    </Button>
                  </div>
                </form>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Modal rincian tugas */}
      <Modal
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        title={selectedTask ? t('driver.modal.title', { code: selectedTask.orderCode }) : ''}
        footer={
          selectedTask && (
            <>
              {selectedTask.status === 'CONFIRMED' && (
                <Button
                  className="flex-1"
                  disabled={actionLoading || !isOnline || permissionStatus === 'denied'}
                  onClick={() => handleStartTask(selectedTask)}
                >
                  <Play className="h-4 w-4 fill-current" /> {t('driver.tasks.start')}
                </Button>
              )}
              {selectedTask.status === 'ONGOING' && (
                <Button
                  className="flex-1"
                  disabled={actionLoading || !isOnline}
                  onClick={() => handleCompleteTask(selectedTask)}
                >
                  <Check className="h-4 w-4" /> {t('driver.modal.markDone')}
                </Button>
              )}
              <Button
                variant="secondary"
                className={selectedTask.status === 'CONFIRMED' || selectedTask.status === 'ONGOING' ? '' : 'flex-1'}
                onClick={() => setSelectedTask(null)}
              >
                {t('common.close')}
              </Button>
            </>
          )
        }
      >
        {selectedTask && (
          <div className="space-y-3 text-sm">
            <Badge tone={STATUS_TONE[selectedTask.status] || 'slate'}>
              {t(`status.${selectedTask.status}`, selectedTask.status)}
            </Badge>
            <dl className="space-y-1.5 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              {[
                [t('driver.modal.car'), selectedTask.carType?.name || '-'],
                [t('driver.modal.plate'), selectedTask.carUnit?.plateNumber || '-'],
                [t('driver.modal.colorYear'), `${selectedTask.carUnit?.color || '-'} / ${selectedTask.carUnit?.year || '-'}`],
                [
                  t('driver.modal.package'),
                  `${t(`package.${selectedTask.packageType}`, selectedTask.packageType)} · ${t(`service.${selectedTask.serviceType}`, selectedTask.serviceType)}`,
                ],
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
                  <a
                    href={`tel:${selectedTask.customer.phone}`}
                    className="font-semibold text-brand-700 dark:text-brand-400"
                  >
                    {selectedTask.customer.phone}
                  </a>
                ) : (
                  '-'
                )}
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{selectedTask.pickupCity}:</span>{' '}
                  {selectedTask.pickupAddress}
                </span>
              </p>
              <p className="flex items-center gap-2 tabular-nums">
                <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                {formatDateTime(selectedTask.startTime)} {t('driver.tasks.until')} {formatDateTime(selectedTask.endTime)}
              </p>
              {extractPickupMeta(selectedTask).cleanNotes && (
                <p className="border-t border-slate-200 pt-2 dark:border-slate-700">
                  <span className="text-slate-500">{t('driver.modal.notes')}:</span>{' '}
                  {extractPickupMeta(selectedTask).cleanNotes}
                </p>
              )}
            </div>
            <Button
              as="a"
              href={buildPickupMapsUrl(selectedTask)}
              target="_blank"
              rel="noreferrer"
              variant="secondary"
              size="sm"
              className="w-full"
            >
              <Navigation className="h-4 w-4" /> {t('driver.tasks.openMaps')}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default DriverDashboardPage;
