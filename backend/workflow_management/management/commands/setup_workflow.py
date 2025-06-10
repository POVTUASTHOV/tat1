import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from workflow_management.models import UserProfile
from users.models import WorkflowRole, ProjectAssignment
from workflow_management.services import RoleManagementService

User = get_user_model()

class Command(BaseCommand):
    help = 'Setup workflow management system with default roles and configurations'

    def add_arguments(self, parser):
        parser.add_argument(
            '--create-demo-users',
            action='store_true',
            help='Create demo users for testing',
        )
        parser.add_argument(
            '--admin-email',
            type=str,
            help='Admin email for notifications',
        )

    def handle(self, *args, **options):
        self.stdout.write('Setting up Workflow Management System...')
        
        # Create default roles
        self.create_default_roles()
        
        # Create user profiles for existing users
        self.create_user_profiles()
        
        # Create demo users if requested
        if options['create_demo_users']:
            self.create_demo_users()
        
        # Setup directories
        self.setup_directories()
        
        self.stdout.write(
            self.style.SUCCESS('Workflow Management System setup completed!')
        )

    def create_default_roles(self):
        self.stdout.write('Creating default roles...')
        
        roles_data = [
            {
                'name': 'superuser',
                'description': 'Superuser - Complete system access and control',
                'permissions': {
                    'manage_users': True,
                    'manage_projects': True,
                    'manage_assignments': True,
                    'view_analytics': True,
                    'system_config': True,
                    'create_batches': True,
                    'assign_tasks': True,
                    'review_assignments': True,
                    'view_team_analytics': True,
                    'manage_project_users': True,
                    'view_assignments': True,
                    'download_packages': True,
                    'upload_results': True,
                    'update_status': True,
                    'manage_roles': True,
                    'system_admin': True
                }
            },
            {
                'name': 'admin',
                'description': 'System Administrator - Full access to all features',
                'permissions': {
                    'manage_users': True,
                    'manage_projects': True,
                    'manage_assignments': True,
                    'view_analytics': True,
                    'system_config': True,
                    'create_batches': True,
                    'assign_tasks': True,
                    'review_assignments': True,
                    'view_team_analytics': True,
                    'manage_project_users': True,
                    'view_assignments': True,
                    'download_packages': True,
                    'upload_results': True,
                    'update_status': True
                }
            },
            {
                'name': 'manager',
                'description': 'Project Manager - Can manage projects and teams',
                'permissions': {
                    'create_batches': True,
                    'assign_tasks': True,
                    'review_assignments': True,
                    'view_team_analytics': True,
                    'manage_project_users': True,
                    'view_assignments': True,
                    'download_packages': True,
                    'upload_results': True,
                    'update_status': True
                }
            },
            {
                'name': 'employee',
                'description': 'Employee - Can work on assigned tasks',
                'permissions': {
                    'view_assignments': True,
                    'download_packages': True,
                    'upload_results': True,
                    'update_status': True
                }
            }
        ]
        
        for role_data in roles_data:
            role, created = WorkflowRole.objects.get_or_create(
                name=role_data['name'],
                defaults={
                    'description': role_data['description'],
                    'permissions': role_data['permissions']
                }
            )
            
            if created:
                self.stdout.write(f'  ✓ Created role: {role.name}')
            else:
                # Update permissions if role exists
                role.permissions = role_data['permissions']
                role.save()
                self.stdout.write(f'  ✓ Updated role: {role.name}')

    def create_user_profiles(self):
        self.stdout.write('Creating user profiles for existing users...')
        
        users_without_profiles = User.objects.filter(workflow_profile__isnull=True)
        
        for user in users_without_profiles:
            UserProfile.objects.create(
                user=user,
                processing_speed=1.0,
                skill_tags=[],
                avg_processing_time=30,
                max_concurrent_assignments=3,
                availability_status='available'
            )
            self.stdout.write(f'  ✓ Created profile for user: {user.username}')

    def create_demo_users(self):
        self.stdout.write('Creating demo users...')
        
        demo_users = [
            {
                'username': 'manager1',
                'email': 'manager1@example.com',
                'first_name': 'John',
                'last_name': 'Manager',
                'role': 'manager'
            },
            {
                'username': 'employee1',
                'email': 'employee1@example.com',
                'first_name': 'Alice',
                'last_name': 'Worker',
                'role': 'employee'
            },
            {
                'username': 'employee2',
                'email': 'employee2@example.com',
                'first_name': 'Bob',
                'last_name': 'Worker',
                'role': 'employee'
            }
        ]
        
        for user_data in demo_users:
            user, created = User.objects.get_or_create(
                username=user_data['username'],
                defaults={
                    'email': user_data['email'],
                    'first_name': user_data['first_name'],
                    'last_name': user_data['last_name'],
                }
            )
            
            if created:
                # Set default password
                user.set_password('demo123')
                user.save()
                
                # Create profile
                UserProfile.objects.get_or_create(
                    user=user,
                    defaults={
                        'processing_speed': 1.0 if user_data['role'] == 'employee' else 1.2,
                        'max_concurrent_assignments': 5 if user_data['role'] == 'manager' else 3,
                        'skill_tags': ['image_processing', 'data_entry'] if user_data['role'] == 'employee' else ['management'],
                        'availability_status': 'available'
                    }
                )
                
                # Assign role globally (not project-specific)
                RoleManagementService.assign_user_role(
                    user=user,
                    role_name=user_data['role'],
                    project=None
                )
                
                self.stdout.write(f'  ✓ Created demo user: {user.username} ({user_data["role"]})')
            else:
                self.stdout.write(f'  - User already exists: {user.username}')

    def setup_directories(self):
        self.stdout.write('Setting up required directories...')
        
        from django.conf import settings
        
        directories = [
            os.path.join(settings.MEDIA_ROOT, 'assignments'),
            os.path.join(settings.MEDIA_ROOT, 'temp', 'extract'),
            os.path.join(settings.MEDIA_ROOT, 'workflow_temp'),
            os.path.join(settings.BASE_DIR, 'logs', 'workflow'),
        ]
        
        for directory in directories:
            os.makedirs(directory, exist_ok=True)
            self.stdout.write(f'  ✓ Created directory: {directory}')

    def assign_admin_role_to_superuser(self):
        self.stdout.write('Assigning admin role to superusers...')
        
        superusers = User.objects.filter(is_superuser=True)
        admin_role = WorkflowRole.objects.get(name='admin')
        
        for user in superusers:
            user_role, created = ProjectAssignment.objects.get_or_create(
                user=user,
                role=admin_role,
                project=None,
                defaults={'is_active': True}
            )
            
            if created:
                self.stdout.write(f'  ✓ Assigned admin role to: {user.username}')
            else:
                user_role.is_active = True
                user_role.save()
                self.stdout.write(f'  ✓ Activated admin role for: {user.username}')