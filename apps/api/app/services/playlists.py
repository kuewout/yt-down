from datetime import UTC, datetime
from pathlib import Path
import re
import shutil
from urllib.parse import parse_qs, urlparse
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Playlist, Video
from app.services.activity import activity_registry
from app.services.ytdlp import PlaylistSnapshot, YtDlpError, fetch_flat_playlist


def build_folder_path(folder_name: str) -> str:
    return str(Path(settings.media_root).joinpath(folder_name))


def slugify_folder_name(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-_").lower()
    return slug or "playlist"


def derive_folder_name(source_url: str) -> str:
    parsed = urlparse(source_url)
    query = parse_qs(parsed.query)
    candidate = query.get("list", [None])[0]
    if not candidate:
        path_parts = [part for part in parsed.path.split("/") if part]
        candidate = path_parts[-1] if path_parts else parsed.netloc or "playlist"

    return slugify_folder_name(candidate)


def maybe_apply_human_readable_folder(playlist: Playlist, snapshot: PlaylistSnapshot) -> None:
    current_folder = playlist.folder_name.strip()
    derived_from_url = derive_folder_name(playlist.source_url)
    if current_folder and current_folder != derived_from_url:
        return

    readable_folder = slugify_folder_name(snapshot.title)
    if not readable_folder or readable_folder == current_folder:
        return

    old_path = Path(playlist.folder_path)
    new_path = Path(build_folder_path(readable_folder))
    if new_path == old_path:
        playlist.folder_name = readable_folder
        playlist.folder_path = str(new_path)
        return

    if new_path.exists():
        return

    if old_path.exists():
        try:
            shutil.move(str(old_path), str(new_path))
        except OSError:
            return

    playlist.folder_name = readable_folder
    playlist.folder_path = str(new_path)


def sync_playlist(db: Session, playlist_id: UUID) -> tuple[Playlist, int]:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise ValueError("Playlist not found")

    activity_registry.start(
        operation="sync",
        playlist_id=playlist.id,
        playlist_title=playlist.title,
        message="Fetching playlist metadata",
    )
    try:
        snapshot = fetch_flat_playlist(playlist.source_url)
        activity_registry.update(
            playlist_title=snapshot.title,
            message=f"Processing {len(snapshot.entries)} playlist entries",
            items_total=len(snapshot.entries),
        )
        maybe_apply_human_readable_folder(playlist, snapshot)
        playlist.title = snapshot.title
        playlist.playlist_id = snapshot.playlist_id
        playlist.last_checked_at = datetime.now(UTC)

        created_count = _upsert_playlist_entries(db, playlist, snapshot)
        db.commit()
        db.refresh(playlist)
    except Exception as exc:
        activity_registry.fail(str(exc))
        raise

    activity_registry.complete(
        message=f"Synced {playlist.title}: {created_count} new videos",
        items_completed=len(snapshot.entries),
    )
    return playlist, created_count


def _upsert_playlist_entries(db: Session, playlist: Playlist, snapshot: PlaylistSnapshot) -> int:
    existing_videos = {
        video.video_id: video
        for video in db.scalars(select(Video).where(Video.playlist_id == playlist.id)).all()
    }
    created_count = 0
    now = datetime.now(UTC)

    for entry in snapshot.entries:
        # yt-dlp flat playlist results can contain duplicate video IDs.
        # Treat later occurrences as metadata refreshes for the same row.
        video = existing_videos.get(entry.video_id)
        if video is None:
            video = Video(
                playlist_id=playlist.id,
                video_id=entry.video_id,
                title=entry.title,
                upload_date=entry.upload_date.date() if entry.upload_date else None,
                duration_seconds=entry.duration_seconds,
                webpage_url=entry.webpage_url,
                thumbnail_url=entry.thumbnail_url,
                metadata_json=entry.metadata_json,
                last_seen_at=now,
            )
            db.add(video)
            existing_videos[entry.video_id] = video
            created_count += 1
        else:
            video.last_seen_at = now

        video.title = entry.title
        video.upload_date = entry.upload_date.date() if entry.upload_date else video.upload_date
        video.duration_seconds = entry.duration_seconds
        video.webpage_url = entry.webpage_url
        video.thumbnail_url = entry.thumbnail_url
        video.metadata_json = entry.metadata_json

    return created_count


def list_playlist_videos(db: Session, playlist_id: UUID) -> list[Video]:
    return db.scalars(
        select(Video)
        .where(Video.playlist_id == playlist_id)
        .order_by(Video.upload_date.desc().nullslast(), Video.created_at.desc())
    ).all()


__all__ = [
    "YtDlpError",
    "build_folder_path",
    "derive_folder_name",
    "list_playlist_videos",
    "maybe_apply_human_readable_folder",
    "slugify_folder_name",
    "sync_playlist",
]
