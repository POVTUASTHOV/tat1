from rest_framework import permissions
from django.db.models import Q
from users.models import ProjectAssignment, WorkflowRole
from storage.models import Project

class IsManagerOrAdmin(permissions.BasePermission):
    
    def has_permission(self, request, view):
        print(f"DEBUG IsManagerOrAdmin: User: {request.user}")
        print(f"DEBUG IsManagerOrAdmin: Authenticated: {request.user.is_authenticated}")
        
        if not request.user.is_authenticated:
            print("DEBUG IsManagerOrAdmin: Not authenticated - returning False")
            return False
            
        print(f"DEBUG IsManagerOrAdmin: Is superuser: {request.user.is_superuser}")
        print(f"DEBUG IsManagerOrAdmin: Workflow role: {getattr(request.user, 'workflow_role', None)}")
        
        if request.user.is_superuser:
            print("DEBUG IsManagerOrAdmin: Is superuser - returning True")
            return True
        
        has_role = hasattr(request.user, 'workflow_role') and request.user.workflow_role and request.user.workflow_role.name in [WorkflowRole.ADMIN, WorkflowRole.MANAGER]
        print(f"DEBUG IsManagerOrAdmin: Has required role: {has_role}")
        return has_role

class IsAdminOnly(permissions.BasePermission):
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
        
        return request.user.workflow_role and request.user.workflow_role.name == WorkflowRole.ADMIN

class IsEmployeeOrAbove(permissions.BasePermission):
    
    def has_permission(self, request, view):
        print(f"DEBUG IsEmployeeOrAbove: User: {request.user}")
        print(f"DEBUG IsEmployeeOrAbove: Authenticated: {request.user.is_authenticated}")
        
        if not request.user.is_authenticated:
            print("DEBUG IsEmployeeOrAbove: Not authenticated - returning False")
            return False
            
        print(f"DEBUG IsEmployeeOrAbove: Is superuser: {request.user.is_superuser}")
        print(f"DEBUG IsEmployeeOrAbove: Workflow role: {getattr(request.user, 'workflow_role', None)}")
        
        if request.user.is_superuser:
            print("DEBUG IsEmployeeOrAbove: Is superuser - returning True")
            return True
        
        has_role = hasattr(request.user, 'workflow_role') and request.user.workflow_role is not None
        print(f"DEBUG IsEmployeeOrAbove: Has workflow role: {has_role}")
        return has_role

class CanAccessAssignment(permissions.BasePermission):
    
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
        
        if hasattr(obj, 'user') and obj.user == request.user:
            return True
        
        return request.user.workflow_role and request.user.workflow_role.name in [WorkflowRole.ADMIN, WorkflowRole.MANAGER]

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
        
        return ProjectAssignment.objects.filter(
            user=request.user,
            project=project,
            is_active=True
        ).exists() or (request.user.workflow_role and request.user.workflow_role.name in [WorkflowRole.ADMIN, WorkflowRole.MANAGER])