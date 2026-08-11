import { create } from 'zustand';

interface User {
  id: number;
  name: string;
  email: string;
  roles?: any[];
}

interface AuthStore {
  token: string | null;
  user: User | null;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: localStorage.getItem('token'),
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),
  setToken: (token) => {
    set({ token, isAuthenticated: !!token });
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  },
  setUser: (user) => set({ user }),
  logout: () => {
    set({ token: null, user: null, isAuthenticated: false });
    localStorage.removeItem('token');
  },
}));
