// Pemanggil API untuk panel admin (Dev 1). Server membalas { success, data, message }.
import { api, apiBlob } from '../../lib/api';

const data = (p) => p.then((r) => r.data);

// Dashboard
export const getDashboard = () => data(api('/dashboard'));

// Mobil
export const listTypes = () => data(api('/cars/types'));
export const saveType = (id, body) => data(api(id ? `/cars/types/${id}` : '/cars/types', { method: id ? 'PUT' : 'POST', body }));
export const deleteType = (id) => api(`/cars/types/${id}`, { method: 'DELETE' });
export function uploadTypePhoto(id, file) {
  const form = new FormData();
  form.append('photo', file);
  return data(api(`/cars/types/${id}/photo`, { method: 'POST', body: form }));
}
export const deleteTypePhoto = (id) => data(api(`/cars/types/${id}/photo`, { method: 'DELETE' }));
export const listUnits = (query) => data(api('/cars/units', { query }));
export const saveUnit = (id, body) => data(api(id ? `/cars/units/${id}` : '/cars/units', { method: id ? 'PUT' : 'POST', body }));
export const deleteUnit = (id) => api(`/cars/units/${id}`, { method: 'DELETE' });

// Pesanan (modul Dev 3)
export const listOrders = (query) => data(api('/orders', { query }));
export const getOrder = (id) => data(api(`/orders/${id}`));
export const setOrderStatus = (id, status, notes) => data(api(`/orders/${id}/status`, { method: 'PATCH', body: { status, notes } }));
export const assignOrder = (id, body) => data(api(`/orders/${id}/assign`, { method: 'PATCH', body }));
export const getResources = (order) =>
  data(api('/availability/resources', { query: { carTypeId: order.carTypeId, startTime: order.startTime, endTime: order.endTime, excludeOrderId: order.id } }));

// Keuangan
export const getFinance = (query) => data(api('/finance/summary', { query }));
export const getCategories = () => data(api('/finance/categories'));
export const addTransaction = (body) => data(api('/finance/transactions', { method: 'POST', body }));
export const deleteTransaction = (id) => api(`/finance/transactions/${id}`, { method: 'DELETE' });
export async function downloadFinanceCsv(query) {
  const blob = await apiBlob('/finance/export', query);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `keuangan-${query.period}-${query.date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Perawatan
export const listMaintenance = (query) => data(api('/maintenance', { query }));
export const saveMaintenance = (id, body) => data(api(id ? `/maintenance/${id}` : '/maintenance', { method: id ? 'PATCH' : 'POST', body }));
export const maintenanceAction = (id, action, body) => data(api(`/maintenance/${id}/${action}`, { method: 'POST', body }));

// Pengguna, dokumen, driver
export const listUsers = (query) => data(api('/users', { query }));
export const setUserActive = (id, isActive) => data(api(`/users/${id}/status`, { method: 'PATCH', body: { isActive } }));
export const createDriver = (body) => data(api('/users/drivers', { method: 'POST', body }));
export const listDocuments = (status = 'PENDING') => data(api('/documents', { query: { status } }));
export const reviewDocument = (id, body) => data(api(`/documents/${id}/review`, { method: 'PATCH', body }));
export const documentImage = (id) => apiBlob(`/documents/${id}/file`);
export const listDrivers = () => data(api('/drivers'));
export const reviewDriver = (id, body) => data(api(`/drivers/${id}/approval`, { method: 'PATCH', body }));
export const getDriverPositions = () => data(api('/tracking/drivers'));
