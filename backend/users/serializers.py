from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import Role, Permission, RolePermission, AccessLog

User = get_user_model()

class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['id', 'codename', 'name', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']

class RolePermissionSerializer(serializers.ModelSerializer):
    permission_details = serializers.SerializerMethodField()
    
    class Meta:
        model = RolePermission
        fields = ['id', 'permission', 'permission_details', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_permission_details(self, obj):
        return PermissionSerializer(obj.permission).data

class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()
    
    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'is_default', 'permissions', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_permissions(self, obj):
        role_permissions = RolePermission.objects.filter(role=obj)
        return RolePermissionSerializer(role_permissions, many=True).data

class UserSerializer(serializers.ModelSerializer):
    role_details = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'role_details', 'storage_quota', 'storage_used', 'date_joined', 'is_active']
        read_only_fields = ['id', 'storage_used', 'date_joined']
    
    def get_role_details(self, obj):
        if obj.role:
            return {'id': obj.role.id, 'name': obj.role.name}
        return None

class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)
    role = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password2', 'first_name', 'last_name', 'role']

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        
        role_id = attrs.pop('role', None)
        if role_id:
            try:
                attrs['role'] = Role.objects.get(id=role_id)
            except Role.DoesNotExist:
                raise serializers.ValidationError({"role": "Role not found."})
        else:
            try:
                attrs['role'] = Role.objects.get(is_default=True)
            except Role.DoesNotExist:
                attrs['role'] = None
                
        attrs.pop('password2')
        return attrs

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data

class AccessLogSerializer(serializers.ModelSerializer):
    user_details = serializers.SerializerMethodField()
    
    class Meta:
        model = AccessLog
        fields = ['id', 'user', 'user_details', 'action', 'resource', 'ip_address', 'details', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_user_details(self, obj):
        return {'id': obj.user.id, 'username': obj.user.username, 'email': obj.user.email}