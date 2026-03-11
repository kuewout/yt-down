from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class VideoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    playlist_id: UUID
    video_id: str
    title: str
    upload_date: date | None
    duration_seconds: int | None
    webpage_url: str
    thumbnail_url: str | None
    local_path: str | None
    downloaded: bool
    download_error: str | None
    downloaded_at: datetime | None
    last_seen_at: datetime
    metadata_json: dict
    created_at: datetime
    updated_at: datetime


class VideoListResponse(BaseModel):
    items: list[VideoRead]
