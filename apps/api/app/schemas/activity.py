from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: str
    operation: str | None
    is_active: bool
    playlist_id: UUID | None
    playlist_title: str | None
    video_id: UUID | None
    video_title: str | None
    message: str | None
    items_completed: int
    items_total: int | None
    started_at: datetime | None
    updated_at: datetime | None
    finished_at: datetime | None
