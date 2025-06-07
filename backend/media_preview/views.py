from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.http import HttpResponse, Http404, JsonResponse
from django.conf import settings
from PIL import Image
import zipfile
import tarfile
import rarfile
import os
import mimetypes
import logging
from io import BytesIO
import json
import shutil
from storage.models import File as DjangoFile, Folder, Project
from django.core.files import File

logger = logging.getLogger(__name__)

class FilePreviewViewSet(viewsets.ViewSet):
    authentication_classes = [JWTAuthentication, SessionAuthentication]
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        try:
            file_obj = DjangoFile.objects.get(id=pk, user=request.user)
            
            if not os.path.exists(file_obj.file.path):
                raise Http404("File not found on server")
            
            content_type = file_obj.content_type.lower()
            
            if content_type.startswith('image/'):
                return self._preview_image(file_obj, request)
            elif content_type.startswith('video/'):
                return self._preview_video(file_obj, request)
            elif content_type.startswith('audio/'):
                return self._preview_audio(file_obj, request)
            elif content_type in ['text/plain', 'application/json', 'text/csv']:
                return self._preview_text(file_obj, request)
            elif content_type == 'application/pdf':
                return self._preview_pdf(file_obj, request)
            else:
                return Response({'error': 'Preview not supported for this file type'}, 
                              status=status.HTTP_400_BAD_REQUEST)
                
        except DjangoFile.DoesNotExist:
            raise Http404("File not found")
        except Exception as e:
            logger.error(f"Preview error for file {pk}: {str(e)}")
            return Response({'error': f'Preview failed: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _preview_image(self, file_obj, request):
        try:
            with Image.open(file_obj.file.path) as img:
                width, height = img.size
                format_name = img.format
                mode = img.mode
                
                thumbnail_size = request.GET.get('size', '300')
                if thumbnail_size in ['150', '300', '600', '800']:
                    thumb_size = int(thumbnail_size)
                    img.thumbnail((thumb_size, thumb_size), Image.Resampling.LANCZOS)
                    
                    buffer = BytesIO()
                    img.save(buffer, format='JPEG', quality=85)
                    buffer.seek(0)
                    
                    response = HttpResponse(buffer.getvalue(), content_type='image/jpeg')
                    response['Cache-Control'] = 'public, max-age=3600'
                    return response
                else:
                    return JsonResponse({
                        'width': width,
                        'height': height,
                        'format': format_name,
                        'mode': mode,
                        'type': 'image'
                    })
                    
        except Exception as e:
            return Response({'error': f'Image preview failed: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _preview_video(self, file_obj, request):
        relative_path = file_obj.file.name
        
        return JsonResponse({
            'type': 'video',
            'content_type': file_obj.content_type,
            'size': file_obj.size,
            'size_formatted': self._format_file_size(file_obj.size),
            'stream_url': f'http://localhost:3001/media/{relative_path}',
            'supports_streaming': True,
            'video_info': {
                'file_size': file_obj.size,
                'can_stream': True
            },
            'recommended_action': 'stream_ready'
        })

    def _preview_audio(self, file_obj, request):
        relative_path = file_obj.file.name
            
        return JsonResponse({
            'type': 'audio',
            'content_type': file_obj.content_type,
            'size': file_obj.size,
            'stream_url': f'http://localhost:3001/media/{relative_path}',
            'supports_streaming': True
        })

    def _preview_text(self, file_obj, request):
        try:
            max_size = 1024 * 1024
            if file_obj.size > max_size:
                return Response({'error': 'File too large for text preview'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            
            with open(file_obj.file.path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                
            lines = content.split('\n')
            if len(lines) > 1000:
                content = '\n'.join(lines[:1000]) + '\n... (truncated)'
                
            return JsonResponse({
                'type': 'text',
                'content': content,
                'lines': min(len(lines), 1000),
                'truncated': len(lines) > 1000
            })
            
        except Exception as e:
            return Response({'error': f'Text preview failed: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _preview_pdf(self, file_obj, request):
        return JsonResponse({
            'type': 'pdf',
            'content_type': file_obj.content_type,
            'size': file_obj.size,
            'download_url': f'/file-management/files/{file_obj.id}/download/',
            'message': 'PDF preview requires download'
        })

    def _format_file_size(self, bytes_size):
        if bytes_size == 0:
            return "0 Bytes"
        size_names = ["Bytes", "KB", "MB", "GB", "TB"]
        i = 0
        while bytes_size >= 1024 and i < len(size_names) - 1:
            bytes_size /= 1024
            i += 1
        return f"{bytes_size:.2f} {size_names[i]}"

class ArchiveViewSet(viewsets.ViewSet):
    authentication_classes = [JWTAuthentication, SessionAuthentication]
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['get'])
    def contents(self, request, pk=None):
        try:
            file_obj = DjangoFile.objects.get(id=pk, user=request.user)
            
            if not os.path.exists(file_obj.file.path):
                raise Http404("File not found on server")
            
            archive_type = self._get_archive_type(file_obj)
            if not archive_type:
                return Response({'error': 'Not a supported archive file'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            
            contents = self._list_archive_contents(file_obj.file.path, archive_type)
            
            return JsonResponse({
                'archive_type': archive_type,
                'total_files': len(contents),
                'contents': contents
            })
            
        except DjangoFile.DoesNotExist:
            raise Http404("File not found")
        except Exception as e:
            logger.error(f"Archive contents error for file {pk}: {str(e)}")
            return Response({'error': f'Failed to read archive: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def extract(self, request, pk=None):
        try:
            file_obj = DjangoFile.objects.get(id=pk, user=request.user)
            
            if not os.path.exists(file_obj.file.path):
                raise Http404("File not found on server")
            
            archive_type = self._get_archive_type(file_obj)
            if not archive_type:
                return Response({'error': 'Not a supported archive file'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            
            target_folder_id = request.data.get('target_folder_id')
            target_project_id = request.data.get('target_project_id', file_obj.project.id)
            create_subfolder = request.data.get('create_subfolder', True)
            
            target_project = Project.objects.get(id=target_project_id, user=request.user)
            target_folder = None
            
            if target_folder_id:
                target_folder = Folder.objects.get(id=target_folder_id, user=request.user)
                if target_folder.project != target_project:
                    return Response({'error': 'Folder does not belong to target project'}, 
                                  status=status.HTTP_400_BAD_REQUEST)
            
            if create_subfolder:
                archive_name = os.path.splitext(file_obj.name)[0]
                subfolder_data = {
                    'name': archive_name,
                    'parent': target_folder,
                    'project': target_project,
                    'user': request.user
                }
                target_folder = Folder.objects.create(**subfolder_data)
            
            extracted_files = self._extract_archive(
                file_obj.file.path, 
                archive_type, 
                target_project, 
                target_folder, 
                request.user
            )
            
            return JsonResponse({
                'message': 'Archive extracted successfully',
                'extracted_files': len(extracted_files),
                'target_folder': {
                    'id': str(target_folder.id) if target_folder else None,
                    'name': target_folder.name if target_folder else 'Root',
                    'project': target_project.name
                }
            })
            
        except DjangoFile.DoesNotExist:
            raise Http404("File not found")
        except (Project.DoesNotExist, Folder.DoesNotExist):
            return Response({'error': 'Target project or folder not found'}, 
                          status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Archive extraction error for file {pk}: {str(e)}")
            return Response({'error': f'Extraction failed: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_archive_type(self, file_obj):
        extension = os.path.splitext(file_obj.name)[1].lower()
        if extension in ['.zip']:
            return 'zip'
        elif extension in ['.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tar.xz']:
            return 'tar'
        elif extension in ['.rar']:
            return 'rar'
        return None

    def _list_archive_contents(self, file_path, archive_type):
        contents = []
        
        try:
            if archive_type == 'zip':
                with zipfile.ZipFile(file_path, 'r') as archive:
                    for info in archive.infolist():
                        if not info.filename.endswith('/'):
                            contents.append({
                                'name': info.filename,
                                'size': info.file_size,
                                'compressed_size': info.compress_size,
                                'date_time': info.date_time,
                                'is_dir': False
                            })
                        else:
                            contents.append({
                                'name': info.filename.rstrip('/'),
                                'size': 0,
                                'compressed_size': 0,
                                'date_time': info.date_time,
                                'is_dir': True
                            })
            
            elif archive_type == 'tar':
                with tarfile.open(file_path, 'r:*') as archive:
                    for member in archive.getmembers():
                        contents.append({
                            'name': member.name,
                            'size': member.size,
                            'compressed_size': member.size,
                            'date_time': member.mtime,
                            'is_dir': member.isdir()
                        })
            
            elif archive_type == 'rar':
                with rarfile.RarFile(file_path, 'r') as archive:
                    for info in archive.infolist():
                        contents.append({
                            'name': info.filename,
                            'size': info.file_size,
                            'compressed_size': info.compress_size,
                            'date_time': info.date_time,
                            'is_dir': info.is_dir()
                        })
        
        except Exception as e:
            logger.error(f"Error listing archive contents: {str(e)}")
            raise
        
        return contents

    def _extract_archive(self, file_path, archive_type, target_project, target_folder, user):
        extracted_files = []
        base_extract_path = os.path.join(settings.MEDIA_ROOT, 'temp', 'extract')
        os.makedirs(base_extract_path, exist_ok=True)
        
        try:
            if archive_type == 'zip':
                with zipfile.ZipFile(file_path, 'r') as archive:
                    archive.extractall(base_extract_path)
                    
            elif archive_type == 'tar':
                with tarfile.open(file_path, 'r:*') as archive:
                    archive.extractall(base_extract_path)
                    
            elif archive_type == 'rar':
                with rarfile.RarFile(file_path, 'r') as archive:
                    archive.extractall(base_extract_path)
            
            for root, dirs, files in os.walk(base_extract_path):
                rel_path = os.path.relpath(root, base_extract_path)
                
                current_folder = target_folder
                if rel_path != '.':
                    path_parts = rel_path.split(os.sep)
                    for part in path_parts:
                        folder_name = part
                        existing_folder = Folder.objects.filter(
                            name=folder_name,
                            parent=current_folder,
                            project=target_project,
                            user=user
                        ).first()
                        
                        if not existing_folder:
                            current_folder = Folder.objects.create(
                                name=folder_name,
                                parent=current_folder,
                                project=target_project,
                                user=user
                            )
                        else:
                            current_folder = existing_folder
                
                for file_name in files:
                    file_path_full = os.path.join(root, file_name)
                    
                    with open(file_path_full, 'rb') as f:
                        django_file = File(f, name=file_name)
                        
                        file_obj = DjangoFile.objects.create(
                            name=file_name,
                            file=django_file,
                            size=os.path.getsize(file_path_full),
                            content_type=mimetypes.guess_type(file_name)[0] or 'application/octet-stream',
                            folder=current_folder,
                            project=target_project,
                            user=user
                        )
                        
                        extracted_files.append(file_obj)
            
            shutil.rmtree(base_extract_path, ignore_errors=True)
            
        except Exception as e:
            shutil.rmtree(base_extract_path, ignore_errors=True)
            raise
        
        return extracted_files