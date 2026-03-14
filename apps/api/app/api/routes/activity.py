import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.schemas import ActivityRead
from app.services.activity import activity_registry

router = APIRouter()


@router.get("", response_model=ActivityRead)
def get_activity() -> ActivityRead:
    return ActivityRead.model_validate(activity_registry.snapshot())


@router.get("/stream")
async def stream_activity(request: Request) -> StreamingResponse:
    async def event_stream():
        version = activity_registry.current_version()
        snapshot = ActivityRead.model_validate(activity_registry.snapshot())
        yield f"event: activity\ndata: {snapshot.model_dump_json()}\n\n"

        while True:
            if await request.is_disconnected():
                break

            next_version, next_snapshot = await asyncio.to_thread(
                activity_registry.wait_for_change, version, 15.0
            )
            if await request.is_disconnected():
                break

            if next_version == version:
                yield ": keep-alive\n\n"
                continue

            version = next_version
            payload = ActivityRead.model_validate(next_snapshot)
            yield f"event: activity\ndata: {payload.model_dump_json()}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
