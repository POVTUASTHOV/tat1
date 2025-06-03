import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from users.models import User

user = User.objects.get(email='test@example.com')
print(f"Current quota: {user.storage_quota/1024/1024/1024:.1f}GB")

user.storage_quota = 107374182400
user.save()

print(f"Updated quota: {user.storage_quota/1024/1024/1024:.1f}GB")