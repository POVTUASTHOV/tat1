# backend/storage/migrations/0005_increase_chunkedupload_file_length.py
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('storage', '0004_project_chunkedupload_project_file_project_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='chunkedupload',
            name='file',
            field=models.CharField(max_length=1000),
        ),
    ]