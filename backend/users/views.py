from rest_framework import generics, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.decorators import action
from django.contrib.auth import get_user_model
from django.db.models import Q
from .serializers import (
    UserSerializer, UserCreateSerializer, UserUpdateSerializer, 
    CustomTokenObtainPairSerializer, WorkflowRoleSerializer,
    ProjectAssignmentSerializer, AccessLogSerializer,
    ChangePasswordSerializer, AssignProjectSerializer
)
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import WorkflowRole, ProjectAssignment, AccessLog
from .permissions import (
    IsSuperuserOrAdmin, IsManagerOrAbove, IsEmployeeOrAbove,
    CanCreateUser, ProjectAccessPermission
)

User = get_user_model()

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserCreateSerializer
    permission_classes = [CanCreateUser]

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_object(self):
        return self.request.user

class ChangePasswordView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ChangePasswordSerializer
    
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            return Response(
                {'error': 'Old password is incorrect'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        
        return Response({'message': 'Password updated successfully'})

class LogoutView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                from rest_framework_simplejwt.tokens import RefreshToken
                token = RefreshToken(refresh_token)
                token.blacklist()
            return Response({'message': 'Logout successful'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class UserViewSet(viewsets.ModelViewSet):
    permission_classes = [IsEmployeeOrAbove]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        return UserSerializer
    
    def get_queryset(self):
        user = self.request.user
        
        if user.is_admin_role():
            return User.objects.all()
        elif user.is_manager_role():
            managed_users = User.objects.filter(
                Q(created_by=user) | 
                Q(project_assignments__project__in=user.get_accessible_projects())
            ).distinct()
            return managed_users
        else:
            return User.objects.filter(id=user.id)
    
    def perform_create(self, serializer):
        serializer.save()
    
    @action(detail=False, methods=['get'])
    def managers(self, request):
        if not request.user.is_admin_role():
            return Response(
                {'error': 'Permission denied'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        managers = User.objects.filter(
            workflow_role__name=WorkflowRole.MANAGER,
            is_active=True
        )
        serializer = self.get_serializer(managers, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def employees(self, request):
        if not request.user.is_manager_role():
            return Response(
                {'error': 'Permission denied'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        if request.user.is_admin_role():
            employees = User.objects.filter(
                workflow_role__name=WorkflowRole.EMPLOYEE,
                is_active=True
            )
        else:
            user_projects = request.user.get_accessible_projects()
            employees = User.objects.filter(
                workflow_role__name=WorkflowRole.EMPLOYEE,
                project_assignments__project__in=user_projects,
                project_assignments__is_active=True,
                is_active=True
            ).distinct()
        
        serializer = self.get_serializer(employees, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def assign_projects(self, request, pk=None):
        user = self.get_object()
        serializer = AssignProjectSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        
        project_ids = serializer.validated_data['project_ids']
        
        # Deactivate existing assignments
        user.project_assignments.update(is_active=False)
        
        # Create new assignments
        from storage.models import Project
        projects = Project.objects.filter(id__in=project_ids)
        for project in projects:
            ProjectAssignment.objects.update_or_create(
                user=user,
                project=project,
                defaults={
                    'is_active': True,
                    'assigned_by': request.user
                }
            )
        
        return Response({'message': f'Successfully assigned {len(projects)} projects to {user.username}'})
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        if not request.user.is_admin_role():
            return Response(
                {'error': 'Permission denied'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = self.get_object()
        if user == request.user:
            return Response(
                {'error': 'Cannot deactivate yourself'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user.is_active = False
        user.save()
        
        # Deactivate project assignments
        user.project_assignments.update(is_active=False)
        
        return Response({'message': f'User {user.username} has been deactivated'})

class WorkflowRoleViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WorkflowRole.objects.all()
    serializer_class = WorkflowRoleSerializer
    permission_classes = [IsManagerOrAbove]
    
    def get_queryset(self):
        user = self.request.user
        
        if user.is_admin_role():
            return WorkflowRole.objects.all()
        elif user.is_manager_role():
            # Managers can only see employee role
            return WorkflowRole.objects.filter(name=WorkflowRole.EMPLOYEE)
        else:
            return WorkflowRole.objects.none()

class ProjectAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectAssignmentSerializer
    permission_classes = [IsManagerOrAbove]
    
    def get_queryset(self):
        user = self.request.user
        
        if user.is_admin_role():
            return ProjectAssignment.objects.all()
        else:
            user_projects = user.get_accessible_projects()
            return ProjectAssignment.objects.filter(project__in=user_projects)
    
    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)
    
    @action(detail=False, methods=['post'])
    def bulk_assign(self, request):
        """Bulk assign users to projects"""
        user_ids = request.data.get('user_ids', [])
        project_ids = request.data.get('project_ids', [])
        
        if not user_ids or not project_ids:
            return Response(
                {'error': 'user_ids and project_ids are required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from storage.models import Project
        users = User.objects.filter(id__in=user_ids)
        projects = Project.objects.filter(id__in=project_ids)
        
        assignments_created = 0
        for user in users:
            for project in projects:
                assignment, created = ProjectAssignment.objects.update_or_create(
                    user=user,
                    project=project,
                    defaults={
                        'is_active': True,
                        'assigned_by': request.user
                    }
                )
                if created:
                    assignments_created += 1
        
        return Response({
            'message': f'Created {assignments_created} project assignments',
            'users_assigned': len(users),
            'projects_assigned': len(projects)
        })

class AccessLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AccessLogSerializer
    permission_classes = [IsEmployeeOrAbove]
    
    def get_queryset(self):
        user = self.request.user
        
        if user.is_admin_role():
            return AccessLog.objects.all()
        else:
            return AccessLog.objects.filter(user=user)

class UserStatsView(generics.GenericAPIView):
    permission_classes = [IsManagerOrAbove]
    
    def get(self, request):
        user = request.user
        
        if user.is_admin_role():
            total_users = User.objects.filter(is_active=True).count()
            admins = User.objects.filter(
                workflow_role__name=WorkflowRole.ADMIN, 
                is_active=True
            ).count()
            managers = User.objects.filter(
                workflow_role__name=WorkflowRole.MANAGER, 
                is_active=True
            ).count()
            employees = User.objects.filter(
                workflow_role__name=WorkflowRole.EMPLOYEE, 
                is_active=True
            ).count()
        else:
            user_projects = user.get_accessible_projects()
            project_users = User.objects.filter(
                project_assignments__project__in=user_projects,
                project_assignments__is_active=True,
                is_active=True
            ).distinct()
            
            total_users = project_users.count()
            admins = 0
            managers = project_users.filter(workflow_role__name=WorkflowRole.MANAGER).count()
            employees = project_users.filter(workflow_role__name=WorkflowRole.EMPLOYEE).count()
        
        return Response({
            'total_users': total_users,
            'role_breakdown': {
                'admins': admins,
                'managers': managers,
                'employees': employees
            },
            'active_projects': user.get_accessible_projects().count() if user.is_manager_role() else 0
        })

class UserPermissionsView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        user = request.user
        
        permissions = {
            'user_id': str(user.id),
            'username': user.username,
            'email': user.email,
            'workflow_role': user.workflow_role.name if user.workflow_role else None,
            'role_display': user.workflow_role.get_name_display() if user.workflow_role else None,
            'is_superuser': user.is_superuser,
            'is_admin': user.is_admin_role(),
            'is_manager': user.is_manager_role(),
            'is_employee': user.is_employee_role(),
            'can_access_workflow': user.workflow_role is not None,
            'can_create_admin': user.is_superuser,
            'can_create_manager': user.is_admin_role(),
            'can_create_employee': user.is_manager_role(),
            'can_manage_all_projects': user.is_admin_role(),
            'accessible_projects_count': user.get_accessible_projects().count(),
            'permissions': user.workflow_role.permissions if user.workflow_role else {}
        }
        
        if user.workflow_role:
            permissions['accessible_projects'] = [
                {
                    'id': str(project.id),
                    'name': project.name
                }
                for project in user.get_accessible_projects()[:10]  # Limit to 10 for performance
            ]
        
        return Response(permissions)