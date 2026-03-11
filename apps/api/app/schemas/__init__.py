"""API schemas."""

from app.schemas.playlist import PlaylistCreate, PlaylistListResponse, PlaylistRead, PlaylistUpdate
from app.schemas.video import VideoListResponse, VideoRead

__all__ = [
    "PlaylistCreate",
    "PlaylistListResponse",
    "PlaylistRead",
    "PlaylistUpdate",
    "VideoListResponse",
    "VideoRead",
]
