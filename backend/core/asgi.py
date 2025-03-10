import os
import sys
from pathlib import Path
from django.conf import settings
from django.core.asgi import get_asgi_application
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django_asgi_app = get_asgi_application()

sys.path.append(str(Path(__file__).resolve().parent.parent))
import fastapi_app.main as fastapi_module

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Welcome to NAS Storage API"}

app.mount("/api", fastapi_module.app)

async def lifespan(app):
    yield

async def app_handler(scope, receive, send):
    if scope["type"] == "lifespan":
        await lifespan(scope, receive, send)
        return

    path = scope["path"]
    if path.startswith("/api"):
        await fastapi_module.app(scope, receive, send)
    else:
        await django_asgi_app(scope, receive, send)

if settings.DEBUG:
    app.mount("/media", StaticFiles(directory=settings.MEDIA_ROOT), name="media")