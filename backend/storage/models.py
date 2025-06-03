from django.db import models
from django.utils.translation import gettext_lazy as _
import uuid
import os
from users.models import User

def user_directory_path(instance, filename):
    return f'user_{instance.user.id}/{instance.folder.path if instance.folder else ""}/{filename}'

class Folder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    path = models.CharField(max_length=1000, blank=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
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
    
    def __str__(self):
        return f"{self.path}"

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
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='files')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    def delete(self, *args, **kwargs):
        self.user.update_storage_used(self.size, subtract=True)
        self.file.delete()
        super().delete(*args, **kwargs)
    
    def __str__(self):
        return self.name

    class Meta:
        ordering = ['-uploaded_at']

class ChunkedUpload(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.CharField(max_length=500)  # Thay vì FileField
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    chunk_number = models.IntegerField()
    total_chunks = models.IntegerField()
    total_size = models.BigIntegerField()
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chunked_uploads')
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('user', 'filename', 'chunk_number')