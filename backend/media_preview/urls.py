from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FilePreviewViewSet, VideoStreamingViewSet, ArchiveViewSet

router = DefaultRouter()
router.register(r'preview', FilePreviewViewSet, basename='file-preview')
router.register(r'video', VideoStreamingViewSet, basename='video-streaming')
router.register(r'archive', ArchiveViewSet, basename='archive')

urlpatterns = [
    path('', include(router.urls)),
]