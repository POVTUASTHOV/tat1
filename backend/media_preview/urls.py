from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FilePreviewViewSet, ArchiveViewSet

router = DefaultRouter()
router.register(r'preview', FilePreviewViewSet, basename='file-preview')
router.register(r'archive', ArchiveViewSet, basename='archive')

urlpatterns = [
    path('', include(router.urls)),
]