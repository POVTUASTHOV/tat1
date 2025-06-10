'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  Home, 
  FolderOpen, 
  Files, 
  BarChart3, 
  Settings,
  Users,
  Briefcase,
  Target,
  Activity,
  Shield,
  UserPlus
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';

const baseNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Projects', href: '/dashboard/projects', icon: FolderOpen },
  { name: 'All Files', href: '/dashboard/files', icon: Files },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Workflow', href: '/dashboard/workflow', icon: Briefcase },
  { name: 'Assignments', href: '/dashboard/assignments', icon: Target },
  { name: 'Team', href: '/dashboard/team', icon: Users },
  { name: 'Activity', href: '/dashboard/activity', icon: Activity },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

const adminNavigation = [
  { name: 'User Management', href: '/dashboard/admin/users', icon: UserPlus },
  { name: 'System Settings', href: '/dashboard/admin/system', icon: Shield },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const userRole = user?.workflow_role_details?.name;
  const isSuperuser = userRole === 'superuser';
  const isAdmin = userRole === 'admin' || isSuperuser;

  console.log('Debug Sidebar:', {
    user: user,
    userRole: userRole,
    isSuperuser: isSuperuser,
    workflow_role_details: user?.workflow_role_details
  });

  const renderNavItems = (items: Array<{name: string, href: string, icon: any}>) => {
    return items.map((item) => {
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
    });
  };

  return (
    <div className="w-64 bg-white shadow-sm border-r border-gray-200 min-h-[calc(100vh-73px)]">
      <nav className="p-4 space-y-2">
        {renderNavItems(baseNavigation)}
        
        {user && (
          <>
            <div className="pt-4 pb-2">
              <div className="px-3 py-1">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Administration
                </h3>
              </div>
            </div>
            {renderNavItems(adminNavigation)}
          </>
        )}
        
        <div className="pt-4 border-t border-gray-200">
          <div className="px-3 py-2 text-xs text-gray-500">
            <div>User: {user?.username}</div>
            <div>Role: {userRole || 'None'}</div>
            <div>Is Superuser: {isSuperuser ? 'Yes' : 'No'}</div>
          </div>
        </div>
      </nav>
    </div>
  );
}