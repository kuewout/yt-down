import logging
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Playlist, Video
from app.core.config import settings
from app.services.activity import activity_registry
from app.services.ytdlp import (
    ROUND_ROBIN_COOKIES_BROWSER,
    YtDlpError,
    download_video,
    list_available_cookie_browsers,
    normalize_cookies_browser,
)


logger = logging.getLogger(__name__)

UNDOWNLOADABLE_PREFIX = "UNDOWNLOADABLE: "
UNDOWNLOADABLE_PATTERNS = (
    "members-only",
    "member only",
    "members-only content",
    "premium_only",
    "subscriber_only",
    "private video",
    "video is private",
    "this video is available to this channel's members",
    "join this channel",
    "become a member",
    "会员专享",
    "成为此频道的会员",
)
UNUSABLE_BROWSER_PATTERNS = (
    "could not find",
    "not installed",
    "failed to decrypt",
    "could not decrypt",
    "password store",
    "keyring",
    "kwallet",
    "gnome-keyring",
    "secret service",
    "permission denied",
    "no such file or directory",
)


def _is_undownloadable_error(message: str) -> bool:
    normalized = message.lower()
    return any(pattern in normalized for pattern in UNDOWNLOADABLE_PATTERNS)


def _is_unusable_browser_error(message: str) -> bool:
    normalized = message.lower()
    return any(pattern in normalized for pattern in UNUSABLE_BROWSER_PATTERNS)


def _download_videos(
    db: Session,
    playlist: Playlist,
    videos: list[Video],
    cookies_browser: str | None = None,
) -> tuple[int, int, int]:
    downloaded_count = 0
    failed_count = 0
    attempted_count = len(videos)
    output_dir = Path(playlist.folder_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(output_dir / "%(upload_date)s %(title)s.%(ext)s")
    requested_browser = cookies_browser
    if not requested_browser:
        requested_browser = settings.default_cookies_browser
    resolved_browser = normalize_cookies_browser(requested_browser)
    is_round_robin = resolved_browser == ROUND_ROBIN_COOKIES_BROWSER
    round_robin_browsers: list[str] = []
    round_robin_index = 0
    if is_round_robin:
        round_robin_browsers = [
            option.value
            for option in list_available_cookie_browsers().options
            if option.value != ROUND_ROBIN_COOKIES_BROWSER
        ]
    browser_label = (
        f"{ROUND_ROBIN_COOKIES_BROWSER} ({len(round_robin_browsers)})"
        if is_round_robin
        else (resolved_browser or "none")
    )

    activity_registry.start(
        operation="download",
        playlist_id=playlist.id,
        playlist_title=playlist.title,
        message=f"Preparing downloads with browser: {browser_label}",
        items_total=attempted_count,
    )
    logger.info(
        "Starting download job playlist=%s attempted=%s cookies_browser=%s",
        playlist.title,
        attempted_count,
        browser_label,
    )
    try:
        for index, video in enumerate(videos, start=1):
            current_browser_label = browser_label

            def handle_progress(
                progress: str,
                *,
                current_index: int = index,
                current_video_id=video.id,
                current_video_title: str = video.title,
            ) -> None:
                logger.info(
                    "Download progress video=%s index=%s/%s browser=%s progress=%s",
                    current_video_title,
                    current_index,
                    attempted_count,
                    current_browser_label,
                    progress,
                )
                activity_registry.update(
                    video_id=current_video_id,
                    video_title=current_video_title,
                    message=f"{current_browser_label} {progress}",
                    items_completed=current_index - 1,
                )

            requested_video_browser = requested_browser
            ordered_browsers: list[str] = []
            if is_round_robin:
                if round_robin_browsers:
                    start = round_robin_index % len(round_robin_browsers)
                    ordered_browsers = (
                        round_robin_browsers[start:] + round_robin_browsers[:start]
                    )
                    round_robin_index += 1
                    requested_video_browser = ordered_browsers[0]
                else:
                    requested_video_browser = None
                current_browser_label = ROUND_ROBIN_COOKIES_BROWSER
            else:
                current_browser_label = browser_label

            activity_registry.update(
                video_id=video.id,
                video_title=video.title,
                message=f"Starting via {current_browser_label}",
                items_completed=index - 1,
            )
            logger.info(
                "Downloading video %s/%s title=%s cookies_browser=%s",
                index,
                attempted_count,
                video.title,
                current_browser_label,
            )
            try:
                if is_round_robin:
                    result = None
                    last_unusable_error: YtDlpError | None = None
                    for candidate in ordered_browsers:
                        current_browser_label = candidate
                        try:
                            result = download_video(
                                url=video.webpage_url,
                                output_template=output_template,
                                cookies_browser=candidate,
                                resolution_limit=playlist.resolution_limit,
                                progress_callback=handle_progress,
                                retry_without_cookies=False,
                            )
                            break
                        except YtDlpError as exc:
                            if _is_unusable_browser_error(str(exc)):
                                last_unusable_error = exc
                                logger.info(
                                    "Skipping unusable cookies browser=%s for video=%s error=%s",
                                    candidate,
                                    video.title,
                                    str(exc),
                                )
                                continue
                            raise

                    if result is None:
                        current_browser_label = "none"
                        try:
                            result = download_video(
                                url=video.webpage_url,
                                output_template=output_template,
                                cookies_browser=None,
                                resolution_limit=playlist.resolution_limit,
                                progress_callback=handle_progress,
                            )
                        except YtDlpError as exc:
                            if last_unusable_error is not None:
                                raise YtDlpError(
                                    f"{last_unusable_error} | no-cookies fallback failed: {exc}"
                                ) from exc
                            raise
                else:
                    result = download_video(
                        url=video.webpage_url,
                        output_template=output_template,
                        cookies_browser=requested_video_browser,
                        resolution_limit=playlist.resolution_limit,
                        progress_callback=handle_progress,
                    )
            except YtDlpError as exc:
                error_message = str(exc)
                if _is_undownloadable_error(error_message):
                    error_message = f"{UNDOWNLOADABLE_PREFIX}{error_message}"
                video.downloaded = False
                video.local_path = None
                video.download_error = error_message
                failed_count += 1
                logger.warning(
                    "Download failed video=%s cookies_browser=%s error=%s",
                    video.title,
                    current_browser_label,
                    error_message,
                )
                activity_registry.update(
                    video_id=video.id,
                    video_title=video.title,
                    message=f"Failed video {index}/{attempted_count} via {current_browser_label}",
                    items_completed=index,
                )
                continue

            video.local_path = result.local_path
            video.downloaded = True
            video.downloaded_at = datetime.now(UTC)
            if result.upload_date is not None:
                video.upload_date = result.upload_date.date()
            video.download_error = None
            downloaded_count += 1
            logger.info(
                "Downloaded video %s/%s title=%s path=%s",
                index,
                attempted_count,
                video.title,
                result.local_path,
            )
            activity_registry.update(
                video_id=video.id,
                video_title=video.title,
                message=f"Saved via {current_browser_label}",
                items_completed=index,
            )

        playlist.last_downloaded_at = datetime.now(UTC)
        db.commit()
        db.refresh(playlist)
    except Exception as exc:
        activity_registry.fail(str(exc))
        raise

    activity_registry.complete(
        message=f"Finished via {browser_label}: saved {downloaded_count}, failed {failed_count}",
        items_completed=attempted_count,
    )
    return downloaded_count, failed_count, attempted_count


def download_missing_videos(
    db: Session,
    playlist_id: UUID,
    batch_size: int = 5,
    cookies_browser: str | None = None,
) -> tuple[Playlist, int, int, int]:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise ValueError("Playlist not found")
    if not playlist.active:
        raise ValueError("Inactive playlists cannot download videos")

    missing_videos = db.scalars(
        select(Video)
        .where(
            Video.playlist_id == playlist_id,
            Video.downloaded.is_(False),
            or_(
                Video.download_error.is_(None),
                ~Video.download_error.like(f"{UNDOWNLOADABLE_PREFIX}%"),
            ),
        )
        .order_by(Video.playlist_index.asc(), Video.created_at.asc())
        .limit(batch_size)
    ).all()

    downloaded_count, failed_count, attempted_count = _download_videos(
        db=db,
        playlist=playlist,
        videos=missing_videos,
        cookies_browser=cookies_browser,
    )
    return playlist, downloaded_count, failed_count, attempted_count


def download_single_video(
    db: Session,
    playlist_id: UUID,
    video_id: UUID,
    cookies_browser: str | None = None,
) -> tuple[Playlist, Video, int, int, int]:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise ValueError("Playlist not found")
    if not playlist.active:
        raise ValueError("Inactive playlists cannot download videos")

    video = db.scalars(
        select(Video).where(Video.id == video_id, Video.playlist_id == playlist_id)
    ).first()
    if video is None:
        raise ValueError("Video not found")
    if video.downloaded:
        raise ValueError("Video already downloaded")

    downloaded_count, failed_count, attempted_count = _download_videos(
        db=db,
        playlist=playlist,
        videos=[video],
        cookies_browser=cookies_browser,
    )
    return playlist, video, downloaded_count, failed_count, attempted_count
