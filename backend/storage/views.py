from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
import os
import shutil
from .models import Folder, File, ChunkedUpload, Project
from .serializers import (FolderSerializer, FileSerializer, ChunkUploadSerializer, 
                         CompleteUploadSerializer, ProjectSerializer, ProjectTreeSerializer)
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action

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
        project = self.get_object()
        folder_id = request.query_params.get('folder_id')
        
        if folder_id:
            files = project.files.filter(folder_id=folder_id)
        else:
            files = project.files.filter(folder=None)
            
        serializer = FileSerializer(files, many=True)
        return Response(serializer.data)
    
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
        folder = self.get_object()
        folders = Folder.objects.filter(parent=folder)
        files = File.objects.filter(folder=folder)
        
        return Response({
            'folders': FolderSerializer(folders, many=True).data,
            'files': FileSerializer(files, many=True).data
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