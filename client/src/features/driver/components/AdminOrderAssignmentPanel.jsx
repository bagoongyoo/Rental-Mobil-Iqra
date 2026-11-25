import React, { useState, useEffect } from 'react';
import { getAssignableResourcesApi, assignOrderUnitAndDriverApi } from '../api/driverApi';

/**
 * Komponen Panel Penugasan Unit (Plat Nomor) & Driver untuk Admin (Dev 3 - koordinasi Dev 1)
 */
export function AdminOrderAssignmentPanel({ order, onAssigned }) {
  const [freeUnits, setFreeUnits] = useState([]);
  const [freeDrivers, setFreeDrivers] = useState([]);
  const [carUnitId, setCarUnitId] = useState(order?.carUnitId || '');
  const [driverId, setDriverId] = useState(order?.driverId || '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!order?.carTypeId) return;

    getAssignableResourcesApi({
      carTypeId: order.carTypeId,
      startTime: order.startTime,
      endTime: order.endTime,
      excludeOrderId: order.id,
    })
      .then((res) => {
        setFreeUnits(res.data?.freeUnits || []);
        setFreeDrivers(res.data?.freeDrivers || []);
      })
      .catch((err) => setErrorMsg(err.message));
  }, [order]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await assignOrderUnitAndDriverApi(order.id, {
        carUnitId: Number(carUnitId),
        driverId: driverId ? Number(driverId) : null,
      });
      setSuccessMsg(res.message);
      if (typeof onAssigned === 'function') {
        onAssigned(res.data);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 space-y-3"
    >
      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
        Penugasan Unit & Driver — Order #{order?.orderCode}
      </h4>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-red-50 text-red-700 text-xs">{errorMsg}</div>
      )}
      {successMsg && (
        <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs">{successMsg}</div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          Pilih Unit Mobil (Plat Nomor Bebas) *
        </label>
        <select
          required
          value={carUnitId}
          onChange={(e) => setCarUnitId(e.target.value)}
          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        >
          <option value="">-- Pilih Plat Nomor --</option>
          {freeUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.plateNumber} ({unit.color} - {unit.year})
            </option>
          ))}
        </select>
      </div>

      {order?.serviceType === 'WITH_DRIVER' && (
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Pilih Driver *
          </label>
          <select
            required
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          >
            <option value="">-- Pilih Driver Aktif --</option>
            {freeDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.phone || '-'}) {d.isReady ? '🟢 Siap Jalan' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold"
      >
        {loading ? 'Menyimpan Penugasan...' : 'Simpan & Konfirmasi Order'}
      </button>
    </form>
  );
}

export default AdminOrderAssignmentPanel;
