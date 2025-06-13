'use client';

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Upload, FolderPlus, Search, Trash2, Eye, Archive, Video, Check, AlertCircle, Cpu, Zap, Filter, SortAsc, SortDesc, Folder, ChevronRight, Home } from 'lucide-react';
import Button from '../../../../components/ui/Button';
import FileActions from '../../../../components/ui/FileActions';
import FilePreviewModal from '../../../../components/ui/FilePreviewModal';
import ArchivePreviewModal from '../../../../components/ui/ArchivePreviewModal';
import { apiService } from '../../../../lib/api';
import { Project, FileItem } from '../../../../types';
import { formatFileSize, formatDate } from '../../../../lib/utils';

// Types for video processing
interface VideoProcessingStatus {
  file_id: string;
  processing: boolean;
  content_type: string;
  size: number;
  name: string;
  video_processing_available: boolean;
}

// Types for folder navigation
interface FolderItem {
  id: string;
  name: string;
  path: string;
  parent?: string;
  files_count: number;
  subfolders_count: number;
}

interface BreadcrumbItem {
  id: string;
  name: string;
  path: string;
  type?: 'project' | 'folder';
}

// Memoized File Row Component for Performance
const FileRow = memo(({ 
  file, 
  isSelected, 
  onSelect, 
  onPreview, 
  onDelete, 
  onDownload, 
  processingStatus,
  renderProcessingBadge,
  isArchive,
  isPreviewable 
}: {
  file: FileItem;
  isSelected: boolean;
  onSelect: (fileId: string, event: React.MouseEvent) => void;
  onPreview: (file: FileItem, event: React.MouseEvent) => void;
  onDelete: () => void;
  onDownload: (fileId: string, fileName: string) => void;
  processingStatus?: VideoProcessingStatus;
  renderProcessingBadge: (file: FileItem) => React.ReactNode;
  isArchive: boolean;
  isPreviewable: boolean;
}) => (
  <tr 
    key={file.id} 
    className="hover:bg-gray-50 cursor-pointer"
    onClick={(e) => onSelect(file.id, e)}
  >
    <td className="px-6 py-4 whitespace-nowrap">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => {}}
        onClick={(e) => e.stopPropagation()}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
    </td>
    <td className="px-6 py-4 whitespace-nowrap">
      <div className="flex items-center">
        <div className="flex-1">
          <div className="flex items-center">
            <span className="text-sm font-medium text-gray-900">{file.name}</span>
            {renderProcessingBadge(file)}
          </div>
          <div className="text-sm text-gray-500">{file.file_path}</div>
          {processingStatus?.processing && (
            <div className="text-xs text-yellow-600 mt-1 flex items-center">
              <div className="animate-spin rounded-full h-3 w-3 border-b border-yellow-600 mr-1"></div>
              Converting to H.264 for optimal playback...
            </div>
          )}
        </div>
      </div>
    </td>
    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
      {file.size_formatted}
    </td>
    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
      <div className="flex items-center">
        <span>{file.content_type}</span>
        {file.content_type.startsWith('video/') && (
          <Video className="w-4 h-4 ml-2 text-purple-500" />
        )}
      </div>
    </td>
    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
      {formatDate(file.uploaded_at)}
    </td>
    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
      <div onClick={(e) => e.stopPropagation()} className="flex items-center space-x-1">
        {isArchive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => onPreview(file, e)}
            title="View archive contents"
            className="bg-orange-100 text-orange-600 hover:bg-orange-200"
          >
            <Archive className="w-4 h-4" />
          </Button>
        )}
        
        {isPreviewable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => onPreview(file, e)}
            title="Preview file"
            className="bg-blue-100 text-blue-600 hover:bg-blue-200"
          >
            <Eye className="w-4 h-4" />
          </Button>
        )}
        
        <FileActions
          fileId={file.id}
          fileName={file.name}
          contentType={file.content_type}
          onDownload={() => onDownload(file.id, file.name)}
          onDelete={onDelete}
          onPreviewComplete={() => {}}
        />
      </div>
    </td>
  </tr>
));

FileRow.displayName = 'FileRow';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  
  // Performance monitoring in development
  if (process.env.NODE_ENV === 'development') {
    console.log('ProjectDetailPage render', { 
      projectId, 
      timestamp: new Date().toISOString() 
    });
  }
  
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showArchivePreview, setShowArchivePreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [processingStatuses, setProcessingStatuses] = useState<Record<string, VideoProcessingStatus>>({});
  const [pagination, setPagination] = useState({
    currentPage: 1,
    pageSize: 20, // Reduced from 50 to 20 for better performance
    totalPages: 1,
    total: 0,
    hasMorePages: false
  });
  const [viewMode, setViewMode] = useState<'paginated' | 'infinite'>('infinite');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date' | 'type'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterType, setFilterType] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load data when projectId, currentFolderId, or search changes
  useEffect(() => {
    if (projectId) {
      const controller = new AbortController();
      
      setPagination(prev => ({ ...prev, currentPage: 1 }));
      setFiles([]);
      setFolders([]);
      
      // Use a local async function to avoid dependency issues
      const loadData = async () => {
        if (controller.signal.aborted) return;
        
        try {
          if (!isLoading && !isLoadingMore) {
            setIsLoading(true);
            
            const [projectResponse, filesResponse, foldersResponse, breadcrumbResponse] = await Promise.all([
              apiService.getProjects(),
              apiService.getProjectFiles(projectId, {
                folderId: currentFolderId || undefined,
                page: 1,
                pageSize: pagination.pageSize,
                search: debouncedSearchTerm || undefined
              }),
              // Get folders in current directory
              fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storage/projects/${projectId}/folders/?${currentFolderId ? `parent_id=${currentFolderId}` : ''}`, {
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('token')}`,
                }
              }).then(res => res.json()).catch(() => ({ data: [] })),
              // Get breadcrumbs if in a folder
              currentFolderId ? 
                fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storage/folders/${currentFolderId}/breadcrumb/`, {
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                  }
                }).then(res => res.json()).catch(() => []) : 
                Promise.resolve([])
            ]);
            
            // Warn user about large directories
            if (filesResponse.total > 5000 && !debouncedSearchTerm) {
              console.warn(`Large directory detected: ${filesResponse.total} files. Consider using search to filter results.`);
            }
            
            if (controller.signal.aborted) return;
            
            const currentProject = projectResponse.projects.find(p => p.id === projectId);
            setProject(currentProject || null);
            setFiles(filesResponse.files);
            setFolders(Array.isArray(foldersResponse) ? foldersResponse : (foldersResponse.data || []));
            
            // Set breadcrumbs
            if (currentFolderId && Array.isArray(breadcrumbResponse)) {
              setBreadcrumbs(breadcrumbResponse);
            } else {
              setBreadcrumbs([{
                id: projectId,
                name: currentProject?.name || 'Project',
                path: '',
                type: 'project'
              }]);
            }

            setPagination({
              currentPage: filesResponse.page,
              pageSize: filesResponse.page_size,
              totalPages: filesResponse.total_pages,
              total: filesResponse.total,
              hasMorePages: filesResponse.page < filesResponse.total_pages
            });

            // Auto-switch to paginated view for very large directories
            if (filesResponse.total > 10000 && !debouncedSearchTerm && viewMode === 'infinite') {
              console.log(`Auto-switching to paginated view for performance (${filesResponse.total} files)`);
              setViewMode('paginated');
            }

            // Optimized video processing check
            const videoFiles = filesResponse.files.filter(file => file.content_type.startsWith('video/'));
            videoFiles.forEach((file, index) => {
              setTimeout(() => {
                if (!controller.signal.aborted) {
                  checkVideoProcessingStatus(file.id);
                }
              }, index * 100);
            });
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            console.error('Failed to load project data:', error);
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        }
      };
      
      loadData();
      
      return () => {
        controller.abort();
      };
    }
  }, [projectId, currentFolderId, debouncedSearchTerm]);

  const loadProjectData = useCallback(async (page = 1, search = '', append = false, folderId = currentFolderId) => {
    // Prevent duplicate calls
    if ((append && isLoadingMore) || (!append && isLoading)) {
      return;
    }

    try {
      if (!append) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      const [projectResponse, filesResponse] = await Promise.all([
        apiService.getProjects(),
        apiService.getProjectFiles(projectId, {
          folderId: folderId || undefined,
          page,
          pageSize: pagination.pageSize,
          search: search || undefined
        })
      ]);
      
      const currentProject = projectResponse.projects.find(p => p.id === projectId);
      setProject(currentProject || null);
      
      if (append) {
        setFiles(prev => [...prev, ...filesResponse.files]);
      } else {
        setFiles(filesResponse.files);
      }

      setPagination({
        currentPage: filesResponse.page,
        pageSize: filesResponse.page_size,
        totalPages: filesResponse.total_pages,
        total: filesResponse.total,
        hasMorePages: filesResponse.page < filesResponse.total_pages
      });

      // Optimized video processing check - only for new files
      const videoFiles = filesResponse.files.filter(file => file.content_type.startsWith('video/'));
      videoFiles.forEach(file => {
        // Use setTimeout to prevent blocking the main thread
        setTimeout(() => checkVideoProcessingStatus(file.id), 100);
      });
    } catch (error) {
      console.error('Failed to load project data:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [projectId, currentFolderId]);

  const loadMoreFiles = useCallback(async () => {
    if (pagination.hasMorePages && !isLoadingMore) {
      await loadProjectData(pagination.currentPage + 1, debouncedSearchTerm, true);
    }
  }, [pagination.currentPage, pagination.hasMorePages, isLoadingMore, debouncedSearchTerm, loadProjectData]);

  // Navigation functions
  const handleFolderClick = useCallback((folderId: string) => {
    setCurrentFolderId(folderId);
    setSelectedFiles([]);
  }, []);

  const handleBreadcrumbClick = useCallback((breadcrumb: BreadcrumbItem) => {
    if (breadcrumb.type === 'project') {
      setCurrentFolderId(null);
    } else {
      setCurrentFolderId(breadcrumb.id);
    }
    setSelectedFiles([]);
  }, []);

  const handleBackToParent = useCallback(() => {
    if (breadcrumbs.length > 1) {
      const parentBreadcrumb = breadcrumbs[breadcrumbs.length - 2];
      handleBreadcrumbClick(parentBreadcrumb);
    }
  }, [breadcrumbs, handleBreadcrumbClick]);

  // Intersection Observer for infinite scrolling with safety limits
  useEffect(() => {
    if (viewMode !== 'infinite' || !loadMoreRef.current || isLoadingMore || !pagination.hasMorePages) {
      return;
    }

    // Safety limit: Don't auto-load more if we already have too many files displayed
    if (files.length >= 1000) {
      console.log('Reached display limit of 1000 files. Switch to paginated view for better performance.');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && pagination.hasMorePages && !isLoadingMore && files.length < 1000) {
          loadMoreFiles();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    observer.observe(currentRef);
    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
      observer.disconnect();
    };
  }, [pagination.hasMorePages, isLoadingMore, viewMode, loadMoreFiles, files.length]);

  const goToPage = useCallback(async (page: number) => {
    if (page >= 1 && page <= pagination.totalPages && !isLoading) {
      setFiles([]);
      await loadProjectData(page, debouncedSearchTerm, false, currentFolderId);
    }
  }, [pagination.totalPages, debouncedSearchTerm, loadProjectData, isLoading, currentFolderId]);

  // Function để check processing status (memoized to prevent recreation)
  const checkVideoProcessingStatus = useCallback(async (fileId: string) => {
    try {
      const response = await fetch(`http://localhost:8001/api/video/processing-status/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const status = await response.json();
        setProcessingStatuses(prev => ({
          ...prev,
          [fileId]: status
        }));
        
        // Continue polling if processing (with increased interval to reduce load)
        if (status.processing) {
          setTimeout(() => checkVideoProcessingStatus(fileId), 10000); // Increased from 5s to 10s
        }
      }
    } catch (error) {
      console.error('Failed to check processing status:', error);
    }
  }, []);

  // Function để render processing status badge (memoized)
  const renderProcessingBadge = useCallback((file: FileItem) => {
    if (!file.content_type.startsWith('video/')) return null;
    
    const status = processingStatuses[file.id];
    if (!status) {
      // Default checking status for video files
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 ml-2">
          <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-600 mr-1"></div>
          Checking...
        </span>
      );
    }

    if (status.processing) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 ml-2">
          <Video className="w-3 h-3 mr-1 animate-pulse" />
          Converting...
        </span>
      );
    }

    if (status.video_processing_available && file.content_type === 'video/mp4') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
          <Check className="w-3 h-3 mr-1" />
          H.264
        </span>
      );
    }

    if (!status.video_processing_available) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 ml-2">
          <AlertCircle className="w-3 h-3 mr-1" />
          Original
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 ml-2">
        <Video className="w-3 h-3 mr-1" />
        Video
      </span>
    );
  }, [processingStatuses]);

  // Files are already filtered by the backend API
  const filteredFiles = useMemo(() => files, [files]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  // Get unique file types for filter
  const fileTypes = useMemo(() => {
    const types = new Set<string>();
    files.forEach(file => {
      const type = file.content_type.split('/')[0];
      types.add(type);
    });
    return Array.from(types).sort();
  }, [files]);

  const handleSelectFile = useCallback((fileId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedFiles(
      selectedFiles.length === filteredFiles.length
        ? []
        : filteredFiles.map(file => file.id)
    );
  }, [selectedFiles.length, filteredFiles]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    
    if (confirm(`Delete ${selectedFiles.length} selected files?`)) {
      try {
        await apiService.deleteFiles(selectedFiles);
        // Reset to first page and reload
        setPagination(prev => ({ ...prev, currentPage: 1 }));
        setFiles([]);
        await loadProjectData(1, debouncedSearchTerm, false, currentFolderId);
        setSelectedFiles([]);
      } catch (error) {
        console.error('Failed to delete files:', error);
      }
    }
  }, [selectedFiles, loadProjectData, debouncedSearchTerm]);

  const handleDownloadFile = useCallback(async (fileId: string, fileName: string) => {
    try {
      const blob = await apiService.downloadFile(fileId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  }, []);

  const isPreviewable = useCallback((contentType: string) => {
    return contentType.startsWith('image/') ||
           contentType.startsWith('video/') ||
           contentType.startsWith('audio/') ||
           contentType.startsWith('text/') ||
           contentType === 'application/json' ||
           contentType === 'text/csv' ||
           contentType === 'application/pdf';
  }, []);

  const isArchive = useCallback((fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return ['zip', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(extension || '');
  }, []);

  const handlePreviewClick = useCallback((file: FileItem, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    setSelectedFile(file);
    
    if (isArchive(file.name)) {
      setShowArchivePreview(true);
    } else if (isPreviewable(file.content_type)) {
      setShowPreview(true);
    } else {
      handleDownloadFile(file.id, file.name);
    }
  }, [isArchive, isPreviewable, handleDownloadFile]);

  // Get video processing summary (memoized)
  const getVideoProcessingSummary = useMemo(() => {
    const videoFiles = files.filter(f => f.content_type.startsWith('video/'));
    if (videoFiles.length === 0) return null;

    const processing = Object.values(processingStatuses).filter(s => s.processing).length;
    const converted = videoFiles.filter(f => f.content_type === 'video/mp4').length;
    
    return {
      total: videoFiles.length,
      processing,
      converted,
      pending: videoFiles.length - processing - converted
    };
  }, [files, processingStatuses]);

  const videoSummary = getVideoProcessingSummary;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium text-gray-900">Project not found</h2>
        <p className="text-gray-500 mt-2">The project you're looking for doesn't exist.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-gray-600 mt-1">{project.description || 'No description'}</p>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <Button variant="outline">
            <FolderPlus className="w-4 h-4 mr-2" />
            New Folder
          </Button>
          <Button onClick={() => window.location.href = '/dashboard/upload'}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Files
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total Files</div>
          <div className="text-2xl font-bold text-gray-900">{project.files_count}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total Size</div>
          <div className="text-2xl font-bold text-gray-900">{project.total_size_formatted}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Folders</div>
          <div className="text-2xl font-bold text-gray-900">{project.folders_count}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Last Updated</div>
          <div className="text-lg font-medium text-gray-900">{formatDate(project.updated_at)}</div>
        </div>
      </div>

      {/* Video Processing Summary */}
      {videoSummary && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg shadow p-6 border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Video Processing Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{videoSummary.total}</div>
                  <div className="text-sm text-gray-600">Total Videos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{videoSummary.converted}</div>
                  <div className="text-sm text-gray-600">H.264 Ready</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{videoSummary.processing}</div>
                  <div className="text-sm text-gray-600">Converting</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{videoSummary.pending}</div>
                  <div className="text-sm text-gray-600">Original Format</div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-600">GPU Acceleration Active</span>
              </div>
              <p className="text-xs text-gray-500">
                Videos are automatically converted to H.264 for optimal web playback
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb Navigation */}
      {breadcrumbs.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleBreadcrumbClick(breadcrumbs[0])}
              className="text-blue-600 hover:bg-blue-50"
            >
              <Home className="w-4 h-4 mr-1" />
              {breadcrumbs[0].name}
            </Button>
            
            {breadcrumbs.slice(1).map((breadcrumb, index) => (
              <div key={breadcrumb.id} className="flex items-center space-x-2">
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleBreadcrumbClick(breadcrumb)}
                  className="text-blue-600 hover:bg-blue-50"
                >
                  {breadcrumb.name}
                </Button>
              </div>
            ))}
            
            {breadcrumbs.length > 1 && (
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackToParent}
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Folders Display */}
      {folders.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Folders</h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer hover:bg-gray-50"
                  onClick={() => handleFolderClick(folder.id)}
                >
                  <div className="text-center">
                    <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <Folder className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 truncate" title={folder.name}>
                      {folder.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {folder.files_count} files, {folder.subfolders_count} folders
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Performance Warning for Large Directories */}
      {pagination.total > 5000 && !debouncedSearchTerm && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-center space-x-3">
          <div className="flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-orange-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-orange-800">
              Large Directory Detected ({pagination.total.toLocaleString()} files)
            </h3>
            <p className="text-sm text-orange-700 mt-1">
              For better performance, consider using the search filter or switch to paginated view.
              {viewMode === 'infinite' && files.length >= 1000 && ' Infinite scroll is limited to 1000 files.'}
            </p>
          </div>
          {viewMode === 'infinite' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode('paginated')}
              className="flex-shrink-0"
            >
              Switch to Paginated
            </Button>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="space-y-4">
            {/* Files Section Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Files {currentFolderId ? 'in Current Folder' : 'in Project Root'}
              </h3>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search files..."
                      value={searchTerm}
                      onChange={handleSearchChange}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  {/* Filter Toggle */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className={showFilters ? 'bg-blue-50 border-blue-300' : ''}
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    Filters
                  </Button>
                </div>
                
                {selectedFiles.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteSelected}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete ({selectedFiles.length})
                  </Button>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* View Mode Toggle */}
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-700">View:</span>
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as 'paginated' | 'infinite')}
                  className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="infinite">Infinite Scroll</option>
                  <option value="paginated">Paginated</option>
                </select>
              </div>

              {/* Results Info */}
              <div className="text-sm text-gray-500">
                {pagination.total > 0 && (
                  <>
                    Showing {files.length} of {pagination.total} files
                    {debouncedSearchTerm && ` for "${debouncedSearchTerm}"`}
                    {pagination.total > 5000 && !debouncedSearchTerm && (
                      <span className="text-orange-600 ml-2">
                        ⚠️ Large directory - consider using search filter
                      </span>
                    )}
                  </>
                )}
              </div>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedFiles.length === filteredFiles.length && filteredFiles.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Select All</span>
              </label>
            </div>
            
            {/* Advanced Filters */}
            {showFilters && (
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Type:</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Types</option>
                    <option value="image">Images</option>
                    <option value="video">Videos</option>
                    <option value="audio">Audio</option>
                    <option value="text">Text</option>
                    <option value="application">Documents</option>
                    {fileTypes.map(type => (
                      <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Sort by:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="date">Date Modified</option>
                    <option value="name">Name</option>
                    <option value="size">Size</option>
                    <option value="type">Type</option>
                  </select>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center"
                >
                  {sortOrder === 'asc' ? (
                    <SortAsc className="w-4 h-4" />
                  ) : (
                    <SortDesc className="w-4 h-4" />
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedFiles.length === filteredFiles.length && filteredFiles.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Modified
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredFiles.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  isSelected={selectedFiles.includes(file.id)}
                  onSelect={handleSelectFile}
                  onPreview={handlePreviewClick}
                  onDownload={handleDownloadFile}
                  onDelete={async () => {
                    if (confirm(`Delete ${file.name}?`)) {
                      try {
                        await apiService.deleteFile(file.id);
                        // Reset to first page after deletion
                        setPagination(prev => ({ ...prev, currentPage: 1 }));
                        setFiles([]);
                        await loadProjectData(1, debouncedSearchTerm, false, currentFolderId);
                      } catch (error) {
                        console.error('Failed to delete file:', error);
                      }
                    }
                  }}
                  processingStatus={processingStatuses[file.id]}
                  renderProcessingBadge={renderProcessingBadge}
                  isArchive={isArchive(file.name)}
                  isPreviewable={isPreviewable(file.content_type)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Loading More Indicator for Infinite Scroll */}
        {viewMode === 'infinite' && pagination.hasMorePages && (
          <div 
            ref={loadMoreRef}
            className="flex items-center justify-center py-8"
          >
            {files.length >= 1000 ? (
              <div className="text-center">
                <p className="text-orange-600 mb-2">📊 Performance Limit Reached</p>
                <p className="text-sm text-gray-600 mb-4">
                  Showing 1000 files for optimal performance. {pagination.total - files.length} more available.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => setViewMode('paginated')}
                >
                  Switch to Paginated View
                </Button>
              </div>
            ) : isLoadingMore ? (
              <div className="flex items-center space-x-2 text-gray-500">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span>Loading more files...</span>
              </div>
            ) : (
              <Button 
                variant="outline" 
                onClick={loadMoreFiles}
                disabled={isLoadingMore}
              >
                Load More Files ({pagination.total - files.length} remaining)
              </Button>
            )}
          </div>
        )}

        {/* Pagination Controls for Paginated View */}
        {viewMode === 'paginated' && pagination.totalPages > 1 && (
          <div className="bg-white px-6 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Page {pagination.currentPage} of {pagination.totalPages} 
              ({pagination.total} total files)
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(pagination.currentPage - 1)}
                disabled={pagination.currentPage <= 1 || isLoading}
              >
                Previous
              </Button>
              
              {/* Page Numbers */}
              <div className="flex space-x-1">
                {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                  let pageNum;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else {
                    const start = Math.max(1, pagination.currentPage - 2);
                    const end = Math.min(pagination.totalPages, start + 4);
                    pageNum = start + i;
                    if (pageNum > end) return null;
                  }
                  
                  return (
                    <Button
                      key={pageNum}
                      variant={pagination.currentPage === pageNum ? "primary" : "outline"}
                      size="sm"
                      onClick={() => goToPage(pageNum)}
                      disabled={isLoading}
                      className="w-8 h-8 p-0"
                    >
                      {pageNum}
                    </Button>
                  );
                }).filter(Boolean)}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(pagination.currentPage + 1)}
                disabled={pagination.currentPage >= pagination.totalPages || isLoading}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {filteredFiles.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <div className="text-gray-500">
              {debouncedSearchTerm ? `No files found matching "${debouncedSearchTerm}"` : 
               currentFolderId ? 'No files found in this folder' : 'No files found in this project'}
            </div>
          </div>
        )}
      </div>

      {showPreview && selectedFile && (
        <FilePreviewModal
          isOpen={showPreview}
          onClose={() => {
            setShowPreview(false);
            setSelectedFile(null);
          }}
          fileId={selectedFile.id}
          fileName={selectedFile.name}
          contentType={selectedFile.content_type}
        />
      )}

      {showArchivePreview && selectedFile && (
        <ArchivePreviewModal
          isOpen={showArchivePreview}
          onClose={() => {
            setShowArchivePreview(false);
            setSelectedFile(null);
          }}
          fileId={selectedFile.id}
          fileName={selectedFile.name}
          onExtractComplete={() => {
            setShowArchivePreview(false);
            setSelectedFile(null);
            // Reset to first page to see newly extracted files
            setPagination(prev => ({ ...prev, currentPage: 1 }));
            setFiles([]);
            // Small delay to ensure database transaction is committed
            setTimeout(() => {
              loadProjectData(1, debouncedSearchTerm, false, currentFolderId);
            }, 500);
          }}
        />
      )}
    </div>
  );
}