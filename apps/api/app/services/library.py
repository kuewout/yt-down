from dataclasses import dataclass
from pathlib import Path
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Playlist, Video
from app.services.activity import activity_registry


@dataclass
class LibraryRescanResult:
    playlists_scanned: int
    files_scanned: int
    relinked_videos: int
    missing_videos: int
    unchanged_videos: int


def rescan_library(db: Session) -> LibraryRescanResult:
    playlists = db.scalars(select(Playlist).order_by(Playlist.created_at.asc())).all()
    files_scanned = 0
    relinked_videos = 0
    missing_videos = 0
    unchanged_videos = 0

    activity_registry.start(
        operation="rescan",
        message="Scanning playlist folders",
        items_total=len(playlists),
    )
    try:
        for index, playlist in enumerate(playlists, start=1):
            activity_registry.update(
                playlist_id=playlist.id,
                playlist_title=playlist.title,
                message=f"Scanning {playlist.title}",
                items_completed=index - 1,
            )
            playlist_files = _collect_playlist_files(Path(playlist.folder_path))
            files_scanned += len(playlist_files)
            files_by_normalized_stem = _build_normalized_index(playlist_files)
            videos = db.scalars(select(Video).where(Video.playlist_id == playlist.id)).all()

            for video in videos:
                current_path = Path(video.local_path) if video.local_path else None
                if current_path and current_path.is_file():
                    resolved_path = str(current_path.resolve())
                    if video.local_path != resolved_path:
                        video.local_path = resolved_path
                    video.downloaded = True
                    video.download_error = None
                    unchanged_videos += 1
                    continue

                if video.local_path:
                    video.local_path = None

                matched_path = _match_video_file(video, files_by_normalized_stem)
                if matched_path is None:
                    video.downloaded = False
                    missing_videos += 1
                    continue

                video.local_path = str(matched_path.resolve())
                video.downloaded = True
                video.download_error = None
                relinked_videos += 1

            activity_registry.update(items_completed=index)

        db.commit()
    except Exception as exc:
        activity_registry.fail(str(exc))
        raise

    activity_registry.complete(
        message=f"Rescanned {len(playlists)} playlists and {files_scanned} files",
        items_completed=len(playlists),
    )
    return LibraryRescanResult(
        playlists_scanned=len(playlists),
        files_scanned=files_scanned,
        relinked_videos=relinked_videos,
        missing_videos=missing_videos,
        unchanged_videos=unchanged_videos,
    )


def _collect_playlist_files(folder_path: Path) -> list[Path]:
    if not folder_path.exists() or not folder_path.is_dir():
        return []

    return sorted(path for path in folder_path.rglob("*") if path.is_file())


def _build_normalized_index(files: list[Path]) -> dict[str, list[Path]]:
    index: dict[str, list[Path]] = {}
    for path in files:
        normalized = _normalize_name(path.stem)
        if not normalized:
            continue
        index.setdefault(normalized, []).append(path)
    return index


def _match_video_file(video: Video, files_by_normalized_stem: dict[str, list[Path]]) -> Path | None:
    normalized_stem = _normalize_name(_expected_stem(video))
    if not normalized_stem:
        return None

    candidates = files_by_normalized_stem.get(normalized_stem, [])
    if len(candidates) == 1:
        return candidates[0]

    return None


def _expected_stem(video: Video) -> str:
    if video.upload_date is not None:
        return f"{video.upload_date.strftime('%Y%m%d')} {video.title}"
    return video.title


def _normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())
