from rest_framework import serializers
from .models import Folder, File, ChunkedUpload, Project, Assignment, FileStatus
from users.serializers import UserSerializer

class ProjectSerializer(serializers.ModelSerializer):
    files_count = serializers.SerializerMethodField()
    folders_count = serializers.SerializerMethodField()
    total_size = serializers.SerializerMethodField()
    
    class Meta:
        model = Project
        fields = ['id', 'name', 'description', 'files_count', 'folders_count', 'total_size', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
        
    def get_files_count(self, obj):
        return obj.get_files_count()
    
    def get_folders_count(self, obj):
        return obj.get_folders_count()
    
    def get_total_size(self, obj):
        return obj.get_total_size()
        
    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

class FolderSerializer(serializers.ModelSerializer):
    files_count = serializers.SerializerMethodField()
    subfolders_count = serializers.SerializerMethodField()
    full_path = serializers.SerializerMethodField()
    
    class Meta:
        model = Folder
        fields = ['id', 'name', 'path', 'parent', 'project', 'files_count', 'subfolders_count', 'full_path', 'created_at', 'updated_at']
        read_only_fields = ['id', 'path', 'full_path', 'created_at', 'updated_at']
    
    def get_files_count(self, obj):
        return obj.get_files_count()
    
    def get_subfolders_count(self, obj):
        return obj.get_subfolders_count()
    
    def get_full_path(self, obj):
        return obj.get_full_path()
        
    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

class FileSerializer(serializers.ModelSerializer):
    file_path = serializers.SerializerMethodField()
    
    class Meta:
        model = File
        fields = ['id', 'name', 'file', 'size', 'content_type', 'folder', 'project', 'file_path', 'uploaded_at']
        read_only_fields = ['id', 'size', 'content_type', 'file_path', 'uploaded_at']
    
    def get_file_path(self, obj):
        return obj.get_file_path()
        
    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        file_obj = validated_data['file']
        validated_data['size'] = file_obj.size
        validated_data['content_type'] = file_obj.content_type
        
        user = self.context['request'].user
        if not user.has_storage_space(file_obj.size):
            raise serializers.ValidationError("Not enough storage space available.")
        
        instance = super().create(validated_data)
        user.update_storage_used(file_obj.size)
        return instance

class ChunkUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChunkedUpload
        fields = ['id', 'file', 'filename', 'content_type', 'chunk_number', 'total_chunks', 'total_size', 'project', 'folder', 'created_at']
        read_only_fields = ['id', 'created_at']
        
    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

class CompleteUploadSerializer(serializers.Serializer):
    filename = serializers.CharField()
    project = serializers.UUIDField()
    folder = serializers.UUIDField(required=False, allow_null=True)

class ProjectTreeSerializer(serializers.ModelSerializer):
    folders = serializers.SerializerMethodField()
    files = serializers.SerializerMethodField()
    
    class Meta:
        model = Project
        fields = ['id', 'name', 'description', 'folders', 'files', 'created_at']
    
    def get_folders(self, obj):
        root_folders = obj.folders.filter(parent=None)
        return FolderTreeSerializer(root_folders, many=True).data
    
    def get_files(self, obj):
        root_files = obj.files.filter(folder=None)
        return FileSerializer(root_files, many=True, context=self.context).data

class FolderTreeSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    files = serializers.SerializerMethodField()
    
    class Meta:
        model = Folder
        fields = ['id', 'name', 'path', 'children', 'files']
    
    def get_children(self, obj):
        return FolderTreeSerializer(obj.children.all(), many=True).data
    
    def get_files(self, obj):
        return FileSerializer(obj.files.all(), many=True, context=self.context).data

# Assignment and FileStatus Serializers
class AssignmentSerializer(serializers.ModelSerializer):
    file_name = serializers.CharField(source='file.name', read_only=True)
    file_path = serializers.CharField(source='file.get_file_path', read_only=True)
    assigned_to_details = UserSerializer(source='assigned_to', read_only=True)
    assigned_by_details = UserSerializer(source='assigned_by', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    
    class Meta:
        model = Assignment
        fields = [
            'id', 'file', 'file_name', 'file_path', 'assigned_to', 'assigned_to_details',
            'assigned_by', 'assigned_by_details', 'project', 'project_name', 
            'assigned_date', 'status', 'due_date', 'completed_date', 'notes'
        ]
        read_only_fields = ['id', 'assigned_date', 'completed_date', 'project']

class CreateAssignmentSerializer(serializers.ModelSerializer):
    file_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        help_text="List of file IDs to assign"
    )
    
    class Meta:
        model = Assignment
        fields = ['file_ids', 'assigned_to', 'due_date', 'notes']
    
    def validate(self, attrs):
        request = self.context['request']
        assigned_by = request.user
        file_ids = attrs['file_ids']
        assigned_to = attrs['assigned_to']
        
        # Validate that all files exist and can be assigned
        from django.core.exceptions import ValidationError as DjangoValidationError
        
        files = File.objects.filter(id__in=file_ids)
        if len(files) != len(file_ids):
            raise serializers.ValidationError("Some files were not found")
        
        # Check each file individually
        errors = []
        for file in files:
            can_assign, message = Assignment.can_assign_file(file, assigned_to, assigned_by)
            if not can_assign:
                errors.append(f"{file.name}: {message}")
        
        if errors:
            raise serializers.ValidationError({"assignment_errors": errors})
        
        attrs['files'] = files
        return attrs
    
    def create(self, validated_data):
        files = validated_data.pop('files')
        file_ids = validated_data.pop('file_ids')
        assigned_by = self.context['request'].user
        
        assignments = []
        for file in files:
            try:
                assignment = Assignment.create_assignment(
                    file=file,
                    assigned_to=validated_data['assigned_to'],
                    assigned_by=assigned_by,
                    due_date=validated_data.get('due_date'),
                    notes=validated_data.get('notes', '')
                )
                assignments.append(assignment)
            except Exception as e:
                # If any assignment fails, we should ideally rollback
                # For now, we'll continue and report which ones failed
                pass
        
        return assignments[0] if assignments else None

class FileStatusSerializer(serializers.ModelSerializer):
    file_details = FileSerializer(source='file', read_only=True)
    assigned_to_details = UserSerializer(source='assigned_to', read_only=True)
    last_assignment_details = AssignmentSerializer(source='last_assignment', read_only=True)
    
    class Meta:
        model = FileStatus
        fields = [
            'id', 'file', 'file_details', 'is_assigned', 'assigned_to', 
            'assigned_to_details', 'last_assignment', 'last_assignment_details',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

class UpdateAssignmentStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Assignment.STATUS_CHOICES)
    notes = serializers.CharField(required=False, allow_blank=True)

class ProjectAssignmentSerializer(serializers.ModelSerializer):
    assigned_managers = serializers.SerializerMethodField()
    assigned_employees = serializers.SerializerMethodField()
    assignable_files_count = serializers.SerializerMethodField()
    assigned_files_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Project
        fields = [
            'id', 'name', 'description', 'assigned_managers', 'assigned_employees',
            'assignable_files_count', 'assigned_files_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_assigned_managers(self, obj):
        managers = obj.get_assigned_managers()
        return UserSerializer(managers, many=True).data
    
    def get_assigned_employees(self, obj):
        employees = obj.get_assigned_employees()
        return UserSerializer(employees, many=True).data
    
    def get_assignable_files_count(self, obj):
        return obj.get_assignable_files().count()
    
    def get_assigned_files_count(self, obj):
        return obj.get_assigned_files().count()

class FileWithAssignmentSerializer(FileSerializer):
    assignment_status = FileStatusSerializer(read_only=True)
    current_assignment = serializers.SerializerMethodField()
    
    class Meta(FileSerializer.Meta):
        fields = FileSerializer.Meta.fields + ['assignment_status', 'current_assignment']
    
    def get_current_assignment(self, obj):
        try:
            if obj.assignment_status and obj.assignment_status.is_assigned:
                return AssignmentSerializer(obj.assignment_status.last_assignment).data
        except:
            pass
        return None