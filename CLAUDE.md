# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a full-stack data management system with file upload, storage, and workflow management capabilities. It consists of a Django REST API backend with FastAPI integration for high-performance file operations, and a Next.js frontend.

### Architecture

**Backend (Django + FastAPI):**
- Django REST framework for user management, authentication (JWT), and API endpoints
- FastAPI app for high-performance chunked file uploads and video processing
- MySQL database with custom User model and role-based permissions
- Apps: `users`, `storage`, `file_management`, `media_preview`, `workflow_management`
- JWT authentication with access/refresh tokens
- Custom middleware for permissions and access logging

**Frontend (Next.js):**
- App router with TypeScript and Tailwind CSS
- Zustand for state management
- Authentication with login/dashboard layout
- File management, project management, and workflow interfaces

## Development Commands

### Backend (from /backend directory)
**Prerequisites:** Install Django and dependencies (no requirements.txt found - dependencies in Django apps)

- **Run Django server:** `python manage.py runserver` (port 8000)
- **Run FastAPI server:** `python fastapi_app/main.py` (async file upload server)
- **Database migrations:** `python manage.py makemigrations` then `python manage.py migrate`
- **Create superuser:** `python manage.py createsuperuser`
- **Reset database:** `python manage.py reset_db` (custom command)
- **Cleanup files:** `python manage.py cleanup_files`
- **Setup workflow:** `python manage.py setup_workflow`
- **Create demo workflow:** `python manage.py create_demo_workflow`

**Utility scripts:** 
- `python cleanup_upload.py` - Clean up incomplete uploads
- `python fix_mime_types.py` - Fix file MIME types
- `python quick_quota.py` - Check storage quotas
- `python delete_files.py` - Bulk file operations

### Frontend (from /frontend directory)
- **Development server:** `npm run dev` (port 3000)
- **Build:** `npm run build`
- **Start production:** `npm start`
- **Lint:** `npm run lint`

## Key Configuration

- **Database:** MySQL connection configured in `core/settings.py`
- **File uploads:** Chunked uploads with 100MB chunks, max 50GB files
- **Authentication:** JWT tokens (1-hour access, 7-day refresh)
- **CORS:** Configured for localhost:3000 (frontend) and localhost:8000 (backend)
- **Media handling:** Files stored in `/media` with permission management

## Application Structure

### Storage System
- **ChunkedUpload model:** Handles large file uploads in chunks
- **File/Folder models:** Hierarchical file system with projects
- **Project-based organization:** Files are organized within projects

### User Management
- **Custom User model** with storage quotas and role-based permissions
- **Access logging middleware** tracks user activities
- **Permission system** with custom middleware enforcement

### Workflow Management
- **FilePair model:** Links files for batch processing (image+JSON pairs)
- **AssignmentBatch model:** Manages user assignments for data processing tasks
- **Signal-based processing** for file events
- **Background task support** (tasks.py)

### Video Processing
- **Optional video processing** via `video_processing/video_processor.py`
- **GPU monitoring** and transcoding capabilities
- **FastAPI integration** for async video operations
- **Chunked video streaming** with manifest-based playback

### File Preview System
- **Multi-format preview:** Images, videos, text, PDF, archives
- **Streaming support:** Large video files with chunked loading
- **Archive browsing:** View contents of ZIP/RAR files without extraction

## Important Notes

- **Dual server setup:** Both Django (`python manage.py runserver`) and FastAPI (`python fastapi_app/main.py`) need to be running for full functionality
- **File permissions:** Media files have automatic permission management in development
- **Logging:** Comprehensive logging configured for uploads and file operations in `/logs`
- **Security:** Custom permission middleware enforces access controls across all endpoints
- **No dependency files:** Dependencies are not tracked in requirements.txt - check installed packages in Django apps
- **Testing:** Limited test coverage - main test files in `/backend/test/` directory

## API Endpoints Structure

- **Django REST API:** `/users/`, `/storage/`, `/file-management/`, `/media-preview/`, `/workflow/`
- **FastAPI:** High-performance upload endpoints for chunked file operations
- **Frontend API calls:** TypeScript interfaces defined in `/frontend/src/types/index.ts`
- **Authentication:** JWT Bearer tokens required for most endpoints