import requests
import os
import math
import time
import django
from django.core.files import File
from django.db import transaction

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from storage.models import ChunkedUpload, File as DjangoFile
from users.models import User

API_BASE = "http://localhost:8001/api"
LOGIN_URL = "http://localhost:8000/users/login/"
FILE_PATH = "/media/tat/backup/bai_toan/code.zip"
CHUNK_SIZE = 100 * 1024 * 1024

def upload_with_integrated_complete():
    login_data = {"email": "test@example.com", "password": "testpassword123"}
    
    login_response = requests.post(LOGIN_URL, json=login_data)
    token = login_response.json()["access"]
    headers = {"Authorization": f"Bearer {token}"}
    
    file_size = os.path.getsize(FILE_PATH)
    filename = os.path.basename(FILE_PATH)
    total_chunks = math.ceil(file_size / CHUNK_SIZE)
    
    print(f"📁 File: {filename}")
    print(f"📏 Size: {file_size:,} bytes ({file_size/1024/1024:.2f} MB)")
    print(f"🧩 Total chunks: {total_chunks}")
    
    start_time = time.time()
    
    user = User.objects.get(email='test@example.com')
    existing_chunks = ChunkedUpload.objects.filter(user=user, filename=filename)
    if existing_chunks.exists():
        for chunk in existing_chunks:
            if os.path.exists(chunk.file):
                os.remove(chunk.file)
        existing_chunks.delete()
        print("🧹 Cleaned existing chunks")
    
    with open(FILE_PATH, 'rb') as f:
        for chunk_number in range(total_chunks):
            chunk_start_time = time.time()
            
            f.seek(chunk_number * CHUNK_SIZE)
            chunk_data = f.read(CHUNK_SIZE)
            
            files = {'file': (f'chunk_{chunk_number}', chunk_data)}
            data = {
                'filename': filename,
                'chunk_number': chunk_number,
                'total_chunks': total_chunks,
                'total_size': file_size
            }
            
            response = requests.post(f"{API_BASE}/upload/chunk/", headers=headers, files=files, data=data)
            
            chunk_time = time.time() - chunk_start_time
            progress = ((chunk_number + 1) / total_chunks) * 100
            elapsed = time.time() - start_time
            speed = (chunk_number + 1) * CHUNK_SIZE / elapsed / 1024 / 1024
            
            print(f"📤 Chunk {chunk_number + 1}/{total_chunks} ({progress:.1f}%) - {speed:.1f} MB/s - {chunk_time:.1f}s")
            
            if response.status_code != 200:
                print(f"❌ Failed: {response.text}")
                return
    
    print("\n🔄 Completing upload with Django...")
    complete_with_django(filename, user)
    
    total_time = time.time() - start_time
    avg_speed = file_size / total_time / 1024 / 1024
    print(f"⏱️ Total time: {total_time/60:.1f} minutes")
    print(f"🚀 Average speed: {avg_speed:.1f} MB/s")

def complete_with_django(filename, user):
    chunks = ChunkedUpload.objects.filter(user=user, filename=filename).order_by('chunk_number')
    
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
    
    with transaction.atomic():
        with open(merged_file_path, 'rb') as merged_file:
            django_file = File(merged_file, name=filename)
            
            content_type = 'video/mp4' if filename.upper().endswith('.MP4') else 'application/octet-stream'
            file_obj = DjangoFile.objects.create(
                name=filename,
                content_type=content_type,
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
    
    print(f"🎉 Upload completed!")
    print(f"📋 File ID: {file_obj.id}")
    print(f"📏 Size: {total_bytes:,} bytes")

if __name__ == "__main__":
    upload_with_integrated_complete()