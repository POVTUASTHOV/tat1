import os
import django
import tempfile
from django.core.files import File
from django.db import transaction

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from storage.models import ChunkedUpload, File as DjangoFile
from users.models import User

def complete_upload_manually():
    user = User.objects.get(email='test@example.com')
    filename = 'DJI_0442.MP4'
    
    chunks = ChunkedUpload.objects.filter(
        user=user, 
        filename=filename
    ).order_by('chunk_number')
    
    print(f"Found {chunks.count()} chunks")
    
    if chunks.count() == 0:
        print("No chunks found")
        return
    
    temp_dir = '/tmp'
    merged_file_path = os.path.join(temp_dir, filename)
    
    total_bytes = 0
    with open(merged_file_path, 'wb') as merged_file:
        for chunk in chunks:
            chunk_path = chunk.file
            if os.path.exists(chunk_path):
                with open(chunk_path, 'rb') as chunk_file:
                    data = chunk_file.read()
                    merged_file.write(data)
                    total_bytes += len(data)
                print(f"Merged chunk {chunk.chunk_number}")
            else:
                print(f"Chunk {chunk.chunk_number} file missing")
    
    with transaction.atomic():
        with open(merged_file_path, 'rb') as merged_file:
            django_file = File(merged_file, name=filename)
            
            file_obj = DjangoFile.objects.create(
                name=filename,
                content_type='application/zip',
                size=total_bytes,
                user=user,
                folder=None
            )
            
            file_obj.file.save(filename, django_file, save=True)
        
        user.update_storage_used(total_bytes)
        
        for chunk in chunks:
            chunk_path = chunk.file
            if os.path.exists(chunk_path):
                os.remove(chunk_path)
            chunk.delete()
    
    os.remove(merged_file_path)
    
    print(f"Upload completed!")
    print(f"File ID: {file_obj.id}")
    print(f"Size: {total_bytes:,} bytes")

if __name__ == "__main__":
    complete_upload_manually()