'use client';

import { create } from 'zustand';

interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  
  addToast: (toast) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toast, id };
    
    set((state) => ({
      toasts: [...state.toasts, newToast]
    }));
    
    if (toast.duration !== 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, toast.duration || 5000);
    }
  },
  
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter(toast => toast.id !== id)
    }));
  }
}));

export const showAuthError = () => {
  useToastStore.getState().addToast({
    type: 'warning',
    title: 'Session Expired',
    message: 'Your session has expired. Please login again.',
    duration: 3000
  });
};

export const showServerError = () => {
  useToastStore.getState().addToast({
    type: 'error',
    title: 'Server Connection Lost',
    message: 'Unable to connect to server. Please try again.',
    duration: 5000
  });
};