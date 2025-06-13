#!/usr/bin/env python3
"""Check superuser accounts in the system"""

import os
import sys
import django

# Add the backend directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

print("=== All Users ===")
for user in User.objects.all():
    print(f"Username: {user.username}")
    print(f"Email: {user.email}")
    print(f"Is superuser: {user.is_superuser}")
    print(f"Is staff: {user.is_staff}")
    print(f"Is active: {user.is_active}")
    print(f"Workflow role: {user.workflow_role}")
    print("---")

print("\n=== Superusers Only ===")
superusers = User.objects.filter(is_superuser=True)
if superusers.exists():
    for user in superusers:
        print(f"Superuser: {user.username} (email: {user.email}, active: {user.is_active})")
else:
    print("No superusers found!")

print("\n=== Users with Workflow Roles ===")
users_with_roles = User.objects.filter(workflow_role__isnull=False)
if users_with_roles.exists():
    for user in users_with_roles:
        print(f"User: {user.username} -> Role: {user.workflow_role.name}")
else:
    print("No users with workflow roles found!")