from django.db import models
from django.utils.translation import gettext_lazy as _
import uuid
import os
import stat
import logging
import mimetypes
from users.models import User

logger = logging.getLogger(__name__)

def detect_content_type(filename):
    content_type, _ = mimetypes.guess_type(filename)
    if content_type:
        return content_type
    
    extension = filename.lower().split('.')[-1] if '.' in filename else ''
    extension_map = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'bmp': 'image/bmp', 'webp': 'image/webp',
        'svg': 'image/svg+xml', 'tiff': 'image/tiff', 'ico': 'image/x-icon',
        'mp4': 'video/mp4', 'avi': 'video/x-msvideo', 'mov': 'video/quicktime',
        'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'webm': 'video/webm',
        'mkv': 'video/x-matroska', '3gp': 'video/3gpp',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
        'flac': 'audio/flac', 'aac': 'audio/aac', 'm4a': 'audio/mp4',
        'pdf': 'application/pdf', 'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'txt': 'text/plain', 'csv': 'text/csv', 'json': 'application/json',
        'xml': 'application/xml', 'html': 'text/html', 'css': 'text/css',
        'js': 'application/javascript', 'py': 'text/x-python',
        'zip': 'application/zip', 'rar': 'application/vnd.rar',
        'tar': 'application/x-tar', 'gz': 'application/gzip',
        '7z': 'application/x-7z-compressed'
    }
    return extension_map.get(extension, 'application/octet-stream')

class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='projects')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def get_total_size(self):
        return self.files.aggregate(total=models.Sum('size'))['total'] or 0
    
    def get_files_count(self):
        return self.files.count()
    
    def get_folders_count(self):
        return self.folders.count()
    
    def get_assigned_managers(self):
        """Get all managers assigned to this project"""
        from users.models import ProjectAssignment, WorkflowRole
        return User.objects.filter(
            project_assignments__project=self,
            project_assignments__is_active=True,
            workflow_role__name=WorkflowRole.MANAGER
        ).distinct()
    
    def get_assigned_employees(self):
        """Get all employees assigned to this project"""
        from users.models import ProjectAssignment, WorkflowRole
        return User.objects.filter(
            project_assignments__project=self,
            project_assignments__is_active=True,
            workflow_role__name=WorkflowRole.EMPLOYEE
        ).distinct()
    
    def get_all_assigned_users(self):
        """Get all users (managers and employees) assigned to this project"""
        from users.models import ProjectAssignment
        return User.objects.filter(
            project_assignments__project=self,
            project_assignments__is_active=True
        ).distinct()
    
    def can_user_access(self, user):
        """Check if a user can access this project"""
        # Admin (creator) always has access
        if self.user == user or user.is_admin_role():
            return True
        
        # Check if user is assigned to this project
        from users.models import ProjectAssignment
        return ProjectAssignment.objects.filter(
            project=self,
            user=user,
            is_active=True
        ).exists()
    
    def can_user_assign_files(self, user):
        """Check if a user can assign files in this project"""
        # Admin can assign files in any project
        if user.is_admin_role():
            return True
        
        # Managers can assign files only in their assigned projects
        if user.is_manager_role():
            return self.can_user_access(user)
        
        return False
    
    def get_assignable_files(self):
        """Get files that can be assigned (not currently assigned)"""
        return self.files.filter(
            models.Q(assignment_status__isnull=True) |
            models.Q(assignment_status__is_assigned=False)
        )
    
    def get_assigned_files(self):
        """Get files that are currently assigned"""
        return self.files.filter(
            assignment_status__is_assigned=True
        )
    
    def __str__(self):
        return self.name

    class Meta:
        unique_together = ('name', 'user')
        ordering = ['-updated_at']

def user_directory_path(instance, filename):
    if hasattr(instance, 'project') and instance.project:
        project_path = instance.project.name.replace(' ', '_').lower()
    else:
        project_path = 'default'
    folder_path = instance.folder.path if instance.folder else ""
    return f'user_{instance.user.id}/{project_path}/{folder_path}/{filename}'

class Folder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    path = models.CharField(max_length=1000, blank=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='folders', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='folders')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def save(self, *args, **kwargs):
        if self.parent:
            if self.parent.path:
                self.path = f"{self.parent.path}/{self.name}"
            else:
                self.path = self.name
        else:
            self.path = self.name
        super().save(*args, **kwargs)
    
    def get_full_path(self):
        project_name = self.project.name if self.project else 'No Project'
        return f"{project_name}/{self.path}"
    
    def get_files_count(self):
        return self.files.count()
    
    def get_subfolders_count(self):
        return self.children.count()
    
    def __str__(self):
        return self.get_full_path()

    class Meta:
        unique_together = ('name', 'parent', 'user')
        ordering = ['name']

class File(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to=user_directory_path, max_length=1000)
    size = models.BigIntegerField()
    content_type = models.CharField(max_length=100)
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, null=True, blank=True, related_name='files')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='files', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='files')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    def save(self, *args, **kwargs):
        if not self.content_type or self.content_type == 'application/octet-stream':
            self.content_type = detect_content_type(self.name)
        super().save(*args, **kwargs)
    
    def delete(self, *args, **kwargs):
        file_size = self.size
        user = self.user
        self._safe_delete_file()
        super().delete(*args, **kwargs)
        user.update_storage_used(file_size, subtract=True)
    
    def _safe_delete_file(self):
        if not self.file or not hasattr(self.file, 'path'):
            return
        
        file_path = self.file.path
        
        if not os.path.exists(file_path):
            logger.warning(f"File not found on disk: {file_path}")
            return
        
        try:
            self._try_delete_file(file_path)
            logger.info(f"File successfully deleted: {file_path}")
        except PermissionError:
            self._force_delete_file(file_path)
        except OSError as e:
            if e.errno == 13:
                self._force_delete_file(file_path)
            else:
                logger.error(f"OSError deleting file {file_path}: {e}")
                self._mark_for_cleanup(file_path)
    
    def _try_delete_file(self, file_path):
        if not os.access(file_path, os.W_OK):
            try:
                os.chmod(file_path, stat.S_IWRITE | stat.S_IREAD)
            except OSError:
                pass
        
        os.remove(file_path)
    
    def _force_delete_file(self, file_path):
        try:
            parent_dir = os.path.dirname(file_path)
            
            try:
                os.chmod(parent_dir, stat.S_IWRITE | stat.S_IREAD | stat.S_IEXEC)
                os.chmod(file_path, stat.S_IWRITE | stat.S_IREAD)
                os.remove(file_path)
                logger.info(f"File force deleted: {file_path}")
            except OSError:
                self._mark_for_cleanup(file_path)
                
        except Exception as e:
            logger.error(f"Force delete failed for {file_path}: {e}")
            self._mark_for_cleanup(file_path)
    
    def _mark_for_cleanup(self, file_path):
        cleanup_file = os.path.join(os.path.dirname(file_path), '.cleanup_queue')
        try:
            os.makedirs(os.path.dirname(cleanup_file), exist_ok=True)
            with open(cleanup_file, 'a') as f:
                f.write(f"{file_path}\n")
            logger.warning(f"File marked for cleanup: {file_path}")
        except Exception as e:
            logger.error(f"Failed to mark file for cleanup: {e}")
    
    def get_file_path(self):
        project_name = self.project.name if self.project else 'No Project'
        if self.folder:
            return f"{project_name}/{self.folder.path}/{self.name}"
        return f"{project_name}/{self.name}"
    
    def __str__(self):
        return self.get_file_path()

    class Meta:
        ordering = ['-uploaded_at']

class ChunkedUpload(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.CharField(max_length=1000)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    chunk_number = models.IntegerField()
    total_chunks = models.IntegerField()
    total_size = models.BigIntegerField()
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chunked_uploads')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='chunked_uploads', null=True, blank=True, default=None)
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def save(self, *args, **kwargs):
        if not self.content_type or self.content_type == 'application/octet-stream':
            self.content_type = detect_content_type(self.filename)
        super().save(*args, **kwargs)
    
    class Meta:
        db_table = 'storage_chunkedupload'
        unique_together = ('user', 'filename', 'chunk_number', 'project')

class Assignment(models.Model):
    """Track file assignments to users"""
    PENDING = 'pending'
    IN_PROGRESS = 'in_progress'
    COMPLETED = 'completed'
    CANCELLED = 'cancelled'
    
    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (IN_PROGRESS, 'In Progress'),
        (COMPLETED, 'Completed'),
        (CANCELLED, 'Cancelled'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.ForeignKey(File, on_delete=models.CASCADE, related_name='assignments')
    assigned_to = models.ForeignKey(User, on_delete=models.CASCADE, related_name='file_assignments')
    assigned_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='assigned_files')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='file_assignments')
    assigned_date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    due_date = models.DateTimeField(null=True, blank=True)
    completed_date = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    
    class Meta:
        db_table = 'file_assignments'
        ordering = ['-assigned_date']
    
    @classmethod
    def can_assign_file(cls, file, assigned_to, assigned_by):
        """Check if a file can be assigned based on business rules"""
        from django.core.exceptions import ValidationError
        
        # Check if file is already assigned
        try:
            file_status = file.assignment_status
            if file_status.is_assigned:
                return False, f"File '{file.name}' is already assigned to {file_status.assigned_to.username}"
        except FileStatus.DoesNotExist:
            # File has no assignment status yet, can be assigned
            pass
        
        # Check if assigned_by has permission to assign files in this project
        if not file.project.can_user_assign_files(assigned_by):
            return False, f"You do not have permission to assign files in project '{file.project.name}'"
        
        # Check if assigned_to has access to this project
        if not file.project.can_user_access(assigned_to):
            return False, f"User '{assigned_to.username}' does not have access to project '{file.project.name}'"
        
        # Check if assigned_to is an employee (only employees should receive file assignments)
        if not assigned_to.is_employee_role():
            return False, f"Files can only be assigned to employees. '{assigned_to.username}' is not an employee."
        
        return True, "Assignment is valid"
    
    @classmethod
    def create_assignment(cls, file, assigned_to, assigned_by, due_date=None, notes=''):
        """Create a new assignment with validation"""
        from django.core.exceptions import ValidationError
        
        # Validate assignment
        can_assign, message = cls.can_assign_file(file, assigned_to, assigned_by)
        if not can_assign:
            raise ValidationError(message)
        
        # Create assignment
        assignment = cls.objects.create(
            file=file,
            assigned_to=assigned_to,
            assigned_by=assigned_by,
            project=file.project,
            due_date=due_date,
            notes=notes
        )
        
        return assignment
    
    def can_change_status(self, new_status, user):
        """Check if a user can change the assignment status"""
        # Assigned user can change status to in_progress or completed
        if user == self.assigned_to and new_status in [self.IN_PROGRESS, self.COMPLETED]:
            return True, "Status change allowed"
        
        # Assigner can change status to cancelled or back to pending
        if user == self.assigned_by and new_status in [self.CANCELLED, self.PENDING]:
            return True, "Status change allowed"
        
        # Admin can change any status
        if user.is_admin_role():
            return True, "Admin can change any status"
        
        # Managers can change status for assignments in their projects
        if user.is_manager_role() and self.project.can_user_access(user):
            return True, "Manager can change status in assigned project"
        
        return False, "You do not have permission to change this assignment status"
    
    def update_status(self, new_status, user, notes=''):
        """Update assignment status with validation"""
        from django.core.exceptions import ValidationError
        
        can_change, message = self.can_change_status(new_status, user)
        if not can_change:
            raise ValidationError(message)
        
        old_status = self.status
        self.status = new_status
        if notes:
            self.notes = f"{self.notes}\n{notes}" if self.notes else notes
        
        self.save()
        
        return f"Assignment status changed from {old_status} to {new_status}"
    
    def save(self, *args, **kwargs):
        if self.status == self.COMPLETED and not self.completed_date:
            from django.utils import timezone
            self.completed_date = timezone.now()
        super().save(*args, **kwargs)
        
        # Update file status
        FileStatus.objects.update_or_create(
            file=self.file,
            defaults={
                'is_assigned': self.status in [self.PENDING, self.IN_PROGRESS],
                'assigned_to': self.assigned_to if self.status in [self.PENDING, self.IN_PROGRESS] else None,
                'last_assignment': self
            }
        )
    
    def __str__(self):
        return f"{self.file.name} → {self.assigned_to.username} ({self.status})"

class FileStatus(models.Model):
    """Track current assignment status of files"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.OneToOneField(File, on_delete=models.CASCADE, related_name='assignment_status')
    is_assigned = models.BooleanField(default=False)
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='currently_assigned_files')
    last_assignment = models.ForeignKey(Assignment, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'file_status'