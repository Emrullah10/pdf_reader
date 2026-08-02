import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  status: 'idle', // idle | checking | authenticated | unauthenticated
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'unauthenticated' }),
  setChecking: () => set({ status: 'checking' }),
  clear: () => set({ user: null, status: 'unauthenticated' }),
}));
