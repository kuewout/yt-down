import platform
import subprocess
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Playlist
from app.schemas import PlaylistCreate, PlaylistListResponse, PlaylistRead, PlaylistUpdate
from app.services.downloads import download_missing_videos
from app.services.playlists import (
    YtDlpError,
    build_folder_path,
    folder_assignment_conflicts,
    list_playlist_videos,
    prepare_new_playlist_folder,
    slugify_folder_name,
    sync_playlist,
)
from app.services.ytdlp import list_available_cookie_browsers
from app.schemas.video import VideoListResponse, VideoRead
from pydantic import BaseModel, Field

router = APIRouter()


class DownloadNewRequest(BaseModel):
    batch_size: int = Field(default=5, ge=1, le=100)
    cookies_browser: str | None = None


class BrowserOptionResponse(BaseModel):
    value: str
    label: str


class CookieBrowserAvailabilityResponse(BaseModel):
    options: list[BrowserOptionResponse]
    unsupported_installed: list[str]


@router.get("", response_model=PlaylistListResponse)
def list_playlists(db: Session = Depends(get_db)) -> PlaylistListResponse:
    playlists = db.scalars(select(Playlist).order_by(Playlist.created_at.desc())).all()
    return PlaylistListResponse(items=[PlaylistRead.model_validate(playlist) for playlist in playlists])


@router.get("/cookie-browsers", response_model=CookieBrowserAvailabilityResponse)
def get_cookie_browsers() -> CookieBrowserAvailabilityResponse:
    availability = list_available_cookie_browsers()
    return CookieBrowserAvailabilityResponse(
        options=[BrowserOptionResponse(value=option.value, label=option.label) for option in availability.options],
        unsupported_installed=availability.unsupported_installed,
    )


@router.post("", response_model=PlaylistRead, status_code=status.HTTP_201_CREATED)
def create_playlist(payload: PlaylistCreate, db: Session = Depends(get_db)) -> PlaylistRead:
    data = payload.model_dump()
    try:
        folder_name, folder_path, use_title_as_folder = prepare_new_playlist_folder(
            db,
            title=data["title"] or None,
            folder_name=data["folder_name"] or None,
            folder_path=data["folder_path"] or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    data["folder_name"] = folder_name
    data["folder_path"] = folder_path
    data["use_title_as_folder"] = use_title_as_folder
    if not data["title"]:
        data["title"] = "Pending sync"

    playlist = Playlist(**data)
    db.add(playlist)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Playlist already exists") from exc

    db.refresh(playlist)
    return PlaylistRead.model_validate(playlist)


@router.get("/{playlist_id}", response_model=PlaylistRead)
def get_playlist(playlist_id: UUID, db: Session = Depends(get_db)) -> PlaylistRead:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")

    return PlaylistRead.model_validate(playlist)


@router.patch("/{playlist_id}", response_model=PlaylistRead)
def update_playlist(
    playlist_id: UUID, payload: PlaylistUpdate, db: Session = Depends(get_db)
) -> PlaylistRead:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "folder_name" in update_data or "folder_path" in update_data:
        resolved_folder_name = slugify_folder_name(
            update_data.get("folder_name", playlist.folder_name) or playlist.folder_name
        )
        resolved_folder_path = update_data.get("folder_path") or build_folder_path(resolved_folder_name)
        if folder_assignment_conflicts(
            db,
            resolved_folder_name,
            resolved_folder_path,
            exclude_playlist_id=playlist.id,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Folder name or path is already in use by another playlist",
            )
        playlist.use_title_as_folder = False
        update_data["folder_name"] = resolved_folder_name
        update_data["folder_path"] = resolved_folder_path

    for field, value in update_data.items():
        setattr(playlist, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Playlist update conflicts") from exc

    db.refresh(playlist)
    return PlaylistRead.model_validate(playlist)


@router.get("/{playlist_id}/videos", response_model=VideoListResponse)
def get_playlist_videos(playlist_id: UUID, db: Session = Depends(get_db)) -> VideoListResponse:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")

    videos = list_playlist_videos(db, playlist_id)
    return VideoListResponse(items=[VideoRead.model_validate(video) for video in videos])


@router.post("/{playlist_id}/sync")
def sync_playlist_route(playlist_id: UUID, db: Session = Depends(get_db)) -> dict[str, str | int]:
    try:
        playlist, created_count = sync_playlist(db, playlist_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except YtDlpError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return {
        "playlist_id": str(playlist.id),
        "title": playlist.title,
        "new_videos": created_count,
        "total_videos": len(list_playlist_videos(db, playlist.id)),
    }


@router.post("/{playlist_id}/download-new")
def download_new_videos_route(
    playlist_id: UUID,
    payload: DownloadNewRequest,
    db: Session = Depends(get_db),
) -> dict[str, str | int]:
    try:
        playlist, downloaded_count, failed_count, attempted_count = download_missing_videos(
            db,
            playlist_id,
            batch_size=payload.batch_size,
            cookies_browser=payload.cookies_browser,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except YtDlpError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return {
        "playlist_id": str(playlist.id),
        "title": playlist.title,
        "attempted_videos": attempted_count,
        "downloaded_videos": downloaded_count,
        "failed_videos": failed_count,
    }


@router.post("/{playlist_id}/open-folder", status_code=status.HTTP_204_NO_CONTENT)
def open_playlist_folder(playlist_id: UUID, db: Session = Depends(get_db)) -> Response:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")

    folder_path = Path(playlist.folder_path).expanduser().resolve()
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist folder does not exist")

    system = platform.system()
    if system == "Darwin":
        command = ["open", str(folder_path)]
    elif system == "Windows":
        command = ["explorer", str(folder_path)]
    else:
        command = ["xdg-open", str(folder_path)]

    try:
        subprocess.run(command, check=True)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="System file explorer is unavailable") from exc
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to open playlist folder") from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playlist(playlist_id: UUID, db: Session = Depends(get_db)) -> Response:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")

    db.delete(playlist)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
