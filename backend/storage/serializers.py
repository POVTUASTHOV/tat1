from rest_framework import serializers
from .models import Folder, File, ChunkedUpload, Project
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