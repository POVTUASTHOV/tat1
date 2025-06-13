from django.db import migrations
from django.db import connection

def alter_column_length(apps, schema_editor):
    """SQLite-compatible column alteration"""
    # SQLite doesn't support MODIFY COLUMN, but since this is just increasing length
    # and the field was already created with sufficient length in migration 0005,
    # we can skip this operation for SQLite
    if connection.vendor == 'sqlite':
        # No-op for SQLite since it already handles variable length strings efficiently
        pass
    else:
        # Original MySQL operation for other databases
        schema_editor.execute("ALTER TABLE storage_chunkedupload MODIFY COLUMN file VARCHAR(1500);")

def reverse_alter_column(apps, schema_editor):
    """Reverse operation"""
    if connection.vendor == 'sqlite':
        pass
    else:
        schema_editor.execute("ALTER TABLE storage_chunkedupload MODIFY COLUMN file VARCHAR(500);")

class Migration(migrations.Migration):
    dependencies = [
        ('storage', '0007_alter_chunkedupload_file_alter_chunkedupload_table'),
    ]

    operations = [
        migrations.RunPython(alter_column_length, reverse_alter_column),
    ]