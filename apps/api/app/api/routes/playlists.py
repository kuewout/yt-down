from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Playlist
from app.schemas import PlaylistCreate, PlaylistListResponse, PlaylistRead, PlaylistUpdate
from app.services.downloads import download_missing_videos
from app.services.playlists import YtDlpError, build_folder_path, list_playlist_videos, sync_playlist
from app.schemas.video import VideoListResponse, VideoRead

router = APIRouter()


@router.get("", response_model=PlaylistListResponse)
def list_playlists(db: Session = Depends(get_db)) -> PlaylistListResponse:
    playlists = db.scalars(select(Playlist).order_by(Playlist.created_at.desc())).all()
    return PlaylistListResponse(items=[PlaylistRead.model_validate(playlist) for playlist in playlists])


@router.post("", response_model=PlaylistRead, status_code=status.HTTP_201_CREATED)
def create_playlist(payload: PlaylistCreate, db: Session = Depends(get_db)) -> PlaylistRead:
    data = payload.model_dump()
    if not data["folder_path"]:
        data["folder_path"] = build_folder_path(data["folder_name"])

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

    for field, value in payload.model_dump(exclude_unset=True).items():
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
def download_new_videos_route(playlist_id: UUID, db: Session = Depends(get_db)) -> dict[str, str | int]:
    try:
        playlist, downloaded_count, failed_count = download_missing_videos(db, playlist_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except YtDlpError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return {
        "playlist_id": str(playlist.id),
        "title": playlist.title,
        "downloaded_videos": downloaded_count,
        "failed_videos": failed_count,
    }


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playlist(playlist_id: UUID, db: Session = Depends(get_db)) -> Response:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")

    db.delete(playlist)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
