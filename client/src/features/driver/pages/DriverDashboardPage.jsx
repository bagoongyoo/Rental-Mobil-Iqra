import React, { useState, useEffect, useCallback } from 'react';
import {
  getMyDriverProfileApi,
  getDriverTasksApi,
  setDriverReadyApi,
  startDriverTaskApi,
  completeDriverTaskApi,
} from '../api/driverApi';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useDriverLiveLocation } from '../hooks/useDriverLiveLocation';
import { connectSocket } from '../../../lib/socket';

const STATUS_BADGE = {
  CONFIRMED: {
    label: 'Siap Dijalankan',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  },
  ONGOING: {
    label: 'Sedang Berjalan (Live GPS Aktif)',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  COMPLETED: {
    label: 'Selesai',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  CANCELLED: {
    label: 'Dibatalkan',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  },
};

/**
 * Panel Driver (Mobile-First) — Dev 3:
 * - Peringatan jika offline + cek koneksi internet sebelum mulai tugas
 * - Wajib izinkan lokasi (Geolocation API) sebelum status "Siap Jalan"; jika ditolak, tidak bisa mulai tugas
 * - Kirim lokasi berkala tiap 10 detik via Socket.IO selama tugas berjalan (ONGOING)
 * - Daftar tugas hari ini, detail tugas, tombol Mulai / Selesai
 */
export function DriverDashboardPage() {
  const [profile, setProfile] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'active' | 'history'
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null); // { type: 'error' | 'success' | 'warning', text }

  const { isOnline, verifyConnectionBeforeAction } = useNetworkStatus();

  // Cari apakah ada order yang sedang ONGOING
  const ongoingOrder = tasks.find((t) => t.status === 'ONGOING') || null;

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
    intervalMs: 10000, // Kirim setiap 10 detik
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, tasksRes] = await Promise.all([
        getMyDriverProfileApi(),
        getDriverTasksApi(activeTab),
      ]);
      setProfile(profileRes.data);
      setTasks(tasksRes.data || []);
      if (selectedTask) {
        const updatedSelected = (tasksRes.data || []).find((t) => t.id === selectedTask.id);
        if (updatedSelected) setSelectedTask(updatedSelected);
      }
    } catch (err) {
      setAlertMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedTask]);

  useEffect(() => {
    loadData();
    const socket = connectSocket();
    if (socket) {
      const handleOrderUpdate = () => loadData();
      socket.on('order:status:update', handleOrderUpdate);
      return () => {
        socket.off('order:status:update', handleOrderUpdate);
      };
    }
    return undefined;
  }, [loadData]);

  // Tombol toggle "Siap Jalan" (Wajib GPS diizinkan terlebih dahulu)
  const handleToggleReady = async () => {
    setAlertMsg(null);
    const nextReady = !profile?.driverProfile?.isReady;

    if (nextReady) {
      const online = await verifyConnectionBeforeAction();
      if (!online) {
        setAlertMsg({
          type: 'error',
          text: 'Koneksi internet terputus (Offline). Periksa jaringan Anda sebelum mengaktifkan status Siap Jalan.',
        });
        return;
      }
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

      setProfile((prev) =>
        prev ? { ...prev, driverProfile: res.data } : prev
      );
      setAlertMsg({
        type: 'success',
        text: res.message,
      });
    } catch (err) {
      setAlertMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Tombol "Mulai Tugas" (Wajib cek internet & wajib izin lokasi GPS)
  const handleStartTask = async (task) => {
    setAlertMsg(null);

    // 1. Cek koneksi internet sebelum mulai tugas
    const online = await verifyConnectionBeforeAction();
    if (!online) {
      setAlertMsg({
        type: 'error',
        text: 'PERINGATAN OFFLINE: Koneksi internet tidak tersedia. Tidak dapat memulai tugas saat offline.',
      });
      return;
    }

    setActionLoading(true);
    try {
      // 2. Wajib izinkan lokasi GPS sebelum bisa mulai tugas
      const currentCoords = await requestLocationPermission();

      const res = await startDriverTaskApi(task.id, {
        gpsGranted: true,
        lat: currentCoords.lat,
        lng: currentCoords.lng,
      });

      setAlertMsg({
        type: 'success',
        text: `Tugas #${task.orderCode} dimulai! Lokasi live Anda dikirim otomatis tiap 10 detik.`,
      });
      setSelectedTask(res.data);
      await loadData();
    } catch (err) {
      setAlertMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Tombol "Selesai Tugas"
  const handleCompleteTask = async (task) => {
    setAlertMsg(null);

    const online = await verifyConnectionBeforeAction();
    if (!online) {
      setAlertMsg({
        type: 'error',
        text: 'PERINGATAN OFFLINE: Pastikan internet terhubung untuk menyelesaikan laporan tugas.',
      });
      return;
    }

    setActionLoading(true);
    try {
      const res = await completeDriverTaskApi(task.id, {
        lat: coords?.lat,
        lng: coords?.lng,
      });

      setAlertMsg({
        type: 'success',
        text: `Tugas #${task.orderCode} telah ditandai Selesai!`,
      });
      setSelectedTask(res.data);
      await loadData();
    } catch (err) {
      setAlertMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const isReady = Boolean(profile?.driverProfile?.isReady);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-20">
      {/* Banner Peringatan Offline */}
      {!isOnline && (
        <div className="bg-red-600 text-white px-4 py-3 text-xs font-semibold flex items-center justify-between shadow-md">
          <span>⚠️ PERINGATAN: Perangkat Anda sedang OFFLINE. Anda tidak dapat memulai tugas tanpa koneksi internet.</span>
        </div>
      )}

      {/* Header Mobile-First */}
      <header className="bg-blue-700 text-white px-4 pt-5 pb-6 rounded-b-3xl shadow">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-200">Panel Mitra Driver</p>
              <h1 className="text-lg font-bold">{profile?.name || 'Driver Rental Iqra'}</h1>
              <p className="text-xs text-blue-100">
                SIM: {profile?.driverProfile?.licenseNumber || '-'}
              </p>
            </div>
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleToggleReady}
              className={`px-4 py-2 rounded-full text-xs font-bold shadow transition ${
                isReady && isGpsGranted
                  ? 'bg-emerald-400 text-slate-900'
                  : 'bg-slate-800/60 text-white border border-blue-400'
              }`}
            >
              {isReady && isGpsGranted ? '🟢 SIAP JALAN' : '⚪ AKTIFKAN SIAP JALAN'}
            </button>
          </div>

          {/* Kartu Status GPS & Tracking */}
          <div className="mt-4 p-3 rounded-2xl bg-blue-800/70 border border-blue-500/40 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-blue-200">Status Izin Lokasi (GPS):</span>
              <span className="font-semibold">
                {isGpsGranted
                  ? '✅ Diizinkan'
                  : permissionStatus === 'denied'
                  ? '❌ Ditolak (Wajib Diaktifkan)'
                  : '⏳ Belum Diaktifkan'}
              </span>
            </div>
            {coords && (
              <div className="flex items-center justify-between text-[11px] text-blue-200">
                <span>Koordinat: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
                {ongoingOrder && (
                  <span className="text-amber-300 font-semibold animate-pulse">
                    📡 Mengirim tiap 10 dtk
                  </span>
                )}
              </div>
            )}
            {lastSentAt && (
              <p className="text-[11px] text-blue-300">
                Update lokasi terakhir: {new Date(lastSentAt).toLocaleTimeString('id-ID')}
              </p>
            )}
            {!isGpsGranted && (
              <button
                type="button"
                onClick={() => requestLocationPermission().catch(() => {})}
                className="mt-2 w-full py-1.5 rounded-lg bg-white text-blue-800 font-semibold text-xs"
              >
                📍 Izinkan Akses Lokasi (GPS) Sekarang
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 mt-4 space-y-4">
        {/* Alert Pesan / Error GPS */}
        {(alertMsg || gpsError) && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-medium border ${
              alertMsg?.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {alertMsg?.text || gpsError}
          </div>
        )}

        {/* Filter Tab Tugas */}
        <div className="grid grid-cols-3 gap-2 bg-white dark:bg-slate-800 p-1.5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          {[
            { id: 'today', label: 'Tugas Hari Ini' },
            { id: 'active', label: 'Sedang Aktif' },
            { id: 'history', label: 'Riwayat' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 rounded-xl text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Daftar Tugas */}
        {loading ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 text-center text-sm text-slate-500">
            Memuat daftar tugas driver...
          </div>
        ) : tasks.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Belum ada tugas pada kategori ini
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Pastikan status Anda &ldquo;Siap Jalan&rdquo; agar Admin dapat menugaskan order baru.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const badge = STATUS_BADGE[task.status] || {
                label: task.status,
                className: 'bg-slate-100 text-slate-700',
              };

              return (
                <div
                  key={task.id}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-mono text-slate-500">
                        #{task.orderCode}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {task.carType?.name || 'Unit Mobil'} —{' '}
                        <span className="text-blue-600 dark:text-blue-400">
                          {task.carUnit?.plateNumber || 'Plat belum diatur'}
                        </span>
                      </h3>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 border-t border-b border-slate-100 dark:border-slate-700 py-2.5">
                    <p>
                      👤 <strong>Pelanggan:</strong> {task.customer?.name || '-'} ({task.customer?.phone || '-'})
                    </p>
                    <p>
                      📍 <strong>Lokasi Jemput:</strong> {task.pickupCity} — {task.pickupAddress}
                    </p>
                    <p>
                      🕒 <strong>Jadwal:</strong>{' '}
                      {new Date(task.startTime).toLocaleString('id-ID')} s/d{' '}
                      {new Date(task.endTime).toLocaleString('id-ID')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedTask(task)}
                      className="flex-1 py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Detail Tugas
                    </button>

                    {task.status === 'CONFIRMED' && (
                      <button
                        type="button"
                        disabled={actionLoading || !isOnline || permissionStatus === 'denied'}
                        onClick={() => handleStartTask(task)}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm"
                      >
                        ▶ Mulai Tugas
                      </button>
                    )}

                    {task.status === 'ONGOING' && (
                      <button
                        type="button"
                        disabled={actionLoading || !isOnline}
                        onClick={() => handleCompleteTask(task)}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm"
                      >
                        ✓ Selesai Tugas
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Detail Tugas */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <p className="text-xs text-slate-500">Detail Tugas Driver</p>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Order #{selectedTask.orderCode}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700 dark:text-slate-200">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 space-y-1">
                <p><strong>Mobil:</strong> {selectedTask.carType?.name}</p>
                <p><strong>Plat Nomor:</strong> {selectedTask.carUnit?.plateNumber || '-'}</p>
                <p><strong>Warna / Tahun:</strong> {selectedTask.carUnit?.color || '-'} / {selectedTask.carUnit?.year || '-'}</p>
                <p><strong>Paket Layanan:</strong> {selectedTask.packageType} ({selectedTask.serviceType})</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 space-y-1">
                <p><strong>Nama Pelanggan:</strong> {selectedTask.customer?.name}</p>
                <p><strong>No. Telepon:</strong> {selectedTask.customer?.phone || '-'}</p>
                <p><strong>Kota Jemput:</strong> {selectedTask.pickupCity}</p>
                <p><strong>Alamat Jemput:</strong> {selectedTask.pickupAddress}</p>
                {selectedTask.notes && (
                  <p><strong>Catatan Pelanggan:</strong> {selectedTask.notes}</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              {selectedTask.status === 'CONFIRMED' && (
                <button
                  type="button"
                  disabled={actionLoading || !isOnline || permissionStatus === 'denied'}
                  onClick={() => handleStartTask(selectedTask)}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold"
                >
                  ▶ Mulai Tugas Sekarang
                </button>
              )}
              {selectedTask.status === 'ONGOING' && (
                <button
                  type="button"
                  disabled={actionLoading || !isOnline}
                  onClick={() => handleCompleteTask(selectedTask)}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold"
                >
                  ✓ Tandai Selesai
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="py-3 px-4 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DriverDashboardPage;
