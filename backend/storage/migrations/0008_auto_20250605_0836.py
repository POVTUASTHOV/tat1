from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('storage', '0007_alter_chunkedupload_file_alter_chunkedupload_table'),
    ]

    operations = [
        migrations.RunSQL(
            "ALTER TABLE storage_chunkedupload MODIFY COLUMN file VARCHAR(1500);",
            reverse_sql="ALTER TABLE storage_chunkedupload MODIFY COLUMN file VARCHAR(500);"
        ),
    ]