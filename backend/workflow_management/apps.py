from django.apps import AppConfig

class WorkflowManagementConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'workflow_management'
    verbose_name = 'Workflow Management'
    
    def ready(self):
        import workflow_management.signals