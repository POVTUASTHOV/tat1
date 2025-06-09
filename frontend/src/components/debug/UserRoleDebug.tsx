'use client';

import { useAuth } from '@/hooks/useAuth';

export default function UserRoleDebug() {
  const { user, token, isAuthenticated } = useAuth();

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded-lg shadow-lg max-w-sm">
      <h3 className="font-bold mb-2">Debug: Current User</h3>
      <div className="text-sm space-y-1">
        <p><strong>Authenticated:</strong> {isAuthenticated ? 'Yes' : 'No'}</p>
        <p><strong>Has Token:</strong> {token ? 'Yes' : 'No'}</p>
        {user && (
          <>
            <p><strong>Username:</strong> {user.username}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Role:</strong> {user.workflow_role_details?.name || 'No role'}</p>
            <p><strong>Role Display:</strong> {user.workflow_role_details?.display_name || 'No display name'}</p>
            <p><strong>Is Superuser:</strong> {user.workflow_role_details?.name === 'superuser' ? 'YES' : 'NO'}</p>
          </>
        )}
        {!user && <p className="text-red-400">No user data</p>}
      </div>
    </div>
  );
}