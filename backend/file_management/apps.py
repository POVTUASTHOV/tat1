# file_management/apps.py
from django.apps import AppConfig


class FileManagementConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'file_management'
    verbose_name = 'File Management'