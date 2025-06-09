import os
import zipfile
import tempfile
import shutil
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from typing import List, Dict, Optional
import logging
from .models import (
    FilePair, AssignmentBatch, Assignment, AssignmentFile, 
    UserProfile, ActivityLog, Role, UserRole
)
from storage.models import File, Project
from users.models import User

logger = logging.getLogger(__name__)

class FilePairingService:
    """Service for automatically pairing files"""
    
    @staticmethod
    def create_pairs_for_project(project: Project, pair_type: str = 'image_json') -> List[FilePair]:
        """
        Automatically create file pairs for a project
        Based on file naming conventions
        """
        pairs = []
        
        if pair_type == 'image_json':
            pairs = FilePairingService._pair_images_with_json(project)
        
        return pairs
    
    @staticmethod
    def _pair_images_with_json(project: Project) -> List[FilePair]:
        """Pair image files with corresponding JSON files"""
        pairs = []
        
        image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff']
        
        image_files = File.objects.filter(
            project=project,
            content_type__startswith='image/'
        ).exclude(
            primary_pairs__isnull=False
        )
        
        json_files = File.objects.filter(
            project=project,
            content_type='application/json'
        ).exclude(
            secondary_pairs__isnull=False
        )
        
        # Create lookup dictionary for JSON files by base name
        json_lookup = {}
        for json_file in json_files:
            base_name = os.path.splitext(json_file.name)[0]
            json_lookup[base_name] = json_file
        
        # Match images with JSON files
        for image_file in image_files:
            base_name = os.path.splitext(image_file.name)[0]
            
            if base_name in json_lookup:
                json_file = json_lookup[base_name]
                
                pair = FilePair.objects.create(
                    primary_file=image_file,
                    secondary_file=json_file,
                    pair_type='image_json',
                    project=project,
                    status='paired'
                )
                pairs.append(pair)
                
                # Remove from lookup to avoid duplicate pairing
                del json_lookup[base_name]
            else:
                # Create single file pair
                pair = FilePair.objects.create(
                    primary_file=image_file,
                    pair_type='single_image',
                    project=project,
                    status='paired'
                )
                pairs.append(pair)
        
        return pairs

class AssignmentService:
    """Service for managing assignments and workload distribution"""
    
    @staticmethod
    def create_batch(project: Project, manager: User, name: str, 
                    file_pair_ids: List[str], **kwargs) -> AssignmentBatch:
        """Create a new assignment batch"""
        
        with transaction.atomic():
            batch = AssignmentBatch.objects.create(
                project=project,
                manager=manager,
                name=name,
                total_pairs=len(file_pair_ids),
                **kwargs
            )
            
            # Validate file pairs belong to project
            file_pairs = FilePair.objects.filter(
                id__in=file_pair_ids,
                project=project
            )
            
            if file_pairs.count() != len(file_pair_ids):
                raise ValueError("Some file pairs don't belong to this project")
            
            batch.total_pairs = file_pairs.count()
            batch.save()
            
            ActivityLog.objects.create(
                user=manager,
                action='create_batch',
                resource_type='assignment_batch',
                resource_id=batch.id,
                project=project,
                details={
                    'batch_name': name,
                    'total_pairs': batch.total_pairs
                }
            )
            
            return batch
    
    @staticmethod
    def assign_tasks(batch: AssignmentBatch, user_assignments: List[Dict]) -> List[Assignment]:
        """Assign tasks to users"""
        
        assignments = []
        
        with transaction.atomic():
            # Get available file pairs for this batch
            available_pairs = FilePair.objects.filter(
                project=batch.project,
                assignments__isnull=True
            )
            
            for user_assignment in user_assignments:
                user = User.objects.get(id=user_assignment['user_id'])
                pairs_count = user_assignment.get('pairs_count', 0)
                specific_pairs = user_assignment.get('file_pair_ids', [])
                
                if specific_pairs:
                    # Assign specific pairs
                    pairs = FilePair.objects.filter(
                        id__in=specific_pairs,
                        project=batch.project
                    )
                else:
                    # Auto-assign based on count
                    pairs = available_pairs[:pairs_count]
                
                if pairs.exists():
                    assignment = AssignmentService._create_assignment(
                        batch, user, list(pairs)
                    )
                    assignments.append(assignment)
                    
                    # Remove assigned pairs from available pool
                    available_pairs = available_pairs.exclude(
                        id__in=[p.id for p in pairs]
                    )
            
            # Update batch status
            if assignments:
                batch.status = 'active'
                batch.save()
        
        return assignments
    
    @staticmethod
    def _create_assignment(batch: AssignmentBatch, user: User, 
                          file_pairs: List[FilePair]) -> Assignment:
        """Create individual assignment"""
        
        assignment = Assignment.objects.create(
            batch=batch,
            user=user,
            total_pairs=len(file_pairs),
            total_files=sum(2 if pair.secondary_file else 1 for pair in file_pairs),
            status='assigned'
        )
        
        # Create assignment files
        for pair in file_pairs:
            AssignmentFile.objects.create(
                assignment=assignment,
                file_pair=pair,
                status='assigned'
            )
        
        ActivityLog.objects.create(
            user=batch.manager,
            action='assign_task',
            resource_type='assignment',
            resource_id=assignment.id,
            project=batch.project,
            details={
                'assigned_to': user.username,
                'total_pairs': len(file_pairs)
            }
        )
        
        return assignment
    
    @staticmethod
    def auto_balance_workload(batch: AssignmentBatch, users: List[User]) -> List[Assignment]:
        """Automatically balance workload among users"""
        
        # Get user profiles and calculate capacity
        user_capacities = []
        for user in users:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            current_load = profile.get_current_workload()
            available_capacity = max(0, profile.max_concurrent_assignments - current_load)
            
            if available_capacity > 0:
                user_capacities.append({
                    'user': user,
                    'capacity': available_capacity,
                    'speed': profile.processing_speed,
                    'quality': profile.quality_average
                })
        
        if not user_capacities:
            raise ValueError("No users have available capacity")
        
        # Sort by quality and speed
        user_capacities.sort(key=lambda x: (x['quality'], x['speed']), reverse=True)
        
        # Get available file pairs
        available_pairs = list(FilePair.objects.filter(
            project=batch.project,
            assignments__isnull=True
        ))
        
        # Distribute pairs
        assignments = []
        total_capacity = sum(uc['capacity'] for uc in user_capacities)
        
        for user_cap in user_capacities:
            user_share = user_cap['capacity'] / total_capacity
            pairs_count = int(len(available_pairs) * user_share)
            
            if pairs_count > 0:
                user_pairs = available_pairs[:pairs_count]
                assignment = AssignmentService._create_assignment(
                    batch, user_cap['user'], user_pairs
                )
                assignments.append(assignment)
                
                # Remove assigned pairs
                available_pairs = available_pairs[pairs_count:]
        
        return assignments

class ZipPackageService:
    """Service for creating and managing ZIP packages"""
    
    @staticmethod
    def create_assignment_zip(assignment: Assignment) -> str:
        """Create ZIP package for an assignment"""
        
        # Create temporary directory
        temp_dir = tempfile.mkdtemp()
        
        try:
            zip_filename = f"assignment_{assignment.id}_{assignment.user.username}.zip"
            zip_path = os.path.join(settings.MEDIA_ROOT, 'assignments', zip_filename)
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(zip_path), exist_ok=True)
            
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                # Add instruction file
                instructions = ZipPackageService._generate_instructions(assignment)
                zip_file.writestr('INSTRUCTIONS.txt', instructions)
                
                # Add assignment files
                for assignment_file in assignment.assignment_files.all():
                    pair = assignment_file.file_pair
                    
                    # Add primary file
                    if pair.primary_file and os.path.exists(pair.primary_file.file.path):
                        zip_file.write(
                            pair.primary_file.file.path,
                            f"files/{pair.primary_file.name}"
                        )
                    
                    # Add secondary file if exists
                    if pair.secondary_file and os.path.exists(pair.secondary_file.file.path):
                        zip_file.write(
                            pair.secondary_file.file.path,
                            f"files/{pair.secondary_file.name}"
                        )
                
                # Add metadata
                metadata = {
                    'assignment_id': str(assignment.id),
                    'batch_name': assignment.batch.name,
                    'total_pairs': assignment.total_pairs,
                    'created_at': assignment.created_at.isoformat(),
                    'deadline': assignment.batch.deadline.isoformat() if assignment.batch.deadline else None
                }
                
                import json
                zip_file.writestr('metadata.json', json.dumps(metadata, indent=2))
            
            # Update assignment with zip path
            assignment.zip_path = zip_path
            assignment.save()
            
            return zip_path
            
        finally:
            # Cleanup temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)
    
    @staticmethod
    def _generate_instructions(assignment: Assignment) -> str:
        """Generate instruction text for assignment"""
        
        instructions = f"""
ASSIGNMENT INSTRUCTIONS
======================

Assignment ID: {assignment.id}
Batch: {assignment.batch.name}
Assigned to: {assignment.user.username}
Total File Pairs: {assignment.total_pairs}
Created: {assignment.created_at.strftime('%Y-%m-%d %H:%M:%S')}

TASK DESCRIPTION:
{assignment.batch.description or 'No specific description provided.'}

DEADLINE:
{assignment.batch.deadline.strftime('%Y-%m-%d %H:%M:%S') if assignment.batch.deadline else 'No deadline specified'}

INSTRUCTIONS:
1. Process each file pair in the 'files' directory
2. Follow the project-specific guidelines
3. Save your results in the same naming convention
4. Upload completed files back to the system
5. Mark assignment as completed when done

SUPPORT:
Contact your manager if you have any questions.

Generated automatically by Workflow Management System
        """.strip()
        
        return instructions

class WorkloadAnalyticsService:
    """Service for workload analytics and optimization"""
    
    @staticmethod
    def generate_user_workload_report(user: User, days: int = 30) -> Dict:
        """Generate workload report for a user"""
        
        from datetime import timedelta
        
        end_date = timezone.now()
        start_date = end_date - timedelta(days=days)
        
        assignments = Assignment.objects.filter(
            user=user,
            created_at__gte=start_date
        )
        
        completed_assignments = assignments.filter(status='completed')
        
        # Calculate metrics
        total_files_processed = sum(
            assignment.assignment_files.filter(status='completed').count()
            for assignment in completed_assignments
        )
        
        avg_quality_score = completed_assignments.aggregate(
            avg_quality=models.Avg('quality_score')
        )['avg_quality'] or 0
        
        # Calculate average processing time
        completed_files = AssignmentFile.objects.filter(
            assignment__user=user,
            status='completed',
            processing_time_seconds__isnull=False,
            completed_at__gte=start_date
        )
        
        avg_processing_time = completed_files.aggregate(
            avg_time=models.Avg('processing_time_seconds')
        )['avg_time'] or 0
        
        return {
            'period_days': days,
            'total_assignments': assignments.count(),
            'completed_assignments': completed_assignments.count(),
            'total_files_processed': total_files_processed,
            'avg_quality_score': round(avg_quality_score, 2),
            'avg_processing_time_seconds': round(avg_processing_time, 2),
            'current_active_assignments': Assignment.objects.filter(
                user=user,
                status__in=['assigned', 'downloaded', 'in_progress']
            ).count()
        }
    
    @staticmethod
    def suggest_workload_rebalancing(project: Project) -> Dict:
        """Suggest workload rebalancing for a project"""
        
        active_assignments = Assignment.objects.filter(
            batch__project=project,
            status__in=['assigned', 'downloaded', 'in_progress']
        )
        
        user_workloads = {}
        
        for assignment in active_assignments:
            user = assignment.user
            if user not in user_workloads:
                profile = getattr(user, 'workflow_profile', None)
                user_workloads[user] = {
                    'assignments': [],
                    'total_files': 0,
                    'capacity': profile.max_concurrent_assignments if profile else 3,
                    'speed': profile.processing_speed if profile else 1.0
                }
            
            user_workloads[user]['assignments'].append(assignment)
            user_workloads[user]['total_files'] += assignment.total_files
        
        # Identify overloaded and underloaded users
        suggestions = {
            'overloaded_users': [],
            'underloaded_users': [],
            'recommended_transfers': []
        }
        
        for user, workload in user_workloads.items():
            load_percentage = (len(workload['assignments']) / workload['capacity']) * 100
            
            if load_percentage > 90:
                suggestions['overloaded_users'].append({
                    'user': user.username,
                    'load_percentage': load_percentage,
                    'assignments_count': len(workload['assignments'])
                })
            elif load_percentage < 50:
                suggestions['underloaded_users'].append({
                    'user': user.username,
                    'load_percentage': load_percentage,
                    'available_capacity': workload['capacity'] - len(workload['assignments'])
                })
        
        return suggestions

class RoleManagementService:
    """Service for managing user roles and permissions"""
    
    @staticmethod
    def assign_user_role(user: User, role_name: str, project: Project = None, 
                        assigned_by: User = None) -> UserRole:
        """Assign role to user"""
        
        role = Role.objects.get(name=role_name)
        
        # Check if assignment already exists
        existing = UserRole.objects.filter(
            user=user,
            role=role,
            project=project,
            is_active=True
        ).first()
        
        if existing:
            return existing
        
        user_role = UserRole.objects.create(
            user=user,
            role=role,
            project=project,
            assigned_by=assigned_by
        )
        
        ActivityLog.objects.create(
            user=assigned_by or user,
            action='assign_role',
            resource_type='user_role',
            resource_id=user_role.id,
            project=project,
            details={
                'assigned_user': user.username,
                'role': role_name,
                'project': project.name if project else None
            }
        )
        
        return user_role
    
    @staticmethod
    def get_user_permissions(user: User, project: Project = None) -> Dict:
        """Get user permissions for a project or globally"""
        
        user_roles = UserRole.objects.filter(
            user=user,
            is_active=True
        )
        
        if project:
            user_roles = user_roles.filter(
                models.Q(project=project) | models.Q(project__isnull=True)
            )
        
        permissions = set()
        roles = []
        
        for user_role in user_roles:
            roles.append(user_role.role.name)
            role_permissions = user_role.role.permissions
            if isinstance(role_permissions, dict):
                permissions.update(role_permissions.keys())
        
        return {
            'roles': roles,
            'permissions': list(permissions),
            'is_admin': Role.ADMIN in roles,
            'is_manager': Role.MANAGER in roles,
            'is_employee': Role.EMPLOYEE in roles
        }