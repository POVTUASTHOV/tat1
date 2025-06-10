#!/usr/bin/env python3
"""
Script to check user status and roles.
Run this script from the backend directory:

cd /media/tat/backup/project/data_management/backend
python check_users.py

This will show all users and their roles.
"""

import os
import django
import sys
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).resolve().parent
sys.path.append(str(backend_dir))

# Set Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

try:
    django.setup()
    
    from django.contrib.auth import get_user_model
    from users.models import WorkflowRole
    
    User = get_user_model()
    
    print("=== USER STATUS REPORT ===\n")
    
    # Show all workflow roles
    print("Available Workflow Roles:")
    roles = WorkflowRole.objects.all()
    if roles:
        for role in roles:
            user_count = role.users.count()
            print(f"  - {role.name} ({role.get_name_display()}) - {user_count} users")
    else:
        print("  No workflow roles found")
    
    print("\nAll Users:")
    users = User.objects.all().order_by('username')
    
    for user in users:
        print(f"\n  Username: {user.username}")
        print(f"  Email: {user.email}")
        print(f"  Django Superuser: {user.is_superuser}")
        print(f"  Django Staff: {user.is_staff}")
        print(f"  Active: {user.is_active}")
        print(f"  Workflow Role: {user.workflow_role.name if user.workflow_role else 'None'}")
        if user.workflow_role:
            print(f"  Role Display: {user.workflow_role.get_name_display()}")
        print(f"  Storage Used: {user.storage_used / (1024*1024*1024):.2f} GB")
        print(f"  Storage Quota: {user.storage_quota / (1024*1024*1024):.2f} GB")
        print("  " + "-"*50)
        
    # Check if any superuser exists
    superusers = User.objects.filter(is_superuser=True)
    print(f"\nTotal Django Superusers: {superusers.count()}")
    
    # Check workflow superusers
    try:
        superuser_role = WorkflowRole.objects.get(name=WorkflowRole.SUPERUSER)
        workflow_superusers = User.objects.filter(workflow_role=superuser_role)
        print(f"Total Workflow Superusers: {workflow_superusers.count()}")
    except WorkflowRole.DoesNotExist:
        print("No superuser workflow role exists")
            
except Exception as e:
    print(f"Error: {e}")
    print("\nMake sure you're running this from the backend directory and Django is properly configured.")