"""add use_title_as_folder to playlists"""

from alembic import op
import sqlalchemy as sa


revision = "20260312_0002"
down_revision = "20260311_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "playlists",
        sa.Column("use_title_as_folder", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("playlists", "use_title_as_folder")
