'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, FolderOpen, FileText, MoreVertical, Edit, Trash2, ChevronRight, ChevronDown, Upload, FolderPlus, Loader, Grid3X3, List } from 'lucide-react';
import Button from '../../../components/ui/Button';
import FileActions from '../../../components/ui/FileActions';
import FilePreviewModal from '../../../components/ui/FilePreviewModal';
import ArchivePreviewModal from '../../../components/ui/ArchivePreviewModal';
import UploadModal from '../../../components/ui/UploadModal';
import { apiService } from '../../../lib/api';
import { Project } from '../../../types';
import { formatFileSize } from '../../../lib/utils';
import { useToastStore } from '../../../stores/toastStore';
import FileIcon from '../../../components/ui/FileIcon';
import Pagination from '../../../components/ui/Pagination';
import VerticalBreadcrumb from '../../../components/ui/VerticalBreadcrumb';
import AddressBar from '../../../components/ui/AddressBar';

interface FolderNode {
  id: string;
  name: string;
  children: FolderNode[];
  files: any[];
  isExpanded: boolean;
  isLoading: boolean;
  hasChildren: boolean;
  parent_id?: string;
  // Pagination state for files
  currentPage: number;
  totalPages: number;
  totalFiles: number;
  hasMoreFiles: boolean;
  isLoadingMoreFiles: boolean;
}

interface ProjectTree extends Project {
  folders: FolderNode[];
  rootFiles: any[];
  isExpanded: boolean;
  // Root files pagination
  rootFilesCurrentPage: number;
  rootFilesTotalPages: number;
  rootFilesTotalCount: number;
  rootFilesHasMore: boolean;
  rootFilesLoading: boolean;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectTree[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProjects, setTotalProjects] = useState(0);
  const PAGE_SIZE = 50;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedProjectForFolder, setSelectedProjectForFolder] = useState<string>('');
  const [selectedParentFolder, setSelectedParentFolder] = useState<string>('');
  const [uploadTarget, setUploadTarget] = useState<{
    projectId: string;
    projectName: string;
    folderId?: string;
    folderName?: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showArchivePreview, setShowArchivePreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  
  // Breadcrumb navigation state
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{
    id: string;
    name: string;
    type: 'project' | 'folder';
    projectId?: string;
  }>>([]);

  // Address bar navigation state
  const [currentAddressPath, setCurrentAddressPath] = useState<string>('/');

  useEffect(() => {
    loadProjects();
  }, [currentPage, searchTerm]);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getProjects();
      let allProjects = response.projects || [];
      
      // Apply search filter
      if (searchTerm) {
        allProjects = allProjects.filter(project =>
          project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.description?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      
      // Calculate pagination
      const total = allProjects.length;
      const pages = Math.ceil(total / PAGE_SIZE);
      const startIndex = (currentPage - 1) * PAGE_SIZE;
      const endIndex = startIndex + PAGE_SIZE;
      const paginatedProjects = allProjects.slice(startIndex, endIndex);
      
      setTotalProjects(total);
      setTotalPages(pages);
      
      // Load project trees for current page
      const projectTrees: ProjectTree[] = [];
      for (const project of paginatedProjects) {
        try {
          const treeData = await apiService.getProjectTree(project.id);
          projectTrees.push({
            ...project,
            folders: buildFolderTree(treeData.folders || []),
            rootFiles: treeData.files || [],
            isExpanded: false,
            rootFilesCurrentPage: 1,
            rootFilesTotalPages: 1,
            rootFilesTotalCount: treeData.files?.length || 0,
            rootFilesHasMore: false,
            rootFilesLoading: false
          });
        } catch (error) {
          projectTrees.push({
            ...project,
            folders: [],
            rootFiles: [],
            isExpanded: false,
            rootFilesCurrentPage: 1,
            rootFilesTotalPages: 1,
            rootFilesTotalCount: 0,
            rootFilesHasMore: false,
            rootFilesLoading: false
          });
        }
      }

      setProjects(projectTrees);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const buildFolderTree = (folders: any[]): FolderNode[] => {
    // The API already returns nested data, so we just need to add UI state properties
    const processFolder = (folder: any): FolderNode => ({
      id: folder.id,
      name: folder.name,
      children: folder.children ? folder.children.map(processFolder) : [],
      files: folder.files || [],
      isExpanded: false,
      isLoading: false,
      hasChildren: (folder.children && folder.children.length > 0) || folder.subfolders_count > 0,
      parent_id: folder.parent,
      // Initialize pagination state
      currentPage: 1,
      totalPages: 1,
      totalFiles: folder.files_count || folder.files?.length || 0,
      hasMoreFiles: false,
      isLoadingMoreFiles: false
    });

    return folders.map(processFolder);
  };

  const toggleProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    
    // Clear breadcrumbs if collapsing project
    if (project?.isExpanded) {
      setBreadcrumbs([]);
      setCurrentAddressPath('/');
    }
    
    setProjects(prev => prev.map(project =>
      project.id === projectId
        ? { ...project, isExpanded: !project.isExpanded }
        : project
    ));
  };

  const toggleFolder = async (projectId: string, folderId: string) => {
    // First update the UI optimistically
    setProjects(prev => prev.map(project =>
      project.id === projectId
        ? {
            ...project,
            folders: updateFolderInTree(project.folders, folderId, folder => ({
              ...folder,
              isExpanded: !folder.isExpanded,
              isLoading: !folder.isExpanded && folder.children.length === 0 && folder.hasChildren
            }))
          }
        : project
    ));

    // Find the folder to see if we need to load children
    const project = projects.find(p => p.id === projectId);
    const folder = findFolderInTree(project?.folders || [], folderId);
    
    if (folder && !folder.isExpanded && folder.children.length === 0 && folder.hasChildren) {
      // Need to lazy load folder contents with pagination
      try {
        const contents = await apiService.getProjectFiles(projectId, {
          folderId: folderId,
          page: 1,
          pageSize: 50
        }); // Load first 50 files
        console.log('Folder contents response:', contents);
        console.log('Total files:', contents.total);
        console.log('Total pages:', contents.total_pages);
        
        setProjects(prev => prev.map(proj =>
          proj.id === projectId
            ? {
                ...proj,
                folders: updateFolderInTree(proj.folders, folderId, f => ({
                  ...f,
                  children: [], // Subfolders will be loaded separately if needed
                  files: contents.files || [],
                  isLoading: false,
                  isExpanded: true,
                  currentPage: contents.page || 1,
                  totalPages: contents.total_pages || 1,
                  totalFiles: contents.total || 0,
                  hasMoreFiles: (contents.page || 1) < (contents.total_pages || 1),
                  isLoadingMoreFiles: false
                }))
              }
            : proj
        ));

        // Update breadcrumbs when folder is expanded
        const breadcrumbPath = buildBreadcrumbPath(projectId, folderId);
        setBreadcrumbs(breadcrumbPath);
        setCurrentAddressPath(breadcrumbsToPath(breadcrumbPath));
      } catch (error) {
        console.error('Failed to load folder contents:', error);
        // Reset loading state on error
        setProjects(prev => prev.map(proj =>
          proj.id === projectId
            ? {
                ...proj,
                folders: updateFolderInTree(proj.folders, folderId, f => ({
                  ...f,
                  isLoading: false,
                  isExpanded: false
                }))
              }
            : proj
        ));
      }
    }
  };

  const updateFolderInTree = (folders: FolderNode[], folderId: string, updateFn: (folder: FolderNode) => FolderNode): FolderNode[] => {
    return folders.map(folder => {
      if (folder.id === folderId) {
        return updateFn(folder);
      }
      return {
        ...folder,
        children: updateFolderInTree(folder.children, folderId, updateFn)
      };
    });
  };

  const findFolderInTree = (folders: FolderNode[], folderId: string): FolderNode | null => {
    for (const folder of folders) {
      if (folder.id === folderId) {
        return folder;
      }
      const found = findFolderInTree(folder.children, folderId);
      if (found) return found;
    }
    return null;
  };

  // Build breadcrumb path for a folder
  const buildBreadcrumbPath = (projectId: string, folderId: string): Array<{
    id: string;
    name: string;
    type: 'project' | 'folder';
    projectId?: string;
  }> => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return [];

    const path: Array<{ id: string; name: string; type: 'project' | 'folder'; projectId?: string }> = [
      { id: projectId, name: project.name, type: 'project' }
    ];

    // Find path to folder
    const findPath = (folders: FolderNode[], targetId: string, currentPath: Array<{ id: string; name: string; type: 'project' | 'folder'; projectId?: string }>): Array<{ id: string; name: string; type: 'project' | 'folder'; projectId?: string }> | null => {
      for (const folder of folders) {
        const newPath = [...currentPath, { id: folder.id, name: folder.name, type: 'folder' as const, projectId }];
        
        if (folder.id === targetId) {
          return newPath;
        }
        
        const found = findPath(folder.children, targetId, newPath);
        if (found) return found;
      }
      return null;
    };

    const folderPath = findPath(project.folders, folderId, path);
    return folderPath || path;
  };

  // Convert breadcrumbs to address path
  const breadcrumbsToPath = (breadcrumbs: Array<{ id: string; name: string; type: 'project' | 'folder' }>): string => {
    if (breadcrumbs.length === 0) return '/';
    return '/' + breadcrumbs.map(b => b.name).join('/');
  };

  // Convert address path to navigation
  const pathToBreadcrumbs = (path: string): void => {
    if (path === '/' || !path) {
      setBreadcrumbs([]);
      setCurrentAddressPath('/');
      return;
    }

    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const segments = cleanPath.split('/').filter(p => p.length > 0);

    // Find matching project and folders
    for (const project of projects) {
      if (segments[0] === project.name) {
        if (segments.length === 1) {
          // Navigate to project root
          const newBreadcrumbs = [{ id: project.id, name: project.name, type: 'project' as const }];
          setBreadcrumbs(newBreadcrumbs);
          setCurrentAddressPath(breadcrumbsToPath(newBreadcrumbs));
          
          if (!project.isExpanded) {
            toggleProject(project.id);
          }
          return;
        } else {
          // Try to find the folder path
          const folderPath = segments.slice(1);
          const foundPath = findFolderByPath(project.folders, folderPath);
          
          if (foundPath) {
            const newBreadcrumbs = [
              { id: project.id, name: project.name, type: 'project' as const },
              ...foundPath.map(f => ({ id: f.id, name: f.name, type: 'folder' as const, projectId: project.id }))
            ];
            setBreadcrumbs(newBreadcrumbs);
            setCurrentAddressPath(breadcrumbsToPath(newBreadcrumbs));
            
            // Expand project and folder
            if (!project.isExpanded) {
              toggleProject(project.id);
            }
            const lastFolder = foundPath[foundPath.length - 1];
            if (lastFolder && !lastFolder.isExpanded) {
              toggleFolder(project.id, lastFolder.id);
            }
            return;
          }
        }
      }
    }

    // Path not found - show error
    alert('Invalid path: Path not found');
  };

  // Find folder by path segments
  const findFolderByPath = (folders: FolderNode[], pathSegments: string[]): FolderNode[] | null => {
    if (pathSegments.length === 0) return [];

    for (const folder of folders) {
      if (folder.name === pathSegments[0]) {
        if (pathSegments.length === 1) {
          return [folder];
        } else {
          const subPath = findFolderByPath(folder.children, pathSegments.slice(1));
          if (subPath) {
            return [folder, ...subPath];
          }
        }
      }
    }
    return null;
  };

  // Navigate to breadcrumb item
  const navigateToBreadcrumb = (item: { id: string; name: string; type: 'project' | 'folder'; projectId?: string }) => {
    if (item.type === 'project') {
      // Navigate to project root
      const newBreadcrumbs = [item];
      setBreadcrumbs(newBreadcrumbs);
      setCurrentAddressPath(breadcrumbsToPath(newBreadcrumbs));
      // Expand project if not already expanded
      const project = projects.find(p => p.id === item.id);
      if (project && !project.isExpanded) {
        toggleProject(item.id);
      }
    } else if (item.type === 'folder' && item.projectId) {
      // Navigate to specific folder
      const newPath = buildBreadcrumbPath(item.projectId, item.id);
      setBreadcrumbs(newPath);
      setCurrentAddressPath(breadcrumbsToPath(newPath));
      // Make sure folder is expanded and loaded
      toggleFolder(item.projectId, item.id);
    }
  };

  const loadFolderPage = async (projectId: string, folderId: string, page: number) => {
    const project = projects.find(p => p.id === projectId);
    const folder = findFolderInTree(project?.folders || [], folderId);
    
    if (!folder || folder.isLoadingMoreFiles) return;

    // Set loading state
    setProjects(prev => prev.map(proj =>
      proj.id === projectId
        ? {
            ...proj,
            folders: updateFolderInTree(proj.folders, folderId, f => ({
              ...f,
              isLoadingMoreFiles: true
            }))
          }
        : proj
    ));

    try {
      const contents = await apiService.getProjectFiles(projectId, {
        folderId: folderId,
        page: page,
        pageSize: 50
      });
      
      setProjects(prev => prev.map(proj =>
        proj.id === projectId
          ? {
              ...proj,
              folders: updateFolderInTree(proj.folders, folderId, f => ({
                ...f,
                files: contents.files || [],
                currentPage: contents.page || page,
                totalPages: contents.total_pages || 1,
                totalFiles: contents.total || 0,
                hasMoreFiles: (contents.page || page) < (contents.total_pages || 1),
                isLoadingMoreFiles: false
              }))
            }
          : proj
      ));
    } catch (error) {
      console.error('Failed to load folder page:', error);
      // Reset loading state on error
      setProjects(prev => prev.map(proj =>
        proj.id === projectId
          ? {
              ...proj,
              folders: updateFolderInTree(proj.folders, folderId, f => ({
                ...f,
                isLoadingMoreFiles: false
              }))
            }
          : proj
      ));
    }
  };

  const openUploadModal = (projectId: string, projectName: string, folderId?: string, folderName?: string) => {
    setUploadTarget({
      projectId,
      projectName,
      folderId,
      folderName
    });
    setShowUploadModal(true);
  };

  const handleCreateProject = async (data: { name: string; description: string }) => {
    try {
      await apiService.createProject(data);
      await loadProjects();
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleCreateFolder = async (data: { name: string; parent?: string; project: string }) => {
    try {
      await apiService.createFolder(data);
      await loadProjects();
      setShowCreateFolderModal(false);
      setSelectedProjectForFolder('');
      setSelectedParentFolder('');
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      try {
        await apiService.deleteProject(projectId);
        await loadProjects();
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
  };

  const handleUploadComplete = () => {
    loadProjects();
  };

  const handleDownloadFile = async (fileId: string, fileName: string) => {
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
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!confirm(`Delete ${fileName}?`)) return;
    
    const { addToast } = useToastStore.getState();
    
    try {
      const result = await apiService.deleteFile(fileId);
      
      addToast({
        type: 'success',
        title: 'File Deleted',
        message: result.message || `${fileName} has been permanently deleted`,
        duration: 4000
      });
      
      await loadProjects();
    } catch (error) {
      console.error('Failed to delete file:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: `Could not delete ${fileName}: ${errorMessage}`,
        duration: 8000
      });
      
      if (errorMessage.includes('locked') || errorMessage.includes('permission')) {
        if (confirm(`${errorMessage}\n\nForce remove database record? (File may remain on disk)`)) {
          try {
            await forceRemoveFileRecord(fileId);
            await loadProjects();
            
            addToast({
              type: 'warning',
              title: 'Record Removed',
              message: `Database record for ${fileName} removed. Physical file may still exist.`,
              duration: 6000
            });
          } catch (forceError) {
            addToast({
              type: 'error',
              title: 'Force Removal Failed',
              message: 'Contact administrator for manual cleanup.',
              duration: 8000
            });
          }
        }
      }
    }
  };

  const forceRemoveFileRecord = async (fileId: string) => {
    const response = await fetch(`http://localhost:8000/file-management/files/${fileId}/`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Force removal failed');
    }
  };


  const isArchive = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return ['zip', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(extension || '');
  };

  const handleFileDoubleClick = (file: any) => {
    setSelectedFile(file);
    
    if (isArchive(file.name)) {
      setShowArchivePreview(true);
    } else {
      setShowPreview(true);
    }
  };

  const getFolderOptions = (projectId: string, excludeFolderId?: string): Array<{ id: string; name: string; level: number }> => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return [];

    const options: Array<{ id: string; name: string; level: number }> = [];

    const collectFolders = (folders: FolderNode[], level: number = 0) => {
      folders.forEach(folder => {
        if (folder.id !== excludeFolderId) {
          options.push({
            id: folder.id,
            name: folder.name,
            level
          });
          collectFolders(folder.children, level + 1);
        }
      });
    };

    collectFolders(project.folders);
    return options;
  };

  const renderFolderTree = (folders: FolderNode[], projectId: string, projectName: string, level: number = 0) => {
    return folders.map(folder => {
      // Debug log for each folder
      if (folder.totalFiles > 0) {
        console.log(`Folder ${folder.name}: ${folder.totalFiles} total files, ${folder.currentPage}/${folder.totalPages} pages`);
      }
      
      return (
      <div key={folder.id} style={{ marginLeft: `${level * 20}px` }}>
        <div className="flex items-center justify-between py-2 px-2 hover:bg-gray-50 rounded">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => toggleFolder(projectId, folder.id)}
              className="p-1 hover:bg-gray-200 rounded"
              disabled={folder.isLoading}
            >
              {folder.isLoading ? (
                <Loader className="w-4 h-4 animate-spin text-blue-600" />
              ) : folder.hasChildren || folder.children.length > 0 || folder.files.length > 0 ? (
                folder.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
              ) : (
                <div className="w-4 h-4" />
              )}
            </button>
            <FileIcon 
              fileName={folder.name}
              contentType=""
              isFolder={true}
              size="sm"
            />
            <span className="text-sm font-medium">{folder.name}</span>
            <span className="text-xs text-gray-500">
              ({folder.files.length} of {Math.max(folder.totalFiles, folder.files.length)} files{folder.children.length > 0 ? `, ${folder.children.length} folders` : ''})
              {(folder.totalFiles > 50 || folder.totalPages > 1) && (
                <span className="ml-1 text-blue-600">• Page {folder.currentPage}/{Math.max(folder.totalPages, 1)}</span>
              )}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedProjectForFolder(projectId);
                setSelectedParentFolder(folder.id);
                setShowCreateFolderModal(true);
              }}
            >
              <FolderPlus className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openUploadModal(projectId, projectName, folder.id, folder.name)}
            >
              <Upload className="w-3 h-3" />
            </Button>
          </div>
        </div>
        {folder.isExpanded && (
          <>
            {renderFolderTree(folder.children, projectId, projectName, level + 1)}
            {folder.files.length > 0 && (
              <div className="ml-4">
                {folder.files.map(file => (
                  <div 
                    key={file.id} 
                    style={{ marginLeft: `${(level + 1) * 20}px` }} 
                    className="flex items-center justify-between py-1 px-2 hover:bg-gray-100 rounded cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleFileDoubleClick(file);
                    }}
                  >
                    <div className="flex items-center space-x-2">
                      <FileIcon 
                        fileName={file.name}
                        contentType={file.content_type}
                        size="sm"
                      />
                      <span className="text-xs text-gray-700">{file.name}</span>
                      <span className="text-xs text-gray-400">({formatFileSize(file.size)})</span>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <FileActions
                        fileId={file.id}
                        fileName={file.name}
                        contentType={file.content_type}
                        onDownload={() => handleDownloadFile(file.id, file.name)}
                        onDelete={() => handleDeleteFile(file.id, file.name)}
                        onPreviewComplete={loadProjects}
                      />
                    </div>
                  </div>
                ))}
                
                {/* Folder Pagination */}
                {(folder.totalFiles > 50 || folder.totalPages > 1) && (
                  <div style={{ marginLeft: `${(level + 1) * 20}px` }} className="py-2">
                    <Pagination
                      currentPage={folder.currentPage}
                      totalPages={Math.max(folder.totalPages, Math.ceil(folder.files.length / 50))}
                      totalItems={Math.max(folder.totalFiles, folder.files.length)}
                      itemsPerPage={50}
                      onPageChange={(page) => loadFolderPage(projectId, folder.id, page)}
                      isLoading={folder.isLoadingMoreFiles}
                      showInfo={false}
                      className="border-t-0 px-0 py-2 bg-gray-50 rounded"
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      );
    });
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-600 mt-1">Organize your files into projects and folders</p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            onClick={() => setShowCreateFolderModal(true)}
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            New Folder
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center space-x-4 mb-6">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {/* View Mode Toggle */}
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">View:</span>
            <div className="flex rounded border border-gray-300 overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-100 text-blue-800 border-blue-300'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 text-sm font-medium transition-colors border-l ${
                  viewMode === 'grid'
                    ? 'bg-blue-100 text-blue-800 border-blue-300'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title="Grid view"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Results Info */}
        <div className="mb-4 text-sm text-gray-500">
          Showing {projects.length} of {totalProjects} projects
          {searchTerm && (
            <span className="text-blue-600 ml-1">matching "{searchTerm}"</span>
          )}
        </div>

        {/* Windows File Explorer Style Address Bar */}
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-sm font-medium text-gray-700">🔍 Address Bar (Test):</span>
            <span className="text-xs text-gray-500">Current path: {currentAddressPath}</span>
          </div>
          <AddressBar
            currentPath={currentAddressPath}
            onNavigate={pathToBreadcrumbs}
            className="w-full"
          />
        </div>

        {/* Horizontal Breadcrumb Navigation */}
        {breadcrumbs.length > 0 && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-gray-600 font-medium">You are here:</span>
              {breadcrumbs.map((item, index) => (
                <div key={item.id} className="flex items-center space-x-2">
                  {index > 0 && (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                  <button
                    onClick={() => navigateToBreadcrumb(item)}
                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition-colors ${
                      index === breadcrumbs.length - 1
                        ? 'bg-blue-100 text-blue-800 font-medium cursor-default'
                        : 'text-blue-600 hover:bg-blue-100 hover:text-blue-800 font-medium'
                    }`}
                  >
                    {item.type === 'project' ? (
                      <FolderOpen className="w-4 h-4" />
                    ) : (
                      <FileIcon fileName={item.name} contentType="" isFolder={true} size="sm" className="w-4 h-4" />
                    )}
                    <span>{item.name}</span>
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  setBreadcrumbs([]);
                  setCurrentAddressPath('/');
                }}
                className="ml-4 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                title="Clear navigation"
              >
                ✕ Clear
              </button>
            </div>
          </div>
        )}

        {/* Projects Display - List or Grid View */}
        {viewMode === 'list' ? (
          <div className="space-y-4">
            {projects.map((project) => (
            <div key={project.id} className="border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => toggleProject(project.id)}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      {project.isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <FolderOpen className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                      <p className="text-sm text-gray-600">{project.description || 'No description'}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="text-right text-sm text-gray-500">
                      <div>{project.files_count} files</div>
                      <div>{project.total_size_formatted}</div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedProjectForFolder(project.id);
                          setSelectedParentFolder('');
                          setShowCreateFolderModal(true);
                        }}
                      >
                        <FolderPlus className="w-4 h-4 mr-1" />
                        Folder
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openUploadModal(project.id, project.name)}
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        Upload
                      </Button>
                      <div className="relative">
                        <button
                          onClick={() => setSelectedProject(selectedProject === project.id ? null : project.id)}
                          className="text-gray-400 hover:text-gray-600 p-1"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {selectedProject === project.id && (
                          <div className="absolute right-0 top-8 bg-white border rounded-lg shadow-lg py-1 z-10">
                            <button className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full">
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteProject(project.id)}
                              className="flex items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-50 w-full"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {project.isExpanded && (
                <div className="p-4">
                  {renderFolderTree(project.folders, project.id, project.name)}
                  
                  {project.rootFiles.length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-gray-700 mb-2">Root Files:</div>
                      <div className="space-y-1">
                        {project.rootFiles.map(file => (
                          <div 
                            key={file.id} 
                            className="flex items-center justify-between py-1 px-2 ml-6 hover:bg-gray-100 rounded cursor-pointer"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFileDoubleClick(file);
                            }}
                          >
                            <div className="flex items-center space-x-2">
                              <FileIcon 
                                fileName={file.name}
                                contentType={file.content_type}
                                size="sm"
                              />
                              <span className="text-xs text-gray-700">{file.name}</span>
                              <span className="text-xs text-gray-400">({formatFileSize(file.size)})</span>
                            </div>
                            <div onClick={(e) => e.stopPropagation()}>
                              <FileActions
                                fileId={file.id}
                                fileName={file.name}
                                contentType={file.content_type}
                                onDownload={() => handleDownloadFile(file.id, file.name)}
                                onDelete={() => handleDeleteFile(file.id, file.name)}
                                onPreviewComplete={loadProjects}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {project.folders.length === 0 && project.rootFiles.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <FolderOpen className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm">No folders or files yet</p>
                      <div className="flex justify-center space-x-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedProjectForFolder(project.id);
                            setSelectedParentFolder('');
                            setShowCreateFolderModal(true);
                          }}
                        >
                          <FolderPlus className="w-4 h-4 mr-1" />
                          Create Folder
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openUploadModal(project.id, project.name)}
                        >
                          <Upload className="w-4 h-4 mr-1" />
                          Upload Files
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((project) => (
              <div key={project.id} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                {/* Project Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <FolderOpen className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => openUploadModal(project.id, project.name)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Upload files"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedProjectForFolder(project.id);
                        setSelectedParentFolder('');
                        setShowCreateFolderModal(true);
                      }}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Create folder"
                    >
                      <FolderPlus className="w-4 h-4" />
                    </button>
                    <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Project Info */}
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate" title={project.name}>
                    {project.name}
                  </h3>
                  {project.description && (
                    <p className="text-sm text-gray-600 line-clamp-2" title={project.description}>
                      {project.description}
                    </p>
                  )}
                </div>

                {/* Project Stats */}
                <div className="space-y-2 text-sm text-gray-500">
                  <div className="flex justify-between">
                    <span>Files:</span>
                    <span className="font-medium">{project.files_count?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Size:</span>
                    <span className="font-medium">{formatFileSize(project.total_size || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Folders:</span>
                    <span className="font-medium">{project.folders?.length || 0}</span>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => toggleProject(project.id)}
                    className="w-full text-left text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {project.isExpanded ? 'Hide contents' : 'View contents'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Projects Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalProjects}
              itemsPerPage={PAGE_SIZE}
              onPageChange={setCurrentPage}
              isLoading={isLoading}
            />
          </div>
        )}

        {projects.length === 0 && (
          <div className="text-center py-12">
            <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No projects found</h3>
            <p className="text-gray-500 mb-4">Get started by creating your first project</p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateProject}
        />
      )}

      {showCreateFolderModal && (
        <CreateFolderModal
          projects={projects}
          selectedProject={selectedProjectForFolder}
          selectedParentFolder={selectedParentFolder}
          onClose={() => {
            setShowCreateFolderModal(false);
            setSelectedProjectForFolder('');
            setSelectedParentFolder('');
          }}
          onSubmit={handleCreateFolder}
          getFolderOptions={getFolderOptions}
        />
      )}

      {showUploadModal && uploadTarget && (
        <UploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          projectId={uploadTarget.projectId}
          projectName={uploadTarget.projectName}
          folderId={uploadTarget.folderId}
          folderName={uploadTarget.folderName}
          onUploadComplete={handleUploadComplete}
        />
      )}

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
            // Small delay to ensure database transaction is committed
            setTimeout(() => {
              loadProjects();
            }, 500);
          }}
        />
      )}
    </div>
  );
}

function CreateProjectModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (data: { name: string; description: string }) => void;
}) {
  const [formData, setFormData] = useState({ name: '', description: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim()) {
      onSubmit(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Project</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter project name"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter project description"
              rows={3}
            />
          </div>
          
          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Create Project
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateFolderModal({ 
  projects, 
  selectedProject, 
  selectedParentFolder, 
  onClose, 
  onSubmit, 
  getFolderOptions 
}: {
  projects: ProjectTree[];
  selectedProject: string;
  selectedParentFolder: string;
  onClose: () => void;
  onSubmit: (data: { name: string; parent?: string; project: string }) => void;
  getFolderOptions: (projectId: string) => Array<{ id: string; name: string; level: number }>;
}) {
  const [formData, setFormData] = useState({
    name: '',
    project: selectedProject,
    parent: selectedParentFolder
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim() && formData.project) {
      onSubmit({
        name: formData.name,
        project: formData.project,
        ...(formData.parent && { parent: formData.parent })
      });
    }
  };

  const folderOptions = formData.project ? getFolderOptions(formData.project) : [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Folder</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project
            </label>
            <select
              value={formData.project}
              onChange={(e) => setFormData(prev => ({ ...prev, project: e.target.value, parent: '' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">Select project...</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parent Folder (Optional)
            </label>
            <select
              value={formData.parent}
              onChange={(e) => setFormData(prev => ({ ...prev, parent: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Root level</option>
              {folderOptions.map(folder => (
                <option key={folder.id} value={folder.id}>
                  {'─'.repeat(folder.level)} {folder.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Folder Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter folder name"
              required
            />
          </div>
          
          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Create Folder
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}