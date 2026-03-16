import logging
from collections import Counter
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
    unusable_round_robin_browsers: set[str] = set()
    if is_round_robin:
        round_robin_browsers = [
            option.value
            for option in list_available_cookie_browsers().options
            if option.value != ROUND_ROBIN_COOKIES_BROWSER
        ]
    browser_label = (
        f"{ROUND_ROBIN_COOKIES_BROWSER} pool={len(round_robin_browsers)}"
        if is_round_robin
        else (resolved_browser or "none")
    )
    browser_usage: Counter[str] = Counter()
    failed_summaries: list[str] = []

    activity_registry.start(
        operation="download",
        playlist_id=playlist.id,
        playlist_title=playlist.title,
        message=f"Preparing {attempted_count} download(s) with cookies={browser_label}",
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

            requested_video_browser = requested_browser
            ordered_browsers: list[str] = []
            round_robin_start = 0
            start_message_browser = current_browser_label
            if is_round_robin:
                eligible_browsers = [
                    browser
                    for browser in round_robin_browsers
                    if browser not in unusable_round_robin_browsers
                ]
                if eligible_browsers:
                    start = round_robin_index % len(eligible_browsers)
                    round_robin_start = start
                    ordered_browsers = eligible_browsers[start:] + eligible_browsers[:start]
                    requested_video_browser = ordered_browsers[0]
                    current_browser_label = requested_video_browser
                    start_message_browser = ROUND_ROBIN_COOKIES_BROWSER
                else:
                    requested_video_browser = None
                    current_browser_label = "none"
                    start_message_browser = "none"
            else:
                current_browser_label = browser_label
                start_message_browser = current_browser_label

            activity_registry.update(
                operation="download",
                video_id=video.id,
                video_title=video.title,
                message=f"Starting video download...",
                items_completed=index,
            )
            logger.info(
                "Downloading video %s/%s title=%s cookies_browser=%s",
                index,
                attempted_count,
                video.title,
                start_message_browser,
            )
            try:
                if is_round_robin:
                    result = None
                    last_browser_error: YtDlpError | None = None
                    successful_candidate_index: int | None = None
                    for candidate_index, candidate in enumerate(ordered_browsers):
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
                            successful_candidate_index = candidate_index
                            break
                        except YtDlpError as exc:
                            last_browser_error = exc
                            if _is_unusable_browser_error(str(exc)):
                                unusable_round_robin_browsers.add(candidate)
                                logger.info(
                                    "Skipping unusable cookies browser=%s for video=%s error=%s",
                                    candidate,
                                    video.title,
                                    str(exc),
                                )
                            else:
                                logger.info(
                                    "Cookies browser failed browser=%s for video=%s error=%s; trying next browser",
                                    candidate,
                                    video.title,
                                    str(exc),
                                )
                            continue

                    if ordered_browsers:
                        if successful_candidate_index is not None:
                            round_robin_index = (
                                round_robin_start + successful_candidate_index + 1
                            )
                        else:
                            round_robin_index = round_robin_start + 1

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
                            if last_browser_error is not None:
                                raise YtDlpError(
                                    f"{last_browser_error} | no-cookies fallback failed: {exc}"
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
                    operation="download",
                    video_id=video.id,
                    video_title=video.title,
                    message=f"Failed video {index}/{attempted_count} via {current_browser_label}",
                    items_completed=index,
                )
                failed_summaries.append(
                    f'"{video.title}" via {current_browser_label}'
                )
                continue

            video.local_path = result.local_path
            video.downloaded = True
            video.downloaded_at = datetime.now(UTC)
            if result.upload_date is not None:
                video.upload_date = result.upload_date.date()
            video.download_error = None
            downloaded_count += 1
            browser_usage[current_browser_label] += 1
            logger.info(
                "Downloaded video %s/%s title=%s path=%s",
                index,
                attempted_count,
                video.title,
                result.local_path,
            )
            activity_registry.update(
                operation="download",
                video_id=video.id,
                video_title=video.title,
                message=f"Success via {current_browser_label}: [{video.title}]",
                items_completed=index,
            )

        playlist.last_downloaded_at = datetime.now(UTC)
        db.commit()
        db.refresh(playlist)
    except Exception as exc:
        activity_registry.fail(str(exc), operation="download")
        raise

    browser_breakdown = ", ".join(
        f"{browser}={count}" for browser, count in browser_usage.items()
    ) or "none"
    failure_detail = (
        "; failed items:\n" + "\n".join(f"- {summary}" for summary in failed_summaries)
        if failed_summaries
        else ""
    )
    activity_registry.complete(
        operation="download",
        message=(
            f"Finished {attempted_count} item(s): saved {downloaded_count}, failed {failed_count}; "
            f"saved-by-browser [{browser_breakdown}]{failure_detail}"
        ),
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
