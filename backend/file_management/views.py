from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse, Http404
from django.db import transaction
from django.core.paginator import Paginator
from storage.models import File as DjangoFile, Folder, Project
from storage.serializers import FileSerializer, FolderSerializer, ProjectSerializer
import os
import logging

logger = logging.getLogger(__name__)

class FileManagementViewSet(viewsets.ModelViewSet):
    serializer_class = FileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DjangoFile.objects.filter(user=self.request.user)

    @action(detail=False, methods=['get'])
    def list_files(self, request):
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 20))
        search = request.GET.get('search', '')
        folder_id = request.GET.get('folder_id')
        project_id = request.GET.get('project_id')
        
        queryset = self.get_queryset()
        
        if project_id:
            try:
                project = Project.objects.get(id=project_id, user=request.user)
                queryset = queryset.filter(project=project)
            except Project.DoesNotExist:
                return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if folder_id:
            try:
                folder = Folder.objects.get(id=folder_id, user=request.user)
                queryset = queryset.filter(folder=folder)
            except Folder.DoesNotExist:
                return Response({'error': 'Folder not found'}, status=status.HTTP_404_NOT_FOUND)
        elif project_id:
            queryset = queryset.filter(folder=None)
        
        if search:
            queryset = queryset.filter(name__icontains=search)
        
        queryset = queryset.order_by('-uploaded_at')
        
        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page)
        
        files_data = []
        for file_obj in page_obj:
            files_data.append({
                'id': str(file_obj.id),
                'name': file_obj.name,
                'size': file_obj.size,
                'content_type': file_obj.content_type,
                'project': str(file_obj.project.id),
                'project_name': file_obj.project.name,
                'folder': str(file_obj.folder.id) if file_obj.folder else None,
                'folder_name': file_obj.folder.name if file_obj.folder else None,
                'uploaded_at': file_obj.uploaded_at.isoformat(),
                'size_formatted': self.format_file_size(file_obj.size),
                'file_path': file_obj.get_file_path()
            })
        
        return Response({
            'files': files_data,
            'total': paginator.count,
            'page': page,
            'page_size': page_size,
            'total_pages': paginator.num_pages,
            'current_project': project_id,
            'current_folder': folder_id
        })

    @action(detail=False, methods=['get'])
    def all_files(self, request):
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 20))
        search = request.GET.get('search', '')
        
        queryset = self.get_queryset()
        
        if search:
            queryset = queryset.filter(name__icontains=search)
        
        queryset = queryset.order_by('-uploaded_at')
        
        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page)
        
        files_data = []
        for file_obj in page_obj:
            files_data.append({
                'id': str(file_obj.id),
                'name': file_obj.name,
                'size': file_obj.size,
                'content_type': file_obj.content_type,
                'project': str(file_obj.project.id),
                'project_name': file_obj.project.name,
                'folder': str(file_obj.folder.id) if file_obj.folder else None,
                'folder_name': file_obj.folder.name if file_obj.folder else None,
                'uploaded_at': file_obj.uploaded_at.isoformat(),
                'size_formatted': self.format_file_size(file_obj.size),
                'file_path': file_obj.get_file_path()
            })
        
        return Response({
            'files': files_data,
            'total': paginator.count,
            'page': page,
            'page_size': page_size,
            'total_pages': paginator.num_pages
        })

    @action(detail=False, methods=['get'])
    def by_project(self, request):
        projects = Project.objects.filter(user=request.user).prefetch_related('files', 'folders')
        
        projects_data = []
        for project in projects:
            root_files = project.files.filter(folder=None)
            root_folders = project.folders.filter(parent=None)
            
            projects_data.append({
                'id': str(project.id),
                'name': project.name,
                'description': project.description,
                'files_count': project.get_files_count(),
                'folders_count': project.get_folders_count(),
                'total_size': project.get_total_size(),
                'total_size_formatted': self.format_file_size(project.get_total_size()),
                'root_files': FileSerializer(root_files, many=True).data,
                'root_folders': FolderSerializer(root_folders, many=True).data,
                'created_at': project.created_at.isoformat(),
                'updated_at': project.updated_at.isoformat()
            })
        
        return Response({
            'projects': projects_data,
            'total_projects': len(projects_data)
        })

    @action(detail=False, methods=['get'])
    def projects_list(self, request):
        projects = Project.objects.filter(user=request.user)
        
        projects_data = []
        for project in projects:
            projects_data.append({
                'id': str(project.id),
                'name': project.name,
                'description': project.description,
                'files_count': project.get_files_count(),
                'folders_count': project.get_folders_count(),
                'total_size': project.get_total_size(),
                'total_size_formatted': self.format_file_size(project.get_total_size()),
                'created_at': project.created_at.isoformat(),
                'updated_at': project.updated_at.isoformat()
            })
        
        return Response({
            'projects': projects_data,
            'total_projects': len(projects_data)
        })

    @action(detail=False, methods=['get'])
    def breadcrumb(self, request):
        folder_id = request.GET.get('folder_id')
        project_id = request.GET.get('project_id')
        
        breadcrumb = []
        
        if project_id:
            try:
                project = Project.objects.get(id=project_id, user=request.user)
                breadcrumb.append({
                    'id': str(project.id),
                    'name': project.name,
                    'type': 'project',
                    'path': ''
                })
                
                if folder_id:
                    folder = Folder.objects.get(id=folder_id, user=request.user)
                    current = folder
                    folder_breadcrumb = []
                    
                    while current:
                        folder_breadcrumb.insert(0, {
                            'id': str(current.id),
                            'name': current.name,
                            'type': 'folder',
                            'path': current.path
                        })
                        current = current.parent
                    
                    breadcrumb.extend(folder_breadcrumb)
                    
            except (Project.DoesNotExist, Folder.DoesNotExist):
                return Response({'error': 'Project or folder not found'}, status=status.HTTP_404_NOT_FOUND)
        
        return Response({'breadcrumb': breadcrumb})

    @action(detail=True, methods=['delete'])
    def delete_file(self, request, pk=None):
        try:
            file_obj = self.get_object()
        except DjangoFile.DoesNotExist:
            return Response({'error': 'File not found'}, status=status.HTTP_404_NOT_FOUND)
        
        file_name = file_obj.name
        file_size = file_obj.size
        project_name = file_obj.project.name
        file_path = file_obj.file.path
        
        try:
            with transaction.atomic():
                if os.path.exists(file_path):
                    os.remove(file_path)
                
                request.user.update_storage_used(file_size, subtract=True)
                file_obj.delete()
                
                logger.info(f"File deleted: {file_name} from project {project_name} by user {request.user.id}")
                
                return Response({
                    'message': 'File deleted successfully',
                    'file_name': file_name,
                    'project_name': project_name,
                    'size_freed': file_size,
                    'size_freed_formatted': self.format_file_size(file_size)
                })
        
        except Exception as e:
            logger.error(f"Error deleting file {pk}: {str(e)}")
            return Response({'error': f'Error deleting file: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['delete'])
    def bulk_delete(self, request):
        file_ids = request.data.get('file_ids', [])
        if not file_ids:
            return Response({'error': 'No file IDs provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        deleted_files = []
        failed_files = []
        total_size_freed = 0
        
        for file_id in file_ids:
            try:
                file_obj = DjangoFile.objects.get(id=file_id, user=request.user)
                file_name = file_obj.name
                file_size = file_obj.size
                project_name = file_obj.project.name
                file_path = file_obj.file.path
                
                with transaction.atomic():
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    
                    request.user.update_storage_used(file_size, subtract=True)
                    file_obj.delete()
                    
                    deleted_files.append({
                        'id': file_id,
                        'name': file_name,
                        'size': file_size,
                        'project_name': project_name
                    })
                    total_size_freed += file_size
                    
            except DjangoFile.DoesNotExist:
                failed_files.append({'id': file_id, 'error': 'File not found'})
            except Exception as e:
                failed_files.append({'id': file_id, 'error': str(e)})
        
        return Response({
            'deleted_files': deleted_files,
            'failed_files': failed_files,
            'total_deleted': len(deleted_files),
            'total_size_freed': total_size_freed,
            'total_size_freed_formatted': self.format_file_size(total_size_freed)
        })

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        try:
            file_obj = self.get_object()
        except DjangoFile.DoesNotExist:
            raise Http404("File not found")
        
        file_path = file_obj.file.path
        if not os.path.exists(file_path):
            raise Http404("File not found on server")
        
        with open(file_path, 'rb') as f:
            response = HttpResponse(f.read(), content_type=file_obj.content_type)
            response['Content-Disposition'] = f'attachment; filename="{file_obj.name}"'
            response['Content-Length'] = str(file_obj.size)
            return response

    @action(detail=False, methods=['get'])
    def storage_stats(self, request):
        user = request.user
        total_files = DjangoFile.objects.filter(user=user).count()
        total_folders = Folder.objects.filter(user=user).count()
        total_projects = Project.objects.filter(user=user).count()
        
        storage_used = user.storage_used
        storage_quota = user.storage_quota
        storage_available = storage_quota - storage_used
        storage_percentage = (storage_used / storage_quota) * 100 if storage_quota > 0 else 0
        
        file_types = {}
        files = DjangoFile.objects.filter(user=user)
        for file_obj in files:
            content_type = file_obj.content_type.split('/')[0] if '/' in file_obj.content_type else 'other'
            if content_type not in file_types:
                file_types[content_type] = {'count': 0, 'size': 0}
            file_types[content_type]['count'] += 1
            file_types[content_type]['size'] += file_obj.size
        
        projects_stats = []
        projects = Project.objects.filter(user=user)
        for project in projects:
            projects_stats.append({
                'id': str(project.id),
                'name': project.name,
                'files_count': project.get_files_count(),
                'folders_count': project.get_folders_count(),
                'total_size': project.get_total_size(),
                'total_size_formatted': self.format_file_size(project.get_total_size())
            })
        
        return Response({
            'storage': {
                'used': storage_used,
                'quota': storage_quota,
                'available': storage_available,
                'percentage': round(storage_percentage, 2),
                'used_formatted': self.format_file_size(storage_used),
                'quota_formatted': self.format_file_size(storage_quota),
                'available_formatted': self.format_file_size(storage_available)
            },
            'overview': {
                'total_files': total_files,
                'total_folders': total_folders,
                'total_projects': total_projects,
                'file_types': file_types
            },
            'projects': projects_stats
        })

    def format_file_size(self, bytes_size):
        if bytes_size == 0:
            return "0 Bytes"
        size_names = ["Bytes", "KB", "MB", "GB", "TB"]
        i = 0
        while bytes_size >= 1024 and i < len(size_names) - 1:
            bytes_size /= 1024
            i += 1
        return f"{bytes_size:.2f} {size_names[i]}"