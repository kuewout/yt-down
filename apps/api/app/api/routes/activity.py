from fastapi import APIRouter

from app.schemas import ActivityRead
from app.services.activity import activity_registry

router = APIRouter()


@router.get("", response_model=ActivityRead)
def get_activity() -> ActivityRead:
    return ActivityRead.model_validate(activity_registry.snapshot())
