import { Navigate, useLocation } from 'react-router';
import { homeFor, useAuth } from '../lib/auth';

/** Halaman khusus peran tertentu. Belum login -> ke halaman masuk lalu kembali ke sini. */
export function RequireRole({ role, children }) {
  const { token, user } = useAuth();
  const location = useLocation();
  if (!token || !user) return <Navigate to={`/masuk?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}
