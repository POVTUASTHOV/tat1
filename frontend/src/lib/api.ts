import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { LoginCredentials, LoginResponse, StorageStats, Project, FileItem } from '../types';
import { WorkflowRole, UserRole, FilePair, AssignmentBatch, Assignment, UserProfile, ProjectAnalytics, ActivityLog } from '../types/workflow';

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

  isAuthenticated(): boolean {
    return !!(this.token || (typeof window !== 'undefined' && localStorage.getItem('token')));
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

  public async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const makeRequest = async (accessToken: string | null) => {
      const config: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
          ...options.headers,
        },
        ...options,
      };

      try {
        return await fetch(`${API_BASE_URL}${endpoint}`, config);
      } catch (error) {
        // Handle network errors (server not running, no internet, etc.)
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          throw new Error(`Network Error: Cannot connect to backend server at ${API_BASE_URL}. Please ensure the Django backend is running on port 8000.`);
        }
        throw error;
      }
    };

    let response;
    try {
      response = await makeRequest(this.token);
    } catch (error) {
      // Re-throw network errors with better context
      throw error;
    }

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
      let errorMessage = `API Error: ${response.status}`;
      
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else {
          // Include the full error data for debugging 500 errors
          console.error('Full error response:', errorData);
          errorMessage = `API Error: ${response.status} ${response.statusText}`;
        }
      } catch (parseError) {
        // If JSON parsing fails, use status text as fallback
        errorMessage = `API Error: ${response.status} ${response.statusText}`;
        console.error('Failed to parse error response:', parseError);
      }
      
      if (response.status === 401) {
        this.handleAuthError();
      }
      
      throw new Error(errorMessage);
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

  async getProjectFiles(projectId: string, options?: {
    folderId?: string;
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<{ 
    files: FileItem[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  }> {
    let url = `${API_ENDPOINTS.LIST_FILES}?project_id=${projectId}`;
    if (options?.folderId) {
      url += `&folder_id=${options.folderId}`;
    }
    if (options?.page) {
      url += `&page=${options.page}`;
    }
    if (options?.pageSize) {
      url += `&page_size=${options.pageSize}`;
    }
    if (options?.search) {
      url += `&search=${encodeURIComponent(options.search)}`;
    }
    return this.request<{ 
      files: FileItem[];
      total: number;
      page: number;
      page_size: number;
      total_pages: number;
    }>(url);
  }

  async getFolderFiles(folderId: string, page: number = 1, pageSize: number = 40): Promise<{ 
    files: FileItem[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  }> {
    return this.request<{ 
      files: FileItem[];
      total: number;
      page: number;
      page_size: number;
      total_pages: number;
    }>(`${API_ENDPOINTS.LIST_FILES}?folder_id=${folderId}&page=${page}&page_size=${pageSize}`);
  }

  async getAllFiles(page: number = 1, pageSize: number = 40, search?: string): Promise<{ files: FileItem[]; total: number }> {
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

  async deleteFile(fileId: string): Promise<{ message: string; file_name: string }> {
    try {
      return await this.request<{ message: string; file_name: string }>(`/file-management/files/${fileId}/delete_file/`, {
        method: 'DELETE',
      });
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Failed to delete file';
      
      if (errorMessage.includes('Permission denied')) {
        errorMessage = 'Cannot delete file due to permission restrictions. Please contact administrator.';
      } else if (errorMessage.includes('File not found')) {
        errorMessage = 'File not found or already deleted.';
      } else if (errorMessage.includes('Error deleting file')) {
        errorMessage = 'File deletion failed. The file may be locked or in use.';
      }
      
      throw new Error(errorMessage);
    }
  }

  async deleteFiles(fileIds: string[]): Promise<{ deleted_files: any[]; failed_files: any[] }> {
    try {
      return await this.request<{ deleted_files: any[]; failed_files: any[] }>('/file-management/files/bulk_delete/', {
        method: 'DELETE',
        body: JSON.stringify({ file_ids: fileIds }),
      });
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Bulk delete failed';
      
      if (errorMessage.includes('Permission denied')) {
        errorMessage = 'Some files cannot be deleted due to permission restrictions.';
      }
      
      throw new Error(errorMessage);
    }
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

  async getProjectFolders(projectId: string, parentId?: string): Promise<any> {
    let url = `${API_ENDPOINTS.PROJECTS}${projectId}/folders/`;
    if (parentId) {
      url += `?parent_id=${parentId}`;
    }
    return this.request<any>(url);
  }

  async getFolderContents(folderId: string, page: number = 1, pageSize: number = 40): Promise<any> {
    return this.request<any>(`${API_ENDPOINTS.FOLDERS}${folderId}/contents/?page=${page}&page_size=${pageSize}`);
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

  async getArchiveContents(fileId: string, params?: string): Promise<any> {
    const url = params ? `/media-preview/archive/${fileId}/contents/?${params}` : `/media-preview/archive/${fileId}/contents/`;
    return this.request<any>(url);
  }

  async extractArchive(fileId: string, data: {
    target_project_id: string;
    target_folder_id?: string;
    create_subfolder: boolean;
    selected_files?: string[];
    max_files?: number;
  }): Promise<any> {
    return this.request<any>(`/media-preview/archive/${fileId}/extract/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getWorkflowRoles(): Promise<WorkflowRole[]> {
    return this.request<WorkflowRole[]>(API_ENDPOINTS.WORKFLOW_ROLES);
  }

  async createWorkflowRole(data: Partial<WorkflowRole>): Promise<WorkflowRole> {
    return this.request<WorkflowRole>(API_ENDPOINTS.WORKFLOW_ROLES, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getUserRoles(): Promise<UserRole[]> {
    return this.request<UserRole[]>(API_ENDPOINTS.WORKFLOW_USER_ROLES);
  }

  async assignUserRole(data: {
    user_id: string;
    role_name: string;
    project_id: string;
  }): Promise<UserRole> {
    return this.request<UserRole>(`${API_ENDPOINTS.WORKFLOW_USER_ROLES}assign_role/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getFilePairs(projectId?: string): Promise<FilePair[]> {
    let url = API_ENDPOINTS.WORKFLOW_FILE_PAIRS;
    if (projectId) {
      url += `?project_id=${projectId}`;
    }
    return this.request<FilePair[]>(url);
  }

  async autoCreateFilePairs(projectId: string, pairType: string = 'image_json'): Promise<{
    pairs_created: number;
    pairs: FilePair[];
  }> {
    return this.request<{ pairs_created: number; pairs: FilePair[] }>(
      `${API_ENDPOINTS.WORKFLOW_FILE_PAIRS}auto_pair/`,
      {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          pair_type: pairType,
        }),
      }
    );
  }

  async getAssignmentBatches(projectId?: string): Promise<AssignmentBatch[]> {
    let url = API_ENDPOINTS.WORKFLOW_BATCHES;
    if (projectId) {
      url += `?project_id=${projectId}`;
    }
    return this.request<AssignmentBatch[]>(url);
  }

  async createAssignmentBatch(data: {
    project_id: string;
    name: string;
    description: string;
    deadline?: string;
    priority: number;
    file_pair_ids: string[];
  }): Promise<AssignmentBatch> {
    return this.request<AssignmentBatch>(`${API_ENDPOINTS.WORKFLOW_BATCHES}create_batch/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async assignTasks(batchId: string, assignments: {
    user_id: string;
    file_pair_ids?: string[];
    pairs_count?: number;
  }[]): Promise<{
    assignments_created: number;
    assignments: Assignment[];
  }> {
    return this.request<{ assignments_created: number; assignments: Assignment[] }>(
      `${API_ENDPOINTS.WORKFLOW_BATCHES}${batchId}/assign_tasks/`,
      {
        method: 'POST',
        body: JSON.stringify({
          batch_id: batchId,
          assignments,
        }),
      }
    );
  }

  async getBatchProgress(batchId: string): Promise<{
    batch_id: string;
    total_assignments: number;
    completion_percentage: number;
    status_breakdown: Record<string, number>;
    estimated_completion_hours: number;
    deadline: string;
    is_overdue: boolean;
  }> {
    return this.request(`${API_ENDPOINTS.WORKFLOW_BATCHES}${batchId}/progress/`);
  }

  async getAssignments(params?: {
    batch_id?: string;
    status?: string;
    user_id?: string;
    project_id?: string;
  }): Promise<Assignment[]> {
    let url = API_ENDPOINTS.WORKFLOW_ASSIGNMENTS;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value) searchParams.append(key, value);
      });
      if (searchParams.toString()) {
        url += `?${searchParams.toString()}`;
      }
    }
    return this.request<Assignment[]>(url);
  }

  async getMyAssignments(status?: string): Promise<Assignment[]> {
    let url = `${API_ENDPOINTS.WORKFLOW_ASSIGNMENTS}my_assignments/`;
    if (status) {
      url += `?status=${status}`;
    }
    return this.request<Assignment[]>(url);
  }

  async downloadAssignmentPackage(assignmentId: string): Promise<Blob> {
    const response = await fetch(
      `${API_BASE_URL}${API_ENDPOINTS.WORKFLOW_ASSIGNMENTS}${assignmentId}/download_package/`,
      {
        method: 'POST',
        headers: {
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
      }
    );

    if (!response.ok) {
      throw new Error('Download failed');
    }

    return response.blob();
  }

  async updateAssignmentStatus(assignmentId: string, data: {
    status: string;
    notes?: string;
    quality_score?: number;
  }): Promise<Assignment> {
    return this.request<Assignment>(
      `${API_ENDPOINTS.WORKFLOW_ASSIGNMENTS}${assignmentId}/update_status/`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  async reviewAssignment(assignmentId: string, data: {
    status: 'approved' | 'rejected' | 'rework_needed';
    comments?: string;
    quality_rating?: number;
  }): Promise<Assignment> {
    return this.request<Assignment>(
      `${API_ENDPOINTS.WORKFLOW_ASSIGNMENTS}${assignmentId}/review/`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  async getAssignmentDashboard(): Promise<{
    status_breakdown: Record<string, number>;
    total_assignments: number;
    completed_assignments: number;
    average_quality_score: number;
    total_files_processed: number;
    recent_assignments: Assignment[];
  }> {
    return this.request(`${API_ENDPOINTS.WORKFLOW_ASSIGNMENTS}dashboard/`);
  }

  async getUserProfiles(): Promise<UserProfile[]> {
    return this.request<UserProfile[]>(API_ENDPOINTS.WORKFLOW_USER_PROFILES);
  }

  async getMyProfile(): Promise<UserProfile> {
    return this.request<UserProfile>(`${API_ENDPOINTS.WORKFLOW_USER_PROFILES}my_profile/`);
  }

  async updateUserProfile(profileId: string, data: Partial<UserProfile>): Promise<UserProfile> {
    return this.request<UserProfile>(`${API_ENDPOINTS.WORKFLOW_USER_PROFILES}${profileId}/`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getUserWorkloadReport(profileId: string, days: number = 30): Promise<{
    period_days: number;
    total_assignments: number;
    completed_assignments: number;
    total_files_processed: number;
    avg_quality_score: number;
    avg_processing_time_seconds: number;
    current_active_assignments: number;
  }> {
    return this.request(
      `${API_ENDPOINTS.WORKFLOW_USER_PROFILES}${profileId}/workload_report/?days=${days}`
    );
  }

  async getProjectOverview(projectId: string): Promise<ProjectAnalytics> {
    return this.request<ProjectAnalytics>(
      `${API_ENDPOINTS.WORKFLOW_ANALYTICS}project_overview/?project_id=${projectId}`
    );
  }

  async getWorkloadBalance(projectId: string): Promise<{
    overloaded_users: any[];
    underloaded_users: any[];
    recommended_transfers: any[];
  }> {
    return this.request(
      `${API_ENDPOINTS.WORKFLOW_ANALYTICS}workload_balance/?project_id=${projectId}`
    );
  }

  async getTeamPerformance(projectId: string, days: number = 30): Promise<{
    project_name: string;
    period_days: number;
    team_performance: any[];
  }> {
    return this.request(
      `${API_ENDPOINTS.WORKFLOW_ANALYTICS}team_performance/?project_id=${projectId}&days=${days}`
    );
  }

  async getActivityLogs(params?: {
    user_id?: string;
    project_id?: string;
    action?: string;
    resource_type?: string;
  }): Promise<ActivityLog[]> {
    let url = API_ENDPOINTS.WORKFLOW_ACTIVITY_LOGS;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value) searchParams.append(key, value);
      });
      if (searchParams.toString()) {
        url += `?${searchParams.toString()}`;
      }
    }
    return this.request<ActivityLog[]>(url);
  }

  // User role management methods
  async getUserAvailableRoles(userId: string): Promise<{
    current_role: string;
    promotable_roles: string[];
    demotable_roles: string[];
    can_change_role: boolean;
  }> {
    return this.request(`/users/users/${userId}/available_roles/`);
  }

  async changeUserRole(userId: string, role: string): Promise<{
    message: string;
    user: {
      id: string;
      username: string;
      old_role: string;
      new_role: string;
      action_type: string;
    };
  }> {
    return this.request(`/users/users/${userId}/change_role/`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  }
}

export const apiService = new ApiService();