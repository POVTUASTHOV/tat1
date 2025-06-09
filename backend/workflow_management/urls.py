from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RoleViewSet, UserRoleViewSet, FilePairViewSet, AssignmentBatchViewSet,
    AssignmentViewSet, UserProfileViewSet, WorkflowAnalyticsViewSet,
    FileWorkflowViewSet, ActivityLogViewSet
)

router = DefaultRouter()
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'user-roles', UserRoleViewSet, basename='user-role')
router.register(r'file-pairs', FilePairViewSet, basename='file-pair')
router.register(r'batches', AssignmentBatchViewSet, basename='assignment-batch')
router.register(r'assignments', AssignmentViewSet, basename='assignment')
router.register(r'user-profiles', UserProfileViewSet, basename='user-profile')
router.register(r'file-workflows', FileWorkflowViewSet, basename='file-workflow')
router.register(r'activity-logs', ActivityLogViewSet, basename='activity-log')
router.register(r'analytics', WorkflowAnalyticsViewSet, basename='workflow-analytics')

urlpatterns = [
    path('', include(router.urls)),
]