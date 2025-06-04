import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { LoginCredentials, LoginResponse, StorageStats, Project, FileItem } from '../types';

class ApiService {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage on initialization
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  // Auth Methods
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>(API_ENDPOINTS.LOGIN, {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    // Automatically set token after successful login
    this.setToken(response.access);
    
    return response;
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      return this.request<void>(API_ENDPOINTS.LOGOUT, {
        method: 'POST',
        body: JSON.stringify({ refresh: refreshToken }),
      });
    } catch (error) {
      // Ignore logout errors - we'll clear local state anyway
      console.warn('Logout API call failed:', error);
    }
  }

  // Storage & File Methods
  async getStorageStats(): Promise<StorageStats> {
    return this.request<StorageStats>(API_ENDPOINTS.STORAGE_STATS);
  }

  async getProjects(): Promise<{ projects: Project[] }> {
    return this.request<{ projects: Project[] }>(API_ENDPOINTS.PROJECTS_LIST);
  }

  async getProjectFiles(projectId: string, folderId?: string): Promise<{ files: FileItem[] }> {
    let url = `${API_ENDPOINTS.LIST_FILES}?project_id=${projectId}`;
    if (folderId) {
      url += `&folder_id=${folderId}`;
    }
    return this.request<{ files: FileItem[] }>(url);
  }

  async getFolderFiles(folderId: string): Promise<{ files: FileItem[] }> {
    return this.request<{ files: FileItem[] }>(`${API_ENDPOINTS.LIST_FILES}?folder_id=${folderId}`);
  }

  async getAllFiles(page: number = 1, pageSize: number = 20, search?: string): Promise<{ files: FileItem[]; total: number }> {
    let url = `${API_ENDPOINTS.ALL_FILES}?page=${page}&page_size=${pageSize}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }
    return this.request<{ files: FileItem[]; total: number }>(url);
  }

  // Projects
  async createProject(data: { name: string; description?: string }): Promise<Project> {
    return this.request<Project>(API_ENDPOINTS.PROJECTS, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    return this.request<Project>(`${API_ENDPOINTS.PROJECTS}${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string): Promise<void> {
    return this.request<void>(`${API_ENDPOINTS.PROJECTS}${id}/`, {
      method: 'DELETE',
    });
  }

  // File Operations
  async downloadFile(fileId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/file-management/files/${fileId}/download/`, {
      headers: {
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
    });

    if (!response.ok) {
      throw new Error('Download failed');
    }

    return response.blob();
  }

  async deleteFile(fileId: string): Promise<void> {
    return this.request<void>(`/file-management/files/${fileId}/delete_file/`, {
      method: 'DELETE',
    });
  }

  async deleteFiles(fileIds: string[]): Promise<{ deleted_files: any[]; failed_files: any[] }> {
    return this.request<{ deleted_files: any[]; failed_files: any[] }>('/file-management/files/bulk_delete/', {
      method: 'DELETE',
      body: JSON.stringify({ file_ids: fileIds }),
    });
  }

  // Folders
  async createFolder(data: { name: string; parent?: string; project: string }): Promise<any> {
    return this.request<any>(`${API_ENDPOINTS.PROJECTS}${data.project}/create_folder/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteFolder(folderId: string): Promise<void> {
    return this.request<void>(`${API_ENDPOINTS.FOLDERS}${folderId}/`, {
      method: 'DELETE',
    });
  }

  // Project tree structure
  async getProjectTree(projectId: string): Promise<any> {
    return this.request<any>(`${API_ENDPOINTS.PROJECTS}${projectId}/tree/`);
  }
}

export const apiService = new ApiService();