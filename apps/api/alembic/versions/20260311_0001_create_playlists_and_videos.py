"""create playlists and videos tables"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260311_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "playlists",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("playlist_id", sa.String(length=255), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("folder_name", sa.String(length=255), nullable=False),
        sa.Column("folder_path", sa.Text(), nullable=False),
        sa.Column("cookies_browser", sa.String(length=64), nullable=True),
        sa.Column("resolution_limit", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_downloaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_url"),
    )
    op.create_index(op.f("ix_playlists_active"), "playlists", ["active"], unique=False)

    op.create_table(
        "videos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("playlist_id", sa.Uuid(), nullable=False),
        sa.Column("video_id", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("upload_date", sa.Date(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("webpage_url", sa.Text(), nullable=False),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column("local_path", sa.Text(), nullable=True),
        sa.Column("downloaded", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("download_error", sa.Text(), nullable=True),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["playlist_id"], ["playlists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "playlist_id", "video_id", name="uq_videos_playlist_video_id"
        ),
    )
    op.create_index(
        op.f("ix_videos_downloaded"), "videos", ["downloaded"], unique=False
    )
    op.create_index(
        op.f("ix_videos_last_seen_at"), "videos", ["last_seen_at"], unique=False
    )
    op.create_index(
        op.f("ix_videos_upload_date"), "videos", ["upload_date"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_videos_upload_date"), table_name="videos")
    op.drop_index(op.f("ix_videos_last_seen_at"), table_name="videos")
    op.drop_index(op.f("ix_videos_downloaded"), table_name="videos")
    op.drop_table("videos")
    op.drop_index(op.f("ix_playlists_active"), table_name="playlists")
    op.drop_table("playlists")
