from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Playlist, Video
from app.services.activity import activity_registry
from app.services.ytdlp import YtDlpError, download_video


def download_missing_videos(db: Session, playlist_id: UUID) -> tuple[Playlist, int, int]:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise ValueError("Playlist not found")

    missing_videos = db.scalars(
        select(Video)
        .where(Video.playlist_id == playlist_id, Video.downloaded.is_(False))
        .order_by(Video.upload_date.asc().nullsfirst(), Video.created_at.asc())
    ).all()

    downloaded_count = 0
    failed_count = 0
    output_dir = Path(playlist.folder_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(output_dir / "%(upload_date)s %(title)s.%(ext)s")

    activity_registry.start(
        operation="download",
        playlist_id=playlist.id,
        playlist_title=playlist.title,
        message="Preparing downloads",
        items_total=len(missing_videos),
    )
    try:
        for index, video in enumerate(missing_videos, start=1):
            activity_registry.update(
                video_id=video.id,
                video_title=video.title,
                message=f"Downloading {video.title}",
                items_completed=index - 1,
            )
            try:
                result = download_video(
                    url=video.webpage_url,
                    output_template=output_template,
                    cookies_browser=playlist.cookies_browser,
                    resolution_limit=playlist.resolution_limit,
                )
            except YtDlpError as exc:
                video.download_error = str(exc)
                failed_count += 1
                activity_registry.update(
                    message=f"Failed {video.title}",
                    items_completed=index,
                )
                continue

            video.local_path = result.local_path
            video.downloaded = True
            video.downloaded_at = datetime.now(UTC)
            video.download_error = None
            downloaded_count += 1
            activity_registry.update(
                message=f"Downloaded {video.title}",
                items_completed=index,
            )

        playlist.last_downloaded_at = datetime.now(UTC)
        db.commit()
        db.refresh(playlist)
    except Exception as exc:
        activity_registry.fail(str(exc))
        raise

    activity_registry.complete(
        message=f"Downloaded {downloaded_count} videos, failed {failed_count}",
        items_completed=len(missing_videos),
    )
    return playlist, downloaded_count, failed_count
