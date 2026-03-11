from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_playlists() -> dict[str, list[dict[str, str]]]:
    # Placeholder response until database-backed CRUD is implemented.
    return {"items": []}
