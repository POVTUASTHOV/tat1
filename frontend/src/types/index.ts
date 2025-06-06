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

// Video streaming types
export interface VideoManifest {
  file_id: string;
  file_name: string;
  file_size: number;
  chunk_size: number;
  total_chunks: number;
  content_type: string;
  stream_url: string;
  requires_chunked_loading: boolean;
  recommended_quality: string;
  chunks: VideoChunk[];
}

export interface VideoChunk {
  index: number;
  start: number;
  end: number;
  url: string;
}

export interface BufferSegment {
  start: number;
  end: number;
  data: ArrayBuffer;
}

// Preview types
export interface PreviewData {
  type: 'image' | 'video' | 'audio' | 'text' | 'pdf';
  content_type: string;
  size: number;
  size_formatted?: string;
  duration_estimate?: number;
  stream_url?: string;
  manifest_url?: string;
  supports_streaming?: boolean;
  requires_chunked_loading?: boolean;
  recommended_quality?: string;
  
  // Image specific
  width?: number;
  height?: number;
  format?: string;
  mode?: string;
  
  // Text specific
  content?: string;
  lines?: number;
  truncated?: boolean;
  
  // PDF specific
  download_url?: string;
  message?: string;
}

// Archive types
export interface ArchiveContent {
  name: string;
  size: number;
  compressed_size: number;
  date_time: any;
  is_dir: boolean;
}

export interface ArchiveData {
  archive_type: string;
  total_files: number;
  contents: ArchiveContent[];
}