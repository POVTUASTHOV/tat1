import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { LoginCredentials, LoginResponse, StorageStats, Project, FileItem } from '../types';

class ApiService {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
      this.refreshToken = localStorage.getItem('refreshToken');
    }
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.token = accessToken;
    this.refreshToken = refreshToken;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
    }
  }

  clearTokens() {
    this.token = null;
    this.refreshToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    }
  }

  private handleAuthError() {
    this.clearTokens();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  private async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken || this.isRefreshing) {
      throw new Error('No refresh token available or already refreshing');
    }

    this.isRefreshing = true;

    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.REFRESH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: this.refreshToken }),
      });

      if (!response.ok) {
        this.handleAuthError();
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.setTokens(data.access, this.refreshToken!);
      return data.access;
    } finally {
      this.isRefreshing = false;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const makeRequest = async (accessToken: string | null) => {
      const config: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
          ...options.headers,
        },
        ...options,
      };

      return fetch(`${API_BASE_URL}${endpoint}`, config);
    };

    let response = await makeRequest(this.token);

    if (response.status === 401 && this.refreshToken && !this.isRefreshing) {
      try {
        const newToken = await this.refreshAccessToken();
        response = await makeRequest(newToken);
      } catch (error) {
        this.handleAuthError();
        throw error;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 401) {
        this.handleAuthError();
      }
      
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>(API_ENDPOINTS.LOGIN, {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    this.setTokens(response.access, response.refresh);
    return response;
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      await this.request<void>(API_ENDPOINTS.LOGOUT, {
        method: 'POST',
        body: JSON.stringify({ refresh: refreshToken }),
      });
    } catch (error) {
      console.warn('Logout API call failed:', error);
    }
  }

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

  async downloadFile(fileId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/file-management/files/${fileId}/download/`, {
      headers: {
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
    });

    if (response.status === 401) {
      if (this.refreshToken && !this.isRefreshing) {
        try {
          const newToken = await this.refreshAccessToken();
          const retryResponse = await fetch(`${API_BASE_URL}/file-management/files/${fileId}/download/`, {
            headers: {
              Authorization: `Bearer ${newToken}`,
            },
          });
          
          if (!retryResponse.ok) {
            throw new Error('Download failed');
          }
          
          return retryResponse.blob();
        } catch (error) {
          this.handleAuthError();
          throw error;
        }
      } else {
        this.handleAuthError();
        throw new Error('Authentication failed');
      }
    }

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

  async getProjectTree(projectId: string): Promise<any> {
    return this.request<any>(`${API_ENDPOINTS.PROJECTS}${projectId}/tree/`);
  }

  async getVideoManifest(fileId: string): Promise<any> {
    return this.request<any>(`/media-preview/video/${fileId}/manifest/`);
  }

  getVideoStreamUrl(fileId: string): string {
    return `${API_BASE_URL}/media-preview/video/${fileId}/stream/`;
  }

  getVideoChunkUrl(fileId: string, chunkIndex: number): string {
    return `${API_BASE_URL}/media-preview/video/${fileId}/chunk/${chunkIndex}/`;
  }

  async getFilePreview(fileId: string): Promise<any> {
    return this.request<any>(`/media-preview/preview/${fileId}/preview/`);
  }

  async getArchiveContents(fileId: string): Promise<any> {
    return this.request<any>(`/media-preview/archive/${fileId}/contents/`);
  }

  async extractArchive(fileId: string, data: {
    target_project_id: string;
    target_folder_id?: string;
    create_subfolder: boolean;
  }): Promise<any> {
    return this.request<any>(`/media-preview/archive/${fileId}/extract/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiService = new ApiService();