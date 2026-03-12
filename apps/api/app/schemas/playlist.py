from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PlaylistBase(BaseModel):
    source_url: str = Field(min_length=1)
    title: str = ""
    folder_name: str = ""
    folder_path: str = ""
    cookies_browser: str | None = None
    resolution_limit: int | None = Field(default=None, ge=1)
    active: bool = True


class PlaylistCreate(PlaylistBase):
    playlist_id: str | None = None


class PlaylistUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    folder_name: str | None = Field(default=None, min_length=1)
    folder_path: str | None = Field(default=None, min_length=1)
    cookies_browser: str | None = None
    resolution_limit: int | None = Field(default=None, ge=1)
    active: bool | None = None
    playlist_id: str | None = None


class PlaylistRead(PlaylistBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    playlist_id: str | None
    use_title_as_folder: bool
    last_checked_at: datetime | None
    last_downloaded_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PlaylistListResponse(BaseModel):
    items: list[PlaylistRead]
