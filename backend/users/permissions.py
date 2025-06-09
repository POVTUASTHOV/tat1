from rest_framework import permissions
from django.db.models import Q
from .models import WorkflowRole

class IsSuperuserOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.is_superuser or request.user.is_admin_role()

class IsManagerOrAbove(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.is_manager_role()

class IsEmployeeOrAbove(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.workflow_role is not None

class CanCreateUser(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        if request.method in permissions.SAFE_METHODS:
            return True
            
        target_role = request.data.get('workflow_role')
        if not target_role:
            return False
            
        return request.user.can_create_user(target_role)

class ProjectAccessPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return True
    
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        if request.user.is_admin_role():
            return True
        
        from storage.models import Project
        if isinstance(obj, Project):
            project = obj
        else:
            project = getattr(obj, 'project', None)
        
        if not project:
            return False
        
        if project.user == request.user:
            return True
        
        return request.user.project_assignments.filter(
            project=project,
            is_active=True
        ).exists()

class WorkflowAccessPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        return request.user.workflow_role is not None

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        if request.user.is_admin_role():
            return True
        
        project = getattr(obj, 'project', None) or getattr(obj, 'batch', {}).get('project', None)
        
        if not project:
            return False
        
        if hasattr(obj, 'user') and obj.user == request.user:
            return True
        
        return request.user.project_assignments.filter(
            project=project,
            is_active=True
        ).exists()

def has_project_access(user, project):
    if not user.is_authenticated:
        return False
    
    if user.is_admin_role():
        return True
    
    if project.user == user:
        return True
    
    return user.project_assignments.filter(
        project=project,
        is_active=True
    ).exists()

def can_manage_user(manager, target_user):
    if not manager.is_authenticated:
        return False
    
    if manager.is_superuser:
        return True
    
    if manager.is_admin_role():
        return True
    
    if manager.is_manager_role() and target_user.is_employee_role():
        shared_projects = manager.project_assignments.filter(
            project__in=target_user.project_assignments.values_list('project', flat=True),
            is_active=True
        ).exists()
        return shared_projects
    
    return False