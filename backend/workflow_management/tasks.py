from celery import shared_task
from django.utils import timezone
from datetime import timedelta
import logging
import os
from .models import (
    Assignment, AssignmentFile, WorkloadSnapshot, 
    ActivityLog, UserProfile
)
from .services import ZipPackageService, WorkloadAnalyticsService

logger = logging.getLogger(__name__)

@shared_task
def create_assignment_package(assignment_id):
    """Background task to create assignment ZIP package"""
    try:
        assignment = Assignment.objects.get(id=assignment_id)
        
        zip_path = ZipPackageService.create_assignment_zip(assignment)
        
        logger.info(f"Assignment package created: {zip_path}")
        return f"Package created successfully: {zip_path}"
        
    except Assignment.DoesNotExist:
        logger.error(f"Assignment not found: {assignment_id}")
        return f"Assignment not found: {assignment_id}"
    except Exception as e:
        logger.error(f"Error creating assignment package: {e}")
        return f"Error: {e}"

@shared_task
def cleanup_old_packages():
    """Clean up old assignment packages"""
    try:
        # Find assignments with packages older than 30 days
        cutoff_date = timezone.now() - timedelta(days=30)
        
        old_assignments = Assignment.objects.filter(
            zip_path__isnull=False,
            created_at__lt=cutoff_date,
            status__in=['completed', 'approved', 'rejected']
        )
        
        cleaned_count = 0
        for assignment in old_assignments:
            if assignment.zip_path and os.path.exists(assignment.zip_path):
                try:
                    os.remove(assignment.zip_path)
                    assignment.zip_path = ''
                    assignment.save()
                    cleaned_count += 1
                except OSError as e:
                    logger.error(f"Error removing file {assignment.zip_path}: {e}")
        
        logger.info(f"Cleaned up {cleaned_count} old assignment packages")
        return f"Cleaned up {cleaned_count} packages"
        
    except Exception as e:
        logger.error(f"Error in cleanup task: {e}")
        return f"Error: {e}"

@shared_task
def update_workload_snapshots():
    """Create workload snapshots for all active users"""
    try:
        from users.models import User
        
        active_users = User.objects.filter(
            assignments__status__in=['assigned', 'downloaded', 'in_progress']
        ).distinct()
        
        snapshots_created = 0
        
        for user in active_users:
            # Get user profile
            profile = getattr(user, 'workflow_profile', None)
            if not profile:
                continue
            
            # Calculate metrics
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
            estimated_hours = 0
            if profile.avg_processing_time:
                estimated_hours = (queue_depth * profile.avg_processing_time) / 3600
            
            # Determine stress level
            stress_level = 'normal'
            if profile.max_concurrent_assignments > 0:
                capacity_percentage = (active_assignments / profile.max_concurrent_assignments) * 100
                if capacity_percentage > 90:
                    stress_level = 'high'
                elif capacity_percentage > 70:
                    stress_level = 'medium'
            
            # Create snapshot
            WorkloadSnapshot.objects.create(
                user=user,
                active_assignments=active_assignments,
                completed_today=completed_today,
                queue_depth=queue_depth,
                estimated_completion_hours=estimated_hours,
                stress_level=stress_level
            )
            
            snapshots_created += 1
        
        logger.info(f"Created {snapshots_created} workload snapshots")
        return f"Created {snapshots_created} snapshots"
        
    except Exception as e:
        logger.error(f"Error updating workload snapshots: {e}")
        return f"Error: {e}"

@shared_task
def check_overdue_assignments():
    """Check for overdue assignments and send notifications"""
    try:
        now = timezone.now()
        
        # Find overdue assignments
        overdue_assignments = Assignment.objects.filter(
            batch__deadline__lt=now,
            status__in=['assigned', 'downloaded', 'in_progress']
        ).select_related('batch', 'user')
        
        notifications_sent = 0
        
        for assignment in overdue_assignments:
            # Log overdue assignment
            ActivityLog.objects.create(
                user=assignment.user,
                action='assignment_overdue',
                resource_type='assignment',
                resource_id=assignment.id,
                project=assignment.batch.project,
                details={
                    'batch_name': assignment.batch.name,
                    'deadline': assignment.batch.deadline.isoformat(),
                    'days_overdue': (now - assignment.batch.deadline).days
                }
            )
            
            notifications_sent += 1
        
        logger.info(f"Processed {notifications_sent} overdue assignments")
        return f"Processed {notifications_sent} overdue assignments"
        
    except Exception as e:
        logger.error(f"Error checking overdue assignments: {e}")
        return f"Error: {e}"

@shared_task
def auto_rebalance_workload(project_id):
    """Automatically suggest workload rebalancing for a project"""
    try:
        from storage.models import Project
        
        project = Project.objects.get(id=project_id)
        
        suggestions = WorkloadAnalyticsService.suggest_workload_rebalancing(project)
        
        # Log rebalancing suggestions
        if suggestions['overloaded_users'] or suggestions['recommended_transfers']:
            ActivityLog.objects.create(
                user=None,
                action='workload_rebalancing_suggested',
                resource_type='project',
                resource_id=project.id,
                project=project,
                details={
                    'overloaded_users': len(suggestions['overloaded_users']),
                    'underloaded_users': len(suggestions['underloaded_users']),
                    'suggestions': suggestions
                }
            )
        
        logger.info(f"Workload rebalancing analysis completed for project {project.name}")
        return f"Analysis completed for project {project.name}"
        
    except Project.DoesNotExist:
        logger.error(f"Project not found: {project_id}")
        return f"Project not found: {project_id}"
    except Exception as e:
        logger.error(f"Error in workload rebalancing: {e}")
        return f"Error: {e}"

@shared_task
def update_user_performance_metrics():
    """Update performance metrics for all users"""
    try:
        users_updated = 0
        
        profiles = UserProfile.objects.all()
        
        for profile in profiles:
            user = profile.user
            
            # Calculate average quality score
            completed_assignments = Assignment.objects.filter(
                user=user,
                status__in=['reviewed', 'approved'],
                quality_score__isnull=False
            )
            
            if completed_assignments.exists():
                avg_quality = completed_assignments.aggregate(
                    avg=models.Avg('quality_score')
                )['avg']
                profile.quality_average = avg_quality
            
            # Calculate average processing time
            completed_files = AssignmentFile.objects.filter(
                assignment__user=user,
                status='completed',
                processing_time_seconds__isnull=False
            )
            
            if completed_files.exists():
                avg_time = completed_files.aggregate(
                    avg=models.Avg('processing_time_seconds')
                )['avg']
                profile.avg_processing_time = int(avg_time)
            
            # Update total files processed
            total_files = AssignmentFile.objects.filter(
                assignment__user=user,
                status='completed'
            ).count()
            profile.total_files_processed = total_files
            
            profile.save()
            users_updated += 1
        
        logger.info(f"Updated performance metrics for {users_updated} users")
        return f"Updated {users_updated} user profiles"
        
    except Exception as e:
        logger.error(f"Error updating performance metrics: {e}")
        return f"Error: {e}"

@shared_task
def generate_daily_reports():
    """Generate daily performance reports"""
    try:
        from django.db.models import Count, Avg
        
        today = timezone.now().date()
        
        # Daily assignment stats
        daily_stats = {
            'date': today.isoformat(),
            'assignments_completed': Assignment.objects.filter(
                completed_at__date=today
            ).count(),
            'files_processed': AssignmentFile.objects.filter(
                completed_at__date=today
            ).count(),
            'average_quality': Assignment.objects.filter(
                completed_at__date=today,
                quality_score__isnull=False
            ).aggregate(avg=Avg('quality_score'))['avg'] or 0,
            'active_users': User.objects.filter(
                assignments__status__in=['assigned', 'downloaded', 'in_progress']
            ).distinct().count()
        }
        
        # Log daily report
        ActivityLog.objects.create(
            user=None,
            action='daily_report_generated',
            resource_type='system',
            resource_id=None,
            details=daily_stats
        )
        
        logger.info(f"Daily report generated: {daily_stats}")
        return f"Daily report generated for {today}"
        
    except Exception as e:
        logger.error(f"Error generating daily report: {e}")
        return f"Error: {e}"

# Periodic task schedule (add to settings.py if using Celery Beat)
"""
CELERY_BEAT_SCHEDULE = {
    'cleanup-old-packages': {
        'task': 'workflow_management.tasks.cleanup_old_packages',
        'schedule': crontab(hour=2, minute=0),  # Run at 2 AM daily
    },
    'update-workload-snapshots': {
        'task': 'workflow_management.tasks.update_workload_snapshots',
        'schedule': crontab(minute='*/30'),  # Every 30 minutes
    },
    'check-overdue-assignments': {
        'task': 'workflow_management.tasks.check_overdue_assignments',
        'schedule': crontab(hour='*/2'),  # Every 2 hours
    },
    'update-performance-metrics': {
        'task': 'workflow_management.tasks.update_user_performance_metrics',
        'schedule': crontab(hour=1, minute=0),  # 1 AM daily
    },
    'generate-daily-reports': {
        'task': 'workflow_management.tasks.generate_daily_reports',
        'schedule': crontab(hour=23, minute=59),  # End of day
    },
}
"""