'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/stores/toastStore';

interface Project {
  id: string;
  name: string;
  description: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  workflow_role: string;
  workflow_role_details?: {
    name: string;
    display_name: string;
  };
  is_active: boolean;
  date_joined: string;
}

interface CreateUserForm {
  username: string;
  email: string;
  password: string;
  password2: string;
  first_name: string;
  last_name: string;
  workflow_role: string;
  project_ids: string[];
  storage_quota: number;
}

const ROLE_OPTIONS = [
  { value: 'superuser', label: 'Superuser', description: 'Bypasses all permission checks' },
  { value: 'admin', label: 'Admin', description: 'Manages the entire workflow system' },
  { value: 'manager', label: 'Project Manager', description: 'Manages only assigned projects' },
  { value: 'employee', label: 'Employee', description: 'Can only perform assigned tasks' }
];

const DEFAULT_STORAGE_QUOTAS = {
  superuser: 1000 * 1024 * 1024 * 1024, // 1TB
  admin: 500 * 1024 * 1024 * 1024,     // 500GB
  manager: 100 * 1024 * 1024 * 1024,   // 100GB
  employee: 50 * 1024 * 1024 * 1024    // 50GB
};

export default function UserManagement() {
  const { user, token } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateUserForm>({
    username: '',
    email: '',
    password: '',
    password2: '',
    first_name: '',
    last_name: '',
    workflow_role: 'employee',
    project_ids: [],
    storage_quota: DEFAULT_STORAGE_QUOTAS.employee
  });

  useEffect(() => {
    if (user?.workflow_role_details?.name === 'superuser') {
      fetchUsers();
      fetchProjects();
    }
  }, [user]);

  useEffect(() => {
    // Update storage quota when role changes
    if (formData.workflow_role) {
      setFormData(prev => ({
        ...prev,
        storage_quota: DEFAULT_STORAGE_QUOTAS[formData.workflow_role as keyof typeof DEFAULT_STORAGE_QUOTAS] || DEFAULT_STORAGE_QUOTAS.employee
      }));
    }
  }, [formData.workflow_role]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('http://localhost:8000/users/users/', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.results || data);
      }
    } catch (error) {
      addToast('Failed to fetch users', 'error');
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch('http://localhost:8000/storage/projects/', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data.results || data);
      }
    } catch (error) {
      addToast('Failed to fetch projects', 'error');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'storage_quota') {
      setFormData(prev => ({ ...prev, [name]: parseInt(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleProjectSelection = (projectId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      project_ids: checked 
        ? [...prev.project_ids, projectId]
        : prev.project_ids.filter(id => id !== projectId)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.password2) {
      addToast('Passwords do not match', 'error');
      return;
    }

    if (formData.password.length < 8) {
      addToast('Password must be at least 8 characters long', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/users/register/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        addToast('User created successfully', 'success');
        setShowCreateForm(false);
        setFormData({
          username: '',
          email: '',
          password: '',
          password2: '',
          first_name: '',
          last_name: '',
          workflow_role: 'employee',
          project_ids: [],
          storage_quota: DEFAULT_STORAGE_QUOTAS.employee
        });
        fetchUsers();
      } else {
        const errorData = await response.json();
        const errorMessage = Object.values(errorData).flat().join(', ') || 'Failed to create user';
        addToast(errorMessage, 'error');
      }
    } catch (error) {
      addToast('Network error. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatStorageSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${Math.round(size)} ${units[unitIndex]}`;
  };

  // Debug info - remove this in production
  console.log('UserManagement Debug:', {
    user: user,
    role: user?.workflow_role_details?.name,
    isSuperuser: user?.workflow_role_details?.name === 'superuser'
  });

  if (user?.workflow_role_details?.name !== 'superuser') {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Access Denied</h2>
        <p className="text-gray-600 mb-4">Only superusers can manage user accounts.</p>
        
        {/* Debug information */}
        <div className="bg-gray-100 p-4 rounded-lg text-left max-w-md mx-auto">
          <h3 className="font-semibold text-gray-700 mb-2">Debug Information:</h3>
          <p className="text-sm text-gray-600">Current user: {user?.username || 'Not logged in'}</p>
          <p className="text-sm text-gray-600">Current role: {user?.workflow_role_details?.name || 'No role assigned'}</p>
          <p className="text-sm text-gray-600">Required role: superuser</p>
          
          {!user?.workflow_role_details && (
            <div className="mt-3 p-3 bg-yellow-100 rounded border-l-4 border-yellow-400">
              <p className="text-sm text-yellow-700">
                <strong>Issue:</strong> No workflow role assigned to your account. 
                Contact an administrator to assign the superuser role.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-1">Create and manage user accounts</p>
        </div>
        <Button 
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {showCreateForm ? 'Cancel' : 'Create New User'}
        </Button>
      </div>

      {showCreateForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Create New User</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  name="password2"
                  value={formData.password2}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  name="workflow_role"
                  value={formData.workflow_role}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLE_OPTIONS.map(role => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  {ROLE_OPTIONS.find(r => r.value === formData.workflow_role)?.description}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Storage Quota
                </label>
                <input
                  type="number"
                  name="storage_quota"
                  value={formData.storage_quota}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  {formatStorageSize(formData.storage_quota)}
                </p>
              </div>
            </div>

            {(formData.workflow_role === 'manager' || formData.workflow_role === 'employee') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Assign to Projects
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    (Optional - can be assigned later)
                  </span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-3">
                  {projects.map(project => (
                    <label key={project.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.project_ids.includes(project.id)}
                        onChange={(e) => handleProjectSelection(project.id, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{project.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
              >
                {loading ? 'Creating...' : 'Create User'}
              </Button>
              <Button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="bg-gray-500 hover:bg-gray-600 text-white px-6"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Users List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Existing Users</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {user.first_name || user.last_name 
                          ? `${user.first_name} ${user.last_name}`.trim()
                          : user.username
                        }
                      </div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                      {user.username !== user.email && (
                        <div className="text-xs text-gray-400">@{user.username}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.workflow_role_details?.name === 'superuser' 
                        ? 'bg-purple-100 text-purple-800'
                        : user.workflow_role_details?.name === 'admin'
                        ? 'bg-red-100 text-red-800'
                        : user.workflow_role_details?.name === 'manager'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {user.workflow_role_details?.display_name || user.workflow_role_details?.name || 'No Role'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(user.date_joined).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {users.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No users found. Create your first user to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}