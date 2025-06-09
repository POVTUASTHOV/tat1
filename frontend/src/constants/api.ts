export const API_BASE_URL = 'http://localhost:8000';

export const API_ENDPOINTS = {
  LOGIN: '/users/login/',
  REFRESH: '/users/refresh/',
  LOGOUT: '/users/logout/',
  PROFILE: '/users/profile/',
  STORAGE_STATS: '/file-management/files/storage_stats/',
  PROJECTS_LIST: '/file-management/files/projects_list/',
  ALL_FILES: '/file-management/files/all_files/',
  LIST_FILES: '/file-management/files/list_files/',
  PROJECTS: '/storage/projects/',
  FOLDERS: '/storage/folders/',
  FILES: '/storage/files/',
  MEDIA_PREVIEW: '/media-preview/preview/',
  VIDEO_STREAMING: '/media-preview/video/',
  ARCHIVE_PREVIEW: '/media-preview/archive/',
  
  WORKFLOW_ROLES: '/workflow/roles/',
  WORKFLOW_USER_ROLES: '/workflow/user-roles/',
  WORKFLOW_FILE_PAIRS: '/workflow/file-pairs/',
  WORKFLOW_BATCHES: '/workflow/batches/',
  WORKFLOW_ASSIGNMENTS: '/workflow/assignments/',
  WORKFLOW_USER_PROFILES: '/workflow/user-profiles/',
  WORKFLOW_ANALYTICS: '/workflow/analytics/',
  WORKFLOW_ACTIVITY_LOGS: '/workflow/activity-logs/',
} as const;