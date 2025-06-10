// frontend/src/components/ui/UploadModal.tsx - Sửa đổi

'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, X, Check, AlertCircle, File, Video, Cpu, Zap } from 'lucide-react';
import Button from './Button';
import { formatFileSize } from '../../lib/utils';
import UploadOptimizer from './UploadOptimizer';
import type { UploadConfig } from '@/lib/networkOptimizer';

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'processing';
  error?: string;
  isVideo?: boolean;
  processingStatus?: 'processing' | 'completed' | 'no_processing_available';
  processingMessage?: string;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  folderId?: string;
  folderName?: string;
  onUploadComplete: () => void;
}

export default function UploadModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  folderId,
  folderName,
  onUploadComplete
}: UploadModalProps) {
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [gpuStatus, setGpuStatus] = useState<any>(null);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);
  const [showOptimizer, setShowOptimizer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateFileId = () => Math.random().toString(36).substr(2, 9);

  // Check GPU status khi modal mở
  const checkGpuStatus = async () => {
    try {
      const response = await fetch('http://localhost:8001/api/gpu/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setGpuStatus(data);
      }
    } catch (error) {
      console.error('Failed to check GPU status:', error);
    }
  };

  const isVideoFile = (file: File): boolean => {
    const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', '3gp', 'm4v'];
    const extension = file.name.split('.').pop()?.toLowerCase();
    return videoExtensions.includes(extension || '') || file.type.startsWith('video/');
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
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
      status: 'pending',
      isVideo: isVideoFile(file)
    }));

    setUploadFiles(prev => [...prev, ...newUploadFiles]);
    
    // Check GPU status nếu có video
    if (newUploadFiles.some(f => f.isVideo)) {
      checkGpuStatus();
    }
    
    // Show optimizer if files are large or multiple files
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const largeFiles = files.some(file => file.size > 100 * 1024 * 1024); // >100MB
    if (largeFiles || files.length > 1 || totalSize > 500 * 1024 * 1024) {
      setShowOptimizer(true);
    }
  };

  const handleConfigChange = (config: UploadConfig) => {
    setUploadConfig(config);
  };

  const removeFile = (fileId: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const uploadSingleFile = async (uploadFile: UploadFile): Promise<void> => {
    const { file } = uploadFile;
    // Use optimized chunk size or fallback to 10MB default
    const chunkSize = uploadConfig?.chunkSizeBytes || (10 * 1024 * 1024);
    const chunkSizeName = uploadConfig?.chunkSizeName || 'medium';
    const totalChunks = Math.ceil(file.size / chunkSize);

    setUploadFiles(prev => prev.map(f => 
      f.id === uploadFile.id ? { ...f, status: 'uploading' } : f
    ));

    try {
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
        formData.append('project_id', projectId);
        formData.append('chunk_size_name', chunkSizeName);
        
        if (folderId) {
          formData.append('folder_id', folderId);
        }

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

        const progress = ((chunkNumber + 1) / totalChunks) * 100;
        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { ...f, progress } : f
        ));
      }

      const completeResponse = await fetch('http://localhost:8001/api/upload/complete/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          filename: file.name,
          project_id: projectId,
          ...(folderId && { folder_id: folderId })
        }),
      });

      if (!completeResponse.ok) {
        throw new Error('Failed to complete upload');
      }

      const result = await completeResponse.json();

      // Update status dựa trên response
      setUploadFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { 
          ...f, 
          status: result.is_video && result.processing_status === 'processing' ? 'processing' : 'completed',
          progress: 100,
          processingStatus: result.processing_status,
          processingMessage: result.message
        } : f
      ));

      // Poll processing status cho video
      if (result.is_video && result.processing_status === 'processing') {
        pollVideoProcessingStatus(result.id, uploadFile.id);
      }

    } catch (error) {
      setUploadFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { 
          ...f, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Upload failed' 
        } : f
      ));
    }
  };

  const pollVideoProcessingStatus = async (fileId: string, uploadFileId: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`http://localhost:8001/api/video/processing-status/${fileId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          
          if (!data.processing) {
            // Processing completed
            setUploadFiles(prev => prev.map(f => 
              f.id === uploadFileId ? { 
                ...f, 
                status: 'completed',
                processingStatus: 'completed',
                processingMessage: 'Video conversion completed'
              } : f
            ));
            return;
          }
        }
        
        // Continue polling
        setTimeout(checkStatus, 3000);
      } catch (error) {
        console.error('Failed to check processing status:', error);
        // Stop polling on error
      }
    };

    setTimeout(checkStatus, 2000);
  };

  const startUpload = async () => {
    const pendingFiles = uploadFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    
    for (const file of pendingFiles) {
      await uploadSingleFile(file);
    }
    
    setIsUploading(false);
    onUploadComplete();
  };

  const clearCompleted = () => {
    setUploadFiles(prev => prev.filter(f => f.status !== 'completed'));
  };

  const clearAll = () => {
    setUploadFiles([]);
  };

  const getStatusIcon = (uploadFile: UploadFile) => {
    switch (uploadFile.status) {
      case 'completed':
        return <Check className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'uploading':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>;
      case 'processing':
        return (
          <div className="flex items-center">
            <Video className="w-4 h-4 text-yellow-600 animate-pulse" />
          </div>
        );
      default:
        return uploadFile.isVideo ? <Video className="w-4 h-4 text-purple-500" /> : <File className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = (uploadFile: UploadFile) => {
    switch (uploadFile.status) {
      case 'completed':
        return uploadFile.isVideo ? 'Video ready' : 'Completed';
      case 'error':
        return 'Failed';
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Converting to H.264...';
      default:
        return uploadFile.isVideo ? 'Video ready to upload' : 'Pending';
    }
  };

  const handleClose = () => {
    if (isUploading) {
      if (confirm('Upload in progress. Are you sure you want to close?')) {
        onClose();
        setUploadFiles([]);
      }
    } else {
      onClose();
      setUploadFiles([]);
    }
  };

  if (!isOpen) return null;

  const videoFiles = uploadFiles.filter(f => f.isVideo);
  const hasVideos = videoFiles.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Upload Files</h2>
              <p className="text-sm text-gray-600 mt-1">
                To: {projectName}{folderName && ` / ${folderName}`}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={isUploading}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* GPU Status Display */}
          {hasVideos && gpuStatus && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                {gpuStatus.should_use_gpu ? (
                  <Zap className="w-4 h-4 text-green-600" />
                ) : (
                  <Cpu className="w-4 h-4 text-orange-600" />
                )}
                <span className="text-sm font-medium">
                  Video Processing: {gpuStatus.should_use_gpu ? 'GPU Acceleration' : 'CPU Processing'}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{gpuStatus.reason}</p>
              {gpuStatus.gpu_info && gpuStatus.gpu_info.gpus && (
                <div className="text-xs text-gray-500 mt-1">
                  GPU: {gpuStatus.gpu_info.gpus[0]?.name} ({gpuStatus.gpu_info.gpus[0]?.gpu_utilization}% usage)
                </div>
              )}
            </div>
          )}

        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-6 ${
              isDragOver 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Drop files here or click to upload
            </h3>
            <p className="text-gray-500 mb-2">
              Support for multiple files. Maximum 50GB per file.
            </p>
            {hasVideos && (
              <p className="text-blue-600 text-sm">
                🎬 Videos will be automatically converted to H.264 for optimal web playback
              </p>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              Choose Files
            </Button>
          </div>

          {uploadFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">
                  Files ({uploadFiles.length})
                  {hasVideos && (
                    <span className="ml-2 text-sm text-purple-600">
                      ({videoFiles.length} video{videoFiles.length !== 1 ? 's' : ''})
                    </span>
                  )}
                </h4>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOptimizer(!showOptimizer)}
                    disabled={isUploading}
                  >
                    <Zap className="w-4 h-4 mr-1" />
                    {showOptimizer ? 'Hide' : 'Show'} Optimizer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearCompleted}
                    disabled={!uploadFiles.some(f => f.status === 'completed') || isUploading}
                  >
                    Clear Completed
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAll}
                    disabled={isUploading}
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {uploadFiles.map((uploadFile) => (
                  <div key={uploadFile.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        {getStatusIcon(uploadFile)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {uploadFile.file.name}
                            </p>
                            {uploadFile.isVideo && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                Video
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(uploadFile.file.size)}
                          </p>
                          {uploadFile.processingMessage && (
                            <p className="text-xs text-blue-600 mt-1">
                              {uploadFile.processingMessage}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        {uploadFile.status === 'uploading' && (
                          <div className="w-24">
                            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                              <span>Uploading...</span>
                              <span>{Math.round(uploadFile.progress)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1">
                              <div
                                className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                                style={{ width: `${uploadFile.progress}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                        
                        {uploadFile.status === 'processing' && (
                          <div className="w-24">
                            <div className="flex items-center justify-between text-xs text-yellow-600 mb-1">
                              <span>Converting...</span>
                              <Video className="w-3 h-3 animate-pulse" />
                            </div>
                            <div className="w-full bg-yellow-200 rounded-full h-1">
                              <div className="bg-yellow-600 h-1 rounded-full animate-pulse w-full"></div>
                            </div>
                          </div>
                        )}
                        
                        <span className="text-xs font-medium min-w-[80px] text-right">
                          {getStatusText(uploadFile)}
                        </span>
                        
                        <button
                          onClick={() => removeFile(uploadFile.id)}
                          disabled={uploadFile.status === 'uploading' || uploadFile.status === 'processing'}
                          className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Upload Optimizer */}
              {showOptimizer && (
                <UploadOptimizer
                  fileSize={uploadFiles.reduce((sum, uf) => sum + uf.file.size, 0)}
                  onConfigChange={handleConfigChange}
                  className="mt-4"
                />
              )}
            </div>
          )}
        </div>

        {uploadFiles.length > 0 && (
          <div className="p-6 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {uploadFiles.filter(f => f.status === 'completed').length} of {uploadFiles.length} completed
                {hasVideos && (
                  <span className="block text-xs text-purple-600">
                    Videos are converted to H.264 for optimal playback
                  </span>
                )}
                {uploadConfig && (
                  <span className="block text-xs text-blue-600">
                    Using {uploadConfig.chunkSizeMB}MB chunks • {uploadConfig.concurrentChunks} parallel uploads
                  </span>
                )}
              </div>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={isUploading}
                >
                  {isUploading ? 'Uploading...' : 'Close'}
                </Button>
                <Button
                  onClick={startUpload}
                  disabled={uploadFiles.every(f => f.status !== 'pending') || isUploading}
                  isLoading={isUploading}
                >
                  {isUploading ? 'Uploading...' : 'Start Upload'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}