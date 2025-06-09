'use client';

import { useState, useEffect } from 'react';
import { Download, Clock, CheckCircle, AlertCircle, User, Calendar, Target } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { apiService } from '../../../lib/api';
import { Assignment } from '../../../types/workflow';
import { formatDate } from '../../../lib/utils';

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    loadAssignments();
    loadDashboard();
  }, [statusFilter]);

  const loadAssignments = async () => {
    try {
      const data = await apiService.getMyAssignments(statusFilter);
      setAssignments(data);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    }
  };

  const loadDashboard = async () => {
    try {
      const data = await apiService.getAssignmentDashboard();
      setDashboardData(data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPackage = async (assignmentId: string, batchName: string) => {
    try {
      const blob = await apiService.downloadAssignmentPackage(assignmentId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `assignment_${batchName}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Update status to downloaded
      await apiService.updateAssignmentStatus(assignmentId, {
        status: 'downloaded'
      });
      loadAssignments();
    } catch (error) {
      console.error('Failed to download package:', error);
    }
  };

  const handleUpdateStatus = async (assignmentId: string, status: string, notes?: string) => {
    try {
      await apiService.updateAssignmentStatus(assignmentId, {
        status,
        notes
      });
      loadAssignments();
      loadDashboard();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'assigned':
        return <Target className="w-5 h-5 text-blue-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'in_progress': return 'text-yellow-600 bg-yellow-100';
      case 'assigned': return 'text-blue-600 bg-blue-100';
      case 'downloaded': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const canDownload = (assignment: Assignment) => {
    return assignment.status === 'assigned' || assignment.status === 'downloaded';
  };

  const canStart = (assignment: Assignment) => {
    return assignment.status === 'downloaded';
  };

  const canComplete = (assignment: Assignment) => {
    return assignment.status === 'in_progress';
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assignments</h1>
        <p className="text-gray-600 mt-1">Track and manage your assigned tasks</p>
      </div>

      {dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="bg-blue-100 p-3 rounded-lg">
                <Target className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Assignments</p>
                <p className="text-2xl font-bold text-gray-900">{dashboardData.total_assignments}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="bg-green-100 p-3 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-gray-900">{dashboardData.completed_assignments}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="bg-purple-100 p-3 rounded-lg">
                <User className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Files Processed</p>
                <p className="text-2xl font-bold text-gray-900">{dashboardData.total_files_processed}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="bg-yellow-100 p-3 rounded-lg">
                <AlertCircle className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Avg Quality</p>
                <p className="text-2xl font-bold text-gray-900">{dashboardData.average_quality_score.toFixed(1)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Assignment List</h2>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Status</option>
              <option value="assigned">Assigned</option>
              <option value="downloaded">Downloaded</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="p-6 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(assignment.status)}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{assignment.batch_name}</h3>
                      <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
                        <span>{assignment.total_pairs} file pairs</span>
                        <span>{assignment.total_files} total files</span>
                        {assignment.estimated_completion_time && (
                          <span>{Math.round(assignment.estimated_completion_time / 60)} min estimated</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center space-x-6">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(assignment.status)}`}>
                      {assignment.status.replace('_', ' ')}
                    </span>
                    
                    {assignment.quality_score && (
                      <div className="flex items-center space-x-1">
                        <span className="text-sm text-gray-500">Quality:</span>
                        <span className="text-sm font-medium text-gray-900">{assignment.quality_score.toFixed(1)}/10</span>
                      </div>
                    )}
                    
                    {assignment.completed_at && (
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-500">Completed: {formatDate(assignment.completed_at)}</span>
                      </div>
                    )}
                  </div>

                  {assignment.completion_percentage > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                        <span>Progress</span>
                        <span>{assignment.completion_percentage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${assignment.completion_percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {assignment.notes && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-700">{assignment.notes}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-6">
                  {canDownload(assignment) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadPackage(assignment.id, assignment.batch_name)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  )}

                  {canStart(assignment) && (
                    <Button
                      size="sm"
                      onClick={() => handleUpdateStatus(assignment.id, 'in_progress')}
                    >
                      Start Work
                    </Button>
                  )}

                  {canComplete(assignment) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateStatus(assignment.id, 'completed')}
                    >
                      Mark Complete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {assignments.length === 0 && (
          <div className="text-center py-12">
            <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments found</h3>
            <p className="text-gray-500">You don't have any assignments yet. Check back later for new tasks.</p>
          </div>
        )}
      </div>
    </div>
  );
}