from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import WorkflowRole, ProjectAssignment, AccessLog

User = get_user_model()

class WorkflowRoleSerializer(serializers.ModelSerializer):
    users_count = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkflowRole
        fields = ['id', 'name', 'description', 'permissions', 'users_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_users_count(self, obj):
        return obj.users.filter(is_active=True).count()

class ProjectAssignmentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    assigned_by_name = serializers.CharField(source='assigned_by.username', read_only=True)
    
    class Meta:
        model = ProjectAssignment
        fields = ['id', 'user', 'user_name', 'project', 'project_name', 
                 'assigned_by', 'assigned_by_name', 'assigned_at', 'is_active']
        read_only_fields = ['id', 'assigned_at']

class UserSerializer(serializers.ModelSerializer):
    workflow_role_details = serializers.SerializerMethodField()
    project_assignments = ProjectAssignmentSerializer(many=True, read_only=True)
    accessible_projects_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 
                 'workflow_role', 'workflow_role_details', 'project_assignments',
                 'accessible_projects_count', 'storage_quota', 'storage_used', 
                 'is_active', 'is_superuser', 'created_by', 'created_by_name', 'date_joined', 'last_login']
        read_only_fields = ['id', 'storage_used', 'date_joined', 'last_login', 'is_superuser']
    
    def get_workflow_role_details(self, obj):
        if obj.workflow_role:
            return {
                'id': obj.workflow_role.id,
                'name': obj.workflow_role.name,
                'display_name': obj.workflow_role.get_name_display()
            }
        return None
    
    def get_accessible_projects_count(self, obj):
        return obj.get_accessible_projects().count()

class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)
    workflow_role = serializers.CharField(required=True)
    project_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True
    )

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password2', 'first_name', 
                 'last_name', 'workflow_role', 'project_ids', 'storage_quota']

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        
        workflow_role_name = attrs.pop('workflow_role')
        try:
            workflow_role = WorkflowRole.objects.get(name=workflow_role_name)
            attrs['workflow_role'] = workflow_role
        except WorkflowRole.DoesNotExist:
            raise serializers.ValidationError({"workflow_role": "Invalid workflow role."})
        
        request_user = self.context['request'].user
        if not request_user.can_create_user(workflow_role_name):
            raise serializers.ValidationError({"workflow_role": "You don't have permission to create this role."})
        
        attrs.pop('password2')
        return attrs

    def create(self, validated_data):
        project_ids = validated_data.pop('project_ids', [])
        workflow_role = validated_data.pop('workflow_role')
        
        user = User.objects.create_user(
            workflow_role=workflow_role,
            created_by=self.context['request'].user,
            **validated_data
        )
        
        if project_ids:
            from storage.models import Project
            projects = Project.objects.filter(id__in=project_ids)
            for project in projects:
                ProjectAssignment.objects.create(
                    user=user,
                    project=project,
                    assigned_by=self.context['request'].user
                )
        
        return user

class UserUpdateSerializer(serializers.ModelSerializer):
    workflow_role = serializers.CharField(required=False)
    project_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True
    )

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 
                 'workflow_role', 'project_ids', 'storage_quota', 'is_active']

    def validate_workflow_role(self, value):
        if value:
            try:
                workflow_role = WorkflowRole.objects.get(name=value)
                request_user = self.context['request'].user
                if not request_user.can_create_user(value):
                    raise serializers.ValidationError("You don't have permission to assign this role.")
                return workflow_role
            except WorkflowRole.DoesNotExist:
                raise serializers.ValidationError("Invalid workflow role.")
        return None

    def update(self, instance, validated_data):
        project_ids = validated_data.pop('project_ids', None)
        workflow_role = validated_data.pop('workflow_role', None)
        
        if workflow_role:
            instance.workflow_role = workflow_role
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        if project_ids is not None:
            instance.project_assignments.update(is_active=False)
            
            from storage.models import Project
            projects = Project.objects.filter(id__in=project_ids)
            for project in projects:
                ProjectAssignment.objects.update_or_create(
                    user=instance,
                    project=project,
                    defaults={
                        'is_active': True,
                        'assigned_by': self.context['request'].user
                    }
                )
        
        return instance

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        
        user_data = UserSerializer(self.user).data
        data['user'] = user_data
        
        data['permissions'] = {
            'is_superuser': self.user.is_superuser,
            'is_admin': self.user.is_admin_role(),
            'is_manager': self.user.is_manager_role(),
            'is_employee': self.user.is_employee_role(),
            'can_access_workflow': self.user.workflow_role is not None
        }
        
        return data

class AccessLogSerializer(serializers.ModelSerializer):
    user_details = serializers.SerializerMethodField()
    
    class Meta:
        model = AccessLog
        fields = ['id', 'user', 'user_details', 'action', 'resource', 
                 'ip_address', 'details', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_user_details(self, obj):
        return {
            'id': obj.user.id, 
            'username': obj.user.username, 
            'email': obj.user.email
        }

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, validators=[validate_password])

class AssignProjectSerializer(serializers.Serializer):
    user_id = serializers.UUIDField(required=True)
    project_ids = serializers.ListField(child=serializers.UUIDField(), required=True)
    
    def validate(self, attrs):
        request_user = self.context['request'].user
        
        try:
            target_user = User.objects.get(id=attrs['user_id'])
        except User.DoesNotExist:
            raise serializers.ValidationError({"user_id": "User not found."})
        
        if not request_user.is_admin_role() and request_user != target_user.created_by:
            raise serializers.ValidationError("You don't have permission to assign projects to this user.")
        
        attrs['target_user'] = target_user
        return attrs