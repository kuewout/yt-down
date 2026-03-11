# yt-down App Plan

## Current Status

Last updated: 2026-03-11

### Completed

- Root repo scaffolding is in place for:
  - `apps/api`
  - `apps/web`
  - `packages/shared-types`
  - `infra`
- Root `.gitignore` exists and covers Python, Node, build, and local artifact output.
- FastAPI backend scaffold is implemented.
- PostgreSQL connection settings are wired.
- SQLAlchemy models for `playlists` and `videos` are implemented.
- Alembic configuration and the initial migration are implemented.
- Initial migration has been applied to the Postgres database.
- Playlist CRUD API is implemented:
  - `GET /api/playlists`
  - `POST /api/playlists`
  - `GET /api/playlists/{id}`
  - `PATCH /api/playlists/{id}`
  - `DELETE /api/playlists/{id}`
- Health endpoint is implemented:
  - `GET /api/health`
- Video listing endpoints are implemented:
  - `GET /api/videos`
  - `GET /api/playlists/{id}/videos`
- `yt-dlp` playlist sync is implemented with:
  - `POST /api/playlists/{id}/sync`
  - `yt-dlp --flat-playlist -J`
  - upsert of discovered videos into Postgres
- Sequential download of missing videos is implemented with:
  - `POST /api/playlists/{id}/download-new`
  - `yt-dlp` download execution
  - persisted `downloaded`, `downloaded_at`, `local_path`, `download_error`
- Frontend scaffold is implemented with React, TypeScript, Vite, and TanStack Query.
- Frontend can:
  - list playlists
  - create a playlist
  - automatically sync a newly created playlist
  - select a playlist and view discovered videos
  - trigger sync
  - trigger download of missing videos
  - edit playlist settings
  - remove a playlist from tracking
- Playlist creation is simplified:
  - URL-first flow
  - optional title/folder input
  - derived folder name and path defaults

### Implemented But Not Fully Verified End-to-End

- Browser-level verification of the frontend flows has not been completed in this doc cycle.
- Live end-to-end verification of:
  - create playlist
  - sync playlist
  - download new videos
  - playlist edit/remove
  still needs to be exercised in the running app.

### Not Started Yet

- Activity/status API and runtime progress reporting
- Dedicated library overview page
- Dedicated playlist detail route
- Settings page backed by real configuration APIs
- Thumbnail handling
- Search/filter/sort for videos
- Tests
- Packaging / deployment workflow

## Verification and Commit Policy

This repo should use small, periodic commits, but only after the relevant verification passes.

### Commit Rule

- Do not commit halfway through a broken slice.
- Commit after a coherent unit of work is done and the available verification for that unit passes.
- Prefer one commit for one meaningful milestone or sub-milestone.

### Minimum Verification Before Commit

Backend-only changes:

- Python modules compile successfully.
- If schema changes are involved, Alembic migration runs successfully.
- If API changes are involved, endpoints at least match the documented request/response shape.

Frontend-only changes:

- TypeScript/Vite build or local typecheck passes.
- UI uses only currently implemented backend endpoints.

Full-stack changes:

- backend verification passes
- frontend verification passes
- if feasible, one live happy-path flow is exercised

### Current Verification Reality

Passed so far:

- backend Python compile checks
- initial database migration execution
- frontend production build

Still needed:

- browser-level flow verification
- real playlist sync/download happy-path verification

### Planned Commit Checkpoints

1. Backend bootstrap and schema
   - verification: compile + migration
2. Playlist CRUD and sync
   - verification: compile + route shape sanity
3. Download-new flow
   - verification: compile + route shape sanity
4. Frontend playlist management
   - verification: frontend build/typecheck + manual browser pass
5. Rescan/reconciliation
   - verification: backend checks + manual reconciliation test

## Goals

Build a local web app that can:

- Show the downloaded video library.
- Track playlist subscriptions.
- Check playlists for newly available videos.
- Download new videos with `yt-dlp`.
- Add and remove tracked playlists.
- Rescan the local library when files are added, moved, or removed.

This plan assumes:

- A single repository for frontend and backend.
- PostgreSQL is the system of record for app metadata and configuration.
- `yt-dlp` remains the actual downloader.
- Runtime activity is kept in memory instead of a persistent `jobs` table.

## Recommended Repo Layout

```text
yt-down/
  apps/
    api/
    web/
  docs/
    implementation-plan.md
  infra/
  packages/
    shared-types/
  media/
  .gitignore
  download_playlist.sh
```

Notes:

- `apps/api` contains the FastAPI backend.
- `apps/web` contains the React frontend.
- `packages/shared-types` can hold shared API types if useful.
- `media/` is a suggested default library root, but the app should support a configurable `MEDIA_ROOT`.
- The current shell script should be treated as reference behavior, not the long-term core implementation.

## Tech Stack

### Backend

- Python 3.12
- FastAPI
- SQLAlchemy 2.x
- Alembic
- `psycopg`
- `yt-dlp` via `subprocess`

### Frontend

- React
- TypeScript
- Vite
- TanStack Query
- React Router

### Database

- PostgreSQL
- Connection URL:
  - `postgresql://postgres:postgres@localhost:5432/ytdown`

## Why a Single Repo

Use one repo rather than separate frontend and backend repos.

Reasons:

- The frontend and backend are one product with one local deployment flow.
- API and UI will evolve together.
- Shared types and endpoint changes are easier to manage.
- Local development is simpler.
- Release and setup documentation stay in one place.

Only split into two repos later if deployment, ownership, or release cadence diverges.

## System Design

### Source of Truth

- PostgreSQL is the source of truth for:
  - tracked playlists
  - discovered videos
  - local file associations
  - app configuration metadata
- The filesystem is the source of truth for whether a file physically exists.

### High-Level Flow

1. User adds a playlist URL.
2. Backend validates and normalizes the URL.
3. Backend syncs the playlist with `yt-dlp --flat-playlist -J`.
4. New video entries are upserted into Postgres.
5. User downloads missing videos.
6. Backend runs `yt-dlp` for missing items and updates video rows.
7. Frontend reads playlist and video state from the API.
8. Manual rescan can reconcile DB state against the filesystem.

## Data Model

### `playlists`

- `id` UUID primary key
- `source_url` text unique not null
- `playlist_id` text nullable
- `title` text not null
- `folder_name` text not null
- `folder_path` text not null
- `cookies_browser` text nullable
- `resolution_limit` integer nullable
- `active` boolean not null default `true`
- `last_checked_at` timestamptz nullable
- `last_downloaded_at` timestamptz nullable
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Indexes and constraints:

- unique on `source_url`
- index on `active`

### `videos`

- `id` UUID primary key
- `playlist_id` UUID not null references `playlists(id)`
- `video_id` text not null
- `title` text not null
- `upload_date` date nullable
- `duration_seconds` integer nullable
- `webpage_url` text not null
- `thumbnail_url` text nullable
- `local_path` text nullable
- `downloaded` boolean not null default `false`
- `download_error` text nullable
- `downloaded_at` timestamptz nullable
- `last_seen_at` timestamptz not null
- `metadata_json` jsonb not null default `'{}'::jsonb`
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Indexes and constraints:

- unique on `(playlist_id, video_id)`
- index on `downloaded`
- index on `upload_date`
- index on `last_seen_at`

## Configuration

Backend environment variables:

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ytdown`
- `MEDIA_ROOT=/absolute/path/to/library/root`
- `APP_ENV=development`
- `LOG_LEVEL=INFO`

Optional:

- `DEFAULT_COOKIES_BROWSER=chrome`

Important:

- Do not hardcode the current folder layout.
- Make the media root configurable so the app can point at either `media/` or an existing directory tree.

## Backend Architecture

Suggested package structure:

```text
apps/api/
  app/
    api/
    core/
    db/
    models/
    schemas/
    services/
    main.py
  alembic/
  pyproject.toml
```

### Core Modules

- `core/config.py`
  - app settings
- `db/session.py`
  - engine and session factory
- `models/playlist.py`
  - ORM model
- `models/video.py`
  - ORM model
- `schemas/`
  - request and response models
- `services/ytdlp.py`
  - subprocess wrappers
- `services/playlists.py`
  - sync and CRUD orchestration
- `services/library.py`
  - filesystem scanning and reconciliation
- `services/activity.py`
  - in-memory runtime activity tracking

## Frontend Architecture

Suggested package structure:

```text
apps/web/
  src/
    api/
    components/
    features/
    routes/
    main.tsx
```

### Main Screens

- Library
- Playlist detail
- Add playlist
- Edit playlist
- Settings

### State Handling

- Use TanStack Query for server state.
- Avoid duplicating backend truth in frontend local state.
- Poll lightweight activity state periodically instead of building persistent job history.

## API Design

### Health

- `GET /api/health`

Returns service and database health.

### Playlists

- `GET /api/playlists`
- `POST /api/playlists`
- `GET /api/playlists/{id}`
- `PATCH /api/playlists/{id}`
- `DELETE /api/playlists/{id}`

`POST /api/playlists` request:

```json
{
  "source_url": "https://www.youtube.com/playlist?list=...",
  "folder_name": "wangzhian1",
  "cookies_browser": "chrome",
  "resolution_limit": 1440
}
```

Current implementation note:

- `title`, `folder_name`, and `folder_path` may be omitted or left empty.
- The backend will derive defaults from the playlist URL and `MEDIA_ROOT`.

### Sync and Download

- `POST /api/playlists/{id}/sync`
- `POST /api/playlists/{id}/download-new`
- `POST /api/library/rescan`

Current implementation note:

- `sync` is implemented.
- `download-new` is implemented.
- `library/rescan` is implemented on the backend as `POST /api/library/rescan`.
- The current rescan behavior is conservative:
  - keep an existing `local_path` if the file still exists
  - clear stale paths when files are gone
  - relink only when a video maps to exactly one filename match from the expected `upload_date + title` stem
- A frontend rescan trigger and summary display are implemented on the playlists page.

### Videos

- `GET /api/videos`
- `GET /api/videos/{id}`

Suggested filters:

- `playlist_id`
- `downloaded`
- `search`
- `limit`
- `offset`

Current implementation note:

- `GET /api/videos` is implemented.
- `GET /api/playlists/{id}/videos` is implemented.
- `GET /api/videos/{id}` is not implemented yet.
- query filters are not implemented yet.

### Activity

- `GET /api/activity`

This endpoint returns transient in-memory runtime state, for example:

```json
{
  "status": "downloading",
  "playlist_id": "uuid",
  "video_id": "uuid",
  "message": "Downloading current item",
  "progress_percent": 37.5,
  "started_at": "2026-03-11T10:15:00Z"
}
```

This is not persisted across restarts.

Current implementation note:

- This endpoint is not implemented yet.

## yt-dlp Integration Strategy

### General Rules

- Use `subprocess` argument arrays, not shell strings.
- Parse machine-readable output from `yt-dlp`.
- Keep one wrapper module responsible for constructing commands.
- Store useful metadata from `yt-dlp` in `metadata_json`.

### Playlist Discovery

Use:

```bash
yt-dlp --flat-playlist -J <playlist-url>
```

Purpose:

- quickly fetch playlist entries
- get stable video IDs
- avoid downloading media during discovery

### Video Download

For each missing video:

- build a normalized YouTube video URL
- pass cookies when configured
- pass output template based on playlist folder
- apply resolution rules
- update DB on success or failure

Use a per-playlist archive file to prevent redownloads if helpful.

### Output Template

Suggested template:

```text
%(upload_date)s %(title)s.%(ext)s
```

Stored under the playlist folder path.

## Runtime Activity Without a `jobs` Table

It is reasonable to avoid a persistent `jobs` table for this app.

Use a simple in-memory activity registry:

- one global active operation at first
- operation type: `sync`, `download`, `rescan`
- associated playlist ID
- associated video ID if applicable
- status message
- progress if known
- start time

Tradeoffs:

- simpler implementation
- no job history
- no persisted retry state
- activity is lost on server restart

For a local single-user app, this is acceptable.

## Playlist Sync Logic

Algorithm:

1. Load playlist record.
2. Mark in-memory activity as `sync`.
3. Run `yt-dlp --flat-playlist -J`.
4. Extract playlist metadata and entries.
5. Update playlist title and playlist ID if available.
6. Upsert videos by `(playlist_id, video_id)`.
7. Set `last_seen_at` for encountered entries.
8. Set `last_checked_at`.
9. Clear in-memory activity.

Behavior decisions:

- Do not delete video rows simply because they disappear from a playlist response.
- Leave stale cleanup as a later feature.

## Download Logic

Algorithm:

1. Load missing videos for a playlist where `downloaded = false`.
2. Mark in-memory activity as `download`.
3. Download sequentially.
4. On success:
   - set `downloaded = true`
   - set `downloaded_at`
   - set `local_path`
   - clear `download_error`
5. On failure:
   - store `download_error`
   - keep `downloaded = false`
6. Update `last_downloaded_at` on playlist when done.
7. Clear in-memory activity.

Initial concurrency rule:

- Only one active download flow globally.

That keeps state management simple and avoids overlapping `yt-dlp` processes.

## Filesystem Rescan Logic

Algorithm:

1. Enumerate files under `MEDIA_ROOT`.
2. Match files against known playlist folders.
3. Reconcile known `local_path` values.
4. If a previously downloaded file is missing, mark it accordingly.
5. If a known file path changed and can be identified confidently, update `local_path`.

Important:

- Prefer exact path matches.
- Avoid aggressive fuzzy matching early; it will create bad associations.

## Frontend Pages

### Library Page

Show:

- tracked playlists
- total downloaded count
- missing count
- failed count
- recent videos

Actions:

- add playlist
- rescan library
- open playlist detail

### Playlist Detail Page

Show:

- playlist title
- source URL
- folder path
- current settings
- video list
- download statuses

Actions:

- sync playlist
- download new videos
- edit settings
- remove playlist

### Add Playlist Page

Inputs:

- playlist URL
- folder name
- cookies browser
- resolution cap

Behavior:

- create playlist
- optionally trigger initial sync immediately

## Progress by Milestone

### Milestone 1: Backend Bootstrap

Status: completed

Done:

- FastAPI app scaffolded
- Postgres settings wired
- SQLAlchemy models added
- Alembic added
- Initial migration created and applied
- health endpoint added

### Milestone 2: Playlist CRUD and Sync

Status: completed

Done:

- playlist create/list/update/delete implemented
- URL-derived defaults implemented
- sync endpoint implemented
- playlist and video metadata persisted

### Milestone 3: Frontend Read Path

Status: mostly completed

Done:

- Vite React app scaffolded
- playlists screen implemented
- synced video list can be viewed for selected playlist
- playlist page responsive layout improved for tablet and mobile widths

Remaining:

- separate playlist detail route
- richer library overview page
- browser-level responsive verification documented in this plan cycle

### Milestone 4: Download Path

Status: partially completed

Done:

- `download-new` backend endpoint implemented
- video status persistence implemented
- frontend download trigger implemented

Remaining:

- live progress reporting
- runtime activity status API
- better download error surfacing in UI
- real end-to-end download verification in browser

### Milestone 5: Rescan and Reconciliation

Status: partially completed

Done:

- backend `POST /api/library/rescan` endpoint implemented
- filesystem scan implemented per tracked playlist folder
- stale `local_path` values cleared when files are missing
- conservative file relinking implemented for unambiguous matches
- frontend rescan action and summary display implemented on the playlists page

Remaining:

- live rescan verification against real files
- richer moved-file detection beyond conservative stem matching

## Verification Matrix

### Verified

- backend module import/compile sanity
- Alembic migration to Postgres
- route inventory and doc alignment for implemented playlist/video endpoints
- frontend build/typecheck via `pnpm build`

### Partially Verified

- playlist sync logic
  - code implemented
  - live happy-path still pending
- download-new logic
  - code implemented
  - live happy-path still pending
- library rescan logic
  - code implemented
  - backend compile sanity passed
  - live happy-path still pending
- frontend playlist management
  - code implemented
  - browser verification still pending

### Not Verified Yet

- create -> sync -> view videos flow in browser
- download-new flow in browser
- edit/remove playlist flow in browser
- responsive behavior in a live browser
- rescan behavior against real library files

## Milestones

### Milestone 1: Backend Bootstrap

- scaffold FastAPI app
- connect Postgres
- add SQLAlchemy models
- add Alembic migration
- add health endpoint

### Milestone 2: Playlist CRUD and Sync

- implement playlist create/list/update/delete
- implement URL normalization
- implement sync endpoint
- persist playlist and video metadata

### Milestone 3: Frontend Read Path

- scaffold Vite React app
- build playlist list page
- build playlist detail page
- show synced video data

### Milestone 4: Download Path

- implement `download-new`
- update video statuses
- surface activity in UI

### Milestone 5: Rescan and Reconciliation

- implement library rescan
- reconcile missing or moved files
- add settings and polish

## Task List

The list below is now split into completed work and explicit future TODO items.

### Completed Tasks

- create monorepo folder structure
- add backend scaffold
- add frontend scaffold
- add Postgres configuration
- add SQLAlchemy models for playlists and videos
- add Alembic configuration and initial migration
- apply the initial migration
- implement playlist CRUD API
- implement playlist sync with `yt-dlp --flat-playlist -J`
- implement video listing API
- implement download of missing videos
- implement backend library rescan API
- implement frontend playlist list/create flow
- implement frontend sync/download actions
- implement frontend playlist edit/remove actions

### Repository Setup

- create `apps/api`
- create `apps/web`
- create `packages/shared-types`
- create `infra`
- keep `docs/implementation-plan.md` updated as the design evolves

### Backend Tasks

Completed:

- initialize Python project
- add FastAPI, SQLAlchemy, Alembic, `psycopg`
- implement settings and config
- implement DB session management
- create playlist and video models
- create initial migration
- implement playlist CRUD endpoints
- implement yt-dlp wrapper service
- implement sync service
- implement download service
- add basic error handling and response models

TODO:

- implement in-memory activity registry
- add structured logging
- add `GET /api/videos/{id}`
- add `GET /api/activity`

### Frontend Tasks

Completed:

- initialize Vite React TypeScript app
- add router
- add TanStack Query
- create API client
- create layout and navigation
- build playlists list view
- build add playlist form
- build edit playlist form
- build selected playlist video list
- improve playlist page responsive layout
- add library rescan trigger and result display

TODO:

- build dedicated playlist detail view
- build library overview screen
- build videos table with filters
- build activity indicator
- improve mutation/loading UX
- add delete confirmation UX
- verify responsive behavior in a live browser

### Integration Tasks

Completed:

- verify backend Python modules compile successfully
- verify database migration runs successfully against Postgres

TODO:

- test add playlist flow in browser
- test sync flow against a real playlist
- test download-new flow against a real playlist
- test playlist edit flow in browser
- test playlist remove flow in browser
- test rescan flow against real media files
- verify duplicate videos are not reinserted
- verify downloaded videos are not redownloaded
- verify delete playlist does not remove files by default
- verify edited playlist settings affect future downloads

### Documentation Tasks

Completed:

- write initial implementation plan

TODO:

- write local development setup
- document required tools
- document Postgres setup
- document environment variables
- document media root expectations
- document current API endpoints

## Suggested First Vertical Slice

Build this first:

1. Create playlist from URL.
2. Sync playlist into Postgres.
3. Show discovered videos in the UI.
4. Download missing videos for one playlist.
5. Refresh statuses in the UI.

This gives a working end-to-end product quickly and validates the architecture before adding more edge-case logic.

Status:

- This slice is now substantially implemented.
- Remaining work is real-world verification in the running app.

## Open Decisions

These still need to be finalized before implementation:

- Which directory should be the default `MEDIA_ROOT` in this repo.
- Whether to keep the existing repo-root folders or move everything under `media/`.
- Whether progress updates should use polling first or WebSocket from day one.
- Whether to support individual video downloads from the UI in the first version.

Recommended defaults:

- configurable `MEDIA_ROOT`
- keep current folders in place for now
- polling first
- playlist-level `download-new` first, single-video download later

## Future TODO Summary

These are the clearest next tasks from here, in recommended order:

1. Add runtime activity/progress reporting for sync and download operations.
2. Build a dedicated playlist detail route instead of using the combined management panel.
3. Build a true library overview page with counts, recent videos, and filters.
4. Add browser-level end-to-end verification for create, sync, download, edit, delete, and rescan flows.
5. Add tests for backend services and API routes.
6. Add settings APIs and a real settings screen.
7. Improve download UX with clearer failure messages and progress feedback.
8. Improve moved-file detection beyond the current conservative filename-stem matching.

## Immediate Next TODO

If continuing from this document right now, the recommended next implementation item is:

1. lightweight activity reporting for sync and download
   - add an in-memory activity registry on the backend
   - expose it through `GET /api/activity`
   - surface it in the playlists UI first

After that:

2. verify the existing frontend flows in a browser
3. verify the rescan flow against real library files
