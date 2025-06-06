from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse, Http404, JsonResponse, StreamingHttpResponse
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from PIL import Image
import zipfile
import tarfile
import rarfile
import os
import mimetypes
import logging
import re
from io import BytesIO
import json
import shutil
from storage.models import File as DjangoFile, Folder, Project
from django.core.files import File
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from .video_utils import VideoProcessor, get_optimal_mime_type

logger = logging.getLogger(__name__)

class VideoStreamingAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header_auth = super().authenticate(request)
        if header_auth:
            return header_auth
        
        token_param = request.GET.get('token')
        if token_param:
            try:
                validated_token = AccessToken(token_param)
                user = self.get_user(validated_token)
                return user, validated_token
            except (TokenError, InvalidToken):
                pass
        
        return None

class FilePreviewViewSet(viewsets.ViewSet):
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
                        'file_url': f'/media-preview/video/{file_obj.id}/stream/'
                    })
                    
        except Exception as e:
            return Response({'error': f'Image preview failed: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _preview_video(self, file_obj, request):
        token = None
        if hasattr(request, 'auth') and request.auth:
            token = str(request.auth)
        
        processor = VideoProcessor(file_obj.file.path)
        video_info = processor.get_video_info()
        
        video_summary = {
            'compatible': True,
            'needs_conversion': False,
            'file_size': processor.get_file_size(),
            'can_stream': True,
            'streaming_recommendation': {
                'action': 'stream_ready',
                'reason': 'Forced streaming enabled for dev',
                'can_preview': True
            }
        }
        
        if video_info:
            video_streams = [s for s in video_info.get('streams', []) if s.get('codec_type') == 'video']
            if video_streams:
                stream = video_streams[0]
                video_summary.update({
                    'codec': stream.get('codec_name'),
                    'profile': stream.get('profile'),
                    'width': stream.get('width'),
                    'height': stream.get('height'),
                    'duration': float(video_info.get('format', {}).get('duration', 0)),
                    'bitrate': int(video_info.get('format', {}).get('bit_rate', 0))
                })
        
        return JsonResponse({
            'type': 'video',
            'content_type': file_obj.content_type,
            'size': file_obj.size,
            'size_formatted': self._format_file_size(file_obj.size),
            'stream_url': f'/media-preview/video/{file_obj.id}/stream/',
            'stream_url_with_token': f'/media-preview/video/{file_obj.id}/stream/?token={token}' if token else None,
            'supports_streaming': True,
            'video_info': video_summary,
            'recommended_action': 'stream_ready'
        })

    def _preview_audio(self, file_obj, request):
        token = None
        if hasattr(request, 'auth') and request.auth:
            token = str(request.auth)
            
        return JsonResponse({
            'type': 'audio',
            'content_type': file_obj.content_type,
            'size': file_obj.size,
            'stream_url': f'/media-preview/video/{file_obj.id}/stream/',
            'stream_url_with_token': f'/media-preview/video/{file_obj.id}/stream/?token={token}' if token else None,
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

    def _get_recommended_action(self, file_obj, video_info):
        if file_obj.size > 2 * 1024 * 1024 * 1024:  # 2GB
            return 'download_recommended'
        
        if not video_info.get('compatible', False):
            return 'conversion_needed'
        
        return 'stream_ready'

    def _format_file_size(self, bytes_size):
        if bytes_size == 0:
            return "0 Bytes"
        size_names = ["Bytes", "KB", "MB", "GB", "TB"]
        i = 0
        while bytes_size >= 1024 and i < len(size_names) - 1:
            bytes_size /= 1024
            i += 1
        return f"{bytes_size:.2f} {size_names[i]}"

@method_decorator(csrf_exempt, name='dispatch')
@method_decorator(never_cache, name='dispatch')
class VideoStreamingViewSet(viewsets.ViewSet):
    authentication_classes = [VideoStreamingAuthentication]
    permission_classes = []

    def get_file_and_check_auth(self, request, pk):
        try:
            user = None
            if hasattr(request, 'user') and request.user.is_authenticated:
                user = request.user
            elif request.GET.get('token'):
                try:
                    token = AccessToken(request.GET.get('token'))
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    user = User.objects.get(id=token.payload.get('user_id'))
                except Exception as e:
                    logger.error(f"Token validation failed: {e}")
                    raise Http404("Invalid token")
            else:
                raise Http404("Authentication required")
            
            file_obj = DjangoFile.objects.get(id=pk, user=user)
            return file_obj
        except DjangoFile.DoesNotExist:
            raise Http404("File not found")

    def get_optimal_content_type(self, file_obj):
        # Use video_utils to get optimal MIME type
        try:
            return get_optimal_mime_type(file_obj.file.path)
        except Exception:
            # Fallback to basic detection
            extension = os.path.splitext(file_obj.name)[1].lower()
            
            mime_types = {
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.mov': 'video/quicktime',
                '.avi': 'video/x-msvideo',
                '.mkv': 'video/x-matroska',
                '.flv': 'video/x-flv',
                '.wmv': 'video/x-ms-wmv',
                '.m4v': 'video/mp4',
                '.3gp': 'video/3gpp'
            }
            
            return mime_types.get(extension, file_obj.content_type or 'video/mp4')

    def create_streaming_response(self, file_path, content_type, range_header=None):
        file_size = os.path.getsize(file_path)
        
        if range_header:
            range_match = re.search(r'bytes=(\d+)-(\d*)', range_header)
            if range_match:
                start = int(range_match.group(1))
                end = int(range_match.group(2)) if range_match.group(2) else min(start + 50*1024*1024, file_size - 1)
                end = min(end, file_size - 1)
                
                def file_iterator():
                    try:
                        with open(file_path, 'rb') as f:
                            f.seek(start)
                            remaining = end - start + 1
                            chunk_size = 512 * 1024
                            
                            while remaining > 0:
                                read_size = min(chunk_size, remaining)
                                chunk = f.read(read_size)
                                if not chunk:
                                    break
                                remaining -= len(chunk)
                                yield chunk
                    except Exception as e:
                        logger.error(f"File streaming error: {e}")
                        return

                response = StreamingHttpResponse(
                    file_iterator(),
                    status=206,
                    content_type=content_type
                )
                response['Content-Range'] = f'bytes {start}-{end}/{file_size}'
                response['Content-Length'] = str(end - start + 1)
            else:
                raise Http404("Invalid range header")
        else:
            def file_iterator():
                try:
                    with open(file_path, 'rb') as f:
                        chunk_size = 1024 * 1024
                        while True:
                            chunk = f.read(chunk_size)
                            if not chunk:
                                break
                            yield chunk
                except Exception as e:
                    logger.error(f"File streaming error: {e}")
                    return

            response = StreamingHttpResponse(
                file_iterator(),
                content_type=content_type
            )
            response['Content-Length'] = str(file_size)

        response['Accept-Ranges'] = 'bytes'
        response['Cache-Control'] = 'no-cache'
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Headers'] = 'Range, Authorization, Content-Type'
        response['Access-Control-Expose-Headers'] = 'Content-Range, Content-Length, Accept-Ranges'
        response['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
        
        return response

    @action(detail=True, methods=['get', 'head', 'options'])
    def stream(self, request, pk=None):
        if request.method == 'OPTIONS':
            response = HttpResponse()
            response['Access-Control-Allow-Origin'] = '*'
            response['Access-Control-Allow-Headers'] = 'Range, Authorization, Content-Type'
            response['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
            return response
        
        try:
            file_obj = self.get_file_and_check_auth(request, pk)
            
            if not os.path.exists(file_obj.file.path):
                logger.error(f"File not found on disk: {file_obj.file.path}")
                raise Http404("File not found on server")

            content_type = self.get_optimal_content_type(file_obj)
            range_header = request.META.get('HTTP_RANGE')
            
            logger.info(f"Streaming {request.method} {pk}: {file_obj.name}, size: {file_obj.size}, range: {range_header}")
            
            if request.method == 'HEAD':
                response = HttpResponse(content_type=content_type)
                response['Content-Length'] = str(os.path.getsize(file_obj.file.path))
                response['Accept-Ranges'] = 'bytes'
                response['Access-Control-Allow-Origin'] = '*'
                response['Access-Control-Allow-Headers'] = 'Range, Authorization, Content-Type'
                return response
            
            return self.create_streaming_response(file_obj.file.path, content_type, range_header)

        except Exception as e:
            logger.error(f"Stream error for file {pk}: {str(e)}")
            raise Http404(f"Stream failed: {str(e)}")

    @action(detail=True, methods=['get'])
    def manifest(self, request, pk=None):
        try:
            file_obj = self.get_file_and_check_auth(request, pk)
            
            token = request.GET.get('token') or (str(request.auth) if hasattr(request, 'auth') and request.auth else '')
            
            manifest = {
                'file_id': str(file_obj.id),
                'file_name': file_obj.name,
                'file_size': file_obj.size,
                'content_type': self.get_optimal_content_type(file_obj),
                'stream_url': f'/media-preview/video/{file_obj.id}/stream/',
                'stream_url_with_token': f'/media-preview/video/{file_obj.id}/stream/?token={token}' if token else None,
                'supports_streaming': True,
            }

            return JsonResponse(manifest)

        except Exception as e:
            logger.error(f"Manifest error for file {pk}: {str(e)}")
            raise Http404("Manifest failed")

# Archive handling (keeping existing functionality)
class ArchiveViewSet(viewsets.ViewSet):
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
                if thumbnail_size in ['150', '300', '600']:
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
                        'file_url': f'/media-preview/video/{file_obj.id}/stream/'
                    })
                    
        except Exception as e:
            return Response({'error': f'Image preview failed: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _preview_video(self, file_obj, request):
        token = None
        if hasattr(request, 'auth') and request.auth:
            token = str(request.auth)
        
        video_info = self._get_video_info(file_obj)
        
        return JsonResponse({
            'type': 'video',
            'content_type': file_obj.content_type,
            'size': file_obj.size,
            'size_formatted': self._format_file_size(file_obj.size),
            'stream_url': f'/media-preview/video/{file_obj.id}/stream/',
            'stream_url_with_token': f'/media-preview/video/{file_obj.id}/stream/?token={token}' if token else None,
            'supports_streaming': True,
            'video_info': video_info,
            'recommended_action': self._get_recommended_action(file_obj)
        })

    def _preview_audio(self, file_obj, request):
        token = None
        if hasattr(request, 'auth') and request.auth:
            token = str(request.auth)
            
        return JsonResponse({
            'type': 'audio',
            'content_type': file_obj.content_type,
            'size': file_obj.size,
            'stream_url': f'/media-preview/video/{file_obj.id}/stream/',
            'stream_url_with_token': f'/media-preview/video/{file_obj.id}/stream/?token={token}' if token else None,
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

    def _get_video_info(self, file_obj):
        try:
            import subprocess
            import json
            
            cmd = [
                'ffprobe', '-v', 'quiet', 
                '-print_format', 'json', 
                '-show_format', '-show_streams',
                file_obj.file.path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0:
                info = json.loads(result.stdout)
                video_streams = [s for s in info.get('streams', []) if s.get('codec_type') == 'video']
                if video_streams:
                    stream = video_streams[0]
                    return {
                        'codec': stream.get('codec_name'),
                        'profile': stream.get('profile'),
                        'width': stream.get('width'),
                        'height': stream.get('height'),
                        'duration': float(info.get('format', {}).get('duration', 0)),
                        'bitrate': int(info.get('format', {}).get('bit_rate', 0)),
                        'compatible': stream.get('codec_name', '').lower() in ['h264', 'h265']
                    }
            
        except Exception as e:
            logger.warning(f"ffprobe failed: {e}")
        
        return {
            'codec': 'unknown',
            'compatible': False,
            'needs_conversion': True
        }

    def _get_recommended_action(self, file_obj):
        if file_obj.size > 2 * 1024 * 1024 * 1024:
            return 'download_recommended'
        
        video_info = self._get_video_info(file_obj)
        if not video_info.get('compatible', False):
            return 'conversion_needed'
        
        return 'stream_ready'

    def _format_file_size(self, bytes_size):
        if bytes_size == 0:
            return "0 Bytes"
        size_names = ["Bytes", "KB", "MB", "GB", "TB"]
        i = 0
        while bytes_size >= 1024 and i < len(size_names) - 1:
            bytes_size /= 1024
            i += 1
        return f"{bytes_size:.2f} {size_names[i]}"

@method_decorator(csrf_exempt, name='dispatch')
@method_decorator(never_cache, name='dispatch')
class VideoStreamingViewSet(viewsets.ViewSet):
    authentication_classes = [VideoStreamingAuthentication]
    permission_classes = []

    def get_file_and_check_auth(self, request, pk):
        try:
            user = None
            if hasattr(request, 'user') and request.user.is_authenticated:
                user = request.user
            elif request.GET.get('token'):
                try:
                    token = AccessToken(request.GET.get('token'))
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    user = User.objects.get(id=token.payload.get('user_id'))
                except:
                    raise Http404("Invalid token")
            else:
                raise Http404("Authentication required")
            
            file_obj = DjangoFile.objects.get(id=pk, user=user)
            return file_obj
        except DjangoFile.DoesNotExist:
            raise Http404("File not found")

    def get_optimal_content_type(self, file_obj):
        extension = os.path.splitext(file_obj.name)[1].lower()
        
        if extension == '.mp4':
            return 'video/mp4'
        elif extension == '.mov':
            return 'video/mp4'
        elif extension == '.avi':
            return 'video/mp4'
        elif extension == '.webm':
            return 'video/webm'
        else:
            return 'video/mp4'

    def create_streaming_response(self, file_path, content_type, range_header=None):
        file_size = os.path.getsize(file_path)
        
        if range_header:
            range_match = re.search(r'bytes=(\d+)-(\d*)', range_header)
            if range_match:
                start = int(range_match.group(1))
                end = int(range_match.group(2)) if range_match.group(2) else file_size - 1
                
                end = min(end, file_size - 1)
                
                def file_iterator():
                    with open(file_path, 'rb') as f:
                        f.seek(start)
                        remaining = end - start + 1
                        chunk_size = min(65536, remaining)
                        while remaining > 0:
                            chunk = f.read(min(chunk_size, remaining))
                            if not chunk:
                                break
                            remaining -= len(chunk)
                            yield chunk

                response = StreamingHttpResponse(
                    file_iterator(),
                    status=206,
                    content_type=content_type
                )
                response['Content-Range'] = f'bytes {start}-{end}/{file_size}'
                response['Content-Length'] = str(end - start + 1)
            else:
                raise Http404("Invalid range")
        else:
            def file_iterator():
                with open(file_path, 'rb') as f:
                    while True:
                        chunk = f.read(65536)
                        if not chunk:
                            break
                        yield chunk

            response = StreamingHttpResponse(
                file_iterator(),
                content_type=content_type
            )
            response['Content-Length'] = str(file_size)

        response['Accept-Ranges'] = 'bytes'
        response['Cache-Control'] = 'public, max-age=3600'
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Headers'] = 'Range, Authorization, Content-Type'
        response['Access-Control-Expose-Headers'] = 'Content-Range, Content-Length, Accept-Ranges'
        response['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
        
        return response

    @action(detail=True, methods=['get', 'head', 'options'])
    def stream(self, request, pk=None):
        if request.method == 'OPTIONS':
            response = HttpResponse()
            response['Access-Control-Allow-Origin'] = '*'
            response['Access-Control-Allow-Headers'] = 'Range, Authorization, Content-Type'
            response['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
            return response
        
        try:
            file_obj = self.get_file_and_check_auth(request, pk)
            
            if not os.path.exists(file_obj.file.path):
                raise Http404("File not found on server")

            content_type = self.get_optimal_content_type(file_obj)
            range_header = request.META.get('HTTP_RANGE')
            
            logger.info(f"Streaming {request.method} {pk}: {file_obj.name}, type: {content_type}, range: {range_header}")
            
            if request.method == 'HEAD':
                response = HttpResponse(content_type=content_type)
                response['Content-Length'] = str(os.path.getsize(file_obj.file.path))
                response['Accept-Ranges'] = 'bytes'
                response['Access-Control-Allow-Origin'] = '*'
                return response
            
            return self.create_streaming_response(file_obj.file.path, content_type, range_header)

        except Exception as e:
            logger.error(f"Stream error for file {pk}: {str(e)}")
            raise Http404("Stream failed")

    @action(detail=True, methods=['get'])
    def manifest(self, request, pk=None):
        try:
            file_obj = self.get_file_and_check_auth(request, pk)
            
            token = request.GET.get('token') or (str(request.auth) if hasattr(request, 'auth') and request.auth else '')
            
            manifest = {
                'file_id': str(file_obj.id),
                'file_name': file_obj.name,
                'file_size': file_obj.size,
                'content_type': self.get_optimal_content_type(file_obj),
                'stream_url': f'/media-preview/video/{file_obj.id}/stream/',
                'stream_url_with_token': f'/media-preview/video/{file_obj.id}/stream/?token={token}' if token else None,
                'supports_streaming': True,
            }

            return JsonResponse(manifest)

        except Exception as e:
            logger.error(f"Manifest error for file {pk}: {str(e)}")
            raise Http404("Manifest failed")