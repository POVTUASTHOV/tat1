'use client';

import { useState, useEffect } from 'react';
import { Users, Plus, Eye, EyeOff, Shield, UserCheck, Copy, Check, ChevronUp, ChevronDown, Settings } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { apiService } from '@/lib/api';

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
  workflow_role_details?: {
    name: string;
    display_name: string;
  };
  is_active: boolean;
  date_joined: string;
  storage_quota: number;
  storage_used: number;
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
  { 
    value: 'superuser', 
    label: 'Superuser', 
    description: 'Quyền cao nhất - Quản lý toàn bộ hệ thống',
    color: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  { 
    value: 'admin', 
    label: 'System Admin', 
    description: 'Quản trị viên hệ thống - Quản lý workflow và người dùng',
    color: 'bg-red-100 text-red-800 border-red-200'
  },
  { 
    value: 'manager', 
    label: 'Project Manager', 
    description: 'Quản lý dự án - Phân công nhiệm vụ cho nhân viên',
    color: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  { 
    value: 'employee', 
    label: 'Employee', 
    description: 'Nhân viên - Thực hiện các nhiệm vụ được phân công',
    color: 'bg-green-100 text-green-800 border-green-200'
  }
];

const DEFAULT_STORAGE_QUOTAS = {
  superuser: 1000 * 1024 * 1024 * 1024,
  admin: 500 * 1024 * 1024 * 1024,
  manager: 100 * 1024 * 1024 * 1024,
  employee: 15 * 1024 * 1024 * 1024
};

const INITIAL_FORM: CreateUserForm = {
  username: '',
  email: '',
  password: '',
  password2: '',
  first_name: '',
  last_name: '',
  workflow_role: 'employee',
  project_ids: [],
  storage_quota: DEFAULT_STORAGE_QUOTAS.employee
};

export default function UserManagement() {
  const { addToast } = useToastStore();
  const { user: currentUser, permissions } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateUserForm>(INITIAL_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [createdUserInfo, setCreatedUserInfo] = useState<{email: string, password: string} | null>(null);
  
  // Role management state
  const [roleChangeUser, setRoleChangeUser] = useState<User | null>(null);
  const [availableRoles, setAvailableRoles] = useState<{
    promotable_roles: string[];
    demotable_roles: string[];
    can_change_role: boolean;
  } | null>(null);
  const [showRoleChangeModal, setShowRoleChangeModal] = useState(false);
  const [roleChangeLoading, setRoleChangeLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchProjects();
  }, []);

  // Set default role based on user permissions
  useEffect(() => {
    const availableRoles = getAvailableRoles();
    if (availableRoles.length > 0 && !availableRoles.find(role => role.value === formData.workflow_role)) {
      setFormData(prev => ({
        ...prev,
        workflow_role: availableRoles[availableRoles.length - 1].value // Default to least privileged role
      }));
    }
  }, [currentUser, permissions]);

  useEffect(() => {
    if (formData.workflow_role) {
      setFormData(prev => ({
        ...prev,
        storage_quota: DEFAULT_STORAGE_QUOTAS[formData.workflow_role as keyof typeof DEFAULT_STORAGE_QUOTAS] || DEFAULT_STORAGE_QUOTAS.employee
      }));
    }
  }, [formData.workflow_role]);


  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
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
      addToast({
        type: 'error',
        title: 'Lỗi',
        message: 'Không thể tải danh sách người dùng'
      });
    }
  };

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
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
      console.error('Failed to fetch projects:', error);
    }
  };

  const generateRandomPassword = () => {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
      password += charset.charAt(Math.floor(Math.random() * n));
    }
    return password;
  };

  const handleGeneratePassword = () => {
    const newPassword = generateRandomPassword();
    setFormData(prev => ({
      ...prev,
      password: newPassword,
      password2: newPassword
    }));
    addToast({
      type: 'success',
      title: 'Đã tạo mật khẩu',
      message: 'Mật khẩu tự động đã được tạo'
    });
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPassword(true);
    addToast({
      type: 'success',
      title: 'Đã sao chép',
      message: `${type} đã được sao chép vào clipboard`
    });
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  // Role management functions
  const handleRoleChangeClick = async (user: User) => {
    try {
      const roleData = await apiService.getUserAvailableRoles(user.id);
      setAvailableRoles(roleData);
      setRoleChangeUser(user);
      setShowRoleChangeModal(true);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Lỗi',
        message: 'Không thể tải thông tin vai trò'
      });
    }
  };

  const handleRoleChange = async (newRole: string) => {
    if (!roleChangeUser) return;
    
    setRoleChangeLoading(true);
    try {
      const result = await apiService.changeUserRole(roleChangeUser.id, newRole);
      
      addToast({
        type: 'success',
        title: 'Thành công',
        message: result.message
      });
      
      // Refresh user list
      await fetchUsers();
      
      // Close modal
      setShowRoleChangeModal(false);
      setRoleChangeUser(null);
      setAvailableRoles(null);
      
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Lỗi',
        message: error instanceof Error ? error.message : 'Không thể thay đổi vai trò'
      });
    } finally {
      setRoleChangeLoading(false);
    }
  };

  const closeRoleChangeModal = () => {
    setShowRoleChangeModal(false);
    setRoleChangeUser(null);
    setAvailableRoles(null);
    setRoleChangeLoading(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'storage_quota') {
      const numValue = value === '' ? 0 : parseInt(value);
      setFormData(prev => ({ ...prev, [name]: isNaN(numValue) ? 0 : numValue }));
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
      addToast({
        type: 'error',
        title: 'Lỗi',
        message: 'Mật khẩu không khớp'
      });
      return;
    }

    if (formData.password.length < 8) {
      addToast({
        type: 'error',
        title: 'Lỗi',
        message: 'Mật khẩu phải có ít nhất 8 ký tự'
      });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8000/users/register/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const result = await response.json();
        
        setCreatedUserInfo({
          email: formData.email,
          password: formData.password
        });
        
        addToast({
          type: 'success',
          title: 'Thành công',
          message: `Đã tạo tài khoản cho ${formData.username}`
        });
        
        setShowCreateForm(false);
        setFormData(INITIAL_FORM);
        fetchUsers();
        
      } else {
        const errorData = await response.json();
        const errorMessage = Object.values(errorData).flat().join(', ') || 'Tạo tài khoản thất bại';
        addToast({
          type: 'error',
          title: 'Lỗi',
          message: errorMessage
        });
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Lỗi',
        message: 'Lỗi kết nối. Vui lòng thử lại.'
      });
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

  const getRoleInfo = (roleName: string) => {
    return ROLE_OPTIONS.find(role => role.value === roleName) || ROLE_OPTIONS[3];
  };

  // Get available roles based on current user's permissions
  const getAvailableRoles = () => {
    const userRole = currentUser?.workflow_role_details?.name;
    const isSuperuser = currentUser?.is_superuser || permissions?.is_superuser;
    
    if (isSuperuser || userRole === 'superuser') {
      // Superuser can create all roles
      return ROLE_OPTIONS;
    } else if (userRole === 'admin') {
      // Admin can create manager and employee
      return ROLE_OPTIONS.filter(role => ['manager', 'employee'].includes(role.value));
    } else if (userRole === 'manager') {
      // Manager can create employee only
      return ROLE_OPTIONS.filter(role => role.value === 'employee');
    }
    
    return []; // No roles available for other users
  };

  // Check if user can manage users (superuser, admin, or manager)
  const canManageUsers = currentUser?.is_superuser || 
                        currentUser?.workflow_role_details?.name === 'superuser' ||
                        currentUser?.workflow_role_details?.name === 'admin' ||
                        currentUser?.workflow_role_details?.name === 'manager' ||
                        permissions?.is_superuser ||
                        permissions?.is_admin ||
                        permissions?.is_manager;

  if (!canManageUsers) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Truy cập bị từ chối</h2>
          <p className="text-gray-600 mb-6">
            Chỉ có Superuser, System Admin và Project Manager mới có thể quản lý tài khoản người dùng.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left">
            <h3 className="font-semibold text-gray-700 mb-2">Thông tin hiện tại:</h3>
            <p className="text-sm text-gray-600">Người dùng: {currentUser?.username || 'Chưa đăng nhập'}</p>
            <p className="text-sm text-gray-600">
              Vai trò: {currentUser?.workflow_role_details?.display_name || 'Chưa có vai trò'}
            </p>
            <p className="text-sm text-gray-600">
              Django Superuser: {currentUser?.is_superuser ? 'Có' : 'Không'}
            </p>
            <p className="text-sm text-gray-600">
              Permissions: {permissions?.is_superuser ? 'Superuser' : 'Không phải superuser'}
            </p>
            <p className="text-sm text-gray-600">Yêu cầu: Superuser, System Admin, hoặc Project Manager</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg">
          <div className="p-8 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Quản lý tài khoản</h1>
                  <p className="text-gray-600">Tạo và quản lý tài khoản người dùng trong hệ thống</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-lg flex items-center space-x-2 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                <Plus className="w-5 h-5" />
                <span>{showCreateForm ? 'Hủy' : 'Tạo tài khoản mới'}</span>
              </button>
            </div>
          </div>

          {createdUserInfo && (
            <div className="p-6 bg-green-50 border-b border-green-200">
              <div className="max-w-4xl mx-auto">
                <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center">
                  <Check className="w-6 h-6 mr-2" />
                  Tài khoản đã được tạo thành công!
                </h3>
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <p className="text-sm text-gray-700 mb-3">Thông tin đăng nhập (vui lòng lưu lại):</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <span className="text-sm font-medium text-gray-700">Email:</span>
                        <p className="font-mono text-sm">{createdUserInfo.email}</p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(createdUserInfo.email, 'Email')}
                        className="p-2 text-gray-500 hover:text-gray-700"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <span className="text-sm font-medium text-gray-700">Mật khẩu:</span>
                        <p className="font-mono text-sm">{createdUserInfo.password}</p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(createdUserInfo.password, 'Mật khẩu')}
                        className="p-2 text-gray-500 hover:text-gray-700"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setCreatedUserInfo(null)}
                    className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Đã lưu thông tin
                  </button>
                </div>
              </div>
            </div>
          )}

          {showCreateForm && (
            <div className="p-8 bg-gradient-to-br from-blue-50 to-indigo-50 border-b border-gray-200">
              <div className="max-w-4xl mx-auto">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                  <UserCheck className="w-6 h-6 mr-3 text-blue-600" />
                  Tạo tài khoản người dùng mới
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2">
                        Thông tin cơ bản
                      </h3>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Tên đăng nhập <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="username"
                          value={formData.username}
                          onChange={handleInputChange}
                          required
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                          placeholder="username"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          required
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                          placeholder="user@example.com"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Họ</label>
                          <input
                            type="text"
                            name="first_name"
                            value={formData.first_name}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                            placeholder="Nguyễn"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Tên</label>
                          <input
                            type="text"
                            name="last_name"
                            value={formData.last_name}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                            placeholder="Văn A"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2">
                        Bảo mật & Phân quyền
                      </h3>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">
                            Mật khẩu <span className="text-red-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={handleGeneratePassword}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Tạo tự động
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            value={formData.password}
                            onChange={handleInputChange}
                            required
                            minLength={8}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors pr-20"
                            placeholder="Mật khẩu mạnh"
                          />
                          <div className="absolute right-3 top-3 flex items-center space-x-1">
                            {formData.password && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(formData.password, 'Mật khẩu')}
                                className="p-1 text-gray-400 hover:text-gray-600"
                                title="Sao chép mật khẩu"
                              >
                                {copiedPassword ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="p-1 text-gray-400 hover:text-gray-600"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Xác nhận mật khẩu <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword2 ? 'text' : 'password'}
                            name="password2"
                            value={formData.password2}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors pr-12"
                            placeholder="Nhập lại mật khẩu"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword2(!showPassword2)}
                            className="absolute right-3 top-3 p-1 text-gray-400 hover:text-gray-600"
                          >
                            {showPassword2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Vai trò trong hệ thống <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-1 gap-3">
                          {getAvailableRoles().map(role => (
                            <label key={role.value} className="cursor-pointer">
                              <input
                                type="radio"
                                name="workflow_role"
                                value={role.value}
                                checked={formData.workflow_role === role.value}
                                onChange={handleInputChange}
                                className="sr-only"
                              />
                              <div className={`p-4 border-2 rounded-lg transition-all duration-200 ${
                                formData.workflow_role === role.value
                                  ? `${role.color} border-current`
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h4 className="font-semibold">{role.label}</h4>
                                    <p className="text-sm opacity-80">{role.description}</p>
                                  </div>
                                  {formData.workflow_role === role.value && (
                                    <div className="w-4 h-4 rounded-full bg-current flex items-center justify-center">
                                      <div className="w-2 h-2 bg-white rounded-full"></div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Dung lượng lưu trữ
                        </label>
                        <input
                          type="number"
                          name="storage_quota"
                          value={formData.storage_quota || ''}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                        />
                        <p className="text-sm text-gray-500 mt-1">
                          {formatStorageSize(formData.storage_quota)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {(formData.workflow_role === 'manager' || formData.workflow_role === 'employee') && (
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">
                        Phân quyền dự án (Tùy chọn)
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Chọn các dự án mà người dùng này có thể truy cập. Có thể phân quyền sau.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-4">
                        {projects.map(project => (
                          <label key={project.id} className="flex items-center space-x-3 cursor-pointer p-2 hover:bg-gray-50 rounded">
                            <input
                              type="checkbox"
                              checked={formData.project_ids.includes(project.id)}
                              onChange={(e) => handleProjectSelection(project.id, e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-gray-900 block truncate">{project.name}</span>
                              {project.description && (
                                <span className="text-xs text-gray-500 block truncate">{project.description}</span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm(false);
                        setFormData(INITIAL_FORM);
                      }}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                      <span>{loading ? 'Đang tạo...' : 'Tạo tài khoản'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Danh sách tài khoản ({users.length})</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Người dùng
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vai trò
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dung lượng
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trạng thái
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ngày tạo
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map(user => {
                    const roleInfo = getRoleInfo(user.workflow_role_details?.name || '');
                    const usagePercentage = user.storage_quota > 0 ? (user.storage_used / user.storage_quota) * 100 : 0;
                    
                    return (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                              {(user.first_name?.[0] || user.username[0]).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {user.first_name || user.last_name 
                                  ? `${user.first_name} ${user.last_name}`.trim()
                                  : user.username
                                }
                              </div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                              {user.username !== user.email.split('@')[0] && (
                                <div className="text-xs text-gray-400">@{user.username}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full border ${roleInfo.color}`}>
                            {roleInfo.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {formatStorageSize(user.storage_used)} / {formatStorageSize(user.storage_quota)}
                          </div>
                          <div className="w-32 bg-gray-200 rounded-full h-2 mt-1">
                            <div
                              className={`h-2 rounded-full transition-all duration-300 ${
                                usagePercentage > 90 ? 'bg-red-500' : 
                                usagePercentage > 70 ? 'bg-yellow-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {usagePercentage.toFixed(1)}% đã sử dụng
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                            user.is_active 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {user.is_active ? 'Hoạt động' : 'Vô hiệu hóa'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(user.date_joined).toLocaleDateString('vi-VN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          })}
                        </td>
                        <td className="px-6 py-4">
                          {currentUser?.id !== user.id && (
                            <button
                              onClick={() => handleRoleChangeClick(user)}
                              className="inline-flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                              title="Thay đổi vai trò"
                            >
                              <Settings className="w-4 h-4 mr-1" />
                              Vai trò
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              {users.length === 0 && (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa có người dùng</h3>
                  <p className="text-gray-500 mb-4">Tạo tài khoản người dùng đầu tiên để bắt đầu.</p>
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    Tạo tài khoản đầu tiên
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Role Change Modal */}
        {showRoleChangeModal && roleChangeUser && availableRoles && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Thay đổi vai trò</h3>
                  <button
                    onClick={closeRoleChangeModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>
                
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">
                    Thay đổi vai trò cho: <span className="font-semibold">{roleChangeUser.username}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Vai trò hiện tại: <span className="font-medium">{getRoleInfo(roleChangeUser.workflow_role_details?.name || '').label}</span>
                  </p>
                </div>

                <div className="space-y-3">
                  {availableRoles.promotable_roles.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <ChevronUp className="w-4 h-4 mr-1 text-green-500" />
                        Thăng cấp
                      </h4>
                      <div className="space-y-2">
                        {availableRoles.promotable_roles.map(role => {
                          const roleInfo = getRoleInfo(role);
                          return (
                            <button
                              key={role}
                              onClick={() => handleRoleChange(role)}
                              disabled={roleChangeLoading}
                              className={`w-full p-3 text-left border-2 rounded-lg transition-all duration-200 hover:border-green-300 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed ${roleInfo.color}`}
                            >
                              <div className="font-medium">{roleInfo.label}</div>
                              <div className="text-xs opacity-80">{roleInfo.description}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {availableRoles.demotable_roles.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <ChevronDown className="w-4 h-4 mr-1 text-orange-500" />
                        Giáng cấp
                      </h4>
                      <div className="space-y-2">
                        {availableRoles.demotable_roles.map(role => {
                          const roleInfo = getRoleInfo(role);
                          return (
                            <button
                              key={role}
                              onClick={() => handleRoleChange(role)}
                              disabled={roleChangeLoading}
                              className={`w-full p-3 text-left border-2 rounded-lg transition-all duration-200 hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed ${roleInfo.color}`}
                            >
                              <div className="font-medium">{roleInfo.label}</div>
                              <div className="text-xs opacity-80">{roleInfo.description}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!availableRoles.can_change_role && (
                    <div className="text-center py-4">
                      <Shield className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">
                        Bạn không có quyền thay đổi vai trò của người dùng này
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
                  <button
                    onClick={closeRoleChangeModal}
                    disabled={roleChangeLoading}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
                  >
                    Hủy
                  </button>
                </div>

                {roleChangeLoading && (
                  <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-xl">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}