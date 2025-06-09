from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, WorkflowRole, ProjectAssignment, AccessLog

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'workflow_role', 'is_active', 'is_staff', 'date_joined')
    list_filter = ('workflow_role', 'is_active', 'is_staff', 'date_joined')
    search_fields = ('username', 'email', 'first_name', 'last_name')
    ordering = ('-date_joined',)
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Workflow Information', {
            'fields': ('workflow_role', 'created_by', 'storage_quota', 'storage_used')
        }),
    )
    
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Workflow Information', {
            'fields': ('workflow_role', 'storage_quota')
        }),
    )

@admin.register(WorkflowRole)
class WorkflowRoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'users_count', 'created_at')
    search_fields = ('name', 'description')
    readonly_fields = ('created_at', 'updated_at')
    
    def users_count(self, obj):
        return obj.users.filter(is_active=True).count()
    users_count.short_description = 'Active Users'

@admin.register(ProjectAssignment)
class ProjectAssignmentAdmin(admin.ModelAdmin):
    list_display = ('user', 'project', 'assigned_by', 'assigned_at', 'is_active')
    list_filter = ('is_active', 'assigned_at', 'project')
    search_fields = ('user__username', 'user__email', 'project__name')
    autocomplete_fields = ('user', 'project', 'assigned_by')

@admin.register(AccessLog)
class AccessLogAdmin(admin.ModelAdmin):
    list_display = ('user', 'action', 'resource', 'ip_address', 'created_at')
    list_filter = ('action', 'created_at')
    search_fields = ('user__username', 'user__email', 'action', 'resource')
    readonly_fields = ('created_at',)
    
    def has_add_permission(self, request):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False