'use client';

import { useState, useEffect } from 'react';
import { BarChart3, PieChart, TrendingUp, HardDrive, Calendar, Download } from 'lucide-react';
import { apiService } from '../../../lib/api';
import { StorageStats } from '../../../types';
import { formatFileSize } from '../../../lib/utils';

export default function AnalyticsPage() {
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      const stats = await apiService.getStorageStats();
      setStorageStats(stats);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getFileTypePercentage = (type: string, size: number) => {
    if (!storageStats?.storage.used) return 0;
    return (size / storageStats.storage.used) * 100;
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
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Monitor your storage usage and file statistics</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 3 months</option>
            <option value="1y">Last year</option>
          </select>
        </div>
      </div>

      {storageStats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                  <p className="text-xs text-gray-500">
                    {storageStats.storage.percentage.toFixed(1)}% of {storageStats.storage.quota_formatted}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="bg-green-100 p-3 rounded-lg">
                  <BarChart3 className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Files</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {storageStats.overview.total_files.toLocaleString()}
                  </p>
                  <p className="text-xs text-green-600">
                    +12% from last month
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="bg-yellow-100 p-3 rounded-lg">
                  <PieChart className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">File Types</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Object.keys(storageStats.overview.file_types).length}
                  </p>
                  <p className="text-xs text-gray-500">
                    Different file types
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Projects</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {storageStats.overview.total_projects}
                  </p>
                  <p className="text-xs text-purple-600">
                    +2 this month
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage Usage</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Used Storage</span>
                <span className="text-sm font-medium">{storageStats.storage.used_formatted}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(storageStats.storage.percentage, 100)}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>0 GB</span>
                <span>{storageStats.storage.quota_formatted}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">File Types Distribution</h3>
              <div className="space-y-4">
                {Object.entries(storageStats.overview.file_types)
                  .sort(([,a], [,b]) => b.size - a.size)
                  .slice(0, 5)
                  .map(([type, data]) => {
                    const percentage = getFileTypePercentage(type, data.size);
                    const colors = {
                      image: 'bg-green-500',
                      video: 'bg-purple-500',
                      application: 'bg-blue-500',
                      text: 'bg-yellow-500',
                      audio: 'bg-red-500',
                    };
                    const colorClass = colors[type as keyof typeof colors] || 'bg-gray-500';
                    
                    return (
                      <div key={type} className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${colorClass}`}></div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900 capitalize">{type}</span>
                            <span className="text-sm text-gray-500">{formatFileSize(data.size)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{data.count} files</span>
                            <span>{percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage by Project</h3>
              <div className="space-y-4">
                {storageStats.projects
                  .sort((a, b) => b.total_size - a.total_size)
                  .slice(0, 5)
                  .map((project) => {
                    const percentage = storageStats.storage.used > 0 
                      ? (project.total_size / storageStats.storage.used) * 100 
                      : 0;
                    
                    return (
                      <div key={project.id}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">{project.name}</span>
                          <span className="text-sm text-gray-500">{project.total_size_formatted}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                        <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                          <span>{project.files_count} files</span>
                          <span>{percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
              <button className="text-sm text-blue-600 hover:text-blue-800">View All</button>
            </div>
            
            <div className="space-y-4">
              {[
                { action: 'File uploaded', file: 'document.pdf', time: '2 hours ago', icon: 'upload' },
                { action: 'Project created', file: 'New Project', time: '1 day ago', icon: 'folder' },
                { action: 'File downloaded', file: 'image.jpg', time: '2 days ago', icon: 'download' },
                { action: 'File deleted', file: 'old_file.txt', time: '3 days ago', icon: 'delete' },
              ].map((activity, index) => (
                <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    {activity.icon === 'upload' && <TrendingUp className="w-4 h-4 text-blue-600" />}
                    {activity.icon === 'folder' && <PieChart className="w-4 h-4 text-blue-600" />}
                    {activity.icon === 'download' && <Download className="w-4 h-4 text-blue-600" />}
                    {activity.icon === 'delete' && <Calendar className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                    <p className="text-xs text-gray-500">{activity.file}</p>
                  </div>
                  <span className="text-xs text-gray-500">{activity.time}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}