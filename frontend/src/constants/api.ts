export const API_BASE_URL = 'http://localhost:8000';

export const API_ENDPOINTS = {
  // Auth
  LOGIN: '/users/login/',
  REFRESH: '/users/refresh/',
  LOGOUT: '/users/logout/',
  
  // User
  PROFILE: '/users/profile/',
  
  // File Management
  STORAGE_STATS: '/file-management/files/storage_stats/',
  PROJECTS_LIST: '/file-management/files/projects_list/',
  ALL_FILES: '/file-management/files/all_files/',
  LIST_FILES: '/file-management/files/list_files/',
  
  // Storage
  PROJECTS: '/storage/projects/',
  FOLDERS: '/storage/folders/',
  FILES: '/storage/files/',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;