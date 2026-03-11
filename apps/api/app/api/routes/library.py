from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.library import LibraryRescanResponse
from app.services.library import rescan_library

router = APIRouter()


@router.post("/rescan", response_model=LibraryRescanResponse)
def rescan_library_route(db: Session = Depends(get_db)) -> LibraryRescanResponse:
    result = rescan_library(db)
    return LibraryRescanResponse(
        playlists_scanned=result.playlists_scanned,
        files_scanned=result.files_scanned,
        relinked_videos=result.relinked_videos,
        missing_videos=result.missing_videos,
        unchanged_videos=result.unchanged_videos,
    )
