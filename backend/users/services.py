from django.db import transaction
from .models import User, Role, Permission, RolePermission, AccessLog
from django.utils import timezone

class PermissionService:
    @staticmethod
    def create_permission(codename, name, description=""):
        return Permission.objects.create(
            codename=codename,
            name=name,
            description=description
        )
    
    @staticmethod
    def get_permission(codename):
        try:
            return Permission.objects.get(codename=codename)
        except Permission.DoesNotExist:
            return None
    
    @staticmethod
    @transaction.atomic
    def create_role(name, description="", is_default=False, permissions=None):
        if is_default:
            Role.objects.filter(is_default=True).update(is_default=False)
            
        role = Role.objects.create(
            name=name,
            description=description,
            is_default=is_default
        )
        
        if permissions:
            for permission in permissions:
                RolePermission.objects.create(
                    role=role,
                    permission=permission
                )
                
        return role
    
    @staticmethod
    def assign_role_to_user(user, role):
        user.role = role
        user.save(update_fields=['role'])
        return user
    
    @staticmethod
    def assign_permissions_to_role(role, permissions):
        for permission in permissions:
            RolePermission.objects.get_or_create(
                role=role,
                permission=permission
            )
    
    @staticmethod
    def revoke_permission_from_role(role, permission):
        RolePermission.objects.filter(role=role, permission=permission).delete()
    
    @staticmethod
    def log_access(user, action, resource=None, ip_address=None, details=None):
        AccessLog.objects.create(
            user=user,
            action=action,
            resource=resource,
            ip_address=ip_address or "0.0.0.0",
            details=details or {}
        )

class UserService:
    @staticmethod
    def create_user(username, email, password, role=None, first_name="", last_name="", is_superuser=False, is_staff=False):
        if not role:
            try:
                role = Role.objects.get(is_default=True)
            except Role.DoesNotExist:
                role = None
                
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            role=role,
            is_superuser=is_superuser,
            is_staff=is_staff
        )
        
        return user
    
    @staticmethod
    def update_user_storage(user, file_size, subtract=False):
        user.update_storage_used(file_size, subtract)
        return user