'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../stores/authStore';
import { apiService } from '../lib/api';
import { LoginCredentials } from '../types';

export const useAuth = () => {
  const router = useRouter();
  const { 
    user, 
    token, 
    isAuthenticated, 
    isLoading, 
    setAuth, 
    clearAuth, 
    setLoading,
    initializeAuth 
  } = useAuthStore();

  // Initialize auth state when hook is first used
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  const login = async (credentials: LoginCredentials) => {
    try {
      setLoading(true);
      const response = await apiService.login(credentials);
      
      setAuth(response.user, response.access);
      
      router.push('/dashboard');
      return { success: true };
    } catch (error) {
      console.error('Login failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Login failed' 
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await apiService.logout(token);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuth();
      router.push('/login');
    }
  };

  const checkAuth = () => {
    if (!isAuthenticated || !token) {
      router.push('/login');
      return false;
    }
    return true;
  };

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    logout,
    checkAuth,
  };
};