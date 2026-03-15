"""remove cookies_browser from playlists"""

from alembic import op
import sqlalchemy as sa


revision = "20260316_0004"
down_revision = "20260312_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("playlists", "cookies_browser")


def downgrade() -> None:
    op.add_column(
        "playlists",
        sa.Column("cookies_browser", sa.String(length=64), nullable=True),
    )
