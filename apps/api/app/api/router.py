from fastapi import APIRouter

from app.api.routes import health, playlists

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(playlists.router, prefix="/playlists", tags=["playlists"])
