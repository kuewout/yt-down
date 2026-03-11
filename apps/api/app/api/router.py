from fastapi import APIRouter

from app.api.routes import health, library, playlists, videos

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(library.router, prefix="/library", tags=["library"])
api_router.include_router(playlists.router, prefix="/playlists", tags=["playlists"])
api_router.include_router(videos.router, prefix="/videos", tags=["videos"])
