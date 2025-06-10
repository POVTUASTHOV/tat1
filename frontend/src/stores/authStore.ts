'use client';

import { create } from 'zustand';
import { User, Permissions } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  permissions: Permissions | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  setAuth: (user: User, token: string, refreshToken: string, permissions?: Permissions) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  initializeAuth: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  permissions: null,
  isAuthenticated: false,
  isLoading: false,
  
  setAuth: (user, token, refreshToken, permissions) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refreshToken);
      if (permissions) {
        localStorage.setItem('permissions', JSON.stringify(permissions));
      }
    }
    set({
      user,
      token,
      refreshToken,
      permissions,
      isAuthenticated: true,
      isLoading: false,
    });
  },
  
  clearAuth: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('permissions');
    }
    set({
      user: null,
      token: null,
      refreshToken: null,
      permissions: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  initializeAuth: () => {
    if (typeof window !== 'undefined') {
      const user = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      const refreshToken = localStorage.getItem('refreshToken');
      const permissions = localStorage.getItem('permissions');
      
      if (user && token && refreshToken) {
        set({
          user: JSON.parse(user),
          token,
          refreshToken,
          permissions: permissions ? JSON.parse(permissions) : null,
          isAuthenticated: true,
        });
      }
    }
  },
}));