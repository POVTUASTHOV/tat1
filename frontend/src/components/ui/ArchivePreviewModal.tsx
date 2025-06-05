'use client';

import { useState, useEffect } from 'react';
import { X, Archive, Download, FolderOpen, File, Loader2 } from 'lucide-react';
import Button from './Button';
import { apiService } from '../../lib/api';
import { formatFileSize, formatDate } from '../../lib/utils';

interface ArchivePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  onExtractComplete: () => void;
}

interface ArchiveContent {
  name: string;
  size: number;
  compressed_size: number;
  date_time: any;
  is_dir: boolean;
}

interface ArchiveData {
  archive_type: string;
  total_files: number;
  contents: ArchiveContent[];
}

export default function ArchivePreviewModal({ 
  isOpen, 
  onClose, 
  fileId, 
  fileName, 
  onExtractComplete 
}: ArchivePreviewModalProps) {
  const [archiveData, setArchiveData] = useState<ArchiveData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string>('');
  const [projects, setProjects] = useState<any[]>([]);
  const [extractOptions, setExtractOptions] = useState({
    targetProjectId: '',
    targetFolderId: '',
    createSubfolder: true
  });
  const [showExtractDialog, setShowExtractDialog] = useState(false);

  useEffect(() => {
    if (isOpen && fileId) {
      loadArchiveContents();
      loadProjects();
    }
  }, [isOpen, fileId]);

  const loadArchiveContents = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/media-preview/archive/${fileId}/contents/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load archive contents');
      }

      const data = await response.json();
      setArchiveData(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load archive');
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await apiService.getProjects();
      setProjects(response.projects);
      if (response.projects.length > 0) {
        setExtractOptions(prev => ({
          ...prev,
          targetProjectId: response.projects[0].id
        }));
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleExtract = async () => {
    if (!extractOptions.targetProjectId) {
      setError('Please select a target project');
      return;
    }

    setIsExtracting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/media-preview/archive/${fileId}/extract/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          target_project_id: extractOptions.targetProjectId,
          target_folder_id: extractOptions.targetFolderId || undefined,
          create_subfolder: extractOptions.createSubfolder
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Extraction failed');
      }

      const result = await response.json();
      setShowExtractDialog(false);
      onExtractComplete();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Extraction failed');
    } finally {
      setIsExtracting(false);
    }
  };

  const formatDateTime = (dateTime: any) => {
    if (Array.isArray(dateTime)) {
      const [year, month, day, hour, minute, second] = dateTime;
      return new Date(year, month - 1, day, hour, minute, second).toLocaleString();
    }
    if (typeof dateTime === 'number') {
      return new Date(dateTime * 1000).toLocaleString();
    }
    return 'Unknown';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-orange-100 p-2 rounded-lg">
                <Archive className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{fileName}</h2>
                {archiveData && (
                  <p className="text-sm text-gray-600">
                    {archiveData.archive_type.toUpperCase()} Archive • {archiveData.total_files} items
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {archiveData && (
                <Button
                  onClick={() => setShowExtractDialog(true)}
                  disabled={isExtracting}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Extract
                </Button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
                disabled={isExtracting}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && !showExtractDialog && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={loadArchiveContents}>Try Again</Button>
              </div>
            </div>
          )}

          {archiveData && !isLoading && (
            <div>
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Type:</span>
                    <span className="ml-2 font-medium">{archiveData.archive_type.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Files:</span>
                    <span className="ml-2 font-medium">{archiveData.total_files}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Total Size:</span>
                    <span className="ml-2 font-medium">
                      {formatFileSize(archiveData.contents.reduce((sum, item) => sum + item.size, 0))}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Compressed:</span>
                    <span className="ml-2 font-medium">
                      {formatFileSize(archiveData.contents.reduce((sum, item) => sum + item.compressed_size, 0))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900">Contents</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Size
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Compressed
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Modified
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {archiveData.contents.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-2">
                              {item.is_dir ? (
                                <FolderOpen className="w-4 h-4 text-blue-500" />
                              ) : (
                                <File className="w-4 h-4 text-gray-400" />
                              )}
                              <span className="text-sm font-medium text-gray-900 break-all">
                                {item.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {item.is_dir ? '-' : formatFileSize(item.size)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {item.is_dir ? '-' : formatFileSize(item.compressed_size)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDateTime(item.date_time)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showExtractDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Extract Archive</h3>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Project
                </label>
                <select
                  value={extractOptions.targetProjectId}
                  onChange={(e) => setExtractOptions(prev => ({ 
                    ...prev, 
                    targetProjectId: e.target.value,
                    targetFolderId: ''
                  }))}
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
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={extractOptions.createSubfolder}
                    onChange={(e) => setExtractOptions(prev => ({ 
                      ...prev, 
                      createSubfolder: e.target.checked 
                    }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Create subfolder for extracted files
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowExtractDialog(false);
                  setError('');
                }}
                disabled={isExtracting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleExtract}
                disabled={!extractOptions.targetProjectId || isExtracting}
                isLoading={isExtracting}
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  'Extract'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}