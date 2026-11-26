import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Navigation,
  User,
  RefreshCw,
  WifiOff,
  Power,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Sparkles,
  Car,
  Phone,
  MapPin,
  Clock,
  Play,
  Check,
  X,
  Radio,
  Upload,
  LocateFixed,
  ExternalLink,
  LogOut,
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
import { connectSocket, disconnectSocket } from '../../../lib/socket';
import { useAuth } from '../../../lib/auth';

const PHOTO_SLOTS = [
  {
    key: 'front',
    formField: 'frontPhoto',
    number: '1. Tampak Depan',
    hint: 'Terlihat plat nomor',
  },
  {
    key: 'back',
    formField: 'backPhoto',
    number: '2. Tampak Belakang',
    hint: 'Bumper & lampu belakang',
  },
  {
    key: 'left',
    formField: 'leftPhoto',
    number: '3. Sisi Kiri',
    hint: 'Pintu & spion kiri',
  },
  {
    key: 'right',
    formField: 'rightPhoto',
    number: '4. Sisi Kanan',
    hint: 'Pintu & spion kanan',
  },
];

const TASK_STATUS_META = {
  CONFIRMED: {
    heading: 'SIAP DIJALANKAN',
    label: 'Dikonfirmasi',
    pillClass: 'bg-[#C4F135] text-[#1C1D1C]',
  },
  ONGOING: {
    heading: 'TUGAS RENTAL AKTIF',
    label: 'Sedang Berjalan',
    pillClass: 'bg-[#1C1D1C] text-[#C4F135]',
  },
  COMPLETED: {
    heading: 'TUGAS SELESAI',
    label: 'Selesai',
    pillClass: 'bg-[#E6E6E4] text-[#1C1D1C]',
  },
  CANCELLED: {
    heading: 'TUGAS DIBATALKAN',
    label: 'Dibatalkan',
    pillClass: 'bg-red-100 text-red-800',
  },
};

function getDriverInitials(name) {
  if (!name || typeof name !== 'string') return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '0 KB';
  if (bytes >= MAX_CONDITION_PHOTO_BYTES) {
    return `${(bytes / MAX_CONDITION_PHOTO_BYTES).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatTimeShort(iso) {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatScheduleDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
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
  if (hasPin) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  const query = [task?.pickupAddress, task?.pickupCity].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query || 'Palu')}`;
}

function createEmptySlots() {
  return {
    front: null,
    back: null,
    left: null,
    right: null,
  };
}

export function DriverDashboardPage() {
  const navigate = useNavigate();
  const authToken = useAuth((s) => s.token);
  const authUser = useAuth((s) => s.user);
  const setAuthUser = useAuth((s) => s.setUser);
  const setAuthLogout = useAuth((s) => s.logout);

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

  // State Tab 2: 4 Foto Kondisi Mobil disimpan per orderId
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
    activeTasksPool.find((t) => t.status === 'ONGOING') ||
    tasks.find((t) => t.status === 'ONGOING') ||
    null;

  const {
    permissionStatus,
    isGpsGranted,
    coords,
    gpsError,
    lastSentAt,
    requestLocationPermission,
  } = useDriverLiveLocation({
    activeOrderId: ongoingOrder?.id || null,
    isTaskOngoing: Boolean(ongoingOrder),
    intervalMs: 10000,
  });

  // Cleanup seluruh ObjectURL saat unmount
  useEffect(() => {
    return () => {
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
      }
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
        if (nextProfile) {
          setAuthUser(nextProfile);
        }
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
          return nextTasks.find((t) => t.id === prevSelected.id) || prevSelected;
        });
      } catch (err) {
        if (err?.status === 403) {
          setAccountBlockedError(
            err.message || 'Akun driver Anda tidak aktif atau belum disetujui Admin.'
          );
        }
        setFetchError(err.message || 'Gagal memuat data operasional driver.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
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

  const handleDriverLogout = () => {
    disconnectSocket();
    setAuthLogout();
    navigate('/driver/daftar', { replace: true });
  };

  // Muat status foto kondisi yang sudah tersimpan di server saat activeConditionOrder berubah
  const activeConditionOrder =
    activeTasksPool.find((o) => o.id === Number(conditionOrderId)) ||
    activeTasksPool[0] ||
    null;

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
              const asset = await fetchAuthorizedAsset(
                `/drivers/me/tasks/${orderId}/condition-photos/${slot.key}`
              );
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
                if (!merged[slot.key] && loadedSlots[slot.key]) {
                  merged[slot.key] = loadedSlots[slot.key];
                } else if (loadedSlots[slot.key]?.previewUrl) {
                  URL.revokeObjectURL(loadedSlots[slot.key].previewUrl);
                }
              });
              return { ...prev, [orderId]: merged };
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSavedMetaByOrder((prev) => ({ ...prev, [orderId]: { uploaded: false } }));
        }
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
      setAlertMsg({
        type: 'error',
        text: 'Koneksi internet terputus (Offline). Sambungkan internet sebelum mengaktifkan status Siap Jalan.',
      });
      return;
    }

    setActionLoading(true);
    try {
      let currentCoords = coords;
      if (nextReady) {
        currentCoords = await requestLocationPermission();
      }

      const res = await setDriverReadyApi({
        isReady: nextReady,
        gpsGranted: nextReady ? true : isGpsGranted,
        lat: currentCoords?.lat,
        lng: currentCoords?.lng,
      });

      setProfile((prev) => (prev ? { ...prev, driverProfile: res.data } : prev));
      setAlertMsg({
        type: 'success',
        text:
          res.message ||
          (nextReady ? 'Status Siap Jalan & GPS berhasil diaktifkan.' : 'Status Siap Jalan dinonaktifkan.'),
      });
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
      setAlertMsg({
        type: 'error',
        text: 'Tidak dapat memulai tugas saat perangkat Offline. Periksa jaringan internet Anda.',
      });
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

      setAlertMsg({
        type: 'success',
        text: `Tugas #${task.orderCode} dimulai. Pengiriman lokasi GPS otomatis aktif setiap 10 detik.`,
      });
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
      setAlertMsg({
        type: 'error',
        text: 'Pastikan koneksi internet terhubung sebelum menyelesaikan laporan tugas.',
      });
      return;
    }

    setActionLoading(true);
    try {
      await completeDriverTaskApi(task.id, {
        lat: coords?.lat,
        lng: coords?.lng,
      });

      setAlertMsg({
        type: 'success',
        text: `Tugas #${task.orderCode} berhasil diselesaikan.`,
      });
      setSelectedTask(null);
      await loadData();
    } catch (err) {
      setAlertMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const currentOrderSlots =
    (activeConditionOrder?.id && slotsByOrder[activeConditionOrder.id]) || createEmptySlots();
  const currentConditionNote =
    (activeConditionOrder?.id && notesByOrder[activeConditionOrder.id]) || '';

  const handleSelectPhoto = (slotKey, event) => {
    const orderId = activeConditionOrder?.id;
    const file = event.target.files?.[0];
    if (!file || !orderId) return;

    setPhotoFeedback(null);
    if (!file.type.startsWith('image/')) {
      setPhotoFeedback({
        type: 'error',
        text: 'Format file tidak didukung. Harap pilih file foto/gambar.',
      });
      event.target.value = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setSlotsByOrder((prev) => {
      const orderSlots = prev[orderId] || createEmptySlots();
      if (orderSlots[slotKey]?.previewUrl) {
        URL.revokeObjectURL(orderSlots[slotKey].previewUrl);
      }
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
      if (orderSlots[slotKey]?.previewUrl) {
        URL.revokeObjectURL(orderSlots[slotKey].previewUrl);
      }
      return {
        ...prev,
        [orderId]: {
          ...orderSlots,
          [slotKey]: null,
        },
      };
    });
  };

  const handleAutoCompressSlot = async (slotKey) => {
    const orderId = activeConditionOrder?.id;
    const currentSlot = currentOrderSlots[slotKey];
    if (!orderId || !currentSlot?.file) return;

    setPhotoFeedback(null);
    setCompressingSlot(slotKey);
    try {
      const compressedFile = await compressImageUnderLimit(
        currentSlot.file,
        MAX_CONDITION_PHOTO_BYTES
      );
      const nextPreviewUrl = URL.createObjectURL(compressedFile);

      setSlotsByOrder((prev) => {
        const orderSlots = prev[orderId] || createEmptySlots();
        if (orderSlots[slotKey]?.previewUrl) {
          URL.revokeObjectURL(orderSlots[slotKey].previewUrl);
        }
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
        text: `Foto berhasil dikompres menjadi ${formatBytes(compressedFile.size)} (< 1 MB).`,
      });
    } catch (err) {
      setPhotoFeedback({
        type: 'error',
        text: err.message || 'Gagal mengompres foto.',
      });
    } finally {
      setCompressingSlot(null);
    }
  };

  const validPhotosCount = PHOTO_SLOTS.filter(
    (s) => currentOrderSlots[s.key]?.file && !currentOrderSlots[s.key]?.isOverLimit
  ).length;
  const hasAnyOverLimitPhoto = PHOTO_SLOTS.some((s) => currentOrderSlots[s.key]?.isOverLimit);
  const canSubmitPhotos =
    Boolean(activeConditionOrder) &&
    validPhotosCount === 4 &&
    !hasAnyOverLimitPhoto &&
    !uploadingPhotos;

  const handleUploadConditionPhotos = async (e) => {
    e.preventDefault();
    if (!activeConditionOrder || !canSubmitPhotos) return;

    const orderId = activeConditionOrder.id;
    setPhotoFeedback(null);
    const online = await verifyConnectionBeforeAction();
    if (!online) {
      setPhotoFeedback({
        type: 'error',
        text: 'Perangkat sedang Offline. Sambungkan koneksi internet untuk mengunggah foto kondisi.',
      });
      return;
    }

    setUploadingPhotos(true);
    try {
      const formData = new FormData();
      PHOTO_SLOTS.forEach((slot) => {
        const entry = currentOrderSlots[slot.key];
        if (entry?.file) {
          formData.append(slot.formField, entry.file);
        }
      });
      if (currentConditionNote.trim()) {
        formData.append('notes', currentConditionNote.trim());
      }

      const res = await uploadDriverConditionPhotosApi(orderId, formData);
      const savedMeta = res?.data;

      setSavedMetaByOrder((prev) => ({
        ...prev,
        [orderId]: savedMeta || { uploaded: true },
      }));

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

      setPhotoFeedback({
        type: 'success',
        text:
          res?.message ||
          `Keempat foto kondisi untuk Order #${activeConditionOrder.orderCode} berhasil disimpan.`,
      });
    } catch (err) {
      setPhotoFeedback({
        type: 'error',
        text: err.message || 'Gagal mengunggah foto kondisi unit.',
      });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const displayProfile = profile || (authUser?.role === 'DRIVER' ? authUser : null);
  const isReady = Boolean(displayProfile?.driverProfile?.isReady);
  const isGpsActiveReady = isReady && isGpsGranted;
  const lastUpdatedTime = formatTimeShort(lastSentAt || coords?.timestamp);
  const currentSavedMeta = activeConditionOrder?.id
    ? savedMetaByOrder[activeConditionOrder.id]
    : null;

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#F3F3F2] font-sans text-[#1C1D1C]">
      {/* Banner Peringatan Offline Kontras di Paling Atas */}
      {!isOnline && (
        <div
          role="alert"
          className="sticky top-0 z-50 w-full bg-[#B91C1C] text-white px-4 py-2.5 shadow-md"
        >
          <div className="max-w-[440px] mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-semibold leading-snug">
              <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                Koneksi terputus (Offline). Tugas &amp; pengiriman data ditangguhkan sementara.
              </span>
            </div>
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isChecking}
              className="min-h-[44px] px-3 rounded-[14px] bg-white text-[#B91C1C] text-xs font-extrabold shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {isChecking ? 'Mengecek...' : 'Cek Ulang'}
            </button>
          </div>
        </div>
      )}

      {/* Container Mobile-First Terpusat (max-width: 440px) */}
      <div className="w-full max-w-[440px] mx-auto px-4 pt-4 pb-28 space-y-4">
        {/* Banner Akun Diblokir / Belum Disetujui Admin (Integrasi Dev 1) */}
        {accountBlockedError && (
          <div
            role="alert"
            className="rounded-[20px] bg-[#FEF2F2] border border-[#FCA5A5] p-4 space-y-3"
          >
            <div className="flex items-start gap-2.5 text-xs font-semibold text-[#991B1B]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed">{accountBlockedError}</p>
            </div>
            <button
              type="button"
              onClick={handleDriverLogout}
              className="min-h-[44px] w-full px-4 rounded-[14px] bg-[#1C1D1C] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-[#1C1D1C]"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>Keluar &amp; Ganti Akun Driver</span>
            </button>
          </div>
        )}

        {/* 1. Top Header: Foto/Inisial Asli, Nama Asli, Nomor SIM, Status Jaringan, Refresh Manual */}
        <header className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full bg-[#1C1D1C] text-white flex items-center justify-center font-extrabold text-sm tracking-wide shrink-0 overflow-hidden border border-[#E6E6E4]">
              {profilePhotoUrl ? (
                <img
                  src={profilePhotoUrl}
                  alt={displayProfile?.name || 'Foto Driver'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span aria-hidden="true">{getDriverInitials(displayProfile?.name)}</span>
              )}
            </div>
            <div className="min-w-0">
              {loading && !displayProfile ? (
                <div className="h-5 w-36 rounded-md bg-[#E6E6E4] animate-pulse mb-1" />
              ) : (
                <h1 className="text-[16px] font-extrabold text-[#1C1D1C] truncate leading-tight">
                  {displayProfile?.name || 'Akun Mitra Driver'}
                </h1>
              )}
              <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-[#5C5C58] mt-0.5">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isChecking
                        ? 'bg-amber-500 animate-pulse'
                        : isOnline
                        ? 'bg-emerald-600'
                        : 'bg-red-600'
                    }`}
                  />
                  <span className={isOnline ? 'text-[#1C1D1C]' : 'text-red-700 font-bold'}>
                    {isChecking ? 'Memeriksa' : isOnline ? 'Online' : 'Offline'}
                  </span>
                </span>
                <span aria-hidden="true">•</span>
                <span className="tabular-nums truncate">
                  SIM: {displayProfile?.driverProfile?.licenseNumber || 'Belum tercatat'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={loading || isChecking}
            aria-label="Segarkan data operasional driver"
            className="min-h-[44px] min-w-[44px] px-3.5 rounded-full bg-white border border-[#E6E6E4] text-[#1C1D1C] text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-[#EAEAE8] active:scale-[0.99] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C] shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading || isChecking ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Segarkan</span>
          </button>
        </header>

        {/* 2. Navigasi Segmented Control 2 Tab Utama (GPS | Foto Kondisi Mobil) */}
        <div
          role="tablist"
          aria-label="Mode operasional driver"
          className="bg-white border border-[#E6E6E4] rounded-[20px] p-1.5 grid grid-cols-2 gap-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'gps'}
            onClick={() => setMainTab('gps')}
            className={`min-h-[48px] px-3 rounded-[14px] text-[13px] font-extrabold inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C] ${
              mainTab === 'gps'
                ? 'bg-[#1C1D1C] text-white shadow-sm'
                : 'bg-transparent text-[#575753] hover:text-[#1C1D1C]'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isGpsActiveReady
                  ? 'bg-[#C4F135]'
                  : isGpsGranted
                  ? 'bg-amber-400'
                  : 'bg-[#9E9E99]'
              }`}
              aria-hidden="true"
            />
            <span>GPS</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'photos'}
            onClick={() => setMainTab('photos')}
            className={`min-h-[48px] px-3 rounded-[14px] text-[13px] font-extrabold inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C] ${
              mainTab === 'photos'
                ? 'bg-[#1C1D1C] text-white shadow-sm'
                : 'bg-transparent text-[#575753] hover:text-[#1C1D1C]'
            }`}
          >
            <span className="truncate">Foto Kondisi Mobil</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums shrink-0 ${
                mainTab === 'photos' || validPhotosCount === 4
                  ? 'bg-[#C4F135] text-[#1C1D1C]'
                  : 'bg-[#F3F3F2] text-[#1C1D1C]'
              }`}
            >
              {validPhotosCount}/4
            </span>
          </button>
        </div>

        {/* ============================================================ */}
        {/* KONTEN TAB 1: GPS & DAFTAR TUGAS RENTAL                      */}
        {/* ============================================================ */}
        {mainTab === 'gps' ? (
          <div className="space-y-4">
            {/* Hero Focal Card (#1C1D1C) */}
            <section
              aria-label="Kontrol pelacakan lokasi GPS"
              className="bg-[#1C1D1C] text-white rounded-[24px] p-5 space-y-4 shadow-[0_12px_28px_rgba(28,29,28,0.14)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9E9E99]">
                    PELACAKAN LOKASI UNIT
                  </p>
                  <h2 className="text-[20px] font-extrabold tracking-tight text-white mt-0.5 leading-snug">
                    {isGpsActiveReady
                      ? 'GPS Aktif – Terkunci'
                      : permissionStatus === 'denied'
                      ? 'Izin GPS Ditolak'
                      : isGpsGranted
                      ? 'GPS Terkunci – Standby'
                      : 'GPS Nonaktif'}
                  </h2>
                </div>

                <div className="px-2.5 py-1 rounded-full bg-[#2A2B2A] border border-[#383938] inline-flex items-center gap-1.5 shrink-0">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      coords ? 'bg-[#C4F135]' : 'bg-[#73736E]'
                    }`}
                  />
                  <span
                    className={`text-xs font-extrabold tabular-nums ${
                      coords ? 'text-[#C4F135]' : 'text-[#A3A39E]'
                    }`}
                  >
                    {coords?.accuracy != null ? `±${Math.round(coords.accuracy)} m` : 'GPS Off'}
                  </span>
                </div>
              </div>

              {/* Pratinjau Peta Gelap Ringkas di Dalam Kartu */}
              <div className="relative h-[148px] w-full rounded-[16px] bg-[#141514] border border-[#2B2C2B] overflow-hidden">
                <svg
                  viewBox="0 0 400 160"
                  className="w-full h-full object-cover"
                  aria-hidden="true"
                >
                  <g stroke="#222322" strokeWidth="1">
                    <line x1="0" y1="32" x2="400" y2="32" />
                    <line x1="0" y1="64" x2="400" y2="64" />
                    <line x1="0" y1="96" x2="400" y2="96" />
                    <line x1="0" y1="128" x2="400" y2="128" />
                    <line x1="66" y1="0" x2="66" y2="160" />
                    <line x1="132" y1="0" x2="132" y2="160" />
                    <line x1="198" y1="0" x2="198" y2="160" />
                    <line x1="264" y1="0" x2="264" y2="160" />
                    <line x1="330" y1="0" x2="330" y2="160" />
                  </g>
                  <path
                    d="M -10 128 Q 140 105 215 78 T 410 42"
                    fill="none"
                    stroke="#2B2D2B"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 145 -10 Q 175 75 212 170"
                    fill="none"
                    stroke="#262826"
                    strokeWidth="6"
                  />
                  {isGpsGranted && coords && (
                    <>
                      <path
                        d="M 58 117 L 200 76"
                        fill="none"
                        stroke="#C4F135"
                        strokeWidth="2.5"
                        strokeDasharray="5 5"
                      />
                      <circle cx="200" cy="76" r="20" fill="#C4F135" fillOpacity="0.16" />
                      <circle
                        cx="200"
                        cy="76"
                        r="11"
                        fill="#141514"
                        stroke="#C4F135"
                        strokeWidth="3"
                      />
                      <circle cx="200" cy="76" r="4.5" fill="#C4F135" />
                    </>
                  )}
                </svg>

                {!isGpsGranted && (
                  <div className="absolute inset-0 bg-[#141514]/70 flex items-center justify-center px-4 text-center">
                    <p className="text-xs font-semibold text-[#B5B5B0]">
                      Aktifkan izin lokasi untuk mengunci sinyal GPS real-time
                    </p>
                  </div>
                )}

                <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between gap-2">
                  {isGpsGranted && coords ? (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=16/${coords.lat}/${coords.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-[44px] px-3 rounded-[12px] bg-[#1E1F1E]/95 hover:bg-[#2B2C2B] border border-[#323332] text-[11px] font-semibold text-[#D4D4CF] inline-flex items-center gap-1.5 truncate focus-visible:outline-2 focus-visible:outline-[#C4F135]"
                    >
                      <span className="truncate">Sinyal GPS aktif • Lihat Peta</span>
                      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="px-3 py-1.5 rounded-xl bg-[#1E1F1E]/95 border border-[#323332] text-[11px] font-semibold text-[#D4D4CF] truncate">
                      Sinyal GPS belum terkunci
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleRefreshGpsSignal}
                    className="min-h-[44px] px-3.5 rounded-[12px] bg-[#252625]/95 hover:bg-[#303130] border border-[#3A3B3A] text-white text-xs font-bold inline-flex items-center gap-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4F135] shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Segarkan</span>
                  </button>
                </div>
              </div>

              {/* Indikator Pengiriman Otomatis Tiap 10 Detik Saat Ada Order ONGOING */}
              {ongoingOrder && (
                <div className="px-3.5 py-2.5 rounded-[14px] bg-[#25281E] border border-[#C4F135]/40 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Radio className="w-4 h-4 text-[#C4F135] animate-pulse shrink-0" aria-hidden="true" />
                    <span className="font-bold text-[#C4F135] truncate">
                      Order #{ongoingOrder.orderCode} • Kirim lokasi tiap 10 dtk
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-white tabular-nums shrink-0">
                    LIVE
                  </span>
                </div>
              )}

              {/* Metrik Koordinat & Waktu Pembaruan Terakhir (tabular-nums) */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2 rounded-[14px] bg-[#252625] border border-[#303130] px-3.5 py-3">
                  <p className="text-[11px] font-semibold text-[#9E9E99]">Koordinat</p>
                  <p className="text-[13px] font-extrabold text-white tabular-nums mt-0.5 truncate">
                    {coords
                      ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                      : 'Belum terkunci'}
                  </p>
                </div>
                <div className="col-span-1 rounded-[14px] bg-[#252625] border border-[#303130] px-3 py-3">
                  <p className="text-[11px] font-semibold text-[#9E9E99]">Pembaruan</p>
                  <p className="text-[13px] font-extrabold text-white tabular-nums mt-0.5">
                    {lastUpdatedTime}
                  </p>
                </div>
              </div>

              {/* Baris Status Koneksi */}
              <div className="flex items-center justify-between text-xs px-0.5">
                <span className="text-[#9E9E99] font-medium">Status Koneksi</span>
                <span
                  className={`font-extrabold ${
                    isOnline ? 'text-[#C4F135]' : 'text-red-400'
                  }`}
                >
                  {isOnline ? 'Terhubung ke Server' : 'Terputus (Offline)'}
                </span>
              </div>

              {/* Sakelar / Tombol Besar Kontrol GPS & Siap Jalan (min-height: 48px) */}
              <button
                type="button"
                onClick={handleToggleReady}
                disabled={actionLoading}
                className={`min-h-[48px] w-full rounded-[14px] px-4 text-sm font-extrabold inline-flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4F135] ${
                  isGpsActiveReady
                    ? 'bg-[#2A2B2A] hover:bg-[#343534] border border-[#3E3F3E] text-white'
                    : 'bg-[#C4F135] hover:bg-[#b8e629] text-[#1C1D1C]'
                }`}
              >
                <Power className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {actionLoading
                    ? 'Memproses Status GPS...'
                    : isGpsActiveReady
                    ? 'Matikan GPS & Siap Jalan'
                    : 'Aktifkan Siap Jalan & GPS'}
                </span>
              </button>
            </section>

            {/* Feedback / Error State (Izin GPS Ditolak, Jaringan, atau Hasil Aksi) */}
            {(permissionStatus === 'denied' || gpsError || alertMsg) && (
              <div
                role="alert"
                className={`rounded-[20px] p-4 border text-xs font-semibold flex items-start gap-2.5 ${
                  alertMsg?.type === 'success' && !gpsError && permissionStatus !== 'denied'
                    ? 'bg-white border-[#1C1D1C] text-[#1C1D1C]'
                    : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]'
                }`}
              >
                {alertMsg?.type === 'success' && !gpsError && permissionStatus !== 'denied' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" />
                )}
                <div className="space-y-1.5 flex-1">
                  <p className="leading-relaxed">
                    {alertMsg?.text ||
                      gpsError ||
                      'Izin lokasi (GPS) ditolak. Buka pengaturan browser/HP dan izinkan lokasi untuk mulai bertugas.'}
                  </p>
                  {permissionStatus === 'denied' && (
                    <button
                      type="button"
                      onClick={handleRefreshGpsSignal}
                      className="min-h-[44px] px-3.5 rounded-[14px] bg-[#1C1D1C] text-white text-xs font-bold inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                    >
                      Coba Minta Izin GPS Lagi
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Filter Kategori Tugas Rental */}
            <section aria-label="Daftar tugas rental driver" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#575753]">
                  Daftar Tugas Rental
                </h2>
                <span className="text-xs font-bold text-[#575753] tabular-nums">
                  {tasks.length} Tugas
                </span>
              </div>

              <div className="bg-white border border-[#E6E6E4] rounded-[20px] p-1.5 grid grid-cols-3 gap-1.5">
                {[
                  { id: 'today', label: 'Hari Ini' },
                  { id: 'active', label: 'Aktif' },
                  { id: 'history', label: 'Riwayat' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTaskFilter(tab.id)}
                    className={`min-h-[44px] rounded-[14px] text-xs font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C] ${
                      taskFilter === tab.id
                        ? 'bg-[#1C1D1C] text-white'
                        : 'bg-transparent text-[#575753] hover:text-[#1C1D1C]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Loading State */}
              {loading ? (
                <div className="bg-white border border-[#E6E6E4] rounded-[20px] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-[#E6E6E4] rounded animate-pulse" />
                    <div className="h-6 w-24 bg-[#E6E6E4] rounded-full animate-pulse" />
                  </div>
                  <div className="h-5 w-48 bg-[#E6E6E4] rounded animate-pulse" />
                  <div className="h-14 w-full bg-[#F3F3F2] rounded-[14px] animate-pulse" />
                  <p className="text-xs font-semibold text-[#575753] text-center pt-1">
                    Memuat daftar tugas operasional...
                  </p>
                </div>
              ) : fetchError ? (
                /* Error State */
                <div className="bg-white border border-[#FCA5A5] rounded-[20px] p-6 text-center space-y-3">
                  <div className="w-11 h-11 rounded-full bg-red-100 text-[#B91C1C] flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-[#1C1D1C]">
                      Gagal Memuat Data Tugas
                    </h3>
                    <p className="text-xs text-[#575753] mt-1">{fetchError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleManualRefresh}
                    className="min-h-[44px] px-5 rounded-[14px] bg-[#1C1D1C] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Coba Muat Ulang</span>
                  </button>
                </div>
              ) : tasks.length === 0 ? (
                /* Empty State */
                <div className="bg-white border border-[#E6E6E4] rounded-[20px] p-7 text-center space-y-2.5">
                  <div className="w-11 h-11 rounded-full bg-[#F3F3F2] text-[#1C1D1C] flex items-center justify-center mx-auto">
                    <Car className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-extrabold text-[#1C1D1C]">
                    Belum Ada Tugas pada Kategori Ini
                  </h3>
                  <p className="text-xs text-[#575753] max-w-xs mx-auto leading-relaxed">
                    Pastikan status Siap Jalan &amp; GPS Anda aktif agar Admin dapat menugaskan
                    jadwal pengantaran berikutnya.
                  </p>
                </div>
              ) : (
                /* Daftar Kartu Tugas (#FFFFFF, border #E6E6E4) */
                <div className="space-y-3">
                  {tasks.map((task) => {
                    const meta = TASK_STATUS_META[task.status] || {
                      heading: 'TUGAS RENTAL',
                      label: task.status,
                      pillClass: 'bg-[#F3F3F2] text-[#1C1D1C]',
                    };
                    const isActiveOrder = ['CONFIRMED', 'ONGOING'].includes(task.status);
                    const { hasPin } = extractPickupMeta(task);
                    const orderPhotoSlots = slotsByOrder[task.id] || {};
                    const taskPhotoCount = PHOTO_SLOTS.filter(
                      (s) => orderPhotoSlots[s.key]?.file && !orderPhotoSlots[s.key]?.isOverLimit
                    ).length;

                    return (
                      <article
                        key={task.id}
                        className="bg-white border border-[#E6E6E4] rounded-[20px] p-5 space-y-4 shadow-[0_2px_10px_rgba(28,29,28,0.03)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-extrabold tracking-[0.06em] text-[#575753] uppercase">
                            {meta.heading}
                          </span>
                          <span className="px-3 py-1 rounded-full bg-[#F3F3F2] text-[#1C1D1C] text-xs font-extrabold tabular-nums">
                            #{task.orderCode}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-3 border-b border-[#E6E6E4] pb-3.5">
                          <div>
                            <p className="text-xs font-medium text-[#575753]">Unit Kendaraan</p>
                            <h3 className="text-[15px] font-extrabold text-[#1C1D1C] mt-0.5">
                              {task.carType?.name || 'Unit Rental'}{' '}
                              <span aria-hidden="true">•</span>{' '}
                              <span className="tabular-nums">
                                {task.carUnit?.plateNumber || 'Plat belum diatur'}
                              </span>
                            </h3>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold shrink-0 ${meta.pillClass}`}
                          >
                            {meta.label}
                          </span>
                        </div>

                        {/* Visualisasi Rute Jemput & Jadwal */}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 flex-wrap">
                              <p className="text-[11px] font-semibold text-[#575753]">
                                Titik Jemput
                              </p>
                              {hasPin && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#C4F135] text-[#1C1D1C] text-[10px] font-extrabold">
                                  <LocateFixed className="w-2.5 h-2.5" aria-hidden="true" />
                                  <span>Pin Akurat</span>
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-extrabold text-[#1C1D1C] truncate mt-0.5">
                              {task.pickupCity || '-'}
                            </p>
                            <p className="text-[11px] text-[#575753] line-clamp-2 leading-snug mt-0.5">
                              {task.pickupAddress || '-'}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 px-1" aria-hidden="true">
                            <span className="w-2 h-2 rounded-full border-2 border-[#1C1D1C]" />
                            <span className="w-4 border-t border-dotted border-[#8C8C87]" />
                            <span className="w-7 h-7 rounded-full bg-[#C4F135] text-[#1C1D1C] flex items-center justify-center">
                              <Car className="w-3.5 h-3.5" />
                            </span>
                            <span className="w-4 border-t border-dotted border-[#8C8C87]" />
                            <span className="w-2 h-2 rounded-full bg-[#1C1D1C]" />
                          </div>

                          <div className="text-right min-w-0">
                            <p className="text-[11px] font-semibold text-[#575753]">
                              Jadwal Sewa
                            </p>
                            <p className="text-xs font-extrabold text-[#1C1D1C] tabular-nums mt-0.5">
                              {formatScheduleDateTime(task.startTime)}
                            </p>
                            <p className="text-[11px] text-[#575753] tabular-nums mt-0.5">
                              s/d {formatScheduleDateTime(task.endTime)}
                            </p>
                          </div>
                        </div>

                        {/* Info Pelanggan */}
                        <div className="rounded-[14px] bg-[#F3F3F2] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <span className="text-[#575753] font-medium">Pelanggan: </span>
                            <strong className="font-extrabold text-[#1C1D1C]">
                              {task.customer?.name || '-'}
                            </strong>
                          </div>
                          {task.customer?.phone ? (
                            <a
                              href={`tel:${task.customer.phone}`}
                              className="min-h-[44px] px-3 -my-1.5 rounded-[12px] inline-flex items-center gap-1.5 font-extrabold text-[#1C1D1C] hover:bg-white transition tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                            >
                              <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{task.customer.phone}</span>
                            </a>
                          ) : (
                            <span className="text-[#575753]">No. HP -</span>
                          )}
                        </div>

                        {/* Baris Tombol Aksi Utama & Sekunder */}
                        <div className="space-y-2 pt-0.5">
                          <div className="grid grid-cols-2 gap-2">
                            <a
                              href={buildPickupMapsUrl(task)}
                              target="_blank"
                              rel="noreferrer"
                              className="min-h-[44px] px-3 rounded-[14px] bg-[#F3F3F2] hover:bg-[#E6E6E4] text-[#1C1D1C] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                            >
                              <Navigation className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>Buka Maps</span>
                            </a>

                            {isActiveOrder ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setConditionOrderId(task.id);
                                  setMainTab('photos');
                                }}
                                className="min-h-[44px] px-3 rounded-[14px] bg-[#1C1D1C] hover:bg-[#2E2F2E] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 tabular-nums transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                              >
                                <Camera className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>
                                  Foto Kondisi ({taskPhotoCount > 0 ? taskPhotoCount : validPhotosCount}/4)
                                </span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setSelectedTask(task)}
                                className="min-h-[44px] px-3 rounded-[14px] bg-[#F3F3F2] hover:bg-[#E6E6E4] text-[#1C1D1C] text-xs font-extrabold inline-flex items-center justify-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                              >
                                Detail Tugas
                              </button>
                            )}
                          </div>

                          {task.status === 'CONFIRMED' && (
                            <button
                              type="button"
                              disabled={
                                actionLoading || !isOnline || permissionStatus === 'denied'
                              }
                              onClick={() => handleStartTask(task)}
                              className="min-h-[48px] w-full px-4 rounded-[14px] bg-[#C4F135] hover:bg-[#b8e629] disabled:opacity-50 text-[#1C1D1C] text-xs font-extrabold inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                            >
                              <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                              <span>Mulai Tugas Sekarang</span>
                            </button>
                          )}

                          {task.status === 'ONGOING' && (
                            <button
                              type="button"
                              disabled={actionLoading || !isOnline}
                              onClick={() => handleCompleteTask(task)}
                              className="min-h-[48px] w-full px-4 rounded-[14px] bg-[#C4F135] hover:bg-[#b8e629] disabled:opacity-50 text-[#1C1D1C] text-xs font-extrabold inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                            >
                              <Check className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                              <span>Selesai Tugas</span>
                            </button>
                          )}

                          {isActiveOrder && (
                            <button
                              type="button"
                              onClick={() => setSelectedTask(task)}
                              className="min-h-[44px] w-full rounded-[14px] border border-[#E6E6E4] bg-white hover:bg-[#F3F3F2] text-[#1C1D1C] text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                            >
                              Lihat Rincian Order Lengkap
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
          /* ============================================================ */
          /* KONTEN TAB 2: FOTO KONDISI MOBIL (4 FOTO WAJIB, MAKS 1 MB)    */
          /* ============================================================ */
          <section aria-label="Dokumentasi 4 foto kondisi mobil" className="space-y-4">
            {!activeConditionOrder ? (
              <div className="bg-white border border-[#E6E6E4] rounded-[20px] p-7 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#F3F3F2] text-[#1C1D1C] flex items-center justify-center mx-auto">
                  <Camera className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-extrabold text-[#1C1D1C]">
                    Belum Ada Order Aktif
                  </h2>
                  <p className="text-xs text-[#575753] leading-relaxed max-w-xs mx-auto">
                    Unggah 4 foto kondisi fisik kendaraan tersedia otomatis saat Anda memiliki
                    order berstatus <strong>Dikonfirmasi</strong> atau{' '}
                    <strong>Sedang Berjalan</strong>.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setMainTab('gps')}
                    className="min-h-[44px] px-4 rounded-[14px] bg-[#1C1D1C] text-white text-xs font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                  >
                    Lihat Daftar Tugas
                  </button>
                  <button
                    type="button"
                    onClick={handleManualRefresh}
                    className="min-h-[44px] px-4 rounded-[14px] bg-[#F3F3F2] text-[#1C1D1C] text-xs font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                  >
                    Muat Ulang
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleUploadConditionPhotos} className="space-y-4">
                {/* Kartu Header Gelap Dokumentasi (#1C1D1C) */}
                <div className="bg-[#1C1D1C] text-white rounded-[24px] p-5 space-y-3.5 shadow-[0_12px_28px_rgba(28,29,28,0.14)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[19px] font-extrabold text-white leading-tight">
                        Foto Kondisi Mobil
                      </h2>
                      <p className="text-xs text-[#A3A39E] mt-1 leading-relaxed">
                        Unggah 4 sisi unit sebelum/saat perjalanan. Maksimal 1 MB per foto.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[#2A2B2A] border border-[#383938] text-[#C4F135] text-xs font-extrabold tabular-nums shrink-0">
                      {validPhotosCount} / 4 Foto
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-2 w-full rounded-full bg-[#2C2D2C] overflow-hidden">
                    <div
                      className="h-full bg-[#C4F135] transition-all duration-300"
                      style={{ width: `${(validPhotosCount / 4) * 100}%` }}
                    />
                  </div>

                  {/* Info / Pilihan Order Aktif */}
                  <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
                    <div className="min-w-0">
                      <p className="text-[#9E9E99] text-[11px]">
                        Order Aktif{' '}
                        {currentSavedMeta?.uploaded && (
                          <span className="text-[#C4F135] font-bold">• Tersimpan di Server</span>
                        )}
                      </p>
                      <p className="font-extrabold text-white tabular-nums truncate">
                        #{activeConditionOrder.orderCode} •{' '}
                        {activeConditionOrder.carType?.name || 'Unit'} (
                        {activeConditionOrder.carUnit?.plateNumber || '-'})
                      </p>
                    </div>

                    {activeTasksPool.length > 1 && (
                      <select
                        aria-label="Pilih order aktif untuk dokumentasi foto"
                        value={activeConditionOrder.id}
                        onChange={(e) => setConditionOrderId(Number(e.target.value))}
                        className="min-h-[44px] px-3 rounded-[14px] bg-[#2A2B2A] border border-[#3E3F3E] text-white text-xs font-bold tabular-nums focus-visible:outline-2 focus-visible:outline-[#C4F135]"
                      >
                        {activeTasksPool.map((ord) => (
                          <option key={ord.id} value={ord.id}>
                            #{ord.orderCode}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {loadingConditionOrderId === activeConditionOrder.id && (
                  <div className="bg-white border border-[#E6E6E4] rounded-[20px] p-4 text-xs font-semibold text-[#575753] text-center">
                    Memeriksa dokumentasi foto yang sudah tersimpan...
                  </div>
                )}

                {photoFeedback && (
                  <div
                    role="alert"
                    className={`rounded-[20px] p-4 border text-xs font-semibold flex items-start gap-2.5 ${
                      photoFeedback.type === 'success'
                        ? 'bg-white border-[#1C1D1C] text-[#1C1D1C]'
                        : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]'
                    }`}
                  >
                    {photoFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" />
                    )}
                    <span>{photoFeedback.text}</span>
                  </div>
                )}

                {/* Grid 4 Slot Foto Wajib */}
                <div className="grid grid-cols-2 gap-3">
                  {PHOTO_SLOTS.map((slot) => {
                    const entry = currentOrderSlots[slot.key];
                    const isCompressing = compressingSlot === slot.key;

                    return (
                      <div
                        key={slot.key}
                        className={`bg-white rounded-[20px] p-3.5 border flex flex-col justify-between space-y-3 ${
                          entry?.isOverLimit
                            ? 'border-[#DC2626]'
                            : entry
                            ? 'border-[#1C1D1C]'
                            : 'border-[#E6E6E4]'
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

                        {!entry ? (
                          <button
                            type="button"
                            onClick={() => fileInputRefs.current[slot.key]?.click()}
                            className="h-28 w-full rounded-[14px] border border-dashed border-[#C8C8C4] bg-[#F7F7F6] hover:bg-[#EFEFED] flex flex-col items-center justify-center gap-1 text-center px-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                          >
                            <Camera className="w-5 h-5 text-[#575753]" aria-hidden="true" />
                            <span className="text-xs font-bold text-[#1C1D1C]">
                              Ambil / Pilih Foto
                            </span>
                            <span className="text-[11px] text-[#73736E] tabular-nums">
                              Maks 1 MB
                            </span>
                          </button>
                        ) : (
                          <div className="relative h-28 w-full rounded-[14px] overflow-hidden bg-[#1C1D1C] border border-[#E6E6E4]">
                            <img
                              src={entry.previewUrl}
                              alt={slot.number}
                              className="w-full h-full object-cover"
                            />
                            <span
                              className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums ${
                                entry.isOverLimit
                                  ? 'bg-[#DC2626] text-white'
                                  : 'bg-[#C4F135] text-[#1C1D1C]'
                              }`}
                            >
                              {formatBytes(entry.size)}
                            </span>
                            {entry.isSavedOnServer && !entry.isOverLimit && (
                              <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-[#1C1D1C]/85 text-[#C4F135] text-[10px] font-extrabold">
                                Tersimpan
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(slot.key)}
                              aria-label={`Hapus foto ${slot.number}`}
                              className="absolute top-1.5 right-1.5 min-h-[44px] min-w-[44px] -mt-1 -mr-1 rounded-full flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#C4F135]"
                            >
                              <span className="w-7 h-7 rounded-full bg-[#1C1D1C]/85 text-white flex items-center justify-center">
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </span>
                            </button>
                          </div>
                        )}

                        <div>
                          <h3 className="text-xs font-extrabold text-[#1C1D1C] leading-snug">
                            {slot.number}
                          </h3>
                          <p className="text-[11px] text-[#575753] leading-snug mt-0.5">
                            {slot.hint}
                          </p>
                        </div>

                        {entry?.isOverLimit ? (
                          <div className="space-y-2">
                            <p className="text-[11px] font-bold text-[#B91C1C] leading-tight tabular-nums">
                              Melebihi 1 MB ({formatBytes(entry.size)})
                            </p>
                            <button
                              type="button"
                              disabled={isCompressing}
                              onClick={() => handleAutoCompressSlot(slot.key)}
                              className="min-h-[44px] w-full px-2.5 rounded-[14px] bg-[#C4F135] hover:bg-[#b8e629] text-[#1C1D1C] text-[11px] font-extrabold inline-flex items-center justify-center gap-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                            >
                              <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>
                                {isCompressing ? 'Mengompres...' : 'Kompres Otomatis (< 1 MB)'}
                              </span>
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileInputRefs.current[slot.key]?.click()}
                            className="min-h-[44px] w-full px-3 rounded-[14px] bg-[#F3F3F2] hover:bg-[#E6E6E4] text-[#1C1D1C] text-xs font-extrabold inline-flex items-center justify-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C]"
                          >
                            {entry ? 'Ganti Foto' : 'Unggah Foto'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Catatan Kondisi Opsional & Tombol Simpan Utama */}
                <div className="bg-white border border-[#E6E6E4] rounded-[20px] p-4 space-y-3">
                  <div>
                    <label
                      htmlFor="condition-notes-input"
                      className="block text-xs font-extrabold text-[#1C1D1C] mb-1.5"
                    >
                      Catatan kondisi fisik (opsional)
                    </label>
                    <input
                      id="condition-notes-input"
                      type="text"
                      value={currentConditionNote}
                      onChange={(e) =>
                        setNotesByOrder((prev) => ({
                          ...prev,
                          [activeConditionOrder.id]: e.target.value,
                        }))
                      }
                      placeholder="Contoh: Baret halus bumper depan kiri"
                      className="min-h-[44px] w-full rounded-[14px] bg-[#F3F3F2] border border-[#E6E6E4] px-3.5 text-xs text-[#1C1D1C] placeholder:text-[#787873] focus:bg-white focus:border-[#1C1D1C] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!canSubmitPhotos}
                    className={`min-h-[48px] w-full px-4 rounded-[14px] text-sm font-extrabold inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1D1C] ${
                      canSubmitPhotos
                        ? 'bg-[#C4F135] hover:bg-[#b8e629] text-[#1C1D1C]'
                        : 'bg-[#E6E6E4] text-[#73736E] cursor-not-allowed'
                    }`}
                  >
                    <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>
                      {uploadingPhotos
                        ? 'Mengunggah 4 Foto Kondisi...'
                        : currentSavedMeta?.uploaded
                        ? 'Perbarui 4 Foto Kondisi'
                        : 'Simpan 4 Foto Kondisi'}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </div>

      {/* Modal Detail Tugas */}
      {selectedTask && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-task-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="bg-white w-full max-w-[440px] rounded-t-[24px] sm:rounded-[24px] border border-[#E6E6E4] p-5 space-y-4 max-h-[88dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E6E6E4] pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#575753]">
                  Rincian Tugas Operasional
                </p>
                <h2
                  id="modal-task-title"
                  className="text-base font-extrabold text-[#1C1D1C] tabular-nums"
                >
                  Order #{selectedTask.orderCode}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                aria-label="Tutup rincian tugas"
                className="min-h-[44px] min-w-[44px] rounded-full bg-[#F3F3F2] text-[#1C1D1C] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#1C1D1C]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-[14px] bg-[#F3F3F2] p-3.5 space-y-1.5">
                <p>
                  <span className="text-[#575753]">Unit Mobil:</span>{' '}
                  <strong>{selectedTask.carType?.name || '-'}</strong>
                </p>
                <p className="tabular-nums">
                  <span className="text-[#575753]">Plat Nomor:</span>{' '}
                  <strong>{selectedTask.carUnit?.plateNumber || '-'}</strong>
                </p>
                <p className="tabular-nums">
                  <span className="text-[#575753]">Warna / Tahun:</span>{' '}
                  <strong>
                    {selectedTask.carUnit?.color || '-'} / {selectedTask.carUnit?.year || '-'}
                  </strong>
                </p>
                <p>
                  <span className="text-[#575753]">Paket Layanan:</span>{' '}
                  <strong>
                    {selectedTask.packageType} ({selectedTask.serviceType})
                  </strong>
                </p>
              </div>

              <div className="rounded-[14px] bg-[#F3F3F2] p-3.5 space-y-1.5">
                <p className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#575753]" />
                  <span>Pelanggan:</span>
                  <strong>{selectedTask.customer?.name || '-'}</strong>
                </p>
                <p className="flex items-center gap-1.5 tabular-nums">
                  <Phone className="w-3.5 h-3.5 text-[#575753]" />
                  <span>Telepon:</span>
                  <strong>{selectedTask.customer?.phone || '-'}</strong>
                </p>
                <p className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#575753] shrink-0 mt-0.5" />
                  <span>
                    <strong>{selectedTask.pickupCity}:</strong> {selectedTask.pickupAddress}
                  </span>
                </p>
                <p className="flex items-center gap-1.5 tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-[#575753]" />
                  <span>
                    {formatScheduleDateTime(selectedTask.startTime)} s/d{' '}
                    {formatScheduleDateTime(selectedTask.endTime)}
                  </span>
                </p>
                {extractPickupMeta(selectedTask).cleanNotes && (
                  <p className="pt-1 border-t border-[#E6E6E4]">
                    <span className="text-[#575753]">Catatan:</span>{' '}
                    {extractPickupMeta(selectedTask).cleanNotes}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              {selectedTask.status === 'CONFIRMED' && (
                <button
                  type="button"
                  disabled={actionLoading || !isOnline || permissionStatus === 'denied'}
                  onClick={() => handleStartTask(selectedTask)}
                  className="flex-1 min-h-[48px] rounded-[14px] bg-[#C4F135] text-[#1C1D1C] text-xs font-extrabold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#1C1D1C]"
                >
                  Mulai Tugas Sekarang
                </button>
              )}
              {selectedTask.status === 'ONGOING' && (
                <button
                  type="button"
                  disabled={actionLoading || !isOnline}
                  onClick={() => handleCompleteTask(selectedTask)}
                  className="flex-1 min-h-[48px] rounded-[14px] bg-[#C4F135] text-[#1C1D1C] text-xs font-extrabold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#1C1D1C]"
                >
                  Tandai Selesai
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="min-h-[48px] px-5 rounded-[14px] bg-[#1C1D1C] text-white text-xs font-extrabold focus-visible:outline-2 focus-visible:outline-[#1C1D1C]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Floating Bottom Navigation (Pill Mengambang, max-width: 440px) */}
      <div className="fixed bottom-4 inset-x-0 z-40 pointer-events-none px-4">
        <nav
          aria-label="Navigasi utama driver"
          className="pointer-events-auto max-w-[300px] mx-auto bg-[#1C1D1C] p-1.5 rounded-full shadow-[0_12px_30px_rgba(28,29,28,0.28)] border border-[#2E2F2E] grid grid-cols-2 gap-1.5"
        >
          <Link
            to="/driver"
            aria-current="page"
            className="min-h-[44px] px-4 rounded-full bg-[#C4F135] text-[#1C1D1C] text-xs font-extrabold inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4F135]"
          >
            <Navigation className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Dashboard</span>
          </Link>

          <Link
            to="/driver/daftar"
            className="min-h-[44px] px-4 rounded-full text-[#D4D4CF] hover:text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4F135]"
          >
            <User className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Profil</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}

export default DriverDashboardPage;
