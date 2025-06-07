'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Upload, FolderPlus, Search, Trash2, Eye, Archive, Video, Check, AlertCircle, Cpu, Zap } from 'lucide-react';
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

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [showArchivePreview, setShowArchivePreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [processingStatuses, setProcessingStatuses] = useState<Record<string, VideoProcessingStatus>>({});

  useEffect(() => {
    if (projectId) {
      loadProjectData();
    }
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      const [projectResponse, filesResponse] = await Promise.all([
        apiService.getProjects(),
        apiService.getProjectFiles(projectId)
      ]);
      
      const currentProject = projectResponse.projects.find(p => p.id === projectId);
      setProject(currentProject || null);
      setFiles(filesResponse.files);

      // Check processing status for video files
      const videoFiles = filesResponse.files.filter(file => file.content_type.startsWith('video/'));
      videoFiles.forEach(file => {
        checkVideoProcessingStatus(file.id);
      });
    } catch (error) {
      console.error('Failed to load project data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Function để check processing status
  const checkVideoProcessingStatus = async (fileId: string) => {
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
        
        // Continue polling if processing
        if (status.processing) {
          setTimeout(() => checkVideoProcessingStatus(fileId), 5000);
        }
      }
    } catch (error) {
      console.error('Failed to check processing status:', error);
    }
  };

  // Function để render processing status badge
  const renderProcessingBadge = (file: FileItem) => {
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
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectFile = (fileId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleSelectAll = () => {
    setSelectedFiles(
      selectedFiles.length === filteredFiles.length
        ? []
        : filteredFiles.map(file => file.id)
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.length === 0) return;
    
    if (confirm(`Delete ${selectedFiles.length} selected files?`)) {
      try {
        await apiService.deleteFiles(selectedFiles);
        await loadProjectData();
        setSelectedFiles([]);
      } catch (error) {
        console.error('Failed to delete files:', error);
      }
    }
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

  const isPreviewable = (contentType: string) => {
    return contentType.startsWith('image/') ||
           contentType.startsWith('video/') ||
           contentType.startsWith('audio/') ||
           contentType.startsWith('text/') ||
           contentType === 'application/json' ||
           contentType === 'text/csv' ||
           contentType === 'application/pdf';
  };

  const isArchive = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return ['zip', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(extension || '');
  };

  const handlePreviewClick = (file: FileItem, event: React.MouseEvent) => {
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
  };

  // Get video processing summary
  const getVideoProcessingSummary = () => {
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
  };

  const videoSummary = getVideoProcessingSummary();

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

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
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
            
            <div className="flex items-center space-x-2">
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
              {filteredFiles.map((file) => {
                const fileIsArchive = isArchive(file.name);
                const fileIsPreviewable = isPreviewable(file.content_type);
                const processingStatus = processingStatuses[file.id];
                
                return (
                  <tr 
                    key={file.id} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={(e) => handleSelectFile(file.id, e)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(file.id)}
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
                          {/* Processing message for videos */}
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
                        {fileIsArchive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handlePreviewClick(file, e)}
                            title="View archive contents"
                            className="bg-orange-100 text-orange-600 hover:bg-orange-200"
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                        )}
                        
                        {fileIsPreviewable && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handlePreviewClick(file, e)}
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
                          onDownload={() => handleDownloadFile(file.id, file.name)}
                          onDelete={async () => {
                            if (confirm(`Delete ${file.name}?`)) {
                              try {
                                await apiService.deleteFile(file.id);
                                await loadProjectData();
                              } catch (error) {
                                console.error('Failed to delete file:', error);
                              }
                            }
                          }}
                          onPreviewComplete={loadProjectData}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredFiles.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-500">No files found in this project</div>
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
            loadProjectData();
          }}
        />
      )}
    </div>
  );
}