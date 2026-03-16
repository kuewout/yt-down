from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Condition
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
        self._condition = Condition()
        self._snapshot = ActivitySnapshot()
        self._version = 0
        self._history: deque[tuple[int, ActivitySnapshot]] = deque(maxlen=1000)

    def snapshot(self) -> ActivitySnapshot:
        with self._condition:
            return ActivitySnapshot(**self._snapshot.__dict__)

    def current_version(self) -> int:
        with self._condition:
            return self._version

    def wait_for_changes(
        self, version: int, timeout: float = 15.0
    ) -> tuple[int, list[ActivitySnapshot]]:
        with self._condition:
            self._condition.wait_for(lambda: self._version != version, timeout=timeout)
            if self._version == version:
                return version, []

            snapshots = [
                ActivitySnapshot(**snapshot.__dict__)
                for snapshot_version, snapshot in self._history
                if snapshot_version > version
            ]
            if not snapshots:
                snapshots = [ActivitySnapshot(**self._snapshot.__dict__)]
            return self._version, snapshots

    def _publish_locked(self) -> None:
        self._version += 1
        self._history.append((self._version, ActivitySnapshot(**self._snapshot.__dict__)))
        self._condition.notify_all()

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
        with self._condition:
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
            self._publish_locked()

    def update(
        self,
        *,
        operation: str | None = None,
        message: str | None = None,
        playlist_id: UUID | None = None,
        playlist_title: str | None = None,
        video_id: UUID | None = None,
        video_title: str | None = None,
        items_completed: int | None = None,
        items_total: int | None = None,
    ) -> None:
        now = datetime.now(UTC)
        with self._condition:
            if operation is not None:
                self._snapshot.operation = operation
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
            self._publish_locked()

    def complete(
        self,
        *,
        operation: str | None = None,
        message: str | None = None,
        items_completed: int | None = None,
    ) -> None:
        now = datetime.now(UTC)
        with self._condition:
            if operation is not None:
                self._snapshot.operation = operation
            self._snapshot.status = "succeeded"
            self._snapshot.is_active = False
            self._snapshot.message = message
            if items_completed is not None:
                self._snapshot.items_completed = items_completed
            self._snapshot.updated_at = now
            self._snapshot.finished_at = now
            self._snapshot.video_id = None
            self._snapshot.video_title = None
            self._publish_locked()

    def fail(self, message: str, *, operation: str | None = None) -> None:
        now = datetime.now(UTC)
        with self._condition:
            if operation is not None:
                self._snapshot.operation = operation
            self._snapshot.status = "failed"
            self._snapshot.is_active = False
            self._snapshot.message = message
            self._snapshot.updated_at = now
            self._snapshot.finished_at = now
            self._publish_locked()


activity_registry = ActivityRegistry()
