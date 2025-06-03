import os
import django
from django.core.files import File
from django.db import transaction

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from storage.models import ChunkedUpload, File as DjangoFile
from users.models import User

class ChunkUploadResumer:
    def __init__(self, email, filename):
        self.user = User.objects.get(email=email)
        self.filename = filename
        self.chunks = ChunkedUpload.objects.filter(
            user=self.user, 
            filename=filename
        ).order_by('chunk_number')
    
    def check_completion_status(self):
        if not self.chunks.exists():
            return False, "No chunks found"
        
        total_chunks = self.chunks.first().total_chunks
        uploaded_chunks = self.chunks.count()
        
        if uploaded_chunks < total_chunks:
            return False, f"Incomplete: {uploaded_chunks}/{total_chunks}"
        
        return True, f"Complete: {uploaded_chunks}/{total_chunks}"
    
    def merge_chunks(self):
        can_complete, status = self.check_completion_status()
        if not can_complete:
            raise Exception(f"Cannot complete: {status}")
        
        temp_path = f'/tmp/{self.filename}'
        total_bytes = 0
        
        with open(temp_path, 'wb') as merged_file:
            for chunk in self.chunks:
                with open(chunk.file, 'rb') as chunk_file:
                    data = chunk_file.read()
                    merged_file.write(data)
                    total_bytes += len(data)
        
        with transaction.atomic():
            with open(temp_path, 'rb') as merged_file:
                django_file = File(merged_file, name=self.filename)
                
                file_obj = DjangoFile.objects.create(
                    name=self.filename,
                    content_type=self.chunks.first().content_type,
                    size=total_bytes,
                    user=self.user
                )
                
                file_obj.file.save(self.filename, django_file, save=True)
            
            self.user.update_storage_used(total_bytes)
            
            for chunk in self.chunks:
                if os.path.exists(chunk.file):
                    os.remove(chunk.file)
                chunk.delete()
        
        os.remove(temp_path)
        return file_obj

resumer = ChunkUploadResumer("test@example.com", "DJI_0442.MP4")
file_obj = resumer.merge_chunks()