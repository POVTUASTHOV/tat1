export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  storage_quota: number;
  storage_used: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  files_count: number;
  folders_count: number;
  total_size: number;
  total_size_formatted: string;
  created_at: string;
  updated_at: string;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  content_type: string;
  project: string;
  project_name: string;
  folder: string | null;
  folder_name: string | null;
  uploaded_at: string;
  size_formatted: string;
  file_path: string;
}

export interface StorageStats {
  storage: {
    used: number;
    quota: number;
    available: number;
    percentage: number;
    used_formatted: string;
    quota_formatted: string;
    available_formatted: string;
  };
  overview: {
    total_files: number;
    total_folders: number;
    total_projects: number;
    file_types: Record<string, { count: number; size: number }>;
  };
  projects: Project[];
}
