from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
import os
import shutil
from .models import Folder, File, ChunkedUpload, Project, Assignment, FileStatus
from .serializers import (
    FolderSerializer, FileSerializer, ChunkUploadSerializer, 
    CompleteUploadSerializer, ProjectSerializer, ProjectTreeSerializer,
    AssignmentSerializer, CreateAssignmentSerializer, UpdateAssignmentStatusSerializer,
    FileWithAssignmentSerializer, ProjectAssignmentSerializer
)
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.core.exceptions import ValidationError

class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Project.objects.filter(user=self.request.user)
    
    @action(detail=True, methods=['get'])
    def tree(self, request, pk=None):
        project = self.get_object()
        serializer = ProjectTreeSerializer(project, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def folders(self, request, pk=None):
        project = self.get_object()
        parent_id = request.query_params.get('parent_id')
        
        if parent_id:
            folders = project.folders.filter(parent_id=parent_id)
        else:
            folders = project.folders.filter(parent=None)
            
        serializer = FolderSerializer(folders, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def files(self, request, pk=None):
        from django.core.paginator import Paginator
        
        project = self.get_object()
        folder_id = request.query_params.get('folder_id')
        page = int(request.query_params.get('page', 1))
        page_size = min(int(request.query_params.get('page_size', 40)), 100)  # Cap at 100, default 40
        
        if folder_id:
            files = project.files.filter(folder_id=folder_id)
        else:
            files = project.files.filter(folder=None)
        
        files = files.order_by('-uploaded_at')
        
        paginator = Paginator(files, page_size)
        page_obj = paginator.get_page(page)
        
        serializer = FileSerializer(page_obj, many=True)
        return Response({
            'files': serializer.data,
            'total': paginator.count,
            'page': page,
            'page_size': page_size,
            'total_pages': paginator.num_pages
        })
    
    @action(detail=True, methods=['post'])
    def create_folder(self, request, pk=None):
        project = self.get_object()
        data = request.data.copy()
        data['project'] = project.id
        
        serializer = FolderSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        project = self.get_object()
        
        stats = {
            'total_files': project.get_files_count(),
            'total_folders': project.get_folders_count(),
            'total_size': project.get_total_size(),
            'storage_breakdown': self.get_storage_breakdown(project)
        }
        
        return Response(stats)
    
    def get_storage_breakdown(self, project):
        files = project.files.all()
        breakdown = {}
        
        for file_obj in files:
            content_type = file_obj.content_type.split('/')[0] if '/' in file_obj.content_type else 'other'
            if content_type not in breakdown:
                breakdown[content_type] = {'count': 0, 'size': 0}
            breakdown[content_type]['count'] += 1
            breakdown[content_type]['size'] += file_obj.size
            
        return breakdown

class FolderViewSet(viewsets.ModelViewSet):
    serializer_class = FolderSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Folder.objects.filter(user=self.request.user)
    
    @action(detail=True, methods=['get'])
    def contents(self, request, pk=None):
        from django.core.paginator import Paginator
        
        folder = self.get_object()
        page = int(request.query_params.get('page', 1))
        page_size = min(int(request.query_params.get('page_size', 40)), 100)  # Cap at 100, default 40
        
        folders = Folder.objects.filter(parent=folder).order_by('name')
        files = File.objects.filter(folder=folder).order_by('-uploaded_at')
        
        # Paginate files (folders are usually fewer, so we don't paginate them)
        paginator = Paginator(files, page_size)
        page_obj = paginator.get_page(page)
        
        return Response({
            'folders': FolderSerializer(folders, many=True).data,
            'files': FileSerializer(page_obj, many=True).data,
            'pagination': {
                'total': paginator.count,
                'page': page,
                'page_size': page_size,
                'total_pages': paginator.num_pages
            }
        })
    
    @action(detail=True, methods=['get'])
    def breadcrumb(self, request, pk=None):
        folder = self.get_object()
        breadcrumb = []
        current = folder
        
        while current:
            breadcrumb.insert(0, {
                'id': str(current.id),
                'name': current.name,
                'path': current.path
            })
            current = current.parent
        
        breadcrumb.insert(0, {
            'id': str(folder.project.id),
            'name': folder.project.name,
            'path': '',
            'type': 'project'
        })
        
        return Response(breadcrumb)

class FileViewSet(viewsets.ModelViewSet):
    serializer_class = FileSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return File.objects.filter(user=self.request.user)
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        file_obj = self.get_object()
        file_path = file_obj.file.path
        
        if os.path.exists(file_path):
            with open(file_path, 'rb') as fh:
                response = HttpResponse(fh.read(), content_type=file_obj.content_type)
                response['Content-Disposition'] = f'attachment; filename="{file_obj.name}"'
                return response
        return Response({'error': 'File not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=False, methods=['post'])
    def move(self, request):
        file_ids = request.data.get('file_ids', [])
        target_folder_id = request.data.get('target_folder_id')
        target_project_id = request.data.get('target_project_id')
        
        if not file_ids:
            return Response({'error': 'No files selected'}, status=status.HTTP_400_BAD_REQUEST)
        
        files = File.objects.filter(id__in=file_ids, user=request.user)
        
        target_folder = None
        target_project = None
        
        if target_folder_id:
            target_folder = get_object_or_404(Folder, id=target_folder_id, user=request.user)
            target_project = target_folder.project
        elif target_project_id:
            target_project = get_object_or_404(Project, id=target_project_id, user=request.user)
        
        moved_files = []
        for file_obj in files:
            old_path = file_obj.file.path
            
            file_obj.folder = target_folder
            file_obj.project = target_project
            file_obj.save()
            
            new_path = file_obj.file.path
            os.makedirs(os.path.dirname(new_path), exist_ok=True)
            
            if os.path.exists(old_path):
                shutil.move(old_path, new_path)
            
            moved_files.append({
                'id': str(file_obj.id),
                'name': file_obj.name,
                'new_path': file_obj.get_file_path()
            })
        
        return Response({
            'moved_files': moved_files,
            'total_moved': len(moved_files)
        })
    
    @action(detail=False, methods=['delete'])
    def bulk_delete(self, request):
        file_ids = request.data.get('file_ids', [])
        
        if not file_ids:
            return Response({'error': 'No files selected'}, status=status.HTTP_400_BAD_REQUEST)
        
        files = File.objects.filter(id__in=file_ids, user=request.user)
        deleted_files = []
        total_size_freed = 0
        
        for file_obj in files:
            deleted_files.append({
                'id': str(file_obj.id),
                'name': file_obj.name,
                'size': file_obj.size
            })
            total_size_freed += file_obj.size
            file_obj.delete()
        
        return Response({
            'deleted_files': deleted_files,
            'total_deleted': len(deleted_files),
            'total_size_freed': total_size_freed
        })

# Assignment and File Management ViewSets
class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        
        # Admin sees all assignments
        if user.is_admin_role():
            return Assignment.objects.all()
        
        # Managers see assignments in their projects
        elif user.is_manager_role():
            accessible_projects = user.get_accessible_projects()
            return Assignment.objects.filter(project__in=accessible_projects)
        
        # Employees see only their assignments
        elif user.is_employee_role():
            return Assignment.objects.filter(assigned_to=user)
        
        return Assignment.objects.none()
    
    @action(detail=False, methods=['post'])
    def create_assignments(self, request):
        """Create multiple file assignments"""
        serializer = CreateAssignmentSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            try:
                assignments = []
                validated_data = serializer.validated_data
                files = validated_data.pop('files')
                assigned_by = request.user
                
                with transaction.atomic():
                    for file in files:
                        assignment = Assignment.create_assignment(
                            file=file,
                            assigned_to=validated_data['assigned_to'],
                            assigned_by=assigned_by,
                            due_date=validated_data.get('due_date'),
                            notes=validated_data.get('notes', '')
                        )
                        assignments.append(assignment)
                
                return Response({
                    'message': f'Successfully created {len(assignments)} assignments',
                    'assignments': AssignmentSerializer(assignments, many=True).data
                }, status=status.HTTP_201_CREATED)
                
            except ValidationError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Update assignment status"""
        assignment = self.get_object()
        serializer = UpdateAssignmentStatusSerializer(data=request.data)
        
        if serializer.is_valid():
            try:
                new_status = serializer.validated_data['status']
                notes = serializer.validated_data.get('notes', '')
                
                message = assignment.update_status(new_status, request.user, notes)
                
                return Response({
                    'message': message,
                    'assignment': AssignmentSerializer(assignment).data
                })
                
            except ValidationError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def my_assignments(self, request):
        """Get current user's assignments"""
        assignments = Assignment.objects.filter(assigned_to=request.user)
        status_filter = request.query_params.get('status')
        
        if status_filter:
            assignments = assignments.filter(status=status_filter)
        
        serializer = AssignmentSerializer(assignments, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Get assignment dashboard data for current user"""
        user = request.user
        
        if user.is_employee_role():
            # Employee dashboard
            my_assignments = Assignment.objects.filter(assigned_to=user)
            data = {
                'total_assignments': my_assignments.count(),
                'pending': my_assignments.filter(status=Assignment.PENDING).count(),
                'in_progress': my_assignments.filter(status=Assignment.IN_PROGRESS).count(),
                'completed': my_assignments.filter(status=Assignment.COMPLETED).count(),
                'recent_assignments': AssignmentSerializer(
                    my_assignments.order_by('-assigned_date')[:5], many=True
                ).data
            }
        
        elif user.is_manager_role() or user.is_admin_role():
            # Manager/Admin dashboard
            if user.is_admin_role():
                assignments = Assignment.objects.all()
            else:
                accessible_projects = user.get_accessible_projects()
                assignments = Assignment.objects.filter(project__in=accessible_projects)
            
            data = {
                'total_assignments': assignments.count(),
                'pending': assignments.filter(status=Assignment.PENDING).count(),
                'in_progress': assignments.filter(status=Assignment.IN_PROGRESS).count(),
                'completed': assignments.filter(status=Assignment.COMPLETED).count(),
                'cancelled': assignments.filter(status=Assignment.CANCELLED).count(),
                'recent_assignments': AssignmentSerializer(
                    assignments.order_by('-assigned_date')[:10], many=True
                ).data
            }
        
        else:
            data = {'error': 'Invalid user role'}
        
        return Response(data)

class ProjectAssignmentViewSet(viewsets.ModelViewSet):
    """Extended project view with assignment management"""
    serializer_class = ProjectAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        
        if user.is_admin_role():
            return Project.objects.all()
        else:
            return user.get_accessible_projects()
    
    @action(detail=True, methods=['get'])
    def assignable_files(self, request, pk=None):
        """Get files that can be assigned in this project"""
        project = self.get_object()
        
        if not project.can_user_assign_files(request.user):
            return Response(
                {'error': 'You do not have permission to assign files in this project'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        files = project.get_assignable_files()
        serializer = FileWithAssignmentSerializer(files, many=True, context={'request': request})
        return Response({
            'project': project.name,
            'assignable_files': serializer.data,
            'count': len(serializer.data)
        })
    
    @action(detail=True, methods=['get'])
    def assigned_files(self, request, pk=None):
        """Get currently assigned files in this project"""
        project = self.get_object()
        
        files = project.get_assigned_files()
        serializer = FileWithAssignmentSerializer(files, many=True, context={'request': request})
        return Response({
            'project': project.name,
            'assigned_files': serializer.data,
            'count': len(serializer.data)
        })
    
    @action(detail=True, methods=['get'])
    def assignment_stats(self, request, pk=None):
        """Get assignment statistics for this project"""
        project = self.get_object()
        
        assignments = Assignment.objects.filter(project=project)
        
        stats = {
            'project_name': project.name,
            'total_files': project.files.count(),
            'assignable_files': project.get_assignable_files().count(),
            'assigned_files': project.get_assigned_files().count(),
            'total_assignments': assignments.count(),
            'status_breakdown': {
                'pending': assignments.filter(status=Assignment.PENDING).count(),
                'in_progress': assignments.filter(status=Assignment.IN_PROGRESS).count(),
                'completed': assignments.filter(status=Assignment.COMPLETED).count(),
                'cancelled': assignments.filter(status=Assignment.CANCELLED).count(),
            },
            'assigned_managers': project.get_assigned_managers().count(),
            'assigned_employees': project.get_assigned_employees().count(),
        }
        
        return Response(stats)