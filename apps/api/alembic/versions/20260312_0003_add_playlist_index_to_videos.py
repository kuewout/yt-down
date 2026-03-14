"""add playlist_index to videos"""

from alembic import op
import sqlalchemy as sa


revision = "20260312_0003"
down_revision = "20260312_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column("playlist_index", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY playlist_id
                    ORDER BY upload_date DESC NULLS LAST, created_at ASC
                ) - 1 AS position
            FROM videos
        )
        UPDATE videos
        SET playlist_index = ranked.position
        FROM ranked
        WHERE videos.id = ranked.id
        """
    )
    op.create_index(
        op.f("ix_videos_playlist_id_playlist_index"),
        "videos",
        ["playlist_id", "playlist_index"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_videos_playlist_id_playlist_index"), table_name="videos")
    op.drop_column("videos", "playlist_index")
