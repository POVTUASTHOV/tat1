from rest_framework import permissions
from .models import UserRole, Role

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