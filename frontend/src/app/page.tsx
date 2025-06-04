'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../stores/authStore';

export default function RootPage() {
  const router = useRouter();
  const { isAuthenticated, token, initializeAuth } = useAuthStore();

  useEffect(() => {
    // Initialize auth state from localStorage
    initializeAuth();
    
    // Check authentication and redirect accordingly
    if (isAuthenticated && token) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [isAuthenticated, token, router, initializeAuth]);

  // Loading spinner while checking auth and redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}