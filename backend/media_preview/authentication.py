from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken

class StreamingJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is not None:
                validated_token = self.get_validated_token(raw_token)
                return self.get_user(validated_token), validated_token

        token_param = request.GET.get('token')
        if token_param:
            try:
                validated_token = AccessToken(token_param)
                user = self.get_user(validated_token)
                return user, validated_token
            except TokenError:
                return None
        
        return None