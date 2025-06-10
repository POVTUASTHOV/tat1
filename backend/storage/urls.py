from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FolderViewSet, FileViewSet, ProjectViewSet, AssignmentViewSet, ProjectAssignmentViewSet

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'project-assignments', ProjectAssignmentViewSet, basename='project-assignment')
router.register(r'assignments', AssignmentViewSet, basename='assignment')
router.register(r'folders', FolderViewSet, basename='folder')
router.register(r'files', FileViewSet, basename='file')

urlpatterns = [
    path('', include(router.urls)),
]