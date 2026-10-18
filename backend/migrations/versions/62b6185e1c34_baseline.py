"""Baseline: consents, uploads and events as backend/db.py defines them.

Revision ID: 62b6185e1c34
Revises:
Create Date: 2026-10-18 13:06:20.515148

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "62b6185e1c34"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "consents",
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("notice_version", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("token"),
    )
    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("model_version", sa.String(), nullable=True),
        sa.Column("backend", sa.String(), nullable=True),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column("load_ms", sa.Double(), nullable=True),
        sa.Column("inference_ms", sa.Double(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "uploads",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=False),
        sa.Column("image", sa.LargeBinary(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_uploads_token", "uploads", ["token"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_uploads_token", table_name="uploads")
    op.drop_table("uploads")
    op.drop_table("events")
    op.drop_table("consents")
