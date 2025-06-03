from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FileManagementViewSet

router = DefaultRouter()
router.register(r'files', FileManagementViewSet, basename='file-management')

urlpatterns = [
    path('', include(router.urls)),
]