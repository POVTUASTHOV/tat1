from django.db import models
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
import uuid
import json
from users.models import User
from storage.models import Project, File

class FilePair(models.Model):
    PENDING = 'pending'
    PAIRED = 'paired'
    ERROR = 'error'
    
    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (PAIRED, 'Paired'),
        (ERROR, 'Error'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    primary_file = models.ForeignKey(File, on_delete=models.CASCADE, related_name='primary_pairs')
    secondary_file = models.ForeignKey(File, on_delete=models.CASCADE, related_name='secondary_pairs', null=True, blank=True)
    pair_type = models.CharField(max_length=50, default='image_json')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='file_pairs')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Pair: {self.primary_file.name} + {self.secondary_file.name if self.secondary_file else 'None'}"

class AssignmentBatch(models.Model):
    DRAFT = 'draft'
    ACTIVE = 'active'
    COMPLETED = 'completed'
    CANCELLED = 'cancelled'
    
    STATUS_CHOICES = [
        (DRAFT, 'Draft'),
        (ACTIVE, 'Active'),
        (COMPLETED, 'Completed'),
        (CANCELLED, 'Cancelled'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='assignment_batches')
    manager = models.ForeignKey(User, on_delete=models.CASCADE, related_name='managed_batches')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    total_pairs = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=DRAFT)
    deadline = models.DateTimeField(null=True, blank=True)
    priority = models.IntegerField(default=1, validators=[MinValueValidator(1), MaxValueValidator(5)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def get_completion_percentage(self):
        total_assignments = self.assignments.count()
        if total_assignments == 0:
            return 0
        completed_assignments = self.assignments.filter(status='completed').count()
        return (completed_assignments / total_assignments) * 100
    
    def get_total_files(self):
        return sum(assignment.total_files for assignment in self.assignments.all())
    
    def __str__(self):
        return f"{self.name} - {self.project.name}"

class Assignment(models.Model):
    PENDING = 'pending'
    ASSIGNED = 'assigned'
    DOWNLOADED = 'downloaded'
    IN_PROGRESS = 'in_progress'
    COMPLETED = 'completed'
    REVIEWED = 'reviewed'
    APPROVED = 'approved'
    REJECTED = 'rejected'
    
    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (ASSIGNED, 'Assigned'),
        (DOWNLOADED, 'Downloaded'),
        (IN_PROGRESS, 'In Progress'),
        (COMPLETED, 'Completed'),
        (REVIEWED, 'Reviewed'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(AssignmentBatch, on_delete=models.CASCADE, related_name='assignments')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='assignments')
    total_pairs = models.PositiveIntegerField(default=0)
    total_files = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    zip_path = models.CharField(max_length=500, blank=True)
    downloaded_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewer = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_assignments')
    notes = models.TextField(blank=True)
    quality_score = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(10)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def get_completion_percentage(self):
        total_files = self.assignment_files.count()
        if total_files == 0:
            return 0
        completed_files = self.assignment_files.filter(status='completed').count()
        return (completed_files / total_files) * 100
    
    def get_estimated_completion_time(self):
        if self.status in ['completed', 'reviewed', 'approved']:
            return 0
        
        user_profile = getattr(self.user, 'profile', None)
        if not user_profile:
            return None
        
        remaining_files = self.assignment_files.filter(status__in=['pending', 'assigned']).count()
        avg_processing_time = user_profile.avg_processing_time or 30
        
        return remaining_files * avg_processing_time
    
    def update_status_auto(self):
        if self.assignment_files.exists():
            completed_count = self.assignment_files.filter(status='completed').count()
            total_count = self.assignment_files.count()
            
            if completed_count == total_count and self.status == 'in_progress':
                self.status = 'completed'
                self.completed_at = timezone.now()
                self.save()
    
    def __str__(self):
        return f"{self.batch.name} - {self.user.username}"

class AssignmentFile(models.Model):
    PENDING = 'pending'
    ASSIGNED = 'assigned'
    DOWNLOADED = 'downloaded'
    PROCESSED = 'processed'
    COMPLETED = 'completed'
    ERROR = 'error'
    
    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (ASSIGNED, 'Assigned'),
        (DOWNLOADED, 'Downloaded'),
        (PROCESSED, 'Processed'),
        (COMPLETED, 'Completed'),
        (ERROR, 'Error'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name='assignment_files')
    file_pair = models.ForeignKey(FilePair, on_delete=models.CASCADE, related_name='assignments')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    downloaded_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    processing_time_seconds = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    error_message = models.TextField(blank=True)
    
    def __str__(self):
        return f"{self.assignment} - {self.file_pair}"

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='workflow_profile')
    processing_speed = models.FloatField(default=1.0)
    skill_tags = models.JSONField(default=list)
    avg_processing_time = models.PositiveIntegerField(default=30)
    working_hours_start = models.TimeField(default='09:00')
    working_hours_end = models.TimeField(default='17:00')
    timezone = models.CharField(max_length=50, default='UTC')
    availability_status = models.CharField(max_length=20, default='available')
    max_concurrent_assignments = models.PositiveIntegerField(default=3)
    quality_average = models.FloatField(default=0.0)
    total_files_processed = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def get_current_workload(self):
        active_assignments = self.user.assignments.filter(
            status__in=['assigned', 'downloaded', 'in_progress']
        ).count()
        return active_assignments
    
    def get_capacity_percentage(self):
        current_load = self.get_current_workload()
        return (current_load / self.max_concurrent_assignments) * 100 if self.max_concurrent_assignments > 0 else 100
    
    def is_available_for_assignment(self):
        return (
            self.availability_status == 'available' and 
            self.get_current_workload() < self.max_concurrent_assignments
        )

class FileWorkflow(models.Model):
    PENDING = 'pending'
    IN_REVIEW = 'in_review'
    APPROVED = 'approved'
    REJECTED = 'rejected'
    REWORK_NEEDED = 'rework_needed'
    
    STATUS_CHOICES = [
        (PENDING, 'Pending Review'),
        (IN_REVIEW, 'In Review'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
        (REWORK_NEEDED, 'Rework Needed'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment_file = models.OneToOneField(AssignmentFile, on_delete=models.CASCADE, related_name='workflow')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    reviewer = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_files')
    comments = models.TextField(blank=True)
    quality_rating = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)])
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ActivityLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='workflow_activity_logs')
    action = models.CharField(max_length=100)
    resource_type = models.CharField(max_length=50)
    resource_id = models.UUIDField()
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True)
    details = models.JSONField(default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', '-timestamp']),
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['project', '-timestamp']),
        ]

class WorkloadSnapshot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='workload_snapshots')
    timestamp = models.DateTimeField(auto_now_add=True)
    active_assignments = models.PositiveIntegerField(default=0)
    completed_today = models.PositiveIntegerField(default=0)
    queue_depth = models.PositiveIntegerField(default=0)
    estimated_completion_hours = models.FloatField(default=0.0)
    stress_level = models.CharField(max_length=20, default='normal')
    
    class Meta:
        ordering = ['-timestamp']