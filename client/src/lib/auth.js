import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuth = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'iqra-auth' },
  ),
);

// Pelanggan yang sudah masuk diarahkan ke dashboard pelanggan.
export const homeFor = (role) => (role === 'ADMIN' ? '/admin' : role === 'DRIVER' ? '/driver' : role === 'CUSTOMER' ? '/dasbor' : '/');
