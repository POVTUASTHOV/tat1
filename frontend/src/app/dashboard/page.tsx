// frontend/src/app/dashboard/page.tsx - Thêm GPU Status Widget

'use client';

import { useState, useEffect } from 'react';
import { HardDrive, FileText, Folder, Upload } from 'lucide-react';
import { apiService } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { StorageStats } from '../../types';
import { formatFileSize } from '../../lib/utils';
import GpuStatusWidget from '../../components/ui/GpuStatusWidget'; // Add this import

export default function DashboardPage() {
  const { user } = useAuth();
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStorageStats();
  }, []);

  const loadStorageStats = async () => {
    try {
      const stats = await apiService.getStorageStats();
      setStorageStats(stats);
    } catch (error) {
      console.error('Failed to load storage stats:', error);
    } finally {
      setIsLoading(false);
    }
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
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.username}!
        </h1>
        <p className="text-gray-600 mt-1">
          Here's an overview of your storage and files.
        </p>
      </div>

      {/* Stats Cards */}
      {storageStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Storage Used */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="bg-blue-100 p-3 rounded-lg">
                <HardDrive className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Storage Used</p>
                <p className="text-2xl font-bold text-gray-900">
                  {storageStats.storage.used_formatted}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {storageStats.storage.percentage.toFixed(1)}% used
                </span>
                <span className="text-gray-600">
                  {storageStats.storage.quota_formatted} total
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(storageStats.storage.percentage, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Total Files */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="bg-green-100 p-3 rounded-lg">
                <FileText className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Files</p>
                <p className="text-2xl font-bold text-gray-900">
                  {storageStats.overview.total_files.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Total Folders */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="bg-yellow-100 p-3 rounded-lg">
                <Folder className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Folders</p>
                <p className="text-2xl font-bold text-gray-900">
                  {storageStats.overview.total_folders.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Total Projects */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="bg-purple-100 p-3 rounded-lg">
                <Upload className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Projects</p>
                <p className="text-2xl font-bold text-gray-900">
                  {storageStats.overview.total_projects.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GPU Status Widget - Add this section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* Recent Projects - moved here */}
          {storageStats?.projects && storageStats.projects.length > 0 && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Recent Projects</h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {storageStats.projects.slice(0, 5).map((project) => (
                    <div key={project.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="bg-blue-100 p-2 rounded-lg">
                          <Folder className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900">{project.name}</h3>
                          <p className="text-sm text-gray-500">{project.description || 'No description'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {project.files_count} files
                        </p>
                        <p className="text-sm text-gray-500">
                          {project.total_size_formatted}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* GPU Status Widget */}
        <div>
          <GpuStatusWidget className="mb-6" />
          
          {/* System Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">System Info</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Video Processing</span>
                <span className="text-sm font-medium text-gray-900">Available</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Auto H.264 Conversion</span>
                <span className="text-sm font-medium text-green-600">Enabled</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Upload Format Support</span>
                <span className="text-sm font-medium text-gray-900">All formats</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* File Type Breakdown */}
      {storageStats?.overview.file_types && Object.keys(storageStats.overview.file_types).length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">File Types</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(storageStats.overview.file_types).map(([type, data]) => (
                <div key={type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 capitalize">{type}</p>
                    <p className="text-sm text-gray-500">{data.count} files</p>
                    {type === 'video' && (
                      <p className="text-xs text-blue-600">Auto-converted to H.264</p>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-700">
                    {formatFileSize(data.size)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}