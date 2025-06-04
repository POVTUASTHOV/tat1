'use client';

import { ReactNode } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}