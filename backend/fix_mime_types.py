import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

def fix_database_final():
   with connection.cursor() as cursor:
       cursor.execute("DROP TABLE IF EXISTS storage_chunkedupload")
       cursor.execute("""
       CREATE TABLE storage_chunkedupload (
           id char(32) NOT NULL PRIMARY KEY,
           file LONGTEXT NOT NULL,
           filename varchar(255) NOT NULL,
           content_type varchar(100) NOT NULL,
           chunk_number int NOT NULL,
           total_chunks int NOT NULL,
           total_size bigint NOT NULL,
           user_id char(32) NOT NULL,
           project_id char(32) DEFAULT NULL,
           folder_id char(32) DEFAULT NULL,
           created_at datetime(6) NOT NULL,
           UNIQUE KEY unique_chunk (user_id, filename, chunk_number, project_id),
           KEY storage_chunkedupload_user_id (user_id),
           KEY storage_chunkedupload_project_id (project_id),
           KEY storage_chunkedupload_folder_id (folder_id)
       )
       """)
       print("Table recreated successfully")

if __name__ == "__main__":
   fix_database_final()