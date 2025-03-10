from django.utils.deprecation import MiddlewareMixin
from .services import PermissionService

class PermissionMiddleware(MiddlewareMixin):
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
                
                if method == 'GET' and any(path.startswith(prefix) for prefix in ['/api/files/', '/api/folders/']):
                    PermissionService.log_access(
                        user=request.user,
                        action="view_resource",
                        resource=path,
                        ip_address=request.META.get('REMOTE_ADDR')
                    )
                    
        return response