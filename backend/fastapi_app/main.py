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
import datetime
import mimetypes
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
from django.utils import timezone
from storage.models import File as DjangoFile, Folder, ChunkedUpload, Project
from pydantic import BaseModel
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="NAS FastAPI", version="1.0.0")
router = APIRouter()

CHUNK_SIZE = 100 * 1024 * 1024
MAX_CONCURRENT_CHUNKS = 4
TEMP_CLEANUP_INTERVAL = 1800

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

User = get_user_model()
active_uploads: Dict[str, Dict] = {}

def detect_content_type(filename):
    content_type, _ = mimetypes.guess_type(filename)
    if content_type:
        return content_type
    
    extension = filename.lower().split('.')[-1] if '.' in filename else ''
    
    extension_map = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg', 
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'tiff': 'image/tiff',
        'ico': 'image/x-icon',
        'mp4': 'video/mp4',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'wmv': 'video/x-ms-wmv',
        'flv': 'video/x-flv',
        'webm': 'video/webm',
        'mkv': 'video/x-matroska',
        '3gp': 'video/3gpp',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac',
        'aac': 'audio/aac',
        'm4a': 'audio/mp4',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'txt': 'text/plain',
        'csv': 'text/csv',
        'json': 'application/json',
        'xml': 'application/xml',
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'py': 'text/x-python',
        'zip': 'application/zip',
        'rar': 'application/vnd.rar',
        'tar': 'application/x-tar',
        'gz': 'application/gzip',
        '7z': 'application/x-7z-compressed'
    }
    
    return extension_map.get(extension, 'application/octet-stream')

class ChunkUploadRequest(BaseModel):
    filename: str
    chunk_number: int
    total_chunks: int
    total_size: int
    chunk_hash: Optional[str] = None
    project_id: str
    folder_id: Optional[str] = None

class CompleteUploadRequest(BaseModel):
    filename: str
    project_id: str
    folder_id: Optional[str] = None

@sync_to_async
def get_user_by_id(user_id):
    return User.objects.get(id=user_id)

@sync_to_async
def check_user_storage_space(user, total_size):
    return user.has_storage_space(total_size)

@sync_to_async
def get_project_by_id(project_id, user):
    try:
        project = Project.objects.get(id=project_id, user=user)
        return project
    except Project.DoesNotExist:
        raise Exception("Project not found")

@sync_to_async
def get_folder_by_id(folder_id, user):
    try:
        folder = Folder.objects.select_related('project').get(id=folder_id)
        if folder.user != user:
            raise Exception("Folder does not belong to user")
        return folder
    except Folder.DoesNotExist:
        raise Exception("Folder not found")

@sync_to_async
def create_or_update_chunked_upload_record(temp_file_path, filename, content_type, chunk_number, total_chunks, total_size, user, project, folder):
    try:
        chunk_record = ChunkedUpload.objects.get(
            user=user,
            filename=filename,
            chunk_number=chunk_number,
            project=project
        )
        chunk_record.file = temp_file_path
        chunk_record.content_type = content_type
        chunk_record.total_chunks = total_chunks
        chunk_record.total_size = total_size
        chunk_record.folder = folder
        chunk_record.save()
        return chunk_record
    except ChunkedUpload.DoesNotExist:
        return ChunkedUpload.objects.create(
            file=temp_file_path,
            filename=filename,
            content_type=content_type,
            chunk_number=chunk_number,
            total_chunks=total_chunks,
            total_size=total_size,
            user=user,
            project=project,
            folder=folder
        )

@sync_to_async
def cleanup_existing_chunks(user, project, filename):
    chunks = ChunkedUpload.objects.filter(
        user=user,
        project=project,
        filename=filename
    )
    for chunk in chunks:
        if os.path.exists(chunk.file):
            try:
                os.remove(chunk.file)
            except OSError:
                pass
    chunks.delete()

@sync_to_async
def create_final_file(name, content_type, size, user, project, folder, file_path):
    if content_type == 'application/octet-stream' or not content_type:
        content_type = detect_content_type(name)
    
    file_obj = DjangoFile(
        name=name,
        content_type=content_type,
        size=size,
        user=user,
        project=project,
        folder=folder
    )
    file_obj.file.name = file_path
    file_obj.save()
    return file_obj

@sync_to_async
def get_chunks_for_upload(user, project, filename):
    return list(ChunkedUpload.objects.filter(user=user, project=project, filename=filename).order_by('chunk_number'))

@sync_to_async
def update_user_storage(user, size):
    user.update_storage_used(size)

@sync_to_async
def delete_chunk(chunk):
    chunk.delete()

@sync_to_async
def filter_chunks_by_upload(user, project, filename):
    return ChunkedUpload.objects.filter(user=user, project=project, filename=filename)

@sync_to_async
def cleanup_old_uploads():
    old_threshold = timezone.now() - datetime.timedelta(hours=24)
    old_chunks = ChunkedUpload.objects.filter(created_at__lt=old_threshold)
    
    for chunk in old_chunks:
        if os.path.exists(chunk.file):
            try:
                os.remove(chunk.file)
            except OSError:
                pass
    
    deleted_count = old_chunks.count()
    old_chunks.delete()
    return deleted_count

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        scheme, token = authorization.split(" ", 1)
        if scheme.lower() != 'bearer':
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
        
        access_token = AccessToken(token)
        user_id = access_token.payload.get("user_id")
        
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await get_user_by_id(user_id)
        return user
    except InvalidToken:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
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

def get_upload_key(user_id: str, project_id: str, filename: str) -> str:
    return hashlib.md5(f"{user_id}_{project_id}_{filename}".encode()).hexdigest()[:16]

async def periodic_cleanup():
    while True:
        try:
            deleted = await cleanup_old_uploads()
            if deleted > 0:
                logger.info(f"Cleaned up {deleted} old chunk uploads")
            await cleanup_temp_files()
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
        
        await asyncio.sleep(3600)

@router.post("/upload/chunk/")
async def upload_chunk(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    filename: str = Form(...),
    chunk_number: int = Form(...),
    total_chunks: int = Form(...),
    total_size: int = Form(...),
    project_id: str = Form(...),
    folder_id: Optional[str] = Form(None),
    current_user = Depends(get_current_user)
):
    try:
        logger.info(f"Uploading chunk {chunk_number}/{total_chunks} for file {filename}")
        
        if folder_id == "":
            folder_id = None
            
        if not await check_user_storage_space(current_user, total_size):
            raise HTTPException(status_code=400, detail="Not enough storage space")
        
        try:
            project = await get_project_by_id(project_id, current_user)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Project not found: {str(e)}")
        
        folder = None
        if folder_id:
            try:
                folder = await get_folder_by_id(folder_id, current_user)
                if str(folder.project.id) != project_id:
                    raise HTTPException(status_code=400, detail="Folder does not belong to specified project")
            except Exception as e:
                raise HTTPException(status_code=404, detail=f"Folder not found: {str(e)}")
        
        upload_key = get_upload_key(str(current_user.id), project_id, filename)
        
        if chunk_number == 0:
            await cleanup_existing_chunks(current_user, project, filename)
            if upload_key in active_uploads:
                del active_uploads[upload_key]
        
        temp_dir = os.path.join(settings.MEDIA_ROOT, 'uploads', 'chunks')
        os.makedirs(temp_dir, exist_ok=True)
        
        chunk_filename = f"{upload_key}_c{chunk_number:03d}"
        temp_file_path = os.path.join(temp_dir, chunk_filename)
        
        bytes_written = 0
        async with aiofiles.open(temp_file_path, 'wb') as out_file:
            while True:
                chunk_data = await file.read(1024 * 1024)
                if not chunk_data:
                    break
                await out_file.write(chunk_data)
                bytes_written += len(chunk_data)
        
        if upload_key not in active_uploads:
            active_uploads[upload_key] = {
                'chunks_received': set(),
                'total_chunks': total_chunks,
                'total_size': total_size,
                'project_id': project_id,
                'folder_id': folder_id,
                'user_id': str(current_user.id),
                'filename': filename
            }
        
        active_uploads[upload_key]['chunks_received'].add(chunk_number)
        
        chunk_record = await create_or_update_chunked_upload_record(
            temp_file_path,
            filename,
            file.content_type or 'application/octet-stream',
            chunk_number,
            total_chunks,
            total_size,
            current_user,
            project,
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
            "bytes_written": bytes_written,
            "project_id": project_id,
            "folder_id": folder_id
        }
        
        if is_complete:
            response["message"] = "All chunks uploaded, ready to complete"
            background_tasks.add_task(cleanup_temp_files)
        
        return JSONResponse(content=response)
    
    except HTTPException:
        raise
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
        project_id = data.project_id
        folder_id = data.folder_id
        upload_key = get_upload_key(str(current_user.id), project_id, filename)
        
        try:
            project = await get_project_by_id(project_id, current_user)
        except Exception:
            raise HTTPException(status_code=404, detail="Project not found")
        
        folder = None
        if folder_id:
            try:
                folder = await get_folder_by_id(folder_id, current_user)
                if str(folder.project.id) != project_id:
                    raise HTTPException(status_code=400, detail="Folder does not belong to specified project")
            except Exception:
                raise HTTPException(status_code=404, detail="Folder not found")
        
        chunks = await get_chunks_for_upload(current_user, project, filename)
        
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
                    chunk_path = chunk.file
                    if not os.path.exists(chunk_path):
                        raise HTTPException(status_code=500, detail=f"Chunk file missing: {chunk.chunk_number}")
                    
                    with open(chunk_path, 'rb') as chunk_file:
                        while True:
                            buffer = chunk_file.read(1024 * 1024)
                            if not buffer:
                                break
                            merged_file.write(buffer)
                            total_bytes_written += len(buffer)
            
            project_name = project.name.replace(' ', '_').replace('/', '_').lower()
            safe_filename = "".join(c for c in filename if c.isalnum() or c in '.-_')
            
            if folder:
                folder_path = folder.path.replace(' ', '_').replace('/', '_').lower()
                relative_path = f"user_{current_user.id}/{project_name}/{folder_path}/{safe_filename}"
            else:
                relative_path = f"user_{current_user.id}/{project_name}/{safe_filename}"
            
            final_content_type = detect_content_type(filename)
            
            file_obj = await create_final_file(
                filename,
                final_content_type,
                total_bytes_written,
                current_user,
                project,
                folder,
                relative_path
            )
            
            file_dir = os.path.dirname(file_obj.file.path)
            os.makedirs(file_dir, exist_ok=True)
            
            import shutil
            shutil.move(merged_file_path, file_obj.file.path)
            
            await update_user_storage(current_user, file_obj.size)
            
            for chunk in chunks:
                chunk_path = chunk.file
                if os.path.exists(chunk_path):
                    os.remove(chunk_path)
                await delete_chunk(chunk)
            
            if upload_key in active_uploads:
                del active_uploads[upload_key]
            
            return JSONResponse(content={
                "id": str(file_obj.id),
                "name": file_obj.name,
                "size": file_obj.size,
                "content_type": file_obj.content_type,
                "project": str(project.id),
                "project_name": project.name,
                "folder": str(folder.id) if folder else None,
                "folder_name": folder.name if folder else None,
                "uploaded_at": str(file_obj.uploaded_at),
                "total_bytes": total_bytes_written,
                "file_path": file_obj.get_file_path()
            })
        
        except Exception as e:
            if os.path.exists(merged_file_path):
                os.remove(merged_file_path)
            raise e
    
    except Exception as e:
        logger.error(f"Error completing upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error completing upload: {str(e)}")

@router.get("/upload/status/{project_id}/{filename}")
async def get_upload_status(
    project_id: str,
    filename: str,
    current_user = Depends(get_current_user)
):
    upload_key = get_upload_key(str(current_user.id), project_id, filename)
    
    try:
        project = await get_project_by_id(project_id, current_user)
    except Exception:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if upload_key not in active_uploads:
        chunks = await filter_chunks_by_upload(current_user, project, filename)
        if not chunks:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        return JSONResponse(content={
            "status": "unknown",
            "chunks_received": len(chunks),
            "total_chunks": chunks[0].total_chunks if chunks else 0,
            "project_id": project_id,
            "filename": filename
        })
    
    upload_info = active_uploads[upload_key]
    return JSONResponse(content={
        "status": "in_progress",
        "chunks_received": len(upload_info['chunks_received']),
        "total_chunks": upload_info['total_chunks'],
        "progress_percent": (len(upload_info['chunks_received']) / upload_info['total_chunks']) * 100,
        "project_id": project_id,
        "filename": filename
    })

@router.delete("/upload/cancel/{project_id}/{filename}")
async def cancel_upload(
    project_id: str,
    filename: str,
    current_user = Depends(get_current_user)
):
    upload_key = get_upload_key(str(current_user.id), project_id, filename)
    
    try:
        project = await get_project_by_id(project_id, current_user)
    except Exception:
        raise HTTPException(status_code=404, detail="Project not found")
    
    chunks = await get_chunks_for_upload(current_user, project, filename)
    for chunk in chunks:
        if os.path.exists(chunk.file):
            os.remove(chunk.file)
        await delete_chunk(chunk)
    
    if upload_key in active_uploads:
        del active_uploads[upload_key]
    
    return JSONResponse(content={
        "message": "Upload cancelled successfully",
        "project_id": project_id,
        "filename": filename
    })

app.include_router(router, prefix="/api")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(periodic_cleanup())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)