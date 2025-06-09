'use client';

import { useState, useEffect } from 'react';
import { Plus, Users, Target, BarChart3, Activity, Search, Filter } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { apiService } from '../../../lib/api';
import { AssignmentBatch, Assignment, ProjectAnalytics } from '../../../types/workflow';
import { Project } from '../../../types';
import { formatDate } from '../../../lib/utils';

export default function WorkflowPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [batches, setBatches] = useState<AssignmentBatch[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadProjectData();
    }
  }, [selectedProject]);

  const loadInitialData = async () => {
    try {
      const projectsResponse = await apiService.getProjects();
      setProjects(projectsResponse.projects);
      
      if (projectsResponse.projects.length > 0) {
        setSelectedProject(projectsResponse.projects[0].id);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjectData = async () => {
    if (!selectedProject) return;

    try {
      const [batchesData, assignmentsData, analyticsData] = await Promise.all([
        apiService.getAssignmentBatches(selectedProject),
        apiService.getAssignments({ project_id: selectedProject }),
        apiService.getProjectOverview(selectedProject)
      ]);

      setBatches(batchesData);
      setAssignments(assignmentsData);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Failed to load project data:', error);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Management</h1>
          <p className="text-gray-600 mt-1">Manage assignments, batches, and team workflow</p>
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
          {activeTab === 'overview' && analytics && (
            <div className="space-y-6">
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Batch Status</h3>
                  <div className="space-y-3">
                    {Object.entries(analytics.batch_status_breakdown).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(status).split(' ')[1]}`}></div>
                          <span className="text-sm font-medium text-gray-900 capitalize">{status}</span>
                        </div>
                        <span className="text-sm text-gray-600">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Assignment Status</h3>
                  <div className="space-y-3">
                    {Object.entries(analytics.assignment_status_breakdown).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(status).split(' ')[1]}`}></div>
                          <span className="text-sm font-medium text-gray-900 capitalize">{status.replace('_', ' ')}</span>
                        </div>
                        <span className="text-sm text-gray-600">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Workload</h3>
                <div className="space-y-3">
                  {Object.entries(analytics.user_workloads).map(([username, workload]) => (
                    <div key={username} className="flex items-center justify-between p-3 bg-white rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{username}</p>
                        <p className="text-sm text-gray-500">{workload.active_assignments} active assignments</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{workload.total_files} files</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'batches' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Assignment Batches</h3>
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search batches..."
                      className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <Button variant="outline" size="sm">
                    <Filter className="w-4 h-4 mr-2" />
                    Filter
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {batches.map((batch) => (
                  <div key={batch.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h4 className="text-lg font-semibold text-gray-900">{batch.name}</h4>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(batch.status)}`}>
                            {batch.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{batch.description}</p>
                        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                          <span>{batch.total_pairs} pairs</span>
                          <span>{batch.assignments_count} assignments</span>
                          <span>{batch.completion_percentage.toFixed(1)}% complete</span>
                          {batch.deadline && <span>Due: {formatDate(batch.deadline)}</span>}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm">
                          View Details
                        </Button>
                        {batch.status === 'draft' && (
                         <Button size="sm">
                           Assign Tasks
                         </Button>
                       )}
                     </div>
                   </div>
                   
                   {batch.completion_percentage > 0 && (
                     <div className="mt-3">
                       <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                         <span>Progress</span>
                         <span>{batch.completion_percentage.toFixed(1)}%</span>
                       </div>
                       <div className="w-full bg-gray-200 rounded-full h-2">
                         <div
                           className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                           style={{ width: `${batch.completion_percentage}%` }}
                         ></div>
                       </div>
                     </div>
                   )}
                 </div>
               ))}
             </div>

             {batches.length === 0 && (
               <div className="text-center py-12">
                 <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                 <h3 className="text-lg font-medium text-gray-900 mb-2">No batches found</h3>
                 <p className="text-gray-500 mb-4">Create your first assignment batch to get started</p>
                 <Button>
                   <Plus className="w-4 h-4 mr-2" />
                   Create Batch
                 </Button>
               </div>
             )}
           </div>
         )}

         {activeTab === 'assignments' && (
           <div className="space-y-4">
             <div className="flex items-center justify-between">
               <h3 className="text-lg font-semibold text-gray-900">Assignments</h3>
               <div className="flex items-center space-x-2">
                 <select className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm">
                   <option value="">All Status</option>
                   <option value="assigned">Assigned</option>
                   <option value="in_progress">In Progress</option>
                   <option value="completed">Completed</option>
                   <option value="reviewed">Reviewed</option>
                 </select>
               </div>
             </div>

             <div className="overflow-x-auto">
               <table className="w-full">
                 <thead className="bg-gray-50">
                   <tr>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                       Assignment
                     </th>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                       Assignee
                     </th>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                       Progress
                     </th>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                       Status
                     </th>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                       Quality
                     </th>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                       Actions
                     </th>
                   </tr>
                 </thead>
                 <tbody className="bg-white divide-y divide-gray-200">
                   {assignments.map((assignment) => (
                     <tr key={assignment.id} className="hover:bg-gray-50">
                       <td className="px-6 py-4 whitespace-nowrap">
                         <div>
                           <div className="text-sm font-medium text-gray-900">{assignment.batch_name}</div>
                           <div className="text-sm text-gray-500">{assignment.total_pairs} pairs • {assignment.total_files} files</div>
                         </div>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                         <div className="text-sm font-medium text-gray-900">{assignment.user_name}</div>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                         <div className="w-full bg-gray-200 rounded-full h-2">
                           <div
                             className="bg-green-600 h-2 rounded-full"
                             style={{ width: `${assignment.completion_percentage}%` }}
                           ></div>
                         </div>
                         <div className="text-xs text-gray-500 mt-1">{assignment.completion_percentage.toFixed(1)}%</div>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                         <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(assignment.status)}`}>
                           {assignment.status.replace('_', ' ')}
                         </span>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                         {assignment.quality_score ? (
                           <div className="text-sm font-medium text-gray-900">{assignment.quality_score.toFixed(1)}/10</div>
                         ) : (
                           <span className="text-sm text-gray-400">-</span>
                         )}
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                         <Button variant="outline" size="sm">
                           View Details
                         </Button>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>

             {assignments.length === 0 && (
               <div className="text-center py-12">
                 <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                 <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments found</h3>
                 <p className="text-gray-500">Assignments will appear here once batches are created and tasks are assigned</p>
               </div>
             )}
           </div>
         )}

         {activeTab === 'activity' && (
           <div className="space-y-4">
             <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
             
             <div className="space-y-3">
               {[
                 { action: 'Batch created', user: 'John Manager', time: '2 hours ago', details: 'Image Processing Batch #1' },
                 { action: 'Tasks assigned', user: 'John Manager', time: '1 hour ago', details: '15 assignments to team members' },
                 { action: 'Assignment completed', user: 'Alice Worker', time: '30 minutes ago', details: 'Batch #1 - Task A' },
                 { action: 'Quality review', user: 'John Manager', time: '15 minutes ago', details: 'Approved with score 8.5/10' },
               ].map((activity, index) => (
                 <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                   <div className="bg-blue-100 p-2 rounded-lg">
                     <Activity className="w-4 h-4 text-blue-600" />
                   </div>
                   <div className="flex-1">
                     <div className="flex items-center space-x-2">
                       <span className="text-sm font-medium text-gray-900">{activity.action}</span>
                       <span className="text-sm text-gray-500">by {activity.user}</span>
                     </div>
                     <p className="text-sm text-gray-600">{activity.details}</p>
                     <p className="text-xs text-gray-400">{activity.time}</p>
                   </div>
                 </div>
               ))}
             </div>
           </div>
         )}
       </div>
     </div>
   </div>
 );
}