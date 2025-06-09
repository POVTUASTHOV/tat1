from django.db import transaction
from .models import User, WorkflowRole, ProjectAssignment, AccessLog
from django.utils import timezone

class WorkflowRoleService:
    @staticmethod
    def create_role(name, description="", permissions=None):
        return WorkflowRole.objects.create(
            name=name,
            description=description,
            permissions=permissions or {}
        )
    
    @staticmethod
    def get_role(name):
        try:
            return WorkflowRole.objects.get(name=name)
        except WorkflowRole.DoesNotExist:
            return None
    
    @staticmethod
    def assign_role_to_user(user, role_name):
        role = WorkflowRole.objects.get(name=role_name)
        user.workflow_role = role
        user.save(update_fields=['workflow_role'])
        return user

class ProjectAssignmentService:
    @staticmethod
    @transaction.atomic
    def assign_user_to_project(user, project, assigned_by):
        assignment, created = ProjectAssignment.objects.update_or_create(
            user=user,
            project=project,
            defaults={
                'assigned_by': assigned_by,
                'is_active': True
            }
        )
        return assignment
    
    @staticmethod
    def remove_user_from_project(user, project):
        ProjectAssignment.objects.filter(
            user=user,
            project=project
        ).update(is_active=False)
    
    @staticmethod
    def get_user_projects(user):
        return user.get_accessible_projects()
    
    @staticmethod
    def bulk_assign_users_to_projects(user_ids, project_ids, assigned_by):
        from storage.models import Project
        
        users = User.objects.filter(id__in=user_ids)
        projects = Project.objects.filter(id__in=project_ids)
        
        assignments = []
        for user in users:
            for project in projects:
                assignment, created = ProjectAssignment.objects.update_or_create(
                    user=user,
                    project=project,
                    defaults={
                        'assigned_by': assigned_by,
                        'is_active': True
                    }
                )
                assignments.append(assignment)
        
        return assignments

class UserService:
    @staticmethod
    @transaction.atomic
    def create_user(username, email, password, workflow_role_name, created_by=None, **kwargs):
        workflow_role = WorkflowRole.objects.get(name=workflow_role_name)
        
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            workflow_role=workflow_role,
            created_by=created_by,
            **kwargs
        )
        
        return user
    
    @staticmethod
    def update_user_storage(user, file_size, subtract=False):
        user.update_storage_used(file_size, subtract)
        return user
    
    @staticmethod
    def get_manageable_users(manager):
        if manager.is_admin_role():
            return User.objects.filter(is_active=True)
        elif manager.is_manager_role():
            managed_projects = manager.get_accessible_projects()
            return User.objects.filter(
                project_assignments__project__in=managed_projects,
                project_assignments__is_active=True,
                is_active=True
            ).distinct()
        else:
            return User.objects.filter(id=manager.id)
    
    @staticmethod
    def can_user_create_role(user, target_role_name):
        return user.can_create_user(target_role_name)

class AccessLogService:
    @staticmethod
    def log_action(user, action, resource=None, ip_address=None, details=None):
        AccessLog.objects.create(
            user=user,
            action=action,
            resource=resource,
            ip_address=ip_address or "0.0.0.0",
            details=details or {}
        )
    
    @staticmethod
    def get_user_logs(user, limit=100):
        return AccessLog.objects.filter(user=user).order_by('-created_at')[:limit]
    
    @staticmethod
    def get_system_logs(limit=500):
        return AccessLog.objects.order_by('-created_at')[:limit]

class PermissionService:
    @staticmethod
    def has_project_access(user, project):
        if user.is_admin_role():
            return True
        
        if project.user == user:
            return True
        
        return ProjectAssignment.objects.filter(
            user=user,
            project=project,
            is_active=True
        ).exists()
    
    @staticmethod
    def can_manage_user(manager, target_user):
        if manager.is_admin_role():
            return True
        
        if manager.is_manager_role() and target_user.is_employee_role():
            shared_projects = ProjectAssignment.objects.filter(
                user=manager,
                project__in=target_user.get_accessible_projects(),
                is_active=True
            ).exists()
            return shared_projects
        
        return False
    
    @staticmethod
    def get_user_permissions(user):
        permissions = {
            'is_superuser': user.is_superuser,
            'is_admin': user.is_admin_role(),
            'is_manager': user.is_manager_role(),
            'is_employee': user.is_employee_role(),
            'can_access_workflow': user.workflow_role is not None,
            'can_create_admin': user.is_superuser,
            'can_create_manager': user.is_admin_role(),
            'can_create_employee': user.is_manager_role(),
            'can_manage_all_projects': user.is_admin_role(),
        }
        
        if user.workflow_role:
            permissions.update(user.workflow_role.permissions)
        
        return permissions