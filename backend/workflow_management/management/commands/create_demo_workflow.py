from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from workflow_management.models import Role, UserRole, UserProfile
from storage.models import Project, File
from workflow_management.services import FilePairingService, RoleManagementService

User = get_user_model()

class Command(BaseCommand):
    help = 'Create demo workflow data'

    def handle(self, *args, **options):
        self.create_roles()
        self.assign_user_roles()
        self.create_user_profiles()
        self.stdout.write(self.style.SUCCESS('Demo workflow data created successfully'))

    def create_roles(self):
        roles_data = [
            {
                'name': 'admin',
                'description': 'System Administrator',
                'permissions': {
                    'manage_users': True,
                    'manage_projects': True,
                    'manage_assignments': True,
                    'view_analytics': True,
                    'create_batches': True,
                    'assign_tasks': True,
                    'review_assignments': True
                }
            },
            {
                'name': 'manager',
                'description': 'Project Manager',
                'permissions': {
                    'create_batches': True,
                    'assign_tasks': True,
                    'review_assignments': True,
                    'view_analytics': True,
                    'view_assignments': True
                }
            },
            {
                'name': 'employee',
                'description': 'Team Member',
                'permissions': {
                    'view_assignments': True,
                    'download_packages': True,
                    'update_status': True
                }
            }
        ]

        for role_data in roles_data:
            role, created = Role.objects.get_or_create(
                name=role_data['name'],
                defaults={
                    'description': role_data['description'],
                    'permissions': role_data['permissions']
                }
            )
            if created:
                self.stdout.write(f'Created role: {role.name}')

    def assign_user_roles(self):
        users = User.objects.all()
        admin_role = Role.objects.get(name='admin')
        
        for user in users:
            if user.is_superuser:
                user_role, created = UserRole.objects.get_or_create(
                    user=user,
                    role=admin_role,
                    project=None,
                    defaults={'is_active': True}
                )
                if created:
                    self.stdout.write(f'Assigned admin role to {user.username}')

    def create_user_profiles(self):
        for user in User.objects.all():
            profile, created = UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    'processing_speed': 1.0,
                    'skill_tags': [],
                    'avg_processing_time': 30,
                    'max_concurrent_assignments': 3,
                    'availability_status': 'available'
                }
            )
            if created:
                self.stdout.write(f'Created profile for {user.username}')