from django.contrib import admin
from .models import Project, Folder, File, ChunkedUpload

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'get_files_count', 'get_folders_count', 'created_at')
    list_filter = ('created_at', 'updated_at')
    search_fields = ('name', 'description', 'user__username', 'user__email')
    autocomplete_fields = ('user',)
    readonly_fields = ('created_at', 'updated_at')
    
    def get_files_count(self, obj):
        return obj.get_files_count()
    get_files_count.short_description = 'Files Count'
    
    def get_folders_count(self, obj):
        return obj.get_folders_count()
    get_folders_count.short_description = 'Folders Count'

@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin):
    list_display = ('name', 'path', 'project', 'user', 'parent', 'created_at')
    list_filter = ('created_at', 'project')
    search_fields = ('name', 'path', 'user__username', 'project__name')
    autocomplete_fields = ('user', 'project', 'parent')
    readonly_fields = ('path', 'created_at', 'updated_at')

@admin.register(File)
class FileAdmin(admin.ModelAdmin):
    list_display = ('name', 'size', 'content_type', 'project', 'folder', 'user', 'uploaded_at')
    list_filter = ('content_type', 'uploaded_at', 'project')
    search_fields = ('name', 'user__username', 'project__name')
    autocomplete_fields = ('user', 'project', 'folder')
    readonly_fields = ('uploaded_at', 'size')

@admin.register(ChunkedUpload)
class ChunkedUploadAdmin(admin.ModelAdmin):
    list_display = ('filename', 'user', 'chunk_number', 'total_chunks', 'total_size', 'created_at')
    list_filter = ('created_at', 'project')
    search_fields = ('filename', 'user__username')
    autocomplete_fields = ('user', 'project', 'folder')
    readonly_fields = ('created_at',)
