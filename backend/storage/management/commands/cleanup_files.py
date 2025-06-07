import os
import stat
import logging
from django.core.management.base import BaseCommand
from django.conf import settings
from storage.models import File as DjangoFile

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Clean up orphaned files and resolve permission issues'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without actually deleting files',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force delete files with permission issues',
        )

    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        self.force = options['force']
        
        self.stdout.write('Starting file cleanup...')
        
        self.process_cleanup_queue()
        self.find_orphaned_files()
        self.fix_file_permissions()
        self.cleanup_empty_directories()
        
        self.stdout.write('File cleanup completed.')

    def process_cleanup_queue(self):
        cleanup_files = self.find_cleanup_queues()
        
        for cleanup_file in cleanup_files:
            self.stdout.write(f'Processing cleanup queue: {cleanup_file}')
            
            try:
                with open(cleanup_file, 'r') as f:
                    file_paths = [line.strip() for line in f.readlines()]
                
                for file_path in file_paths:
                    if os.path.exists(file_path):
                        self.delete_with_permissions(file_path)
                
                if not self.dry_run:
                    os.remove(cleanup_file)
                    
            except Exception as e:
                self.stdout.write(f'Error processing cleanup queue {cleanup_file}: {e}')

    def find_cleanup_queues(self):
        cleanup_files = []
        media_root = settings.MEDIA_ROOT
        
        for root, dirs, files in os.walk(media_root):
            for file in files:
                if file == '.cleanup_queue':
                    cleanup_files.append(os.path.join(root, file))
        
        return cleanup_files

    def find_orphaned_files(self):
        media_root = settings.MEDIA_ROOT
        db_files = set()
        
        for file_obj in DjangoFile.objects.all():
            if file_obj.file:
                db_files.add(file_obj.file.path)

        for root, dirs, files in os.walk(media_root):
            for file in files:
                if file.startswith('.'):
                    continue
                    
                file_path = os.path.join(root, file)
                
                if file_path not in db_files:
                    self.stdout.write(f'Orphaned file found: {file_path}')
                    
                    if not self.dry_run:
                        self.delete_with_permissions(file_path)

    def fix_file_permissions(self):
        for file_obj in DjangoFile.objects.all():
            if file_obj.file and os.path.exists(file_obj.file.path):
                file_path = file_obj.file.path
                
                if not os.access(file_path, os.R_OK | os.W_OK):
                    self.stdout.write(f'Fixing permissions for: {file_path}')
                    
                    if not self.dry_run:
                        try:
                            os.chmod(file_path, stat.S_IREAD | stat.S_IWRITE)
                            os.chmod(os.path.dirname(file_path), stat.S_IREAD | stat.S_IWRITE | stat.S_IEXEC)
                        except OSError as e:
                            self.stdout.write(f'Failed to fix permissions: {e}')

    def delete_with_permissions(self, file_path):
        try:
            if not os.access(file_path, os.W_OK):
                os.chmod(file_path, stat.S_IWRITE | stat.S_IREAD)
            
            if not os.access(os.path.dirname(file_path), os.W_OK):
                os.chmod(os.path.dirname(file_path), stat.S_IWRITE | stat.S_IREAD | stat.S_IEXEC)
            
            os.remove(file_path)
            self.stdout.write(f'Deleted: {file_path}')
            
        except OSError as e:
            if self.force:
                try:
                    import subprocess
                    subprocess.run(['sudo', 'rm', '-f', file_path], check=True)
                    self.stdout.write(f'Force deleted: {file_path}')
                except subprocess.CalledProcessError:
                    self.stdout.write(f'Failed to force delete: {file_path}')
            else:
                self.stdout.write(f'Permission denied: {file_path} (use --force to override)')

    def cleanup_empty_directories(self):
        media_root = settings.MEDIA_ROOT
        
        for root, dirs, files in os.walk(media_root, topdown=False):
            for dir_name in dirs:
                dir_path = os.path.join(root, dir_name)
                
                try:
                    if not os.listdir(dir_path):
                        if not self.dry_run:
                            os.rmdir(dir_path)
                        self.stdout.write(f'Removed empty directory: {dir_path}')
                except OSError:
                    pass