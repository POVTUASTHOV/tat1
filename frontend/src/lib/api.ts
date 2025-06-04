import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { LoginCredentials, LoginResponse, StorageStats, Project, FileItem } from '../types';

class ApiService {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
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
      throw new Error(`API Error: ${response.status} - ${response.statusText}`);
    }

    return response.json();
  }

  // Auth Methods
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return this.request<LoginResponse>(API_ENDPOINTS.LOGIN, {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
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

  async getProjectFiles(projectId: string): Promise<{ files: FileItem[] }> {
    return this.request<{ files: FileItem[] }>(`${API_ENDPOINTS.LIST_FILES}?project_id=${projectId}`);
  }

  async getFolderFiles(folderId: string): Promise<{ files: FileItem[] }> {
    return this.request<{ files: FileItem[] }>(`${API_ENDPOINTS.LIST_FILES}?folder_id=${folderId}`);
  }

  async getAllFiles(page: number = 1, pageSize: number = 20): Promise<{ files: FileItem[]; total: number }> {
    return this.request<{ files: FileItem[]; total: number }>(`${API_ENDPOINTS.ALL_FILES}?page=${page}&page_size=${pageSize}`);
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
}

export const apiService = new ApiService();
