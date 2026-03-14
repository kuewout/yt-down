from pydantic import BaseModel


class LibraryRescanResponse(BaseModel):
    playlists_scanned: int
    files_scanned: int
    relinked_videos: int
    missing_videos: int
    unchanged_videos: int
