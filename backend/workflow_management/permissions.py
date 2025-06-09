from rest_framework import permissions
from .models import UserRole, Role

class IsManagerOrAdmin(permissions.BasePermission):
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        return self.has_manager_or_admin_role(request.user)
    
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        if hasattr(obj, 'project'):
            return self.has_project_permission(request.user, obj.project)
        
        return self.has_manager_or_admin_role(request.user)
    
    def has_manager_or_admin_role(self, user):
        return UserRole.objects.filter(
            user=user,
            role__name__in=[Role.ADMIN, Role.MANAGER],
            is_active=True
        ).exists()
    
    def has_project_permission(self, user, project):
        return UserRole.objects.filter(
            user=user,
            project=project,
            role__name__in=[Role.ADMIN, Role.MANAGER],
            is_active=True
        ).exists()

class IsAdminOnly(permissions.BasePermission):
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        return UserRole.objects.filter(
            user=request.user,
            role__name=Role.ADMIN,
            is_active=True
        ).exists()

class IsEmployeeOrAbove(permissions.BasePermission):
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        return UserRole.objects.filter(
            user=request.user,
            role__name__in=[Role.ADMIN, Role.MANAGER, Role.EMPLOYEE],
            is_active=True
        ).exists()

class CanAccessAssignment(permissions.BasePermission):
    
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        if hasattr(obj, 'user') and obj.user == request.user:
            return True
        
        if hasattr(obj, 'batch') and hasattr(obj.batch, 'manager'):
            return obj.batch.manager == request.user
        
        return UserRole.objects.filter(
            user=request.user,
            role__name=Role.ADMIN,
            is_active=True
        ).exists()

class ProjectAccessPermission(permissions.BasePermission):
    
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        project = getattr(obj, 'project', obj)
        
        if project.user == request.user:
            return True
        
        return UserRole.objects.filter(
            user=request.user,
            project=project,
            is_active=True
        ).exists()