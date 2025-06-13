from django.utils.deprecation import MiddlewareMixin

class DebugAuthMiddleware(MiddlewareMixin):
    def process_request(self, request):
        if request.path.startswith('/workflow/'):
            print(f"DEBUG: Request to {request.path}")
            print(f"DEBUG: Authorization header: {request.META.get('HTTP_AUTHORIZATION', 'NOT PRESENT')}")
            print(f"DEBUG: All headers:")
            for key, value in request.META.items():
                if key.startswith('HTTP_'):
                    print(f"  {key}: {value}")
            print(f"DEBUG: User before auth: {request.user}")
        return None
        
    def process_response(self, request, response):
        if request.path.startswith('/workflow/'):
            print(f"DEBUG: User after auth: {request.user}")
        return response