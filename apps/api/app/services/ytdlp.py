import json
import platform
import re
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable


PROGRESS_LINE_RE = re.compile(r"^\[download\]\s+(?P<progress>.+)$")
SUPPORTED_MACOS_BROWSER_APPS: dict[str, tuple[str, ...]] = {
    "brave": ("Brave Browser.app",),
    "chrome": ("Google Chrome.app", "Chrome.app"),
    "chromium": ("Chromium.app",),
    "edge": ("Microsoft Edge.app",),
    "firefox": ("Firefox.app",),
    "opera": ("Opera.app",),
    "safari": ("Safari.app",),
    "vivaldi": ("Vivaldi.app",),
    "whale": ("Whale.app",),
}
UNSUPPORTED_MACOS_BROWSER_APPS: dict[str, tuple[str, ...]] = {
    "Atlas": ("ChatGPT Atlas.app", "Atlas.app"),
    "Comet": ("Comet.app",),
}


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
    upload_date: datetime | None


def normalize_cookies_browser(browser: str | None) -> str | None:
    if not browser:
        return None

    normalized = browser.strip().lower()
    aliases = {
        "atlas": "chrome",
        "comet": "chrome",
    }
    return aliases.get(normalized, normalized)


@dataclass(frozen=True)
class BrowserOption:
    value: str
    label: str


@dataclass(frozen=True)
class BrowserAvailability:
    options: list[BrowserOption]
    unsupported_installed: list[str]


def _build_format_selector(resolution_limit: int | None) -> str:
    if resolution_limit:
        return (
            f"bestvideo*[ext=mp4][height<={resolution_limit}]+bestaudio[ext=m4a]"
            f"/bestvideo*[height<={resolution_limit}]+bestaudio"
            f"/best[ext=mp4][height<={resolution_limit}]"
            f"/best[height<={resolution_limit}]"
        )

    return "bestvideo*[ext=mp4]+bestaudio[ext=m4a]/bestvideo*+bestaudio/best[ext=mp4]/best"


def _supported_browser_labels() -> dict[str, str]:
    return {
        "brave": "Brave",
        "chrome": "Chrome",
        "chromium": "Chromium",
        "edge": "Microsoft Edge",
        "firefox": "Firefox",
        "opera": "Opera",
        "safari": "Safari",
        "vivaldi": "Vivaldi",
        "whale": "Whale",
    }


def list_available_cookie_browsers() -> BrowserAvailability:
    labels = _supported_browser_labels()
    options = [
        BrowserOption(value=value, label=label) for value, label in labels.items()
    ]
    unsupported_installed: list[str] = []

    if platform.system() == "Darwin":
        app_roots = [Path("/Applications"), Path.home() / "Applications"]
        for label, app_names in UNSUPPORTED_MACOS_BROWSER_APPS.items():
            if any(
                (root / app_name).exists()
                for root in app_roots
                for app_name in app_names
            ):
                unsupported_installed.append(label)

    options.sort(key=lambda option: option.label.lower())
    return BrowserAvailability(
        options=options,
        unsupported_installed=sorted(unsupported_installed),
    )


def _run_yt_dlp_command(
    cmd: list[str],
    progress_callback: Callable[[str], None] | None = None,
) -> DownloadResult:
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    stdout_lines: list[str] = []
    stderr_lines: list[str] = []

    if process.stderr is not None:
        for raw_line in process.stderr:
            line = raw_line.strip()
            if not line:
                continue
            stderr_lines.append(line)
            match = PROGRESS_LINE_RE.match(line)
            if match and progress_callback is not None:
                progress_callback(match.group("progress"))

    if process.stdout is not None:
        stdout_lines = [line.strip() for line in process.stdout if line.strip()]

    return_code = process.wait()
    if return_code != 0:
        raise YtDlpError(
            "\n".join(stderr_lines).strip() or "yt-dlp failed to download video"
        )

    local_path = ""
    upload_date: datetime | None = None
    for line in stdout_lines:
        if line.startswith("YT_DOWN_UPLOAD_DATE:"):
            upload_date = _parse_upload_date(
                line.removeprefix("YT_DOWN_UPLOAD_DATE:").strip() or None
            )
        elif line.startswith("YT_DOWN_FILEPATH:"):
            local_path = line.removeprefix("YT_DOWN_FILEPATH:").strip()

    if not local_path:
        raise YtDlpError("yt-dlp did not report a downloaded file path")

    return DownloadResult(local_path=str(Path(local_path)), upload_date=upload_date)


def _parse_upload_date(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        parsed = datetime.strptime(value, "%Y%m%d")
    except ValueError:
        return None

    return parsed.replace(tzinfo=UTC)


def _load_json_payload(
    result: subprocess.CompletedProcess[str], error_message: str
) -> dict | None:
    if result.returncode != 0 and not result.stdout.strip():
        raise YtDlpError(result.stderr.strip() or error_message)

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise YtDlpError(result.stderr.strip() or error_message) from exc

    if payload is None:
        return None
    if not isinstance(payload, dict):
        raise YtDlpError(result.stderr.strip() or error_message)
    return payload


def fetch_flat_playlist(url: str) -> PlaylistSnapshot:
    cmd = [
        "yt-dlp",
        "--flat-playlist",
        "--ignore-errors",
        "--no-abort-on-error",
        "--compat-options",
        "no-youtube-unavailable-videos",
        "--extractor-args",
        "youtube:lang=zh-CN",
        "-J",
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    payload = _load_json_payload(result, "yt-dlp failed to fetch playlist metadata")
    if payload is None:
        raise YtDlpError(
            result.stderr.strip() or "yt-dlp did not return playlist metadata"
        )

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
    progress_callback: Callable[[str], None] | None = None,
) -> DownloadResult:
    cookies_browser = normalize_cookies_browser(cookies_browser)
    base_cmd = [
        "yt-dlp",
        "--print",
        "before_dl:YT_DOWN_UPLOAD_DATE:%(upload_date)s",
        "--print",
        "after_move:YT_DOWN_FILEPATH:%(filepath)s",
        "--merge-output-format",
        "mp4",
        "-f",
        _build_format_selector(resolution_limit),
        "-o",
        output_template,
        url,
    ]
    if cookies_browser:
        try:
            return _run_yt_dlp_command(
                [
                    "yt-dlp",
                    "--print",
                    "before_dl:YT_DOWN_UPLOAD_DATE:%(upload_date)s",
                    "--print",
                    "after_move:YT_DOWN_FILEPATH:%(filepath)s",
                    "--cookies-from-browser",
                    cookies_browser,
                    "--merge-output-format",
                    "mp4",
                ]
                + [
                    "-f",
                    _build_format_selector(resolution_limit),
                    "-o",
                    output_template,
                    url,
                ],
                progress_callback=progress_callback,
            )
        except YtDlpError as exc:
            try:
                return _run_yt_dlp_command(
                    base_cmd, progress_callback=progress_callback
                )
            except YtDlpError:
                raise YtDlpError(f"{exc} | retry without cookies also failed") from exc

    return _run_yt_dlp_command(base_cmd, progress_callback=progress_callback)
