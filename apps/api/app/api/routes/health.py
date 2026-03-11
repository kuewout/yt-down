from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db

router = APIRouter()


@router.get("/health")
def healthcheck(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("select 1"))
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.app_env,
    }
