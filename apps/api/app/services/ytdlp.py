import json
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


class YtDlpError(RuntimeError):
    pass


@dataclass
class PlaylistEntry:
    video_id: str
    title: str
    webpage_url: str
    thumbnail_url: str | None
    duration_seconds: int | None
    upload_date: datetime | None
    metadata_json: dict


@dataclass
class PlaylistSnapshot:
    playlist_id: str | None
    title: str
    entries: list[PlaylistEntry]


@dataclass
class DownloadResult:
    local_path: str


def normalize_cookies_browser(browser: str | None) -> str | None:
    if not browser:
        return None

    normalized = browser.strip().lower()
    aliases = {
        "atlas": "chrome",
        "comet": "chrome",
    }
    return aliases.get(normalized, normalized)


def _build_format_selector(resolution_limit: int | None) -> str:
    if resolution_limit:
        return f"bestvideo*[height<={resolution_limit}]+bestaudio/best[height<={resolution_limit}]/best"

    return "bestvideo*+bestaudio/best"


def _run_yt_dlp_command(cmd: list[str]) -> DownloadResult:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise YtDlpError(result.stderr.strip() or "yt-dlp failed to download video")

    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    local_path = lines[-1] if lines else ""
    if not local_path:
        raise YtDlpError("yt-dlp did not report a downloaded file path")

    return DownloadResult(local_path=str(Path(local_path)))


def _parse_upload_date(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        parsed = datetime.strptime(value, "%Y%m%d")
    except ValueError:
        return None

    return parsed.replace(tzinfo=UTC)


def fetch_flat_playlist(url: str) -> PlaylistSnapshot:
    cmd = ["yt-dlp", "--flat-playlist", "-J", url]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise YtDlpError(result.stderr.strip() or "yt-dlp failed to fetch playlist metadata")

    payload = json.loads(result.stdout)
    entries: list[PlaylistEntry] = []
    for raw_entry in payload.get("entries", []):
        video_id = raw_entry.get("id")
        title = raw_entry.get("title")
        if not video_id or not title:
            continue

        webpage_url = raw_entry.get("url")
        if not webpage_url or not webpage_url.startswith("http"):
            webpage_url = f"https://www.youtube.com/watch?v={video_id}"

        entries.append(
            PlaylistEntry(
                video_id=video_id,
                title=title,
                webpage_url=webpage_url,
                thumbnail_url=raw_entry.get("thumbnail"),
                duration_seconds=raw_entry.get("duration"),
                upload_date=_parse_upload_date(raw_entry.get("upload_date")),
                metadata_json=raw_entry,
            )
        )

    return PlaylistSnapshot(
        playlist_id=payload.get("id"),
        title=payload.get("title") or "Untitled playlist",
        entries=entries,
    )


def download_video(
    url: str,
    output_template: str,
    cookies_browser: str | None = None,
    resolution_limit: int | None = None,
) -> DownloadResult:
    cookies_browser = normalize_cookies_browser(cookies_browser)
    base_cmd = [
        "yt-dlp",
        "--no-progress",
        "--print",
        "after_move:filepath",
        "-f",
        _build_format_selector(resolution_limit),
        "-o",
        output_template,
        url,
    ]
    if cookies_browser:
        try:
            return _run_yt_dlp_command(
                ["yt-dlp", "--no-progress", "--print", "after_move:filepath", "--cookies-from-browser", cookies_browser]
                + ["-f", _build_format_selector(resolution_limit), "-o", output_template, url]
            )
        except YtDlpError as exc:
            try:
                return _run_yt_dlp_command(base_cmd)
            except YtDlpError:
                raise YtDlpError(
                    f"{exc} | retry without cookies also failed"
                ) from exc

    return _run_yt_dlp_command(base_cmd)
