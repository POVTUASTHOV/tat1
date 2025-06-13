# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.

## Project Overview

This is a full-stack data management system with file upload, storage, and workflow management capabilities. It consists of a Django REST API backend with FastAPI integration for high-performance file operations, and a Next.js frontend.

### Architecture

**Backend (Django + FastAPI):**
- Django REST framework for user management, authentication (JWT), and API endpoints
- FastAPI app for high-performance chunked file uploads and video processing
- SQLite database with custom User model and role-based permissions
- Apps: `users`, `storage`, `file_management`, `media_preview`, `workflow_management`
- JWT authentication with access/refresh tokens
- Custom middleware for permissions and access logging

**Frontend (Next.js):**
- Next.js 15 with App router, TypeScript, and Tailwind CSS
- Zustand for state management
- Path aliases configured (`@/*` → `./src/*`)
- Authentication with login/dashboard layout
- File management, project management, and workflow interfaces

## Development Commands

### Backend (from /backend directory)
**Prerequisites:** 
- Python with Django, FastAPI, and REST framework packages
- SQLite database (db.sqlite3) - no additional database setup required
- No requirements.txt - dependencies managed via Django apps

**Core Development:**
- **Run Django server:** `python manage.py runserver` (port 8000)
- **Run FastAPI server:** `python fastapi_app/main.py` (async upload/video processing server)
- **Both servers required:** FastAPI handles chunked uploads, Django handles API/auth
- **Database migrations:** `python manage.py makemigrations` then `python manage.py migrate`
- **Create superuser:** `python manage.py createsuperuser`

**Management Commands:**
- **Reset database:** `python manage.py reset_db` (custom command)
- **Cleanup files:** `python manage.py cleanup_files`
- **Setup workflow:** `python manage.py setup_workflow`
- **Create demo workflow:** `python manage.py create_demo_workflow`
- **Run tests:** `python manage.py test` (Django unit tests)

**Utility scripts:** 
- `python cleanup_upload.py` - Clean up incomplete uploads
- `python fix_mime_types.py` - Fix file MIME types
- `python quick_quota.py` - Check storage quotas
- `python delete_files.py` - Bulk file operations
- `python check_users.py` - Check user status and roles
- `python make_superuser.py` - Make user 'TAT' a superuser

### Frontend (from /frontend directory)
- **Development server:** `npm run dev` (port 3000)
- **Build:** `npm run build` (ESLint/TypeScript errors ignored in production builds)
- **Start production:** `npm start`
- **Lint:** `npm run lint`
- **Type checking:** `npx tsc --noEmit` (verify TypeScript types)
- **Package management:** Uses npm (package-lock.json)

## Key Configuration

- **Database:** SQLite (db.sqlite3) for development - configured in `core/settings.py`
- **File uploads:** Dynamic chunked uploads (1MB-50MB chunks based on network), max 50GB files
- **Authentication:** JWT tokens (1-hour access, 7-day refresh) with token blacklisting
- **CORS:** Configured for localhost:3000 (frontend) and localhost:8000 (backend)
- **Media handling:** Files stored in `/media` with automatic permission management in development
- **Adaptive upload:** Network condition detection with automatic chunk size optimization

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

- **Dual server architecture:** Both Django (port 8000) and FastAPI servers must run simultaneously
  - Django: `python manage.py runserver` - handles API/auth/admin
  - FastAPI: `python fastapi_app/main.py` - handles chunked uploads/video processing
- **Database setup:** Uses SQLite (db.sqlite3) for development - no additional setup required
- **Custom middleware:** Three custom middleware classes in users app handle permissions and logging
- **Logging:** All operations logged to `/backend/logs/upload.log` with structured formatting
- **No dependency tracking:** Dependencies managed through Django apps, not requirements.txt
- **Testing:** Limited coverage - test files in `/backend/test/` directory, integration tests for file uploads available
- **Admin access:** Use `python make_superuser.py` to create admin user 'TAT'

## API Endpoints Structure

- **Django REST API:** `/users/`, `/storage/`, `/file-management/`, `/media-preview/`, `/workflow/`
- **FastAPI:** High-performance upload endpoints for chunked file operations
- **Frontend API calls:** TypeScript interfaces defined in `/frontend/src/types/index.ts`
- **Authentication:** JWT Bearer tokens required for most endpoints
# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.