from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken
from django.contrib.auth import get_user_model
import logging

logger = logging.getLogger(__name__)
User = get_user_model()

class StreamingJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        # Try header authentication first
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is not None:
                try:
                    validated_token = self.get_validated_token(raw_token)
                    user = self.get_user(validated_token)
                    return user, validated_token
                except (InvalidToken, TokenError) as e:
                    logger.warning(f"Header token validation failed: {e}")

        # Try URL parameter authentication for video streaming
        token_param = request.GET.get('token')
        if token_param:
            try:
                validated_token = AccessToken(token_param)
                user = self.get_user(validated_token)
                logger.info(f"URL token authentication successful for user: {user.id}")
                return user, validated_token
            except (TokenError, InvalidToken) as e:
                logger.warning(f"URL token validation failed: {e}")
                return None
        
        return None

    def get_user(self, validated_token):
        """
        Attempts to find and return a user using the given validated token.
        """
        try:
            user_id = validated_token[self.get_user_id_claim()]
        except KeyError:
            raise InvalidToken('Token contained no recognizable user identification')

        try:
            user = User.objects.get(**{self.get_user_id_field(): user_id})
        except User.DoesNotExist:
            raise InvalidToken('User not found')

        if not user.is_active:
            raise InvalidToken('User is inactive')

        return user

    def get_user_id_claim(self):
        return 'user_id'

    def get_user_id_field(self):
        return 'id'