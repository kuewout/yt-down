from datetime import UTC, datetime
from dataclasses import dataclass
from pathlib import Path
import re
import shutil
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Playlist, Video
from app.services.activity import activity_registry
from app.services.library import relink_playlist_videos
from app.services.ytdlp import PlaylistSnapshot, YtDlpError, fetch_flat_playlist


@dataclass
class SyncPlaylistResult:
    playlist: Playlist
    created_count: int
    total_videos: int
    matched_local_videos: int
    unmatched_local_files: list[str]


def build_folder_path(folder_name: str) -> str:
    return str(Path(settings.media_root).joinpath(folder_name))


def slugify_folder_name(value: str) -> str:
    normalized = re.sub(r'[\x00-\x1f<>:"/\\|?*]+', "-", value)
    normalized = re.sub(r"\s+", " ", normalized).strip(" .")
    return normalized or "playlist"


def resolve_unique_folder_name(
    db: Session,
    preferred_name: str,
    exclude_playlist_id: UUID | None = None,
    current_path: str | None = None,
) -> str:
    base_name = slugify_folder_name(preferred_name)
    suffix = 1

    while True:
        candidate = base_name if suffix == 1 else f"{base_name}-{suffix}"
        candidate_path = build_folder_path(candidate)

        folder_name_query = select(Playlist).where(Playlist.folder_name == candidate)
        folder_path_query = select(Playlist).where(
            Playlist.folder_path == candidate_path
        )
        if exclude_playlist_id:
            folder_name_query = folder_name_query.where(
                Playlist.id != exclude_playlist_id
            )
            folder_path_query = folder_path_query.where(
                Playlist.id != exclude_playlist_id
            )

        existing_playlist = db.scalar(folder_name_query)
        path_conflict = db.scalar(folder_path_query)
        filesystem_conflict = (
            Path(candidate_path).exists() and candidate_path != current_path
        )

        if not existing_playlist and not path_conflict and not filesystem_conflict:
            return candidate

        suffix += 1


def folder_assignment_conflicts(
    db: Session,
    folder_name: str,
    folder_path: str,
    exclude_playlist_id: UUID | None = None,
) -> bool:
    folder_name_query = select(Playlist).where(Playlist.folder_name == folder_name)
    folder_path_query = select(Playlist).where(Playlist.folder_path == folder_path)
    if exclude_playlist_id:
        folder_name_query = folder_name_query.where(Playlist.id != exclude_playlist_id)
        folder_path_query = folder_path_query.where(Playlist.id != exclude_playlist_id)

    return bool(db.scalar(folder_name_query) or db.scalar(folder_path_query))


def prepare_new_playlist_folder(
    db: Session, title: str | None, folder_name: str | None, folder_path: str | None
) -> tuple[str, str, bool]:
    if folder_name or folder_path:
        resolved_folder_name = slugify_folder_name(
            folder_name or Path(folder_path or "").name or "playlist"
        )
        resolved_folder_path = folder_path or build_folder_path(resolved_folder_name)
        if folder_assignment_conflicts(db, resolved_folder_name, resolved_folder_path):
            raise ValueError(
                "Folder name or path is already in use by another playlist"
            )
        return resolved_folder_name, resolved_folder_path, False

    preferred_name = title or "playlist"
    resolved_folder_name = resolve_unique_folder_name(db, preferred_name)
    return resolved_folder_name, build_folder_path(resolved_folder_name), True


def apply_title_folder_name(db: Session, playlist: Playlist, title: str) -> None:
    if not playlist.use_title_as_folder:
        return

    target_folder_name = resolve_unique_folder_name(
        db,
        title,
        exclude_playlist_id=playlist.id,
        current_path=playlist.folder_path,
    )
    target_folder_path = build_folder_path(target_folder_name)
    if (
        playlist.folder_name == target_folder_name
        and playlist.folder_path == target_folder_path
    ):
        return

    old_path = Path(playlist.folder_path)
    new_path = Path(target_folder_path)
    if old_path.exists() and old_path != new_path:
        try:
            shutil.move(str(old_path), str(new_path))
        except OSError:
            return

    playlist.folder_name = target_folder_name
    playlist.folder_path = target_folder_path


def sync_playlist(db: Session, playlist_id: UUID) -> SyncPlaylistResult:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise ValueError("Playlist not found")

    activity_registry.start(
        operation="sync",
        playlist_id=playlist.id,
        playlist_title=playlist.title,
        message="Scanning local files",
    )
    try:
        relink_result = relink_playlist_videos(db, playlist)
        activity_registry.update(
            message=f"Matched local files: {relink_result.relinked_videos} relinked, {relink_result.unchanged_videos} already linked",
        )

        activity_registry.update(message="Fetching playlist metadata")
        snapshot = fetch_flat_playlist(playlist.source_url)
        activity_registry.update(
            playlist_title=snapshot.title,
            message=f"Processing {len(snapshot.entries)} playlist entries",
            items_total=len(snapshot.entries),
        )
        apply_title_folder_name(db, playlist, snapshot.title)
        playlist.title = snapshot.title
        playlist.playlist_id = snapshot.playlist_id
        playlist.last_checked_at = datetime.now(UTC)

        created_count = _upsert_playlist_entries(db, playlist, snapshot)
        db.commit()
        db.refresh(playlist)
        total_videos = len(list_playlist_videos(db, playlist.id))
    except Exception as exc:
        activity_registry.fail(str(exc))
        raise

    unmatched_display = ", ".join(relink_result.unmatched_local_files)
    if not unmatched_display:
        unmatched_display = "none"
    activity_registry.complete(
        message=(
            f"Synced {playlist.title}: {created_count} new / {total_videos} total, "
            f"local matched {relink_result.matched_local_videos}/{relink_result.files_scanned}, "
            f"unmatched local files: {unmatched_display}"
        ),
        items_completed=len(snapshot.entries),
    )
    return SyncPlaylistResult(
        playlist=playlist,
        created_count=created_count,
        total_videos=total_videos,
        matched_local_videos=relink_result.matched_local_videos,
        unmatched_local_files=relink_result.unmatched_local_files,
    )


def _upsert_playlist_entries(
    db: Session, playlist: Playlist, snapshot: PlaylistSnapshot
) -> int:
    existing_videos = {
        video.video_id: video
        for video in db.scalars(
            select(Video).where(Video.playlist_id == playlist.id)
        ).all()
    }
    created_count = 0
    now = datetime.now(UTC)
    for playlist_index, entry in enumerate(snapshot.entries):
        # yt-dlp flat playlist results can contain duplicate video IDs.
        # Treat later occurrences as metadata refreshes for the same row.
        video = existing_videos.get(entry.video_id)
        if video is None:
            video = Video(
                playlist_id=playlist.id,
                playlist_index=playlist_index,
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

        video.playlist_index = playlist_index
        video.title = entry.title
        video.upload_date = (
            entry.upload_date.date() if entry.upload_date else video.upload_date
        )
        video.duration_seconds = entry.duration_seconds
        video.webpage_url = entry.webpage_url
        video.thumbnail_url = entry.thumbnail_url
        video.metadata_json = entry.metadata_json

    return created_count


def list_playlist_videos(db: Session, playlist_id: UUID) -> list[Video]:
    return db.scalars(
        select(Video)
        .where(Video.playlist_id == playlist_id)
        .order_by(Video.playlist_index.asc(), Video.created_at.asc())
    ).all()


__all__ = [
    "YtDlpError",
    "apply_title_folder_name",
    "build_folder_path",
    "folder_assignment_conflicts",
    "list_playlist_videos",
    "prepare_new_playlist_folder",
    "resolve_unique_folder_name",
    "slugify_folder_name",
    "sync_playlist",
]
