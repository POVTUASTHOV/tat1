from rest_framework import serializers
from .models import Folder, File, ChunkedUpload
from users.serializers import UserSerializer

class FolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Folder
        fields = ['id', 'name', 'path', 'parent', 'created_at', 'updated_at']
        read_only_fields = ['id', 'path', 'created_at', 'updated_at']
        
    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

class FileSerializer(serializers.ModelSerializer):
    class Meta:
        model = File
        fields = ['id', 'name', 'file', 'size', 'content_type', 'folder', 'uploaded_at']
        read_only_fields = ['id', 'size', 'content_type', 'uploaded_at']
        
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
        fields = ['id', 'file', 'filename', 'content_type', 'chunk_number', 'total_chunks', 'total_size', 'folder', 'created_at']
        read_only_fields = ['id', 'created_at']
        
    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

class CompleteUploadSerializer(serializers.Serializer):
    filename = serializers.CharField()
    folder = serializers.PrimaryKeyRelatedField(queryset=Folder.objects.all(), required=False, allow_null=True)