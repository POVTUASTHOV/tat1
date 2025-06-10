#!/usr/bin/env python3
"""
Script to make a user a superuser.
Run this script from the backend directory:

cd /media/tat/backup/project/data_management/backend
python make_superuser.py

This will make the user 'TAT' a Django superuser.
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
    
    # Find user TAT
    try:
        user = User.objects.get(username='TAT')
        print(f"Found user: {user.username} ({user.email})")
        
        # Make user a Django superuser
        user.is_superuser = True
        user.is_staff = True
        user.save()
        print("✓ User is now a Django superuser")
        
        # Also try to assign superuser workflow role if it exists
        try:
            superuser_role = WorkflowRole.objects.get(name=WorkflowRole.SUPERUSER)
            user.workflow_role = superuser_role
            user.save()
            print("✓ User assigned to superuser workflow role")
        except WorkflowRole.DoesNotExist:
            print("! Superuser workflow role doesn't exist, creating it...")
            superuser_role = WorkflowRole.objects.create(
                name=WorkflowRole.SUPERUSER,
                description='Superuser with full system access',
                permissions={}
            )
            user.workflow_role = superuser_role
            user.save()
            print("✓ Created superuser workflow role and assigned to user")
        
        print(f"\nUser {user.username} is now a superuser!")
        print(f"- Django superuser: {user.is_superuser}")
        print(f"- Django staff: {user.is_staff}")
        print(f"- Workflow role: {user.workflow_role.name if user.workflow_role else 'None'}")
        
    except User.DoesNotExist:
        print("User 'TAT' not found!")
        print("Available users:")
        for user in User.objects.all():
            print(f"  - {user.username} ({user.email}) - Superuser: {user.is_superuser}")
            
except Exception as e:
    print(f"Error: {e}")
    print("\nMake sure you're running this from the backend directory and Django is properly configured.")