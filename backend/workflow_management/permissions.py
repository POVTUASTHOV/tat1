from rest_framework import permissions
from django.db.models import Q
from .models import UserRole, Role
from storage.models import Project

class IsManagerOrAdmin(permissions.BasePermission):
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
        
        return UserRole.objects.filter(
            user=request.user,
            role__name__in=[Role.ADMIN, Role.MANAGER],
            is_active=True
        ).exists()

class IsAdminOnly(permissions.BasePermission):
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
        
        return UserRole.objects.filter(
            user=request.user,
            role__name=Role.ADMIN,
            is_active=True
        ).exists()

class IsEmployeeOrAbove(permissions.BasePermission):
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
        
        return UserRole.objects.filter(
            user=request.user,
            is_active=True
        ).exists()

class CanAccessAssignment(permissions.BasePermission):
    
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
        
        if hasattr(obj, 'user') and obj.user == request.user:
            return True
        
        return UserRole.objects.filter(
            user=request.user,
            role__name__in=[Role.ADMIN, Role.MANAGER],
            is_active=True
        ).exists()

class ProjectAccessPermission(permissions.BasePermission):
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
        
        return True
    
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
        
        if isinstance(obj, Project):
            project = obj
        else:
            project = getattr(obj, 'project', None)
        
        if not project:
            return False
        
        if project.user == request.user:
            return True
        
        return UserRole.objects.filter(
            user=request.user,
            project=project,
            is_active=True
        ).exists() or UserRole.objects.filter(
            user=request.user,
            role__name__in=[Role.ADMIN, Role.MANAGER],
            is_active=True
        ).exists()