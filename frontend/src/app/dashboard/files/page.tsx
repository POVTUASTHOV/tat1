'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Download, Trash2, Grid, List, Filter, RefreshCw } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { apiService } from '../../../lib/api';
import { FileItem } from '../../../types';
import { formatFileSize, formatDate, createFilePairs, FilePair } from '../../../lib/utils';
import { useDebounce } from '../../../hooks/useDebounce';
import FileIcon from '../../../components/ui/FileIcon';

interface FileCache {
  [key: string]: FileItem[];
}

interface LoadingState {
  initial: boolean;
  loadingMore: boolean;
  refreshing: boolean;
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filePairs, setFilePairs] = useState<FilePair[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [loadingState, setLoadingState] = useState<LoadingState>({
    initial: true,
    loadingMore: false,
    refreshing: false
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFiles, setTotalFiles] = useState(0);
  const [hasMoreFiles, setHasMoreFiles] = useState(true);
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [useInfiniteScroll, setUseInfiniteScroll] = useState(false);
  
  // Caching and optimization
  const [fileCache, setFileCache] = useState<FileCache>({});
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  
  // Configuration - Optimized for weak servers
  const INITIAL_PAGE_SIZE = 20; // Reduced from 40 to 20 for faster initial load
  const LOAD_MORE_SIZE = 20;    // Reduced from 40 to 20 for smoother scrolling
  const TRADITIONAL_PAGE_SIZE = 20; // Keep at 20 for traditional pagination
  
  const debouncedSearchTerm = useDebounce(searchTerm, 500); // Increased debounce to reduce API calls

  // Effect to create file pairs when files change
  useEffect(() => {
    const pairs = createFilePairs(files);
    setFilePairs(pairs);
  }, [files]);

  // Effect for initial load and search changes
  useEffect(() => {
    loadInitialFiles();
  }, [debouncedSearchTerm, fileTypeFilter, sortBy, sortOrder]);

  // Effect for traditional pagination
  useEffect(() => {
    if (!useInfiniteScroll) {
      loadFiles();
    }
  }, [currentPage]);

  // Effect for infinite scroll observer
  useEffect(() => {
    if (!useInfiniteScroll || !observerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreFiles && !loadingState.loadingMore) {
          loadMoreFiles();
        }
      },
      { rootMargin: '50px' } // Reduced preload distance to save bandwidth
    );

    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMoreFiles, loadingState.loadingMore, useInfiniteScroll]);

  // Save scroll position when component unmounts
  useEffect(() => {
    return () => {
      if (scrollContainerRef.current) {
        setScrollPosition(scrollContainerRef.current.scrollTop);
      }
    };
  }, []);

  const buildCacheKey = (search: string, filter: string, sort: string, order: string) => {
    return `${search}-${filter}-${sort}-${order}`;
  };

  const loadInitialFiles = async () => {
    const cacheKey = buildCacheKey(debouncedSearchTerm, fileTypeFilter, sortBy, sortOrder);
    
    // Check cache first - with expiration
    if (fileCache[cacheKey] && !debouncedSearchTerm) {
      const cached = fileCache[cacheKey];
      if (cached.expires && Date.now() < cached.expires) {
        setFiles(cached.files || cached); // Support both new and old cache format
        setLoadingState({ initial: false, loadingMore: false, refreshing: false });
        return;
      }
    }

    try {
      setLoadingState({ initial: true, loadingMore: false, refreshing: false });
      setCurrentPage(1);
      
      if (!apiService.isAuthenticated()) {
        console.error('No authentication token found');
        window.location.href = '/login';
        return;
      }
      
      const pageSize = useInfiniteScroll ? INITIAL_PAGE_SIZE : TRADITIONAL_PAGE_SIZE;
      const response = await apiService.getAllFiles(1, pageSize, debouncedSearchTerm);
      
      setFiles(response.files);
      setTotalFiles(response.total);
      setHasMoreFiles(response.files.length < response.total);
      
      // Enhanced caching - cache for 5 minutes
      if (!debouncedSearchTerm) {
        const cacheEntry = {
          files: response.files,
          timestamp: Date.now(),
          expires: Date.now() + 5 * 60 * 1000 // 5 minutes
        };
        setFileCache(prev => ({ ...prev, [cacheKey]: cacheEntry }));
      }
      
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoadingState({ initial: false, loadingMore: false, refreshing: false });
    }
  };

  const loadMoreFiles = async () => {
    if (!hasMoreFiles || loadingState.loadingMore) return;

    try {
      setLoadingState({ initial: false, loadingMore: true, refreshing: false });
      
      const nextPage = Math.floor(files.length / LOAD_MORE_SIZE) + 1;
      const response = await apiService.getAllFiles(nextPage, LOAD_MORE_SIZE, debouncedSearchTerm);
      
      setFiles(prev => [...prev, ...response.files]);
      setHasMoreFiles(files.length + response.files.length < response.total);
      
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoadingState({ initial: false, loadingMore: false, refreshing: false });
    }
  };

  const loadFiles = async () => {
    try {
      setLoadingState({ initial: true, loadingMore: false, refreshing: false });
      
      if (!apiService.isAuthenticated()) {
        console.error('No authentication token found');
        window.location.href = '/login';
        return;
      }
      
      const response = await apiService.getAllFiles(currentPage, TRADITIONAL_PAGE_SIZE, debouncedSearchTerm);
      setFiles(response.files);
      setTotalFiles(response.total);
      
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoadingState({ initial: false, loadingMore: false, refreshing: false });
    }
  };

  const handleApiError = (error: unknown) => {
    console.error('Failed to load files:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Network Error')) {
        alert('Backend server is not running. Please start the Django backend server on port 8000.');
      } else if (error.message.includes('401') || error.message.includes('Authentication')) {
        console.error('Authentication failed, redirecting to login');
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
  };

  const refreshFiles = async () => {
    try {
      setLoadingState({ initial: false, loadingMore: false, refreshing: true });
      setFileCache({}); // Clear cache
      await loadInitialFiles();
    } finally {
      setLoadingState({ initial: false, loadingMore: false, refreshing: false });
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

  const totalPages = Math.ceil(totalFiles / TRADITIONAL_PAGE_SIZE);
  const isLoading = loadingState.initial;

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
          <div className="space-y-4">
            {/* Search and Actions Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-80"
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
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshFiles}
                  disabled={loadingState.refreshing}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loadingState.refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
              
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-500">
                  {useInfiniteScroll 
                    ? `${filePairs.length} items (${files.length} of ${totalFiles} files loaded)`
                    : `${filePairs.length} items (${totalFiles} files total)`
                  }
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
            
            {/* Filters and Controls Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <select
                    value={fileTypeFilter}
                    onChange={(e) => setFileTypeFilter(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Types</option>
                    <option value="image">Images</option>
                    <option value="video">Videos</option>
                    <option value="document">Documents</option>
                    <option value="archive">Archives</option>
                  </select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'name' | 'size' | 'date')}
                    className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="date">Date</option>
                    <option value="name">Name</option>
                    <option value="size">Size</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </Button>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">View:</span>
                <Button
                  variant={useInfiniteScroll ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setUseInfiniteScroll(true)}
                >
                  Infinite Scroll
                </Button>
                <Button
                  variant={!useInfiniteScroll ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setUseInfiniteScroll(false)}
                >
                  Pagination
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div ref={scrollContainerRef} className={useInfiniteScroll ? 'max-h-[70vh] overflow-y-auto' : ''}>
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
                    <tr key={pair.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isPairSelected}
                          onChange={() => handleSelectPair(pair)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <FileIcon 
                            fileName={pair.primaryFile.name}
                            contentType={pair.primaryFile.content_type}
                            size="md"
                            className="mr-3 flex-shrink-0"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {pair.displayName}
                              {pair.type === 'paired' && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                  Paired
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">{pair.primaryFile.file_path}</div>
                          </div>
                        </div>
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
                        <div className="flex space-x-1">
                          {pair.files.map((file) => (
                            <Button
                              key={`download-${file.id}`}
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadFile(file.id, file.name)}
                              title={`Download ${file.name}`}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          ))}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
              {filePairs.map((pair) => {
                const isPairSelected = pair.files.every(f => selectedFiles.includes(f.id));
                return (
                  <div
                    key={pair.id}
                    className={`border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-all cursor-pointer hover:bg-gray-50 ${
                      isPairSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                    }`}
                    onClick={() => handleSelectPair(pair)}
                  >
                    <div className="text-center">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2 relative">
                        <FileIcon 
                          fileName={pair.primaryFile.name}
                          contentType={pair.primaryFile.content_type}
                          size="md"
                        />
                        {pair.type === 'paired' && (
                          <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-3 h-3 flex items-center justify-center font-bold">
                            2
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs font-medium text-gray-900 truncate mb-1" title={pair.displayName}>
                        {pair.displayName}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {pair.type === 'paired' 
                          ? `${pair.primaryFile.size_formatted} + ${pair.pairFile?.size_formatted || '0 Bytes'}`
                          : pair.primaryFile.size_formatted
                        }
                      </p>
                      
                      <div className="flex justify-center mt-2 space-x-1">
                        {pair.files.map((file) => (
                          <button
                            key={`grid-download-${file.id}`}
                            className="p-1 rounded hover:bg-gray-200 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadFile(file.id, file.name);
                            }}
                            title={`Download ${file.name}`}
                          >
                            <Download className="w-3 h-3 text-gray-600" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading more indicator for infinite scroll */}
        {useInfiniteScroll && loadingState.loadingMore && (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-sm text-gray-500">Loading more files...</span>
          </div>
        )}
        
        {/* Intersection observer target for infinite scroll */}
        {useInfiniteScroll && hasMoreFiles && !loadingState.loadingMore && (
          <div ref={observerRef} className="h-4" />
        )}
        </div>

        {files.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <div className="text-gray-500">
              {searchTerm ? 'No files found matching your search' : 'No files found'}
            </div>
            {!searchTerm && (
              <Button 
                variant="primary" 
                className="mt-4"
                onClick={() => window.location.href = '/dashboard/projects'}
              >
                Upload Files
              </Button>
            )}
          </div>
        )}

        {/* Traditional pagination - only show when not using infinite scroll */}
        {!useInfiniteScroll && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {((currentPage - 1) * TRADITIONAL_PAGE_SIZE) + 1} to {Math.min(currentPage * TRADITIONAL_PAGE_SIZE, totalFiles)} of {totalFiles} files
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
        
        {/* Infinite scroll summary */}
        {useInfiniteScroll && files.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 text-center">
            <div className="text-sm text-gray-500">
              {files.length === totalFiles 
                ? `All ${totalFiles} files loaded`
                : `${files.length} of ${totalFiles} files loaded${hasMoreFiles ? ' - scroll for more' : ''}`
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}