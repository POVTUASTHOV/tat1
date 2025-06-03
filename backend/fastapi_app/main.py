import os
import sys
import django
from pathlib import Path
import asyncio
import aiofiles
import hashlib
from typing import Optional, Dict, List
import tempfile
import logging
import time
from asgiref.sync import sync_to_async

sys.path.append(str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header, Form, APIRouter, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from storage.models import File as DjangoFile, Folder, ChunkedUpload
from pydantic import BaseModel
import jwt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="NAS FastAPI", version="1.0.0")
router = APIRouter()

CHUNK_SIZE = 100 * 1024 * 1024
MAX_CONCURRENT_CHUNKS = 4
TEMP_CLEANUP_INTERVAL = 1800

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

User = get_user_model()

active_uploads: Dict[str, Dict] = {}

class ChunkUploadRequest(BaseModel):
    filename: str
    chunk_number: int
    total_chunks: int
    total_size: int
    chunk_hash: Optional[str] = None
    folder_id: Optional[str] = None

class CompleteUploadRequest(BaseModel):
    filename: str
    folder_id: Optional[str] = None

@sync_to_async
def get_user_by_id(user_id):
    return User.objects.get(id=user_id)

@sync_to_async
def check_user_storage_space(user, total_size):
    return user.has_storage_space(total_size)

@sync_to_async
def get_folder_by_id(folder_id, user):
    return Folder.objects.get(id=folder_id, user=user)

@sync_to_async
def create_chunked_upload_record(temp_file_path, filename, content_type, chunk_number, total_chunks, total_size, user, folder):
    return ChunkedUpload.objects.create(
        file=temp_file_path,
        filename=filename,
        content_type=content_type,
        chunk_number=chunk_number,
        total_chunks=total_chunks,
        total_size=total_size,
        user=user,
        folder=folder
    )

@sync_to_async
def create_final_file(name, content_type, size, user, folder, file_path):
    file_obj = DjangoFile(
        name=name,
        content_type=content_type,
        size=size,
        user=user,
        folder=folder
    )
    file_obj.file.name = file_path
    file_obj.save()
    return file_obj

@sync_to_async
def get_chunks_for_user(user, filename):
    return list(ChunkedUpload.objects.filter(user=user, filename=filename).order_by('chunk_number'))

@sync_to_async
def create_django_file(name, content_type, size, user, folder):
    return DjangoFile.objects.create(
        name=name,
        content_type=content_type,
        size=size,
        user=user,
        folder=folder
    )

@sync_to_async
def update_user_storage(user, size):
    user.update_storage_used(size)

@sync_to_async
def delete_chunk(chunk):
    chunk.delete()

@sync_to_async
def filter_chunks_by_user_and_filename(user, filename):
    return ChunkedUpload.objects.filter(user=user, filename=filename)

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != 'bearer':
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
        
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("user_id")
        
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await get_user_by_id(user_id)
        return user
    except (jwt.PyJWTError, Exception) as e:
        logger.error(f"Authentication error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid token")

async def cleanup_temp_files():
    temp_dir = os.path.join(settings.MEDIA_ROOT, 'uploads', 'chunks')
    if not os.path.exists(temp_dir):
        return
    
    current_time = time.time()
    for filename in os.listdir(temp_dir):
        filepath = os.path.join(temp_dir, filename)
        if os.path.isfile(filepath):
            file_age = current_time - os.path.getctime(filepath)
            if file_age > TEMP_CLEANUP_INTERVAL:
                try:
                    os.remove(filepath)
                    logger.info(f"Cleaned up old temp file: {filename}")
                except OSError:
                    pass

def get_upload_key(user_id: str, filename: str) -> str:
    return f"{user_id}_{filename}"

@router.post("/upload/chunk/")
async def upload_chunk(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    filename: str = Form(...),
    chunk_number: int = Form(...),
    total_chunks: int = Form(...),
    total_size: int = Form(...),
    folder_id: Optional[str] = Form(None),
    current_user = Depends(get_current_user)
):
    try:
        logger.info(f"Uploading chunk {chunk_number}/{total_chunks} for file {filename}")
        
        if not await check_user_storage_space(current_user, total_size):
            raise HTTPException(status_code=400, detail="Not enough storage space")
        
        folder = None
        if folder_id:
            try:
                folder = await get_folder_by_id(folder_id, current_user)
            except Exception:
                raise HTTPException(status_code=404, detail="Folder not found")
        
        temp_dir = os.path.join(settings.MEDIA_ROOT, 'uploads', 'chunks')
        os.makedirs(temp_dir, exist_ok=True)
        
        upload_key = get_upload_key(str(current_user.id), filename)
        chunk_filename = f"{upload_key}_chunk_{chunk_number:06d}"
        temp_file_path = os.path.join(temp_dir, chunk_filename)
        
        bytes_written = 0
        async with aiofiles.open(temp_file_path, 'wb') as out_file:
            while True:
                chunk_data = await file.read(1024 * 1024)
                if not chunk_data:
                    break
                await out_file.write(chunk_data)
                bytes_written += len(chunk_data)
        
        logger.info(f"Chunk {chunk_number} written: {bytes_written} bytes")
        
        if upload_key not in active_uploads:
            active_uploads[upload_key] = {
                'chunks_received': set(),
                'total_chunks': total_chunks,
                'total_size': total_size,
                'folder_id': folder_id,
                'user_id': str(current_user.id),
                'filename': filename
            }
        
        active_uploads[upload_key]['chunks_received'].add(chunk_number)
        
        chunk_record = await create_chunked_upload_record(
            temp_file_path,
            filename,
            file.content_type or 'application/octet-stream',
            chunk_number,
            total_chunks,
            total_size,
            current_user,
            folder
        )
        
        chunks_received = len(active_uploads[upload_key]['chunks_received'])
        is_complete = chunks_received == total_chunks
        
        response = {
            "status": "success" if not is_complete else "ready_to_merge",
            "message": f"Chunk {chunk_number + 1}/{total_chunks} uploaded successfully",
            "chunk_id": str(chunk_record.id),
            "chunks_received": chunks_received,
            "total_chunks": total_chunks,
            "bytes_written": bytes_written
        }
        
        if is_complete:
            response["message"] = "All chunks uploaded, ready to complete"
            background_tasks.add_task(cleanup_temp_files)
        
        logger.info(f"Chunk {chunk_number} upload successful")
        return JSONResponse(content=response)
    
    except Exception as e:
        logger.error(f"Error uploading chunk {chunk_number}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error uploading chunk: {str(e)}")

@router.post("/upload/complete/")
async def complete_upload(
    background_tasks: BackgroundTasks,
    data: CompleteUploadRequest,
    current_user = Depends(get_current_user)
):
    try:
        filename = data.filename
        folder_id = data.folder_id
        upload_key = get_upload_key(str(current_user.id), filename)
        
        folder = None
        if folder_id:
            try:
                folder = await get_folder_by_id(folder_id, current_user)
            except Exception:
                raise HTTPException(status_code=404, detail="Folder not found")
        
        chunks = await get_chunks_for_user(current_user, filename)
        
        if not chunks:
            raise HTTPException(status_code=400, detail="No chunks found")
        
        total_chunks = chunks[0].total_chunks
        if len(chunks) != total_chunks:
            return JSONResponse(content={
                "error": "Not all chunks are uploaded yet",
                "uploaded": len(chunks),
                "total": total_chunks
            }, status_code=400)
        
        temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp')
        os.makedirs(temp_dir, exist_ok=True)
        
        with tempfile.NamedTemporaryFile(delete=False, dir=temp_dir) as temp_merged:
            merged_file_path = temp_merged.name
        
        total_bytes_written = 0
        
        try:
            with open(merged_file_path, 'wb') as merged_file:
                for chunk in chunks:
                    chunk_path = chunk.file.path
                    if not os.path.exists(chunk_path):
                        raise HTTPException(status_code=500, detail=f"Chunk file missing: {chunk.chunk_number}")
                    
                    with open(chunk_path, 'rb') as chunk_file:
                        while True:
                            buffer = chunk_file.read(1024 * 1024)
                            if not buffer:
                                break
                            merged_file.write(buffer)
                            total_bytes_written += len(buffer)
            
            final_file_path = f"user_{current_user.id}/{filename}"
            file_obj = await create_final_file(
                filename,
                chunks[0].content_type,
                total_bytes_written,
                current_user,
                folder,
                final_file_path
            )
            
            file_dir = os.path.dirname(file_obj.file.path)
            os.makedirs(file_dir, exist_ok=True)
            
            import shutil
            shutil.move(merged_file_path, file_obj.file.path)
            
            await update_user_storage(current_user, file_obj.size)
            
            for chunk in chunks:
                chunk_path = chunk.file.path
                if os.path.exists(chunk_path):
                    os.remove(chunk_path)
                await delete_chunk(chunk)
            
            if upload_key in active_uploads:
                del active_uploads[upload_key]
            
            logger.info(f"Successfully merged file: {filename} ({total_bytes_written} bytes)")
            
            return JSONResponse(content={
                "id": str(file_obj.id),
                "name": file_obj.name,
                "size": file_obj.size,
                "content_type": file_obj.content_type,
                "folder": str(folder.id) if folder else None,
                "uploaded_at": str(file_obj.uploaded_at),
                "total_bytes": total_bytes_written
            })
        
        except Exception as e:
            if os.path.exists(merged_file_path):
                os.remove(merged_file_path)
            raise e
    
    except Exception as e:
        logger.error(f"Error completing upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error completing upload: {str(e)}")

@router.get("/upload/status/{filename}")
async def get_upload_status(
    filename: str,
    current_user = Depends(get_current_user)
):
    upload_key = get_upload_key(str(current_user.id), filename)
    
    if upload_key not in active_uploads:
        chunks = await filter_chunks_by_user_and_filename(current_user, filename)
        if not chunks:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        return JSONResponse(content={
            "status": "unknown",
            "chunks_received": len(chunks),
            "total_chunks": chunks[0].total_chunks if chunks else 0
        })
    
    upload_info = active_uploads[upload_key]
    return JSONResponse(content={
        "status": "in_progress",
        "chunks_received": len(upload_info['chunks_received']),
        "total_chunks": upload_info['total_chunks'],
        "progress_percent": (len(upload_info['chunks_received']) / upload_info['total_chunks']) * 100
    })

@router.delete("/upload/cancel/{filename}")
async def cancel_upload(
    filename: str,
    current_user = Depends(get_current_user)
):
    upload_key = get_upload_key(str(current_user.id), filename)
    
    chunks = await get_chunks_for_user(current_user, filename)
    for chunk in chunks:
        if os.path.exists(chunk.file.path):
            os.remove(chunk.file.path)
        await delete_chunk(chunk)
    
    if upload_key in active_uploads:
        del active_uploads[upload_key]
    
    return JSONResponse(content={"message": "Upload cancelled successfully"})

app.include_router(router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)