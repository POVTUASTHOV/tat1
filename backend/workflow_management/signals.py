from django.db.models.signals import post_save, pre_delete, post_delete
from django.dispatch import receiver
from django.utils import timezone
from users.models import User
from .models import (
    Assignment, AssignmentFile, UserProfile, WorkloadSnapshot, 
    ActivityLog, FileWorkflow
)

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Create UserProfile when User is created"""
    if created:
        UserProfile.objects.get_or_create(user=instance)

@receiver(post_save, sender=Assignment)
def update_assignment_status(sender, instance, created, **kwargs):
    """Update assignment status based on file completion"""
    if not created:
        instance.update_status_auto()

@receiver(post_save, sender=AssignmentFile)
def track_assignment_progress(sender, instance, created, **kwargs):
    """Track progress when assignment files are updated"""
    if not created and instance.status == 'completed':
        # Update processing time if not set
        if not instance.processing_time_seconds and instance.processed_at:
            if instance.assignment.started_at:
                time_diff = instance.completed_at - instance.assignment.started_at
                instance.processing_time_seconds = int(time_diff.total_seconds())
                instance.save()
        
        # Update user profile statistics
        profile = getattr(instance.assignment.user, 'workflow_profile', None)
        if profile:
            profile.total_files_processed += 1
            
            # Update average processing time
            if instance.processing_time_seconds:
                current_avg = profile.avg_processing_time
                total_files = profile.total_files_processed
                new_avg = ((current_avg * (total_files - 1)) + instance.processing_time_seconds) / total_files
                profile.avg_processing_time = int(new_avg)
            
            profile.save()

@receiver(post_save, sender=Assignment)
def create_workload_snapshot(sender, instance, created, **kwargs):
    """Create workload snapshot when assignment status changes"""
    if not created:
        user = instance.user
        
        # Calculate current metrics
        active_assignments = Assignment.objects.filter(
            user=user,
            status__in=['assigned', 'downloaded', 'in_progress']
        ).count()
        
        completed_today = AssignmentFile.objects.filter(
            assignment__user=user,
            status='completed',
            completed_at__date=timezone.now().date()
        ).count()
        
        queue_depth = AssignmentFile.objects.filter(
            assignment__user=user,
            status__in=['pending', 'assigned']
        ).count()
        
        # Calculate estimated completion time
        profile = getattr(user, 'workflow_profile', None)
        estimated_hours = 0
        if profile and profile.avg_processing_time:
            estimated_hours = (queue_depth * profile.avg_processing_time) / 3600
        
        # Determine stress level
        stress_level = 'normal'
        if profile:
            capacity_percentage = (active_assignments / profile.max_concurrent_assignments) * 100
            if capacity_percentage > 90:
                stress_level = 'high'
            elif capacity_percentage > 70:
                stress_level = 'medium'
        
        WorkloadSnapshot.objects.create(
            user=user,
            active_assignments=active_assignments,
            completed_today=completed_today,
            queue_depth=queue_depth,
            estimated_completion_hours=estimated_hours,
            stress_level=stress_level
        )

@receiver(post_save, sender=FileWorkflow)
def update_quality_score(sender, instance, created, **kwargs):
    """Update user quality score when files are reviewed"""
    if not created and instance.quality_rating:
        user = instance.assignment_file.assignment.user
        profile = getattr(user, 'workflow_profile', None)
        
        if profile:
            # Calculate new quality average
            reviewed_assignments = Assignment.objects.filter(
                user=user,
                status__in=['reviewed', 'approved'],
                quality_score__isnull=False
            )
            
            if reviewed_assignments.exists():
                avg_quality = reviewed_assignments.aggregate(
                    avg=models.Avg('quality_score')
                )['avg']
                profile.quality_average = avg_quality
                profile.save()

@receiver(post_delete, sender=Assignment)
def cleanup_assignment_files(sender, instance, **kwargs):
    """Clean up ZIP file when assignment is deleted"""
    if instance.zip_path and os.path.exists(instance.zip_path):
        try:
            os.remove(instance.zip_path)
        except OSError:
            pass

@receiver(post_save, sender=Assignment)
def log_assignment_activity(sender, instance, created, **kwargs):
    """Log assignment activities"""
    if created:
        ActivityLog.objects.create(
            user=instance.user,
            action='assignment_created',
            resource_type='assignment',
            resource_id=instance.id,
            project=instance.batch.project,
            details={
                'batch_name': instance.batch.name,
                'total_files': instance.total_files
            }
        )
    else:
        # Log status changes
        if hasattr(instance, '_state') and instance._state.adding is False:
            ActivityLog.objects.create(
                user=instance.user,
                action='assignment_status_changed',
                resource_type='assignment',
                resource_id=instance.id,
                project=instance.batch.project,
                details={
                    'new_status': instance.status,
                    'completion_percentage': instance.get_completion_percentage()
                }
            )