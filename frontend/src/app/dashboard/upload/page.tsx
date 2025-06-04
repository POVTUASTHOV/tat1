'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, X, FolderOpen, Check, AlertCircle } from 'lucide-react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import Button from '../../../components/ui/Button';
import { apiService } from '../../../lib/api';
import { Project } from '../../../types';
import { formatFileSize } from '../../../lib/utils';

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export default function UploadPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await apiService.getProjects();
      setProjects(response.projects);
      if (response.projects.length > 0) {
        setSelectedProject(response.projects[0].id);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateFileId = () => Math.random().toString(36).substr(2, 9);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      addFiles(files);
    }
  };

  const addFiles = (files: File[]) => {
    const newUploadFiles: UploadFile[] = files.map(file => ({
      file,
      id: generateFileId(),
      progress: 0,
      status: 'pending'
    }));

    setUploadFiles(prev => [...prev, ...newUploadFiles]);
  };

  const removeFile = (fileId: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const uploadSingleFile = async (uploadFile: UploadFile): Promise<void> => {
    if (!selectedProject) {
      throw new Error('No project selected');
    }

    const { file } = uploadFile;
    const chunkSize = 1024 * 1024; // 1MB chunks
    const totalChunks = Math.ceil(file.size / chunkSize);

    // Update status to uploading
    setUploadFiles(prev => prev.map(f => 
      f.id === uploadFile.id ? { ...f, status: 'uploading' } : f
    ));

    try {
      // Upload chunks
      for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++) {
        const start = chunkNumber * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('file', chunk, file.name);
        formData.append('filename', file.name);
        formData.append('chunk_number', chunkNumber.toString());
        formData.append('total_chunks', totalChunks.toString());
        formData.append('total_size', file.size.toString());
        formData.append('project_id', selectedProject);

        const response = await fetch('http://localhost:8001/api/upload/chunk/', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Chunk ${chunkNumber} upload failed`);
        }

        // Update progress
        const progress = ((chunkNumber + 1) / totalChunks) * 100;
        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { ...f, progress } : f
        ));
      }

      // Complete upload
      const completeResponse = await fetch('http://localhost:8001/api/upload/complete/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          filename: file.name,
          project_id: selectedProject,
        }),
      });

      if (!completeResponse.ok) {
        throw new Error('Failed to complete upload');
      }

      // Mark as completed
      setUploadFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, status: 'completed', progress: 100 } : f
      ));

    } catch (error) {
      console.error('Upload failed:', error);
      setUploadFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { 
          ...f, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Upload failed' 
        } : f
      ));
    }
  };

  const startUpload = async () => {
    if (!selectedProject) {
      alert('Please select a project');
      return;
    }

    const pendingFiles = uploadFiles.filter(f => f.status === 'pending');
    
    // Upload files sequentially to avoid overwhelming the server
    for (const file of pendingFiles) {
      await uploadSingleFile(file);
    }
  };

  const clearCompleted = () => {
    setUploadFiles(prev => prev.filter(f => f.status !== 'completed'));
  };

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'completed':
        return <Check className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'uploading':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>;
      default:
        return <Upload className="w-4 h-4 text-gray-400" />;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Upload Files</h1>
          <p className="text-gray-600 mt-1">Upload files to your projects</p>
        </div>

        {/* Project Selection */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-4">
            <FolderOpen className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Choose a project...</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Upload Area */}
        <div className="bg-white rounded-lg shadow p-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Drop files here or click to upload
            </h3>
            <p className="text-gray-500 mb-4">
              Support for multiple files. Maximum 50GB per file.
            </p>
            
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload">
              <Button variant="outline" className="cursor-pointer">
                Choose Files
              </Button>
            </label>
          </div>
        </div>

        {/* Upload Queue */}
        {uploadFiles.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Upload Queue ({uploadFiles.length} files)
              </h3>
              
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearCompleted}
                  disabled={!uploadFiles.some(f => f.status === 'completed')}
                >
                  Clear Completed
                </Button>
                <Button
                  onClick={startUpload}
                  disabled={!selectedProject || uploadFiles.every(f => f.status !== 'pending')}
                  isLoading={uploadFiles.some(f => f.status === 'uploading')}
                >
                  Start Upload
                </Button>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {uploadFiles.map((uploadFile) => (
                <div key={uploadFile.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1">
                      {getStatusIcon(uploadFile.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {uploadFile.file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(uploadFile.file.size)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      {uploadFile.status === 'uploading' && (
                        <div className="w-32">
                          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                            <span>Uploading...</span>
                            <span>{Math.round(uploadFile.progress)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${uploadFile.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                      
                      {uploadFile.status === 'completed' && (
                        <span className="text-xs text-green-600 font-medium">
                          Completed
                        </span>
                      )}
                      
                      {uploadFile.status === 'error' && (
                        <span className="text-xs text-red-600 font-medium">
                          Error: {uploadFile.error}
                        </span>
                      )}
                      
                      {uploadFile.status === 'pending' && (
                        <span className="text-xs text-gray-500 font-medium">
                          Pending
                        </span>
                      )}
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(uploadFile.id)}
                        disabled={uploadFile.status === 'uploading'}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Tips */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Upload Tips:</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Files are uploaded in chunks for better reliability</li>
            <li>• You can upload multiple files at once</li>
            <li>• Make sure you have enough storage space before uploading</li>
            <li>• Large files may take some time to process</li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}