'use client';

import { useState, useEffect } from 'react';
import { Search, Trash2, Grid, List } from 'lucide-react';
import Button from '../../../../components/ui/Button';
import FileActions from '../../../../components/ui/FileActions';
import FilePreviewModal from '../../../../components/ui/FilePreviewModal';
import ArchivePreviewModal from '../../../../components/ui/ArchivePreviewModal';
import { apiService } from '../../../../lib/api';
import { FileItem } from '../../../../types';
import { formatFileSize, formatDate, createFilePairs, FilePair } from '../../../../lib/utils';

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filePairs, setFilePairs] = useState<FilePair[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFiles, setTotalFiles] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [showArchivePreview, setShowArchivePreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);

  const pageSize = 40;

  useEffect(() => {
    loadFiles();
  }, [currentPage, searchTerm]);

  useEffect(() => {
    const pairs = createFilePairs(files);
    setFilePairs(pairs);
  }, [files]);

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getAllFiles(currentPage, pageSize, searchTerm);
      setFiles(response.files);
      setTotalFiles(response.total);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPair = (pair: FilePair) => {
    const pairFileIds = pair.files.map(f => f.id);
    const allSelected = pairFileIds.every(id => selectedFiles.includes(id));
    
    if (allSelected) {
      // Deselect all files in the pair
      setSelectedFiles(prev => prev.filter(id => !pairFileIds.includes(id)));
    } else {
      // Select all files in the pair
      setSelectedFiles(prev => [...prev.filter(id => !pairFileIds.includes(id)), ...pairFileIds]);
    }
  };

  const handleSelectAll = () => {
    const allFileIds = files.map(file => file.id);
    setSelectedFiles(
      selectedFiles.length === files.length
        ? []
        : allFileIds
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.length === 0) return;
    
    if (confirm(`Delete ${selectedFiles.length} selected files?`)) {
      try {
        await apiService.deleteFiles(selectedFiles);
        await loadFiles();
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

  const handleDoubleClick = (file: FileItem, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    setSelectedFile(file);
    
    if (isArchive(file.name)) {
      setShowArchivePreview(true);
    } else {
      setShowPreview(true);
    }
  };

  const totalPages = Math.ceil(totalFiles / pageSize);

  if (isLoading && currentPage === 1) {
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
          <h1 className="text-2xl font-bold text-gray-900">All Files</h1>
          <p className="text-gray-600 mt-1">Browse and manage all your files</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant={viewMode === 'list' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            <Grid className="w-4 h-4" />
          </Button>
        </div>
      </div>

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
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                {filePairs.length} items ({totalFiles} files total)
              </span>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedFiles.length === files.length && files.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Select All</span>
              </label>
            </div>
          </div>
        </div>

        {viewMode === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedFiles.length === files.length && files.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project
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
                {filePairs.map((pair) => {
                  const isPairSelected = pair.files.every(f => selectedFiles.includes(f.id));
                  return (
                    <tr 
                      key={pair.id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleSelectPair(pair)}
                      onDoubleClick={(e) => handleDoubleClick(pair.primaryFile, e)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isPairSelected}
                          onChange={() => {}}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {pair.displayName}
                          {pair.type === 'paired' && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Paired
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{pair.primaryFile.file_path}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {pair.primaryFile.project_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {pair.type === 'paired' 
                          ? `${pair.primaryFile.size_formatted} + ${pair.pairFile?.size_formatted || '0 Bytes'}`
                          : pair.primaryFile.size_formatted
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {pair.type === 'paired'
                          ? `${pair.primaryFile.content_type} + ${pair.pairFile?.content_type || ''}`
                          : pair.primaryFile.content_type
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(pair.primaryFile.uploaded_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div onClick={(e) => e.stopPropagation()}>
                          <div className="flex space-x-1">
                            {pair.files.map((file) => (
                              <FileActions
                                key={file.id}
                                fileId={file.id}
                                fileName={file.name}
                                contentType={file.content_type}
                                onDownload={() => handleDownloadFile(file.id, file.name)}
                                onDelete={async () => {
                                  if (confirm(`Delete ${file.name}?`)) {
                                    try {
                                      await apiService.deleteFile(file.id);
                                      await loadFiles();
                                    } catch (error) {
                                      console.error('Failed to delete file:', error);
                                    }
                                  }
                                }}
                                onPreviewComplete={loadFiles}
                              />
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {filePairs.map((pair) => {
                const isPairSelected = pair.files.every(f => selectedFiles.includes(f.id));
                return (
                  <div
                    key={pair.id}
                    className={`border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                      isPairSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                    }`}
                    onClick={() => handleSelectPair(pair)}
                    onDoubleClick={(e) => handleDoubleClick(pair.primaryFile, e)}
                  >
                    <div className="text-center">
                      <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3 relative">
                        <span className="text-xs font-medium text-gray-600">
                          {pair.primaryFile.name.split('.').pop()?.toUpperCase() || 'FILE'}
                        </span>
                        {pair.type === 'paired' && (
                          <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                            2
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-medium text-gray-900 truncate" title={pair.displayName}>
                        {pair.displayName}
                      </h3>
                      {pair.type === 'paired' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                          Paired
                        </span>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {pair.type === 'paired' 
                          ? `${pair.primaryFile.size_formatted} + ${pair.pairFile?.size_formatted || '0 Bytes'}`
                          : pair.primaryFile.size_formatted
                        }
                      </p>
                      <p className="text-xs text-gray-400 mt-1">{pair.primaryFile.project_name}</p>
                      
                      <div className="flex justify-center mt-3 space-x-1" onClick={(e) => e.stopPropagation()}>
                        {pair.files.map((file) => (
                          <FileActions
                            key={file.id}
                            fileId={file.id}
                            fileName={file.name}
                            contentType={file.content_type}
                            onDownload={() => handleDownloadFile(file.id, file.name)}
                            onDelete={async () => {
                              if (confirm(`Delete ${file.name}?`)) {
                                try {
                                  await apiService.deleteFile(file.id);
                                  await loadFiles();
                                } catch (error) {
                                  console.error('Failed to delete file:', error);
                                }
                              }
                            }}
                            onPreviewComplete={loadFiles}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {files.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <div className="text-gray-500">
              {searchTerm ? 'No files found matching your search' : 'No files found'}
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalFiles)} of {totalFiles} files
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="px-3 py-1 text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
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
            // Small delay to ensure database transaction is committed
            setTimeout(() => {
              loadFiles();
            }, 500);
          }}
        />
      )}
    </div>
  );
}