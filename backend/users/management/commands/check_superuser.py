from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

class Command(BaseCommand):
    help = 'Check superuser accounts and workflow roles'
    
    def handle(self, *args, **options):
        self.stdout.write("=== All Users ===")
        for user in User.objects.all():
            self.stdout.write(f"Username: {user.username}")
            self.stdout.write(f"Email: {user.email}")
            self.stdout.write(f"Is superuser: {user.is_superuser}")
            self.stdout.write(f"Is staff: {user.is_staff}")
            self.stdout.write(f"Is active: {user.is_active}")
            self.stdout.write(f"Workflow role: {user.workflow_role}")
            self.stdout.write("---")

        self.stdout.write("\n=== Superusers Only ===")
        superusers = User.objects.filter(is_superuser=True)
        if superusers.exists():
            for user in superusers:
                self.stdout.write(f"Superuser: {user.username} (email: {user.email}, active: {user.is_active})")
        else:
            self.stdout.write("No superusers found!")

        self.stdout.write("\n=== Users with Workflow Roles ===")
        users_with_roles = User.objects.filter(workflow_role__isnull=False)
        if users_with_roles.exists():
            for user in users_with_roles:
                self.stdout.write(f"User: {user.username} -> Role: {user.workflow_role.name}")
        else:
            self.stdout.write("No users with workflow roles found!")