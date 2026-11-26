// Panel admin (Dev 1). Dimuat terpisah (lazy) dari App.jsx supaya halaman pelanggan tetap ringan.
import { Navigate, Route, Routes } from 'react-router';
import { AdminLayout, AdminMenuPage } from './AdminLayout';
import { AdminDashboardPage } from './AdminDashboardPage';
import { AdminOrdersPage } from './AdminOrdersPage';
import { AdminCarsPage } from './AdminCarsPage';
import { AdminFinancePage } from './AdminFinancePage';
import { AdminMaintenancePage } from './AdminMaintenancePage';
import { AdminUsersPage } from './AdminUsersPage';
import { AdminMapPage } from './AdminMapPage';

export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="pesanan" element={<AdminOrdersPage />} />
        <Route path="mobil" element={<AdminCarsPage />} />
        <Route path="keuangan" element={<AdminFinancePage />} />
        <Route path="perawatan" element={<AdminMaintenancePage />} />
        <Route path="pengguna" element={<AdminUsersPage />} />
        <Route path="peta" element={<AdminMapPage />} />
        <Route path="menu" element={<AdminMenuPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
