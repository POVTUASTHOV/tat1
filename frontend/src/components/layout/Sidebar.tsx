'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  Home, 
  FolderOpen, 
  Files, 
  Upload, 
  BarChart3, 
  Settings 
} from 'lucide-react';
import { cn } from '../../lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Projects', href: '/dashboard/projects', icon: FolderOpen },
  { name: 'All Files', href: '/dashboard/files', icon: Files },
  { name: 'Upload', href: '/dashboard/upload', icon: Upload },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-white shadow-sm border-r border-gray-200 min-h-[calc(100vh-73px)]">
      <nav className="p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              <item.icon className={cn(
                'w-5 h-5 mr-3',
                isActive ? 'text-blue-600' : 'text-gray-400'
              )} />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}