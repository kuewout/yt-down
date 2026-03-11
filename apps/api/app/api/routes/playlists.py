from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Playlist
from app.schemas import PlaylistCreate, PlaylistListResponse, PlaylistRead, PlaylistUpdate

router = APIRouter()


@router.get("", response_model=PlaylistListResponse)
def list_playlists(db: Session = Depends(get_db)) -> PlaylistListResponse:
    playlists = db.scalars(select(Playlist).order_by(Playlist.created_at.desc())).all()
    return PlaylistListResponse(items=[PlaylistRead.model_validate(playlist) for playlist in playlists])


@router.post("", response_model=PlaylistRead, status_code=status.HTTP_201_CREATED)
def create_playlist(payload: PlaylistCreate, db: Session = Depends(get_db)) -> PlaylistRead:
    playlist = Playlist(**payload.model_dump())
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


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playlist(playlist_id: UUID, db: Session = Depends(get_db)) -> Response:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")

    db.delete(playlist)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
