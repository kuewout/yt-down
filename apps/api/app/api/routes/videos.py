from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Video
from app.schemas import VideoListResponse, VideoRead
from app.services.playlists import list_playlist_videos

router = APIRouter()


@router.get("", response_model=VideoListResponse)
def list_videos(
    playlist_id: UUID | None = None, db: Session = Depends(get_db)
) -> VideoListResponse:
    if playlist_id is not None:
        videos = list_playlist_videos(db, playlist_id)
    else:
        videos = db.scalars(select(Video).order_by(Video.created_at.desc())).all()

    return VideoListResponse(
        items=[VideoRead.model_validate(video) for video in videos]
    )
