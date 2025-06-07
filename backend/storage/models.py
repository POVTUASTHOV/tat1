from django.db import models
from django.utils.translation import gettext_lazy as _
import uuid
import os
import stat
import logging
import mimetypes
from users.models import User

logger = logging.getLogger(__name__)

def detect_content_type(filename):
    content_type, _ = mimetypes.guess_type(filename)
    if content_type:
        return content_type
    
    extension = filename.lower().split('.')[-1] if '.' in filename else ''
    extension_map = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'bmp': 'image/bmp', 'webp': 'image/webp',
        'svg': 'image/svg+xml', 'tiff': 'image/tiff', 'ico': 'image/x-icon',
        'mp4': 'video/mp4', 'avi': 'video/x-msvideo', 'mov': 'video/quicktime',
        'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'webm': 'video/webm',
        'mkv': 'video/x-matroska', '3gp': 'video/3gpp',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
        'flac': 'audio/flac', 'aac': 'audio/aac', 'm4a': 'audio/mp4',
        'pdf': 'application/pdf', 'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'txt': 'text/plain', 'csv': 'text/csv', 'json': 'application/json',
        'xml': 'application/xml', 'html': 'text/html', 'css': 'text/css',
        'js': 'application/javascript', 'py': 'text/x-python',
        'zip': 'application/zip', 'rar': 'application/vnd.rar',
        'tar': 'application/x-tar', 'gz': 'application/gzip',
        '7z': 'application/x-7z-compressed'
    }
    return extension_map.get(extension, 'application/octet-stream')

class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='projects')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def get_total_size(self):
        return self.files.aggregate(total=models.Sum('size'))['total'] or 0
    
    def get_files_count(self):
        return self.files.count()
    
    def get_folders_count(self):
        return self.folders.count()
    
    def __str__(self):
        return self.name

    class Meta:
        unique_together = ('name', 'user')
        ordering = ['-updated_at']

def user_directory_path(instance, filename):
    if hasattr(instance, 'project') and instance.project:
        project_path = instance.project.name.replace(' ', '_').lower()
    else:
        project_path = 'default'
    folder_path = instance.folder.path if instance.folder else ""
    return f'user_{instance.user.id}/{project_path}/{folder_path}/{filename}'

class Folder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    path = models.CharField(max_length=1000, blank=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='folders', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='folders')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def save(self, *args, **kwargs):
        if self.parent:
            if self.parent.path:
                self.path = f"{self.parent.path}/{self.name}"
            else:
                self.path = self.name
        else:
            self.path = self.name
        super().save(*args, **kwargs)
    
    def get_full_path(self):
        project_name = self.project.name if self.project else 'No Project'
        return f"{project_name}/{self.path}"
    
    def get_files_count(self):
        return self.files.count()
    
    def get_subfolders_count(self):
        return self.children.count()
    
    def __str__(self):
        return self.get_full_path()

    class Meta:
        unique_together = ('name', 'parent', 'user')
        ordering = ['name']

class File(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to=user_directory_path)
    size = models.BigIntegerField()
    content_type = models.CharField(max_length=100)
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, null=True, blank=True, related_name='files')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='files', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='files')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    def save(self, *args, **kwargs):
        if not self.content_type or self.content_type == 'application/octet-stream':
            self.content_type = detect_content_type(self.name)
        super().save(*args, **kwargs)
    
    def delete(self, *args, **kwargs):
        file_size = self.size
        user = self.user
        self._safe_delete_file()
        super().delete(*args, **kwargs)
        user.update_storage_used(file_size, subtract=True)
    
    def _safe_delete_file(self):
        if not self.file or not hasattr(self.file, 'path'):
            return
        
        file_path = self.file.path
        
        if not os.path.exists(file_path):
            logger.warning(f"File not found on disk: {file_path}")
            return
        
        try:
            self._try_delete_file(file_path)
            logger.info(f"File successfully deleted: {file_path}")
        except PermissionError:
            self._force_delete_file(file_path)
        except OSError as e:
            if e.errno == 13:
                self._force_delete_file(file_path)
            else:
                logger.error(f"OSError deleting file {file_path}: {e}")
                self._mark_for_cleanup(file_path)
    
    def _try_delete_file(self, file_path):
        if not os.access(file_path, os.W_OK):
            try:
                os.chmod(file_path, stat.S_IWRITE | stat.S_IREAD)
            except OSError:
                pass
        
        os.remove(file_path)
    
    def _force_delete_file(self, file_path):
        try:
            parent_dir = os.path.dirname(file_path)
            
            try:
                os.chmod(parent_dir, stat.S_IWRITE | stat.S_IREAD | stat.S_IEXEC)
                os.chmod(file_path, stat.S_IWRITE | stat.S_IREAD)
                os.remove(file_path)
                logger.info(f"File force deleted: {file_path}")
            except OSError:
                self._mark_for_cleanup(file_path)
                
        except Exception as e:
            logger.error(f"Force delete failed for {file_path}: {e}")
            self._mark_for_cleanup(file_path)
    
    def _mark_for_cleanup(self, file_path):
        cleanup_file = os.path.join(os.path.dirname(file_path), '.cleanup_queue')
        try:
            os.makedirs(os.path.dirname(cleanup_file), exist_ok=True)
            with open(cleanup_file, 'a') as f:
                f.write(f"{file_path}\n")
            logger.warning(f"File marked for cleanup: {file_path}")
        except Exception as e:
            logger.error(f"Failed to mark file for cleanup: {e}")
    
    def get_file_path(self):
        project_name = self.project.name if self.project else 'No Project'
        if self.folder:
            return f"{project_name}/{self.folder.path}/{self.name}"
        return f"{project_name}/{self.name}"
    
    def __str__(self):
        return self.get_file_path()

    class Meta:
        ordering = ['-uploaded_at']

class ChunkedUpload(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.CharField(max_length=1000)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    chunk_number = models.IntegerField()
    total_chunks = models.IntegerField()
    total_size = models.BigIntegerField()
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chunked_uploads')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='chunked_uploads', null=True, blank=True, default=None)
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def save(self, *args, **kwargs):
        if not self.content_type or self.content_type == 'application/octet-stream':
            self.content_type = detect_content_type(self.filename)
        super().save(*args, **kwargs)
    
    class Meta:
        db_table = 'storage_chunkedupload'
        unique_together = ('user', 'filename', 'chunk_number', 'project')