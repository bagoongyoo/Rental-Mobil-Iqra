import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Modul driver (Dev 3) membaca token dari localStorage "token", jadi disimpan juga di sana.
function syncLegacyToken(token) {
  try {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  } catch {
    /* localStorage bisa diblokir (mode privat); login tetap jalan */
  }
}

export const useAuth = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => {
        syncLegacyToken(token);
        set({ token, user });
      },
      setUser: (user) => set({ user }),
      logout: () => {
        syncLegacyToken(null);
        set({ token: null, user: null });
      },
    }),
    { name: 'iqra-auth' },
  ),
);

// Pelanggan yang sudah masuk diarahkan ke dashboard pelanggan.
export const homeFor = (role) => (role === 'ADMIN' ? '/admin' : role === 'DRIVER' ? '/driver' : role === 'CUSTOMER' ? '/dasbor' : '/');
