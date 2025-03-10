from rest_framework import permissions
from functools import wraps
from django.http import HttpResponseForbidden
from django.utils.translation import gettext as _

class HasPermission(permissions.BasePermission):
    def __init__(self, required_permission):
        self.required_permission = required_permission
        
    def has_permission(self, request, view):
        return request.user.has_permission(self.required_permission)

def permission_required(permission_codename):
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return HttpResponseForbidden(_("Authentication required"))
                
            if request.user.has_permission(permission_codename):
                return view_func(request, *args, **kwargs)
            else:
                return HttpResponseForbidden(_("Permission denied"))
        return wrapper
    return decorator