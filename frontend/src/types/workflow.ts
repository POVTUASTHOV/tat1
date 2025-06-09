export interface WorkflowRole {
  id: string;
  name: 'admin' | 'manager' | 'employee';
  description: string;
  permissions: Record<string, boolean>;
  created_at: string;
}

export interface UserRole {
  id: string;
  user: string;
  role: string;
  role_name: string;
  project: string;
  project_name: string;
  assigned_by: string;
  assigned_by_name: string;
  assigned_at: string;
  is_active: boolean;
}

export interface FilePair {
  id: string;
  primary_file: string;
  secondary_file: string;
  primary_file_data: {
    id: string;
    name: string;
  };
  secondary_file_data: {
    id: string;
    name: string;
  };
  pair_type: string;
  project: string;
  status: 'pending' | 'paired' | 'error';
  metadata: Record<string, any>;
  created_at: string;
}

export interface AssignmentBatch {
  id: string;
  project: string;
  project_name: string;
  manager: string;
  manager_name: string;
  name: string;
  description: string;
  total_pairs: number;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  deadline: string;
  priority: number;
  completion_percentage: number;
  total_files: number;
  assignments_count: number;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  batch: string;
  batch_name: string;
  user: string;
  user_name: string;
  total_pairs: number;
  total_files: number;
  status: 'pending' | 'assigned' | 'downloaded' | 'in_progress' | 'completed' | 'reviewed' | 'approved' | 'rejected';
  zip_path: string;
  downloaded_at: string;
  started_at: string;
  completed_at: string;
  reviewed_at: string;
  reviewer: string;
  reviewer_name: string;
  notes: string;
  quality_score: number;
  completion_percentage: number;
  estimated_completion_time: number;
  assignment_files: AssignmentFile[];
  created_at: string;
  updated_at: string;
}

export interface AssignmentFile {
  id: string;
  assignment: string;
  file_pair: string;
  file_pair_data: FilePair;
  status: 'pending' | 'assigned' | 'downloaded' | 'processed' | 'completed' | 'error';
  downloaded_at: string;
  processed_at: string;
  completed_at: string;
  processing_time_seconds: number;
  notes: string;
  error_message: string;
}

export interface UserProfile {
  user: string;
  username: string;
  processing_speed: number;
  skill_tags: string[];
  avg_processing_time: number;
  working_hours_start: string;
  working_hours_end: string;
  timezone: string;
  availability_status: string;
  max_concurrent_assignments: number;
  quality_average: number;
  total_files_processed: number;
  current_workload: number;
  capacity_percentage: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectAnalytics {
  project_name: string;
  total_batches: number;
  total_assignments: number;
  batch_status_breakdown: Record<string, number>;
  assignment_status_breakdown: Record<string, number>;
  average_quality_score: number;
  completion_rate: number;
  user_workloads: Record<string, {
    active_assignments: number;
    total_files: number;
  }>;
}

export interface ActivityLog {
  id: string;
  user: string;
  user_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  project: string;
  project_name: string;
  details: Record<string, any>;
  ip_address: string;
  user_agent: string;
  timestamp: string;
}