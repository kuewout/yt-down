# API

Minimal FastAPI scaffold for the yt-down backend.

## Run

```bash
uv run uvicorn app.main:app --reload --app-dir apps/api --port 8001
```

Run this from the repository root.

## Migrations

```bash
cd apps/api
uv run alembic upgrade head
```

## Environment

Expected defaults live in `app/core/config.py`.
