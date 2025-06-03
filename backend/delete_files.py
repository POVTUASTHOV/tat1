import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from storage.models import File as DjangoFile, ChunkedUpload
from users.models import User
from django.db import transaction
from django.conf import settings

def delete_all_files():
    with transaction.atomic():
        files = DjangoFile.objects.all()
        total_files = files.count()
        total_size_freed = 0
        
        for file_obj in files:
            file_size = file_obj.size
            user = file_obj.user
            
            try:
                if file_obj.file and hasattr(file_obj.file, 'path'):
                    file_path = file_obj.file.path
                    if os.path.exists(file_path):
                        os.remove(file_path)
            except (ValueError, AttributeError):
                pass
            
            user.update_storage_used(file_size, subtract=True)
            total_size_freed += file_size
            file_obj.delete()
        
        chunks = ChunkedUpload.objects.all()
        total_chunks = chunks.count()
        
        for chunk in chunks:
            chunk_path = chunk.file
            if chunk_path and os.path.exists(chunk_path):
                os.remove(chunk_path)
            chunk.delete()
        
        print(f"Deleted {total_files} files")
        print(f"Deleted {total_chunks} chunks") 
        print(f"Freed {total_size_freed:,} bytes ({total_size_freed/1024/1024/1024:.2f} GB)")

def delete_user_files(email):
    try:
        user = User.objects.get(email=email)
        
        with transaction.atomic():
            files = DjangoFile.objects.filter(user=user)
            chunks = ChunkedUpload.objects.filter(user=user)
            
            total_size_freed = 0
            files_count = files.count()
            chunks_count = chunks.count()
            
            for file_obj in files:
                try:
                    if file_obj.file and hasattr(file_obj.file, 'path'):
                        if os.path.exists(file_obj.file.path):
                            os.remove(file_obj.file.path)
                except (ValueError, AttributeError):
                    pass
                total_size_freed += file_obj.size
                file_obj.delete()
            
            for chunk in chunks:
                if chunk.file and os.path.exists(chunk.file):
                    os.remove(chunk.file)
                chunk.delete()
            
            user.storage_used = 0
            user.save()
            
            print(f"Deleted {files_count} files for {email}")
            print(f"Deleted {chunks_count} chunks for {email}")
            print(f"Freed {total_size_freed:,} bytes")
            
    except User.DoesNotExist:
        print(f"User {email} not found")

def cleanup_orphaned_files():
    media_root = settings.MEDIA_ROOT
    
    for root, dirs, files in os.walk(media_root):
        for file in files:
            file_path = os.path.join(root, file)
            relative_path = os.path.relpath(file_path, media_root)
            
            if not DjangoFile.objects.filter(file=relative_path).exists():
                if not ChunkedUpload.objects.filter(file=file_path).exists():
                    try:
                        os.remove(file_path)
                        print(f"Removed orphaned file: {relative_path}")
                    except OSError:
                        pass

def reset_all_storage_quotas():
    users = User.objects.all()
    for user in users:
        user.storage_used = 0
        user.save()
    print(f"Reset storage for {users.count()} users")

if __name__ == "__main__":
    choice = input("1. Delete ALL files\n2. Delete files for specific user\n3. Cleanup orphaned files\n4. Reset storage quotas\nChoice: ")
    
    if choice == "1":
        confirm = input("Delete ALL files? Type 'DELETE' to confirm: ")
        if confirm == "DELETE":
            delete_all_files()
    elif choice == "2":
        email = input("Enter user email: ")
        delete_user_files(email)
    elif choice == "3":
        cleanup_orphaned_files()
    elif choice == "4":
        reset_all_storage_quotas()