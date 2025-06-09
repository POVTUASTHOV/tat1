from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView, CustomTokenObtainPairView, UserProfileView, 
    ChangePasswordView, LogoutView, UserViewSet, WorkflowRoleViewSet, 
    ProjectAssignmentViewSet, AccessLogViewSet, UserStatsView,
    UserPermissionsView
)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'workflow-roles', WorkflowRoleViewSet, basename='workflow-role')
router.register(r'project-assignments', ProjectAssignmentViewSet, basename='project-assignment')
router.register(r'access-logs', AccessLogViewSet, basename='access-log')

urlpatterns = [
    # Authentication endpoints
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    
    # User management
    path('profile/', UserProfileView.as_view(), name='user_profile'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('permissions/', UserPermissionsView.as_view(), name='user_permissions'),
    path('stats/', UserStatsView.as_view(), name='user_stats'),
    
    # Router URLs
    path('', include(router.urls)),
]