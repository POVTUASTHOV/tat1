'use client';

import { useState, useEffect } from 'react';
import { Plus, Users, Target, BarChart3, Activity, Search, Filter, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import { apiService } from '../../lib/api';
import { AssignmentBatch, Assignment, ProjectAnalytics } from '../../types/workflow';
import { Project } from '../../types';
import { formatDate } from '../../lib/utils';

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [batches, setBatches] = useState<AssignmentBatch[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [hasWorkflowAccess, setHasWorkflowAccess] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedProject && hasWorkflowAccess) {
      loadProjectData();
    } else {
      setBatches([]);
      setAssignments([]);
      setAnalytics(null);
    }
  }, [selectedProject, hasWorkflowAccess]);

  const loadInitialData = async () => {
    try {
      setError('');
      const projectsResponse = await apiService.getProjects();
      setProjects(projectsResponse.projects);
      
      if (projectsResponse.projects.length > 0) {
        setSelectedProject(projectsResponse.projects[0].id);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
      setError('Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjectData = async () => {
    if (!selectedProject) return;

    try {
      setError('');
      
      const results = await Promise.allSettled([
        apiService.getAssignmentBatches(selectedProject),
        apiService.getAssignments({ project_id: selectedProject }),
        apiService.getProjectOverview(selectedProject)
      ]);

      const [batchesResult, assignmentsResult, analyticsResult] = results;

      let hasAnySuccess = false;

      if (batchesResult.status === 'fulfilled') {
        setBatches(batchesResult.value);
        hasAnySuccess = true;
      } else {
        console.error('Failed to load batches:', batchesResult.reason);
      }

      if (assignmentsResult.status === 'fulfilled') {
        setAssignments(assignmentsResult.value);
        hasAnySuccess = true;
      } else {
        console.error('Failed to load assignments:', assignmentsResult.reason);
      }

      if (analyticsResult.status === 'fulfilled') {
        setAnalytics(analyticsResult.value);
        hasAnySuccess = true;
      } else {
        console.error('Failed to load analytics:', analyticsResult.reason);
      }

      if (!hasAnySuccess) {
        setHasWorkflowAccess(false);
        setError('You do not have permission to access workflow data. Please contact an administrator.');
      }
    } catch (error) {
      console.error('Failed to load project data:', error);
      setHasWorkflowAccess(false);
      setError('Failed to load workflow data. Please check your permissions.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'active': return 'text-blue-600 bg-blue-100';
      case 'in_progress': return 'text-yellow-600 bg-yellow-100';
      case 'cancelled': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const tabs = [
    { id: 'overview', name: 'Overview', icon: BarChart3 },
    { id: 'batches', name: 'Batches', icon: Target },
    { id: 'assignments', name: 'Assignments', icon: Users },
    { id: 'activity', name: 'Activity', icon: Activity },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!hasWorkflowAccess || error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Overview of your workflow and projects</p>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="text-lg font-semibold text-red-900">Access Denied</h3>
              <p className="text-red-700 mt-1">{error || 'You do not have permission to access workflow features.'}</p>
              <p className="text-red-600 text-sm mt-2">
                You need workflow permissions to access this feature. Contact your administrator to:
              </p>
              <ul className="text-red-600 text-sm mt-2 ml-4 list-disc">
                <li>Assign you a workflow role (admin, manager, or employee)</li>
                <li>Grant you access to specific projects</li>
                <li>Enable workflow permissions for your account</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Overview of your workflow and projects</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select Project</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Batch
          </Button>
        </div>
      </div>

      {selectedProject && (
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.name}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {analytics ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex items-center">
                          <div className="bg-blue-100 p-2 rounded-lg">
                            <Target className="w-6 h-6 text-blue-600" />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">Total Batches</p>
                            <p className="text-2xl font-bold text-gray-900">{analytics.total_batches}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-green-50 rounded-lg p-4">
                        <div className="flex items-center">
                          <div className="bg-green-100 p-2 rounded-lg">
                            <Users className="w-6 h-6 text-green-600" />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">Total Assignments</p>
                            <p className="text-2xl font-bold text-gray-900">{analytics.total_assignments}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-purple-50 rounded-lg p-4">
                        <div className="flex items-center">
                          <div className="bg-purple-100 p-2 rounded-lg">
                            <BarChart3 className="w-6 h-6 text-purple-600" />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">Completion Rate</p>
                            <p className="text-2xl font-bold text-gray-900">{analytics.completion_rate.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-yellow-50 rounded-lg p-4">
                        <div className="flex items-center">
                          <div className="bg-yellow-100 p-2 rounded-lg">
                            <Activity className="w-6 h-6 text-yellow-600" />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">Avg Quality</p>
                            <p className="text-2xl font-bold text-gray-900">{analytics.average_quality_score.toFixed(1)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No workflow data available</h3>
                    <p className="text-gray-500">Create some batches and assignments to see analytics</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'batches' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Assignment Batches</h3>
                </div>

                {batches.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {batches.map((batch) => (
                      <div key={batch.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-lg font-semibold text-gray-900">{batch.name}</h4>
                            <p className="text-sm text-gray-600">{batch.description}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(batch.status)}`}>
                            {batch.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No batches found</h3>
                    <p className="text-gray-500">Create your first assignment batch to get started</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'assignments' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Assignments</h3>
                
                {assignments.length > 0 ? (
                  <div className="space-y-3">
                    {assignments.map((assignment) => (
                      <div key={assignment.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-900">{assignment.batch_name}</h4>
                            <p className="text-sm text-gray-600">{assignment.user_name}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(assignment.status)}`}>
                            {assignment.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments found</h3>
                    <p className="text-gray-500">Assignments will appear here once batches are created</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="text-center py-12">
                <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No activity data</h3>
                <p className="text-gray-500">Activity logs will appear here as work progresses</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedProject && projects.length > 0 && (
        <div className="text-center py-12">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Select a project</h3>
          <p className="text-gray-500">Choose a project from the dropdown to view workflow data</p>
        </div>
      )}
    </div>
  );
}