from rest_framework import serializers
from django.utils import timezone
from .models import (
    FilePair, AssignmentBatch, Assignment, 
    AssignmentFile, UserProfile, FileWorkflow, ActivityLog, WorkloadSnapshot
)
from users.models import WorkflowRole, ProjectAssignment
from users.serializers import UserSerializer
from storage.serializers import FileSerializer, ProjectSerializer

class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowRole
        fields = ['id', 'name', 'description', 'permissions', 'created_at']
        read_only_fields = ['id', 'created_at']

class UserRoleSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    assigned_by_name = serializers.CharField(source='assigned_by.username', read_only=True)
    
    class Meta:
        model = ProjectAssignment
        fields = ['id', 'user', 'project', 'project_name', 
                 'assigned_by', 'assigned_by_name', 'assigned_at', 'is_active']
        read_only_fields = ['id', 'assigned_at']

class FilePairSerializer(serializers.ModelSerializer):
    primary_file_data = FileSerializer(source='primary_file', read_only=True)
    secondary_file_data = FileSerializer(source='secondary_file', read_only=True)
    
    class Meta:
        model = FilePair
        fields = ['id', 'primary_file', 'secondary_file', 'primary_file_data', 
                 'secondary_file_data', 'pair_type', 'project', 'status', 
                 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']

class AssignmentBatchSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source='manager.username', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    completion_percentage = serializers.SerializerMethodField()
    total_files = serializers.SerializerMethodField()
    assignments_count = serializers.SerializerMethodField()
    
    class Meta:
        model = AssignmentBatch
        fields = ['id', 'project', 'project_name', 'manager', 'manager_name', 
                 'name', 'description', 'total_pairs', 'status', 'deadline', 
                 'priority', 'completion_percentage', 'total_files', 
                 'assignments_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_completion_percentage(self, obj):
        return obj.get_completion_percentage()
    
    def get_total_files(self, obj):
        return obj.get_total_files()
    
    def get_assignments_count(self, obj):
        return obj.assignments.count()

class AssignmentFileSerializer(serializers.ModelSerializer):
    file_pair_data = FilePairSerializer(source='file_pair', read_only=True)
    
    class Meta:
        model = AssignmentFile
        fields = ['id', 'assignment', 'file_pair', 'file_pair_data', 'status', 
                 'downloaded_at', 'processed_at', 'completed_at', 
                 'processing_time_seconds', 'notes', 'error_message']
        read_only_fields = ['id']

class AssignmentSerializer(serializers.ModelSerializer):
    batch_name = serializers.CharField(source='batch.name', read_only=True)
    user_name = serializers.CharField(source='user.username', read_only=True)
    reviewer_name = serializers.CharField(source='reviewer.username', read_only=True)
    completion_percentage = serializers.SerializerMethodField()
    estimated_completion_time = serializers.SerializerMethodField()
    assignment_files = AssignmentFileSerializer(many=True, read_only=True)
    
    class Meta:
        model = Assignment
        fields = ['id', 'batch', 'batch_name', 'user', 'user_name', 'total_pairs', 
                 'total_files', 'status', 'zip_path', 'downloaded_at', 'started_at', 
                 'completed_at', 'reviewed_at', 'reviewer', 'reviewer_name', 
                 'notes', 'quality_score', 'completion_percentage', 
                 'estimated_completion_time', 'assignment_files', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_completion_percentage(self, obj):
        return obj.get_completion_percentage()
    
    def get_estimated_completion_time(self, obj):
        return obj.get_estimated_completion_time()

class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    current_workload = serializers.SerializerMethodField()
    capacity_percentage = serializers.SerializerMethodField()
    is_available = serializers.SerializerMethodField()
    
    class Meta:
        model = UserProfile
        fields = ['user', 'username', 'processing_speed', 'skill_tags', 
                 'avg_processing_time', 'working_hours_start', 'working_hours_end', 
                 'timezone', 'availability_status', 'max_concurrent_assignments', 
                 'quality_average', 'total_files_processed', 'current_workload', 
                 'capacity_percentage', 'is_available', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']
    
    def get_current_workload(self, obj):
        return obj.get_current_workload()
    
    def get_capacity_percentage(self, obj):
        return obj.get_capacity_percentage()
    
    def get_is_available(self, obj):
        return obj.is_available_for_assignment()

class FileWorkflowSerializer(serializers.ModelSerializer):
    assignment_file_data = AssignmentFileSerializer(source='assignment_file', read_only=True)
    reviewer_name = serializers.CharField(source='reviewer.username', read_only=True)
    
    class Meta:
        model = FileWorkflow
        fields = ['id', 'assignment_file', 'assignment_file_data', 'status', 
                 'reviewer', 'reviewer_name', 'comments', 'quality_rating', 
                 'reviewed_at', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

class ActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    
    class Meta:
        model = ActivityLog
        fields = ['id', 'user', 'user_name', 'action', 'resource_type', 
                 'resource_id', 'project', 'project_name', 'details', 
                 'ip_address', 'user_agent', 'timestamp']
        read_only_fields = ['id', 'timestamp']

class WorkloadSnapshotSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = WorkloadSnapshot
        fields = ['id', 'user', 'user_name', 'timestamp', 'active_assignments', 
                 'completed_today', 'queue_depth', 'estimated_completion_hours', 
                 'stress_level']
        read_only_fields = ['id', 'timestamp']

class CreateAssignmentBatchSerializer(serializers.Serializer):
    project_id = serializers.UUIDField()
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    deadline = serializers.DateTimeField(required=False)
    priority = serializers.IntegerField(min_value=1, max_value=5, default=1)
    file_pair_ids = serializers.ListField(child=serializers.UUIDField())
    
    def validate_deadline(self, value):
        if value and value < timezone.now():
            raise serializers.ValidationError("Deadline cannot be in the past")
        return value

class AssignTasksSerializer(serializers.Serializer):
    batch_id = serializers.UUIDField()
    assignments = serializers.ListField(
        child=serializers.DictField(child=serializers.CharField())
    )
    
    def validate_assignments(self, value):
        for assignment in value:
            if 'user_id' not in assignment or 'file_pair_ids' not in assignment:
                raise serializers.ValidationError(
                    "Each assignment must have user_id and file_pair_ids"
                )
        return value

class UpdateAssignmentStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Assignment.STATUS_CHOICES)
    notes = serializers.CharField(required=False, allow_blank=True)
    quality_score = serializers.FloatField(min_value=0, max_value=10, required=False)

class ReviewAssignmentSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['approved', 'rejected', 'rework_needed'])
    comments = serializers.CharField(required=False, allow_blank=True)
    quality_rating = serializers.IntegerField(min_value=1, max_value=5, required=False)

class BulkAssignSerializer(serializers.Serializer):
    batch_id = serializers.UUIDField()
    user_assignments = serializers.ListField(
        child=serializers.DictField()
    )
    auto_balance = serializers.BooleanField(default=True)
    
    def validate_user_assignments(self, value):
        for assignment in value:
            required_fields = ['user_id', 'pairs_count']
            for field in required_fields:
                if field not in assignment:
                    raise serializers.ValidationError(f"Each assignment must have {field}")
        return value