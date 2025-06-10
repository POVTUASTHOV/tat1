from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from .models import AccessLog
import json

class WorkflowPermissionMiddleware(MiddlewareMixin):
    def process_request(self, request):
        if hasattr(request, 'user') and request.user.is_authenticated:
            request.user.last_login_ip = self.get_client_ip(request)
            request.user.save(update_fields=['last_login_ip'])
            
    def process_response(self, request, response):
        return response
        
    def get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip

class AccessLogMiddleware(MiddlewareMixin):
    def process_response(self, request, response):
        if hasattr(request, 'user') and request.user.is_authenticated:
            if 200 <= response.status_code < 300:
                path = request.path
                method = request.method
                
                # Log important actions
                if self.should_log_action(path, method):
                    self.log_access(
                        user=request.user,
                        action=self.get_action_name(path, method),
                        resource=path,
                        ip_address=self.get_client_ip(request),
                        details=self.get_action_details(request, response)
                    )
                    
        return response
    
    def should_log_action(self, path, method):
        # Log important workflow actions
        log_patterns = [
            '/users/users/',
            '/workflow/',
            '/storage/projects/',
            '/file-management/',
        ]
        
        return any(pattern in path for pattern in log_patterns) and method in ['POST', 'PUT', 'PATCH', 'DELETE']
    
    def get_action_name(self, path, method):
        if '/users/users/' in path:
            return f'user_{method.lower()}'
        elif '/workflow/' in path:
            return f'workflow_{method.lower()}'
        elif '/storage/projects/' in path:
            return f'project_{method.lower()}'
        elif '/file-management/' in path:
            return f'file_{method.lower()}'
        return f'{method.lower()}_action'
    
    def get_action_details(self, request, response):
        details = {
            'method': request.method,
            'path': request.path,
            'status_code': response.status_code
        }
        
        if hasattr(request, 'data') and request.data:
            # Don't log sensitive data
            safe_data = {k: v for k, v in request.data.items() if k not in ['password', 'password2']}
            details['request_data'] = safe_data
        
        return details
    
    def get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
    
    def log_access(self, user, action, resource, ip_address, details):
        try:
            AccessLog.objects.create(
                user=user,
                action=action,
                resource=resource,
                ip_address=ip_address or "0.0.0.0",
                details=details or {}
            )
        except Exception as e:
            # Don't break the request if logging fails
            print(f"Failed to log access: {e}")

class WorkflowAccessMiddleware(MiddlewareMixin):
    """Middleware to check workflow access permissions"""
    
    def process_request(self, request):
        # Skip for non-workflow endpoints
        if not self.is_workflow_endpoint(request.path):
            return None
        
        if not hasattr(request, 'user') or not request.user.is_authenticated:
            return JsonResponse({'error': 'Authentication required'}, status=401)
        
        if not request.user.workflow_role and not request.user.is_superuser:
            return JsonResponse({
                'error': 'Workflow access denied',
                'message': 'You need a workflow role to access this feature'
            }, status=403)
        
        return None
    
    def is_workflow_endpoint(self, path):
        workflow_patterns = [
            '/workflow/',
            '/users/workflow-roles/',
            '/users/project-assignments/',
        ]
        return any(pattern in path for pattern in workflow_patterns)