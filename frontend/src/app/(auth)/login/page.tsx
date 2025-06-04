'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoginForm from '../../../components/forms/LoginForm';
import { useAuth } from '../../../hooks/useAuth';

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) {
    return null; // or loading spinner
  }

  return <LoginForm onSubmit={login} isLoading={isLoading} />;
}