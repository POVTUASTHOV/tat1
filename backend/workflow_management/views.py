from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse, Http404
from django.db import transaction
from django.db.models import Q, Count, Avg, Sum
from django.utils import timezone
from django.core.paginator import Paginator
import os
import logging

from .models import (
    FilePair, AssignmentBatch, Assignment, 
    AssignmentFile, UserProfile, FileWorkflow, ActivityLog, WorkloadSnapshot
)
from users.models import WorkflowRole, ProjectAssignment
from .serializers import (
    RoleSerializer, UserRoleSerializer, FilePairSerializer, AssignmentBatchSerializer,
    AssignmentSerializer, UserProfileSerializer, FileWorkflowSerializer, 
    ActivityLogSerializer, CreateAssignmentBatchSerializer, AssignTasksSerializer,
    UpdateAssignmentStatusSerializer, ReviewAssignmentSerializer, BulkAssignSerializer
)
from .permissions import (
    IsManagerOrAdmin, IsAdminOnly, IsEmployeeOrAbove, 
    CanAccessAssignment, ProjectAccessPermission
)
from .services import (
    FilePairingService, AssignmentService, ZipPackageService,
    WorkloadAnalyticsService, RoleManagementService
)
from storage.models import Project, File
from users.models import User

logger = logging.getLogger(__name__)

class RoleViewSet(viewsets.ModelViewSet):
    serializer_class = RoleSerializer
    permission_classes = [IsAdminOnly]
    
    def get_queryset(self):
        return WorkflowRole.objects.all()

class UserRoleViewSet(viewsets.ModelViewSet):
    serializer_class = UserRoleSerializer
    permission_classes = [IsManagerOrAdmin]
    
    def get_queryset(self):
        queryset = ProjectAssignment.objects.all()
        
        # Filter by project if user is not admin
        if not self.request.user.is_staff:
            user_projects = Project.objects.filter(
                Q(user=self.request.user) |
                Q(role_assignments__user=self.request.user, role_assignments__is_active=True)
            )
            queryset = queryset.filter(project__in=user_projects)
        
        return queryset.select_related('user', 'role', 'project', 'assigned_by')
    
    @action(detail=False, methods=['post'])
    def assign_role(self, request):
        """Assign role to user"""
        user_id = request.data.get('user_id')
        role_name = request.data.get('role_name')
        project_id = request.data.get('project_id')
        
        try:
            user = User.objects.get(id=user_id)
            project = Project.objects.get(id=project_id) if project_id else None
            
            user_role = RoleManagementService.assign_user_role(
                user=user,
                role_name=role_name,
                project=project,
                assigned_by=request.user
            )
            
            serializer = self.get_serializer(user_role)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except (User.DoesNotExist, Project.DoesNotExist, WorkflowRole.DoesNotExist) as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Deactivate user role"""
        user_role = self.get_object()
        user_role.is_active = False
        user_role.save()
        
        return Response({'message': 'Role deactivated successfully'})

class FilePairViewSet(viewsets.ModelViewSet):
    serializer_class = FilePairSerializer
    permission_classes = [IsEmployeeOrAbove]
    
    def get_queryset(self):
        queryset = FilePair.objects.all()
        
        # Filter by project access
        if not self.request.user.is_staff:
            user_projects = Project.objects.filter(
                Q(user=self.request.user) |
                Q(role_assignments__user=self.request.user, role_assignments__is_active=True)
            )
            queryset = queryset.filter(project__in=user_projects)
        
        project_id = self.request.query_params.get('project_id')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        
        return queryset.select_related('primary_file', 'secondary_file', 'project')
    
    @action(detail=False, methods=['post'])
    def auto_pair(self, request):
        """Automatically create file pairs for a project"""
        project_id = request.data.get('project_id')
        pair_type = request.data.get('pair_type', 'image_json')
        
        try:
            project = Project.objects.get(id=project_id)
            
            # Check project access
            if not ProjectAccessPermission().has_object_permission(request, None, project):
                return Response({'error': 'No access to this project'}, 
                              status=status.HTTP_403_FORBIDDEN)
            
            pairs = FilePairingService.create_pairs_for_project(project, pair_type)
            
            serializer = self.get_serializer(pairs, many=True)
            return Response({
                'pairs_created': len(pairs),
                'pairs': serializer.data
            })
            
        except Project.DoesNotExist:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=False, methods=['get'])
    def available_for_assignment(self, request):
        """Get file pairs available for assignment"""
        project_id = request.query_params.get('project_id')
        
        if not project_id:
            return Response({'error': 'project_id is required'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        queryset = self.get_queryset().filter(
            project_id=project_id,
            assignments__isnull=True,
            status='paired'
        )
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

class AssignmentBatchViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentBatchSerializer
    permission_classes = [IsManagerOrAdmin]
    
    def get_queryset(self):
        queryset = AssignmentBatch.objects.all()
        
        # Filter by project access
        if not self.request.user.is_staff:
            user_projects = Project.objects.filter(
                Q(user=self.request.user) |
                Q(role_assignments__user=self.request.user, 
                  role_assignments__role__name__in=['admin', 'manager'],
                  role_assignments__is_active=True)
            )
            queryset = queryset.filter(project__in=user_projects)
        
        project_id = self.request.query_params.get('project_id')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        
        return queryset.select_related('project', 'manager').prefetch_related('assignments')
    
    @action(detail=False, methods=['post'])
    def create_batch(self, request):
        """Create new assignment batch"""
        serializer = CreateAssignmentBatchSerializer(data=request.data)
        
        if serializer.is_valid():
            try:
                project = Project.objects.get(id=serializer.validated_data['project_id'])
                
                # Check project access
                if not ProjectAccessPermission().has_object_permission(request, None, project):
                    return Response({'error': 'No access to this project'}, 
                                  status=status.HTTP_403_FORBIDDEN)
                
                batch = AssignmentService.create_batch(
                    project=project,
                    manager=request.user,
                    name=serializer.validated_data['name'],
                    file_pair_ids=serializer.validated_data['file_pair_ids'],
                    description=serializer.validated_data.get('description', ''),
                    deadline=serializer.validated_data.get('deadline'),
                    priority=serializer.validated_data.get('priority', 1)
                )
                
                response_serializer = self.get_serializer(batch)
                return Response(response_serializer.data, status=status.HTTP_201_CREATED)
                
            except Project.DoesNotExist:
                return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
            except Exception as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def assign_tasks(self, request, pk=None):
        """Assign tasks to users"""
        batch = self.get_object()
        serializer = AssignTasksSerializer(data=request.data)
        
        if serializer.is_valid():
            try:
                assignments = AssignmentService.assign_tasks(
                    batch=batch,
                    user_assignments=serializer.validated_data['assignments']
                )
                
                assignment_serializer = AssignmentSerializer(assignments, many=True)
                return Response({
                    'assignments_created': len(assignments),
                    'assignments': assignment_serializer.data
                })
                
            except Exception as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def auto_assign(self, request, pk=None):
        """Auto-assign tasks with load balancing"""
        batch = self.get_object()
        serializer = BulkAssignSerializer(data=request.data)
        
        if serializer.is_valid():
            try:
                user_ids = [ua['user_id'] for ua in serializer.validated_data['user_assignments']]
                users = User.objects.filter(id__in=user_ids)
                
                if serializer.validated_data.get('auto_balance', True):
                    assignments = AssignmentService.auto_balance_workload(batch, users)
                else:
                    assignments = AssignmentService.assign_tasks(
                        batch, serializer.validated_data['user_assignments']
                    )
                
                assignment_serializer = AssignmentSerializer(assignments, many=True)
                return Response({
                    'assignments_created': len(assignments),
                    'assignments': assignment_serializer.data
                })
                
            except Exception as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def progress(self, request, pk=None):
        """Get batch progress details"""
        batch = self.get_object()
        
        assignments = batch.assignments.all()
        total_assignments = assignments.count()
        
        status_counts = {}
        for assignment in assignments:
            status_name = assignment.status
            status_counts[status_name] = status_counts.get(status_name, 0) + 1
        
        completion_percentage = batch.get_completion_percentage()
        
        # Calculate estimated completion time
        active_assignments = assignments.filter(status__in=['assigned', 'downloaded', 'in_progress'])
        total_estimated_hours = sum(
            assignment.get_estimated_completion_time() or 0 
            for assignment in active_assignments
        ) / 3600  # Convert to hours
        
        return Response({
            'batch_id': str(batch.id),
            'total_assignments': total_assignments,
            'completion_percentage': completion_percentage,
            'status_breakdown': status_counts,
            'estimated_completion_hours': total_estimated_hours,
            'deadline': batch.deadline.isoformat() if batch.deadline else None,
            'is_overdue': batch.deadline and batch.deadline < timezone.now() if batch.deadline else False
        })

class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer
    permission_classes = [IsEmployeeOrAbove, CanAccessAssignment]
    
    def get_queryset(self):
        queryset = Assignment.objects.all()
        
        # Filter based on user role
        if not self.request.user.is_staff:
            # Employees see only their assignments
            # Managers see assignments in their projects
            user_roles = ProjectAssignment.objects.filter(
                user=self.request.user, 
                is_active=True
            ).values_list('role__name', flat=True)
            
            if 'admin' in user_roles:
                pass  # Admin sees all
            elif 'manager' in user_roles:
                managed_projects = Project.objects.filter(
                    Q(user=self.request.user) |
                    Q(role_assignments__user=self.request.user,
                      role_assignments__role__name='manager',
                      role_assignments__is_active=True)
                )
                queryset = queryset.filter(
                    Q(user=self.request.user) |
                    Q(batch__project__in=managed_projects)
                )
            else:
                queryset = queryset.filter(user=self.request.user)
        
        # Filter parameters
        batch_id = self.request.query_params.get('batch_id')
        if batch_id:
            queryset = queryset.filter(batch_id=batch_id)
        
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        user_id = self.request.query_params.get('user_id')
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        
        return queryset.select_related('batch', 'user', 'reviewer').prefetch_related('assignment_files')
    
    @action(detail=True, methods=['post'])
    def download_package(self, request, pk=None):
        """Download assignment ZIP package"""
        assignment = self.get_object()
        
        # Check if user can download this assignment
        if assignment.user != request.user and not IsManagerOrAdmin().has_permission(request, None):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        try:
            # Create ZIP if not exists
            if not assignment.zip_path or not os.path.exists(assignment.zip_path):
                zip_path = ZipPackageService.create_assignment_zip(assignment)
            else:
                zip_path = assignment.zip_path
            
            # Update download status
            if assignment.status == 'assigned':
                assignment.status = 'downloaded'
                assignment.downloaded_at = timezone.now()
                assignment.save()
            
            # Serve file
            with open(zip_path, 'rb') as f:
                response = HttpResponse(f.read(), content_type='application/zip')
                response['Content-Disposition'] = f'attachment; filename="assignment_{assignment.id}.zip"'
                return response
                
        except Exception as e:
            logger.error(f"Error creating assignment package: {e}")
            return Response({'error': 'Failed to create package'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Update assignment status"""
        assignment = self.get_object()
        serializer = UpdateAssignmentStatusSerializer(data=request.data)
        
        if serializer.is_valid():
            assignment.status = serializer.validated_data['status']
            assignment.notes = serializer.validated_data.get('notes', assignment.notes)
            
            if 'quality_score' in serializer.validated_data:
                assignment.quality_score = serializer.validated_data['quality_score']
            
            # Update timestamps
            now = timezone.now()
            if assignment.status == 'downloaded' and not assignment.downloaded_at:
                assignment.downloaded_at = now
            elif assignment.status == 'in_progress' and not assignment.started_at:
                assignment.started_at = now
            elif assignment.status == 'completed' and not assignment.completed_at:
                assignment.completed_at = now
            
            assignment.save()
            
            response_serializer = self.get_serializer(assignment)
            return Response(response_serializer.data)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        """Review assignment (manager/admin only)"""
        assignment = self.get_object()
        
        if not IsManagerOrAdmin().has_permission(request, None):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = ReviewAssignmentSerializer(data=request.data)
        
        if serializer.is_valid():
            assignment.status = serializer.validated_data['status']
            assignment.reviewer = request.user
            assignment.reviewed_at = timezone.now()
            assignment.notes = serializer.validated_data.get('comments', assignment.notes)
            
            if 'quality_rating' in serializer.validated_data:
                assignment.quality_score = serializer.validated_data['quality_rating']
            
            assignment.save()
            
            response_serializer = self.get_serializer(assignment)
            return Response(response_serializer.data)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def my_assignments(self, request):
        """Get current user's assignments"""
        queryset = self.get_queryset().filter(user=request.user)
        
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Get assignment dashboard data"""
        user = request.user
        
        # Get user assignments
        user_assignments = Assignment.objects.filter(user=user)
        
        # Status breakdown
        status_counts = {}
        for assignment in user_assignments:
            status_name = assignment.status
            status_counts[status_name] = status_counts.get(status_name, 0) + 1
        
        # Recent activity
        recent_assignments = user_assignments.order_by('-updated_at')[:5]
        
        # Performance metrics
        completed_assignments = user_assignments.filter(status='completed')
        avg_quality = completed_assignments.aggregate(
            avg_quality=Avg('quality_score')
        )['avg_quality'] or 0
        
        total_files_processed = sum(
            assignment.assignment_files.filter(status='completed').count()
            for assignment in completed_assignments
        )
        
        return Response({
            'status_breakdown': status_counts,
            'total_assignments': user_assignments.count(),
            'completed_assignments': completed_assignments.count(),
            'average_quality_score': round(avg_quality, 2),
            'total_files_processed': total_files_processed,
            'recent_assignments': AssignmentSerializer(recent_assignments, many=True).data
        })

class UserProfileViewSet(viewsets.ModelViewSet):
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = UserProfile.objects.all()
        
        # Users can only see their own profile, managers can see team profiles
        if not IsManagerOrAdmin().has_permission(self.request, None):
            queryset = queryset.filter(user=self.request.user)
        
        return queryset.select_related('user')
    
    @action(detail=False, methods=['get'])
    def my_profile(self, request):
        """Get current user's profile"""
        profile, created = UserProfile.objects.get_or_create(user=request.user)
        serializer = self.get_serializer(profile)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def workload_report(self, request, pk=None):
        """Get user workload report"""
        profile = self.get_object()
        days = int(request.query_params.get('days', 30))
        
        report = WorkloadAnalyticsService.generate_user_workload_report(
            profile.user, days
        )
        
        return Response(report)

class FileWorkflowViewSet(viewsets.ModelViewSet):
    serializer_class = FileWorkflowSerializer
    permission_classes = [IsEmployeeOrAbove]
    
    def get_queryset(self):
        return FileWorkflow.objects.all().select_related(
            'assignment_file__assignment__user',
            'assignment_file__file_pair',
            'reviewer'
        )

class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ActivityLogSerializer
    permission_classes = [IsEmployeeOrAbove]
    
    def get_queryset(self):
        queryset = ActivityLog.objects.all()
        
        # Filter by user permissions
        if not IsManagerOrAdmin().has_permission(self.request, None):
            queryset = queryset.filter(user=self.request.user)
        
        # Filter parameters
        user_id = self.request.query_params.get('user_id')
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        
        project_id = self.request.query_params.get('project_id')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        
        action = self.request.query_params.get('action')
        if action:
            queryset = queryset.filter(action=action)
        
        return queryset.select_related('user', 'project')

class WorkflowAnalyticsViewSet(viewsets.ViewSet):
    permission_classes = [IsManagerOrAdmin]
    
    @action(detail=False, methods=['get'])
    def project_overview(self, request):
        """Get project workflow overview"""
        project_id = request.query_params.get('project_id')
        
        if not project_id:
            return Response({'error': 'project_id is required'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        try:
            project = Project.objects.get(id=project_id)
            
            # Check project access
            if not ProjectAccessPermission().has_object_permission(request, None, project):
                return Response({'error': 'No access to this project'}, 
                              status=status.HTTP_403_FORBIDDEN)
            
            # Get project statistics
            batches = AssignmentBatch.objects.filter(project=project)
            assignments = Assignment.objects.filter(batch__project=project)
            
            # Status breakdown
            batch_status_counts = {}
            assignment_status_counts = {}
            
            for batch in batches:
                status = batch.status
                batch_status_counts[status] = batch_status_counts.get(status, 0) + 1
            
            for assignment in assignments:
                status = assignment.status
                assignment_status_counts[status] = assignment_status_counts.get(status, 0) + 1
            
            # Performance metrics
            completed_assignments = assignments.filter(status='completed')
            avg_quality = completed_assignments.aggregate(
                avg_quality=Avg('quality_score')
            )['avg_quality'] or 0
            
            # Workload distribution
            user_workloads = {}
            for assignment in assignments.filter(status__in=['assigned', 'downloaded', 'in_progress']):
                user = assignment.user
                if user.username not in user_workloads:
                    user_workloads[user.username] = {
                        'active_assignments': 0,
                        'total_files': 0
                    }
                user_workloads[user.username]['active_assignments'] += 1
                user_workloads[user.username]['total_files'] += assignment.total_files
            
            return Response({
                'project_name': project.name,
                'total_batches': batches.count(),
                'total_assignments': assignments.count(),
                'batch_status_breakdown': batch_status_counts,
                'assignment_status_breakdown': assignment_status_counts,
                'average_quality_score': round(avg_quality, 2),
                'user_workloads': user_workloads,
                'completion_rate': (completed_assignments.count() / assignments.count() * 100) if assignments.count() > 0 else 0
            })
            
        except Project.DoesNotExist:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=False, methods=['get'])
    def workload_balance(self, request):
        """Get workload balance suggestions"""
        project_id = request.query_params.get('project_id')
        
        if not project_id:
            return Response({'error': 'project_id is required'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        try:
            project = Project.objects.get(id=project_id)
            suggestions = WorkloadAnalyticsService.suggest_workload_rebalancing(project)
            
            return Response(suggestions)
            
        except Project.DoesNotExist:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=False, methods=['get'])
    def team_performance(self, request):
        """Get team performance analytics"""
        project_id = request.query_params.get('project_id')
        days = int(request.query_params.get('days', 30))
        
        if not project_id:
            return Response({'error': 'project_id is required'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        try:
            project = Project.objects.get(id=project_id)
            
            # Get project team members
            team_users = User.objects.filter(
                assignments__batch__project=project
            ).distinct()
            
            team_performance = []
            for user in team_users:
                report = WorkloadAnalyticsService.generate_user_workload_report(user, days)
                report['username'] = user.username
                team_performance.append(report)
            
            # Sort by performance metrics
            team_performance.sort(key=lambda x: x['avg_quality_score'], reverse=True)
            
            return Response({
                'project_name': project.name,
                'period_days': days,
                'team_performance': team_performance
            })
            
        except Project.DoesNotExist:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)