from django.db import models
from django.utils.translation import gettext_lazy as _
import uuid
import os
from users.models import User

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
    
    def delete(self, *args, **kwargs):
        self.user.update_storage_used(self.size, subtract=True)
        if self.file and os.path.exists(self.file.path):
            os.remove(self.file.path)
        super().delete(*args, **kwargs)
    
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
    file = models.CharField(max_length=500)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    chunk_number = models.IntegerField()
    total_chunks = models.IntegerField()
    total_size = models.BigIntegerField()
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chunked_uploads')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='chunked_uploads', null=True, blank=True, default=None)
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('user', 'filename', 'chunk_number')