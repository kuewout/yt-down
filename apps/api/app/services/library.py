from dataclasses import dataclass
from pathlib import Path
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Playlist, Video
from app.services.activity import activity_registry


VIDEO_FILE_EXTENSIONS = {
    ".3gp",
    ".avi",
    ".flv",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".webm",
    ".wmv",
}


@dataclass
class LibraryRescanResult:
    playlists_scanned: int
    files_scanned: int
    relinked_videos: int
    missing_videos: int
    unchanged_videos: int
    unmatched_local_files: list[str]

    @property
    def matched_local_videos(self) -> int:
        return self.relinked_videos + self.unchanged_videos


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
            result = relink_playlist_videos(db, playlist)
            files_scanned += result.files_scanned
            relinked_videos += result.relinked_videos
            missing_videos += result.missing_videos
            unchanged_videos += result.unchanged_videos

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
        unmatched_local_files=[],
    )


def relink_playlist_videos(db: Session, playlist: Playlist) -> LibraryRescanResult:
    playlist_files = _collect_playlist_files(Path(playlist.folder_path))
    files_by_normalized_stem, files_by_stripped_prefix_stem = _build_normalized_indexes(
        playlist_files
    )
    videos = db.scalars(select(Video).where(Video.playlist_id == playlist.id)).all()
    relinked_videos = 0
    missing_videos = 0
    unchanged_videos = 0
    matched_local_paths: set[Path] = set()

    for video in videos:
        matched_path = _match_video_file(
            video, files_by_normalized_stem, files_by_stripped_prefix_stem
        )
        if matched_path is None:
            video.downloaded = False
            video.local_path = None
            missing_videos += 1
            continue

        resolved_match = str(matched_path.resolve())
        is_unchanged = (
            bool(video.local_path)
            and video.downloaded
            and video.download_error is None
            and _paths_equal(video.local_path, resolved_match)
        )
        video.local_path = resolved_match
        video.downloaded = True
        video.download_error = None
        matched_local_paths.add(matched_path.resolve())
        if is_unchanged:
            unchanged_videos += 1
        else:
            relinked_videos += 1

    unmatched_local_files = sorted(
        path.name for path in playlist_files if path.resolve() not in matched_local_paths
    )

    return LibraryRescanResult(
        playlists_scanned=1,
        files_scanned=len(playlist_files),
        relinked_videos=relinked_videos,
        missing_videos=missing_videos,
        unchanged_videos=unchanged_videos,
        unmatched_local_files=unmatched_local_files,
    )


def _collect_playlist_files(folder_path: Path) -> list[Path]:
    if not folder_path.exists() or not folder_path.is_dir():
        return []

    return sorted(
        path
        for path in folder_path.rglob("*")
        if path.is_file() and path.suffix.casefold() in VIDEO_FILE_EXTENSIONS
    )


def _build_normalized_indexes(
    files: list[Path],
) -> tuple[dict[str, list[Path]], dict[str, list[Path]]]:
    index: dict[str, list[Path]] = {}
    stripped_prefix_index: dict[str, list[Path]] = {}
    for path in files:
        stem = path.stem
        normalized = _normalize_name(stem)
        if not normalized:
            continue
        index.setdefault(normalized, []).append(path)

        stripped = _strip_leading_date_prefix(stem)
        if stripped is None:
            continue
        stripped_normalized = _normalize_name(stripped)
        if stripped_normalized:
            stripped_prefix_index.setdefault(stripped_normalized, []).append(path)
    return index, stripped_prefix_index


def _match_video_file(
    video: Video,
    files_by_normalized_stem: dict[str, list[Path]],
    files_by_stripped_prefix_stem: dict[str, list[Path]],
) -> Path | None:
    normalized_stem = _normalize_name(_expected_stem(video))
    if not normalized_stem:
        return None

    candidates = files_by_normalized_stem.get(normalized_stem, [])
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        return None

    # Fallback for files named like "YYYYMMDD <title>".
    stripped_prefix_candidates = files_by_stripped_prefix_stem.get(normalized_stem, [])
    if len(stripped_prefix_candidates) == 1:
        return stripped_prefix_candidates[0]

    return None


def _expected_stem(video: Video) -> str:
    if video.upload_date is not None:
        return f"{video.upload_date.strftime('%Y%m%d')} {video.title}"
    return video.title


def _normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def _strip_leading_date_prefix(value: str) -> str | None:
    match = re.match(r"^\s*(\d{8})\s+(.+)$", value)
    if not match:
        return None
    return match.group(2).strip()


def _paths_equal(left: str, right: str) -> bool:
    return Path(left).expanduser().resolve() == Path(right).expanduser().resolve()
