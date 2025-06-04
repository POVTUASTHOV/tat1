'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, X, Check, AlertCircle, File } from 'lucide-react';
import Button from './Button';
import { formatFileSize } from '../../lib/utils';

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateFileId = () => Math.random().toString(36).substr(2, 9);

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
      status: 'pending'
    }));

    setUploadFiles(prev => [...prev, ...newUploadFiles]);
  };

  const removeFile = (fileId: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const uploadSingleFile = async (uploadFile: UploadFile): Promise<void> => {
    const { file } = uploadFile;
    const chunkSize = 1024 * 1024;
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

      setUploadFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, status: 'completed', progress: 100 } : f
      ));

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

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'completed':
        return <Check className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'uploading':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>;
      default:
        return <File className="w-4 h-4 text-gray-400" />;
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
            <p className="text-gray-500 mb-4">
              Support for multiple files. Maximum 50GB per file.
            </p>
            
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
                </h4>
                <div className="flex space-x-2">
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
                        
                        {uploadFile.status === 'completed' && (
                          <span className="text-xs text-green-600 font-medium">
                            Completed
                          </span>
                        )}
                        
                        {uploadFile.status === 'error' && (
                          <span className="text-xs text-red-600 font-medium">
                            Failed
                          </span>
                        )}
                        
                        {uploadFile.status === 'pending' && (
                          <span className="text-xs text-gray-500 font-medium">
                            Pending
                          </span>
                        )}
                        
                        <button
                          onClick={() => removeFile(uploadFile.id)}
                          disabled={uploadFile.status === 'uploading'}
                          className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {uploadFiles.length > 0 && (
          <div className="p-6 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {uploadFiles.filter(f => f.status === 'completed').length} of {uploadFiles.length} completed
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