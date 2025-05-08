# admin.py
from django.contrib import admin
from .models import User, Role, Permission, RolePermission

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'role', 'is_active', 'is_superuser')
    search_fields = ('username', 'email')
    list_filter = ('role', 'is_active', 'is_superuser')

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_default', 'created_at')

@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ('codename', 'name')
    search_fields = ('codename', 'name')

@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ('role', 'permission')