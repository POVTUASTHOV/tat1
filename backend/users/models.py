from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.translation import gettext_lazy as _
import uuid

class WorkflowRole(models.Model):
    SUPERUSER = 'superuser'
    ADMIN = 'admin'
    MANAGER = 'manager'
    EMPLOYEE = 'employee'
    
    ROLE_CHOICES = [
        (SUPERUSER, 'Superuser'),
        (ADMIN, 'System Admin'),
        (MANAGER, 'Project Manager'),
        (EMPLOYEE, 'Employee'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=50, choices=ROLE_CHOICES, unique=True)
    description = models.TextField(blank=True)
    permissions = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'workflow_roles'
        verbose_name = _('workflow role')
        verbose_name_plural = _('workflow roles')

    def __str__(self):
        return self.get_name_display()

class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(_('email address'), unique=True)
    workflow_role = models.ForeignKey(WorkflowRole, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    storage_quota = models.BigIntegerField(default=107374182400)
    storage_used = models.BigIntegerField(default=0)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='created_users')
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']
    
    def has_storage_space(self, file_size):
        return (self.storage_used + file_size) <= self.storage_quota
    
    def update_storage_used(self, file_size, subtract=False):
        if subtract:
            self.storage_used = max(0, self.storage_used - file_size)
        else:
            self.storage_used += file_size
        self.save(update_fields=['storage_used'])
    
    def is_superuser_role(self):
        return self.is_superuser or (self.workflow_role and self.workflow_role.name == WorkflowRole.SUPERUSER)
    
    def is_admin_role(self):
        return self.is_superuser_role() or (self.workflow_role and self.workflow_role.name == WorkflowRole.ADMIN)
    
    def is_manager_role(self):
        return self.is_admin_role() or (self.workflow_role and self.workflow_role.name == WorkflowRole.MANAGER)
    
    def is_employee_role(self):
        return self.workflow_role and self.workflow_role.name == WorkflowRole.EMPLOYEE
    
    def can_create_user(self, target_role):
        if self.is_superuser or (self.workflow_role and self.workflow_role.name == WorkflowRole.SUPERUSER):
            return True  # Superuser can create all roles including other superusers
        if self.is_admin_role() and target_role in [WorkflowRole.MANAGER, WorkflowRole.EMPLOYEE]:
            return True  # Admin can create managers and employees
        if self.is_manager_role() and target_role == WorkflowRole.EMPLOYEE:
            return True  # Manager can create employees
        return False
    
    def can_promote_user(self, current_role, target_role):
        """Check if this user can promote another user from current_role to target_role"""
        if self.is_superuser or (self.workflow_role and self.workflow_role.name == WorkflowRole.SUPERUSER):
            # Superuser can promote anyone to any role
            return True
        
        if self.is_admin_role():
            # Admin can only promote Employee → Manager, cannot promote to Admin or Superuser
            allowed_promotions = [
                (WorkflowRole.EMPLOYEE, WorkflowRole.MANAGER)
            ]
            return (current_role, target_role) in allowed_promotions
        
        # Manager and Employee cannot promote anyone
        return False
    
    def can_demote_user(self, current_role, target_role):
        """Check if this user can demote another user from current_role to target_role"""
        if self.is_superuser or (self.workflow_role and self.workflow_role.name == WorkflowRole.SUPERUSER):
            # Superuser can demote anyone from any role
            return True
        
        if self.is_admin_role():
            # Admin can only demote Manager → Employee
            allowed_demotions = [
                (WorkflowRole.MANAGER, WorkflowRole.EMPLOYEE)
            ]
            return (current_role, target_role) in allowed_demotions
        
        # Manager and Employee cannot demote anyone
        return False
    
    def get_promotable_roles(self, current_role):
        """Get list of roles this user can promote the target user to"""
        promotable_roles = []
        
        for role_choice in WorkflowRole.ROLE_CHOICES:
            role_name = role_choice[0]
            if role_name != current_role and self.can_promote_user(current_role, role_name):
                promotable_roles.append(role_name)
        
        return promotable_roles
    
    def get_demotable_roles(self, current_role):
        """Get list of roles this user can demote the target user to"""
        demotable_roles = []
        
        for role_choice in WorkflowRole.ROLE_CHOICES:
            role_name = role_choice[0]
            if role_name != current_role and self.can_demote_user(current_role, role_name):
                demotable_roles.append(role_name)
        
        return demotable_roles
    
    def get_accessible_projects(self):
        from storage.models import Project
        if self.is_admin_role():
            return Project.objects.all()
        return Project.objects.filter(
            models.Q(user=self) | 
            models.Q(user_assignments__user=self, user_assignments__is_active=True)
        ).distinct()

    class Meta:
        db_table = 'users'
        verbose_name = _('user')
        verbose_name_plural = _('users')

class ProjectAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='project_assignments')
    project = models.ForeignKey('storage.Project', on_delete=models.CASCADE, related_name='user_assignments')
    assigned_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='assigned_projects')
    assigned_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'project_assignments'
        unique_together = ['user', 'project']

class AccessLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='access_logs')
    action = models.CharField(max_length=255)
    resource = models.CharField(max_length=255, null=True, blank=True)
    ip_address = models.GenericIPAddressField()
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'access_logs'