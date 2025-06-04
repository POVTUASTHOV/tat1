'use client';

import { useState, useEffect } from 'react';
import { Search, Download, Trash2, Filter, Grid, List } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { apiService } from '../../../lib/api';
import { FileItem } from '../../../types';
import { formatFileSize, formatDate } from '../../../lib/utils';

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFiles, setTotalFiles] = useState(0);

  const pageSize = 20;

  useEffect(() => {
    loadFiles();
  }, [currentPage, searchTerm]);

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

  const handleSelectFile = (fileId: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleSelectAll = () => {
    setSelectedFiles(
      selectedFiles.length === files.length
        ? []
        : files.map(file => file.id)
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
                {totalFiles} files total
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
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(file.id)}
                        onChange={() => handleSelectFile(file.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{file.name}</div>
                      <div className="text-sm text-gray-500">{file.file_path}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {file.project_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {file.size_formatted}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {file.content_type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(file.uploaded_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadFile(file.id, file.name)}
                      >
                    <Download className="w-4 h-4" />
                     </Button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
       ) : (
         <div className="p-6">
           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
             {files.map((file) => (
               <div
                 key={file.id}
                 className={`border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                   selectedFiles.includes(file.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                 }`}
                 onClick={() => handleSelectFile(file.id)}
               >
                 <div className="text-center">
                   <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3">
                     <span className="text-xs font-medium text-gray-600">
                       {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                     </span>
                   </div>
                   <h3 className="text-sm font-medium text-gray-900 truncate" title={file.name}>
                     {file.name}
                   </h3>
                   <p className="text-xs text-gray-500 mt-1">{file.size_formatted}</p>
                   <p className="text-xs text-gray-400 mt-1">{file.project_name}</p>
                   
                   <div className="flex justify-center mt-3">
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={(e) => {
                         e.stopPropagation();
                         handleDownloadFile(file.id, file.name);
                       }}
                     >
                       <Download className="w-3 h-3" />
                     </Button>
                   </div>
                 </div>
               </div>
             ))}
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

       {/* Pagination */}
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
   </div>
 );
}