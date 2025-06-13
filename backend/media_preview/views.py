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
from celery import shared_task

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
                return JsonResponse({'error': 'Preview not supported for this file type'}, 
                              status=400)
                
        except DjangoFile.DoesNotExist:
            raise Http404("File not found")
        except Exception as e:
            logger.error(f"Preview error for file {pk}: {str(e)}")
            return JsonResponse({'error': f'Preview failed: {str(e)}'}, 
                          status=500)

    def _preview_image(self, file_obj, request):
        try:
            with Image.open(file_obj.file.path) as img:
                width, height = img.size
                format_name = img.format or 'Unknown'
                mode = img.mode
                
                thumbnail_url = f'/media-preview/preview/{file_obj.id}/thumbnail/'
                direct_url = f'http://localhost:8000/media/{file_obj.file.name}'
                
                response_data = {
                    'type': 'image',
                    'width': width,
                    'height': height,
                    'format': format_name,
                    'mode': mode,
                    'size': file_obj.size,
                    'content_type': file_obj.content_type,
                    'thumbnail_url': thumbnail_url,
                    'direct_url': direct_url
                }
                
                response = JsonResponse(response_data)
                response['Content-Type'] = 'application/json'
                return response
                        
        except Exception as e:
            logger.error(f"Image preview error: {str(e)}")
            fallback_data = {
                'type': 'image',
                'error': f'Image preview failed: {str(e)}',
                'direct_url': f'http://localhost:8000/media/{file_obj.file.name}',
                'size': file_obj.size,
                'content_type': file_obj.content_type
            }
            response = JsonResponse(fallback_data)
            response['Content-Type'] = 'application/json'
            return response

    @action(detail=True, methods=['get'])
    def thumbnail(self, request, pk=None):
        try:
            file_obj = DjangoFile.objects.get(id=pk, user=request.user)
            
            if not os.path.exists(file_obj.file.path):
                raise Http404("File not found on server")
            
            thumbnail_size = request.GET.get('size', '300')
            if thumbnail_size not in ['150', '300', '600', '800']:
                thumbnail_size = '300'
                
            with Image.open(file_obj.file.path) as img:
                thumb_size = int(thumbnail_size)
                img.thumbnail((thumb_size, thumb_size), Image.Resampling.LANCZOS)
                
                buffer = BytesIO()
                img_format = img.format or 'JPEG'
                if img_format.upper() in ['JPEG', 'JPG']:
                    img.save(buffer, format='JPEG', quality=85)
                    content_type = 'image/jpeg'
                elif img_format.upper() == 'PNG':
                    img.save(buffer, format='PNG')
                    content_type = 'image/png'
                else:
                    img = img.convert('RGB')
                    img.save(buffer, format='JPEG', quality=85)
                    content_type = 'image/jpeg'
                
                buffer.seek(0)
                
                response = HttpResponse(buffer.getvalue(), content_type=content_type)
                response['Cache-Control'] = 'public, max-age=3600'
                response['Access-Control-Allow-Origin'] = '*'
                response['Content-Length'] = str(len(buffer.getvalue()))
                return response
                
        except DjangoFile.DoesNotExist:
            raise Http404("File not found")
        except Exception as e:
            logger.error(f"Thumbnail error: {str(e)}")
            raise Http404("Thumbnail generation failed")

    @action(detail=True, methods=['get'])
    def thumbnail(self, request, pk=None):
        try:
            file_obj = DjangoFile.objects.get(id=pk, user=request.user)
            
            if not os.path.exists(file_obj.file.path):
                raise Http404("File not found on server")
            
            thumbnail_size = request.GET.get('size', '300')
            if thumbnail_size not in ['150', '300', '600', '800']:
                thumbnail_size = '300'
                
            with Image.open(file_obj.file.path) as img:
                thumb_size = int(thumbnail_size)
                img.thumbnail((thumb_size, thumb_size), Image.Resampling.LANCZOS)
                
                buffer = BytesIO()
                img_format = img.format or 'JPEG'
                if img_format.upper() == 'JPEG' or img_format.upper() == 'JPG':
                    img.save(buffer, format='JPEG', quality=85)
                    content_type = 'image/jpeg'
                elif img_format.upper() == 'PNG':
                    img.save(buffer, format='PNG')
                    content_type = 'image/png'
                else:
                    img = img.convert('RGB')
                    img.save(buffer, format='JPEG', quality=85)
                    content_type = 'image/jpeg'
                
                buffer.seek(0)
                
                response = HttpResponse(buffer.getvalue(), content_type=content_type)
                response['Cache-Control'] = 'public, max-age=3600'
                response['Access-Control-Allow-Origin'] = '*'
                return response
                
        except DjangoFile.DoesNotExist:
            raise Http404("File not found")
        except Exception as e:
            logger.error(f"Thumbnail error: {str(e)}")
            
            file_obj = DjangoFile.objects.get(id=pk, user=request.user)
            direct_url = f'http://localhost:8000/media/{file_obj.file.name}'
            
            try:
                # Read file directly from filesystem instead of HTTP request
                if os.path.exists(file_obj.file.path):
                    with open(file_obj.file.path, 'rb') as f:
                        file_content = f.read()
                    response = HttpResponse(file_content, content_type=file_obj.content_type)
                    response['Cache-Control'] = 'public, max-age=3600'
                    response['Access-Control-Allow-Origin'] = '*'
                    return response
            except Exception as e:
                logger.error(f"Direct file access failed: {str(e)}")
                
            raise Http404("Thumbnail generation failed")

    def _preview_video(self, file_obj, request):
        relative_path = file_obj.file.name
        
        return JsonResponse({
            'type': 'video',
            'content_type': file_obj.content_type,
            'size': file_obj.size,
            'size_formatted': self._format_file_size(file_obj.size),
            'stream_url': f'http://localhost:8000/media/{relative_path}',
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
            'stream_url': f'http://localhost:8000/media/{relative_path}',
            'supports_streaming': True
        })

    def _preview_text(self, file_obj, request):
        try:
            max_size = 1024 * 1024
            if file_obj.size > max_size:
                return JsonResponse({'error': 'File too large for text preview'}, 
                              status=400)
            
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
            return JsonResponse({'error': f'Text preview failed: {str(e)}'}, 
                          status=500)

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
            
            # Pagination parameters
            page = int(request.GET.get('page', 1))
            page_size = min(int(request.GET.get('page_size', 20)), 100)  # Max 100 items per page
            preview_only = request.GET.get('preview', 'false').lower() == 'true'
            
            # Get all contents first to count total
            all_contents = self._list_archive_contents(file_obj.file.path, archive_type)
            total_files = len(all_contents)
            
            # For preview mode, limit to first 20 items
            if preview_only:
                contents = all_contents[:20]
                return JsonResponse({
                    'archive_type': archive_type,
                    'total_files': total_files,
                    'contents': contents,
                    'preview_mode': True,
                    'showing_first': min(20, total_files)
                })
            
            # Paginate results
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            contents = all_contents[start_idx:end_idx]
            
            return JsonResponse({
                'archive_type': archive_type,
                'total_files': total_files,
                'contents': contents,
                'pagination': {
                    'page': page,
                    'page_size': page_size,
                    'total_pages': (total_files + page_size - 1) // page_size,
                    'has_next': end_idx < total_files,
                    'has_previous': page > 1
                }
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
            selected_files = request.data.get('selected_files', [])  # List of file paths to extract
            max_files = request.data.get('max_files', 1000)  # Limit extraction count
            use_background = request.data.get('use_background', False)  # Force background processing
            
            target_project = Project.objects.get(id=target_project_id, user=request.user)
            target_folder = None
            
            if target_folder_id:
                target_folder = Folder.objects.get(id=target_folder_id, user=request.user)
                if target_folder.project != target_project:
                    return Response({'error': 'Folder does not belong to target project'}, 
                                  status=status.HTTP_400_BAD_REQUEST)
            
            # Get total files to determine if background processing is needed
            all_contents = self._list_archive_contents(file_obj.file.path, archive_type)
            total_files_to_extract = len(selected_files) if selected_files else len(all_contents)
            
            # Use background processing for large extractions (>500 files) or if requested
            # Temporarily disabled due to Celery configuration issues
            if False and (use_background or total_files_to_extract > 500):
                task = extract_archive_background.delay(
                    file_id=file_obj.id,
                    target_project_id=target_project_id,
                    target_folder_id=target_folder_id,
                    create_subfolder=create_subfolder,
                    selected_files=selected_files,
                    max_files=max_files,
                    user_id=request.user.id
                )
                
                return JsonResponse({
                    'message': 'Archive extraction started in background',
                    'task_id': task.id,
                    'background_processing': True,
                    'estimated_files': total_files_to_extract,
                    'target_project': target_project.name
                })
            else:
                # Process immediately for small archives
                if create_subfolder:
                    archive_name = os.path.splitext(file_obj.name)[0]
                    target_folder, created = Folder.objects.get_or_create(
                        name=archive_name,
                        parent=target_folder,
                        project=target_project,
                        user=request.user
                    )
                
                extracted_files = self._extract_archive(
                    file_obj.file.path, 
                    archive_type, 
                    target_project, 
                    target_folder, 
                    request.user,
                    selected_files=selected_files,
                    max_files=max_files
                )
                
                logger.info(f"Archive extraction successful for file {pk}: {len(extracted_files)} files extracted to project {target_project.name}")
                return JsonResponse({
                    'message': 'Archive extracted successfully',
                    'extracted_files': len(extracted_files),
                    'background_processing': False,
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
                            file_info = {
                                'name': info.filename,
                                'size': info.file_size,
                                'compressed_size': info.compress_size,
                                'date_time': info.date_time,
                                'is_dir': False,
                                'file_type': self._get_file_type(info.filename),
                                'is_previewable': self._is_previewable_file(info.filename)
                            }
                            contents.append(file_info)
                        else:
                            contents.append({
                                'name': info.filename.rstrip('/'),
                                'size': 0,
                                'compressed_size': 0,
                                'date_time': info.date_time,
                                'is_dir': True,
                                'file_type': 'folder',
                                'is_previewable': False
                            })
            
            elif archive_type == 'tar':
                with tarfile.open(file_path, 'r:*') as archive:
                    for member in archive.getmembers():
                        file_info = {
                            'name': member.name,
                            'size': member.size,
                            'compressed_size': member.size,
                            'date_time': member.mtime,
                            'is_dir': member.isdir(),
                            'file_type': 'folder' if member.isdir() else self._get_file_type(member.name),
                            'is_previewable': False if member.isdir() else self._is_previewable_file(member.name)
                        }
                        contents.append(file_info)
            
            elif archive_type == 'rar':
                with rarfile.RarFile(file_path, 'r') as archive:
                    for info in archive.infolist():
                        file_info = {
                            'name': info.filename,
                            'size': info.file_size,
                            'compressed_size': info.compress_size,
                            'date_time': info.date_time,
                            'is_dir': info.is_dir(),
                            'file_type': 'folder' if info.is_dir() else self._get_file_type(info.filename),
                            'is_previewable': False if info.is_dir() else self._is_previewable_file(info.filename)
                        }
                        contents.append(file_info)
        
        except Exception as e:
            logger.error(f"Error listing archive contents: {str(e)}")
            raise
        
        # Sort contents: directories first, then previewable files, then others
        contents.sort(key=lambda x: (
            not x['is_dir'],  # Directories first
            not x.get('is_previewable', False),  # Then previewable files
            x['name'].lower()  # Then alphabetically
        ))
        
        return contents
    
    def _get_file_type(self, filename):
        """Determine file type category from filename"""
        ext = os.path.splitext(filename)[1].lower()
        
        if ext in ['.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.log']:
            return 'text'
        elif ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp']:
            return 'image'
        elif ext in ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm']:
            return 'video'
        elif ext in ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a']:
            return 'audio'
        elif ext in ['.pdf']:
            return 'pdf'
        elif ext in ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']:
            return 'archive'
        elif ext in ['.py', '.js', '.html', '.css', '.php', '.java', '.cpp', '.c', '.h']:
            return 'code'
        else:
            return 'other'
    
    def _is_previewable_file(self, filename):
        """Check if file can be easily previewed"""
        ext = os.path.splitext(filename)[1].lower()
        previewable_extensions = [
            '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.log',
            '.py', '.js', '.html', '.css', '.php', '.java', '.cpp', '.c', '.h'
        ]
        return ext in previewable_extensions

    def _extract_archive(self, file_path, archive_type, target_project, target_folder, user, selected_files=None, max_files=1000):
        import gc
        import uuid
        
        extracted_files = []
        extract_id = str(uuid.uuid4())
        base_extract_path = os.path.join(settings.MEDIA_ROOT, 'temp', 'extract', extract_id)
        os.makedirs(base_extract_path, exist_ok=True)
        
        try:
            # Extract selectively if specific files requested
            if selected_files:
                extracted_count = 0
                
                if archive_type == 'zip':
                    with zipfile.ZipFile(file_path, 'r') as archive:
                        for file_name in selected_files:
                            if extracted_count >= max_files:
                                break
                            try:
                                archive.extract(file_name, base_extract_path)
                                extracted_count += 1
                            except KeyError:
                                logger.warning(f"File {file_name} not found in archive")
                                
                elif archive_type == 'tar':
                    with tarfile.open(file_path, 'r:*') as archive:
                        for file_name in selected_files:
                            if extracted_count >= max_files:
                                break
                            try:
                                member = archive.getmember(file_name)
                                archive.extract(member, base_extract_path)
                                extracted_count += 1
                            except KeyError:
                                logger.warning(f"File {file_name} not found in archive")
                                
                elif archive_type == 'rar':
                    with rarfile.RarFile(file_path, 'r') as archive:
                        for file_name in selected_files:
                            if extracted_count >= max_files:
                                break
                            try:
                                archive.extract(file_name, base_extract_path)
                                extracted_count += 1
                            except Exception:
                                logger.warning(f"File {file_name} not found in archive")
            else:
                # Extract all files but with limits
                if archive_type == 'zip':
                    with zipfile.ZipFile(file_path, 'r') as archive:
                        members = archive.infolist()[:max_files]
                        for member in members:
                            archive.extract(member, base_extract_path)
                            
                elif archive_type == 'tar':
                    with tarfile.open(file_path, 'r:*') as archive:
                        members = archive.getmembers()[:max_files]
                        for member in members:
                            archive.extract(member, base_extract_path)
                            
                elif archive_type == 'rar':
                    with rarfile.RarFile(file_path, 'r') as archive:
                        members = archive.infolist()[:max_files]
                        for member in members:
                            archive.extract(member, base_extract_path)
            
            # Process extracted files in batches
            batch_size = 50
            current_batch = 0
            
            for root, dirs, files in os.walk(base_extract_path):
                rel_path = os.path.relpath(root, base_extract_path)
                
                current_folder = target_folder
                if rel_path != '.':
                    path_parts = rel_path.split(os.sep)
                    for part in path_parts:
                        folder_name = part
                        current_folder, created = Folder.objects.get_or_create(
                            name=folder_name,
                            parent=current_folder,
                            project=target_project,
                            user=user
                        )
                
                for file_name in files:
                    if len(extracted_files) >= max_files:
                        break
                        
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
                        current_batch += 1
                        
                        # Cleanup memory every batch
                        if current_batch >= batch_size:
                            gc.collect()
                            current_batch = 0
            
            # Final cleanup
            shutil.rmtree(base_extract_path, ignore_errors=True)
            gc.collect()
            
        except Exception as e:
            shutil.rmtree(base_extract_path, ignore_errors=True)
            gc.collect()
            raise
        
        return extracted_files

@shared_task
def extract_archive_background(file_id, target_project_id, target_folder_id=None, create_subfolder=True, selected_files=None, max_files=1000, user_id=None):
    """Background task for extracting large archives"""
    import gc
    import uuid
    from users.models import User
    
    try:
        user = User.objects.get(id=user_id) if user_id else None
        file_obj = DjangoFile.objects.get(id=file_id, user=user)
        target_project = Project.objects.get(id=target_project_id, user=user)
        target_folder = None
        
        if target_folder_id:
            target_folder = Folder.objects.get(id=target_folder_id, user=user)
        
        if create_subfolder:
            archive_name = os.path.splitext(file_obj.name)[0]
            target_folder, created = Folder.objects.get_or_create(
                name=archive_name,
                parent=target_folder,
                project=target_project,
                user=user
            )
        
        # Get archive type
        extension = os.path.splitext(file_obj.name)[1].lower()
        if extension in ['.zip']:
            archive_type = 'zip'
        elif extension in ['.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tar.xz']:
            archive_type = 'tar'
        elif extension in ['.rar']:
            archive_type = 'rar'
        else:
            raise ValueError("Unsupported archive type")
        
        # Extract files
        extracted_files = []
        extract_id = str(uuid.uuid4())
        base_extract_path = os.path.join(settings.MEDIA_ROOT, 'temp', 'extract', extract_id)
        os.makedirs(base_extract_path, exist_ok=True)
        
        try:
            # Extract with limits
            if selected_files:
                extracted_count = 0
                
                if archive_type == 'zip':
                    with zipfile.ZipFile(file_obj.file.path, 'r') as archive:
                        for file_name in selected_files:
                            if extracted_count >= max_files:
                                break
                            try:
                                archive.extract(file_name, base_extract_path)
                                extracted_count += 1
                            except KeyError:
                                logger.warning(f"File {file_name} not found in archive")
            else:
                # Extract all with limits
                if archive_type == 'zip':
                    with zipfile.ZipFile(file_obj.file.path, 'r') as archive:
                        members = archive.infolist()[:max_files]
                        for member in members:
                            archive.extract(member, base_extract_path)
            
            # Process extracted files in batches
            batch_size = 50
            current_batch = 0
            
            for root, dirs, files in os.walk(base_extract_path):
                rel_path = os.path.relpath(root, base_extract_path)
                
                current_folder = target_folder
                if rel_path != '.':
                    path_parts = rel_path.split(os.sep)
                    for part in path_parts:
                        current_folder, created = Folder.objects.get_or_create(
                            name=part,
                            parent=current_folder,
                            project=target_project,
                            user=user
                        )
                
                for file_name in files:
                    if len(extracted_files) >= max_files:
                        break
                        
                    file_path_full = os.path.join(root, file_name)
                    
                    with open(file_path_full, 'rb') as f:
                        django_file = File(f, name=file_name)
                        
                        file_obj_new = DjangoFile.objects.create(
                            name=file_name,
                            file=django_file,
                            size=os.path.getsize(file_path_full),
                            content_type=mimetypes.guess_type(file_name)[0] or 'application/octet-stream',
                            folder=current_folder,
                            project=target_project,
                            user=user
                        )
                        
                        extracted_files.append(file_obj_new.id)
                        current_batch += 1
                        
                        # Cleanup memory every batch
                        if current_batch >= batch_size:
                            gc.collect()
                            current_batch = 0
            
            # Final cleanup
            shutil.rmtree(base_extract_path, ignore_errors=True)
            gc.collect()
            
            logger.info(f"Background extraction completed: {len(extracted_files)} files extracted")
            return {
                'status': 'completed',
                'extracted_files': len(extracted_files),
                'file_ids': extracted_files
            }
            
        except Exception as e:
            shutil.rmtree(base_extract_path, ignore_errors=True)
            gc.collect()
            raise
        
    except Exception as e:
        logger.error(f"Background extraction failed: {str(e)}")
        return {
            'status': 'failed',
            'error': str(e)
        }