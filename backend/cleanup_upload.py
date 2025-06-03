import requests
import os
import math
import time
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from storage.models import ChunkedUpload

def cleanup_existing_chunks(filename):
    chunks = ChunkedUpload.objects.filter(filename=filename)
    count = chunks.count()
    if count > 0:
        for chunk in chunks:
            if os.path.exists(chunk.file):
                os.remove(chunk.file)
        chunks.delete()
        print(f"Cleaned up {count} existing chunks")

cleanup_existing_chunks("train.zip")