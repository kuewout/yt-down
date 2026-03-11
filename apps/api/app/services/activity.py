from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock
from uuid import UUID


@dataclass
class ActivitySnapshot:
    status: str = "idle"
    operation: str | None = None
    is_active: bool = False
    playlist_id: UUID | None = None
    playlist_title: str | None = None
    video_id: UUID | None = None
    video_title: str | None = None
    message: str | None = None
    items_completed: int = 0
    items_total: int | None = None
    started_at: datetime | None = None
    updated_at: datetime | None = None
    finished_at: datetime | None = None


class ActivityRegistry:
    def __init__(self) -> None:
        self._lock = Lock()
        self._snapshot = ActivitySnapshot()

    def snapshot(self) -> ActivitySnapshot:
        with self._lock:
            return ActivitySnapshot(**self._snapshot.__dict__)

    def start(
        self,
        *,
        operation: str,
        playlist_id: UUID | None = None,
        playlist_title: str | None = None,
        message: str | None = None,
        items_total: int | None = None,
    ) -> None:
        now = datetime.now(UTC)
        with self._lock:
            self._snapshot = ActivitySnapshot(
                status="running",
                operation=operation,
                is_active=True,
                playlist_id=playlist_id,
                playlist_title=playlist_title,
                message=message,
                items_completed=0,
                items_total=items_total,
                started_at=now,
                updated_at=now,
                finished_at=None,
            )

    def update(
        self,
        *,
        message: str | None = None,
        playlist_id: UUID | None = None,
        playlist_title: str | None = None,
        video_id: UUID | None = None,
        video_title: str | None = None,
        items_completed: int | None = None,
        items_total: int | None = None,
    ) -> None:
        now = datetime.now(UTC)
        with self._lock:
            if playlist_id is not None:
                self._snapshot.playlist_id = playlist_id
            if playlist_title is not None:
                self._snapshot.playlist_title = playlist_title
            if video_id is not None or self._snapshot.video_id is not None:
                self._snapshot.video_id = video_id
            if video_title is not None or self._snapshot.video_title is not None:
                self._snapshot.video_title = video_title
            if message is not None:
                self._snapshot.message = message
            if items_completed is not None:
                self._snapshot.items_completed = items_completed
            if items_total is not None:
                self._snapshot.items_total = items_total
            self._snapshot.updated_at = now

    def complete(self, *, message: str | None = None, items_completed: int | None = None) -> None:
        now = datetime.now(UTC)
        with self._lock:
            self._snapshot.status = "succeeded"
            self._snapshot.is_active = False
            self._snapshot.message = message
            if items_completed is not None:
                self._snapshot.items_completed = items_completed
            self._snapshot.updated_at = now
            self._snapshot.finished_at = now
            self._snapshot.video_id = None
            self._snapshot.video_title = None

    def fail(self, message: str) -> None:
        now = datetime.now(UTC)
        with self._lock:
            self._snapshot.status = "failed"
            self._snapshot.is_active = False
            self._snapshot.message = message
            self._snapshot.updated_at = now
            self._snapshot.finished_at = now


activity_registry = ActivityRegistry()
