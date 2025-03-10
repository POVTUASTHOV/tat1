# fastapi/main.py
import os
import sys
import django
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header, Form, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import shutil
import tempfile
import jwt
import aiofiles
import logging
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from storage.models import File as DjangoFile, Folder, ChunkedUpload
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="NAS FastAPI", version="1.0.0")
router = APIRouter()  # Tạo router để có thể include vào app chính

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

User = get_user_model()

class CompleteUploadRequest(BaseModel):
    filename: str
    folder_id: Optional[str] = None

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
        
        user = User.objects.get(id=user_id)
        return user
    except (jwt.PyJWTError, User.DoesNotExist):
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/upload/chunk/")
async def upload_chunk(
    file: UploadFile = File(...),
    filename: str = Form(...),
    chunk_number: int = Form(...),
    total_chunks: int = Form(...),
    total_size: int = Form(...),
    folder_id: Optional[str] = Form(None),
    current_user = Depends(get_current_user)
):
    try:
        # Implementation as before
        if not current_user.has_storage_space(total_size):
            raise HTTPException(status_code=400, detail="Not enough storage space")
        
        folder = None
        if folder_id:
            try:
                folder = Folder.objects.get(id=folder_id, user=current_user)
            except Folder.DoesNotExist:
                raise HTTPException(status_code=404, detail="Folder not found")
        
        temp_dir = os.path.join(settings.MEDIA_ROOT, 'uploads', 'chunks')
        os.makedirs(temp_dir, exist_ok=True)
        
        temp_file_path = os.path.join(temp_dir, f"{current_user.id}_{filename}_{chunk_number}")
        
        async with aiofiles.open(temp_file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
        
        chunk = ChunkedUpload.objects.create(
            file=temp_file_path,
            filename=filename,
            content_type=file.content_type,
            chunk_number=chunk_number,
            total_chunks=total_chunks,
            total_size=total_size,
            user=current_user,
            folder=folder
        )
        
        response = {
            "status": "success",
            "message": f"Chunk {chunk_number + 1}/{total_chunks} uploaded successfully",
            "chunk_id": str(chunk.id)
        }
        
        if chunk_number == total_chunks - 1:
            response["status"] = "complete"
            response["message"] = "All chunks uploaded, ready to complete"
        
        return JSONResponse(content=response)
    
    except Exception as e:
        logger.error(f"Error uploading chunk: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error uploading chunk: {str(e)}")

@router.post("/upload/complete/")
async def complete_upload(
    data: CompleteUploadRequest,
    current_user = Depends(get_current_user)
):
    # Implementation as before
    try:
        filename = data.filename
        folder_id = data.folder_id
        
        folder = None
        if folder_id:
            try:
                folder = Folder.objects.get(id=folder_id, user=current_user)
            except Folder.DoesNotExist:
                raise HTTPException(status_code=404, detail="Folder not found")
        
        chunks = ChunkedUpload.objects.filter(
            user=current_user,
            filename=filename
        ).order_by('chunk_number')
        
        if not chunks.exists():
            raise HTTPException(status_code=400, detail="No chunks found")
        
        total_chunks = chunks.first().total_chunks
        if chunks.count() != total_chunks:
            return JSONResponse(content={
                "error": "Not all chunks are uploaded yet",
                "uploaded": chunks.count(),
                "total": total_chunks
            })
        
        temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp')
        os.makedirs(temp_dir, exist_ok=True)
        
        merged_file_path = os.path.join(temp_dir, filename)
        with open(merged_file_path, 'wb') as merged_file:
            for chunk in chunks:
                with open(chunk.file.path, 'rb') as chunk_file:
                    merged_file.write(chunk_file.read())
        
        with transaction.atomic():
            file_obj = DjangoFile.objects.create(
                name=filename,
                content_type=chunks.first().content_type,
                size=chunks.first().total_size,
                user=current_user,
                folder=folder
            )
            
            file_dir = os.path.dirname(file_obj.file.path)
            os.makedirs(file_dir, exist_ok=True)
            shutil.move(merged_file_path, file_obj.file.path)
            
            current_user.update_storage_used(file_obj.size)
            
            for chunk in chunks:
                if os.path.exists(chunk.file.path):
                    os.remove(chunk.file.path)
                chunk.delete()
        
        return JSONResponse(content={
            "id": str(file_obj.id),
            "name": file_obj.name,
            "size": file_obj.size,
            "content_type": file_obj.content_type,
            "folder": str(folder.id) if folder else None,
            "uploaded_at": str(file_obj.uploaded_at)
        })
    
    except Exception as e:
        logger.error(f"Error completing upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error completing upload: {str(e)}")

@router.post("/upload/")
async def upload_file(
    file: UploadFile = File(...),
    folder_id: Optional[str] = Form(None),
    current_user = Depends(get_current_user)
):
    # Implementation as before
    try:
        content = await file.read()
        content_length = len(content)
        
        if not current_user.has_storage_space(content_length):
            raise HTTPException(status_code=400, detail="Not enough storage space")
        
        folder = None
        if folder_id:
            try:
                folder = Folder.objects.get(id=folder_id, user=current_user)
            except Folder.DoesNotExist:
                raise HTTPException(status_code=404, detail="Folder not found")
        
        temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp')
        os.makedirs(temp_dir, exist_ok=True)
        
        temp_file_path = os.path.join(temp_dir, file.filename)
        async with aiofiles.open(temp_file_path, 'wb') as out_file:
            await out_file.write(content)
        
        file_obj = DjangoFile.objects.create(
            name=file.filename,
            content_type=file.content_type,
            size=content_length,
            user=current_user,
            folder=folder
        )
        
        file_dir = os.path.dirname(file_obj.file.path)
        os.makedirs(file_dir, exist_ok=True)
        shutil.move(temp_file_path, file_obj.file.path)
        
        current_user.update_storage_used(file_obj.size)
        
        return JSONResponse(content={
            "id": str(file_obj.id),
            "name": file_obj.name,
            "size": file_obj.size,
            "content_type": file_obj.content_type,
            "folder": str(folder.id) if folder else None,
            "uploaded_at": str(file_obj.uploaded_at)
        })
    
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

@router.get("/folders/")
async def list_folders(current_user = Depends(get_current_user)):
    folders = Folder.objects.filter(user=current_user)
    return [
        {
            "id": str(folder.id),
            "name": folder.name,
            "path": folder.path,
            "parent": str(folder.parent.id) if folder.parent else None,
            "created_at": folder.created_at,
            "updated_at": folder.updated_at
        }
        for folder in folders
    ]

@router.get("/files/")
async def list_files(
    folder_id: Optional[str] = None,
    current_user = Depends(get_current_user)
):
    query = {"user": current_user}
    if folder_id:
        try:
            folder = Folder.objects.get(id=folder_id, user=current_user)
            query["folder"] = folder
        except Folder.DoesNotExist:
            raise HTTPException(status_code=404, detail="Folder not found")
    
    files = DjangoFile.objects.filter(**query)
    return [
        {
            "id": str(file.id),
            "name": file.name,
            "size": file.size,
            "content_type": file.content_type,
            "folder": str(file.folder.id) if file.folder else None,
            "uploaded_at": file.uploaded_at
        }
        for file in files
    ]

@router.get("/files/{file_id}/download")
async def download_file(
    file_id: str,
    current_user = Depends(get_current_user)
):
    try:
        file_obj = DjangoFile.objects.get(id=file_id, user=current_user)
    except DjangoFile.DoesNotExist:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = file_obj.file.path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
    
    return JSONResponse(content={"download_url": f"/media/{file_obj.file.name}"})

# Include router với app
app.include_router(router, prefix="/api")

# Phần này vẫn giữ cho tương thích khi chạy trực tiếp
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)