import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Spinner, Toaster } from '../components/ui';
import { RequireRole } from './RequireRole';
import { CustomerLayout } from './CustomerLayout';
import { HomePage } from '../features/customer/HomePage';
import { SearchPage } from '../features/customer/SearchPage';
import { CheckoutPage } from '../features/customer/CheckoutPage';
import { BookingsPage } from '../features/customer/BookingsPage';
import { BookingDetailPage } from '../features/customer/BookingDetailPage';
import { AccountPage } from '../features/customer/AccountPage';
import { DashboardPage } from '../features/customer/DashboardPage';
import { PhotoCreditsPage } from '../features/customer/PhotoCreditsPage';
import { LoginPage, RegisterPage } from '../features/customer/AuthPages';

// Halaman driver dari Dev 3, dimuat terpisah supaya halaman pelanggan tetap ringan.
const DriverDashboardPage = lazy(() => import('../features/driver').then((m) => ({ default: m.DriverDashboardPage })));
const DriverRegisterPage = lazy(() => import('../features/driver').then((m) => ({ default: m.DriverRegisterPage })));

// Panel admin dibuat Dev 1 (features/admin). Sampai siap, tampilkan halaman sementara.
function AdminPlaceholder() {
  return <p className="p-6 text-center text-sm text-slate-500">Panel admin sedang disiapkan (Dev 1).</p>;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster />
        <Suspense fallback={<Spinner className="min-h-dvh items-center" />}>
          <Routes>
            <Route element={<CustomerLayout />}>
              <Route index element={<HomePage />} />
              <Route path="cari" element={<SearchPage />} />
              <Route path="kredit-foto" element={<PhotoCreditsPage />} />
              <Route path="masuk" element={<LoginPage />} />
              <Route path="daftar" element={<RegisterPage />} />
              <Route path="dasbor" element={<RequireRole role="CUSTOMER"><DashboardPage /></RequireRole>} />
              <Route path="pesan" element={<RequireRole role="CUSTOMER"><CheckoutPage /></RequireRole>} />
              <Route path="pesanan" element={<RequireRole role="CUSTOMER"><BookingsPage /></RequireRole>} />
              <Route path="pesanan/:id" element={<RequireRole role="CUSTOMER"><BookingDetailPage /></RequireRole>} />
              <Route path="akun" element={<RequireRole role="CUSTOMER"><AccountPage /></RequireRole>} />
            </Route>
            <Route path="driver/daftar" element={<DriverRegisterPage />} />
            <Route path="driver/*" element={<RequireRole role="DRIVER"><DriverDashboardPage /></RequireRole>} />
            <Route path="admin/*" element={<RequireRole role="ADMIN"><AdminPlaceholder /></RequireRole>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
