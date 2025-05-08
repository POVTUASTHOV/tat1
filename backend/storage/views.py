# storage/views.py
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
import os
import shutil
from .models import Folder, File, ChunkedUpload
from .serializers import FolderSerializer, FileSerializer, ChunkUploadSerializer, CompleteUploadSerializer
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action

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